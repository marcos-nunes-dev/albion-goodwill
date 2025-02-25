const { EmbedBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const { formatDuration, getMonthStart } = require('../../utils/timeUtils');
const { calculateActivityStats, fetchActivityData } = require('../../utils/activityUtils');

const ACTIVITY_THRESHOLD_PERCENTAGE = 5; // 5% of top 10 average
const ITEMS_PER_PAGE = 10;

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

            // Fetch activity data
            const { data: stats } = await fetchActivityData({
                userId: targetUser.id,
                guildId: message.guild.id,
                period: 'monthly',
                startDate: monthStart
            });

            // Calculate activity stats
            const activityStats = calculateActivityStats(stats || null);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(activityStats.isActive ? 0x00FF00 : 0xFF4444)
                .setAuthor({
                    name: `${member.displayName}'s Monthly Activity`,
                    iconURL: targetUser.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp(monthStart)
                .setFooter({ text: 'Stats since' });

            if (!stats) {
                embed.setDescription('❌ No activity recorded this month.\nTry joining a voice channel or sending messages!');
            } else {
                // Create progress bar for active/AFK/muted distribution
                const progressBarLength = 20;
                const totalTime = activityStats.totalTime || 1; // Prevent division by zero
                const activePercent = Math.round((activityStats.activeTime / totalTime) * 100) || 0;
                const afkPercent = Math.round((activityStats.afkTime / totalTime) * 100) || 0;
                const mutedPercent = Math.round((activityStats.mutedTime / totalTime) * 100) || 0;

                // Ensure percentages add up to 100%
                const totalPercent = activePercent + afkPercent + mutedPercent;
                const activeBlocks = Math.round((activePercent / 100) * progressBarLength) || 0;
                const afkBlocks = Math.round((afkPercent / 100) * progressBarLength) || 0;
                const mutedBlocks = progressBarLength - activeBlocks - afkBlocks;

                const progressBar = '🟩'.repeat(activeBlocks) + '🟨'.repeat(afkBlocks) + '🟥'.repeat(mutedBlocks);

                const description = [
                    `${activityStats.isActive ? '✅ Active' : '⚠️ Inactive'}`,
                    '',
                    '🎙️ **Voice Activity**',
                    `• Total Time: \`${formatDuration(activityStats.totalTime)}\``,
                    `• Active Time: \`${formatDuration(activityStats.activeTime)}\``,
                    `• AFK Time: \`${formatDuration(activityStats.afkTime)}\``,
                    `• Muted Time: \`${formatDuration(activityStats.mutedTime)}\``,
                    `• Activity: \`${activityStats.activePercentage || 0}%\` of requirement`,
                    '',
                    '📊 **Time Distribution**',
                    progressBar,
                    `• Active: \`${activePercent}%\``,
                    `• AFK: \`${afkPercent}%\``,
                    `• Muted: \`${mutedPercent}%\``,
                    '',
                    '💬 **Messages**',
                    `• Total: \`${activityStats.messageCount || 0}\``,
                    '',
                    `Required Active Time: \`${formatDuration(activityStats.requiredTime)}\``
                ].join('\n');

                embed.setDescription(description);
            }

            // Send the response
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