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

            // Try to get weekly stats first
            let stats = await prisma.weeklyActivity.findUnique({
                where: {
                    userId_guildId_weekStart: {
                        userId: targetUser.id,
                        guildId: message.guild.id,
                        weekStart: weekStart
                    }
                }
            });

            let isPartialData = false;
            let dailyStats = [];

            // If no weekly stats, try daily data
            if (!stats) {
                dailyStats = await prisma.dailyActivity.findMany({
                    where: {
                        userId: targetUser.id,
                        guildId: message.guild.id,
                        date: {
                            gte: weekStart,
                            lt: new Date(weekStart.getTime() + 604800000)
                        }
                    }
                });

                if (dailyStats.length > 0) {
                    isPartialData = true;
                    stats = dailyStats.reduce((acc, curr) => ({
                        voiceTimeSeconds: (acc.voiceTimeSeconds || 0) + curr.voiceTimeSeconds,
                        afkTimeSeconds: (acc.afkTimeSeconds || 0) + curr.afkTimeSeconds,
                        mutedDeafenedTimeSeconds: (acc.mutedDeafenedTimeSeconds || 0) + curr.mutedDeafenedTimeSeconds,
                        messageCount: (acc.messageCount || 0) + curr.messageCount
                    }), {});
                }
            } else {
                // Try to supplement weekly data with any additional daily data
                dailyStats = await prisma.dailyActivity.findMany({
                    where: {
                        userId: targetUser.id,
                        guildId: message.guild.id,
                        date: {
                            gte: weekStart,
                            lt: new Date(weekStart.getTime() + 604800000)
                        }
                    }
                });

                if (dailyStats.length > 0) {
                    const dailyTotal = dailyStats.reduce((acc, curr) => ({
                        voiceTimeSeconds: (acc.voiceTimeSeconds || 0) + curr.voiceTimeSeconds,
                        afkTimeSeconds: (acc.afkTimeSeconds || 0) + curr.afkTimeSeconds,
                        mutedDeafenedTimeSeconds: (acc.mutedDeafenedTimeSeconds || 0) + curr.mutedDeafenedTimeSeconds,
                        messageCount: (acc.messageCount || 0) + curr.messageCount
                    }), {});

                    // If daily total is greater than weekly, use it instead
                    if (dailyTotal.voiceTimeSeconds > stats.voiceTimeSeconds) {
                        isPartialData = true;
                        stats = dailyTotal;
                    }
                }
            }

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

            // Calculate percentages
            const totalTime = stats.voiceTimeSeconds;
            const mutedTime = stats.mutedDeafenedTimeSeconds || 0;
            const afkTime = stats.afkTimeSeconds;
            const activeTime = totalTime - afkTime - mutedTime;
            const activePercentage = totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 0;
            const afkPercentage = totalTime > 0 ? Math.round((afkTime / totalTime) * 100) : 0;

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
                .setDescription([
                    `Activity stats for week starting <t:${Math.floor(weekStart.getTime() / 1000)}:D>`,
                    isPartialData ? '⚠️ **Note:** This is partial data aggregated from available daily records.' : ''
                ].filter(Boolean).join('\n'))
                .addFields(
                    {
                        name: '🎤 Voice Activity',
                        value: [
                            `Total Time: \`${formatDuration(totalTime)}\``,
                            `Active Time: \`${formatDuration(activeTime)}\``,
                            `AFK Time: \`${formatDuration(afkTime)}\``,
                            `Muted Time: \`${formatDuration(mutedTime)}\``,
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