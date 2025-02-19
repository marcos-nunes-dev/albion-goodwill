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
            // Check if a role was mentioned
            const role = message.mentions.roles.first();
            if (!role) {
                await message.reply('Please mention a role to check.');
                return;
            }

            // Get period (daily, weekly or monthly)
            const period = (args[1] || 'daily').toLowerCase();
            if (!['daily', 'weekly', 'monthly'].includes(period)) {
                await message.reply('Invalid period. Use: daily, weekly or monthly');
                return;
            }

            // Get the appropriate date and table based on period
            let date = new Date();
            let table;
            let dateField;

            if (period === 'daily') {
                date.setHours(0, 0, 0, 0);
                table = 'dailyActivity';
                dateField = 'date';
            } else if (period === 'weekly') {
                date = getWeekStart();
                table = 'weeklyActivity';
                dateField = 'weekStart';
            } else {
                date = getMonthStart();
                table = 'monthlyActivity';
                dateField = 'monthStart';
            }

            // Get all members with the role
            const members = role.members;
            if (!members.size) {
                await message.reply('No members found with this role.');
                return;
            }

            // Get activity stats for these members
            const stats = await prisma[table].findMany({
                where: {
                    guildId: message.guild.id,
                    [dateField]: date,
                    userId: {
                        in: [...members.keys()]
                    }
                }
            });

            // Calculate top 10 average activity
            const sortedStats = [...stats].sort((a, b) => {
                const activeTimeA = a.voiceTimeSeconds - a.afkTimeSeconds;
                const activeTimeB = b.voiceTimeSeconds - b.afkTimeSeconds;
                return activeTimeB - activeTimeA;
            });

            const top10Stats = sortedStats.slice(0, 10);
            const top10Average = top10Stats.length > 0 
                ? top10Stats.reduce((sum, stat) => {
                    return sum + (stat.voiceTimeSeconds - stat.afkTimeSeconds);
                }, 0) / top10Stats.length
                : 0;

            const activityThreshold = top10Average * (ACTIVITY_THRESHOLD_PERCENTAGE / 100);

            // Process and identify inactive members
            const memberActivities = [...members.values()].map(member => {
                const activity = stats.find(s => s.userId === member.id);
                const totalTime = activity?.voiceTimeSeconds || 0;
                const activeTime = activity ? (activity.voiceTimeSeconds - activity.afkTimeSeconds) : 0;
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

            // Filter only inactive members and sort by activity percentage
            const inactiveMembers = memberActivities
                .filter(m => !m.isActive)
                .sort((a, b) => b.activeTime - a.activeTime); // Sort by active time descending

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
            await message.reply({ embeds: [summaryEmbed] });

            if (inactiveMembers.length === 0) {
                await message.channel.send('✅ No inactive members found!');
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
                    .setDescription(
                        pageMembers.map(({ member, activeTime, activePercentage, messageCount }) => {
                            const details = activeTime > 0
                                ? `Voice: \`${formatDuration(activeTime)}\` (${activePercentage}% of top avg) • Messages: \`${messageCount}\``
                                : '`No activity recorded`';
                            return `🔴 ${member.toString()} - ${details}`;
                        }).join('\n')
                    )
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
            const pageMessage = await message.channel.send({
                embeds: [getPageEmbed(0)],
                components: [getButtons(0)]
            });

            // Create button collector
            const collector = pageMessage.createMessageComponentCollector({
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
            await message.reply('Error checking role activity.');
        }
    }
}); 