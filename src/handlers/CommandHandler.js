const prisma = require('../config/prisma');
const { formatDuration, getWeekStart, getMonthStart } = require('../utils/timeUtils');

class CommandHandler {
  constructor() {
    this.prefix = '!albiongw';
  }

  async handleCommand(message) {
    if (!message.content.startsWith(this.prefix)) return;

    const args = message.content.slice(this.prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    try {
      switch (command) {
        case 'ping':
          await this.handlePing(message);
          break;
        case 'daily':
          await this.getDailyStats(message, message.mentions.users.first());
          break;
        case 'weekly':
          await this.getWeeklyStats(message, message.mentions.users.first());
          break;
        case 'monthly':
          await this.getMonthlyStats(message, message.mentions.users.first());
          break;
        case 'leaderboard':
          await this.getLeaderboard(message);
          break;
        case 'help':
          await this.showHelp(message);
          break;
        case 'rolecheck':
          const role = message.mentions.roles.first();
          if (!role) {
            await message.reply('Por favor, mencione um cargo para verificar.');
            return;
          }
          const period = args[1]?.toLowerCase() === 'daily' ? 'daily' : 'weekly';
          await this.handleRoleActivityCheck(message, role, period);
          break;
      }
    } catch (error) {
      console.error('Command error:', error.message);
      await message.reply('There was an error executing this command!');
    }
  }

  async handlePing(message) {
    const sent = await message.reply('Pong!');
    const latency = sent.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(message.client.ws.ping);
    
    await sent.edit([
      '🏓 Pong!',
      `Latência: ${latency}ms`,
      `API Latência: ${apiLatency}ms`
    ].join('\n'));
  }

  async showHelp(message) {
    const commands = [
      '**Albion Goodwill Bot Commands:**',
      `\`${this.prefix} ping\` - Verificar se o bot está funcionando`,
      `\`${this.prefix} daily [@user]\` - Mostrar atividade diária (sua ou do usuário mencionado)`,
      `\`${this.prefix} weekly [@user]\` - Mostrar atividade semanal`,
      `\`${this.prefix} monthly [@user]\` - Mostrar atividade mensal`,
      `\`${this.prefix} leaderboard\` - Mostrar top 10 usuários ativos hoje`,
      `\`${this.prefix} help\` - Mostrar esta mensagem de ajuda`,
      `\`${this.prefix} rolecheck @role [daily|weekly]\` - Verificar atividade dos membros de um cargo`
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
          userId_guildId_date: {
            userId: userId,
            guildId: message.guild.id,
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
          userId_guildId_weekStart: {
            userId: userId,
            guildId: message.guild.id,
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
          userId_guildId_monthStart: {
            userId: userId,
            guildId: message.guild.id,
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
          date: today,
          guildId: message.guild.id
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

  async handleRoleActivityCheck(source, role, period = 'weekly') {
    const isInteraction = source.commandName === 'rolecheck';
    const guildId = isInteraction ? source.guildId : source.guild.id;
    const reply = (content) => isInteraction ? source.reply(content) : source.reply(content);

    try {
      const isDaily = period === 'daily';
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get role members
      const members = role.members;

      // Get activity data
      const activityData = await prisma[isDaily ? 'dailyActivity' : 'weeklyActivity'].findMany({
        where: {
          guildId,
          date: isDaily ? today : getWeekStart(today)
        }
      });

      // Calculate threshold from top performers
      const topPerformers = activityData
        .sort((a, b) => b.voiceTimeSeconds - a.voiceTimeSeconds)
        .slice(0, 10);

      const topAvgVoiceTime = topPerformers.reduce((sum, user) => 
        sum + user.voiceTimeSeconds, 0) / topPerformers.length;

      const minimumThreshold = topAvgVoiceTime * 0.05; // 5% threshold

      // Find inactive members
      const veryInactiveMembers = [];
      
      for (const [memberId, member] of members) {
        const activity = activityData.find(a => a.userId === memberId);
        const voiceTime = activity?.voiceTimeSeconds || 0;
        const percentage = ((voiceTime / topAvgVoiceTime) * 100).toFixed(1);

        if (voiceTime < minimumThreshold) {
          veryInactiveMembers.push({ member, voiceTime, percentage });
        }
      }

      // Sort by voice time
      veryInactiveMembers.sort((a, b) => b.voiceTime - a.voiceTime);

      // Send results
      const response = [
        `**Verificação de Atividade: ${role.name}**`,
        `Período: ${isDaily ? 'Hoje' : 'Esta Semana'}`,
        `Média Top 10: ${formatDuration(topAvgVoiceTime)}`,
        `Mínimo Requerido (5%): ${formatDuration(minimumThreshold)}`,
        '',
        '**Membros Abaixo do Limite:**',
        ...veryInactiveMembers.map(({ member, voiceTime, percentage }) => 
          `${member.displayName}: ${formatDuration(voiceTime)} (${percentage}%)`
        ),
        '',
        `Total: ${veryInactiveMembers.length} membros abaixo do limite de 5%`
      ].join('\n');

      await reply(response);
    } catch (error) {
      console.error('Role check error:', error.message);
      await reply('Erro ao verificar atividade do cargo.');
    }
  }

  formatStats(period, stats) {
    return [
      `**${period} Activity:**`,
      `🎤 Voice Time: ${formatDuration(stats.voiceTimeSeconds)}`,
      `💬 Messages: ${stats.messageCount}`,
      stats.afkTimeSeconds > 0 ? `💤 AFK Time: ${formatDuration(stats.afkTimeSeconds)}` : null,
      stats.mutedDeafenedTimeSeconds > 0 ? `🔇 Muted Time: ${formatDuration(stats.mutedDeafenedTimeSeconds)}` : null
    ].filter(Boolean).join('\n');
  }

  async handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    try {
      switch (interaction.commandName) {
        case 'ping':
          const sent = await interaction.reply({ content: 'Pong!', fetchReply: true });
          const latency = sent.createdTimestamp - interaction.createdTimestamp;
          const apiLatency = Math.round(interaction.client.ws.ping);
          
          await interaction.editReply([
            '🏓 Pong!',
            `Latência: ${latency}ms`,
            `API Latência: ${apiLatency}ms`
          ].join('\n'));
          break;
        case 'stats':
          await this.handleStatsCommand(interaction);
          break;
        case 'leaderboard':
          await this.handleLeaderboardCommand(interaction);
          break;
        case 'rolecheck':
          const role = interaction.options.getRole('role');
          const period = interaction.options.getString('period') || 'weekly';
          await this.handleRoleActivityCheck(interaction, role, period);
          break;
      }
    } catch (error) {
      console.error('Command error:', error.message);
      await interaction.reply({ 
        content: 'There was an error executing this command!', 
        ephemeral: true 
      });
    }
  }

  async handleStatsCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user');

    await interaction.deferReply();

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const userId = targetUser ? targetUser.id : interaction.user.id;
      const displayName = targetUser ? targetUser.displayName : interaction.user.username;
      let stats;

      switch (subcommand) {
        case 'daily':
          stats = await prisma.dailyActivity.findUnique({
            where: {
              userId_guildId_date: {
                userId,
                guildId: interaction.guildId,
                date: today
              }
            }
          });
          break;
        case 'weekly':
          stats = await prisma.weeklyActivity.findUnique({
            where: {
              userId_guildId_weekStart: {
                userId,
                guildId: interaction.guildId,
                weekStart: getWeekStart(today)
              }
            }
          });
          break;
        case 'monthly':
          stats = await prisma.monthlyActivity.findUnique({
            where: {
              userId_guildId_monthStart: {
                userId,
                guildId: interaction.guildId,
                monthStart: getMonthStart(today)
              }
            }
          });
          break;
      }

      if (!stats) {
        await interaction.editReply(`No activity recorded for ${targetUser ? displayName : 'you'}.`);
        return;
      }

      const period = `${targetUser ? `${displayName}'s` : 'Your'} ${subcommand.charAt(0).toUpperCase() + subcommand.slice(1)}`;
      const response = this.formatStats(period, stats);
      await interaction.editReply(response);
    } catch (error) {
      console.error('Stats command error:', error.message);
      await interaction.editReply('Failed to fetch stats.');
    }
  }

  async handleLeaderboardCommand(interaction) {
    await interaction.deferReply();

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const topUsers = await prisma.dailyActivity.findMany({
        where: {
          date: today,
          guildId: interaction.guildId
        },
        orderBy: [
          { voiceTimeSeconds: 'desc' },
          { messageCount: 'desc' }
        ],
        take: 10
      });

      if (topUsers.length === 0) {
        await interaction.editReply('No activity recorded today.');
        return;
      }

      const members = await interaction.guild.members.fetch();
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

      await interaction.editReply(response);
    } catch (error) {
      console.error('Leaderboard error:', error.message);
      await interaction.editReply('Failed to fetch leaderboard.');
    }
  }
}

module.exports = CommandHandler; 