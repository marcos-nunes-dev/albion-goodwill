class MessageHandler {
    async handleMessage(message) {
        if (message.author.bot) return;

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

            // Similar updates for weekly and monthly...
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }
}

module.exports = MessageHandler; 