const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { fetchGuildStats, getMainRole } = require('../../utils/albionApi');
const { EmbedBuilder, Colors, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { 
    calculateKD, 
    formatKD, 
    calculateNormalizedScores,
    MIN_BATTLES 
} = require('../../utils/mmrCalculator');
const { ROLE_NAMES } = require('../../utils/constants');
const axios = require('axios');

function calculatePerformanceScore(playerStats, topPlayersStats) {
    if (!topPlayersStats || topPlayersStats.length === 0) return null;

    // Calculate averages for top players
    const topAverages = {
        ip: topPlayersStats.reduce((sum, p) => sum + p.stats.average_item_power, 0) / topPlayersStats.length,
        winRate: topPlayersStats.reduce((sum, p) => sum + p.stats.win_rate, 0) / topPlayersStats.length,
        killFamePerBattle: topPlayersStats.reduce((sum, p) => sum + (p.stats.kill_fame / p.stats.usages), 0) / topPlayersStats.length,
        kdRatio: topPlayersStats.reduce((sum, p) => sum + calculateKD(p.stats.kills, p.stats.deaths), 0) / topPlayersStats.length,
        battles: topPlayersStats.reduce((sum, p) => sum + p.stats.usages, 0) / topPlayersStats.length
    };

    // Calculate player's metrics
    const playerMetrics = {
        ip: playerStats.average_item_power,
        winRate: playerStats.win_rate,
        killFamePerBattle: playerStats.kill_fame / playerStats.usages,
        kdRatio: calculateKD(playerStats.kills, playerStats.deaths),
        battles: playerStats.usages
    };

    // Calculate scores for each metric (0-100) with more stringent scoring
    const scores = {
        ip: Math.min(100, Math.pow((playerMetrics.ip / topAverages.ip), 1.5) * 100),
        winRate: Math.min(100, Math.pow((playerMetrics.winRate / topAverages.winRate), 2) * 100),
        killFamePerBattle: Math.min(100, Math.pow((playerMetrics.killFamePerBattle / topAverages.killFamePerBattle), 1.5) * 100),
        kdRatio: Math.min(100, Math.pow((playerMetrics.kdRatio / topAverages.kdRatio), 2) * 100),
        battles: Math.min(100, Math.pow((playerMetrics.battles / topAverages.battles), 0.5) * 100)
    };

    // Weight the scores (adjust weights based on importance)
    const weights = {
        ip: 0.10,       // 10% weight for IP
        winRate: 0.25,  // 25% weight for win rate
        killFamePerBattle: 0.20, // 20% weight for kill fame per battle
        kdRatio: 0.20,  // 20% weight for K/D ratio
        battles: 0.25   // 25% weight for battle experience
    };

    // Calculate final weighted score
    const finalScore = Object.keys(scores).reduce((total, metric) => 
        total + (scores[metric] * weights[metric]), 0);

    return {
        score: Math.round(finalScore),
        details: {
            scores,
            player: playerMetrics,
            average: topAverages
        }
    };
}

function getPerformanceCategory(score) {
    if (score >= 95) return { category: 'Exceptional', emoji: '🌟' };
    if (score >= 85) return { category: 'Very Good', emoji: '💫' };
    if (score >= 75) return { category: 'Good', emoji: '✨' };
    if (score >= 65) return { category: 'Above Average', emoji: '⭐' };
    if (score >= 55) return { category: 'Average', emoji: '✅' };
    if (score >= 45) return { category: 'Below Average', emoji: '⚠️' };
    return { category: 'Needs Improvement', emoji: '❗' };
}

function formatNumber(num) {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(1);
}

module.exports = new Command({
    name: 'canplay',
    description: 'Compare player weapon proficiency with top guild players or specific players',
    category: 'albion',
    usage: '<player_name> <role> [alltime] [compare_to=player1,player2,...]',
    cooldown: 30,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'canplay';

            // Get parameters based on command type
            let playerName, roleParam, isAllTime, comparePlayers;

            if (isSlash) {
                playerName = message.options.getString('player');
                roleParam = message.options.getString('role');
                isAllTime = message.options.getBoolean('alltime') || false;
                comparePlayers = message.options.getString('compare_to')?.split(',').slice(0, 5);
            } else {
                if (args.length < 2) {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('Invalid Usage')
                        .setDescription([
                            'Please provide both player name and role.',
                            'Example: `!albiongw canplay PlayerName tank [alltime] [compare_to=player1,player2]`'
                        ].join('\n'))
                        .setColor(Colors.Red);

                    await message.reply({ embeds: [errorEmbed] });
                    return;
                }

                playerName = args[0];
                roleParam = args[1].toLowerCase();
                isAllTime = args.some(arg => arg.toLowerCase() === 'alltime');
                const compareToArg = args.find(arg => arg.toLowerCase().startsWith('compare_to='));
                comparePlayers = compareToArg ? compareToArg.split('=')[1].split(',').slice(0, 5) : null;
            }

            const validRoles = ['tank', 'support', 'healer', 'melee', 'ranged', 'mount'];

            if (!validRoles.includes(roleParam)) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('Invalid Role')
                    .setDescription(`Valid roles are: ${validRoles.join(', ')}`)
                    .setColor(Colors.Red);

                await message.reply({
                    embeds: [errorEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            const loadingEmbed = new EmbedBuilder()
                .setTitle('Fetching Data')
                .setDescription(`Retrieving ${isAllTime ? 'all-time' : 'last 30 days'} player and guild statistics...`)
                .setColor(Colors.Blue);

            const initialResponse = await message.reply({
                embeds: [loadingEmbed],
                ephemeral: isSlash
            });

            // Fetch player's weapons data with optional alltime parameter
            const apiUrl = `https://murderledger.albiononline2d.com/api/players/${playerName}/stats/weapons${isAllTime ? '?lookback_days=9999' : ''}`;
            const playerWeaponsResponse = await axios.get(apiUrl);
            const playerWeapons = playerWeaponsResponse.data.weapons.filter(w => w.weapon && w.weapon_name);

            if (playerWeapons.length === 0) {
                return initialResponse.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('No Data Found')
                            .setDescription(`No weapon data found for player ${playerName}`)
                            .setColor(Colors.Red)
                    ],
                    ephemeral: isSlash
                });
            }

            // Sort weapons by usage for better display
            playerWeapons.sort((a, b) => b.usages - a.usages);

            // Take only the top 25 most used weapons
            const topWeapons = playerWeapons.slice(0, 25);

            // Create weapon selection menu
            const weaponSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('weapon_select')
                        .setPlaceholder('Select a weapon to compare')
                        .addOptions(
                            topWeapons.map(weapon => ({
                                label: weapon.weapon_name,
                                description: `Uses: ${weapon.usages} | IP: ${Math.round(weapon.average_item_power)} | K/D: ${weapon.kills}/${weapon.deaths}`,
                                value: weapon.weapon
                            }))
                        )
                );

            // Update response with weapon selection
            const selectionMessage = await initialResponse.edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Weapon Selection')
                        .setDescription(`Please select a weapon to compare for ${playerName}\n${isAllTime ? '(All-time statistics)' : '(Last 30 days statistics)'}\nShowing top 25 most used weapons`)
                        .setColor(Colors.Blue)
                ],
                components: [weaponSelect],
                ephemeral: isSlash
            });

            // Handle weapon selection
            const filter = i => {
                const isAuthor = isSlash ? 
                    i.user.id === message.user.id : 
                    i.user.id === message.author.id;
                return isAuthor;
            };

            try {
                const selection = await selectionMessage.awaitMessageComponent({ filter, time: 30000 });
                const selectedWeapon = playerWeapons.find(w => w.weapon === selection.values[0]);

                // Get guild settings
                const settings = await prisma.guildSettings.findUnique({
                    where: { guildId: message.guild.id }
                });

                if (!settings?.albionGuildId) {
                    return selection.update({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('Configuration Missing')
                                .setDescription('Albion guild ID not configured.')
                                .setColor(Colors.Red)
                        ],
                        components: [],
                        ephemeral: isSlash
                    });
                }

                // Fetch guild stats and get players
                const guildStats = await fetchGuildStats(settings.albionGuildId);
                const roleIndex = validRoles.indexOf(roleParam);
                const rolePlayers = guildStats.filter(player => {
                    const mainRole = getMainRole(player.roles);
                    return mainRole.index === roleIndex && player.attendance >= MIN_BATTLES;
                });

                const scores = calculateNormalizedScores(rolePlayers, roleIndex);

                // Fetch weapon stats for comparison players
                const playersWithWeapon = [];
                
                // Status update message
                await selection.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Processing')
                            .setDescription(comparePlayers 
                                ? `Fetching data for specified comparison players...`
                                : 'Searching for players with similar weapon experience...')
                            .setColor(Colors.Blue)
                    ],
                    components: [],
                    ephemeral: isSlash
                });

                if (comparePlayers) {
                    // Fetch data for specified players
                    for (const playerName of comparePlayers) {
                        try {
                            const response = await axios.get(`https://murderledger.albiononline2d.com/api/players/${playerName}/stats/weapons${isAllTime ? '?lookback_days=9999' : ''}`);
                            const weaponStats = response.data.weapons.find(w => w.weapon === selectedWeapon.weapon);
                            
                            if (weaponStats && weaponStats.usages > 0) {
                                playersWithWeapon.push({
                                    name: playerName,
                                    stats: weaponStats
                                });
                            }
                        } catch (error) {
                            console.error(`Error fetching data for player ${playerName}:`, error);
                        }
                    }
                } else {
                    // Original code for finding top players
                    let processedPlayers = 0;
                    while (playersWithWeapon.length < 5 && processedPlayers < scores.length) {
                        const player = scores[processedPlayers];
                        try {
                            const response = await axios.get(`https://murderledger.albiononline2d.com/api/players/${player.name}/stats/weapons${isAllTime ? '?lookback_days=9999' : ''}`);
                            const weaponStats = response.data.weapons.find(w => w.weapon === selectedWeapon.weapon);
                            
                            if (weaponStats && weaponStats.usages > 0) {
                                playersWithWeapon.push({
                                    name: player.name,
                                    stats: weaponStats
                                });
                            }
                        } catch (error) {
                            console.error(`Error fetching data for player ${player.name}:`, error);
                        }
                        processedPlayers++;
                    }
                }

                // Create comparison embed
                const comparisonEmbed = new EmbedBuilder()
                    .setTitle(`Weapon Comparison - ${selectedWeapon.weapon_name}`)
                    .setDescription(`Comparing ${playerName}'s performance with ${comparePlayers ? 'specified' : `top ${ROLE_NAMES[roleIndex]}`} players using the same weapon\n${isAllTime ? '(All-time statistics)' : '(Last 30 days statistics)'}`)
                    .addFields(
                        {
                            name: playerName,
                            value: formatPlayerStats(selectedWeapon),
                            inline: false
                        }
                    )
                    .setColor(Colors.Blue)
                    .setTimestamp();

                if (playersWithWeapon.length > 0) {
                    comparisonEmbed.addFields({
                        name: comparePlayers ? 'Comparison Players' : 'Top Players Comparison',
                        value: playersWithWeapon.map(player => 
                            `${player.name}: ${formatPlayerStats(player.stats)}`
                        ).join('\n'),
                        inline: false
                    });

                    // Calculate performance estimation
                    const performanceAnalysis = calculatePerformanceScore(selectedWeapon, playersWithWeapon);
                    const { category, emoji } = getPerformanceCategory(performanceAnalysis.score);
                    
                    // Add performance details
                    const details = performanceAnalysis.details;
                    const metrics = [
                        {
                            name: 'Combat (K/D)',
                            player: formatKD(details.player.kdRatio),
                            avg: formatKD(details.average.kdRatio),
                            score: Math.round(details.scores.kdRatio)
                        },
                        {
                            name: 'Win Rate',
                            player: `${(details.player.winRate * 100).toFixed(1)}%`,
                            avg: `${(details.average.winRate * 100).toFixed(1)}%`,
                            score: Math.round(details.scores.winRate)
                        },
                        {
                            name: 'Fame/Battle',
                            player: formatNumber(details.player.killFamePerBattle),
                            avg: formatNumber(details.average.killFamePerBattle),
                            score: Math.round(details.scores.killFamePerBattle)
                        },
                        {
                            name: 'Item Power',
                            player: Math.round(details.player.ip),
                            avg: Math.round(details.average.ip),
                            score: Math.round(details.scores.ip)
                        },
                        {
                            name: 'Experience',
                            player: details.player.battles,
                            avg: Math.round(details.average.battles),
                            score: Math.round(details.scores.battles)
                        }
                    ];

                    comparisonEmbed.addFields({
                        name: 'Performance Analysis',
                        value: [
                            `Overall Score: ${performanceAnalysis.score}% (${category})`,
                            '',
                            'Detailed Metrics:',
                            '```',
                            'Metric          You    Avg    Score',
                            '─────────────────────────────────────',
                            ...metrics.map(m => 
                                `${m.name.padEnd(15)}${String(m.player).padEnd(7)} ${String(m.avg).padEnd(7)} ${m.score}%`
                            ),
                            '```'
                        ].join('\n'),
                        inline: false
                    });
                } else {
                    comparisonEmbed.addFields({
                        name: comparePlayers ? 'Comparison Players' : 'Top Players Comparison',
                        value: comparePlayers 
                            ? 'None of the specified players have experience with this weapon.'
                            : 'No other players in this role found with experience using this weapon.',
                        inline: false
                    });
                }

                // Modify summary
                const summary = playersWithWeapon.length > 0
                    ? `Found ${playersWithWeapon.length} ${comparePlayers ? 'specified' : ''} players with ${selectedWeapon.weapon_name} experience.${
                        comparePlayers 
                            ? ` ${comparePlayers.length - playersWithWeapon.length} specified players had no data for this weapon.`
                            : ''
                    }`
                    : `${comparePlayers 
                        ? 'None of the specified players have experience with this weapon.'
                        : `You are currently the only ${ROLE_NAMES[roleIndex]} in the guild with ${selectedWeapon.weapon_name} experience.`}`;

                comparisonEmbed.addFields({
                    name: 'Summary',
                    value: summary,
                    inline: false
                });

                await message.channel.send({
                    embeds: [comparisonEmbed],
                    ephemeral: isSlash
                });

            } catch (error) {
                console.error('Selection error:', error);
                await initialResponse.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Selection Timeout')
                            .setDescription('Weapon selection timed out. Please try again.')
                            .setColor(Colors.Red)
                    ],
                    components: [],
                    ephemeral: isSlash
                });
            }

        } catch (error) {
            console.error('Error in canplay command:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('Error')
                .setDescription('An error occurred while processing the command.')
                .setColor(Colors.Red);

            if (message.replied || message.deferred) {
                await message.editReply({
                    embeds: [errorEmbed],
                    components: [],
                    ephemeral: isSlash
                });
            } else {
                await message.reply({
                    embeds: [errorEmbed],
                    ephemeral: isSlash
                });
            }
        }
    }
});

function formatPlayerStats(weaponStats) {
    if (!weaponStats) return 'No data available';
    
    const kd = formatKD(calculateKD(weaponStats.kills || 0, weaponStats.deaths || 0));
    return [
        `IP: ${Math.round(weaponStats.average_item_power)}`,
        `K/D: ${kd}`,
        `Battles: ${weaponStats.usages}`,
        `Win Rate: ${(weaponStats.win_rate * 100).toFixed(1)}%`,
        `Kill Fame: ${weaponStats.kill_fame.toLocaleString()}`
    ].join(' | ');
} 