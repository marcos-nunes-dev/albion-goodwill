const { formatDuration } = require('../utils/timeUtils');
const prisma = require('../config/prisma');
const GuildManager = require('../services/GuildManager');

class VoiceTracker {
  constructor(prisma, guildManager) {
    this.prisma = prisma;
    this.guildManager = guildManager;
    this.MINIMUM_TIME_TO_COUNT = 5 * 60; // 5 minutes in seconds
    this.AFK_TIMEOUT = 15 * 60; // 15 minutes in seconds
  }

  async handleVoiceStateUpdate(oldState, newState) {
    try {
      const userId = oldState.member?.user?.id || newState.member?.user?.id;
      const username = oldState.member?.user?.username || newState.member?.user?.username;

      if (!userId || !username) {
        console.error('Missing user information:', { oldState, newState });
        return;
      }

      console.log('Voice state update:', {
        user: username,
        oldChannel: oldState.channelId,
        newChannel: newState.channelId,
        isMuted: newState.selfMute,
        isDeafened: newState.selfDeaf
      });

      // Handle user leaving voice
      if (oldState.channelId && !newState.channelId) {
        await this.handleVoiceLeave(userId);
      }
      // Handle user joining voice
      else if (!oldState.channelId && newState.channelId) {
        await this.handleVoiceJoin(userId, username, newState);
      }
      // Handle status change (mute/deafen/channel change)
      else if (oldState.channelId && newState.channelId) {
        await this.handleVoiceStatusChange(userId, newState);
      }
    } catch (error) {
      console.error('Error handling voice state update:', error);
    }
  }

  async handleVoiceJoin(userId, username, state) {
    try {
      // First, find and close any existing active sessions
      const existingSessions = await prisma.voiceSession.findMany({
        where: {
          userId,
          isActive: true
        }
      });

      // Close all existing sessions
      if (existingSessions.length > 0) {
        console.log(`Closing ${existingSessions.length} existing sessions for ${username}`);
        
        for (const session of existingSessions) {
          const duration = Math.floor((new Date() - session.joinTime) / 1000);
          if (duration >= this.MINIMUM_TIME_TO_COUNT) {
            await this.updateActivityStats(
              userId, 
              username, 
              session.guildId,
              duration, 
              session.isAfk, 
              session.isMutedOrDeafened
            );
          }
        }

        await prisma.voiceSession.updateMany({
          where: {
            userId,
            isActive: true
          },
          data: {
            isActive: false,
            lastStatusChange: new Date()
          }
        });
      }

      const isAFK = await this.isAFKChannel(state.channel);
      const isMutedOrDeafened = state.selfMute || state.selfDeaf;

      console.log('User joining voice:', {
        username,
        channel: state.channel?.name,
        isAFK,
        isMutedOrDeafened
      });

      // Create new session
      await prisma.voiceSession.create({
        data: {
          userId,
          username,
          guildId: state.guild.id,
          channelId: state.channelId,
          isAfk: isAFK,
          isMutedOrDeafened,
          joinTime: new Date(),
          lastStatusChange: new Date()
        }
      });
    } catch (error) {
      console.error('Error handling voice join:', error);
    }
  }

  async handleVoiceLeave(userId) {
    try {
      const session = await prisma.voiceSession.findFirst({
        where: {
          userId,
          isActive: true
        }
      });

      if (!session) return;

      const now = new Date();
      const duration = Math.floor((now - session.joinTime) / 1000); // duration in seconds

      // Only count if user stayed longer than minimum time
      if (duration >= this.MINIMUM_TIME_TO_COUNT) {
        // First update activity stats
        await this.updateActivityStats(
          userId, 
          session.username, 
          session.guildId,
          duration, 
          session.isAfk, 
          session.isMutedOrDeafened
        );
      }

      // Then close the session
      await prisma.voiceSession.updateMany({ // Use updateMany instead of update
        where: { 
          userId,
          isActive: true
        },
        data: { 
          isActive: false,
          lastStatusChange: now
        }
      });

      console.log(`Session closed for ${session.username}, duration: ${duration}s`);
    } catch (error) {
      console.error('Error handling voice leave:', error);
    }
  }

  async updateActivityStats(userId, username, guildId, duration, isAfk, isMutedOrDeafened) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isLongAFK = isAfk && duration >= this.AFK_TIMEOUT;

    await prisma.dailyActivity.upsert({
      where: {
        userId_guildId_date: {
          userId,
          guildId,
          date: today
        }
      },
      create: {
        userId,
        guildId,
        username,
        date: today,
        voiceTimeSeconds: (isMutedOrDeafened || isLongAFK) ? 0 : duration,
        afkTimeSeconds: isAfk ? duration : 0,
        mutedDeafenedTimeSeconds: isMutedOrDeafened ? duration : 0
      },
      update: {
        voiceTimeSeconds: (isMutedOrDeafened || isLongAFK) ? undefined : { increment: duration },
        afkTimeSeconds: isAfk ? { increment: duration } : undefined,
        mutedDeafenedTimeSeconds: isMutedOrDeafened ? { increment: duration } : undefined
      }
    });
  }

  async isAFKChannel(channel) {
    if (!channel) return false;
    
    try {
      const guildSettings = await this.guildManager.getGuildSettings(channel.guild.id);
      
      // Check if channel is the configured AFK channel
      if (guildSettings?.afkChannelId === channel.id) {
        return true;
      }
      
      // Fallback to name check
      return channel.name.toLowerCase().includes('afk');
    } catch (error) {
      console.error('Error checking AFK channel:', error);
      return false;
    }
  }

  async handleVoiceStatusChange(userId, newState) {
    try {
      const session = await prisma.voiceSession.findFirst({
        where: {
          userId,
          guildId: newState.guild.id,  // Add guildId to query
          isActive: true
        }
      });

      if (!session) return;

      // Add check for user leaving voice channel
      if (!newState.channelId) {
        await this.handleVoiceLeave(userId);
        return;
      }

      const now = new Date();
      const duration = Math.floor((now - session.lastStatusChange) / 1000);

      // Update activity stats with the previous state
      await this.updateActivityStats(
        userId, 
        session.username,
        session.guildId,
        duration, 
        session.isAfk, 
        session.isMutedOrDeafened
      );

      // Update session with new state
      await prisma.voiceSession.update({
        where: { id: session.id },
        data: {
          isAfk: await this.isAFKChannel(newState.channel),
          isMutedOrDeafened: newState.selfMute || newState.selfDeaf,
          lastStatusChange: now
        }
      });
    } catch (error) {
      console.error('Error in handleVoiceStatusChange:', error);
    }
  }

  formatStats(period, stats) {
    return [
      `**${period} Activity:**`,
      `🎤 Active Voice Time: ${formatDuration(stats.voiceTimeSeconds)}`,
      `💬 Messages Sent: ${stats.messageCount}`,
      stats.afkTimeSeconds > 0 ? `💤 AFK Time: ${formatDuration(stats.afkTimeSeconds)}` : null,
      stats.mutedDeafenedTimeSeconds > 0 ? `🔇 Muted Time: ${formatDuration(stats.mutedDeafenedTimeSeconds)}` : null
    ].filter(Boolean).join('\n');
  }

  async cleanupStaleSessions() {
    try {
      const staleThreshold = new Date();
      staleThreshold.setHours(staleThreshold.getHours() - 12); // Consider sessions older than 12 hours as stale

      const staleSessions = await prisma.voiceSession.findMany({
        where: {
          isActive: true,
          lastStatusChange: {
            lt: staleThreshold
          }
        }
      });

      for (const session of staleSessions) {
        console.log(`Cleaning up stale session for ${session.username}`);
        await this.handleVoiceLeave(session.userId);
      }
    } catch (error) {
      console.error('Error cleaning up stale sessions:', error);
    }
  }
}

module.exports = VoiceTracker; 