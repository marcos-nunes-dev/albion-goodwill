// const Command = require('../../structures/Command');
// const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
// const AlbionItems = require('../../services/AlbionItems');
// const prisma = require('../../config/prisma');

// // Constants
// const LOOKBACK_DAYS = 30;
// const MAX_COMPARE_PLAYERS = 5;
// const THREAD_AUTO_ARCHIVE_DURATION = 1440; // 24 hours in minutes

// // Store active compositions with their participants
// const activeCompositions = new Map();

// // Cache for weapon stats to avoid repeated API calls
// const weaponStatsCache = new Map();

// // Add rate limiting
// const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
// const MAX_REQUESTS_PER_WINDOW = 30;
// const requestTimestamps = new Map();

// // Add composition status tracking
// const COMPOSITION_STATUS = {
//     OPEN: 'open',
//     CLOSED: 'closed',
//     CANCELLED: 'cancelled'
// };

// function cleanupRateLimitData() {
//     const now = Date.now();
//     for (const [playerName, timestamps] of requestTimestamps.entries()) {
//         const recentTimestamps = timestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
//         if (recentTimestamps.length === 0) {
//             requestTimestamps.delete(playerName);
//         } else {
//             requestTimestamps.set(playerName, recentTimestamps);
//         }
//     }
// }

// function isRateLimited(playerName) {
//     const now = Date.now();
//     const timestamps = requestTimestamps.get(playerName) || [];
    
//     // Remove timestamps older than the window
//     const recentTimestamps = timestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    
//     if (recentTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
//         return true;
//     }
    
//     recentTimestamps.push(now);
//     requestTimestamps.set(playerName, recentTimestamps);
    
//     // Cleanup old data periodically
//     if (Math.random() < 0.1) { // 10% chance to cleanup on each request
//         cleanupRateLimitData();
//     }
    
//     return false;
// }

// /**
//  * Gets the verified character name for a Discord user in a specific guild
//  * @param {string} discordId - The Discord user ID
//  * @param {string} guildId - The Discord guild ID
//  * @returns {Promise<string|null>} The verified character name or null if not found
//  */
// async function getVerifiedCharacter(discordId, guildId) {
//     try {
//         if (!discordId || !guildId) {
//             console.warn('Missing required parameters for verification check');
//             return null;
//         }

//         console.log('Checking verification for Discord ID:', discordId, 'in Guild:', guildId);
        
//         const user = await prisma.playerRegistration.findFirst({
//             where: {
//                 userId: discordId,
//                 guildId: guildId
//             },
//             select: {
//                 playerName: true
//             }
//         }).catch(error => {
//             console.error('Prisma query error:', error);
//             return null;
//         });

//         return user?.playerName || null;
//     } catch (error) {
//         console.error('Error fetching verified character:', error);
//         return null;
//     }
// }

// /**
//  * Fetches player's weapon stats from MurderLedger with caching
//  * @param {string} playerName - The player's name
//  * @param {number} lookbackDays - Number of days to look back for stats
//  * @returns {Promise<Array>} Array of weapon stats
//  */
// async function fetchPlayerWeaponStats(playerName, lookbackDays = LOOKBACK_DAYS) {
//     try {
//         const cacheKey = `${playerName}-${lookbackDays}`;
//         const cachedStats = weaponStatsCache.get(cacheKey);
        
//         if (cachedStats) {
//             return cachedStats;
//         }

//         if (isRateLimited(playerName)) {
//             console.warn(`Rate limit hit for player: ${playerName}`);
//             return [];
//         }

//         const response = await fetch(`https://murderledger.albiononline2d.com/api/players/${playerName}/stats/weapons${lookbackDays ? `?lookback_days=${lookbackDays}` : ''}`, {
//             timeout: 5000 // Add timeout
//         });
        
//         if (!response.ok) {
//             if (response.status === 429) {
//                 console.warn(`Rate limit hit from API for player: ${playerName}`);
//                 return [];
//             }
//             if (response.status === 404) {
//                 console.warn(`Player not found: ${playerName}`);
//                 return [];
//             }
//             throw new Error(`HTTP error! status: ${response.status}`);
//         }

//         // Add validation for the response data
//         const data = await response.json();
//         if (!data || typeof data !== 'object') {
//             throw new Error('Invalid response data format');
//         }

//         const stats = data.weapons || [];
//         if (!Array.isArray(stats)) {
//             throw new Error('Invalid weapons data format');
//         }

//         // Cache the results
//         weaponStatsCache.set(cacheKey, stats);
//         setTimeout(() => weaponStatsCache.delete(cacheKey), 5 * 60 * 1000);
        
//         return stats;
//     } catch (error) {
//         console.error('Error fetching weapon stats:', error);
//         return [];
//     }
// }

// /**
//  * Checks if a player has experience with a specific weapon
//  * @param {string} playerName - The player's name
//  * @param {string} weaponName - The weapon name to check
//  * @returns {Promise<Object>} Object containing experience data
//  */
// async function checkWeaponExperience(playerName, weaponName) {
//     try {
//         // Fetch both recent (30 days) and all-time stats
//         const [recentStats, allTimeStats] = await Promise.all([
//             fetchPlayerWeaponStats(playerName, 30),
//             fetchPlayerWeaponStats(playerName, 9999)
//         ]);

//         // Clean up weapon name for comparison (remove "Elder's" prefix)
//         const cleanWeaponName = weaponName.replace("Elder's ", "");

//         // Function to find weapon in stats
//         const findWeapon = (stats, name) => {
//             return stats.find(w => 
//                 w.weapon_name.toLowerCase() === name.toLowerCase() ||
//                 w.weapon.toLowerCase() === name.toLowerCase() ||
//                 w.weapon_name.toLowerCase().includes(name.toLowerCase())
//             );
//         };

//         const recentWeapon = findWeapon(recentStats, cleanWeaponName);
//         const allTimeWeapon = findWeapon(allTimeStats, cleanWeaponName);

//         // Sort weapons by usage and filter out empty stats
//         const sortedRecentWeapons = recentStats
//             .filter(w => w.usages > 0)
//             .sort((a, b) => b.usages - a.usages)
//             .slice(0, 5);

//         const sortedAllTimeWeapons = allTimeStats
//             .filter(w => w.usages > 0)
//             .sort((a, b) => b.usages - a.usages)
//             .slice(0, 5);

//         return {
//             hasExperience: !!(recentWeapon && recentWeapon.usages > 0),
//             recentStats: recentWeapon,
//             allTimeStats: allTimeWeapon,
//             topRecentWeapons: sortedRecentWeapons,
//             topAllTimeWeapons: sortedAllTimeWeapons
//         };
//     } catch (error) {
//         console.error('Error checking weapon experience:', error);
//         return { 
//             hasExperience: true,
//             topRecentWeapons: [],
//             topAllTimeWeapons: []
//         };
//     }
// }

// /**
//  * Checks if a weapon is full with only regular players
//  * @param {Object} weapon - The weapon object to check
//  * @returns {boolean} True if weapon is full with regular players
//  */
// function isWeaponFullWithRegulars(weapon) {
//     return weapon.participants.size >= weapon.required && 
//            Array.from(weapon.participants).every(id => !weapon.fillPlayers?.has(id));
// }

// /**
//  * Gets the count of fill players for a weapon
//  * @param {Object} weapon - The weapon object to check
//  * @returns {number} Number of fill players
//  */
// function getFillPlayersCount(weapon) {
//     return Array.from(weapon.participants).filter(id => weapon.fillPlayers?.has(id)).length;
// }

// /**
//  * Updates an embed with fill queue information
//  * @param {EmbedBuilder} embed - The embed to update
//  * @param {Object} compositionState - The current composition state
//  * @returns {EmbedBuilder} The updated embed
//  */
// function updateEmbedWithFillQueue(embed, compositionState) {
//     // Find the last field index
//     let lastFieldIndex = embed.data.fields.length - 1;
    
//     // Remove existing fill queue if it exists
//     if (embed.data.fields[lastFieldIndex].name === '👥 FILL QUEUE') {
//         embed.spliceFields(lastFieldIndex, 1);
//     }

//     // Collect all fill players
//     const fillQueue = new Map(); // Map of userId -> {weapon, character, experience}
    
//     // Add weapon-specific fill players
//     for (const [name, w] of compositionState.weapons.entries()) {
//         if (w.fillPlayers) {
//             for (const userId of w.fillPlayers) {
//                 fillQueue.set(userId, {
//                     weapon: w.name,
//                     character: w.fillCharacters?.get(userId),
//                     experience: null
//                 });
//             }
//         }
//     }

//     // Add general fill queue players
//     if (compositionState.fillQueue) {
//         for (const [userId, data] of compositionState.fillQueue.entries()) {
//             if (!fillQueue.has(userId)) {
//                 fillQueue.set(userId, {
//                     weapon: 'Any Role',
//                     character: data.character,
//                     experience: data.experience
//                 });
//             }
//         }
//     }

//     // Add fill queue field if there are fill players
//     if (fillQueue.size > 0) {
//         let fillQueueText = '';
//         for (const [userId, data] of fillQueue.entries()) {
//             let playerText = `<@${userId}>`;
//             if (data.character) {
//                 playerText += ` - ${data.character}`;
//             }
//             if (data.experience) {
//                 playerText += ` |||| ${data.experience}`;
//             }
//             playerText += ` (${data.weapon})`;
//             fillQueueText += `• ${playerText}\n`;
//         }
//         embed.addFields({
//             name: '👥 FILL QUEUE',
//             value: fillQueueText,
//             inline: false
//         });
//     }

//     return embed;
// }

// /**
//  * Handles errors consistently across the command
//  * @param {Error} error - The error object
//  * @param {Interaction} interaction - The Discord interaction
//  * @param {Message} [message] - Optional message object
//  */
// async function handleError(error, interaction, message = null) {
//     console.error('Error in pingpvp command:', error);
//     const errorMessage = error.response?.data?.message || error.message || 'There was an error executing this command!';
    
//     if (interaction.deferred) {
//         await interaction.editReply({ 
//             content: `Error: ${errorMessage}`, 
//             ephemeral: true 
//         });
//     } else if (message) {
//         await message.reply({
//             content: `Error: ${errorMessage}`,
//             ephemeral: true
//         });
//     } else {
//         await interaction.reply({ 
//             content: `Error: ${errorMessage}`, 
//             ephemeral: true 
//         });
//     }
// }

// // Add composition validation function
// /**
//  * Validates the composition JSON structure
//  * @param {Object} composition - The composition object to validate
//  * @returns {Object} Validation result with isValid and error message
//  */
// function validateComposition(composition) {
//     if (!composition.title || typeof composition.title !== 'string') {
//         return { isValid: false, error: 'Composition must have a title' };
//     }

//     if (!composition.parties || !Array.isArray(composition.parties)) {
//         return { isValid: false, error: 'Composition must have a parties array' };
//     }

//     if (composition.parties.length === 0) {
//         return { isValid: false, error: 'Composition must have at least one party' };
//     }

//     for (const party of composition.parties) {
//         if (!party.name || typeof party.name !== 'string') {
//             return { isValid: false, error: 'Each party must have a name' };
//         }

//         if (!party.weapons || !Array.isArray(party.weapons)) {
//             return { isValid: false, error: `Party "${party.name}" must have a weapons array` };
//         }

//         if (party.weapons.length === 0) {
//             return { isValid: false, error: `Party "${party.name}" must have at least one weapon` };
//         }

//         for (const weapon of party.weapons) {
//             if (!weapon.type || typeof weapon.type !== 'string') {
//                 return { isValid: false, error: `Weapon in party "${party.name}" must have a type` };
//             }

//             if (typeof weapon.players_required !== 'number' || weapon.players_required < 1) {
//                 return { isValid: false, error: `Weapon "${weapon.type}" in party "${party.name}" must have a valid players_required number` };
//             }
//         }
//     }

//     return { isValid: true };
// }

// // Add thread cleanup function
// /**
//  * Cleans up a composition's resources
//  * @param {string} threadId - The thread ID to clean up
//  */
// function cleanupComposition(threadId) {
//     activeCompositions.delete(threadId);
// }

// // Add status update function
// /**
//  * Updates the composition status and embed
//  * @param {Object} compositionState - The current composition state
//  * @param {string} newStatus - The new status to set
//  * @param {string} reason - Optional reason for the status change
//  */
// async function updateCompositionStatus(compositionState, newStatus, reason = '') {
//     compositionState.status = newStatus;
//     const statusEmoji = {
//         [COMPOSITION_STATUS.OPEN]: '🟢',
//         [COMPOSITION_STATUS.CLOSED]: '🔴',
//         [COMPOSITION_STATUS.CANCELLED]: '⚫'
//     }[newStatus];

//     const statusText = {
//         [COMPOSITION_STATUS.OPEN]: 'OPEN',
//         [COMPOSITION_STATUS.CLOSED]: 'CLOSED',
//         [COMPOSITION_STATUS.CANCELLED]: 'CANCELLED'
//     }[newStatus];

//     // Update embed title
//     const embed = compositionState.embed;
//     const title = embed.data.title;
//     if (!title.includes(statusEmoji)) {
//         embed.setTitle(`${statusEmoji} ${title}`);
//     }

//     // Add status field if it doesn't exist
//     const statusField = embed.data.fields.find(f => f.name === '📊 STATUS');
//     if (!statusField) {
//         embed.addFields({
//             name: '📊 STATUS',
//             value: `${statusEmoji} ${statusText}${reason ? `\n${reason}` : ''}`,
//             inline: false
//         });
//     } else {
//         embed.spliceFields(
//             embed.data.fields.findIndex(f => f.name === '📊 STATUS'),
//             1,
//             {
//                 name: '📊 STATUS',
//                 value: `${statusEmoji} ${statusText}${reason ? `\n${reason}` : ''}`,
//                 inline: false
//             }
//         );
//     }

//     await compositionState.originalMessage.edit({ embeds: [embed] });
// }

// /**
//  * Updates weapon state safely
//  * @param {Object} weapon - The weapon object to update
//  * @param {string} userId - The user ID
//  * @param {string} action - The action to perform ('add' or 'remove')
//  * @returns {Object} Updated weapon object
//  */
// function updateWeaponState(weapon, userId, action) {
//     if (!weapon || typeof weapon !== 'object') {
//         throw new Error('Invalid weapon object');
//     }

//     if (!userId || typeof userId !== 'string') {
//         throw new Error('Invalid user ID');
//     }

//     // Initialize required properties if they don't exist
//     weapon.participants = weapon.participants || new Set();
//     weapon.fillPlayers = weapon.fillPlayers || new Set();
//     weapon.fillCharacters = weapon.fillCharacters || new Map();
//     weapon.remaining = typeof weapon.remaining === 'number' ? weapon.remaining : weapon.required;

//     switch (action) {
//         case 'add':
//             weapon.participants.add(userId);
//             if (!weapon.isFreeRole) {
//                 weapon.remaining = Math.max(0, weapon.remaining - 1);
//             }
//             break;
//         case 'remove':
//             weapon.participants.delete(userId);
//             weapon.fillPlayers.delete(userId);
//             weapon.fillCharacters.delete(userId);
//             if (!weapon.isFreeRole) {
//                 weapon.remaining = Math.min(weapon.required, weapon.remaining + 1);
//             }
//             break;
//         default:
//             throw new Error('Invalid action');
//     }

//     return weapon;
// }

// /**
//  * Formats a weapon name to be more concise
//  * @param {string} weaponName - The full weapon name
//  * @returns {string} Formatted weapon name
//  */
// function formatWeaponName(weaponName) {
//     // Remove "Elder's" prefix
//     let name = weaponName.replace("Elder's ", "");
    
//     // Remove "Staff" suffix
//     name = name.replace(" Staff", "");
    
//     // Handle two-word weapons
//     const words = name.split(' ');
//     if (words.length === 2) {
//         // Abbreviate first word if it's longer than 4 characters
//         if (words[0].length > 4) {
//             return `${words[0][0]}. ${words[1]}`;
//         }
//     }
    
//     return name;
// }

// module.exports = new Command({
//     name: 'pingpvp',
//     description: 'Pings a role with a PVP event message using a composition template',
//     category: 'albion',
//     usage: '<role> <template>',
//     cooldown: 10,
//     permissions: [PermissionFlagsBits.MentionEveryone],
//     async execute(interaction, args, handler) {
//         try {
//             // Initialize items service if not already done
//             if (!AlbionItems.isInitialized) {
//                 await interaction.deferReply();
//                 await AlbionItems.init();
//             }

//             // Get the role from the interaction
//             const role = interaction.options.getRole('role');
//             const template = interaction.options.getAttachment('template');
//             const jsonInput = interaction.options.getString('json');

//             // Validate required inputs
//             if (!role) {
//                 if (!interaction.deferred) {
//                     return interaction.reply({ 
//                         content: 'Please provide a valid role to ping!', 
//                         ephemeral: true 
//                     });
//                 } else {
//                     return interaction.editReply({ 
//                         content: 'Please provide a valid role to ping!', 
//                         ephemeral: true 
//                     });
//                 }
//             }

//             if (!template && !jsonInput) {
//                 if (!interaction.deferred) {
//                     return interaction.reply({
//                         content: 'Please provide either a text file or JSON input!',
//                         ephemeral: true
//                     });
//                 } else {
//                     return interaction.editReply({
//                         content: 'Please provide either a text file or JSON input!',
//                         ephemeral: true
//                     });
//                 }
//             }

//             // Validate template file if provided
//             if (template && !template.contentType?.includes('json') && !template.contentType?.includes('text')) {
//                 if (!interaction.deferred) {
//                     return interaction.reply({
//                         content: 'Please provide a valid JSON file for the template!',
//                         ephemeral: true
//                     });
//                 } else {
//                     return interaction.editReply({
//                         content: 'Please provide a valid JSON file for the template!',
//                         ephemeral: true
//                     });
//                 }
//             }

//             // If not already deferred (from items init)
//             if (!interaction.deferred) {
//                 await interaction.deferReply();
//             }

//             try {
//                 let textContent;
                
//                 if (template && template.url) {
//                     // Fetch the text content from file
//                     const fileResponse = await fetch(template.url);
//                     if (!fileResponse.ok) {
//                         throw new Error(`Failed to fetch template file: ${fileResponse.statusText}`);
//                     }
//                     textContent = await fileResponse.text();
//                 } else {
//                     // Use the direct JSON input
//                     textContent = jsonInput;
//                 }

//                 // Clean up the text content
//                 textContent = textContent.trim();
                
//                 // Try to parse the text content as JSON
//                 let composition;
//                 try {
//                     composition = JSON.parse(textContent);
//                 } catch (parseError) {
//                     console.error('JSON Parse Error:', parseError.message);
//                     console.error('Text content causing error:', textContent);
//                     return interaction.editReply({
//                         content: `Error parsing JSON: ${parseError.message}\nMake sure your JSON is properly formatted with double quotes around property names and no trailing commas.`,
//                         ephemeral: true
//                     });
//                 }

//                 // Validate the composition structure
//                 const validation = validateComposition(composition);
//                 if (!validation.isValid) {
//                     return interaction.editReply({
//                         content: `Invalid composition format: ${validation.error}`,
//                         ephemeral: true
//                     });
//                 }

//                 // Validate weapon names
//                 for (const party of composition.parties) {
//                     if (!party.weapons || !Array.isArray(party.weapons)) {
//                         return interaction.editReply({
//                             content: `Invalid party format in "${party.name}": missing weapons array.`,
//                             ephemeral: true
//                         });
//                     }

//                     for (const weapon of party.weapons) {
//                         if (!AlbionItems.validateWeaponName(weapon.type)) {
//                             return interaction.editReply({
//                                 content: `Invalid weapon name in party "${party.name}": "${weapon.type}" is not a valid Albion Online weapon.`,
//                                 ephemeral: true
//                             });
//                         }
//                     }
//                 }

//                 // Create an embed for the event
//                 const embed = new EmbedBuilder()
//                     .setTitle(`${composition.title.toUpperCase()}`)
//                     .setColor(0xFF0000)
//                     .setTimestamp();

//                 if (composition.description) {
//                     embed.setDescription(`**Event Description:**\n${composition.description}`);
//                 }

//                 // Calculate total players needed
//                 let totalPlayersNeeded = 0;
//                 composition.parties.forEach(party => {
//                     party.weapons.forEach(weapon => {
//                         totalPlayersNeeded += weapon.players_required;
//                     });
//                 });

//                 // Initialize composition state
//                 const compositionState = {
//                     weapons: new Map(),
//                     totalRequired: totalPlayersNeeded,
//                     remainingTotal: totalPlayersNeeded,
//                     embed: embed,
//                     originalMessage: null,
//                     status: COMPOSITION_STATUS.OPEN,
//                     createdBy: interaction.user.id,
//                     createdAt: Date.now()
//                 };

//                 // Add party fields to the embed
//                 composition.parties.forEach((party, index) => {
//                     let partyTotal = 0;
//                     let currentPosition = 1;

//                     // Add party header
//                     embed.addFields({
//                         name: `🎯 ${party.name.toUpperCase()}`,
//                         value: ' ',
//                         inline: false
//                     });

//                     // Add each weapon as an inline field
//                     party.weapons.forEach(weapon => {
//                         partyTotal += weapon.players_required;
//                         const roleText = weapon.free_role ? '🔓 Free Role' : '';
//                         const formattedWeaponName = formatWeaponName(weapon.type);
                        
//                         // Store weapon info in state with party name
//                         compositionState.weapons.set(formattedWeaponName.toLowerCase(), {
//                             name: weapon.type,
//                             required: weapon.players_required,
//                             remaining: weapon.players_required,
//                             participants: new Set(),
//                             position: currentPosition,
//                             isFreeRole: weapon.free_role,
//                             partyName: party.name,
//                             description: weapon.description
//                         });

//                         embed.addFields({
//                             name: `${formattedWeaponName} 👥x${weapon.players_required}`,
//                             value: `\`\`\`gw ${formattedWeaponName.toLowerCase()}\`\`\``,
//                             inline: false
//                         });
                        
//                         currentPosition++;
//                     });

//                     // Add empty field for spacing between parties if not the last party
//                     if (index < composition.parties.length - 1) {
//                         embed.addFields({
//                             name: '\u200b',
//                             value: ' ',
//                             inline: false
//                         });
//                     }
//                 });

//                 // Add empty field before total composition
//                 embed.addFields({
//                     name: '\u200b',
//                     value: ' ',
//                     inline: false
//                 });

//                 // Add total players field
//                 embed.addFields({
//                     name: '📊 TOTAL COMPOSITION',
//                     value: `👥 **Total Players Required:** ${totalPlayersNeeded}`,
//                     inline: false
//                 });

//                 // Add empty field after total composition
//                 embed.addFields({
//                     name: '\u200b',
//                     value: ' ',
//                     inline: false
//                 });

//                 // Add fill queue command field
//                 embed.addFields({
//                     name: '👥 FILL QUEUE',
//                     value: 'Want to join as a fill player? Use:\n`gw fill`',
//                     inline: false
//                 });

//                 // Send the message with role ping and embed
//                 await interaction.deleteReply();
                
//                 const sentMessage = await interaction.channel.send({
//                     content: `${role}`,
//                     embeds: [embed]
//                 });

//                 compositionState.originalMessage = sentMessage;

//                 // Create a thread for the event
//                 const thread = await sentMessage.startThread({
//                     name: composition.title.substring(0, 100),
//                     autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
//                     reason: 'PvP Event Discussion Thread'
//                 });

//                 // Send tutorial message
//                 const tutorialEmbed = new EmbedBuilder()
//                     .setTitle('📖 How to Use This Composition')
//                     .setColor(0x00FF00)
//                     .setDescription([
//                         'Welcome to the PvP composition thread! Here\'s how to use it:',
//                         '',
//                         '**1. Joining a Role**',
//                         '• Use `gw <weapon_name>` to join a role',
//                         '• Example: `gw broadsword` or `gw holy staff`',
//                         '• The weapon name must match exactly as shown in the composition',
//                         '',
//                         '**2. Experience Check**',
//                         '• The system will check your recent PvP experience with the weapon',
//                         '• If you have recent experience, you\'ll be added as a regular player',
//                         '• If you don\'t have recent experience, you\'ll be added as a fill player',
//                         '',
//                         '**3. Fill Queue**',
//                         '• Use `gw fill` to join the fill queue',
//                         '• Your weapon experience will be displayed in the fill queue',
//                         '• Format: @User - CharacterName |||| Weapon1 (100x), Weapon2 (50x) (Role)',
//                         '• You can be replaced by more experienced players if spots are needed',
//                         '',
//                         '**4. Cancelling Your Role**',
//                         '• Use `gw cancel` to remove yourself from your current role',
//                         '• You can then join a different role if needed',
//                         '',
//                         '**5. Admin Controls**',
//                         '• Admins can use `gw cancel @user` to remove other players',
//                         '• Admins can use `gw <weapon_name> @user` to force-add players to specific weapons',
//                         '• Example: `gw wildfire staff @user` or `gw broadsword @user`',
//                         '',
//                         '**6. Free Roles**',
//                         '• Roles marked with 🔓 are free roles',
//                         '• These don\'t require experience checks',
//                         '• They can be filled even if the weapon is full',
//                         '',
//                         '**Need Help?**',
//                         '• Ask in this thread if you have questions',
//                         '• Make sure you\'re verified with `/register` before joining'
//                     ].join('\n'))
//                     .setFooter({ text: 'Good luck and have fun!' });

//                 await thread.send({ embeds: [tutorialEmbed] });

//                 // Store the composition state
//                 activeCompositions.set(thread.id, compositionState);

//                 // Add thread deletion handler
//                 thread.client.on('threadDelete', (deletedThread) => {
//                     if (deletedThread.id === thread.id) {
//                         cleanupComposition(deletedThread.id);
//                     }
//                 });

//                 // Add thread message collector with timeout
//                 const collector = thread.createMessageCollector({
//                     filter: (m) => {
//                         // More verbose debug logging
//                         console.log('Raw message event:', {
//                             content: m.content,
//                             cleanContent: m.cleanContent,
//                             type: m.type,
//                             system: m.system,
//                             author: {
//                                 tag: m.author.tag,
//                                 bot: m.author.bot,
//                                 id: m.author.id
//                             },
//                             channel: {
//                                 id: m.channel.id,
//                                 type: m.channel.type,
//                                 name: m.channel.name
//                             }
//                         });

//                         // Basic validation
//                         if (!m.content || typeof m.content !== 'string') {
//                             console.log('Message content invalid or empty');
//                             return false;
//                         }

//                         const isValidMessage = m.content.toLowerCase().trim().startsWith('gw ') && 
//                                             m.channel.id === thread.id && 
//                                             !m.author.bot;

//                         console.log('Message filter result:', {
//                             content: m.content,
//                             isValid: isValidMessage,
//                             checks: {
//                                 startsWithGw: m.content.toLowerCase().trim().startsWith('gw '),
//                                 correctChannel: m.channel.id === thread.id,
//                                 notBot: !m.author.bot
//                             }
//                         });

//                         return isValidMessage;
//                     },
//                     time: 24 * 60 * 60 * 1000 // 24 hours
//                 });

//                 // Log when collector is created
//                 console.log('Message collector created for thread:', {
//                     threadId: thread.id,
//                     threadName: thread.name,
//                     guildId: thread.guildId,
//                     channelType: thread.type,
//                     parentChannelId: thread.parentId
//                 });

//                 // Add collector state check every minute
//                 const collectorStateCheck = setInterval(() => {
//                     console.log('Collector state check:', {
//                         threadId: thread.id,
//                         isEnded: collector.ended,
//                         messageCount: collector.collected.size,
//                         endReason: collector.endReason || 'still running'
//                     });
//                 }, 60000);

//                 // Clean up interval on collector end
//                 collector.on('end', () => {
//                     clearInterval(collectorStateCheck);
//                 });

//                 collector.on('error', (error) => {
//                     console.error('Message collector error:', {
//                         error: error.message,
//                         stack: error.stack,
//                         threadId: thread.id
//                     });
//                 });

//                 collector.on('end', (collected, reason) => {
//                     clearInterval(collectorStateCheck);
                    
//                     if (reason === 'time') {
//                         cleanupComposition(thread.id);
//                         thread.send('This composition thread has expired. Please create a new one if needed.')
//                             .catch(error => console.error('Error sending expiration message:', error));
//                     }
                    
//                     // Cleanup regardless of reason
//                     const compositionState = activeCompositions.get(thread.id);
//                     if (compositionState) {
//                         cleanupComposition(thread.id);
//                     }
//                 });

//                 collector.on('collect', async (message) => {
//                     // Add debug logging at the start of message handling
//                     console.log('Message collected:', {
//                         content: message.content,
//                         author: message.author.tag,
//                         threadId: thread.id
//                     });

//                     try {
//                         const content = message.content.substring(3).trim().toLowerCase();
                        
//                         // Add debug logging for command parsing
//                         console.log('Command parsed:', {
//                             originalContent: message.content,
//                             parsedContent: content,
//                             threadId: thread.id
//                         });

//                         // Handle admin force-add command
//                         if (content.includes('@')) {
//                             const member = await message.guild.members.fetch(message.author.id);
//                             const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
//                             const isEventCreator = message.author.id === interaction.user.id;

//                             if (!isAdmin && !isEventCreator) {
//                                 await message.reply({
//                                     content: 'Only administrators or event creator can use this command.',
//                                     ephemeral: true
//                                 });
//                                 return;
//                             }

//                             // Split the command into weapon name and user mention
//                             const parts = content.split(' ');
//                             const mentionedUser = message.mentions.users.first();

//                             if (!mentionedUser) {
//                                 await message.reply({
//                                     content: 'Please mention a user to add to the weapon.',
//                                     ephemeral: true
//                                 });
//                                 return;
//                             }

//                             // Get weapon name by removing the mention from the content
//                             const weaponName = content.replace(`<@${mentionedUser.id}>`, '').trim().toLowerCase();

//                             const weapon = compositionState.weapons.get(weaponName);
//                             if (!weapon) {
//                                 await message.reply({
//                                     content: 'Invalid weapon name. Please use one of the available weapons.',
//                                     ephemeral: true
//                                 });
//                                 return;
//                             }

//                             const userId = mentionedUser.id;

//                             // Check if user is already participating
//                             let userPreviousWeapon = null;
//                             for (const [name, w] of compositionState.weapons.entries()) {
//                                 if (w.participants.has(userId)) {
//                                     userPreviousWeapon = name;
//                                     break;
//                                 }
//                             }

//                             // Check if user is in fill queue
//                             const isInFillQueue = compositionState.fillQueue?.has(userId);
//                             if (isInFillQueue) {
//                                 compositionState.fillQueue.delete(userId);
//                             }

//                             if (userPreviousWeapon) {
//                                 // Remove from previous weapon
//                                 const prevWeapon = compositionState.weapons.get(userPreviousWeapon);
//                                 prevWeapon.participants.delete(userId);
//                                 prevWeapon.remaining = Math.min(prevWeapon.required, prevWeapon.remaining + 1);
                                
//                                 // Remove from previous weapon's fill players if they were a fill
//                                 if (prevWeapon.fillPlayers?.has(userId)) {
//                                     prevWeapon.fillPlayers.delete(userId);
//                                     prevWeapon.fillCharacters.delete(userId);
//                                 }
//                             }

//                             // Add player to weapon
//                             weapon.participants.add(userId);
                            
//                             // Only decrease remaining count for non-free roles
//                             if (!weapon.isFreeRole) {
//                                 weapon.remaining--;
//                                 compositionState.remainingTotal--;
//                             }

//                             // Update the embed
//                             const updatedEmbed = new EmbedBuilder(embed.toJSON());
//                             let fieldIndex = 0;
//                             let currentParty = null;

//                             // First, find all party header indices
//                             const partyHeaderIndices = [];
//                             updatedEmbed.data.fields.forEach((field, index) => {
//                                 if (field.name.startsWith('🎯')) {
//                                     partyHeaderIndices.push(index);
//                                 }
//                             });

//                             // Group weapons by party
//                             const weaponsByParty = new Map();
//                             for (const [name, w] of compositionState.weapons.entries()) {
//                                 if (!weaponsByParty.has(w.partyName)) {
//                                     weaponsByParty.set(w.partyName, []);
//                                 }
//                                 weaponsByParty.get(w.partyName).push({ name, weapon: w });
//                             }

//                             // Update fields for each party
//                             for (const [partyName, weapons] of weaponsByParty.entries()) {
//                                 // Find the party header index
//                                 const partyHeaderIndex = partyHeaderIndices.find(index => 
//                                     updatedEmbed.data.fields[index].name === `🎯 ${partyName.toUpperCase()}`
//                                 );

//                                 if (partyHeaderIndex !== -1) {
//                                     fieldIndex = partyHeaderIndex + 1; // Start after the party header

//                                     // Sort weapons by their original position
//                                     weapons.sort((a, b) => a.weapon.position - b.weapon.position);

//                                     // Update each weapon field
//                                     for (const { name, weapon } of weapons) {
//                                         const participantsList = Array.from(weapon.participants)
//                                             .map(id => {
//                                                 const isFill = weapon.fillPlayers?.has(id);
//                                                 return `<@${id}>${isFill ? ' (fill)' : ''}`;
//                                             })
//                                             .join(', ');
                                        
//                                         const roleText = weapon.isFreeRole ? '🔓 Free Role' : '';
//                                         const formattedName = formatWeaponName(weapon.name);
//                                         updatedEmbed.spliceFields(fieldIndex, 1, {
//                                             name: `${formattedName} 👥${weapon.remaining}/${weapon.required}`,
//                                             value: `${participantsList ? `${participantsList}\n` : ''}\`\`\`gw ${name.toLowerCase()}\`\`\``,
//                                             inline: false
//                                         });
//                                         fieldIndex++;
//                                     }

//                                     // Add empty field for spacing between parties if not the last party
//                                     if (partyName !== Array.from(weaponsByParty.keys()).pop()) {
//                                         updatedEmbed.spliceFields(fieldIndex, 1, {
//                                             name: '\u200b',
//                                             value: ' ',
//                                             inline: false
//                                         });
//                                         fieldIndex++;
//                                     }
//                                 }
//                             }

//                             // Update total count
//                             const totalField = updatedEmbed.data.fields.findIndex(f => f.name === '📊 TOTAL COMPOSITION');
//                             if (totalField !== -1) {
//                                 // Calculate actual remaining players
//                                 let actualRemaining = compositionState.totalRequired;
//                                 let totalFillPlayers = 0;
//                                 let totalParticipants = 0;

//                                 for (const [name, w] of compositionState.weapons.entries()) {
//                                     if (!w.isFreeRole) {
//                                         actualRemaining -= (w.required - w.remaining);
//                                         // Count fill players
//                                         const fillCount = w.fillPlayers ? w.fillPlayers.size : 0;
//                                         totalFillPlayers += fillCount;
//                                         // Count total participants
//                                         totalParticipants += w.participants.size;
//                                     }
//                                 }
//                                 compositionState.remainingTotal = actualRemaining;

//                                 // Calculate fill percentage
//                                 const fillPercentage = totalParticipants > 0 
//                                     ? Math.round((totalFillPlayers / totalParticipants) * 100) 
//                                     : 0;

//                                 updatedEmbed.spliceFields(totalField, 1, {
//                                     name: '📊 TOTAL COMPOSITION',
//                                     value: `👥 **Total Players Required:** ${actualRemaining}/${compositionState.totalRequired} ${totalParticipants > 0 ? `📈 ${fillPercentage}% fill` : ''}`,
//                                     inline: false
//                                 });
//                             }

//                             // Add fill queue section
//                             updateEmbedWithFillQueue(updatedEmbed, compositionState);

//                             // Update the original message with the new embed
//                             await sentMessage.edit({ embeds: [updatedEmbed] });
//                             compositionState.embed = updatedEmbed;

//                             // Send confirmation message
//                             await message.reply({
//                                 content: `${mentionedUser} has been added to ${weapon.name} by an administrator.`,
//                                 ephemeral: true
//                             });
//                             return;
//                         }

//                         // Handle cancel command
//                         if (content.startsWith('cancel')) {
//                             const userId = message.author.id;
//                             const member = await message.guild.members.fetch(userId);
//                             const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
//                             const isEventCreator = userId === interaction.user.id;

//                             // Check if admin is trying to cancel someone else
//                             let targetUserId = userId;
//                             if (isAdmin || isEventCreator) {
//                                 const mentionedUser = message.mentions.users.first();
//                                 if (mentionedUser) {
//                                     targetUserId = mentionedUser.id;
//                                 }
//                             }

//                             // Find which weapon the target user is in
//                             let userWeapon = null;
//                             for (const [name, w] of compositionState.weapons.entries()) {
//                                 if (w.participants.has(targetUserId)) {
//                                     userWeapon = w;
//                                     break;
//                                 }
//                             }

//                             if (!userWeapon) {
//                                 await message.reply({
//                                     content: targetUserId === userId ? 'You are not registered in any weapon.' : 'This user is not registered in any weapon.',
//                                     ephemeral: true
//                                 });
//                                 return;
//                             }

//                             // Remove from weapon
//                             userWeapon.participants.delete(targetUserId);
//                             userWeapon.remaining = Math.min(userWeapon.required, userWeapon.remaining + 1);
                            
//                             // Remove from fill players if they were a fill
//                             if (userWeapon.fillPlayers?.has(targetUserId)) {
//                                 userWeapon.fillPlayers.delete(targetUserId);
//                                 userWeapon.fillCharacters.delete(targetUserId);
//                             }

//                             // Update total count
//                             compositionState.remainingTotal++;

//                             // Update the embed
//                             const updatedEmbed = new EmbedBuilder(embed.toJSON());
//                             let fieldIndex = 0;
//                             let currentParty = null;

//                             // First, find all party header indices
//                             const partyHeaderIndices = [];
//                             updatedEmbed.data.fields.forEach((field, index) => {
//                                 if (field.name.startsWith('🎯')) {
//                                     partyHeaderIndices.push(index);
//                                 }
//                             });

//                             // Group weapons by party
//                             const weaponsByParty = new Map();
//                             for (const [name, w] of compositionState.weapons.entries()) {
//                                 if (!weaponsByParty.has(w.partyName)) {
//                                     weaponsByParty.set(w.partyName, []);
//                                 }
//                                 weaponsByParty.get(w.partyName).push({ name, weapon: w });
//                             }

//                             // Update fields for each party
//                             for (const [partyName, weapons] of weaponsByParty.entries()) {
//                                 // Find the party header index
//                                 const partyHeaderIndex = partyHeaderIndices.find(index => 
//                                     updatedEmbed.data.fields[index].name === `🎯 ${partyName.toUpperCase()}`
//                                 );

//                                 if (partyHeaderIndex !== -1) {
//                                     fieldIndex = partyHeaderIndex + 1; // Start after the party header

//                                     // Sort weapons by their original position
//                                     weapons.sort((a, b) => a.weapon.position - b.weapon.position);

//                                     // Update each weapon field
//                                     for (const { name, weapon } of weapons) {
//                                         const participantsList = Array.from(weapon.participants)
//                                             .map(id => {
//                                                 const isFill = weapon.fillPlayers?.has(id);
//                                                 return `<@${id}>${isFill ? ' (fill)' : ''}`;
//                                             })
//                                             .join(', ');
                                        
//                                         const roleText = weapon.isFreeRole ? '🔓 Free Role' : '';
//                                         const formattedName = formatWeaponName(weapon.name);
//                                         updatedEmbed.spliceFields(fieldIndex, 1, {
//                                             name: `${formattedName} 👥${weapon.remaining}/${weapon.required}`,
//                                             value: `${participantsList ? `${participantsList}\n` : ''}\`\`\`gw ${name.toLowerCase()}\`\`\``,
//                                             inline: false
//                                         });
//                                         fieldIndex++;
//                                     }

//                                     // Add empty field for spacing between parties if not the last party
//                                     if (partyName !== Array.from(weaponsByParty.keys()).pop()) {
//                                         updatedEmbed.spliceFields(fieldIndex, 1, {
//                                             name: '\u200b',
//                                             value: ' ',
//                                             inline: false
//                                         });
//                                         fieldIndex++;
//                                     }
//                                 }
//                             }

//                             // Update total count
//                             const totalField = updatedEmbed.data.fields.findIndex(f => f.name === '📊 TOTAL COMPOSITION');
//                             if (totalField !== -1) {
//                                 // Calculate actual remaining players
//                                 let actualRemaining = compositionState.totalRequired;
//                                 for (const [name, w] of compositionState.weapons.entries()) {
//                                     if (!w.isFreeRole) {
//                                         actualRemaining -= (w.required - w.remaining);
//                                     }
//                                 }
//                                 compositionState.remainingTotal = actualRemaining;

//                                 updatedEmbed.spliceFields(totalField, 1, {
//                                     name: '📊 TOTAL COMPOSITION',
//                                     value: `👥 **Total Players Required:** ${actualRemaining}/${compositionState.totalRequired}`,
//                                     inline: false
//                                 });
//                             }

//                             // Add fill queue section
//                             updateEmbedWithFillQueue(updatedEmbed, compositionState);

//                             // Update the original message with the new embed
//                             await sentMessage.edit({ embeds: [updatedEmbed] });
//                             compositionState.embed = updatedEmbed;

//                             // Send confirmation message
//                             const targetUser = await message.guild.members.fetch(targetUserId);
//                             await message.reply({
//                                 content: targetUserId === userId 
//                                     ? `You have been removed from ${userWeapon.name}`
//                                     : `${targetUser} has been removed from ${userWeapon.name}`,
//                                 ephemeral: true
//                             });
//                             return;
//                         }

//                         // Handle fill queue command
//                         if (content === 'fill') {
//                             const userId = message.author.id;

//                             // Check if user is already in fill queue
//                             let isAlreadyFill = false;
//                             for (const [name, w] of compositionState.weapons.entries()) {
//                                 if (w.fillPlayers?.has(userId)) {
//                                     isAlreadyFill = true;
//                                     break;
//                                 }
//                             }

//                             if (isAlreadyFill) {
//                                 await message.reply({
//                                     content: 'You are already in the fill queue!',
//                                     ephemeral: true
//                                 });
//                                 return;
//                             }

//                             // Check if user is verified
//                             const verifiedCharacter = await getVerifiedCharacter(message.author.id, message.guild.id);
//                             if (!verifiedCharacter) {
//                                 await message.reply({
//                                     content: `You need to register your Albion character first using the \`/register\` command.`,
//                                     ephemeral: true
//                                 });
//                                 return;
//                             }

//                             // Get user's weapon experience
//                             try {
//                                 const experience = await checkWeaponExperience(verifiedCharacter, 'any');
                                
//                                 // Create weapon experience text for embed
//                                 let weaponExperienceText = '';
//                                 const allWeapons = new Map(); // Use Map to track unique weapons
                                
//                                 // Add recent weapons first (they take priority)
//                                 if (experience.topRecentWeapons?.length > 0) {
//                                     experience.topRecentWeapons
//                                         .filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0)
//                                         .slice(0, 3)
//                                         .forEach(w => {
//                                             allWeapons.set(w.weapon_name.toLowerCase(), {
//                                                 name: w.weapon_name,
//                                                 usages: w.usages,
//                                                 isRecent: true
//                                             });
//                                         });
//                                 }
                                
//                                 // Add all-time weapons and combine usages if weapon exists
//                                 if (experience.topAllTimeWeapons?.length > 0) {
//                                     experience.topAllTimeWeapons
//                                         .filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0)
//                                         .slice(0, 3)
//                                         .forEach(w => {
//                                             const existingWeapon = allWeapons.get(w.weapon_name.toLowerCase());
//                                             if (existingWeapon) {
//                                                 // If weapon exists, use the all-time usages (total)
//                                                 existingWeapon.usages = w.usages;
//                                                 existingWeapon.isRecent = false;
//                                             } else {
//                                                 // If weapon doesn't exist, add it
//                                                 allWeapons.set(w.weapon_name.toLowerCase(), {
//                                                     name: w.weapon_name,
//                                                     usages: w.usages,
//                                                     isRecent: false
//                                                 });
//                                             }
//                                         });
//                                 }

//                                 // Convert Map to array and sort by usages
//                                 const sortedWeapons = Array.from(allWeapons.values())
//                                     .sort((a, b) => b.usages - a.usages)
//                                     .slice(0, 6); // Take top 6 weapons

//                                 // Format the weapons text
//                                 weaponExperienceText = sortedWeapons
//                                     .map(w => `${w.name} (${w.usages}x)`)
//                                     .join(', ');

//                                 // Add to fill queue with experience
//                                 const fillQueue = compositionState.fillQueue || new Map();
//                                 fillQueue.set(userId, {
//                                     character: verifiedCharacter,
//                                     experience: weaponExperienceText
//                                 });
//                                 compositionState.fillQueue = fillQueue;

//                                 // Update the embed
//                                 const updatedEmbed = new EmbedBuilder(embed.toJSON());
//                                 updateEmbedWithFillQueue(updatedEmbed, compositionState);

//                                 // Update the original message with the new embed
//                                 await sentMessage.edit({ embeds: [updatedEmbed] });
//                                 compositionState.embed = updatedEmbed;

//                                 // Send confirmation message
//                                 await message.reply({
//                                     content: 'You have been added to the fill queue! You will be considered for any role that needs fill players.',
//                                     ephemeral: true
//                                 });
//                                 return;
//                             } catch (error) {
//                                 console.error('Error checking weapon experience:', error);
//                                 await message.reply({
//                                     content: 'There was an error checking your weapon experience. Please try again.',
//                                     ephemeral: true
//                                 });
//                                 return;
//                             }
//                         }

//                         // Check if user has the required role
//                         const member = await message.guild.members.fetch(message.author.id);
//                         if (!member.roles.cache.has(role.id)) {
//                             await message.reply({
//                                 content: `You need the ${role} role to join this composition.`,
//                                 ephemeral: true
//                             });
//                             return;
//                         }

//                         // Check if user is verified
//                         const verifiedCharacter = await getVerifiedCharacter(message.author.id, message.guild.id);
//                         console.log('Verified character result:', {
//                             discordId: message.author.id,
//                             username: message.author.username,
//                             character: verifiedCharacter,
//                             guildId: message.guild.id
//                         });

//                         if (!verifiedCharacter) {
//                             await message.reply({
//                                 content: `You need to verify or register your Albion character first using the \`/verify\` or \`/register\` command.`,
//                                 ephemeral: true
//                             });
//                             return;
//                         }

//                         const weaponName = message.content.substring(3).trim().toLowerCase();
//                         const weapon = compositionState.weapons.get(weaponName);

//                         if (!weapon) {
//                             await message.reply({
//                                 content: 'Invalid weapon name. Please use one of the available weapons.',
//                                 ephemeral: true
//                             });
//                             return;
//                         }

//                         const userId = message.author.id;

//                         // Check if user is already participating
//                         let userPreviousWeapon = null;
//                         for (const [name, w] of compositionState.weapons.entries()) {
//                             if (w.participants.has(userId)) {
//                                 userPreviousWeapon = name;
//                                 break;
//                             }
//                         }

//                         // Check if user is in fill queue
//                         const isInFillQueue = compositionState.fillQueue?.has(userId);
//                         if (isInFillQueue) {
//                             compositionState.fillQueue.delete(userId);
//                         }

//                         if (userPreviousWeapon) {
//                             // Remove from previous weapon
//                             const prevWeapon = compositionState.weapons.get(userPreviousWeapon);
//                             prevWeapon.participants.delete(userId);
//                             prevWeapon.remaining = Math.min(prevWeapon.required, prevWeapon.remaining + 1);
                            
//                             // Remove from previous weapon's fill players if they were a fill
//                             if (prevWeapon.fillPlayers?.has(userId)) {
//                                 prevWeapon.fillPlayers.delete(userId);
//                                 prevWeapon.fillCharacters.delete(userId);
//                             }
                            
//                             // Send feedback message
//                             await message.reply({
//                                 content: `You were moved from ${prevWeapon.name} to ${weapon.name}`,
//                                 ephemeral: true
//                             });
//                         }

//                         // Skip experience check for free roles
//                         let experience = null;
//                         if (!weapon.isFreeRole) {
//                             try {
//                                 experience = await checkWeaponExperience(verifiedCharacter, weapon.name);
                                
//                                 if (!experience.hasExperience) {
//                                     let responseMessage = `⚠️ Warning: You don't have recent experience with ${weapon.name}.\n\n`;
                                    
//                                     // Add recent weapons experience
//                                     if (experience.topRecentWeapons?.filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0).length > 0) {
//                                         responseMessage += '**Your Recent Weapons (Last 30 days):**\n';
//                                         experience.topRecentWeapons
//                                             .filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0)
//                                             .forEach(w => {
//                                                 responseMessage += `• ${w.weapon_name}: ${w.usages} uses\n`;
//                                             });
//                                         responseMessage += '\n';
//                                     } else {
//                                         responseMessage += '**No Recent PvP Activity (Last 30 days)**\n\n';
//                                     }

//                                     // Add all-time weapons experience
//                                     if (experience.topAllTimeWeapons?.filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0).length > 0) {
//                                         responseMessage += '**Your All-Time Top Weapons:**\n';
//                                         experience.topAllTimeWeapons
//                                             .filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0)
//                                             .forEach(w => {
//                                                 responseMessage += `• ${w.weapon_name}: ${w.usages} uses\n`;
//                                             });
//                                         responseMessage += '\n';
//                                     } else {
//                                         responseMessage += '**No All-Time PvP Records Found**\n\n';
//                                     }
                                    
//                                     responseMessage += 'You will be marked as a fill player.';
                                    
//                                     await message.reply({
//                                         content: responseMessage,
//                                         ephemeral: true
//                                     });
//                                 }
//                             } catch (error) {
//                                 console.error('Error checking weapon experience:', error);
//                                 await message.reply({
//                                     content: 'There was an error checking your weapon experience. Please try again.',
//                                     ephemeral: true
//                                 });
//                                 return;
//                             }
//                         }

//                         // Add to new weapon if spots available or it's a free role
//                         if (weapon.remaining > 0 || weapon.isFreeRole) {
//                             // Initialize fill players set if it doesn't exist
//                             if (!weapon.fillPlayers) {
//                                 weapon.fillPlayers = new Set();
//                                 weapon.fillCharacters = new Map();
//                             }

//                             // Check if weapon is full with regular players (skip for free roles)
//                             if (!weapon.isFreeRole && isWeaponFullWithRegulars(weapon)) {
//                                 await message.reply({
//                                     content: `This weapon is full with regular players.`,
//                                     ephemeral: true
//                                 });
//                                 return;
//                             }

//                             // If weapon is full but has fill players, check experience (skip for free roles)
//                             if (!weapon.isFreeRole && weapon.participants.size >= weapon.required) {
//                                 try {
//                                     experience = await checkWeaponExperience(verifiedCharacter, weapon.name);
                                    
//                                     if (experience.hasExperience) {
//                                         // Remove a fill player and add the experienced player
//                                         const fillPlayers = Array.from(weapon.participants)
//                                             .filter(id => weapon.fillPlayers.has(id));
                                        
//                                         if (fillPlayers.length > 0) {
//                                             const removedFillPlayer = fillPlayers[0];
//                                             weapon.participants.delete(removedFillPlayer);
//                                             // Don't remove from fillPlayers or fillCharacters
//                                             // This way they stay in the fill queue even if removed from the weapon
                                            
//                                             // Send message to removed fill player
//                                             try {
//                                                 // Get removed player's experience
//                                                 const removedPlayerCharacter = weapon.fillCharacters.get(removedFillPlayer);
//                                                 if (removedPlayerCharacter) {
//                                                     const experience = await checkWeaponExperience(removedPlayerCharacter, 'any');
                                                    
//                                                     // Create weapon experience message
//                                                     let experienceMessage = '';
//                                                     if (experience.topRecentWeapons?.length > 0 || experience.topAllTimeWeapons?.length > 0) {
//                                                         experienceMessage = '\n\n**Your Weapon Experience:**\n';
                                                        
//                                                         // Add recent weapons (up to 3)
//                                                         if (experience.topRecentWeapons?.length > 0) {
//                                                             experienceMessage += '**Recent (30 days):**\n';
//                                                             experience.topRecentWeapons.slice(0, 3).forEach(w => {
//                                                                 experienceMessage += `• ${w.weapon_name}: ${w.usages} uses\n`;
//                                                             });
//                                                         }
                                                        
//                                                         // Add all-time weapons (up to 3)
//                                                         if (experience.topAllTimeWeapons?.length > 0) {
//                                                             experienceMessage += '**All-Time:**\n';
//                                                             experience.topAllTimeWeapons.slice(0, 3).forEach(w => {
//                                                                 experienceMessage += `• ${w.weapon_name}: ${w.usages} uses\n`;
//                                                             });
//                                                         }
//                                                     }

//                                                     await message.channel.send({
//                                                         content: `<@${removedFillPlayer}> You have been moved to the fill queue as a more experienced player has joined.${experienceMessage}`,
//                                                         ephemeral: true
//                                                     });
//                                                 }
//                                             } catch (error) {
//                                                 console.error('Error sending fill queue message:', error);
//                                             }
//                                         }
//                                     } else {
//                                         // Add to fill queue
//                                         weapon.fillPlayers.add(userId);
//                                         weapon.fillCharacters.set(userId, verifiedCharacter);
//                                         await message.reply({
//                                             content: `This weapon is full. You have been added to the fill queue.`,
//                                             ephemeral: true
//                                         });
//                                         return;
//                                     }
//                                 } catch (error) {
//                                     console.error('Error checking weapon experience:', error);
//                                     await message.reply({
//                                         content: 'There was an error checking your weapon experience. Please try again.',
//                                         ephemeral: true
//                                     });
//                                     return;
//                                 }
//                             }

//                             // Add player to weapon
//                             weapon.participants.add(userId);
                            
//                             // Add to fill players if they don't have experience (skip for free roles)
//                             if (!weapon.isFreeRole && experience && !experience.hasExperience) {
//                                 weapon.fillPlayers.add(userId);
//                                 weapon.fillCharacters.set(userId, verifiedCharacter);
//                             }

//                             // Only decrease remaining count for non-free roles
//                             if (!weapon.isFreeRole) {
//                                 weapon.remaining--;
//                                 compositionState.remainingTotal--;
//                             }

//                             if (!userPreviousWeapon) {
//                                 // Send feedback message for new assignment
//                                 await message.reply({
//                                     content: `You joined as ${weapon.name}`,
//                                     ephemeral: true
//                                 });
//                             }

//                             // Update the embed
//                             const updatedEmbed = new EmbedBuilder(embed.toJSON());
//                             let fieldIndex = 0;
//                             let currentParty = null;

//                             // First, find all party header indices
//                             const partyHeaderIndices = [];
//                             updatedEmbed.data.fields.forEach((field, index) => {
//                                 if (field.name.startsWith('🎯')) {
//                                     partyHeaderIndices.push(index);
//                                 }
//                             });

//                             // Group weapons by party
//                             const weaponsByParty = new Map();
//                             for (const [name, w] of compositionState.weapons.entries()) {
//                                 if (!weaponsByParty.has(w.partyName)) {
//                                     weaponsByParty.set(w.partyName, []);
//                                 }
//                                 weaponsByParty.get(w.partyName).push({ name, weapon: w });
//                             }

//                             // Update fields for each party
//                             for (const [partyName, weapons] of weaponsByParty.entries()) {
//                                 // Find the party header index
//                                 const partyHeaderIndex = partyHeaderIndices.find(index => 
//                                     updatedEmbed.data.fields[index].name === `🎯 ${partyName.toUpperCase()}`
//                                 );

//                                 if (partyHeaderIndex !== -1) {
//                                     fieldIndex = partyHeaderIndex + 1; // Start after the party header

//                                     // Sort weapons by their original position
//                                     weapons.sort((a, b) => a.weapon.position - b.weapon.position);

//                                     // Update each weapon field
//                                     for (const { name, weapon } of weapons) {
//                                         const participantsList = Array.from(weapon.participants)
//                                             .map(id => {
//                                                 const isFill = weapon.fillPlayers?.has(id);
//                                                 return `<@${id}>${isFill ? ' (fill)' : ''}`;
//                                             })
//                                             .join(', ');
                                        
//                                         const roleText = weapon.isFreeRole ? '🔓 Free Role' : '';
//                                         const formattedName = formatWeaponName(weapon.name);
//                                         updatedEmbed.spliceFields(fieldIndex, 1, {
//                                             name: `${formattedName} 👥${weapon.remaining}/${weapon.required}`,
//                                             value: `${participantsList ? `${participantsList}\n` : ''}\`\`\`gw ${name.toLowerCase()}\`\`\``,
//                                             inline: false
//                                         });
//                                         fieldIndex++;
//                                     }

//                                     // Add empty field for spacing between parties if not the last party
//                                     if (partyName !== Array.from(weaponsByParty.keys()).pop()) {
//                                         updatedEmbed.spliceFields(fieldIndex, 1, {
//                                             name: '\u200b',
//                                             value: ' ',
//                                             inline: false
//                                         });
//                                         fieldIndex++;
//                                     }
//                                 }
//                             }

//                             // Update total count
//                             const totalField = updatedEmbed.data.fields.findIndex(f => f.name === '📊 TOTAL COMPOSITION');
//                             if (totalField !== -1) {
//                                 // Calculate actual remaining players
//                                 let actualRemaining = compositionState.totalRequired;
//                                 let totalFillPlayers = 0;
//                                 let totalParticipants = 0;

//                                 for (const [name, w] of compositionState.weapons.entries()) {
//                                     if (!w.isFreeRole) {
//                                         actualRemaining -= (w.required - w.remaining);
//                                         // Count fill players
//                                         const fillCount = w.fillPlayers ? w.fillPlayers.size : 0;
//                                         totalFillPlayers += fillCount;
//                                         // Count total participants
//                                         totalParticipants += w.participants.size;
//                                     }
//                                 }
//                                 compositionState.remainingTotal = actualRemaining;

//                                 // Calculate fill percentage
//                                 const fillPercentage = totalParticipants > 0 
//                                     ? Math.round((totalFillPlayers / totalParticipants) * 100) 
//                                     : 0;

//                                 updatedEmbed.spliceFields(totalField, 1, {
//                                     name: '📊 TOTAL COMPOSITION',
//                                     value: `👥 **Total Players Required:** ${actualRemaining}/${compositionState.totalRequired} ${totalParticipants > 0 ? `📈 ${fillPercentage}% fill` : ''}`,
//                                     inline: false
//                                 });
//                             }

//                             // Add fill queue section
//                             updateEmbedWithFillQueue(updatedEmbed, compositionState);

//                             // Update the original message with the new embed
//                             await sentMessage.edit({ embeds: [updatedEmbed] });
//                             compositionState.embed = updatedEmbed;

//                             // Send a confirmation message that's only visible to the user
//                             await message.reply({ 
//                                 content: 'Composition updated!',
//                                 ephemeral: true 
//                             });
//                             return;
//                         }
//                     } catch (error) {
//                         console.error('Error handling message:', error);
//                         await message.reply({
//                             content: 'There was an error handling your message. Please try again later.',
//                             ephemeral: true
//                         });
//                     }
//                 });
//             } catch (error) {
//                 console.error('Error executing command:', error);
//                 await handleError(error, interaction);
//             }
//         } catch (error) {
//             console.error('Error executing command:', error);
//             await handleError(error, interaction);
//         }
//     }
// });