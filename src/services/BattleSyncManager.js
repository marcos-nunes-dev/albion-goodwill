const { Client } = require('discord.js');
const prisma = require('../config/prisma');
const axios = require('axios');
const logger = require('../utils/logger');

class BattleSyncManager {
    /**
     * @param {Client} client Discord.js client instance
     */
    constructor(client) {
        this.client = client;
        this.REQUEST_DELAY = 1000; // 1 second delay between requests
    }

    /**
     * Sleep for a specified duration
     * @param {number} ms Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get guild info from Albion API
     * @param {string} guildId Albion guild ID
     * @returns {Promise<any>} Guild info
     */
    async getGuildInfo(guildId) {
        try {
            const response = await axios.get(`https://gameinfo.albiononline.com/api/gameinfo/guilds/${guildId}`);
            return response.data;
        } catch (error) {
            this.client.logger.error(`Error fetching guild info for ${guildId}:`, error);
            return null;
        }
    }

    /**
     * Get battles for a guild from Albion API
     * @param {string} guildId Albion guild ID
     * @param {number} page Page number
     * @returns {Promise<any>} Battle data
     */
    async getGuildBattles(guildId, page = 1) {
        try {
            const response = await axios.get(
                `https://gameinfo.albiononline.com/api/gameinfo/guilds/${guildId}/battles?page=${page}&limit=50`
            );
            return response.data;
        } catch (error) {
            this.client.logger.error(`Error fetching battles for guild ${guildId}:`, error);
            return null;
        }
    }

    /**
     * Process a single battle
     * @param {Object} battle Battle data
     * @param {Object} guildSettings Guild settings
     * @param {string} guildName Guild name
     */
    async processBattle(battle, guildSettings, guildName) {
        try {
            // Check if battle already exists
            const existingBattle = await prisma.battleRegistration.findFirst({
                where: {
                    guildId: guildSettings.guildId,
                    albionId: battle.id.toString()
                }
            });

            if (existingBattle) {
                return;
            }

            // Get battle participants
            const guildParticipants = battle.players.filter(
                player => player.guildName === guildName
            );

            // Calculate stats
            const kills = guildParticipants.reduce((sum, player) => sum + player.kills, 0);
            const deaths = guildParticipants.reduce((sum, player) => sum + player.deaths, 0);

            // Determine victory
            const guildAlliance = battle.alliances.find(
                alliance => alliance.guilds.some(g => g.name === guildName)
            );
            const isVictory = guildAlliance?.kills > guildAlliance?.deaths;

            // Get enemy guilds
            const enemyGuilds = battle.alliances
                .filter(alliance => !alliance.guilds.some(g => g.name === guildName))
                .flatMap(alliance => alliance.guilds)
                .map(guild => guild.name);

            // Save battle to database
            await prisma.battleRegistration.create({
                data: {
                    guildId: guildSettings.guildId,
                    albionId: battle.id.toString(),
                    isVictory,
                    kills,
                    deaths,
                    startedAt: new Date(battle.startTime),
                    totalFame: battle.totalFame,
                    totalKills: battle.totalKills,
                    players: battle.players.length
                }
            });

            // Send webhook if configured
            if (guildSettings.battlelogWebhook) {
                // Create webhook message
                const webhookMessage = {
                    embeds: [{
                        title: isVictory ? '🏆 Victory!' : '💀 Defeat',
                        description: `Battle against ${enemyGuilds.join(', ')}`,
                        color: isVictory ? 0x00ff00 : 0xff0000,
                        fields: [
                            {
                                name: 'Stats',
                                value: `Kills: ${kills}\nDeaths: ${deaths}`,
                                inline: true
                            },
                            {
                                name: 'Time',
                                value: new Date(battle.startTime).toLocaleString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false
                                }).replace(',', ''),
                                inline: true
                            },
                            {
                                name: 'Battle Report',
                                value: `[View on Battleboard](https://albionbb.com/battles/${battle.id})`,
                                inline: true
                            }
                        ],
                        timestamp: new Date(battle.startTime).toISOString()
                    }]
                };

                try {
                    await axios.post(guildSettings.battlelogWebhook, webhookMessage);
                } catch (error) {
                    this.client.logger.error(`Error sending webhook for battle ${battle.id}:`, error);
                }
            }
        } catch (error) {
            this.client.logger.error(`Error processing battle ${battle.id}:`, error);
        }
    }

    /**
     * Sync battles for all configured guilds
     */
    async syncBattles() {
        const logger = this.client.logger;
        try {
            // Get all guilds with both battlelog channel and webhook configured
            const guildsToSync = await prisma.guildSettings.findMany({
                where: {
                    AND: [
                        { battlelogChannelId: { not: null } },
                        { battlelogWebhook: { not: null } }
                    ]
                }
            });

            if (guildsToSync.length === 0) {
                logger.info('No guilds with battlelog configuration found');
                return {
                    guildsProcessed: 0,
                    battlesProcessed: 0,
                    errors: 0,
                    channelUpdates: 'No configured guilds'
                };
            }

            let totalBattlesProcessed = 0;
            let errors = 0;

            // Process each configured guild
            for (const guildSettings of guildsToSync) {
                try {
                    if (!guildSettings.albionGuildId) {
                        logger.warn(`Guild ${guildSettings.guildId} has no Albion guild ID configured`);
                        continue;
                    }

                    // Get guild info
                    const guildInfo = await this.getGuildInfo(guildSettings.albionGuildId);
                    if (!guildInfo) {
                        logger.error(`Could not fetch guild info for ${guildSettings.albionGuildId}`);
                        continue;
                    }

                    // Fetch battles page by page
                    let page = 1;
                    let hasMoreBattles = true;

                    while (hasMoreBattles) {
                        const battles = await this.getGuildBattles(guildSettings.albionGuildId, page);
                        
                        if (!battles || !battles.length) {
                            hasMoreBattles = false;
                            break;
                        }

                        // Check if we've seen this battle before
                        const lastBattle = await prisma.battleRegistration.findFirst({
                            where: {
                                guildId: guildSettings.guildId,
                                albionId: battles[0].id.toString()
                            }
                        });

                        if (lastBattle) {
                            hasMoreBattles = false;
                            break;
                        }

                        // Process battles
                        for (const battle of battles) {
                            const existingBattle = await prisma.battleRegistration.findFirst({
                                where: {
                                    guildId: guildSettings.guildId,
                                    albionId: battle.id.toString()
                                }
                            });

                            if (existingBattle) {
                                hasMoreBattles = false;
                                break;
                            }

                            await this.processBattle(battle, guildSettings, guildInfo.name);
                            totalBattlesProcessed++;

                            // Rate limiting
                            await this.sleep(this.REQUEST_DELAY);
                        }

                        page++;
                    }

                } catch (error) {
                    logger.error(`Error processing guild ${guildSettings.guildId}:`, error);
                    errors++;
                }

                // Rate limiting between guilds
                await this.sleep(this.REQUEST_DELAY);
            }

            return {
                guildsProcessed: guildsToSync.length,
                battlesProcessed: totalBattlesProcessed,
                errors,
                channelUpdates: 'Completed'
            };

        } catch (error) {
            logger.error('Error in battle sync:', error);
            return {
                guildsProcessed: 0,
                battlesProcessed: 0,
                errors: 1,
                channelUpdates: 'Failed'
            };
        }
    }
}

module.exports = BattleSyncManager;
