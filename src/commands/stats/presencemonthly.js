const { EmbedBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { formatDuration, getMonthStart } = require('../../utils/timeUtils');

module.exports = new Command({
    name: 'presencemonthly',
    description: 'Shows monthly presence stats for a user',
    category: 'stats',
    usage: '[@user]',
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const monthStart = getMonthStart();
            const targetUser = message.mentions.users.first() || message.author;
            const member = await message.guild.members.fetch(targetUser.id);

            const stats = await prisma.monthlyActivity.findUnique({
                where: {
                    userId_guildId_monthStart: {
                        userId: targetUser.id,
                        guildId: message.guild.id,
                        monthStart
                    }
                }
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

                await message.reply({ embeds: [noStatsEmbed] });
                return;
            }

            // Calculate percentages and averages
            const totalTime = stats.voiceTimeSeconds;
            const activeTime = stats.voiceTimeSeconds - stats.afkTimeSeconds;
            const activePercentage = totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 0;
            const afkPercentage = totalTime > 0 ? Math.round((stats.afkTimeSeconds / totalTime) * 100) : 0;
            const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();

            // Create progress bar for active/AFK ratio
            const progressBarLength = 20;
            const activeBlocks = Math.round((activePercentage / 100) * progressBarLength);
            const progressBar = '█'.repeat(activeBlocks) + '░'.repeat(progressBarLength - activeBlocks);

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setAuthor({
                    name: `${member.displayName}'s Monthly Activity`,
                    iconURL: targetUser.displayAvatarURL({ dynamic: true })
                })
                .setDescription(`Activity stats for <t:${Math.floor(monthStart.getTime() / 1000)}:F>`)
                .addFields(
                    {
                        name: '🎤 Voice Activity',
                        value: [
                            `Total Time: \`${formatDuration(stats.voiceTimeSeconds)}\``,
                            `Active Time: \`${formatDuration(activeTime)}\``,
                            `AFK Time: \`${formatDuration(stats.afkTimeSeconds)}\``,
                            `Muted Time: \`${formatDuration(stats.mutedTimeSeconds || 0)}\``,
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: '💬 Chat Activity',
                        value: [
                            `Messages Sent: \`${stats.messageCount}\``,
                            `Daily Average: \`${Math.round(stats.messageCount / daysInMonth)}\``,
                        ].join('\n'),
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
                            `Active: ${activePercentage}% | AFK: ${afkPercentage}%`,
                            `Daily Average: \`${formatDuration(Math.round(activeTime / daysInMonth))}\``
                        ].join('\n')
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'Last updated' });

            await message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching monthly stats:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error')
                .setDescription('Failed to fetch monthly stats. Please try again later.');

            await message.reply({ embeds: [errorEmbed] });
        }
    }
}); 