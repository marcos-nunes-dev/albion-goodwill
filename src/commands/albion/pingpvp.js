const Command = require('../../structures/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const AlbionItems = require('../../services/AlbionItems');
const prisma = require('../../config/prisma');

// Constants
const LOOKBACK_DAYS = 30;
const MAX_COMPARE_PLAYERS = 5;
const THREAD_AUTO_ARCHIVE_DURATION = 1440; // 24 hours in minutes

// Store active compositions with their participants
const activeCompositions = new Map();

// Cache for weapon stats to avoid repeated API calls
const weaponStatsCache = new Map();

// Add rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;
const requestTimestamps = new Map();

// Add composition status tracking
const COMPOSITION_STATUS = {
    OPEN: 'open',
    CLOSED: 'closed',
    CANCELLED: 'cancelled'
};

/**
 * Checks if a request should be rate limited
 * @param {string} playerName - The player name making the request
 * @returns {boolean} True if request should be rate limited
 */
function isRateLimited(playerName) {
    const now = Date.now();
    const timestamps = requestTimestamps.get(playerName) || [];
    
    // Remove timestamps older than the window
    const recentTimestamps = timestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    
    if (recentTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
        return true;
    }
    
    recentTimestamps.push(now);
    requestTimestamps.set(playerName, recentTimestamps);
    return false;
}

/**
 * Gets the verified character name for a Discord user in a specific guild
 * @param {string} discordId - The Discord user ID
 * @param {string} guildId - The Discord guild ID
 * @returns {Promise<string|null>} The verified character name or null if not found
 */
async function getVerifiedCharacter(discordId, guildId) {
    try {
        console.log('Checking verification for Discord ID:', discordId, 'in Guild:', guildId);
        
        // Try to find a user with this discord_id in this guild
        const user = await prisma.playerRegistration.findFirst({
            where: {
                userId: discordId,
                guildId: guildId
            }
        });

        console.log('Found user:', user);
        
        if (user && user.playerName) {
            return user.playerName;
        }

        return null;
    } catch (error) {
        console.error('Error fetching verified character:', error);
        return null;
    }
}

/**
 * Fetches player's weapon stats from MurderLedger with caching
 * @param {string} playerName - The player's name
 * @param {number} lookbackDays - Number of days to look back for stats
 * @returns {Promise<Array>} Array of weapon stats
 */
async function fetchPlayerWeaponStats(playerName, lookbackDays = LOOKBACK_DAYS) {
    try {
        const cacheKey = `${playerName}-${lookbackDays}`;
        const cachedStats = weaponStatsCache.get(cacheKey);
        
        if (cachedStats) {
            return cachedStats;
        }

        if (isRateLimited(playerName)) {
            console.warn(`Rate limit hit for player: ${playerName}`);
            return [];
        }

        const response = await fetch(`https://murderledger.albiononline2d.com/api/players/${playerName}/stats/weapons${lookbackDays ? `?lookback_days=${lookbackDays}` : ''}`);
        if (!response.ok) {
            if (response.status === 429) {
                console.warn(`Rate limit hit from API for player: ${playerName}`);
                return [];
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const stats = data.weapons || [];
        
        // Cache the results for 5 minutes
        weaponStatsCache.set(cacheKey, stats);
        setTimeout(() => weaponStatsCache.delete(cacheKey), 5 * 60 * 1000);
        
        return stats;
    } catch (error) {
        console.error('Error fetching weapon stats:', error);
        return [];
    }
}

/**
 * Checks if a player has experience with a specific weapon
 * @param {string} playerName - The player's name
 * @param {string} weaponName - The weapon name to check
 * @returns {Promise<Object>} Object containing experience data
 */
async function checkWeaponExperience(playerName, weaponName) {
    try {
        // Fetch both recent (30 days) and all-time stats
        const [recentStats, allTimeStats] = await Promise.all([
            fetchPlayerWeaponStats(playerName, 30),
            fetchPlayerWeaponStats(playerName, 9999)
        ]);

        // Clean up weapon name for comparison (remove "Elder's" prefix)
        const cleanWeaponName = weaponName.replace("Elder's ", "");

        // Function to find weapon in stats
        const findWeapon = (stats, name) => {
            return stats.find(w => 
                w.weapon_name.toLowerCase() === name.toLowerCase() ||
                w.weapon.toLowerCase() === name.toLowerCase() ||
                w.weapon_name.toLowerCase().includes(name.toLowerCase())
            );
        };

        const recentWeapon = findWeapon(recentStats, cleanWeaponName);
        const allTimeWeapon = findWeapon(allTimeStats, cleanWeaponName);

        // Sort weapons by usage and filter out empty stats
        const sortedRecentWeapons = recentStats
            .filter(w => w.usages > 0)
            .sort((a, b) => b.usages - a.usages)
            .slice(0, 5);

        const sortedAllTimeWeapons = allTimeStats
            .filter(w => w.usages > 0)
            .sort((a, b) => b.usages - a.usages)
            .slice(0, 5);

        return {
            hasExperience: !!(recentWeapon && recentWeapon.usages > 0),
            recentStats: recentWeapon,
            allTimeStats: allTimeWeapon,
            topRecentWeapons: sortedRecentWeapons,
            topAllTimeWeapons: sortedAllTimeWeapons
        };
    } catch (error) {
        console.error('Error checking weapon experience:', error);
        return { 
            hasExperience: true,
            topRecentWeapons: [],
            topAllTimeWeapons: []
        };
    }
}

/**
 * Checks if a weapon is full with only regular players
 * @param {Object} weapon - The weapon object to check
 * @returns {boolean} True if weapon is full with regular players
 */
function isWeaponFullWithRegulars(weapon) {
    return weapon.participants.size >= weapon.required && 
           Array.from(weapon.participants).every(id => !weapon.fillPlayers?.has(id));
}

/**
 * Gets the count of fill players for a weapon
 * @param {Object} weapon - The weapon object to check
 * @returns {number} Number of fill players
 */
function getFillPlayersCount(weapon) {
    return Array.from(weapon.participants).filter(id => weapon.fillPlayers?.has(id)).length;
}

/**
 * Updates an embed with fill queue information
 * @param {EmbedBuilder} embed - The embed to update
 * @param {Object} compositionState - The current composition state
 * @returns {EmbedBuilder} The updated embed
 */
function updateEmbedWithFillQueue(embed, compositionState) {
    // Find the last field index
    let lastFieldIndex = embed.data.fields.length - 1;
    
    // Remove existing fill queue if it exists
    if (embed.data.fields[lastFieldIndex].name === '👥 FILL QUEUE') {
        embed.spliceFields(lastFieldIndex, 1);
    }

    // Collect all fill players
    const fillQueue = new Map(); // Map of userId -> {weapon, character}
    
    for (const [name, w] of compositionState.weapons.entries()) {
        if (w.fillPlayers) {
            for (const userId of w.fillPlayers) {
                fillQueue.set(userId, {
                    weapon: w.name,
                    character: w.fillCharacters?.get(userId)
                });
            }
        }
    }

    // Add fill queue field if there are fill players
    if (fillQueue.size > 0) {
        let fillQueueText = '';
        for (const [userId, data] of fillQueue.entries()) {
            fillQueueText += `• <@${userId}> (${data.weapon})${data.character ? ` - ${data.character}` : ''}\n`;
        }
        embed.addFields({
            name: '👥 FILL QUEUE',
            value: fillQueueText,
            inline: false
        });
    }

    return embed;
}

/**
 * Handles errors consistently across the command
 * @param {Error} error - The error object
 * @param {Interaction} interaction - The Discord interaction
 * @param {Message} [message] - Optional message object
 */
async function handleError(error, interaction, message = null) {
    console.error('Error in pingpvp command:', error);
    const errorMessage = error.response?.data?.message || error.message || 'There was an error executing this command!';
    
    if (interaction.deferred) {
        await interaction.editReply({ 
            content: `Error: ${errorMessage}`, 
            ephemeral: true 
        });
    } else if (message) {
        await message.reply({
            content: `Error: ${errorMessage}`,
            ephemeral: true
        });
    } else {
        await interaction.reply({ 
            content: `Error: ${errorMessage}`, 
            ephemeral: true 
        });
    }
}

// Add composition validation function
/**
 * Validates the composition JSON structure
 * @param {Object} composition - The composition object to validate
 * @returns {Object} Validation result with isValid and error message
 */
function validateComposition(composition) {
    if (!composition.title || typeof composition.title !== 'string') {
        return { isValid: false, error: 'Composition must have a title' };
    }

    if (!composition.parties || !Array.isArray(composition.parties)) {
        return { isValid: false, error: 'Composition must have a parties array' };
    }

    if (composition.parties.length === 0) {
        return { isValid: false, error: 'Composition must have at least one party' };
    }

    for (const party of composition.parties) {
        if (!party.name || typeof party.name !== 'string') {
            return { isValid: false, error: 'Each party must have a name' };
        }

        if (!party.weapons || !Array.isArray(party.weapons)) {
            return { isValid: false, error: `Party "${party.name}" must have a weapons array` };
        }

        if (party.weapons.length === 0) {
            return { isValid: false, error: `Party "${party.name}" must have at least one weapon` };
        }

        for (const weapon of party.weapons) {
            if (!weapon.type || typeof weapon.type !== 'string') {
                return { isValid: false, error: `Weapon in party "${party.name}" must have a type` };
            }

            if (typeof weapon.players_required !== 'number' || weapon.players_required < 1) {
                return { isValid: false, error: `Weapon "${weapon.type}" in party "${party.name}" must have a valid players_required number` };
            }
        }
    }

    return { isValid: true };
}

// Add thread cleanup function
/**
 * Cleans up a composition's resources
 * @param {string} threadId - The thread ID to clean up
 */
function cleanupComposition(threadId) {
    activeCompositions.delete(threadId);
}

// Add status update function
/**
 * Updates the composition status and embed
 * @param {Object} compositionState - The current composition state
 * @param {string} newStatus - The new status to set
 * @param {string} reason - Optional reason for the status change
 */
async function updateCompositionStatus(compositionState, newStatus, reason = '') {
    compositionState.status = newStatus;
    const statusEmoji = {
        [COMPOSITION_STATUS.OPEN]: '🟢',
        [COMPOSITION_STATUS.CLOSED]: '🔴',
        [COMPOSITION_STATUS.CANCELLED]: '⚫'
    }[newStatus];

    const statusText = {
        [COMPOSITION_STATUS.OPEN]: 'OPEN',
        [COMPOSITION_STATUS.CLOSED]: 'CLOSED',
        [COMPOSITION_STATUS.CANCELLED]: 'CANCELLED'
    }[newStatus];

    // Update embed title
    const embed = compositionState.embed;
    const title = embed.data.title;
    if (!title.includes(statusEmoji)) {
        embed.setTitle(`${statusEmoji} ${title}`);
    }

    // Add status field if it doesn't exist
    const statusField = embed.data.fields.find(f => f.name === '📊 STATUS');
    if (!statusField) {
        embed.addFields({
            name: '📊 STATUS',
            value: `${statusEmoji} ${statusText}${reason ? `\n${reason}` : ''}`,
            inline: false
        });
    } else {
        embed.spliceFields(
            embed.data.fields.findIndex(f => f.name === '📊 STATUS'),
            1,
            {
                name: '📊 STATUS',
                value: `${statusEmoji} ${statusText}${reason ? `\n${reason}` : ''}`,
                inline: false
            }
        );
    }

    await compositionState.originalMessage.edit({ embeds: [embed] });
}

module.exports = new Command({
    name: 'pingpvp',
    description: 'Pings a role with a PVP event message using a composition template',
    category: 'albion',
    usage: '<role> <template>',
    cooldown: 10,
    permissions: [PermissionFlagsBits.MentionEveryone],
    async execute(interaction, args, handler) {
        try {
            // Initialize items service if not already done
            if (!AlbionItems.isInitialized) {
                await interaction.deferReply();
                await AlbionItems.init();
            }

            // Get the role from the interaction
            const role = interaction.options.getRole('role');
            const template = interaction.options.getAttachment('template');
            const jsonInput = interaction.options.getString('json');

            // Validate required inputs
            if (!role) {
                return interaction.reply({ 
                    content: 'Please provide a valid role to ping!', 
                    ephemeral: true 
                });
            }

            if (!template && !jsonInput) {
                return interaction.reply({
                    content: 'Please provide either a text file or JSON input!',
                    ephemeral: true
                });
            }

            // Validate template file if provided
            if (template && !template.contentType?.includes('text')) {
                return interaction.reply({
                    content: 'Please provide a valid text file for the template!',
                    ephemeral: true
                });
            }

            // If not already deferred (from items init)
            if (!interaction.deferred) {
                await interaction.deferReply();
            }

            try {
                let textContent;
                
                if (template && template.url) {
                    // Fetch the text content from file
                    const fileResponse = await fetch(template.url);
                    if (!fileResponse.ok) {
                        throw new Error(`Failed to fetch template file: ${fileResponse.statusText}`);
                    }
                    textContent = await fileResponse.text();
                } else {
                    // Use the direct JSON input
                    textContent = jsonInput;
                }

                // Clean up the text content
                textContent = textContent.trim();
                
                // Try to parse the text content as JSON
                let composition;
                try {
                    composition = JSON.parse(textContent);
                } catch (parseError) {
                    console.error('JSON Parse Error:', parseError.message);
                    console.error('Text content causing error:', textContent);
                    return interaction.editReply({
                        content: `Error parsing JSON: ${parseError.message}\nMake sure your JSON is properly formatted with double quotes around property names and no trailing commas.`,
                        ephemeral: true
                    });
                }

                // Validate the composition structure
                const validation = validateComposition(composition);
                if (!validation.isValid) {
                    return interaction.editReply({
                        content: `Invalid composition format: ${validation.error}`,
                        ephemeral: true
                    });
                }

                // Validate weapon names
                for (const party of composition.parties) {
                    if (!party.weapons || !Array.isArray(party.weapons)) {
                        return interaction.editReply({
                            content: `Invalid party format in "${party.name}": missing weapons array.`,
                            ephemeral: true
                        });
                    }

                    for (const weapon of party.weapons) {
                        if (!AlbionItems.validateWeaponName(weapon.type)) {
                            return interaction.editReply({
                                content: `Invalid weapon name in party "${party.name}": "${weapon.type}" is not a valid Albion Online weapon.`,
                                ephemeral: true
                            });
                        }
                    }
                }

                // Create an embed for the event
                const embed = new EmbedBuilder()
                    .setTitle(`${composition.title.toUpperCase()}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                if (composition.description) {
                    embed.setDescription(`**Event Description:**\n${composition.description}`);
                }

                // Calculate total players needed
                let totalPlayersNeeded = 0;
                composition.parties.forEach(party => {
                    party.weapons.forEach(weapon => {
                        totalPlayersNeeded += weapon.players_required;
                    });
                });

                // Initialize composition state
                const compositionState = {
                    weapons: new Map(),
                    totalRequired: totalPlayersNeeded,
                    remainingTotal: totalPlayersNeeded,
                    embed: embed,
                    originalMessage: null,
                    status: COMPOSITION_STATUS.OPEN,
                    createdBy: interaction.user.id,
                    createdAt: Date.now()
                };

                // Add party fields to the embed
                composition.parties.forEach((party, index) => {
                    let partyTotal = 0;
                    let currentPosition = 1;

                    // Add party header
                    embed.addFields({
                        name: `🎯 ${party.name.toUpperCase()}`,
                        value: '━━━━━━━━━━━━━━━',
                        inline: false
                    });

                    // Add each weapon as an inline field
                    party.weapons.forEach(weapon => {
                        partyTotal += weapon.players_required;
                        const roleText = weapon.free_role ? '🔓 Free Role' : '';
                        const weaponNameWithoutPrefix = weapon.type.replace("Elder's ", "");
                        
                        // Store weapon info in state
                        compositionState.weapons.set(weaponNameWithoutPrefix.toLowerCase(), {
                            name: weapon.type,
                            required: weapon.players_required,
                            remaining: weapon.players_required,
                            participants: new Set(),
                            position: currentPosition,
                            isFreeRole: weapon.free_role
                        });

                        embed.addFields({
                            name: `${currentPosition}. ${weapon.type}`,
                            value: `👥 **Required:** ${weapon.players_required}\n${roleText}\n\`\`\`gw ${weaponNameWithoutPrefix}\`\`\``,
                            inline: true
                        });
                        
                        currentPosition++;
                    });

                    // Add empty field for spacing between parties if not the last party
                    if (index < composition.parties.length - 1) {
                        embed.addFields({
                            name: '\u200b',
                            value: '━━━━━━━━━━━━━━━',
                            inline: false
                        });
                    }
                });

                // Add total players field
                embed.addFields({
                    name: '📊 TOTAL COMPOSITION',
                    value: `👥 **Total Players Required:** ${totalPlayersNeeded}`,
                    inline: false
                });

                // Send the message with role ping and embed
                await interaction.deleteReply();
                
                const sentMessage = await interaction.channel.send({
                    content: `${role}`,
                    embeds: [embed]
                });

                compositionState.originalMessage = sentMessage;

                // Create a thread for the event
                const thread = await sentMessage.startThread({
                    name: composition.title.substring(0, 100),
                    autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
                    reason: 'PvP Event Discussion Thread'
                });

                // Store the composition state
                activeCompositions.set(thread.id, compositionState);

                // Add thread deletion handler
                thread.client.on('threadDelete', (deletedThread) => {
                    if (deletedThread.id === thread.id) {
                        cleanupComposition(deletedThread.id);
                    }
                });

                // Add thread message collector with timeout
                const collector = thread.createMessageCollector({
                    filter: m => m.content.startsWith('gw '),
                    time: 24 * 60 * 60 * 1000 // 24 hours
                });

                collector.on('end', (collected, reason) => {
                    if (reason === 'time') {
                        cleanupComposition(thread.id);
                        thread.send('This composition thread has expired. Please create a new one if needed.');
                    }
                });

                collector.on('collect', async (message) => {
                    try {
                        const content = message.content.substring(3).trim().toLowerCase();
                        
                        // Handle status commands
                        if (content.startsWith('status ')) {
                            const statusCommand = content.substring(7).trim();
                            const member = await message.guild.members.fetch(message.author.id);
                            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
                            const isEventCreator = message.author.id === compositionState.createdBy;

                            if (!isAdmin && !isEventCreator) {
                                await message.reply({
                                    content: 'Only administrators or the event creator can change the status.',
                                    ephemeral: true
                                });
                                return;
                            }

                            switch (statusCommand) {
                                case 'close':
                                    await updateCompositionStatus(compositionState, COMPOSITION_STATUS.CLOSED, 'Composition is now closed');
                                    await message.reply('Composition has been closed.');
                                    break;
                                case 'cancel':
                                    await updateCompositionStatus(compositionState, COMPOSITION_STATUS.CANCELLED, 'Composition has been cancelled');
                                    await message.reply('Composition has been cancelled.');
                                    break;
                                case 'open':
                                    await updateCompositionStatus(compositionState, COMPOSITION_STATUS.OPEN, 'Composition is now open');
                                    await message.reply('Composition has been reopened.');
                                    break;
                                default:
                                    await message.reply('Invalid status command. Use: status [open|close|cancel]');
                            }
                            return;
                        }

                        // Handle cancel command
                        if (content.startsWith('cancel')) {
                            const userId = message.author.id;
                            const member = await message.guild.members.fetch(userId);
                            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
                            const isEventCreator = userId === interaction.user.id;

                            // Check if admin is trying to cancel someone else
                            let targetUserId = userId;
                            if (isAdmin || isEventCreator) {
                                const mentionedUser = message.mentions.users.first();
                                if (mentionedUser) {
                                    targetUserId = mentionedUser.id;
                                }
                            }

                            // Find which weapon the target user is in
                            let userWeapon = null;
                            for (const [name, w] of compositionState.weapons.entries()) {
                                if (w.participants.has(targetUserId)) {
                                    userWeapon = w;
                                    break;
                                }
                            }

                            if (!userWeapon) {
                                await message.reply({
                                    content: targetUserId === userId ? 'You are not registered in any weapon.' : 'This user is not registered in any weapon.',
                                    ephemeral: true
                                });
                                return;
                            }

                            // Remove from weapon
                            userWeapon.participants.delete(targetUserId);
                            userWeapon.remaining = Math.min(userWeapon.required, userWeapon.remaining + 1);
                            
                            // Remove from fill players if they were a fill
                            if (userWeapon.fillPlayers?.has(targetUserId)) {
                                userWeapon.fillPlayers.delete(targetUserId);
                                userWeapon.fillCharacters.delete(targetUserId);
                            }

                            // Update total count
                            compositionState.remainingTotal++;

                            // Update the embed
                            const updatedEmbed = new EmbedBuilder(embed.toJSON());
                            let fieldIndex = 0;

                            for (const [name, w] of compositionState.weapons.entries()) {
                                const participantsList = Array.from(w.participants)
                                    .map(id => {
                                        const isFill = w.fillPlayers?.has(id);
                                        return `<@${id}>${isFill ? ' (fill)' : ''}`;
                                    })
                                    .join(', ');
                                
                                const roleText = w.isFreeRole ? '🔓 Free Role' : '';
                                updatedEmbed.spliceFields(fieldIndex, 1, {
                                    name: `${w.position}. ${w.name}`,
                                    value: `👥 **Required:** ${w.remaining}/${w.required}\n${roleText}${participantsList ? `\n${participantsList}` : ''}\n\`\`\`gw ${name}\`\`\``,
                                    inline: true
                                });
                                fieldIndex++;
                            }

                            // Update total count
                            const totalField = updatedEmbed.data.fields.findIndex(f => f.name === '📊 TOTAL COMPOSITION');
                            if (totalField !== -1) {
                                updatedEmbed.spliceFields(totalField, 1, {
                                    name: '📊 TOTAL COMPOSITION',
                                    value: `👥 **Total Players Required:** ${compositionState.remainingTotal}/${compositionState.totalRequired}`,
                                    inline: false
                                });
                            }

                            // Add fill queue section
                            updateEmbedWithFillQueue(updatedEmbed, compositionState);

                            // Update the original message with the new embed
                            await sentMessage.edit({ embeds: [updatedEmbed] });
                            compositionState.embed = updatedEmbed;

                            // Send confirmation message
                            const targetUser = await message.guild.members.fetch(targetUserId);
                            await message.reply({
                                content: targetUserId === userId 
                                    ? `You have been removed from ${userWeapon.name}`
                                    : `${targetUser} has been removed from ${userWeapon.name}`,
                                ephemeral: true
                            });
                            return;
                        }

                        // Check if user has the required role
                        const member = await message.guild.members.fetch(message.author.id);
                        if (!member.roles.cache.has(role.id)) {
                            await message.reply({
                                content: `You need the ${role} role to join this composition.`,
                                ephemeral: true
                            });
                            return;
                        }

                        // Check if user is verified
                        const verifiedCharacter = await getVerifiedCharacter(message.author.id, message.guild.id);
                        console.log('Verified character result:', {
                            discordId: message.author.id,
                            username: message.author.username,
                            character: verifiedCharacter,
                            guildId: message.guild.id
                        });

                        if (!verifiedCharacter) {
                            await message.reply({
                                content: `You need to verify or register your Albion character first using the \`/verify\` or \`/register\` command.`,
                                ephemeral: true
                            });
                            return;
                        }

                        const weaponName = message.content.substring(3).trim().toLowerCase();
                        const weapon = compositionState.weapons.get(weaponName);

                        if (!weapon) {
                            await message.reply({
                                content: 'Invalid weapon name. Please use one of the available weapons.',
                                ephemeral: true
                            });
                            return;
                        }

                        const userId = message.author.id;

                        // Check if user is already participating
                        let userPreviousWeapon = null;
                        for (const [name, w] of compositionState.weapons.entries()) {
                            if (w.participants.has(userId)) {
                                userPreviousWeapon = name;
                                break;
                            }
                        }

                        if (userPreviousWeapon) {
                            // Remove from previous weapon
                            const prevWeapon = compositionState.weapons.get(userPreviousWeapon);
                            prevWeapon.participants.delete(userId);
                            prevWeapon.remaining = Math.min(prevWeapon.required, prevWeapon.remaining + 1);
                            
                            // Remove from previous weapon's fill players if they were a fill
                            if (prevWeapon.fillPlayers?.has(userId)) {
                                prevWeapon.fillPlayers.delete(userId);
                                prevWeapon.fillCharacters.delete(userId);
                            }
                            
                            // Send feedback message
                            await message.reply({
                                content: `You were moved from ${prevWeapon.name} to ${weapon.name}`,
                                ephemeral: true
                            });
                        }

                        // Skip experience check for free roles
                        let experience = null;
                        if (!weapon.isFreeRole) {
                            try {
                                experience = await checkWeaponExperience(verifiedCharacter, weapon.name);
                                
                                if (!experience.hasExperience) {
                                    let responseMessage = `⚠️ Warning: You don't have recent experience with ${weapon.name}.\n\n`;
                                    
                                    // Add recent weapons experience
                                    if (experience.topRecentWeapons?.length > 0) {
                                        responseMessage += '**Your Recent Weapons (Last 30 days):**\n';
                                        experience.topRecentWeapons.forEach(w => {
                                            responseMessage += `• ${w.weapon_name}: ${w.usages} uses\n`;
                                        });
                                        responseMessage += '\n';
                                    } else {
                                        responseMessage += '**No Recent PvP Activity (Last 30 days)**\n\n';
                                    }

                                    // Add all-time weapons experience
                                    if (experience.topAllTimeWeapons?.length > 0) {
                                        responseMessage += '**Your All-Time Top Weapons:**\n';
                                        experience.topAllTimeWeapons.forEach(w => {
                                            responseMessage += `• ${w.weapon_name}: ${w.usages} uses\n`;
                                        });
                                        responseMessage += '\n';
                                    } else {
                                        responseMessage += '**No All-Time PvP Records Found**\n\n';
                                    }
                                    
                                    responseMessage += 'You will be marked as a fill player.';
                                    
                                    await message.reply({
                                        content: responseMessage,
                                        ephemeral: true
                                    });
                                }
                            } catch (error) {
                                console.error('Error checking weapon experience:', error);
                                await message.reply({
                                    content: 'There was an error checking your weapon experience. Please try again.',
                                    ephemeral: true
                                });
                                return;
                            }
                        }

                        // Add to new weapon if spots available or it's a free role
                        if (weapon.remaining > 0 || weapon.isFreeRole) {
                            // Initialize fill players set if it doesn't exist
                            if (!weapon.fillPlayers) {
                                weapon.fillPlayers = new Set();
                                weapon.fillCharacters = new Map();
                            }

                            // Check if weapon is full with regular players
                            if (isWeaponFullWithRegulars(weapon)) {
                                await message.reply({
                                    content: `This weapon is full with regular players.`,
                                    ephemeral: true
                                });
                                return;
                            }

                            // If weapon is full but has fill players, check experience
                            if (weapon.participants.size >= weapon.required && !weapon.isFreeRole) {
                                try {
                                    experience = await checkWeaponExperience(verifiedCharacter, weapon.name);
                                    
                                    if (experience.hasExperience) {
                                        // Remove a fill player and add the experienced player
                                        const fillPlayers = Array.from(weapon.participants)
                                            .filter(id => weapon.fillPlayers.has(id));
                                        
                                        if (fillPlayers.length > 0) {
                                            const removedFillPlayer = fillPlayers[0];
                                            weapon.participants.delete(removedFillPlayer);
                                            // Don't remove from fillPlayers or fillCharacters
                                            // This way they stay in the fill queue even if removed from the weapon
                                            
                                            // Send message to removed fill player
                                            try {
                                                await message.channel.send({
                                                    content: `<@${removedFillPlayer}> You have been moved to the fill queue as a more experienced player has joined.`,
                                                    ephemeral: true
                                                });
                                            } catch (error) {
                                                console.error('Error sending fill queue message:', error);
                                            }
                                        }
                                    } else {
                                        // Add to fill queue
                                        weapon.fillPlayers.add(userId);
                                        weapon.fillCharacters.set(userId, verifiedCharacter);
                                        await message.reply({
                                            content: `This weapon is full. You have been added to the fill queue.`,
                                            ephemeral: true
                                        });
                                        return;
                                    }
                                } catch (error) {
                                    console.error('Error checking weapon experience:', error);
                                    await message.reply({
                                        content: 'There was an error checking your weapon experience. Please try again.',
                                        ephemeral: true
                                    });
                                    return;
                                }
                            }

                            // Add player to weapon
                            weapon.participants.add(userId);
                            
                            // Add to fill players if they don't have experience
                            if (!weapon.isFreeRole && experience && !experience.hasExperience) {
                                weapon.fillPlayers.add(userId);
                                weapon.fillCharacters.set(userId, verifiedCharacter);
                            }

                            if (!weapon.isFreeRole) {
                                weapon.remaining--;
                                compositionState.remainingTotal--;
                            }

                            if (!userPreviousWeapon) {
                                // Send feedback message for new assignment
                                await message.reply({
                                    content: `You joined as ${weapon.name}`,
                                    ephemeral: true
                                });
                            }

                            // Update the embed
                            const updatedEmbed = new EmbedBuilder(embed.toJSON());
                            let fieldIndex = 0;

                            for (const [name, w] of compositionState.weapons.entries()) {
                                const participantsList = Array.from(w.participants)
                                    .map(id => {
                                        const isFill = w.fillPlayers?.has(id);
                                        return `<@${id}>${isFill ? ' (fill)' : ''}`;
                                    })
                                    .join(', ');
                                
                                const roleText = w.isFreeRole ? '🔓 Free Role' : '';
                                updatedEmbed.spliceFields(fieldIndex, 1, {
                                    name: `${w.position}. ${w.name}`,
                                    value: `👥 **Required:** ${w.remaining}/${w.required}\n${roleText}${participantsList ? `\n${participantsList}` : ''}\n\`\`\`gw ${name}\`\`\``,
                                    inline: true
                                });
                                fieldIndex++;
                            }

                            // Update total count
                            const totalField = updatedEmbed.data.fields.findIndex(f => f.name === '📊 TOTAL COMPOSITION');
                            if (totalField !== -1) {
                                updatedEmbed.spliceFields(totalField, 1, {
                                    name: '📊 TOTAL COMPOSITION',
                                    value: `👥 **Total Players Required:** ${compositionState.remainingTotal}/${compositionState.totalRequired}`,
                                    inline: false
                                });
                            }

                            // Add fill queue section
                            updateEmbedWithFillQueue(updatedEmbed, compositionState);

                            // Update the original message with the new embed
                            await sentMessage.edit({ embeds: [updatedEmbed] });
                            compositionState.embed = updatedEmbed;

                            // Send a confirmation message that's only visible to the user
                            await message.reply({ 
                                content: 'Composition updated!',
                                ephemeral: true 
                            });
                        } else {
                            // If no spots available and not a free role
                            await message.reply({
                                content: `No spots available for ${weapon.name}`,
                                ephemeral: true
                            });
                        }
                    } catch (error) {
                        console.error('Error handling message:', error);
                        await message.reply({
                            content: 'There was an error processing your request. Please try again.',
                            ephemeral: true
                        });
                    }
                });

                // Add error handler for the collector
                collector.on('error', error => {
                    console.error('Collector error:', error);
                });

            } catch (error) {
                console.error('Error in template processing:', error);
                return interaction.editReply({
                    content: `Error processing template: ${error.message}`,
                    ephemeral: true
                });
            }

        } catch (error) {
            await handleError(error, interaction);
        }
    }
}); 