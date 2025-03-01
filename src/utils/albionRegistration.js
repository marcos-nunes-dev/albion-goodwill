const prisma = require('../config/prisma');
const axios = require('axios');
const EmbedBuilder = require('./embedBuilder');

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000; // 2 seconds

/**
 * Sleep utility function
 * @param {number} ms Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get the API endpoint based on region
 * @param {string} region - The region (america, europe, asia)
 * @returns {string|null} The API endpoint URL or null if invalid region
 */
const getApiEndpoint = (region) => {
    const endpoints = {
        'america': 'https://murderledger.albiononline2d.com',
        'europe': 'https://murderledger-europe.albiononline2d.com',
        'asia': 'https://murderledger-asia.albiononline2d.com'
    };
    return endpoints[region.toLowerCase()] || null;
};

/**
 * Find a player by nickname in the specified region
 * @param {string} nickname - The player nickname to search for
 * @param {string} apiEndpoint - The API endpoint URL
 * @returns {Promise<{playerName: string, found: boolean}>} The found player name and status
 */
const findPlayer = async (nickname, apiEndpoint) => {
    let playerName;
    let found = false;

    // First try: Search API
    try {
        const searchResponse = await axios.get(
            `${apiEndpoint}/api/player-search/${encodeURIComponent(nickname)}`
        );

        const { results } = searchResponse.data;

        if (results?.length > 0) {
            if (results.length > 1) {
                const exactMatch = results.find(name => name === nickname);
                if (exactMatch) {
                    playerName = exactMatch;
                    found = true;
                } else {
                    return {
                        playerName: null,
                        found: false,
                        multipleResults: results
                    };
                }
            } else {
                playerName = results[0];
                found = true;
            }
        }
    } catch (error) {
        console.error('Error in player search:', error);
    }

    // Second try: Direct ledger check
    if (!found) {
        try {
            const ledgerResponse = await axios.get(
                `${apiEndpoint}/api/players/${encodeURIComponent(nickname)}/events?skip=0`
            );
            
            const { events } = ledgerResponse.data;
            if (ledgerResponse.status === 200 && events.length > 0) {
                playerName = nickname;
                found = true;
            }
        } catch (error) {
            console.error('Error in ledger check:', error);
        }
    }

    return { playerName, found };
};

/**
 * Fetch weapon statistics for a player
 * @param {string} playerName - The player name
 * @returns {Promise<Array>} Array of weapon statistics
 */
const fetchWeaponStats = async (playerName) => {
    try {
        const statsResponse = await axios.get(
            `https://murderledger.albiononline2d.com/api/players/${encodeURIComponent(playerName)}/stats/weapons?lookback_days=9999`
        );
        
        if (statsResponse.data?.weapons) {
            return statsResponse.data.weapons
                .filter(stat => stat.weapon_name && stat.weapon_name.trim() !== '')
                .sort((a, b) => b.usages - a.usages)
                .slice(0, 4)
                .map(stat => ({
                    weapon_name: stat.weapon_name,
                    usages: stat.usages
                }));
        }
    } catch (error) {
        console.error('Error fetching weapon stats:', error);
    }
    return [];
};

/**
 * Check if a user is already registered in a guild
 * @param {string} userId - The Discord user ID
 * @param {string} guildId - The Discord guild ID
 * @returns {Promise<object|null>} The existing registration or null
 */
const checkExistingUserRegistration = async (userId, guildId) => {
    return prisma.playerRegistration.findFirst({
        where: { userId, guildId }
    });
};

/**
 * Check if a player name is already registered
 * @param {string} playerName - The Albion player name
 * @param {string} userId - The Discord user ID attempting to register
 * @returns {Promise<boolean>} Whether the name is available for this user
 */
const checkPlayerNameAvailability = async (playerName, userId) => {
    const existing = await prisma.playerRegistration.findFirst({
        where: { playerName }
    });
    return !existing || existing.userId === userId;
};

/**
 * Register or update a player registration
 * @param {object} data - Registration data
 * @returns {Promise<object>} The created/updated registration
 */
const registerPlayer = async ({ userId, guildId, region, playerName, albionGuildId }) => {
    return prisma.playerRegistration.upsert({
        where: { playerName },
        update: { region, guildId, albionGuildId },
        create: { userId, guildId, region, playerName, albionGuildId }
    });
};

/**
 * Handle role assignment and nickname sync
 * @param {object} params - Parameters for role and nickname handling
 * @returns {Promise<{success: boolean, status: string}>}
 */
const handleRolesAndNickname = async ({ member, guild, settings, playerName }) => {
    let status = [];
    let success = true;

    try {
        // Add verified role
        if (settings?.nicknameVerifiedId) {
            try {
                const verifiedRole = await guild.roles.fetch(settings.nicknameVerifiedId);
                if (verifiedRole) {
                    await member.roles.add(verifiedRole);
                    status.push('🎭 Verified role assigned');
                }
            } catch (error) {
                console.error('Error assigning role:', error);
                status.push('⚠️ Failed to assign verified role');
                success = false;
            }
        }

        // Sync nickname if enabled
        if (settings?.syncAlbionNickname) {
            try {
                // Check if bot has permission to manage nicknames
                const botMember = await guild.members.fetch(guild.client.user.id);
                const canManageNicknames = botMember.permissions.has('ManageNicknames');
                const hasHigherRole = botMember.roles.highest.position > member.roles.highest.position;

                if (!canManageNicknames) {
                    status.push('⚠️ Bot lacks permission to change nicknames');
                    success = false;
                } else if (!hasHigherRole) {
                    status.push('⚠️ Cannot change nickname of member with higher role');
                    success = false;
                } else {
                    await member.setNickname(playerName);
                    status.push('🔄 Nickname synchronized');
                }
            } catch (error) {
                console.error('Error setting nickname:', error);
                if (error.code === 50013) {
                    status.push('⚠️ Missing permissions to change nickname');
                } else {
                    status.push('⚠️ Failed to synchronize nickname');
                }
                success = false;
            }
        }
    } catch (error) {
        console.error('Error in role/nickname handling:', error);
        success = false;
        status = ['⚠️ Error in role/nickname assignment'];
    }

    return { 
        success, 
        status: status.join('\n') || '⚠️ No changes made'
    };
};

/**
 * Handle autocomplete for player name search
 * @param {object} interaction - The Discord interaction object
 * @returns {Promise<void>}
 */
const handleAutocomplete = async (interaction) => {
    try {
        const focusedValue = interaction.options.getFocused();
        const region = interaction.options.getString('region');

        if (!region || !focusedValue || focusedValue.length < 3) {
            await interaction.respond([]);
            return;
        }

        const apiEndpoint = getApiEndpoint(region);
        if (!apiEndpoint) {
            await interaction.respond([]);
            return;
        }

        const searchResponse = await axios.get(
            `${apiEndpoint}/api/player-search/${encodeURIComponent(focusedValue)}`
        );

        const { results } = searchResponse.data;

        if (!results || !results.length) {
            await interaction.respond([]);
            return;
        }

        await interaction.respond(
            results.slice(0, 25).map(name => ({
                name,
                value: name
            }))
        );
    } catch (error) {
        console.error('Error in player name autocomplete:', error);
        await interaction.respond([]);
    }
};

/**
 * Fetch player ID and basic info from Albion Online API with retry
 * @param {string} playerName - The player name to search
 * @returns {Promise<object|null>} Player data or null if not found
 */
const fetchPlayerInfo = async (playerName) => {
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        try {
            const response = await axios.get(
                `https://gameinfo.albiononline.com/api/gameinfo/search?q=${encodeURIComponent(playerName)}`
            );

            const player = response.data.players?.find(p => 
                p.Name.toLowerCase() === playerName.toLowerCase()
            );

            if (player) {
                return player;
            }

            return null;
        } catch (error) {
            console.error(`Error fetching player info (attempt ${attempt}/${RETRY_ATTEMPTS}):`, error);
            if (attempt < RETRY_ATTEMPTS) {
                await sleep(RETRY_DELAY);
            }
        }
    }
    return null;
};

/**
 * Fetch detailed player statistics from Albion Online API with retry
 * @param {string} playerId - The player ID
 * @returns {Promise<object|null>} Detailed player stats or null if not found
 */
const fetchPlayerDetails = async (playerId) => {
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        try {
            const response = await axios.get(
                `https://gameinfo.albiononline.com/api/gameinfo/players/${playerId}`
            );

            if (response.data) {
                return response.data;
            }

            return null;
        } catch (error) {
            console.error(`Error fetching player details (attempt ${attempt}/${RETRY_ATTEMPTS}):`, error);
            if (attempt < RETRY_ATTEMPTS) {
                await sleep(RETRY_DELAY);
            }
        }
    }
    return null;
};

/**
 * Format fame value to human readable string
 * @param {number} fame - Fame value
 * @returns {string} Formatted fame string
 */
const formatFame = (fame) => {
    if (fame >= 1000000000) {
        return `${(fame / 1000000000).toFixed(2)}B`;
    }
    if (fame >= 1000000) {
        return `${(fame / 1000000).toFixed(2)}M`;
    }
    if (fame >= 1000) {
        return `${(fame / 1000).toFixed(1)}K`;
    }
    return fame.toString();
};

module.exports = {
    getApiEndpoint,
    findPlayer,
    fetchWeaponStats,
    checkExistingUserRegistration,
    checkPlayerNameAvailability,
    registerPlayer,
    handleRolesAndNickname,
    handleAutocomplete,
    fetchPlayerInfo,
    fetchPlayerDetails,
    formatFame
}; 