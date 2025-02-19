const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { fetchGuildStats, getMainRole } = require('../../utils/albionApi');
const { EmbedBuilder, Colors } = require('discord.js');
const { 
    calculateKD, 
    formatKD, 
    calculateNormalizedScores,
    getRoleMMRExplanation,
    getStatComparison,
    MIN_BATTLES 
} = require('../../utils/mmrCalculator');
const { ROLE_NAMES } = require('../../utils/constants');

module.exports = new Command({
    name: 'playermmr',
    description: 'Check MMR stats for a specific player',
    category: 'albion',
    usage: '<player_name>',
    cooldown: 10,
    async execute(message, args) {
        if (!args[0]) {
            await message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Missing Information')
                        .setDescription('Please provide a player name.')
                        .addFields(
                            { name: 'Usage', value: '```!albiongw playermmr <player_name>```', inline: true },
                            { name: 'Example', value: '```!albiongw playermmr PlayerName```', inline: true }
                        )
                        .setColor(Colors.Yellow)
                        .setTimestamp()
                ]
            });
            return;
        }

        const playerName = args[0];
        const initialResponse = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Fetching Data')
                    .setDescription('Retrieving player statistics...')
                    .setColor(Colors.Blue)
                    .setTimestamp()
            ]
        });

        try {
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guild.id }
            });

            if (!settings?.albionGuildId) {
                await initialResponse.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Configuration Missing')
                            .setDescription('Albion guild ID not configured.')
                            .addFields({
                                name: 'How to Fix',
                                value: 'Use `/settings setguildid` to configure your guild ID.'
                            })
                            .setColor(Colors.Red)
                            .setTimestamp()
                    ]
                });
                return;
            }

            if (!settings.competitorIds?.length) {
                await initialResponse.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Competitors Not Configured')
                            .setDescription('No competitor guilds configured for MMR comparison.')
                            .addFields({
                                name: 'How to Fix',
                                value: 'Use `/competitors add <guild_id>` to add competitor guilds.'
                            })
                            .setColor(Colors.Yellow)
                            .setTimestamp()
                    ]
                });
                return;
            }

            // Fetch stats for all guilds
            const mainGuildStats = await fetchGuildStats(settings.albionGuildId);
            const competitorStats = await Promise.all(
                settings.competitorIds.map(id => fetchGuildStats(id))
            );

            // Combine all players
            const allPlayers = [
                ...mainGuildStats,
                ...competitorStats.flat()
            ];

            const player = allPlayers.find(p => p.name.toLowerCase() === playerName.toLowerCase());

            if (!player) {
                await initialResponse.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Player Not Found')
                            .setDescription(`Could not find player "${playerName}" in guild stats.`)
                            .addFields({
                                name: 'Note',
                                value: 'Make sure the player name is exact and the player has participated in battles in the last 30 days.'
                            })
                            .setColor(Colors.Red)
                            .setTimestamp()
                    ]
                });
                return;
            }

            const mainRole = getMainRole(player.roles);

            // Calculate Global MMR
            const globalPlayers = allPlayers.filter(p => {
                const playerMainRole = getMainRole(p.roles);
                return playerMainRole.index === mainRole.index && p.attendance >= MIN_BATTLES;
            });

            const globalScores = calculateNormalizedScores(globalPlayers, mainRole.index);
            const globalBest = globalScores[0];
            const globalWorst = globalScores[globalScores.length - 1];
            const globalPlayerScore = globalScores.find(p => p.name === player.name);
            const globalRank = globalScores.findIndex(p => p.name === player.name) + 1;

            // Calculate Guild-only MMR
            const guildPlayers = allPlayers.filter(p => {
                const playerMainRole = getMainRole(p.roles);
                return playerMainRole.index === mainRole.index &&
                    p.attendance >= MIN_BATTLES &&
                    p.guildName === player.guildName;
            });

            const guildScores = calculateNormalizedScores(guildPlayers, mainRole.index);
            const guildBest = guildScores[0] || player;
            const guildWorst = guildScores[guildScores.length - 1] || player;
            const guildPlayerScore = guildScores.find(p => p.name === player.name) || { ...player, score: 0 };
            const guildRank = guildScores.findIndex(p => p.name === player.name) + 1 || guildScores.length;

            // Format stat comparisons
            const globalComparison = getStatComparison(player, globalBest);
            const guildComparison = getStatComparison(player, guildBest);

            const embed = new EmbedBuilder()
                .setTitle(`Player Stats: ${player.name}`)
                .setDescription(`Statistics from the last 30 days for battles with 20+ players.\nMinimum ${MIN_BATTLES} battles required for ranking.`)
                .addFields(
                    {
                        name: 'Main Role',
                        value: ROLE_NAMES[mainRole.index] || 'Unknown',
                        inline: true
                    },
                    {
                        name: 'Battles',
                        value: player.attendance.toString(),
                        inline: true
                    },
                    {
                        name: 'Average IP',
                        value: player.avgIp ? Math.round(player.avgIp).toString() : 'N/A',
                        inline: true
                    },
                    {
                        name: 'Combat Stats (Per Battle)',
                        value: [
                            `Kills: ${(player.kills / player.attendance).toFixed(1)}`,
                            `Deaths: ${(player.deaths / player.attendance).toFixed(1)}`,
                            `K/D: ${formatKD(calculateKD(player.kills || 0, player.deaths || 0))}`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: 'Performance (Per Battle)',
                        value: [
                            `Damage: ${Math.round(player.damage / player.attendance).toLocaleString()}`,
                            `Healing: ${Math.round(player.heal / player.attendance).toLocaleString()}`,
                            `Kill Fame: ${Math.round(player.killFame / player.attendance).toLocaleString()}`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: '\u200B',
                        value: '\u200B',
                        inline: true
                    },
                    {
                        name: 'MMR Rankings',
                        value: [
                            `🌍 Global: ${globalPlayerScore.score}/100 (#${globalRank} of ${globalScores.length} ${ROLE_NAMES[mainRole.index]}s)`,
                            `🏰 Guild: ${guildPlayerScore.score}/100 (#${guildRank} of ${guildScores.length} ${ROLE_NAMES[mainRole.index]}s)`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: `🥇 Top ${ROLE_NAMES[mainRole.index]} (Global)`,
                        value: [
                            `${globalBest.name}: ${globalBest.score}/100 (${globalBest.guildName})`,
                            `Battles: ${globalBest.attendance} (${globalComparison.comparisons.battles})`,
                            `Avg IP: ${Math.round(globalBest.avgIp)} (${globalComparison.comparisons.avgIp})`,
                            `K/D: ${formatKD(globalComparison.topAvgs.kd)} (${globalComparison.comparisons.kd})`,
                            `DMG/Battle: ${globalComparison.topAvgs.damage.toLocaleString()} (${globalComparison.comparisons.damage})`,
                            `Healing/Battle: ${globalComparison.topAvgs.healing.toLocaleString()} (${globalComparison.comparisons.healing})`,
                            `Fame/Battle: ${globalComparison.topAvgs.killFame.toLocaleString()} (${globalComparison.comparisons.killFame})`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: `🥇 Top ${ROLE_NAMES[mainRole.index]} (Guild)`,
                        value: [
                            `${guildBest.name}: ${guildBest.score}/100`,
                            `Battles: ${guildBest.attendance} (${guildComparison.comparisons.battles})`,
                            `Avg IP: ${Math.round(guildBest.avgIp)} (${guildComparison.comparisons.avgIp})`,
                            `K/D: ${formatKD(guildComparison.topAvgs.kd)} (${guildComparison.comparisons.kd})`,
                            `DMG/Battle: ${guildComparison.topAvgs.damage.toLocaleString()} (${guildComparison.comparisons.damage})`,
                            `Healing/Battle: ${guildComparison.topAvgs.healing.toLocaleString()} (${guildComparison.comparisons.healing})`,
                            `Fame/Battle: ${guildComparison.topAvgs.killFame.toLocaleString()} (${guildComparison.comparisons.killFame})`
                        ].join('\n'),
                        inline: true
                    }
                )
                .setColor(Colors.Blue)
                .setFooter({ 
                    text: getRoleMMRExplanation(mainRole.index)
                })
                .setTimestamp();

            await initialResponse.edit({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching player MMR:', error);
            await initialResponse.edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Error')
                        .setDescription('An error occurred while fetching player statistics.')
                        .setColor(Colors.Red)
                        .setTimestamp()
                ]
            });
        }
    }
}); 