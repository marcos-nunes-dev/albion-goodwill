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
            const isSlash = message.commandName === 'presencemonthly';
            
            // Get target user based on command type
            let targetUser;
            if (isSlash) {
                targetUser = message.options.getUser('user') || message.user;
            } else {
                targetUser = message.mentions.users.first() || message.author;
            }

            const monthStart = getMonthStart(new Date());
            const nextMonth = new Date(monthStart);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const member = await message.guild.members.fetch(targetUser.id);

            // Try to get monthly stats first
            let stats = await prisma.monthlyActivity.findUnique({
                where: {
                    userId_guildId_monthStart: {
                        userId: targetUser.id,
                        guildId: message.guild.id,
                        monthStart
                    }
                }
            });

            let isPartialData = false;

            if (!stats) {
                // Try weekly data first
                const weeklyStats = await prisma.weeklyActivity.findMany({
                    where: {
                        userId: targetUser.id,
                        guildId: message.guild.id,
                        weekStart: {
                            gte: monthStart,
                            lt: nextMonth
                        }
                    }
                });

                if (weeklyStats.length > 0) {
                    isPartialData = true;
                    stats = weeklyStats.reduce((acc, curr) => ({
                        voiceTimeSeconds: (acc.voiceTimeSeconds || 0) + curr.voiceTimeSeconds,
                        afkTimeSeconds: (acc.afkTimeSeconds || 0) + curr.afkTimeSeconds,
                        mutedDeafenedTimeSeconds: (acc.mutedDeafenedTimeSeconds || 0) + curr.mutedDeafenedTimeSeconds,
                        messageCount: (acc.messageCount || 0) + curr.messageCount
                    }), {});
                } else {
                    // If no weekly data, try daily data
                    const dailyStats = await prisma.dailyActivity.findMany({
                        where: {
                            userId: targetUser.id,
                            guildId: message.guild.id,
                            date: {
                                gte: monthStart,
                                lt: nextMonth
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
                }
            } else {
                // Try to supplement monthly data with any additional weekly/daily data
                const weeklyStats = await prisma.weeklyActivity.findMany({
                    where: {
                        userId: targetUser.id,
                        guildId: message.guild.id,
                        weekStart: {
                            gte: monthStart,
                            lt: nextMonth
                        }
                    }
                });

                const dailyStats = await prisma.dailyActivity.findMany({
                    where: {
                        userId: targetUser.id,
                        guildId: message.guild.id,
                        date: {
                            gte: monthStart,
                            lt: nextMonth
                        }
                    }
                });

                // Calculate totals from weekly and daily data
                let weeklyTotal = weeklyStats.length > 0 ? weeklyStats.reduce((acc, curr) => ({
                    voiceTimeSeconds: (acc.voiceTimeSeconds || 0) + curr.voiceTimeSeconds,
                    afkTimeSeconds: (acc.afkTimeSeconds || 0) + curr.afkTimeSeconds,
                    mutedDeafenedTimeSeconds: (acc.mutedDeafenedTimeSeconds || 0) + curr.mutedDeafenedTimeSeconds,
                    messageCount: (acc.messageCount || 0) + curr.messageCount
                }), {}) : null;

                let dailyTotal = dailyStats.length > 0 ? dailyStats.reduce((acc, curr) => ({
                    voiceTimeSeconds: (acc.voiceTimeSeconds || 0) + curr.voiceTimeSeconds,
                    afkTimeSeconds: (acc.afkTimeSeconds || 0) + curr.afkTimeSeconds,
                    mutedDeafenedTimeSeconds: (acc.mutedDeafenedTimeSeconds || 0) + curr.mutedDeafenedTimeSeconds,
                    messageCount: (acc.messageCount || 0) + curr.messageCount
                }), {}) : null;

                // Use the highest total if it's greater than monthly stats
                if (weeklyTotal && weeklyTotal.voiceTimeSeconds > stats.voiceTimeSeconds) {
                    isPartialData = true;
                    stats = weeklyTotal;
                }
                if (dailyTotal && dailyTotal.voiceTimeSeconds > stats.voiceTimeSeconds) {
                    isPartialData = true;
                    stats = dailyTotal;
                }
            }

            if (!stats) {
                const noStatsEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setAuthor({
                        name: member.displayName,
                        iconURL: targetUser.displayAvatarURL({ dynamic: true })
                    })
                    .setDescription('❌ No activity recorded this month.')
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
            console.error('Error fetching monthly stats:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error')
                .setDescription('Failed to fetch monthly stats. Please try again later.');

            await message.reply({ 
                embeds: [errorEmbed],
                ephemeral: isSlash
            });
        }
    }
}); 