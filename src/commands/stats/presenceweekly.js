const { EmbedBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const { formatDuration, getWeekStart } = require('../../utils/timeUtils');
const { calculateActivityStats, fetchActivityData } = require('../../utils/activityUtils');

module.exports = new Command({
    name: 'presenceweekly',
    description: 'Check weekly activity stats for a user',
    defaultMemberPermissions: null,
    options: [
        {
            name: 'user',
            description: 'User to check stats for (defaults to you)',
            type: 6,
            required: false
        }
    ],
    async execute(message, args, isSlash = false) {
        try {
            const targetUser = args?.user || message.author;
            const member = await message.guild.members.fetch(targetUser.id);
            const weekStart = getWeekStart(new Date());

            // Fetch activity data with fallback
            const { data: stats, isPartialData } = await fetchActivityData({
                userId: targetUser.id,
                guildId: message.guild.id,
                period: 'weekly',
                startDate: weekStart
            });

            if (!stats) {
                const noStatsEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setAuthor({
                        name: member.displayName,
                        iconURL: targetUser.displayAvatarURL({ dynamic: true })
                    })
                    .setDescription('❌ No activity recorded this week.')
                    .setFooter({ text: 'Try joining a voice channel or sending messages!' });

                await message.reply({ 
                    embeds: [noStatsEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            // Calculate activity stats
            const activityStats = calculateActivityStats(stats);

            // Create progress bar for active/AFK ratio
            const progressBarLength = 20;
            const activeBlocks = Math.round((activityStats.activePercentage / 100) * progressBarLength);
            const progressBar = '█'.repeat(activeBlocks) + '░'.repeat(progressBarLength - activeBlocks);

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setAuthor({
                    name: `${member.displayName}'s Weekly Activity`,
                    iconURL: targetUser.displayAvatarURL({ dynamic: true })
                })
                .setDescription([
                    `Activity stats for week starting <t:${Math.floor(weekStart.getTime() / 1000)}:D>`,
                    isPartialData ? '⚠️ **Note:** This is partial data aggregated from available daily records.' : ''
                ].filter(Boolean).join('\n'))
                .addFields(
                    {
                        name: '🎤 Voice Activity',
                        value: [
                            `Total Time: \`${formatDuration(activityStats.totalTime)}\``,
                            `Active Time: \`${formatDuration(activityStats.activeTime)}\``,
                            `AFK Time: \`${formatDuration(activityStats.afkTime)}\``,
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: '💬 Chat Activity',
                        value: `Messages Sent: \`${activityStats.messageCount}\``,
                        inline: true
                    },
                    {
                        name: '\u200B',
                        value: '\u200B',
                        inline: false
                    },
                    {
                        name: '📊 Activity Distribution',
                        value: [
                            `${progressBar}`,
                            `Active: ${activityStats.activePercentage}% | AFK: ${100 - activityStats.activePercentage}%`
                        ].join('\n')
                    }
                );

            await message.reply({ 
                embeds: [embed],
                ephemeral: isSlash
            });
        } catch (error) {
            console.error('Error in presenceweekly command:', error);
            await message.reply({ 
                content: '❌ An error occurred while fetching activity stats.',
                ephemeral: isSlash
            });
        }
    }
});