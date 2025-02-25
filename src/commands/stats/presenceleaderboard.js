const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { formatDuration, getWeekStart, getMonthStart } = require('../../utils/timeUtils');
const { processActivityRecords, calculateActivityDistribution, fetchActivityData } = require('../../utils/activityUtils');

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
            let startDate;
            let title;

            switch (period) {
                case 'daily':
                    date.setHours(0, 0, 0, 0);
                    startDate = date;
                    break;
                case 'weekly':
                    startDate = getWeekStart(new Date());
                    break;
                case 'monthly':
                    startDate = getMonthStart(new Date());
                    break;
            }

            // Validate date before querying
            if (!(startDate instanceof Date) || isNaN(startDate)) {
                throw new Error('Invalid date generated');
            }

            // Get activity data using fetchActivityData
            const { data: stats } = await fetchActivityData({
                guildId: message.guild.id,
                period,
                startDate
            });

            if (!stats || !stats.length) {
                const noStatsEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('📊 Activity Leaderboard')
                    .setDescription(`No activity recorded for this ${period} period.`)
                    .setFooter({ text: 'Try joining a voice channel or sending messages!' });

                await reply({ embeds: [noStatsEmbed] });
                return;
            }

            // Process and sort all members
            const validEntries = await processActivityRecords(stats, async (userId) => {
                return await message.guild.members.fetch(userId);
            });

            // Filter out inactive members and sort by active time
            const activeEntries = validEntries.filter(entry => entry.activeTime > 0)
                .sort((a, b) => b.activeTime - a.activeTime);

            if (activeEntries.length === 0) {
                const noStatsEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('📊 Activity Leaderboard')
                    .setDescription(`No active members found for this ${period} period.`)
                    .setFooter({ text: 'Try joining a voice channel or sending messages!' });

                await reply({ embeds: [noStatsEmbed] });
                return;
            }

            // Create summary embed
            const summaryEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`📊 ${period.charAt(0).toUpperCase() + period.slice(1)} Activity Leaderboard`)
                .addFields(
                    {
                        name: 'Active Members',
                        value: `Total Active Members: ${activeEntries.length}`
                    }
                )
                .setTimestamp();

            // Create page embed function
            const getPageEmbed = (page) => {
                const start = page * 10;
                const end = Math.min(start + 10, activeEntries.length);
                const pageMembers = activeEntries.slice(start, end);

                return new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(`Activity Ranking (Page ${page + 1}/${Math.ceil(activeEntries.length / 10)})`)
                    .setDescription(
                        pageMembers.map(({ member, stats, activeTime, messageCount }, index) => {
                            const position = start + index + 1;
                            const medal = position <= 3 ? ['🥇', '🥈', '🥉'][position - 1] : `${position}.`;
                            
                            // Calculate total time and percentages
                            const mutedTime = stats?.mutedDeafenedTimeSeconds || 0;
                            const afkTime = stats?.afkTimeSeconds || 0;
                            const totalTime = activeTime + afkTime + mutedTime;
                            
                            // Calculate percentages
                            const activePercent = Math.round((activeTime / totalTime) * 100) || 0;
                            const afkPercent = Math.round((afkTime / totalTime) * 100) || 0;
                            const mutedPercent = Math.round((mutedTime / totalTime) * 100) || 0;

                            return [
                                `${medal} ${member.toString()}`,
                                `├ Voice Time: \`${formatDuration(totalTime)}\``,
                                `├ Active: \`${formatDuration(activeTime)}\` (${activePercent}%)`,
                                `├ AFK: \`${formatDuration(afkTime)}\` (${afkPercent}%)`,
                                `├ Muted: \`${formatDuration(mutedTime)}\` (${mutedPercent}%)`,
                                `└ Messages: \`${messageCount}\``
                            ].join('\n');
                        }).join('\n\n')
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
                        currentPage = Math.min(Math.ceil(activeEntries.length / 10) - 1, currentPage + 1);
                        break;
                    case 'last':
                        currentPage = Math.ceil(activeEntries.length / 10) - 1;
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

function getButtons(currentPage) {
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
            .setDisabled(currentPage === Math.ceil(activeEntries.length / 10) - 1),
        new ButtonBuilder()
            .setCustomId('last')
            .setLabel('Last ⏩')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === Math.ceil(activeEntries.length / 10) - 1)
    );
}