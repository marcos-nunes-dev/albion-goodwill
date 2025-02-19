const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { formatDuration, getWeekStart, getMonthStart } = require('../../utils/timeUtils');

module.exports = new Command({
    name: 'presenceleaderboard',
    description: 'Shows server presence leaderboard',
    category: 'stats',
    usage: '[daily|weekly|monthly]',
    aliases: ['plb'],
    cooldown: 10,
    async execute(source, args, handler) {
        try {
            // Determine if this is a slash command or message command
            const isInteraction = source.commandName !== undefined;
            
            // Get period from args or interaction options
            let period;
            if (isInteraction) {
                period = (source.options?.getString('period') || 'monthly').toLowerCase();
            } else {
                period = (args[0] || 'monthly').toLowerCase();
            }

            // Validate period
            if (!['daily', 'weekly', 'monthly'].includes(period)) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription('❌ Invalid period. Use: daily, weekly, or monthly');
                
                if (isInteraction) {
                    await source.reply({ embeds: [errorEmbed], ephemeral: true });
                } else {
                    await source.reply({ embeds: [errorEmbed] });
                }
                return;
            }

            // Get the appropriate date and table based on period
            let date = new Date();
            let table;
            let dateField;
            let stats = [];

            switch (period) {
                case 'daily':
                    date.setHours(0, 0, 0, 0);
                    table = 'dailyActivity';
                    dateField = 'date';
                    break;
                case 'weekly':
                    date = getWeekStart(new Date());
                    table = 'weeklyActivity';
                    dateField = 'weekStart';
                    break;
                case 'monthly':
                    date = getMonthStart(new Date());
                    table = 'monthlyActivity';
                    dateField = 'monthStart';
                    break;
            }

            // Validate date before querying
            if (!(date instanceof Date) || isNaN(date)) {
                throw new Error('Invalid date generated');
            }

            // First try to get aggregated stats
            stats = await prisma[table].findMany({
                where: {
                    guildId: source.guild.id,
                    [dateField]: date
                }
            });

            // If no monthly stats found, aggregate from daily data
            if (stats.length === 0 && period === 'monthly') {
                const monthStart = getMonthStart(new Date());
                const nextMonth = new Date(monthStart);
                nextMonth.setMonth(nextMonth.getMonth() + 1);

                stats = await prisma.dailyActivity.groupBy({
                    by: ['userId'],
                    where: {
                        guildId: source.guild.id,
                        date: {
                            gte: monthStart,
                            lt: nextMonth
                        }
                    },
                    _sum: {
                        voiceTimeSeconds: true,
                        afkTimeSeconds: true,
                        messageCount: true
                    }
                });

                // Transform grouped data to match regular stats format
                stats = stats.map(stat => ({
                    userId: stat.userId,
                    voiceTimeSeconds: stat._sum.voiceTimeSeconds || 0,
                    afkTimeSeconds: stat._sum.afkTimeSeconds || 0,
                    messageCount: stat._sum.messageCount || 0
                }));
            }

            if (stats.length === 0) {
                const noStatsEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('📊 Activity Leaderboard')
                    .setDescription(`No activity recorded for this ${period} period.`)
                    .setFooter({ text: 'Try joining a voice channel or sending messages!' });

                if (isInteraction) {
                    await source.reply({ embeds: [noStatsEmbed] });
                } else {
                    await source.reply({ embeds: [noStatsEmbed] });
                }
                return;
            }

            // Process and sort all members
            const memberActivities = await Promise.all(
                stats.map(async (stat) => {
                    const member = await source.guild.members.fetch(stat.userId).catch(() => null);
                    if (!member) return null;

                    const activeTime = stat.voiceTimeSeconds - stat.afkTimeSeconds;
                    const totalTime = stat.voiceTimeSeconds;
                    const activePercentage = totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 0;

                    return {
                        member,
                        activeTime,
                        messageCount: stat.messageCount,
                        activePercentage,
                        isActive: activeTime > 0 // Consider members with any active time as active
                    };
                })
            );

            // Filter out null entries and sort by active time
            const validEntries = memberActivities
                .filter(entry => entry !== null)
                .sort((a, b) => b.activeTime - a.activeTime);

            // Calculate activity percentages
            const totalMembers = validEntries.length;
            const activeMembers = validEntries.filter(entry => entry.isActive).length;
            const inactiveMembers = totalMembers - activeMembers;
            const activePercentage = totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 100) : 0;
            const inactivePercentage = 100 - activePercentage;

            // Create progress bar for active/inactive ratio
            const progressBarLength = 20;
            const activeBlocks = Math.round((activePercentage / 100) * progressBarLength);
            const progressBar = '█'.repeat(activeBlocks) + '░'.repeat(progressBarLength - activeBlocks);

            // Create summary embed
            const summaryEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`📊 ${period.charAt(0).toUpperCase() + period.slice(1)} Activity Leaderboard`)
                .addFields(
                    {
                        name: 'Activity Distribution',
                        value: [
                            `${progressBar}`,
                            `Active: ${activePercentage}% (${activeMembers} members)`,
                            `Inactive: ${inactivePercentage}% (${inactiveMembers} members)`,
                            `Total Members: ${totalMembers}`
                        ].join('\n')
                    }
                )
                .setTimestamp();

            // Create page embed function
            const getPageEmbed = (page) => {
                const start = page * itemsPerPage;
                const end = Math.min(start + itemsPerPage, validEntries.length);
                const pageMembers = validEntries.slice(start, end);

                return new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(`Activity Ranking (Page ${page + 1}/${pages})`)
                    .setDescription(
                        pageMembers.map(({ member, activeTime, messageCount, activePercentage }, index) => {
                            const position = start + index + 1;
                            const medal = position <= 3 ? ['🥇', '🥈', '🥉'][position - 1] : `${position}.`;
                            const status = activeTime > 0 ? '🟢' : '🔴';
                            return [
                                `${medal} ${status} ${member.toString()}`,
                                `└ Voice: \`${formatDuration(activeTime)}\` • Messages: \`${messageCount}\` • Active: \`${activePercentage}%\``
                            ].join('\n');
                        }).join('\n\n')
                    )
                    .setFooter({ text: `Total Members: ${validEntries.length}` });
            };

            // Send initial response
            let initialMessage;
            if (isInteraction) {
                await source.reply({ embeds: [summaryEmbed] });
                initialMessage = await source.fetchReply();
            } else {
                initialMessage = await source.reply({ embeds: [summaryEmbed] });
            }

            // Initialize pagination
            const itemsPerPage = 10;
            const pages = Math.ceil(validEntries.length / itemsPerPage);
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
                        .setDisabled(currentPage === pages - 1),
                    new ButtonBuilder()
                        .setCustomId('last')
                        .setLabel('Last ⏩')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === pages - 1)
                );
            };

            // Send initial page
            const pageMessage = await source.channel.send({
                embeds: [getPageEmbed(0)],
                components: [getButtons(0)]
            });

            // Create button collector
            const collector = pageMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (interaction) => {
                const userId = isInteraction ? source.user.id : source.author.id;
                if (interaction.user.id !== userId) {
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
                        currentPage = Math.min(pages - 1, currentPage + 1);
                        break;
                    case 'last':
                        currentPage = pages - 1;
                        break;
                }

                await interaction.update({
                    embeds: [getPageEmbed(currentPage)],
                    components: [getButtons(currentPage)]
                });
            });

            collector.on('end', () => {
                pageMessage.edit({ components: [] }).catch(() => {});
            });

        } catch (error) {
            console.error('Error generating leaderboard:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error')
                .setDescription('Failed to generate leaderboard. Please try again later.');

            if (isInteraction) {
                if (!source.replied) {
                    await source.reply({ embeds: [errorEmbed], ephemeral: true });
                } else {
                    await source.followUp({ embeds: [errorEmbed], ephemeral: true });
                }
            } else {
                await source.reply({ embeds: [errorEmbed] });
            }
        }
    }
}); 