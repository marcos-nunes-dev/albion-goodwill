const Command = require('../../structures/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const AlbionItems = require('../../services/AlbionItems');
const prisma = require('../../config/prisma');
const CompositionService = require('../../services/CompositionService');
const { handleError } = require('../../utils/ErrorHandler');
const { handleAddCommand, handleRemoveCommand, handleFillCommand, handleStatusCommand, handleHelpCommand, handleCloseCommand, handleCancelCommand } = require('./handlers/CompositionHandlers');

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

function cleanupRateLimitData() {
    const now = Date.now();
    for (const [playerName, timestamps] of requestTimestamps.entries()) {
        const recentTimestamps = timestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
        if (recentTimestamps.length === 0) {
            requestTimestamps.delete(playerName);
        } else {
            requestTimestamps.set(playerName, recentTimestamps);
        }
    }
}

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
    
    // Cleanup old data periodically
    if (Math.random() < 0.1) { // 10% chance to cleanup on each request
        cleanupRateLimitData();
    }
    
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
        if (!discordId || !guildId) {
            console.warn('Missing required parameters for verification check');
            return null;
        }

        console.log('Checking verification for Discord ID:', discordId, 'in Guild:', guildId);
        
        const user = await prisma.playerRegistration.findFirst({
            where: {
                userId: discordId,
                guildId: guildId
            },
            select: {
                playerName: true
            }
        }).catch(error => {
            console.error('Prisma query error:', error);
            return null;
        });

        return user?.playerName || null;
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

        const response = await fetch(`https://murderledger.albiononline2d.com/api/players/${playerName}/stats/weapons${lookbackDays ? `?lookback_days=${lookbackDays}` : ''}`, {
            timeout: 5000 // Add timeout
        });
        
        if (!response.ok) {
            if (response.status === 429) {
                console.warn(`Rate limit hit from API for player: ${playerName}`);
                return [];
            }
            if (response.status === 404) {
                console.warn(`Player not found: ${playerName}`);
                return [];
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Add validation for the response data
        const data = await response.json();
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid response data format');
        }

        const stats = data.weapons || [];
        if (!Array.isArray(stats)) {
            throw new Error('Invalid weapons data format');
        }

        // Cache the results
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
        const cleanWeaponName = formatWeaponName(weaponName);

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
            hasExperience: false,
            recentStats: null,
            allTimeStats: null,
            topRecentWeapons: [],
            topAllTimeWeapons: []
        };
    }
}

/**
 * Updates weapon state safely
 * @param {Object} weapon - The weapon object to update
 * @param {string} userId - The user ID
 * @param {string} action - The action to perform ('add' or 'remove')
 * @returns {Object} Updated weapon object
 */
function updateWeaponState(weapon, userId, action) {
    try {
        // Initialize fill players set if it doesn't exist
        if (!weapon.fillPlayers) {
            weapon.fillPlayers = new Set();
        }
        if (!weapon.fillCharacters) {
            weapon.fillCharacters = new Map();
        }

        switch (action) {
            case 'add':
                weapon.participants.add(userId);
                if (!weapon.isFreeRole) {
                    weapon.remaining = Math.max(0, weapon.remaining - 1);
                }
                break;
            case 'remove':
                weapon.participants.delete(userId);
                if (!weapon.isFreeRole) {
                    weapon.remaining = Math.min(weapon.required, weapon.remaining + 1);
                }
                // Also remove from fill players if they were a fill
                if (weapon.fillPlayers.has(userId)) {
                    weapon.fillPlayers.delete(userId);
                    weapon.fillCharacters.delete(userId);
                }
                break;
            default:
                throw new Error(`Invalid action: ${action}`);
        }

        return weapon;
    } catch (error) {
        console.error('Error updating weapon state:', error);
        throw error;
    }
}

/**
 * Formats a weapon name to be more concise
 * @param {string} weaponName - The full weapon name
 * @returns {string} Formatted weapon name
 */
function formatWeaponName(weaponName) {
    try {
        // Handle null or undefined
        if (!weaponName) {
            return '';
        }

        // Remove "Elder's" prefix
        let formattedName = weaponName.replace(/^Elder's\s+/i, '');

        // Handle special cases
        const specialCases = {
            'Quarterstaff': 'QStaff',
            'Great Holy Staff': 'GHoly',
            'Divine Staff': 'Divine',
            'Fallen Staff': 'Fallen',
            'Great Nature Staff': 'GNature',
            'Wild Staff': 'Wild',
            'Great Fire Staff': 'GFire',
            'Infernal Staff': 'Infernal',
            'Great Arcane Staff': 'GArcane',
            'Enigmatic Staff': 'Enigmatic',
            'Great Frost Staff': 'GFrost',
            'Glacial Staff': 'Glacial',
            'Great Cursed Staff': 'GCursed',
            'Demonic Staff': 'Demonic'
        };

        // Check for special cases first
        for (const [full, short] of Object.entries(specialCases)) {
            if (formattedName.toLowerCase().includes(full.toLowerCase())) {
                return short;
            }
        }

        // If no special case, return as is
        return formattedName;
    } catch (error) {
        console.error('Error formatting weapon name:', error);
        return weaponName; // Return original name if error
    }
}

/**
 * Validates the composition JSON structure
 * @param {Object} composition - The composition object to validate
 * @returns {Object} Validation result with isValid and error message
 */
function validateComposition(composition) {
    try {
        // Check if composition has required fields
        if (!composition.title) {
            return { isValid: false, error: 'Missing title field' };
        }

        if (!composition.parties || !Array.isArray(composition.parties)) {
            return { isValid: false, error: 'Missing or invalid parties array' };
        }

        // Validate each party
        for (const party of composition.parties) {
            if (!party.name) {
                return { isValid: false, error: 'Party missing name field' };
            }

            if (!party.weapons || !Array.isArray(party.weapons)) {
                return { isValid: false, error: `Party "${party.name}" missing weapons array` };
            }

            // Validate each weapon in the party
            for (const weapon of party.weapons) {
                if (!weapon.type) {
                    return { isValid: false, error: `Weapon in party "${party.name}" missing type field` };
                }

                if (!weapon.players_required || typeof weapon.players_required !== 'number' || weapon.players_required < 1) {
                    return { isValid: false, error: `Invalid players_required for weapon "${weapon.type}" in party "${party.name}"` };
                }
            }
        }

        return { isValid: true, error: null };
    } catch (error) {
        console.error('Error validating composition:', error);
        return { isValid: false, error: 'Internal validation error' };
    }
}

/**
 * Cleans up a composition's resources
 * @param {string} threadId - The thread ID to clean up
 */
function cleanupComposition(threadId) {
    try {
        activeCompositions.delete(threadId);
    } catch (error) {
        console.error('Error cleaning up composition:', error);
    }
}

module.exports = new Command({
    name: 'pingpvp',
    description: 'Pings a role with a PVP event message using a composition template',
    category: 'albion',
    options: [
        {
            name: 'role',
            description: 'The role to ping for the event',
            type: 8, // ROLE
            required: true
        },
        {
            name: 'template',
            description: 'A JSON file containing the composition template',
            type: 11, // ATTACHMENT
            required: false
        },
        {
            name: 'json',
            description: 'Direct JSON input for the composition template',
            type: 3, // STRING
            required: false
        }
    ],
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
                if (!interaction.deferred) {
                    return interaction.reply({ 
                        content: 'Please provide a valid role to ping!', 
                        ephemeral: true 
                    });
                } else {
                    return interaction.editReply({ 
                        content: 'Please provide a valid role to ping!', 
                        ephemeral: true 
                    });
                }
            }

            if (!template && !jsonInput) {
                if (!interaction.deferred) {
                    return interaction.reply({
                        content: 'Please provide either a text file or JSON input!',
                        ephemeral: true
                    });
                } else {
                    return interaction.editReply({
                        content: 'Please provide either a text file or JSON input!',
                        ephemeral: true
                    });
                }
            }

            // Validate template file if provided
            if (template && !template.contentType?.includes('json') && !template.contentType?.includes('text')) {
                if (!interaction.deferred) {
                    return interaction.reply({
                        content: 'Please provide a valid JSON file for the template!',
                        ephemeral: true
                    });
                } else {
                    return interaction.editReply({
                        content: 'Please provide a valid JSON file for the template!',
                        ephemeral: true
                    });
                }
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
                        value: ' ',
                        inline: false
                    });

                    // Add each weapon as an inline field
                    party.weapons.forEach(weapon => {
                        partyTotal += weapon.players_required;
                        const roleText = weapon.free_role ? '🔓 Free Role' : '';
                        const formattedWeaponName = formatWeaponName(weapon.type);
                        
                        // Store weapon info in state with party name
                        compositionState.weapons.set(formattedWeaponName.toLowerCase(), {
                            name: weapon.type,
                            required: weapon.players_required,
                            remaining: weapon.players_required,
                            participants: new Set(),
                            position: currentPosition,
                            isFreeRole: weapon.free_role,
                            partyName: party.name,
                            description: weapon.description
                        });

                        embed.addFields({
                            name: `${formattedWeaponName} 👥x${weapon.players_required}`,
                            value: `\`\`\`gw ${formattedWeaponName.toLowerCase()}\`\`\``,
                            inline: false
                        });
                        
                        currentPosition++;
                    });

                    // Add empty field for spacing between parties if not the last party
                    if (index < composition.parties.length - 1) {
                        embed.addFields({
                            name: '\u200b',
                            value: ' ',
                            inline: false
                        });
                    }
                });

                // Add empty field before total composition
                embed.addFields({
                    name: '\u200b',
                    value: ' ',
                    inline: false
                });

                // Add total players field
                embed.addFields({
                    name: '📊 TOTAL COMPOSITION',
                    value: `👥 **Total Players Required:** ${totalPlayersNeeded}`,
                    inline: false
                });

                // Add empty field after total composition
                embed.addFields({
                    name: '\u200b',
                    value: ' ',
                    inline: false
                });

                // Add fill queue command field
                embed.addFields({
                    name: '👥 FILL QUEUE',
                    value: 'Want to join as a fill player? Use:\n`gw fill`',
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

                // Send tutorial message
                const tutorialEmbed = new EmbedBuilder()
                    .setTitle('📖 How to Use This Composition')
                    .setColor(0x00FF00)
                    .setDescription([
                        'Welcome to the PvP composition thread! Here\'s how to use it:',
                        '',
                        '**1. Joining a Role**',
                        '• Use `gw <weapon_name>` to join a role',
                        '• Example: `gw broadsword` or `gw holy staff`',
                        '• The weapon name must match exactly as shown in the composition',
                        '',
                        '**2. Experience Check**',
                        '• The system will check your recent PvP experience with the weapon',
                        '• If you have recent experience, you\'ll be added as a regular player',
                        '• If you don\'t have recent experience, you\'ll be added as a fill player',
                        '',
                        '**3. Fill Queue**',
                        '• Use `gw fill` to join the fill queue',
                        '• Your weapon experience will be displayed in the fill queue',
                        '• Format: @User - CharacterName |||| Weapon1 (100x), Weapon2 (50x) (Role)',
                        '• You can be replaced by more experienced players if spots are needed',
                        '',
                        '**4. Cancelling Your Role**',
                        '• Use `gw cancel` to remove yourself from your current role',
                        '• You can then join a different role if needed',
                        '',
                        '**5. Admin Controls**',
                        '• Admins can use `gw cancel @user` to remove other players',
                        '• Admins can use `gw <weapon_name> @user` to force-add players to specific weapons',
                        '• Example: `gw wildfire staff @user` or `gw broadsword @user`',
                        '',
                        '**6. Free Roles**',
                        '• Roles marked with 🔓 are free roles',
                        '• These don\'t require experience checks',
                        '• They can be filled even if the weapon is full',
                        '',
                        '**Need Help?**',
                        '• Ask in this thread if you have questions',
                        '• Make sure you\'re verified with `/register` before joining'
                    ].join('\n'))
                    .setFooter({ text: 'Good luck and have fun!' });

                await thread.send({ embeds: [tutorialEmbed] });

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
                    filter: (m) => {
                        // More verbose debug logging
                        console.log('Raw message event:', {
                            content: m.content,
                            cleanContent: m.cleanContent,
                            type: m.type,
                            system: m.system,
                            author: {
                                tag: m.author.tag,
                                bot: m.author.bot,
                                id: m.author.id
                            },
                            channel: {
                                id: m.channel.id,
                                type: m.channel.type,
                                name: m.channel.name
                            }
                        });

                        // Basic validation
                        if (!m.content || typeof m.content !== 'string') {
                            console.log('Message content invalid or empty');
                            return false;
                        }

                        const isValidMessage = m.content.toLowerCase().trim().startsWith('gw ') && 
                                            m.channel.id === thread.id && 
                                            !m.author.bot;

                        console.log('Message filter result:', {
                            content: m.content,
                            isValid: isValidMessage,
                            checks: {
                                startsWithGw: m.content.toLowerCase().trim().startsWith('gw '),
                                correctChannel: m.channel.id === thread.id,
                                notBot: !m.author.bot
                            }
                        });

                        return isValidMessage;
                    },
                    time: 24 * 60 * 60 * 1000 // 24 hours
                });

                // Log when collector is created
                console.log('Message collector created for thread:', {
                    threadId: thread.id,
                    threadName: thread.name,
                    guildId: thread.guildId,
                    channelType: thread.type,
                    parentChannelId: thread.parentId
                });

                // Add collector state check every minute
                const collectorStateCheck = setInterval(() => {
                    console.log('Collector state check:', {
                        threadId: thread.id,
                        isEnded: collector.ended,
                        messageCount: collector.collected.size,
                        endReason: collector.endReason || 'still running'
                    });
                }, 60000);

                // Clean up interval on collector end
                collector.on('end', () => {
                    clearInterval(collectorStateCheck);
                });

                collector.on('error', (error) => {
                    console.error('Message collector error:', {
                        error: error.message,
                        stack: error.stack,
                        threadId: thread.id
                    });
                });

                collector.on('end', (collected, reason) => {
                    clearInterval(collectorStateCheck);
                    
                    if (reason === 'time') {
                        cleanupComposition(thread.id);
                        thread.send('This composition thread has expired. Please create a new one if needed.')
                            .catch(error => console.error('Error sending expiration message:', error));
                    }
                    
                    // Cleanup regardless of reason
                    const compositionState = activeCompositions.get(thread.id);
                    if (compositionState) {
                        cleanupComposition(thread.id);
                    }
                });

                collector.on('collect', async (message) => {
                    // Add debug logging at the start of message handling
                    console.log('Message collected:', {
                        content: message.content,
                        author: message.author.tag,
                        threadId: thread.id
                    });

                    try {
                        const compositionState = activeCompositions.get(thread.id);
                        if (!compositionState) {
                            console.error('Composition state not found for thread:', thread.id);
                            return;
                        }

                        // Parse command
                        const content = message.content.substring(3).trim().toLowerCase();
                        const args = content.split(' ');
                        const command = args[0];

                        // Handle special commands first
                        if (command === 'fill') {
                            await handleFillCommand(message, args, compositionState, sentMessage);
                            return;
                        }
                        if (command === 'cancel') {
                            await handleRemoveCommand(message, args, compositionState, sentMessage);
                            return;
                        }
                        if (command === 'help') {
                            await handleHelpCommand(message);
                            return;
                        }
                        if (command === 'status' && args[1]) {
                            await handleStatusCommand(message, args, compositionState, sentMessage, role);
                            return;
                        }

                        // If not a special command, treat it as a weapon name
                        const weaponName = content;
                        const weapon = compositionState.weapons.get(weaponName);
                        
                        if (weapon) {
                            await handleAddCommand(message, [weaponName], compositionState, sentMessage, checkWeaponExperience);
                        } else {
                            await message.reply({
                                content: 'Invalid weapon name. Use `gw help` for available commands.',
                                ephemeral: true
                            });
                        }
                    } catch (error) {
                        await handleError(error, null, message);
                    }
                });

            } catch (error) {
                await handleError(error, interaction);
            }
        } catch (error) {
            await handleError(error, interaction);
        }
    }
});