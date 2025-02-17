const prisma = require('../config/prisma');

class MessageTracker {
  async handleMessage(message) {
    if (message.author.bot) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Update daily activity with guildId
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
        username: message.author.username,
        date: today,
        messageCount: 1
      },
      update: {
        messageCount: { increment: 1 },
        username: message.author.username
      }
    });
  }
}

module.exports = MessageTracker; 