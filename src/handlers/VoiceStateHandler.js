class VoiceStateHandler {
    async updateActivity(session, endTime) {
        try {
            const sessionDuration = Math.floor((endTime - session.lastStatusChange) / 1000);
            if (sessionDuration <= 0) return;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Update daily activity
            await prisma.dailyActivity.upsert({
                where: {
                    userId_guildId_date: {
                        userId: session.userId,
                        guildId: session.guildId,
                        date: today
                    }
                },
                create: {
                    userId: session.userId,
                    guildId: session.guildId,
                    date: today,
                    voiceTimeSeconds: session.isAfk ? 0 : sessionDuration,
                    afkTimeSeconds: session.isAfk ? sessionDuration : 0,
                    mutedDeafenedTimeSeconds: session.isMutedOrDeafened ? sessionDuration : 0
                },
                update: {
                    voiceTimeSeconds: {
                        increment: session.isAfk ? 0 : sessionDuration
                    },
                    afkTimeSeconds: {
                        increment: session.isAfk ? sessionDuration : 0
                    },
                    mutedDeafenedTimeSeconds: {
                        increment: session.isMutedOrDeafened ? sessionDuration : 0
                    }
                }
            });

            // Update weekly activity
            const weekStart = getWeekStart(today);
            await prisma.weeklyActivity.upsert({
                where: {
                    userId_guildId_weekStart: {
                        userId: session.userId,
                        guildId: session.guildId,
                        weekStart
                    }
                },
                create: {
                    userId: session.userId,
                    guildId: session.guildId,
                    weekStart,
                    voiceTimeSeconds: session.isAfk ? 0 : sessionDuration,
                    afkTimeSeconds: session.isAfk ? sessionDuration : 0,
                    mutedDeafenedTimeSeconds: session.isMutedOrDeafened ? sessionDuration : 0
                },
                update: {
                    voiceTimeSeconds: {
                        increment: session.isAfk ? 0 : sessionDuration
                    },
                    afkTimeSeconds: {
                        increment: session.isAfk ? sessionDuration : 0
                    },
                    mutedDeafenedTimeSeconds: {
                        increment: session.isMutedOrDeafened ? sessionDuration : 0
                    }
                }
            });

            // Update monthly activity
            const monthStart = getMonthStart(today);
            await prisma.monthlyActivity.upsert({
                where: {
                    userId_guildId_monthStart: {
                        userId: session.userId,
                        guildId: session.guildId,
                        monthStart
                    }
                },
                create: {
                    userId: session.userId,
                    guildId: session.guildId,
                    monthStart,
                    voiceTimeSeconds: session.isAfk ? 0 : sessionDuration,
                    afkTimeSeconds: session.isAfk ? sessionDuration : 0,
                    mutedDeafenedTimeSeconds: session.isMutedOrDeafened ? sessionDuration : 0
                },
                update: {
                    voiceTimeSeconds: {
                        increment: session.isAfk ? 0 : sessionDuration
                    },
                    afkTimeSeconds: {
                        increment: session.isAfk ? sessionDuration : 0
                    },
                    mutedDeafenedTimeSeconds: {
                        increment: session.isMutedOrDeafened ? sessionDuration : 0
                    }
                }
            });
        } catch (error) {
            console.error('Error updating activity:', error);
        }
    }
}

module.exports = VoiceStateHandler; 