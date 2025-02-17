const prisma = require('../config/prisma');

class GuildManager {
  async initializeGuild(guild) {
    try {
      const guildSettings = await prisma.guildSettings.upsert({
        where: {
          guildId: guild.id
        },
        create: {
          guildId: guild.id,
          guildName: guild.name,
          afkChannelId: guild.afkChannelId || null,
          commandPrefix: '!albiongw'
        },
        update: {
          guildName: guild.name,
          afkChannelId: guild.afkChannelId || null
        }
      });

      console.log(`Guild settings initialized for ${guild.name}`);
      return guildSettings;
    } catch (error) {
      console.error(`Error initializing guild settings for ${guild.name}:`, error);
      throw error;
    }
  }

  async getGuildSettings(guildId) {
    try {
      return await prisma.guildSettings.findUnique({
        where: { guildId }
      });
    } catch (error) {
      console.error(`Error fetching guild settings for ${guildId}:`, error);
      throw error;
    }
  }
}

module.exports = GuildManager; 