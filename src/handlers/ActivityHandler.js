class ActivityHandler {
    // ... other methods ...

    async handleMessage(message) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Daily Activity
            await prisma.dailyActivity.upsert({
                where: {
                    userId_guildId_date: {
                        userId: message.author.id,
                        guildId: message.guild.id,
                        date: today
                    }
                },
                create: {
                    userId: message.author.id,
                    guildId: message.guild.id,
                    date: today,
                    messageCount: 1
                },
                update: {
                    messageCount: {
                        increment: 1
                    }
                }
            });

            // Weekly Activity
            const weekStart = getWeekStart(today);
            await prisma.weeklyActivity.upsert({
                where: {
                    userId_guildId_weekStart: {
                        userId: message.author.id,
                        guildId: message.guild.id,
                        weekStart
                    }
                },
                create: {
                    userId: message.author.id,
                    guildId: message.guild.id,
                    weekStart,
                    messageCount: 1
                },
                update: {
                    messageCount: {
                        increment: 1
                    }
                }
            });

            // Monthly Activity
            const monthStart = getMonthStart(today);
            await prisma.monthlyActivity.upsert({
                where: {
                    userId_guildId_monthStart: {
                        userId: message.author.id,
                        guildId: message.guild.id,
                        monthStart
                    }
                },
                create: {
                    userId: message.author.id,
                    guildId: message.guild.id,
                    monthStart,
                    messageCount: 1
                },
                update: {
                    messageCount: {
                        increment: 1
                    }
                }
            });
        } catch (error) {
            console.error('Error handling message activity:', error);
        }
    }

    // ... other methods ...
} 