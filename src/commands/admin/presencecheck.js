const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { formatDuration, getWeekStart, getMonthStart } = require('../../utils/timeUtils');

const ACTIVITY_THRESHOLD_PERCENTAGE = 10; // 10% of top 10 average

module.exports = new Command({
    name: 'presencecheck',
    description: 'Check presence activity of members with a specific role',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    usage: '@role [daily|weekly|monthly]',
    cooldown: 10,
    async execute(message, args, handler) {
        try {
            // Handle both slash commands and prefix commands
            const isSlash = message.commandName === 'presencecheck';
            
            // Get role based on command type
            const role = isSlash ? 
                message.options.getRole('role') : 
                message.mentions.roles.first();

            if (!role) {
                const response = 'Please mention a role to check.';
                if (isSlash) {
                    await message.reply({ content: response, ephemeral: true });
                } else {
                    await message.reply(response);
                }
                return;
            }

            // Get period (daily, weekly or monthly)
            const period = isSlash ?
                (message.options.getString('period') || 'monthly') :
                (args[1] || 'monthly');

            // Validate period
            const validPeriods = ['daily', 'weekly', 'monthly'];
            const normalizedPeriod = period.toLowerCase();
            
            if (!validPeriods.includes(normalizedPeriod)) {
                const response = 'Invalid period. Use: daily, weekly or monthly';
                if (isSlash) {
                    await message.reply({ content: response, ephemeral: true });
                } else {
                    await message.reply(response);
                }
                return;
            }

            // Get the appropriate date and table based on period 
            let date;
            let table;
            let dateField;
            let stats = [];
            let isPartialData = false;

            switch (normalizedPeriod) {
                case 'daily':
                    date = new Date();
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

            // Get all members with the role
            const members = role.members;
            if (!members.size) {
                const response = 'No members found with this role.';
                if (isSlash) {
                    await message.reply({ content: response, ephemeral: true });
                } else {
                    await message.reply(response);
                }
                return;
            }

            // First try to get aggregated stats
            stats = await prisma[table].findMany({
                where: {
                    guildId: message.guild.id,
                    [dateField]: date,
                    userId: {
                        in: [...members.keys()]
                    }
                }
            });

            // For weekly and monthly periods, try to aggregate missing data
            if (normalizedPeriod !== 'daily') {
                let additionalStats = [];
                const periodStart = normalizedPeriod === 'weekly' ? getWeekStart(new Date()) : getMonthStart(new Date());
                const nextPeriod = new Date(periodStart);
                if (normalizedPeriod === 'weekly') {
                    nextPeriod.setDate(nextPeriod.getDate() + 7);
                } else {
                    nextPeriod.setMonth(nextPeriod.getMonth() + 1);
                }

                // For monthly, try weekly data first
                if (normalizedPeriod === 'monthly') {
                    const weeklyStats = await prisma.weeklyActivity.findMany({
                        where: {
                            guildId: message.guild.id,
                            userId: {
                                in: [...members.keys()]
                            },
                            weekStart: {
                                gte: periodStart,
                                lt: nextPeriod
                            }
                        }
                    });

                    if (weeklyStats.length > 0) {
                        isPartialData = true;
                        additionalStats = weeklyStats;
                    }
                }

                // If still no data (or for weekly period), try daily data
                if (additionalStats.length === 0) {
                    const dailyStats = await prisma.dailyActivity.findMany({
                        where: {
                            guildId: message.guild.id,
                            userId: {
                                in: [...members.keys()]
                            },
                            date: {
                                gte: periodStart,
                                lt: nextPeriod
                            }
                        }
                    });

                    if (dailyStats.length > 0) {
                        isPartialData = true;
                        additionalStats = dailyStats;
                    }
                }

                // Merge additional stats with existing stats
                if (additionalStats.length > 0) {
                    const mergedStats = new Map();
                    
                    // Process existing stats
                    stats.forEach(stat => {
                        mergedStats.set(stat.userId, {
                            userId: stat.userId,
                            voiceTimeSeconds: stat.voiceTimeSeconds || 0,
                            afkTimeSeconds: stat.afkTimeSeconds || 0,
                            mutedDeafenedTimeSeconds: stat.mutedDeafenedTimeSeconds || 0,
                            messageCount: stat.messageCount || 0
                        });
                    });

                    // Add or merge additional stats
                    additionalStats.forEach(stat => {
                        const existing = mergedStats.get(stat.userId) || {
                            userId: stat.userId,
                            voiceTimeSeconds: 0,
                            afkTimeSeconds: 0,
                            mutedDeafenedTimeSeconds: 0,
                            messageCount: 0
                        };

                        mergedStats.set(stat.userId, {
                            userId: stat.userId,
                            voiceTimeSeconds: existing.voiceTimeSeconds + (stat.voiceTimeSeconds || 0),
                            afkTimeSeconds: existing.afkTimeSeconds + (stat.afkTimeSeconds || 0),
                            mutedDeafenedTimeSeconds: existing.mutedDeafenedTimeSeconds + (stat.mutedDeafenedTimeSeconds || 0),
                            messageCount: existing.messageCount + (stat.messageCount || 0)
                        });
                    });

                    stats = Array.from(mergedStats.values());
                }
            }

            // Process and identify inactive members
            const memberActivities = [...members.values()].map(member => {
                const activity = stats.find(s => s.userId === member.id);
                const totalTime = activity?.voiceTimeSeconds || 0;
                const afkTime = activity?.afkTimeSeconds || 0;
                const mutedTime = activity?.mutedDeafenedTimeSeconds || 0;
                const activeTime = totalTime - afkTime - mutedTime;
                const activePercentage = top10Average > 0 
                    ? Math.round((activeTime / top10Average) * 100) 
                    : 0;

                return {
                    member,
                    isActive: activeTime >= activityThreshold,
                    totalTime,
                    activeTime,
                    activePercentage,
                    messageCount: activity?.messageCount || 0
                };
            });

            // Calculate top 10 average activity
            const sortedStats = [...stats].sort((a, b) => {
                const activeTimeA = a.voiceTimeSeconds - a.afkTimeSeconds - a.mutedDeafenedTimeSeconds;
                const activeTimeB = b.voiceTimeSeconds - b.afkTimeSeconds - b.mutedDeafenedTimeSeconds;
                return activeTimeB - activeTimeA;
            });

            const top10Stats = sortedStats.slice(0, 10);
            const top10Average = top10Stats.length > 0 
                ? top10Stats.reduce((sum, stat) => {
                    return sum + (stat.voiceTimeSeconds - stat.afkTimeSeconds - stat.mutedDeafenedTimeSeconds);
                }, 0) / top10Stats.length
                : 0;

            const activityThreshold = top10Average * (ACTIVITY_THRESHOLD_PERCENTAGE / 100);

            // Filter only inactive members and sort by activity percentage
            const inactiveMembers = memberActivities
                .filter(m => !m.isActive)
                .sort((a, b) => b.activeTime - a.activeTime);

            // Create initial summary embed
            const summaryEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(`${role.name} Inactivity Check`)
                .setDescription([
                    `Members with less than ${ACTIVITY_THRESHOLD_PERCENTAGE}% of top 10 average activity`,
                    `Top 10 Average Active Time: \`${formatDuration(top10Average)}\``,
                    `Required Active Time: \`${formatDuration(activityThreshold)}\``,
                ].join('\n'))
                .addFields(
                    {
                        name: '📊 Summary',
                        value: [
                            `Total Members: \`${members.size}\``,
                            `Active Members: \`${members.size - inactiveMembers.length}\``,
                            `Inactive Members: \`${inactiveMembers.length}\``,
                        ].join('\n')
                    }
                )
                .setTimestamp();

            // Send summary embed
            const initialResponse = await (isSlash ?
                message.reply({ embeds: [summaryEmbed], fetchReply: true }) :
                message.reply({ embeds: [summaryEmbed] })
            );

            if (inactiveMembers.length === 0) {
                const response = '✅ No inactive members found!';
                if (isSlash) {
                    await message.followUp({ content: response, ephemeral: true });
                } else {
                    await message.channel.send(response);
                }
                return;
            }

            // Initialize pagination
            const itemsPerPage = 20;
            const pages = Math.ceil(inactiveMembers.length / itemsPerPage);
            let currentPage = 0;

            // Create page embed
            const getPageEmbed = (page) => {
                const start = page * itemsPerPage;
                const end = Math.min(start + itemsPerPage, inactiveMembers.length);
                const pageMembers = inactiveMembers.slice(start, end);

                return new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`Inactive Members (Page ${page + 1}/${pages})`)
                    .setDescription([
                        isPartialData ? '⚠️ **Note:** Some data is aggregated from daily/weekly records.' : '',
                        pageMembers.map(({ member, activeTime, activePercentage, messageCount }) => {
                            const activity = stats.find(s => s.userId === member.id);
                            const afkTime = activity?.afkTimeSeconds || 0;
                            const mutedTime = activity?.mutedDeafenedTimeSeconds || 0;
                            const totalTime = activity?.voiceTimeSeconds || 0;
                            const details = totalTime > 0 || afkTime > 0 || mutedTime > 0
                                ? `Voice: \`${formatDuration(totalTime)}\` (${activePercentage}% of top avg) • AFK: \`${formatDuration(afkTime)}\` • Muted: \`${formatDuration(mutedTime)}\` • Messages: \`${messageCount}\``
                                : '`No activity recorded`';
                            return `🔴 ${member.toString()} - ${details}`;
                        }).join('\n')
                    ])
                    .setFooter({ 
                        text: `Required Active Time: ${formatDuration(activityThreshold)} • Total inactive: ${inactiveMembers.length}` 
                    });
            };

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
                if (interaction.user.id !== (isSlash ? message.user.id : message.author.id)) {
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
            console.error('Role check error:', error);
            const response = 'Error checking role activity.';
            if (isSlash) {
                if (!message.replied) {
                    await message.reply({ content: response, ephemeral: true });
                } else {
                    await message.followUp({ content: response, ephemeral: true });
                }
            } else {
                await message.reply(response);
            }
        }
    }
}); 