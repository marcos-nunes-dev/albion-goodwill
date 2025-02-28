const prisma = require('../config/prisma');
const axios = require('axios');
const { updateBattleLogChannelName } = require('../utils/battleStats');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// Helper function to add delay between API calls
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to calculate total fame for a guild in a battle
function calculateGuildFame(battleEvents, guildId) {
    return battleEvents
        .filter(event => event.Killer.GuildId === guildId)
        .reduce((total, event) => total + event.TotalVictimKillFame, 0);
}

// Helper function to send notification to admin
async function notifyAdmin(client, results) {
    try {
        const notifyUserId = process.env.NOTIFY_USER_ID;
        if (!notifyUserId) {
            console.log('No NOTIFY_USER_ID set, skipping notification');
            return;
        }

        const user = await client.users.fetch(notifyUserId);
        if (!user) {
            console.log('Could not find user to notify');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('🔄 Battle Sync Process')
            .setDescription([
                '**Process Summary:**',
                `• Guilds Processed: ${results.guildsProcessed || 0}`,
                `• New Battles Found: ${results.battlesFound || 0}`,
                `• Battles Registered: ${results.battlesRegistered || 0}`,
                `• Errors Encountered: ${results.errors || 0}`,
                '',
                'For detailed logs, please check the application logs.'
            ].join('\n'))
            .setColor(results.errors > 0 ? '#FFA500' : '#00FF00')
            .setTimestamp();

        await user.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

async function syncAlbionBattles(providedClient = null) {
    let client = providedClient;
    let temporaryClient = null;
    const results = {
        guildsProcessed: 0,
        battlesFound: 0,
        battlesRegistered: 0,
        errors: 0
    };

    try {
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

        console.log('Starting Albion battle sync process...');

        // Get all guilds with sync enabled and guild ID configured
        const guildsToSync = await prisma.guildSettings.findMany({
            where: {
                syncAlbionBattles: true,
                albionGuildId: {
                    not: null
                }
            }
        });

        if (guildsToSync.length === 0) {
            console.log('No guilds found with battle sync enabled');
            await notifyAdmin(client, results);
            return;
        }

        console.log(`Found ${guildsToSync.length} guilds to sync battles for`);

        for (const guildSettings of guildsToSync) {
            try {
                results.guildsProcessed++;
                console.log(`Processing guild: ${guildSettings.guildName} (${guildSettings.albionGuildId})`);

                // Get the latest battle we've registered
                const latestBattle = await prisma.battleRegistration.findFirst({
                    where: {
                        guildId: guildSettings.guildId,
                        battleUrl: {
                            not: null,
                            not: '',
                            not: 'stale'
                        }
                    },
                    orderBy: {
                        battleTime: 'desc'
                    }
                });

                // Get battles from API
                const battlesResponse = await axios.get(`https://api.albionbb.com/us/battles?guildId=${guildSettings.albionGuildId}&minPlayers=20&page=1`);
                if (!Array.isArray(battlesResponse.data)) {
                    console.log(`No battles found for guild ID: ${guildSettings.albionGuildId}`);
                    continue;
                }

                const battles = battlesResponse.data;
                const newBattles = [];

                // Filter battles that are newer than our latest registered battle
                for (const battle of battles) {
                    const battleTime = new Date(battle.startedAt);
                    if (latestBattle && battleTime <= new Date(latestBattle.battleTime)) {
                        break; // We've reached battles we already processed
                    }

                    // Add delay to avoid rate limiting
                    await delay(1000);

                    // Get battle details
                    const detailsResponse = await axios.get(`https://api.albionbb.com/us/battles/kills?ids=${battle.albionId}`);
                    const battleEvents = detailsResponse.data;

                    if (!Array.isArray(battleEvents)) {
                        console.log(`Invalid battle details for battle ${battle.albionId}`);
                        continue;
                    }

                    // Calculate fame for our guild
                    const guildFame = calculateGuildFame(battleEvents, guildSettings.albionGuildId);

                    // Only process battles where our guild got more than 1.5M fame
                    if (guildFame >= 1500000) {
                        console.log(`Found significant battle: ${battle.albionId} (Fame: ${guildFame.toLocaleString()})`);

                        // Calculate kills and deaths
                        const stats = battleEvents.reduce((acc, event) => {
                            if (event.Killer.GuildId === guildSettings.albionGuildId) {
                                acc.kills++;
                            }
                            if (event.Victim.GuildId === guildSettings.albionGuildId) {
                                acc.deaths++;
                            }
                            return acc;
                        }, { kills: 0, deaths: 0 });

                        // Get enemy guilds
                        const enemyGuilds = [...new Set(
                            battle.guilds
                                .filter(g => g.id !== guildSettings.albionGuildId)
                                .map(g => g.name)
                        )];

                        // Determine victory (more kills than deaths)
                        const isVictory = stats.kills > stats.deaths;

                        newBattles.push({
                            albionId: battle.albionId,
                            battleTime: battleTime,
                            enemyGuilds,
                            isVictory,
                            kills: stats.kills,
                            deaths: stats.deaths,
                            fame: guildFame
                        });
                    }
                }

                // Register new battles
                for (const battle of newBattles) {
                    try {
                        await prisma.battleRegistration.create({
                            data: {
                                userId: client.user.id,
                                guildId: guildSettings.guildId,
                                battleTime: battle.battleTime,
                                enemyGuilds: battle.enemyGuilds,
                                isVictory: battle.isVictory,
                                kills: battle.kills,
                                deaths: battle.deaths,
                                battleUrl: `https://albionbb.com/battle/${battle.albionId}`
                            }
                        });
                        results.battlesRegistered++;
                        console.log(`Registered battle: ${battle.albionId} for guild ${guildSettings.guildName}`);
                    } catch (error) {
                        console.error(`Error registering battle ${battle.albionId}:`, error);
                        results.errors++;
                    }
                }

                results.battlesFound += newBattles.length;

                // Update channel name if we registered any battles
                if (newBattles.length > 0 && guildSettings.battlelogChannelId) {
                    const discordGuild = await client.guilds.fetch(guildSettings.guildId);
                    await updateBattleLogChannelName(discordGuild, guildSettings.battlelogChannelId);
                }

                console.log(`Processed ${newBattles.length} new battles for ${guildSettings.guildName}`);

            } catch (error) {
                console.error(`Error processing guild ${guildSettings.guildName}:`, error);
                results.errors++;
                continue;
            }

            // Add delay between processing different guilds
            await delay(2000);
        }

        console.log('Battle sync process completed');
        await notifyAdmin(client, results);
    } catch (error) {
        console.error('Error in syncAlbionBattles:', error);
        results.errors++;
        await notifyAdmin(client, results);
    } finally {
        // Clean up temporary client if we created one
        if (temporaryClient) {
            temporaryClient.destroy();
        }
    }
}

// If running directly (not imported)
if (require.main === module) {
    syncAlbionBattles()
        .catch(console.error)
        .finally(() => process.exit(0));
}

module.exports = syncAlbionBattles; 