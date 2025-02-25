const { EmbedBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const { formatDuration, getMonthStart } = require('../../utils/timeUtils');
const { calculateActivityStats, fetchActivityData } = require('../../utils/activityUtils');

module.exports = new Command({
    name: 'presencemonthly',
    description: 'Check monthly activity stats for a user',
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
            // For slash commands, defer the reply immediately
            if (isSlash) {
                await message.deferReply({ ephemeral: true });
            }

            // Handle both slash commands and regular commands
            const targetUser = isSlash ? 
                (message.options.getUser('user') || message.user) : 
                (args?.user || message.author);

            const member = await message.guild.members.fetch(targetUser.id);
            const monthStart = getMonthStart(new Date());

            // Fetch activity data with fallback
            const { data: stats, isPartialData } = await fetchActivityData({
                userId: targetUser.id,
                guildId: message.guild.id,
                period: 'monthly',
                startDate: monthStart
            });

            if (!stats) {
                const noStatsEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setAuthor({
                        name: member.displayName,
                        iconURL: targetUser.displayAvatarURL({ dynamic: true })
                    })
                    .setDescription('❌ No activity recorded this month.')
                    .setFooter({ text: 'Try joining a voice channel or sending messages!' });

                if (isSlash) {
                    await message.editReply({ embeds: [noStatsEmbed] });
                } else {
                    await message.reply({ embeds: [noStatsEmbed] });
                }
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
                    name: `${member.displayName}'s Monthly Activity`,
                    iconURL: targetUser.displayAvatarURL({ dynamic: true })
                })
                .setDescription([
                    `Activity stats for month starting <t:${Math.floor(monthStart.getTime() / 1000)}:D>`,
                    isPartialData ? '⚠️ **Note:** This is partial data aggregated from available weekly/daily records.' : ''
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

            if (isSlash) {
                await message.editReply({ embeds: [embed] });
            } else {
                await message.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in presencemonthly command:', error);
            const errorMessage = 'An error occurred while fetching monthly stats.';
            
            if (isSlash) {
                try {
                    await message.editReply(errorMessage);
                } catch {
                    // If editReply fails, try to send a new reply
                    await message.reply({ content: errorMessage, ephemeral: true });
                }
            } else {
                await message.reply(errorMessage);
            }
        }
    }
});