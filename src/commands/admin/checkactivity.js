const { EmbedBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');

module.exports = new Command({
    name: 'checkactivity',
    description: 'Check for missing activity records in voice channels',
    defaultMemberPermissions: ['ManageRoles'],
    async execute(message, args, isSlash = false) {
        try {
            if (isSlash) {
                await message.deferReply({ ephemeral: true });
            }

            const guild = message.guild;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Get all current voice states
            const currentVoiceStates = guild.voiceStates.cache;
            const activeUsers = Array.from(currentVoiceStates.values())
                .filter(state => state.channelId)
                .map(state => state.member.user.id);

            // Get today's activity records
            const todayRecords = await prisma.dailyActivity.findMany({
                where: {
                    guildId: guild.id,
                    date: today
                },
                select: {
                    userId: true,
                    username: true,
                    voiceTimeSeconds: true,
                    afkTimeSeconds: true,
                    mutedDeafenedTimeSeconds: true
                }
            });

            const recordedUserIds = new Set(todayRecords.map(record => record.userId));
            const missingUsers = activeUsers.filter(userId => !recordedUserIds.has(userId));

            // Get active voice sessions
            const activeSessions = await prisma.voiceSession.findMany({
                where: {
                    guildId: guild.id,
                    isActive: true
                },
                select: {
                    userId: true,
                    username: true,
                    joinTime: true,
                    isAfk: true,
                    isMutedOrDeafened: true
                }
            });

            const embed = new EmbedBuilder()
                .setTitle('Activity Check Report')
                .setColor(0x00FF00)
                .setTimestamp();

            if (missingUsers.length === 0) {
                embed.setDescription('✅ All active users have activity records!');
            } else {
                const missingMembers = await Promise.all(
                    missingUsers.map(async userId => {
                        try {
                            const member = await guild.members.fetch(userId);
                            return {
                                id: userId,
                                name: member.displayName || member.user.username,
                                joinedAt: member.joinedAt
                            };
                        } catch (error) {
                            console.error(`Error fetching member ${userId}:`, error);
                            return null;
                        }
                    })
                );

                const validMissingMembers = missingMembers.filter(m => m !== null);
                const missingList = validMissingMembers.map(member => 
                    `• ${member.name} (${member.id})\n  Joined: ${member.joinedAt.toLocaleDateString()}`
                ).join('\n');

                embed.setDescription(`⚠️ Found ${validMissingMembers.length} active users without activity records:\n\n${missingList}`);
            }

            // Add active sessions info
            if (activeSessions.length > 0) {
                const sessionsList = activeSessions.map(session => 
                    `• ${session.username} (${session.userId})\n  Joined: ${session.joinTime.toLocaleString()}\n  AFK: ${session.isAfk ? 'Yes' : 'No'}\n  Muted/Deafened: ${session.isMutedOrDeafened ? 'Yes' : 'No'}`
                ).join('\n\n');

                embed.addFields({
                    name: 'Active Voice Sessions',
                    value: sessionsList
                });
            }

            if (isSlash) {
                await message.editReply({ embeds: [embed] });
            } else {
                await message.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in checkactivity command:', error);
            const errorMessage = 'An error occurred while checking activity records.';
            
            if (isSlash) {
                try {
                    await message.editReply(errorMessage);
                } catch {
                    await message.reply({ content: errorMessage, ephemeral: true });
                }
            } else {
                await message.reply(errorMessage);
            }
        }
    }
}); 