const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { formatDuration, getWeekStart, getMonthStart } = require('../../utils/timeUtils');
const { processActivityRecords, calculateActivityDistribution } = require('../../utils/activityUtils');

module.exports = new Command({
    name: 'presenceleaderboard',
    description: 'Shows server presence leaderboard',
    category: 'stats',
    usage: '[daily|weekly|monthly]',
    aliases: ['plb'],
    cooldown: 10,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'presenceleaderboard';
            const reply = async (options) => {
                if (isSlash) {
                    if (!message.deferred && !message.replied) {
                        return await message.reply(options);
                    } else {
                        return await message.followUp(options);
                    }
                } else {
                    return await message.reply(options);
                }
            };

            // Defer the reply for slash commands
            if (isSlash) {
                await message.deferReply();
            }

            // Get period from args or interaction options
            let period;
            if (isSlash) {
                period = (message.options?.getString('period') || 'monthly').toLowerCase();
            } else {
                period = (args[0] || 'monthly').toLowerCase();
            }

            // Validate period
            if (!['daily', 'weekly', 'monthly'].includes(period)) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription('❌ Invalid period. Use: daily, weekly, or monthly');
                
                await reply({ embeds: [errorEmbed] });
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
                    guildId: message.guild.id,
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
                        guildId: message.guild.id,
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

            // Process and sort all members
            const validEntries = await processActivityRecords(stats, async (userId) => {
                return await message.guild.members.fetch(userId);
            });

            if (validEntries.length === 0) {
                const noStatsEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('📊 Activity Leaderboard')
                    .setDescription(`No activity recorded for this ${period} period.`)
                    .setFooter({ text: 'Try joining a voice channel or sending messages!' });

                await reply({ embeds: [noStatsEmbed] });
                return;
            }

            // Calculate activity distribution
            const distribution = calculateActivityDistribution(validEntries);

            // Create progress bar for active/inactive ratio
            const progressBarLength = 20;
            const activeBlocks = Math.round((distribution.activePercentage / 100) * progressBarLength);
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
                            `Active: ${distribution.activePercentage}% (${distribution.activeMembers} members)`,
                            `Inactive: ${distribution.inactivePercentage}% (${distribution.inactiveMembers} members)`,
                            `Total Members: ${distribution.totalMembers}`
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
                        }).join('\n')
                    );
            };

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

            // Send summary embed
            await reply({ embeds: [summaryEmbed] });

            // Send initial page with buttons
            const pageMessage = await (isSlash ? 
                message.followUp({
                    embeds: [getPageEmbed(0)],
                    components: [getButtons(0)]
                }) :
                message.channel.send({
                    embeds: [getPageEmbed(0)],
                    components: [getButtons(0)]
                })
            );

            // Create button collector
            const collector = pageMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (interaction) => {
                // Check if the interaction is from the command user
                const commandUserId = isSlash ? message.user.id : message.author.id;
                if (interaction.user.id !== commandUserId) {
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

            collector.on('end', async () => {
                try {
                    await pageMessage.edit({ components: [] });
                } catch (error) {
                    console.error('Error removing buttons:', error);
                }
            });

        } catch (error) {
            console.error('Error generating leaderboard:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error')
                .setDescription('Failed to generate leaderboard. Please try again later.');

            try {
                if (isSlash) {
                    if (!message.deferred && !message.replied) {
                        await message.reply({ embeds: [errorEmbed] });
                    } else {
                        await message.followUp({ embeds: [errorEmbed] });
                    }
                } else {
                    await message.reply({ embeds: [errorEmbed] });
                }
            } catch (e) {
                console.error('Error sending error message:', e);
            }
        }
    }
}); 