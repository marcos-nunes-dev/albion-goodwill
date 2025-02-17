const prisma = require('../config/prisma');
const { formatDuration, getWeekStart, getMonthStart } = require('../utils/timeUtils');

class CommandHandler {
  constructor() {
    this.prefix = '!albiongw';
  }

  async handleCommand(message) {
    console.log('Received message:', message.content);
    const args = message.content.split(' ');
    const command = args[0];
    const mentionedUser = message.mentions.members.first();

    // Simple command handling without binding
    if (command === `${this.prefix}ping`) {
      console.log('Ping command detected');
      return message.reply('Pong!');
    }

    if (command === `${this.prefix}help`) {
      console.log('Help command detected');
      return this.showHelp(message);
    }

    if (command === `${this.prefix}stats`) {
      console.log('Stats command detected');
      return this.getDailyStats(message, mentionedUser);
    }

    if (command === `${this.prefix}weekstats`) {
      console.log('Weekly stats command detected');
      return this.getWeeklyStats(message, mentionedUser);
    }

    if (command === `${this.prefix}monthstats`) {
      console.log('Monthly stats command detected');
      return this.getMonthlyStats(message, mentionedUser);
    }

    if (command === `${this.prefix}leaderboard`) {
      console.log('Leaderboard command detected');
      return this.getLeaderboard(message);
    }

    if (command === `${this.prefix}rolecheck`) {
      console.log('Role check command detected');
      return this.handleRoleActivityCheck(message);
    }

    // ... other commands can be added here
  }

  async showHelp(message) {
    const commands = [
      '**Albion Goodwill Bot Commands:**',
      `\`${this.prefix}ping\` - Test if bot is working`,
      `\`${this.prefix}stats [@user]\` - Show daily activity (yours or mentioned user's)`,
      `\`${this.prefix}weekstats [@user]\` - Show weekly activity (yours or mentioned user's)`,
      `\`${this.prefix}monthstats [@user]\` - Show monthly activity (yours or mentioned user's)`,
      `\`${this.prefix}leaderboard\` - Show top 10 active users today`,
      `\`${this.prefix}rolecheck @role [day]\` - Check activity of role members against top performers (defaults to weekly if day not specified)`,
      `\`${this.prefix}help\` - Show this help message`
    ].join('\n');

    await message.reply(commands);
  }

  async getDailyStats(message, targetUser) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const userId = targetUser ? targetUser.id : message.author.id;
      const displayName = targetUser ? targetUser.displayName : message.author.username;

      const stats = await prisma.dailyActivity.findUnique({
        where: {
          userId_date: {
            userId: userId,
            date: today
          }
        }
      });

      if (!stats) {
        await message.reply(`No activity recorded today for ${targetUser ? displayName : 'you'}.`);
        return;
      }

      const response = this.formatStats(`${targetUser ? `${displayName}'s` : 'Your'} Today's`, stats);
      await message.reply(response);
    } catch (error) {
      console.error('Error fetching daily stats:', error);
      await message.reply('Failed to fetch stats.');
    }
  }

  async getWeeklyStats(message, targetUser) {
    try {
      const weekStart = getWeekStart(new Date());
      const userId = targetUser ? targetUser.id : message.author.id;
      const displayName = targetUser ? targetUser.displayName : message.author.username;

      const stats = await prisma.weeklyActivity.findUnique({
        where: {
          userId_weekStart: {
            userId: userId,
            weekStart
          }
        }
      });

      if (!stats) {
        await message.reply(`No activity recorded this week for ${targetUser ? displayName : 'you'}.`);
        return;
      }

      const response = this.formatStats(`${targetUser ? `${displayName}'s` : 'Your'} Weekly`, stats);
      await message.reply(response);
    } catch (error) {
      console.error('Error fetching weekly stats:', error);
      await message.reply('Failed to fetch weekly stats.');
    }
  }

  async getMonthlyStats(message, targetUser) {
    try {
      const monthStart = getMonthStart(new Date());
      const userId = targetUser ? targetUser.id : message.author.id;
      const displayName = targetUser ? targetUser.displayName : message.author.username;

      const stats = await prisma.monthlyActivity.findUnique({
        where: {
          userId_monthStart: {
            userId: userId,
            monthStart
          }
        }
      });

      if (!stats) {
        await message.reply(`No activity recorded this month for ${targetUser ? displayName : 'you'}.`);
        return;
      }

      const response = this.formatStats(`${targetUser ? `${displayName}'s` : 'Your'} Monthly`, stats);
      await message.reply(response);
    } catch (error) {
      console.error('Error fetching monthly stats:', error);
      await message.reply('Failed to fetch monthly stats.');
    }
  }

  async getLeaderboard(message) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const topUsers = await prisma.dailyActivity.findMany({
        where: {
          date: today
        },
        orderBy: [
          { voiceTimeSeconds: 'desc' },
          { messageCount: 'desc' }
        ],
        take: 10
      });

      if (topUsers.length === 0) {
        await message.reply('No activity recorded today.');
        return;
      }

      const members = await message.guild.members.fetch();

      const leaderboardLines = topUsers.map((user, index) => {
        const member = members.get(user.userId);
        const displayName = member ? member.displayName : user.username;
        
        return [
          `${index + 1}. **${displayName}**`,
          `   🎤 Voice: ${formatDuration(user.voiceTimeSeconds)}`,
          `   💬 Messages: ${user.messageCount}`,
          user.afkTimeSeconds > 0 ? `   💤 AFK: ${formatDuration(user.afkTimeSeconds)}` : '',
          ''
        ].filter(Boolean).join('\n');
      });

      const response = [
        '**🏆 Today\'s Most Active Members:**',
        '',
        ...leaderboardLines
      ].join('\n');

      await message.reply(response);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      await message.reply('Failed to fetch leaderboard.');
    }
  }

  async handleRoleActivityCheck(message) {
    try {
      const args = message.content.split(' ');
      const mentionedRole = message.mentions.roles.first();
      const period = args[args.length - 1]?.toLowerCase();
      const isDaily = period === 'day';
      const ACTIVITY_THRESHOLD = 0.05; // 5% of top 10 average

      if (!mentionedRole) {
        return message.reply('Please mention a role to check activity. Usage: `!albiongwrolecheck @role [day]`');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekStart = getWeekStart(today);

      // Get top 10 active users based on period
      const topUsers = await prisma[isDaily ? 'dailyActivity' : 'weeklyActivity'].findMany({
        where: isDaily 
          ? { date: today }
          : { weekStart },
        orderBy: [
          { voiceTimeSeconds: 'desc' },
        ],
        take: 10
      });

      if (topUsers.length === 0) {
        return message.reply(`No activity recorded for this ${isDaily ? 'day' : 'week'}.`);
      }

      // Calculate average of top 10
      const topAvgVoiceTime = topUsers.reduce((sum, user) => sum + user.voiceTimeSeconds, 0) / topUsers.length;
      const minimumThreshold = topAvgVoiceTime * ACTIVITY_THRESHOLD; // 5% of top performers

      // Get all members with the mentioned role
      const roleMembers = mentionedRole.members;
      
      // Get activity for all role members
      const veryInactiveMembers = [];
      
      for (const [memberId, member] of roleMembers) {
        const memberActivity = await prisma[isDaily ? 'dailyActivity' : 'weeklyActivity'].findUnique({
          where: isDaily
            ? {
                userId_date: {
                  userId: memberId,
                  date: today
                }
              }
            : {
                userId_weekStart: {
                  userId: memberId,
                  weekStart
                }
              }
        });

        const voiceTime = memberActivity?.voiceTimeSeconds || 0;
        if (voiceTime <= minimumThreshold) {  // Changed to <= for minimum threshold
          veryInactiveMembers.push({
            member,
            voiceTime,
            percentage: ((voiceTime / topAvgVoiceTime) * 100).toFixed(1)
          });
        }
      }

      // Sort by voice time
      veryInactiveMembers.sort((a, b) => b.voiceTime - a.voiceTime);

      // Create header message
      const headerMessage = [
        `**Very Inactive Members Check for ${mentionedRole.name} (${isDaily ? 'Today' : 'This Week'})**`,
        `Top 10 Average Voice Time: ${formatDuration(topAvgVoiceTime)}`,
        `Minimum Required (5%): ${formatDuration(minimumThreshold)}`,
        '',
        '**Members Below 5% Activity:**'
      ].join('\n');

      await message.reply(headerMessage);

      // Split member list into chunks
      const CHUNK_SIZE = 20;
      const memberChunks = [];
      
      for (let i = 0; i < veryInactiveMembers.length; i += CHUNK_SIZE) {
        const chunk = veryInactiveMembers.slice(i, i + CHUNK_SIZE);
        const chunkMessage = chunk.map(({ member, voiceTime, percentage }) => 
          `${member.displayName}: ${formatDuration(voiceTime)} (${percentage}%)`
        ).join('\n');

        if (chunkMessage.length > 0) {
          memberChunks.push(chunkMessage);
        }
      }

      // Send each chunk as a separate message
      for (const chunk of memberChunks) {
        await message.channel.send(chunk);
      }

      // Send summary message
      const summaryMessage = [
        '',
        `Total: ${veryInactiveMembers.length} members below 5% activity threshold`,
        `Period: ${isDaily ? 'Today' : 'This Week'}`
      ].join('\n');

      await message.channel.send(summaryMessage);

    } catch (error) {
      console.error('Error checking role activity:', error);
      await message.reply('Failed to check role activity.');
    }
  }

  formatStats(period, stats) {
    return [
      `**${period} Activity:**`,
      `Messages Sent: ${stats.messageCount}`,
      `Voice Time: ${formatDuration(stats.voiceTimeSeconds)}`,
      `AFK Time: ${formatDuration(stats.afkTimeSeconds)}`,
      `Muted/Deafened Time: ${formatDuration(stats.mutedDeafenedTimeSeconds)}`
    ].join('\n');
  }
}

module.exports = CommandHandler; 