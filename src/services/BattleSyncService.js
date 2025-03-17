const prisma = require('../config/prisma');
const axios = require('axios');
const { updateBattleLogChannelName } = require('../utils/battleStats');
const logger = require('../utils/logger');
const FuzzySet = require('fuzzyset.js');
const { EmbedBuilder, Colors } = require('discord.js');

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

// Helper function to check if battle is within time bounds
function isBattleWithinTimeBounds(battleTime, lastBattleTime, sevenDaysAgo) {
    if (lastBattleTime) {
        return battleTime > lastBattleTime;
    }
    return battleTime > sevenDaysAgo;
}

// Helper function to check if two battles should be merged
function shouldMergeBattles(battle1, battle2, normalizedEnemyGuilds) {
    // Check time difference (less than 30 minutes)
    const time1 = new Date(battle1.startedAt);
    const time2 = new Date(battle2.startedAt);
    const timeDiffMinutes = Math.abs(time1 - time2) / (1000 * 60);
    
    if (timeDiffMinutes > 30) return false;

    // Create fuzzy sets for both battles' enemy guilds
    const fuzzySet = FuzzySet(normalizedEnemyGuilds, false);
    
    // Get enemy guilds from both battles
    const enemies1 = battle1.guilds.map(g => normalizeGuildName(g.name));
    const enemies2 = battle2.guilds.map(g => normalizeGuildName(g.name));
    
    // Calculate the percentage of matching guilds
    let matchingGuildsCount = 0;
    const totalGuilds = new Set([...enemies1, ...enemies2]).size;
    
    for (const enemy of enemies1) {
        const matches = fuzzySet.get(enemy);
        if (matches && matches[0][0] > 0.8) {
            matchingGuildsCount++;
        }
    }
    
    const matchPercentage = (matchingGuildsCount / totalGuilds) * 100;
    if (matchPercentage < 50) return false;
    
    // Check if the battles have similar player counts (within 30%)
    const totalPlayers1 = battle1.guilds.reduce((sum, g) => sum + g.players, 0);
    const totalPlayers2 = battle2.guilds.reduce((sum, g) => sum + g.players, 0);
    const playerDiffPercentage = Math.abs(totalPlayers1 - totalPlayers2) / Math.max(totalPlayers1, totalPlayers2) * 100;
    
    return playerDiffPercentage <= 30;
}

class BattleSyncService {
    constructor(client) {
        this.client = client;
    }

    async syncRecentBattles() {
        const results = {
            guildsProcessed: 0,
            battlesFound: 0,
            battlesRegistered: 0,
            errors: 0
        };

        try {
            // Get all guilds with battle sync enabled
            const guildsToSync = await prisma.guildSettings.findMany({
                where: {
                    syncAlbionBattles: true,
                    albionGuildId: { not: null }
                }
            });

            if (guildsToSync.length === 0) {
                logger.info('No guilds found with battle sync enabled');
                return results;
            }

            logger.info(`Found ${guildsToSync.length} guilds to sync battles for`);

            for (const guildSettings of guildsToSync) {
                try {
                    results.guildsProcessed++;
                    logger.info(`Processing guild: ${guildSettings.guildName} (${guildSettings.albionGuildId})`);

                    // Send temporary status message if battle log channel exists
                    let statusMessage = null;
                    if (guildSettings.battlelogChannelId) {
                        try {
                            const channel = await this.client.channels.fetch(guildSettings.battlelogChannelId);
                            if (channel) {
                                const statusEmbed = new EmbedBuilder()
                                    .setTitle('🔄 Battle Sync in Progress')
                                    .setDescription('Checking for new battles...')
                                    .setColor(Colors.Blue)
                                    .setTimestamp();
                                statusMessage = await channel.send({ embeds: [statusEmbed] });
                            }
                        } catch (error) {
                            logger.error('Error sending status message:', error);
                        }
                    }

                    // Get guild info
                    const guildResponse = await axios.get(`https://api.albionbb.com/us/stats/guilds/${guildSettings.albionGuildId}?minPlayers=2`);
                    if (!Array.isArray(guildResponse.data) || guildResponse.data.length === 0) {
                        logger.warn(`No data found for guild ID: ${guildSettings.albionGuildId}`);
                        continue;
                    }

                    const guildName = guildResponse.data[0].guildName;
                    
                    let page = 1;
                    let processedBattles = new Set();
                    let shouldContinue = true;

                    while (shouldContinue) {
                        // Get battles from API
                        logger.info(`Fetching battles page ${page} for guild ${guildName}...`);
                        const battlesResponse = await axios.get(`https://api.albionbb.com/us/battles?guildId=${guildSettings.albionGuildId}&minPlayers=20&page=${page}`);
                        
                        if (!Array.isArray(battlesResponse.data) || battlesResponse.data.length === 0) {
                            break;
                        }

                        const battles = battlesResponse.data;
                        let foundCurrentPageBattle = false;

                        // Process each battle
                        for (const battle of battles) {
                            const battleTime = new Date(battle.startedAt);
                            
                            // Skip if already processed
                            if (processedBattles.has(battle.albionId)) {
                                continue;
                            }

                            // Check if our guild has enough players
                            const ourGuildInBattle = battle.guilds.find(g => g.name === guildName);
                            if (!ourGuildInBattle || ourGuildInBattle.players < 10) {
                                continue;
                            }

                            processedBattles.add(battle.albionId);
                            foundCurrentPageBattle = true;

                            // Get battle details
                            await delay(1000);
                            const detailsResponse = await axios.get(`https://api.albionbb.com/us/battles/kills?ids=${battle.albionId}`);
                            const battleEvents = detailsResponse.data;

                            if (!Array.isArray(battleEvents)) {
                                continue;
                            }

                            // Calculate stats
                            const stats = battleEvents.reduce((acc, event) => {
                                if (event.Killer.GuildName === guildName) acc.kills++;
                                if (event.Victim.GuildName === guildName) acc.deaths++;
                                return acc;
                            }, { kills: 0, deaths: 0 });

                            // Only process battles with significant participation
                            if (stats.kills >= 4 || stats.deaths >= 4) {
                                results.battlesFound++;

                                // Get enemy guilds
                                const enemyGuilds = battle.guilds
                                    .filter(g => g.name !== guildName)
                                    .map(g => g.name);

                                const battleUrl = `https://albionbb.com/battles/${battle.albionId}`;

                                // Check if battle is already registered
                                const existingBattle = await prisma.battleRegistration.findFirst({
                                    where: {
                                        guildId: guildSettings.guildId,
                                        battleUrl: battleUrl
                                    }
                                });

                                if (!existingBattle) {
                                    try {
                                        // Register the battle
                                        await prisma.battleRegistration.create({
                                            data: {
                                                userId: this.client.user.id,
                                                guildId: guildSettings.guildId,
                                                battleTime: battleTime,
                                                enemyGuilds: enemyGuilds,
                                                isVictory: stats.kills > stats.deaths,
                                                kills: stats.kills,
                                                deaths: stats.deaths,
                                                battleUrl: battleUrl
                                            }
                                        });
                                        results.battlesRegistered++;
                                    } catch (error) {
                                        logger.error('Error registering battle:', error);
                                        results.errors++;
                                    }
                                }
                            }
                        }

                        if (!foundCurrentPageBattle || battles.length < 20) {
                            shouldContinue = false;
                        } else {
                            page++;
                            await delay(1000);
                        }
                    }

                    // Update channel name if we registered any battles
                    if (results.battlesRegistered > 0 && guildSettings.battlelogChannelId) {
                        const discordGuild = await this.client.guilds.fetch(guildSettings.guildId);
                        await updateBattleLogChannelName(discordGuild, guildSettings.battlelogChannelId);
                    }

                    // Update status message after processing
                    if (statusMessage) {
                        try {
                            const resultEmbed = new EmbedBuilder()
                                .setTitle('🔍 Battle Sync Results')
                                .setDescription(
                                    results.battlesRegistered > 0 
                                        ? `Found ${results.battlesFound} battles\nRegistered ${results.battlesRegistered} new battles`
                                        : 'No new battles found in this check'
                                )
                                .setColor(results.battlesRegistered > 0 ? Colors.Green : Colors.Grey)
                                .setTimestamp();
                            
                            await statusMessage.edit({ embeds: [resultEmbed] });
                            
                            // Delete the message after 30 seconds
                            setTimeout(() => {
                                statusMessage.delete().catch(error => 
                                    logger.error('Error deleting status message:', error)
                                );
                            }, 30000);
                        } catch (error) {
                            logger.error('Error updating status message:', error);
                        }
                    }

                } catch (error) {
                    logger.error(`Error processing guild ${guildSettings.guildName}:`, error);
                    results.errors++;
                }
            }

        } catch (error) {
            logger.error('Error in syncRecentBattles:', error);
            results.errors++;
        }

        return results;
    }
}

module.exports = BattleSyncService; 