const { EmbedBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { formatDuration, getWeekStart } = require('../../utils/timeUtils');

module.exports = new Command({
    name: 'presenceweekly',
    description: 'Shows weekly presence stats for a user',
    category: 'stats',
    usage: '[@user]',
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'presenceweekly';
            
            // Get target user based on command type
            let targetUser;
            if (isSlash) {
                targetUser = message.options.getUser('user') || message.user;
            } else {
                targetUser = message.mentions.users.first() || message.author;
            }

            const weekStart = getWeekStart(new Date());
            const member = await message.guild.members.fetch(targetUser.id);

            const stats = await prisma.weeklyActivity.findUnique({
                where: {
                    userId_guildId_weekStart: {
                        userId: targetUser.id,
                        guildId: message.guild.id,
                        weekStart
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
                    .setDescription('❌ No activity recorded this week. Or we just have partial data.')
                    .setFooter({ text: 'Try joining a voice channel or sending messages!' });

                await message.reply({ 
                    embeds: [noStatsEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            // Calculate percentages
            const totalTime = stats.voiceTimeSeconds;
            const activeTime = stats.voiceTimeSeconds - stats.afkTimeSeconds;
            const activePercentage = totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 0;
            const afkPercentage = totalTime > 0 ? Math.round((stats.afkTimeSeconds / totalTime) * 100) : 0;

            // Create progress bar for active/AFK ratio
            const progressBarLength = 20;
            const activeBlocks = Math.round((activePercentage / 100) * progressBarLength);
            const progressBar = '█'.repeat(activeBlocks) + '░'.repeat(progressBarLength - activeBlocks);

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setAuthor({
                    name: `${member.displayName}'s Weekly Activity`,
                    iconURL: targetUser.displayAvatarURL({ dynamic: true })
                })
                .setDescription(`Activity stats for week starting <t:${Math.floor(weekStart.getTime() / 1000)}:D>`)
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
                        value: `Messages Sent: \`${stats.messageCount}\``,
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
                            `Active: ${activePercentage}% | AFK: ${afkPercentage}%`
                        ].join('\n')
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'Last updated' });

            await message.reply({ 
                embeds: [embed],
                ephemeral: isSlash
            });
        } catch (error) {
            console.error('Error fetching weekly stats:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error')
                .setDescription('Failed to fetch weekly stats. Please try again later.');

            await message.reply({ 
                embeds: [errorEmbed],
                ephemeral: isSlash
            });
        }
    }
}); 