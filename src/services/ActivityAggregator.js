const prisma = require('../config/prisma');
const { getWeekStart, getMonthStart } = require('../utils/timeUtils');
const { sendInactivityWarning } = require('../utils/messageUtils');
const logger = require('../utils/logger');

class ActivityAggregator {
  constructor(client) {
    this.client = client;
    this.ACTIVITY_THRESHOLD = 0.05; // 5%
  }

  async aggregateWeeklyStats() {
    const weekStart = getWeekStart(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    logger.info('Starting weekly aggregation', { weekStart, weekEnd });

    try {
      const dailyStats = await prisma.dailyActivity.groupBy({
        by: ['userId', 'guildId', 'username'],
        where: {
          date: {
            gte: weekStart,
            lt: weekEnd
          }
        },
        _sum: {
          messageCount: true,
          voiceTimeSeconds: true,
          afkTimeSeconds: true,
          mutedDeafenedTimeSeconds: true
        }
      });

      const topPerformers = dailyStats
        .sort((a, b) => (b._sum.voiceTimeSeconds || 0) - (a._sum.voiceTimeSeconds || 0))
        .slice(0, 10);

      const avgTopVoiceTime = topPerformers.length > 0
        ? topPerformers.reduce((sum, stat) => sum + (stat._sum.voiceTimeSeconds || 0), 0) / topPerformers.length
        : 0;

      const minimumThreshold = avgTopVoiceTime * this.ACTIVITY_THRESHOLD;

      logger.info('Processing weekly stats', { 
        usersCount: dailyStats.length,
        avgTopVoiceTime,
        minimumThreshold 
      });

      for (const stat of dailyStats) {
        await prisma.weeklyActivity.upsert({
          where: {
            userId_guildId_weekStart: {
              userId: stat.userId,
              guildId: stat.guildId,
              weekStart
            }
          },
          create: {
            userId: stat.userId,
            guildId: stat.guildId,
            username: stat.username,
            weekStart,
            messageCount: stat._sum.messageCount || 0,
            voiceTimeSeconds: stat._sum.voiceTimeSeconds || 0,
            afkTimeSeconds: stat._sum.afkTimeSeconds || 0,
            mutedDeafenedTimeSeconds: stat._sum.mutedDeafenedTimeSeconds || 0
          },
          update: {
            messageCount: stat._sum.messageCount || 0,
            voiceTimeSeconds: stat._sum.voiceTimeSeconds || 0,
            afkTimeSeconds: stat._sum.afkTimeSeconds || 0,
            mutedDeafenedTimeSeconds: stat._sum.mutedDeafenedTimeSeconds || 0
          }
        });

        const userVoiceTime = stat._sum.voiceTimeSeconds || 0;
        if (userVoiceTime < minimumThreshold) {
          await sendInactivityWarning(
            this.client,
            stat.userId,
            stat._sum,
            this.ACTIVITY_THRESHOLD * 100
          );
        }
      }

      logger.info('Weekly aggregation completed');
    } catch (error) {
      logger.error('Weekly aggregation failed', { error: error.message });
    }
  }

  async aggregateMonthlyStats() {
    const monthStart = getMonthStart(new Date());
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    console.log('Aggregating monthly stats:', {
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString()
    });

    try {
      // Get all daily activities for the month
      const dailyStats = await prisma.dailyActivity.groupBy({
        by: ['userId', 'guildId', 'username'],
        where: {
          date: {
            gte: monthStart,
            lt: monthEnd
          }
        },
        _sum: {
          messageCount: true,
          voiceTimeSeconds: true,
          afkTimeSeconds: true,
          mutedDeafenedTimeSeconds: true
        }
      });

      console.log(`Found ${dailyStats.length} users with activity this month`);

      for (const stat of dailyStats) {
        await prisma.monthlyActivity.upsert({
          where: {
            userId_guildId_monthStart: {
              userId: stat.userId,
              guildId: stat.guildId,
              monthStart
            }
          },
          create: {
            userId: stat.userId,
            guildId: stat.guildId,
            username: stat.username,
            monthStart,
            messageCount: stat._sum.messageCount || 0,
            voiceTimeSeconds: stat._sum.voiceTimeSeconds || 0,
            afkTimeSeconds: stat._sum.afkTimeSeconds || 0,
            mutedDeafenedTimeSeconds: stat._sum.mutedDeafenedTimeSeconds || 0
          },
          update: {
            messageCount: stat._sum.messageCount || 0,
            voiceTimeSeconds: stat._sum.voiceTimeSeconds || 0,
            afkTimeSeconds: stat._sum.afkTimeSeconds || 0,
            mutedDeafenedTimeSeconds: stat._sum.mutedDeafenedTimeSeconds || 0
          }
        });
      }

      console.log('Monthly aggregation completed successfully');
    } catch (error) {
      console.error('Error during monthly aggregation:', error);
    }
  }
}

module.exports = ActivityAggregator; 