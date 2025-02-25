const { EmbedBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const { formatDuration } = require('../../utils/timeUtils');
const { calculateActivityStats, fetchActivityData } = require('../../utils/activityUtils');

const ACTIVITY_THRESHOLD_PERCENTAGE = 5; // 5% of top 10 average
const ITEMS_PER_PAGE = 10;

module.exports = new Command({
    name: 'presencedaily',
    description: 'Check daily activity stats for a user',
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
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Fetch activity data
            const { data: stats } = await fetchActivityData({
                userId: targetUser.id,
                guildId: message.guild.id,
                period: 'daily',
                startDate: today
            });

            // Calculate activity stats
            const activityStats = calculateActivityStats(stats || null);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(activityStats.isActive ? 0x00FF00 : 0xFF4444)
                .setAuthor({
                    name: `${member.displayName}'s Daily Activity`,
                    iconURL: targetUser.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp(today)
                .setFooter({ text: 'Stats since' });

            if (!stats) {
                embed.setDescription('❌ No activity recorded today.\nTry joining a voice channel or sending messages!');
            } else {
                // Create progress bar for active/AFK/muted distribution
                const progressBarLength = 20;
                const totalTime = activityStats.totalTime || 1; // Prevent division by zero
                const activeBlocks = Math.round((activityStats.activeTime / totalTime) * progressBarLength);
                const afkBlocks = Math.round((activityStats.afkTime / totalTime) * progressBarLength);
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
                    `• Activity: \`${activityStats.activePercentage}%\` of requirement`,
                    '',
                    '📊 **Time Distribution**',
                    progressBar,
                    `• Active: \`${Math.round((activityStats.activeTime / totalTime) * 100)}%\``,
                    `• AFK: \`${Math.round((activityStats.afkTime / totalTime) * 100)}%\``,
                    `• Muted: \`${Math.round((activityStats.mutedTime / totalTime) * 100)}%\``,
                    '',
                    '💬 **Messages**',
                    `• Total: \`${activityStats.messageCount}\``,
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
            console.error('Error in presencedaily command:', error);
            const errorMessage = 'An error occurred while fetching daily stats.';
            
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