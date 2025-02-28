const prisma = require('../config/prisma');
const axios = require('axios');
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

// Helper function to calculate guild stats from battle events
function calculateGuildStats(battleEvents, guildName) {
    let kills = 0;
    let deaths = 0;

    battleEvents.forEach(event => {
        if (event.Killer.GuildName === guildName) {
            kills++;
        }
        if (event.Victim.GuildName === guildName) {
            deaths++;
        }
    });

    return { kills, deaths, isVictory: kills > deaths };
}

async function updateBattles() {
    try {
        console.log('Starting battle update process...');

        const pendingBattles = await prisma.battleRegistration.findMany({
            where: {
                OR: [
                    { battleUrl: null },
                    { battleUrl: '' }
                ]
            }
        });

        if (pendingBattles.length === 0) {
            console.log('No pending battles found');
            return;
        }

        console.log(`Found ${pendingBattles.length} pending battles to process`);

        for (const battle of pendingBattles) {
            try {
                const guildSettings = await prisma.guildSettings.findUnique({
                    where: { guildId: battle.guildId }
                });

                if (!guildSettings?.albionGuildId) {
                    console.log(`No Albion Guild ID configured for Discord guild: ${battle.guildId}`);
                    continue;
                }

                // Add delay between battles to avoid rate limiting
                await delay(1000);

                // First, get the latest available battle date from the API
                const latestBattleResponse = await axios.get(`https://api.albionbb.com/us/battles?guildId=${guildSettings.albionGuildId}&minPlayers=20&page=1`);
                if (!Array.isArray(latestBattleResponse.data) || latestBattleResponse.data.length === 0) {
                    console.log(`No battles found for guild ID: ${guildSettings.albionGuildId}`);
                    continue;
                }

                const latestBattleDate = new Date(latestBattleResponse.data[0].startedAt);
                const registeredBattleDate = new Date(battle.battleTime);

                // If the registered battle is in the future relative to latest API data
                if (registeredBattleDate > latestBattleDate) {
                    console.log(`Battle registered on ${registeredBattleDate.toISOString()} is more recent than available data (${latestBattleDate.toISOString()})`);
                    continue;
                }

                // Get the registered battle's day in UTC
                const registeredBattleDay = new Date(Date.UTC(
                    registeredBattleDate.getUTCFullYear(),
                    registeredBattleDate.getUTCMonth(),
                    registeredBattleDate.getUTCDate()
                ));

                // Fetch guild info to get the guild name
                await delay(1000);
                const guildResponse = await axios.get(`https://api.albionbb.com/us/stats/guilds/${guildSettings.albionGuildId}?minPlayers=2`);
                if (!Array.isArray(guildResponse.data) || guildResponse.data.length === 0) {
                    console.log(`No data found for guild ID: ${guildSettings.albionGuildId}`);
                    continue;
                }

                const guildName = guildResponse.data[0].guildName;
                console.log(`Processing battle for guild: ${guildName} registered on ${registeredBattleDate.toISOString()}`);

                // Fetch battles until we reach the registered battle's day
                let page = 1;
                let allBattles = [];
                let hasMorePages = true;
                let foundTargetDay = false;

                while (hasMorePages) {
                    console.log(`Fetching page ${page}...`);
                    await delay(1000);
                    const battlesResponse = await axios.get(`https://api.albionbb.com/us/battles?guildId=${guildSettings.albionGuildId}&minPlayers=20&page=${page}`);
                    const apiBattles = battlesResponse.data;
                    
                    if (!apiBattles || apiBattles.length === 0) {
                        hasMorePages = false;
                        break;
                    }

                    // Check if we've reached the target day
                    const oldestBattleOnPage = new Date(apiBattles[apiBattles.length - 1].startedAt);
                    const oldestBattleDay = new Date(Date.UTC(
                        oldestBattleOnPage.getUTCFullYear(),
                        oldestBattleOnPage.getUTCMonth(),
                        oldestBattleOnPage.getUTCDate()
                    ));

                    // Only add battles from days we haven't fully processed yet
                    const relevantBattles = apiBattles.filter(b => {
                        const battleDate = new Date(b.startedAt);
                        const battleDay = new Date(Date.UTC(
                            battleDate.getUTCFullYear(),
                            battleDate.getUTCMonth(),
                            battleDate.getUTCDate()
                        ));
                        return battleDay >= registeredBattleDay;
                    });

                    allBattles.push(...relevantBattles);

                    // Stop if we've reached or gone past the target day
                    if (oldestBattleDay <= registeredBattleDay) {
                        foundTargetDay = true;
                        hasMorePages = false;
                    } else if (apiBattles.length < 20) { // API limit reached
                        hasMorePages = false;
                    } else {
                        page++;
                    }
                }

                console.log(`Found ${allBattles.length} battles to analyze`);

                // Create a fuzzy set with normalized enemy guild names
                const normalizedEnemyGuilds = battle.enemyGuilds.map(normalizeGuildName);
                const fuzzySet = FuzzySet(normalizedEnemyGuilds, false);

                // Try to find matching battles
                let matchingBattles = [];
                let primaryBattle = null;

                for (const apiBattle of allBattles) {
                    // Get enemy guilds and normalize their names
                    const enemyGuilds = apiBattle.guilds
                        .filter(g => g.name !== guildName)
                        .map(g => normalizeGuildName(g.name));

                    // Count how many registered enemies match with API enemies
                    let matchCount = 0;
                    for (const enemy of enemyGuilds) {
                        const matches = fuzzySet.get(enemy);
                        if (matches && matches[0][0] > 0.6) {
                            matchCount++;
                            console.log(`Matched "${enemy}" with similarity ${matches[0][0]}`);
                        }
                    }

                    // If we found a match, check if it should be merged with existing matches
                    if (matchCount > 0) {
                        if (!primaryBattle) {
                            primaryBattle = apiBattle;
                            matchingBattles.push(apiBattle);
                        } else if (shouldMergeBattles(primaryBattle, apiBattle, normalizedEnemyGuilds)) {
                            matchingBattles.push(apiBattle);
                        }
                    }
                }

                if (matchingBattles.length > 0) {
                    console.log(`Found ${matchingBattles.length} related battles for ${guildName} vs ${battle.enemyGuilds.join(', ')}`);
                    
                    // Fetch detailed battle information for all matching battles
                    await delay(1000);
                    const battleIds = matchingBattles.map(b => b.albionId).join(',');
                    const detailsResponse = await axios.get(`https://api.albionbb.com/us/battles/kills?ids=${battleIds}`);
                    const battleEvents = detailsResponse.data;

                    // Check if battle details has the expected structure
                    if (!Array.isArray(battleEvents) || battleEvents.length === 0) {
                        console.error(`Invalid battle details response for battle IDs ${battleIds}`);
                        console.log('Marking battle as stale due to invalid API response');
                        await prisma.battleRegistration.update({
                            where: { id: battle.id },
                            data: {
                                battleUrl: 'stale'
                            }
                        });
                        continue;
                    }

                    // Calculate combined guild stats from all battle events
                    const stats = calculateGuildStats(battleEvents, guildName);

                    // Update battle registration with combined stats
                    const battleUrl = matchingBattles.length > 1 
                        ? `https://albionbb.com/battles/multi?ids=${battleIds}`
                        : `https://albionbb.com/battle/${primaryBattle.albionId}`;

                    await prisma.battleRegistration.update({
                        where: { id: battle.id },
                        data: {
                            kills: stats.kills,
                            deaths: stats.deaths,
                            isVictory: stats.isVictory,
                            battleUrl: battleUrl
                        }
                    });

                    console.log(`Updated battle stats (combined from ${matchingBattles.length} battles): K/D ${stats.kills}/${stats.deaths}, Victory: ${stats.isVictory}`);
                } else if (foundTargetDay) {
                    console.log(`No matching battle found for ${guildName} vs ${battle.enemyGuilds.join(', ')} - marking as stale`);
                    await prisma.battleRegistration.update({
                        where: { id: battle.id },
                        data: {
                            battleUrl: 'stale'
                        }
                    });
                } else {
                    console.log(`Target day not yet available in API for ${guildName} vs ${battle.enemyGuilds.join(', ')}`);
                }
            } catch (battleError) {
                console.error(`Error processing battle ${battle.id}:`, battleError);
                continue;
            }
        }

        console.log('Battle update process completed');
    } catch (error) {
        console.error('Error in updateBattles:', error);
    }
}

// If running directly (not imported)
if (require.main === module) {
    updateBattles()
        .catch(console.error)
        .finally(() => process.exit(0));
}

module.exports = updateBattles; 