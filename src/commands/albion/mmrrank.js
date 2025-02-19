const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { fetchGuildStats, getMainRole } = require('../../utils/albionApi');
const { EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { 
    calculateKD, 
    formatKD, 
    calculateNormalizedScores,
    MIN_BATTLES 
} = require('../../utils/mmrCalculator');
const { ROLE_NAMES } = require('../../utils/constants');

module.exports = new Command({
    name: 'mmrrank',
    description: 'Show MMR ranking by role for the guild',
    category: 'albion',
    usage: '[role]',
    cooldown: 30,
    async execute(message, args) {
        const initialResponse = await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Fetching Data')
                    .setDescription('Retrieving guild statistics...')
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

            const roleParam = args[0]?.toLowerCase();
            const roleMap = {
                'tank': 0,
                'support': 1,
                'healer': 2,
                'melee': 3,
                'ranged': 4,
                'mount': 5
            };

            // Fetch guild stats
            const guildStats = await fetchGuildStats(settings.albionGuildId);
            if (!guildStats || !guildStats.length) {
                await initialResponse.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('Error')
                            .setDescription('Failed to fetch guild stats.')
                            .setColor(Colors.Red)
                            .setTimestamp()
                    ]
                });
                return;
            }

            // Group players by role and calculate scores
            const roleGroups = [[], [], [], [], [], []]; // One array for each role
            guildStats.forEach(player => {
                const mainRole = getMainRole(player.roles);
                if (player.attendance >= MIN_BATTLES) {
                    roleGroups[mainRole.index].push(player);
                }
            });

            // Create pages for each role
            const pages = [];
            roleGroups.forEach((players, roleIndex) => {
                if (players.length === 0) return;
                if (roleParam && roleMap[roleParam] !== roleIndex) return;

                const scores = calculateNormalizedScores(players, roleIndex);
                const embed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(`${ROLE_NAMES[roleIndex]} Rankings`)
                    .setDescription([
                        `Statistics from the last 30 days for battles with 20+ players.`,
                        `Minimum ${MIN_BATTLES} battles required for ranking.`,
                        '',
                        '```',
                        'Rank  Player Name        Score  IP    Battles  K/D     Stats',
                        '─────────────────────────────────────────────────────────────',
                        ...scores.map((player, index) => {
                            const kd = formatKD(calculateKD(player.kills || 0, player.deaths || 0));
                            const avgDamage = Math.round(player.damage / player.attendance).toLocaleString();
                            const avgHealing = Math.round(player.heal / player.attendance).toLocaleString();
                            const avgKillFame = Math.round(player.killFame / player.attendance).toLocaleString();

                            let stats;
                            switch (roleIndex) {
                                case 0: // Tank
                                    stats = `Fame: ${avgKillFame}`;
                                    break;
                                case 1: // Support
                                case 2: // Healer
                                    stats = `Heal: ${avgHealing}`;
                                    break;
                                case 3: // DPS Melee
                                case 4: // DPS Ranged
                                    stats = `DMG: ${avgDamage}`;
                                    break;
                                case 5: // Battlemount
                                    stats = `Fame: ${avgKillFame}`;
                                    break;
                            }

                            return [
                                `${(index + 1).toString().padStart(3)}. `,
                                `${player.name.padEnd(16)} `,
                                `${player.score.toString().padStart(3)}/100 `,
                                `${Math.round(player.avgIp).toString().padStart(4)} `,
                                `${player.attendance.toString().padStart(4)}    `,
                                `${kd.padStart(6)} `,
                                `${stats}`
                            ].join('');
                        }),
                        '```'
                    ].join('\n'))
                    .setFooter({ 
                        text: `Page ${pages.length + 1}/${roleGroups.filter(g => g.length > 0).length} • ${scores.length} players`
                    })
                    .setTimestamp();

                pages.push(embed);
            });

            if (pages.length === 0) {
                await initialResponse.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('No Data')
                            .setDescription(`No players found${roleParam ? ` for role: ${roleParam}` : ''} with minimum ${MIN_BATTLES} battles.`)
                            .setColor(Colors.Yellow)
                            .setTimestamp()
                    ]
                });
                return;
            }

            let currentPage = 0;

            // Create navigation buttons
            const getButtons = (currentPage) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('first')
                        .setLabel('⏪ First')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === pages.length - 1),
                    new ButtonBuilder()
                        .setCustomId('last')
                        .setLabel('Last ⏩')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === pages.length - 1)
                );
            };

            // Send initial page
            const response = await initialResponse.edit({
                embeds: [pages[0]],
                components: [getButtons(0)]
            });

            // Create button collector
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (interaction) => {
                if (interaction.user.id !== message.author.id) {
                    await interaction.reply({ 
                        content: 'Only the command user can navigate pages.', 
                        ephemeral: true 
                    });
                    return;
                }

                switch (interaction.customId) {
                    case 'first':
                        currentPage = 0;
                        break;
                    case 'prev':
                        currentPage = Math.max(0, currentPage - 1);
                        break;
                    case 'next':
                        currentPage = Math.min(pages.length - 1, currentPage + 1);
                        break;
                    case 'last':
                        currentPage = pages.length - 1;
                        break;
                }

                await interaction.update({
                    embeds: [pages[currentPage]],
                    components: [getButtons(currentPage)]
                });
            });

            collector.on('end', () => {
                response.edit({ components: [] }).catch(() => {});
            });

        } catch (error) {
            console.error('Error generating MMR ranking:', error);
            await initialResponse.edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Error')
                        .setDescription('An error occurred while generating the MMR ranking.')
                        .setColor(Colors.Red)
                        .setTimestamp()
                ]
            });
        }
    }
}); 