const prisma = require('../config/prisma');
const axios = require('axios');
const { updateBattleLogChannelName } = require('../utils/battleStats');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const FuzzySet = require('fuzzyset.js');

// Helper function to add delay between API calls
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to normalize guild names for better matching
function normalizeGuildName(name) {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-z0-9]/g, ''); // Remove special chars and spaces
}

// Helper function to check if two battles should be merged
function shouldMergeBattles(battle1, battle2, normalizedEnemyGuilds) {
    // Check time difference (less than 1 hour)
    const time1 = new Date(battle1.startedAt);
    const time2 = new Date(battle2.startedAt);
    const timeDiffMinutes = Math.abs(time1 - time2) / (1000 * 60);
    
    if (timeDiffMinutes > 60) return false;

    // Create fuzzy sets for both battles' enemy guilds
    const fuzzySet = FuzzySet(normalizedEnemyGuilds, false);
    
    // Get enemy guilds from both battles
    const enemies1 = battle1.guilds.map(g => normalizeGuildName(g.name));
    const enemies2 = battle2.guilds.map(g => normalizeGuildName(g.name));
    
    // Check if there's at least one matching enemy guild
    let hasMatchingEnemy = false;
    for (const enemy of enemies1) {
        const matches = fuzzySet.get(enemy);
        if (matches && matches[0][0] > 0.6) {
            hasMatchingEnemy = true;
            break;
        }
    }
    for (const enemy of enemies2) {
        const matches = fuzzySet.get(enemy);
        if (matches && matches[0][0] > 0.6) {
            hasMatchingEnemy = true;
            break;
        }
    }
    
    return hasMatchingEnemy;
}

// Helper function to send notification to admin
async function notifyAdmin(client, results, guildId = null) {
    try {
        // If no guild ID provided, just log to console
        if (!guildId) {
            console.log('Battle Sync Process Summary:', {
                targetDate: results.targetDate || 'N/A',
                guildsProcessed: results.guildsProcessed || 0,
                battlesFound: results.battlesFound || 0,
                battlesRegistered: results.battlesRegistered || 0,
                errors: results.errors || 0
            });
            return;
        }

        // Get guild settings to find the log channel
        const guildSettings = await prisma.guildSettings.findUnique({
            where: { guildId: guildId }
        });

        if (!guildSettings?.battlelogChannelId) {
            console.log('No battle log channel configured for notifications');
            return;
        }

        try {
            const guild = await client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(guildSettings.battlelogChannelId);

            if (!channel) {
                console.log('Could not find battle log channel');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('🔄 Battle Sync Process Report')
                .setDescription([
                    '**Process Summary:**',
                    `• Target Date: ${results.targetDate || 'N/A'}`,
                    `• Guilds Processed: ${results.guildsProcessed || 0}`,
                    `• Battles Found: ${results.battlesFound || 0}`,
                    `• Battles Registered: ${results.battlesRegistered || 0}`,
                    `• Errors Encountered: ${results.errors || 0}`,
                    '',
                    'For detailed logs, please check the application logs.'
                ].join('\n'))
                .setColor(results.errors > 0 ? '#FFA500' : '#00FF00')
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending channel notification:', error);
        }
    } catch (error) {
        console.error('Error in notifyAdmin:', error);
    }
}

async function syncAlbionBattlesByDate(providedClient = null, targetDate = null, guildId = null) {
    let client = providedClient;
    let temporaryClient = null;
    const results = {
        targetDate: targetDate,
        guildsProcessed: 0,
        battlesFound: 0,
        battlesRegistered: 0,
        errors: 0
    };

    try {
        // Validate date format
        if (!targetDate || !/^\d{1,2}\/\d{1,2}$/.test(targetDate)) {
            throw new Error('Invalid date format. Please use MM/DD format.');
        }

        // Parse the target date
        const [month, day] = targetDate.split('/').map(num => parseInt(num));
        const currentDate = new Date();
        const targetDateTime = new Date(Date.UTC(currentDate.getUTCFullYear(), month - 1, day));

        // If target date is in the future for this year, use last year
        if (targetDateTime > currentDate) {
            targetDateTime.setUTCFullYear(currentDate.getUTCFullYear() - 1);
        }

        // Validate date
        if (isNaN(targetDateTime.getTime())) {
            throw new Error('Invalid date provided');
        }

        console.log(`Target date set to: ${targetDateTime.toISOString()}`);

        // If no client provided, create a temporary one for the cron job
        if (!client) {
            temporaryClient = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages
                ]
            });
            await temporaryClient.login(process.env.DISCORD_TOKEN);
            client = temporaryClient;
        }

        console.log(`Starting Albion battle sync process for date: ${targetDate}...`);

        // Get guilds to sync - either specific guild or all enabled guilds
        const whereClause = guildId ? 
            { guildId: guildId } : 
            { syncAlbionBattles: true, albionGuildId: { not: null } };

        const guildsToSync = await prisma.guildSettings.findMany({
            where: whereClause
        });

        if (guildsToSync.length === 0) {
            console.log('No guilds found to sync battles for');
            await notifyAdmin(client, results, guildId);
            return;
        }

        console.log(`Found ${guildsToSync.length} guilds to sync battles for`);

        for (const guildSettings of guildsToSync) {
            try {
                results.guildsProcessed++;
                console.log(`Processing guild: ${guildSettings.guildName} (${guildSettings.albionGuildId})`);

                // Get guild info to get the guild name
                console.log(`Fetching guild info for ID: ${guildSettings.albionGuildId}`);
                const guildResponse = await axios.get(`https://api.albionbb.com/us/stats/guilds/${guildSettings.albionGuildId}?minPlayers=2`);
                if (!Array.isArray(guildResponse.data) || guildResponse.data.length === 0) {
                    console.log(`No data found for guild ID: ${guildSettings.albionGuildId}`);
                    continue;
                }

                const guildName = guildResponse.data[0].guildName;
                console.log(`Found guild name: ${guildName}`);

                let page = 1;
                let foundTargetDay = false;
                let processedBattles = new Set();

                while (!foundTargetDay) {
                    // Get battles from API
                    console.log(`Fetching battles page ${page} for guild ${guildName}...`);
                    const battlesResponse = await axios.get(`https://api.albionbb.com/us/battles?guildId=${guildSettings.albionGuildId}&minPlayers=20&page=${page}`);
                    if (!Array.isArray(battlesResponse.data) || battlesResponse.data.length === 0) {
                        console.log('No battles found in this page or invalid response');
                        break;
                    }

                    const battles = battlesResponse.data;
                    console.log(`Found ${battles.length} battles in page ${page}`);

                    // Process each battle
                    for (const battle of battles) {
                        const battleTime = new Date(battle.startedAt);
                        console.log(`\nAnalyzing battle ${battle.albionId} from ${battleTime.toISOString()}`);
                        
                        // Check if battle is before target date
                        if (battleTime < targetDateTime) {
                            console.log('Battle is before target date, stopping search');
                            foundTargetDay = true;
                            break;
                        }

                        // Skip if we've already processed this battle
                        if (processedBattles.has(battle.albionId)) {
                            console.log('Battle already processed, skipping');
                            continue;
                        }

                        // Check if our guild has enough players
                        const ourGuildInBattle = battle.guilds.find(g => g.name === guildName);
                        if (!ourGuildInBattle || ourGuildInBattle.players < 10) {
                            console.log(`Battle skipped - not enough players from our guild (${ourGuildInBattle?.players || 0} players)`);
                            continue;
                        }

                        // Get enemy guilds for this battle
                        const enemyGuilds = battle.guilds
                            .filter(g => g.name !== guildName)
                            .map(g => g.name);
                        const normalizedEnemyGuilds = enemyGuilds.map(normalizeGuildName);

                        // Look for related battles in the same page
                        let relatedBattles = [battle];
                        for (const otherBattle of battles) {
                            if (otherBattle.albionId !== battle.albionId && !processedBattles.has(otherBattle.albionId)) {
                                if (shouldMergeBattles(battle, otherBattle, normalizedEnemyGuilds)) {
                                    relatedBattles.push(otherBattle);
                                    processedBattles.add(otherBattle.albionId);
                                }
                            }
                        }

                        // Add delay to avoid rate limiting
                        await delay(1000);

                        // Get battle details for all related battles
                        console.log('Fetching battle details...');
                        const battleIds = relatedBattles.map(b => b.albionId).join(',');
                        const detailsResponse = await axios.get(`https://api.albionbb.com/us/battles/kills?ids=${battleIds}`);
                        const battleEvents = detailsResponse.data;

                        if (!Array.isArray(battleEvents)) {
                            console.log(`Invalid battle details for battles ${battleIds}`);
                            continue;
                        }
                        console.log(`Retrieved ${battleEvents.length} kill events for ${relatedBattles.length} related battles`);

                        // Calculate combined kills and deaths
                        const stats = battleEvents.reduce((acc, event) => {
                            if (event.Killer.GuildName === guildName) {
                                acc.kills++;
                                console.log(`Kill by ${event.Killer.Name} (${event.Killer.GuildName})`);
                            }
                            if (event.Victim.GuildName === guildName) {
                                acc.deaths++;
                                console.log(`Death of ${event.Victim.Name} (${event.Victim.GuildName})`);
                            }
                            return acc;
                        }, { kills: 0, deaths: 0 });

                        console.log(`Combined battle stats - Kills: ${stats.kills}, Deaths: ${stats.deaths}`);

                        // Only process battles where our guild had significant participation (4+ kills OR 4+ deaths)
                        if (stats.kills >= 4 || stats.deaths >= 4) {
                            results.battlesFound++;
                            console.log(`Battle meets criteria (4+ kills or deaths)`);

                            // Get all unique enemy guilds from related battles
                            const allEnemyGuilds = [...new Set(
                                relatedBattles.flatMap(b => 
                                    b.guilds
                                        .filter(g => g.name !== guildName)
                                        .map(g => g.name)
                                )
                            )];
                            console.log('Enemy guilds:', allEnemyGuilds);

                            // Create battle URL based on number of related battles
                            const battleUrl = relatedBattles.length > 1 
                                ? `https://albionbb.com/battles/multi?ids=${battleIds}`
                                : `https://albionbb.com/battle/${battle.albionId}`;

                            // Check if battle is already registered
                            console.log('Checking if battle is already registered...');
                            const existingBattle = await prisma.battleRegistration.findFirst({
                                where: {
                                    guildId: guildSettings.guildId,
                                    battleUrl: battleUrl
                                }
                            });

                            if (!existingBattle) {
                                try {
                                    console.log('Registering new battle...');
                                    // Register the battle
                                    const battleData = {
                                        userId: client.user.id,
                                        guildId: guildSettings.guildId,
                                        battleTime: battleTime,
                                        enemyGuilds: allEnemyGuilds,
                                        isVictory: stats.kills > stats.deaths,
                                        kills: stats.kills,
                                        deaths: stats.deaths,
                                        battleUrl: battleUrl
                                    };
                                    console.log('Battle data to register:', battleData);

                                    await prisma.battleRegistration.create({
                                        data: battleData
                                    });
                                    results.battlesRegistered++;
                                    console.log(`Successfully registered battle ${battle.albionId}`);
                                } catch (error) {
                                    console.error('Error registering battle:', error);
                                    console.error('Failed battle data:', {
                                        battleId: battle.albionId,
                                        guildId: guildSettings.guildId,
                                        time: battleTime,
                                        stats: stats,
                                        enemyGuilds: allEnemyGuilds
                                    });
                                    results.errors++;
                                }
                            } else {
                                console.log(`Battle ${battle.albionId} already registered, skipping`);
                            }
                        } else {
                            console.log('Battle does not meet criteria (less than 4 kills and deaths), skipping');
                        }
                    }

                    if (foundTargetDay || battles.length < 20) {
                        console.log(foundTargetDay ? 'Found target day, stopping search' : 'No more battles to process');
                        break;
                    }

                    page++;
                    console.log(`Moving to page ${page}`);
                    await delay(1000); // Add delay between pages
                }

                // Update channel name if we registered any battles
                if (results.battlesRegistered > 0 && guildSettings.battlelogChannelId) {
                    console.log('Updating battle log channel name...');
                    const discordGuild = await client.guilds.fetch(guildSettings.guildId);
                    await updateBattleLogChannelName(discordGuild, guildSettings.battlelogChannelId);
                    console.log('Channel name updated successfully');
                }

            } catch (error) {
                console.error(`Error processing guild ${guildSettings.guildName}:`, error);
                results.errors++;
                continue;
            }
        }

        console.log('Battle sync process completed');
        await notifyAdmin(client, results, guildId);
    } catch (error) {
        console.error('Error in syncAlbionBattlesByDate:', error);
        results.errors++;
        await notifyAdmin(client, results, guildId);
    } finally {
        // Clean up temporary client if we created one
        if (temporaryClient) {
            temporaryClient.destroy();
        }
    }
}

module.exports = syncAlbionBattlesByDate; 