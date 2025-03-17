const { formatDuration } = require('../utils/timeUtils');
const prisma = require('../config/prisma');
const GuildManager = require('../services/GuildManager');

class VoiceTracker {
  constructor(prisma, guildManager) {
    this.prisma = prisma;
    this.guildManager = guildManager;
    this.MINIMUM_TIME_TO_COUNT = 5 * 60; // 5 minutes in seconds
    this.AFK_TIMEOUT = 15 * 60; // 15 minutes in seconds
    this.MAX_SESSION_DURATION = 24 * 60 * 60; // 24 hours in seconds
    this.sessionCache = new Map(); // Cache for active sessions
  }

  async handleVoiceStateUpdate(oldState, newState) {
    try {
      const userId = oldState.member?.user?.id || newState.member?.user?.id;
      const username = oldState.member?.user?.username || newState.member?.user?.username;

      if (!userId || !username) {
        console.warn('Missing user data in voice state update:', { oldState, newState });
        return;
      }

      // Log the state change for debugging
      console.log(`Voice state update for ${username}:`, {
        oldChannel: oldState.channelId,
        newChannel: newState.channelId,
        oldMuted: oldState.selfMute,
        newMuted: newState.selfMute,
        oldDeafened: oldState.selfDeaf,
        newDeafened: newState.selfDeaf
      });

      if (oldState.channelId && !newState.channelId) {
        await this.handleVoiceLeave(userId);
      }
      else if (!oldState.channelId && newState.channelId) {
        await this.handleVoiceJoin(userId, username, newState);
      }
      else if (oldState.channelId && newState.channelId) {
        await this.handleVoiceStatusChange(userId, newState);
      }
    } catch (error) {
      console.error('Voice state error:', error.message);
      // Try to recover the session if possible
      try {
        const userId = oldState.member?.user?.id || newState.member?.user?.id;
        if (userId) {
          await this.recoverSession(userId);
        }
      } catch (recoveryError) {
        console.error('Failed to recover session:', recoveryError);
      }
    }
  }

  async recoverSession(userId) {
    try {
      // Check if there's an active session in the database
      const activeSession = await this.prisma.voiceSession.findFirst({
        where: {
          userId,
          isActive: true
        }
      });

      if (activeSession) {
        // Check if the session is too old
        const sessionAge = Math.floor((new Date() - activeSession.joinTime) / 1000);
        if (sessionAge > this.MAX_SESSION_DURATION) {
          console.log(`Recovering old session for user ${activeSession.username}`);
          await this.handleVoiceLeave(userId);
        } else {
          // Update the session cache
          this.sessionCache.set(userId, activeSession);
        }
      }
    } catch (error) {
      console.error(`Error recovering session for user ${userId}:`, error);
    }
  }

  async handleVoiceJoin(userId, username, state) {
    try {
      // Check for existing sessions in cache first
      const existingSession = this.sessionCache.get(userId);
      if (existingSession) {
        console.log(`Found existing session in cache for ${username}`);
        await this.handleVoiceLeave(userId);
      }

      // Close any existing sessions in database
      const existingSessions = await this.prisma.voiceSession.findMany({
        where: { userId, isActive: true }
      });

      if (existingSessions.length > 0) {
        for (const session of existingSessions) {
          const duration = Math.floor((new Date() - session.joinTime) / 1000);
          if (duration >= this.MINIMUM_TIME_TO_COUNT) {
            await this.updateActivityStats(
              userId, username, session.guildId, duration,
              session.isAfk, session.isMutedOrDeafened
            );
          }
        }
        await this.prisma.voiceSession.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false, lastStatusChange: new Date() }
        });
      }

      // Create new session
      const isAFK = await this.isAFKChannel(state.channel);
      const newSession = await this.prisma.voiceSession.create({
        data: {
          userId,
          username,
          guildId: state.guild.id,
          channelId: state.channelId,
          isAfk: isAFK,
          isMutedOrDeafened: state.selfMute || state.selfDeaf,
          joinTime: new Date(),
          lastStatusChange: new Date()
        }
      });

      // Add to cache
      this.sessionCache.set(userId, newSession);

      // Created new session for ${username}:, {
      //   channelId: state.channelId,
      //   isAFK,
      //   isMuted: state.selfMute,
      //   isDeafened: state.selfDeaf
      // });
    } catch (error) {
      console.error('Voice join error:', error.message);
      // Try to recover the session
      await this.recoverSession(userId);
    }
  }

  async handleVoiceLeave(userId) {
    try {
      // Check cache first
      const cachedSession = this.sessionCache.get(userId);
      if (cachedSession) {
        console.log(`Found session in cache for user ${cachedSession.username}`);
        await this.processVoiceLeave(cachedSession);
        this.sessionCache.delete(userId);
        return;
      }

      // If not in cache, check database
      const session = await this.prisma.voiceSession.findFirst({
        where: {
          userId,
          isActive: true
        }
      });

      if (session) {
        await this.processVoiceLeave(session);
      }
    } catch (error) {
      console.error('Error handling voice leave:', error);
    }
  }

  async processVoiceLeave(session) {
    const now = new Date();
    const duration = Math.floor((now - session.joinTime) / 1000);

    // Only count if user stayed longer than minimum time
    if (duration >= this.MINIMUM_TIME_TO_COUNT) {
      await this.updateActivityStats(
        session.userId, 
        session.username, 
        session.guildId,
        duration, 
        session.isAfk, 
        session.isMutedOrDeafened
      );
    }

    // Close the session
    await this.prisma.voiceSession.update({
      where: { id: session.id },
      data: { 
        isActive: false,
        lastStatusChange: now
      }
    });

    console.log(`Session closed for ${session.username}, duration: ${duration}s`);
  }

  async updateActivityStats(userId, username, guildId, duration, isAfk, isMutedOrDeafened) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isLongAFK = isAfk && duration >= this.AFK_TIMEOUT;

    // Updating activity stats for ${username} (${userId}):, {
    //   duration,
    //   isAfk,
    //   isLongAFK,
    //   isMutedOrDeafened,
    //   guildId,
    //   date: today
    // });

    try {
      // Get existing record for today
      const existingRecord = await this.prisma.dailyActivity.findUnique({
        where: {
          userId_guildId_date: {
            userId,
            guildId,
            date: today
          }
        }
      });

      // Calculate time to add based on status
      let voiceTimeToAdd = 0;
      let afkTimeToAdd = 0;
      let mutedTimeToAdd = 0;

      if (isMutedOrDeafened) {
        mutedTimeToAdd = duration;
      } else if (isAfk) {
        afkTimeToAdd = duration;
      } else {
        voiceTimeToAdd = duration;
      }

      // If record exists, update it
      if (existingRecord) {
        const result = await this.prisma.dailyActivity.update({
          where: {
            userId_guildId_date: {
              userId,
              guildId,
              date: today
            }
          },
          data: {
            voiceTimeSeconds: { increment: voiceTimeToAdd },
            afkTimeSeconds: { increment: afkTimeToAdd },
            mutedDeafenedTimeSeconds: { increment: mutedTimeToAdd },
            username: username // Update username in case it changed
          }
        });

        // Updated existing activity stats for ${username}:, {
        //   voiceTime: result.voiceTimeSeconds,
        //   afkTime: result.afkTimeSeconds,
        //   mutedTime: result.mutedDeafenedTimeSeconds
        // });
      } else {
        // Create new record
        const result = await this.prisma.dailyActivity.create({
          data: {
            userId,
            guildId,
            username,
            date: today,
            voiceTimeSeconds: voiceTimeToAdd,
            afkTimeSeconds: afkTimeToAdd,
            mutedDeafenedTimeSeconds: mutedTimeToAdd
          }
        });

        // Created new activity stats for ${username}:, {
        //   voiceTime: result.voiceTimeSeconds,
        //   afkTime: result.afkTimeSeconds,
        //   mutedTime: result.mutedDeafenedTimeSeconds
        // });
      }
    } catch (error) {
      console.error(`Failed to update activity stats for ${username}:`, error);
    }
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
      console.log(`Voice status change for user ${userId}:`, {
        channelId: newState.channelId,
        isMuted: newState.selfMute,
        isDeafened: newState.selfDeaf,
        guildId: newState.guild.id
      });

      const session = await this.prisma.voiceSession.findFirst({
        where: {
          userId,
          guildId: newState.guild.id,
          isActive: true
        }
      });

      if (!session) {
        console.log(`No active session found for user ${userId} - creating new session`);
        await this.handleVoiceJoin(userId, newState.member.user.username, newState);
        return;
      }

      // Add check for user leaving voice channel
      if (!newState.channelId) {
        console.log(`User ${userId} left voice channel - handling leave`);
        await this.handleVoiceLeave(userId);
        return;
      }

      const now = new Date();
      const duration = Math.floor((now - session.lastStatusChange) / 1000);

      console.log(`Updating status for user ${userId}:`, {
        duration,
        isAfk: session.isAfk,
        isMutedOrDeafened: session.isMutedOrDeafened
      });

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
      const updatedSession = await this.prisma.voiceSession.update({
        where: { id: session.id },
        data: {
          isAfk: await this.isAFKChannel(newState.channel),
          isMutedOrDeafened: newState.selfMute || newState.selfDeaf,
          lastStatusChange: now
        }
      });

      console.log(`Updated session for user ${userId}:`, {
        isAfk: updatedSession.isAfk,
        isMutedOrDeafened: updatedSession.isMutedOrDeafened,
        lastStatusChange: updatedSession.lastStatusChange
      });
    } catch (error) {
      console.error(`Error in handleVoiceStatusChange for user ${userId}:`, error);
    }
  }

  formatStats(period, stats) {
    return [
      `**${period} Activity:**`,
      ` Active Voice Time: ${formatDuration(stats.voiceTimeSeconds)}`,
      ` Messages Sent: ${stats.messageCount}`,
      stats.afkTimeSeconds > 0 ? ` AFK Time: ${formatDuration(stats.afkTimeSeconds)}` : null,
      stats.mutedDeafenedTimeSeconds > 0 ? ` Muted Time: ${formatDuration(stats.mutedDeafenedTimeSeconds)}` : null
    ].filter(Boolean).join('\n');
  }

  async cleanupStaleSessions() {
    try {
      const staleThreshold = new Date();
      staleThreshold.setHours(staleThreshold.getHours() - 12); // Consider sessions older than 12 hours as stale

      const staleSessions = await this.prisma.voiceSession.findMany({
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