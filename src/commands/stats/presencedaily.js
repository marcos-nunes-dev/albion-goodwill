const { EmbedBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const { formatDuration } = require('../../utils/timeUtils');
const { calculateActivityStats, fetchActivityData } = require('../../utils/activityUtils');

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

            if (!stats) {
                const noStatsEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setAuthor({
                        name: member.displayName,
                        iconURL: targetUser.displayAvatarURL({ dynamic: true })
                    })
                    .setDescription('❌ No activity recorded today.')
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

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setAuthor({
                    name: `${member.displayName}'s Daily Activity`,
                    iconURL: targetUser.displayAvatarURL({ dynamic: true })
                })
                .addFields(
                    { 
                        name: '🎙️ Voice Activity',
                        value: [
                            `Total Time: \`${formatDuration(activityStats.totalTime)}\``,
                            `Active Time: \`${formatDuration(activityStats.activeTime)}\``,
                            `AFK Time: \`${formatDuration(activityStats.afkTime)}\``,
                            `Active %: \`${activityStats.activePercentage}%\``
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: '💬 Messages',
                        value: `Total: \`${activityStats.messageCount}\``,
                        inline: true
                    }
                )
                .setTimestamp(today)
                .setFooter({ text: 'Stats since' });

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