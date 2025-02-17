const prisma = require('../config/prisma');
const { formatDuration, getWeekStart, getMonthStart } = require('../utils/timeUtils');
const { fetchGuildStats, getMainRole, calculatePlayerScores } = require('../utils/albionApi');
const { registerCommands } = require('../commands/registerCommands');

class CommandHandler {
  constructor() {
    this.prefix = '!albiongw';
    this.prefixCache = new Map();
    this.MAX_COMPETITORS = 5;
  }

  async getGuildPrefix(guildId) {
    if (this.prefixCache.has(guildId)) {
      return this.prefixCache.get(guildId);
    }

    const settings = await prisma.guildSettings.findUnique({
      where: { guildId }
    });

    const prefix = settings?.commandPrefix || this.prefix;
    this.prefixCache.set(guildId, prefix);
    return prefix;
  }

  async handleCommand(message) {
    const guildPrefix = await this.getGuildPrefix(message.guild.id);
    if (!message.content.startsWith(guildPrefix)) return;

    const args = message.content.slice(guildPrefix.length).trim().split(/ +/);
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
        case 'setguildid':
          if (!args[0]) {
            await message.reply('Por favor, forneça o ID da guild do Albion.');
            return;
          }
          await this.handleSetGuildId(message, args[0]);
          break;
        case 'competitors':
          if (!args[0]) {
            await this.listCompetitors(message);
            return;
          }
          switch(args[0].toLowerCase()) {
            case 'add':
              if (!args[1]) {
                await message.reply('Por favor, forneça o ID da guild competidora.');
                return;
              }
              await this.handleAddCompetitor(message, args[1]);
              break;
            case 'remove':
              if (!args[1]) {
                await message.reply('Por favor, forneça o ID da guild competidora.');
                return;
              }
              await this.handleRemoveCompetitor(message, args[1]);
              break;
            case 'list':
              await this.listCompetitors(message);
              break;
          }
          break;
        case 'playermmr':
          if (!args[0]) {
            await message.reply('Por favor, forneça o nome do jogador.');
            return;
          }
          await this.handlePlayerMMR(message, args[0]);
          break;
        case 'refresh':
          await this.handleRefreshCommands(message);
          break;
        case 'mmrrank':
          await this.handleMMRRank(message);
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
    const guildPrefix = await this.getGuildPrefix(message.guild.id);
    const commands = [
      '**Albion Goodwill Bot Commands:**',
      `\`${guildPrefix} ping\` - Verificar se o bot está funcionando`,
      `\`${guildPrefix} daily [@user]\` - Mostrar atividade diária (sua ou do usuário mencionado)`,
      `\`${guildPrefix} weekly [@user]\` - Mostrar atividade semanal`,
      `\`${guildPrefix} monthly [@user]\` - Mostrar atividade mensal`,
      `\`${guildPrefix} leaderboard\` - Mostrar top 10 usuários ativos hoje`,
      `\`${guildPrefix} rolecheck @role [daily|weekly]\` - Verificar atividade dos membros de um cargo`,
      `\`${guildPrefix} setguildid <id>\` - Definir ID da guild do Albion`,
      `\`${guildPrefix} setprefix <prefix>\` - Definir novo prefixo para comandos`,
      `\`${guildPrefix} setguildname <name>\` - Definir nome da guild`,
      `\`${guildPrefix} competitors add <id>\` - Adicionar guild competidora`,
      `\`${guildPrefix} competitors remove <id>\` - Remover guild competidora`,
      `\`${guildPrefix} competitors list\` - Listar todas as guilds competidoras`,
      `\`${guildPrefix} playermmr <player>\` - Verificar MMR do jogador`,
      `\`${guildPrefix} refresh\` - Recarregar comandos slash`,
      `\`${guildPrefix} mmrrank\` - Mostrar ranking MMR por role da guild`,
      `\`${guildPrefix} help\` - Mostrar esta mensagem de ajuda`
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
    const voiceTime = formatDuration(stats.voiceTimeSeconds);
    const afkTime = formatDuration(stats.afkTimeSeconds);
    const mutedTime = formatDuration(stats.mutedTimeSeconds);

    const activePercentage = Math.round((stats.voiceTimeSeconds - stats.afkTimeSeconds) / stats.voiceTimeSeconds * 100);
    const afkPercentage = Math.round(stats.afkTimeSeconds / stats.voiceTimeSeconds * 100);

    return [
      `**${period} Activity Stats:**`,
      '',
      '**Voice Activity:**',
      `🎤 Active Voice: ${voiceTime}`,
      `💤 AFK: ${afkTime}`,
      `🔇 Muted: ${mutedTime}`,
      '',
      '**Chat Activity:**',
      `💬 Messages: ${stats.messageCount}`,
      '',
      '**Active Time Distribution:**',
      `🟩 Active: ${activePercentage}%`,
      `⬜ AFK: ${afkPercentage}%`
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
        case 'settings':
          switch (interaction.options.getSubcommand()) {
            case 'setguildid':
              const guildId = interaction.options.getString('id');
              await this.handleSetGuildId(interaction, guildId);
              break;
            case 'setprefix':
              const prefix = interaction.options.getString('prefix');
              await this.handleSetPrefix(interaction, prefix);
              break;
            case 'setguildname':
              const name = interaction.options.getString('name');
              await this.handleSetGuildName(interaction, name);
              break;
          }
          break;
        case 'competitors':
          switch (interaction.options.getSubcommand()) {
            case 'add':
              const addId = interaction.options.getString('id');
              await this.handleAddCompetitor(interaction, addId);
              break;
            case 'remove':
              const removeId = interaction.options.getString('id');
              await this.handleRemoveCompetitor(interaction, removeId);
              break;
            case 'list':
              await this.listCompetitors(interaction);
              break;
          }
          break;
        case 'playermmr':
          const playerName = interaction.options.getString('player');
          await this.handlePlayerMMR(interaction, playerName);
          break;
        case 'refresh':
          await this.handleRefreshCommands(interaction);
          break;
        case 'mmrrank':
          await this.handleMMRRank(interaction);
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

  async handleSetGuildId(source, albionGuildId) {
    // Check if user has admin permissions
    const member = source.member;
    if (!member.permissions.has('ADMINISTRATOR')) {
      const response = 'Você precisa ter permissões de administrador para usar este comando.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
      return;
    }

    try {
      await prisma.guildSettings.update({
        where: {
          guildId: source.guildId
        },
        data: {
          albionGuildId
        }
      });

      const response = `ID da guild do Albion atualizado para: ${albionGuildId}`;
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    } catch (error) {
      console.error('Error setting Albion guild ID:', error);
      const response = 'Erro ao atualizar ID da guild do Albion.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    }
  }

  async handleSetPrefix(source, newPrefix) {
    // Check admin permissions
    const member = source.member;
    if (!member.permissions.has('ADMINISTRATOR')) {
      const response = 'Você precisa ter permissões de administrador para usar este comando.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
      return;
    }

    try {
      await prisma.guildSettings.update({
        where: { guildId: source.guildId },
        data: { commandPrefix: newPrefix }
      });

      // Update cache
      this.prefixCache.set(source.guildId, newPrefix);

      const response = `Prefixo atualizado para: ${newPrefix}`;
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    } catch (error) {
      console.error('Error setting prefix:', error);
      const response = 'Erro ao atualizar prefixo.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    }
  }

  async handleSetGuildName(source, guildName) {
    // Check admin permissions
    const member = source.member;
    if (!member.permissions.has('ADMINISTRATOR')) {
      const response = 'Você precisa ter permissões de administrador para usar este comando.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
      return;
    }

    try {
      await prisma.guildSettings.update({
        where: { guildId: source.guildId },
        data: { guildName }
      });

      const response = `Nome da guild atualizado para: ${guildName}`;
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    } catch (error) {
      console.error('Error setting guild name:', error);
      const response = 'Erro ao atualizar nome da guild.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    }
  }

  async handleAddCompetitor(source, competitorId) {
    // Check admin permissions
    const member = source.member;
    if (!member.permissions.has('ADMINISTRATOR')) {
      const response = 'Você precisa ter permissões de administrador para usar este comando.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
      return;
    }

    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: source.guildId }
      });

      if (settings.competitorIds.length >= this.MAX_COMPETITORS) {
        const response = `Limite máximo de ${this.MAX_COMPETITORS} guilds competidoras atingido. Remova alguma antes de adicionar outra.`;
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      if (settings.competitorIds.includes(competitorId)) {
        const response = 'Esta guild já está na lista de competidores.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      await prisma.guildSettings.update({
        where: { guildId: source.guildId },
        data: {
          competitorIds: {
            push: competitorId
          }
        }
      });

      const response = `Guild competidora adicionada: ${competitorId}`;
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    } catch (error) {
      console.error('Error adding competitor:', error);
      const response = 'Erro ao adicionar guild competidora.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    }
  }

  async handleRemoveCompetitor(source, competitorId) {
    // Check admin permissions
    const member = source.member;
    if (!member.permissions.has('ADMINISTRATOR')) {
      const response = 'Você precisa ter permissões de administrador para usar este comando.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
      return;
    }

    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: source.guildId }
      });

      if (!settings.competitorIds.includes(competitorId)) {
        const response = 'Esta guild não está na lista de competidores.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      await prisma.guildSettings.update({
        where: { guildId: source.guildId },
        data: {
          competitorIds: {
            set: settings.competitorIds.filter(id => id !== competitorId)
          }
        }
      });

      const response = `Guild competidora removida: ${competitorId}`;
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    } catch (error) {
      console.error('Error removing competitor:', error);
      const response = 'Erro ao remover guild competidora.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    }
  }

  async listCompetitors(source) {
    try {
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: source.guildId }
      });

      if (!settings.competitorIds.length) {
        const response = 'Nenhuma guild competidora cadastrada.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      const response = [
        '**Guilds Competidoras:**',
        '',
        ...settings.competitorIds.map((id, index) => `${index + 1}. ${id}`),
        '',
        `Total: ${settings.competitorIds.length}/${this.MAX_COMPETITORS}`
      ].join('\n');

      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    } catch (error) {
      console.error('Error listing competitors:', error);
      const response = 'Erro ao listar guilds competidoras.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    }
  }

  async handlePlayerMMR(source, playerName) {
    try {
      // Get guild settings
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: source.guildId }
      });

      if (!settings.albionGuildId) {
        const response = 'ID da guild do Albion não configurado. Use /settings setguildid primeiro.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      if (!settings.competitorIds.length) {
        const response = 'Nenhuma guild competidora configurada. Use /competitors add primeiro.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      // Fetch stats for all guilds
      const mainGuildStats = await fetchGuildStats(settings.albionGuildId);
      const competitorStats = await Promise.all(
        settings.competitorIds.map(id => fetchGuildStats(id))
      );

      // Find player in any guild
      const allPlayers = [
        ...mainGuildStats,
        ...competitorStats.flat()
      ];

      const player = allPlayers.find(p => 
        p.name.toLowerCase() === playerName.toLowerCase()
      );

      if (!player) {
        const response = 'Jogador não encontrado em nenhuma das guilds.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      const mainRole = getMainRole(player.roles);

      // Calculate Global MMR
      const globalPlayers = allPlayers.filter(p => {
        const playerMainRole = getMainRole(p.roles);
        return playerMainRole.index === mainRole.index && p.attendance >= 5;
      });
      const globalScores = calculatePlayerScores(globalPlayers, mainRole.index);
      const globalBest = globalScores[0];
      const globalWorst = globalScores[globalScores.length - 1];
      const globalPlayerScore = globalScores.find(p => p.name === player.name);
      const globalRank = globalScores.findIndex(p => p.name === player.name) + 1;

      // Calculate Guild-only MMR
      const guildPlayers = allPlayers.filter(p => {
        const playerMainRole = getMainRole(p.roles);
        return playerMainRole.index === mainRole.index && 
               p.attendance >= 5 && 
               p.guildName === player.guildName;
      });
      const guildScores = calculatePlayerScores(guildPlayers, mainRole.index);
      const guildBest = guildScores[0];
      const guildWorst = guildScores[guildScores.length - 1];
      const guildPlayerScore = guildScores.find(p => p.name === player.name);
      const guildRank = guildScores.findIndex(p => p.name === player.name) + 1;

      // Helper function to format role-specific stats
      function formatPlayerStats(player, roleIndex) {
        const baseStats = `Participações: ${player.attendance} | IP: ${player.avgIp}`;
        const kd = player.deaths > 0 ? 
          ((player.kills - player.deaths) / player.deaths).toFixed(2) : 
          player.kills.toFixed(2);
        
        switch(roleIndex) {
          case 0: // Tank
            return `${baseStats} | K/D: ${kd} | Fame/Batalha: ${Math.round(player.killFame / player.attendance).toLocaleString()}`;
          
          case 1: // Support
          case 2: // Healer
            return `${baseStats} | K/D: ${kd} | Cura/Batalha: ${Math.round(player.heal / player.attendance).toLocaleString()}`;
          
          case 3: // DPS Melee
          case 4: // DPS Ranged
            return `${baseStats} | K/D: ${kd} | Dano/Batalha: ${Math.round(player.damage / player.attendance).toLocaleString()}`;
          
          case 5: // Battlemount
            return `${baseStats} | K/D: ${kd} | Fame/Batalha: ${Math.round(player.killFame / player.attendance).toLocaleString()}`;
        }
      }

      // Format role-specific stats
      let roleStats = '';
      const kd = player.deaths > 0 ? 
        ((player.kills - player.deaths) / player.deaths).toFixed(2) : 
        player.kills.toFixed(2);

      switch(mainRole.index) {
        case 0: // Tank
          roleStats = `K/D: ${kd} | Fame/Batalha: ${Math.round(player.killFame / player.attendance).toLocaleString()}`;
          break;
        
        case 1: // Support
        case 2: // Healer
          roleStats = `K/D: ${kd} | Cura/Batalha: ${Math.round(player.heal / player.attendance).toLocaleString()}`;
          break;
        
        case 3: // DPS Melee
        case 4: // DPS Ranged
          roleStats = `K/D: ${kd} | Fame/Batalha: ${Math.round(player.killFame / player.attendance).toLocaleString()} | Dano/Batalha: ${Math.round(player.damage / player.attendance).toLocaleString()}`;
          break;
        
        case 5: // Battlemount
          roleStats = `K/D: ${kd} | Fame/Batalha: ${Math.round(player.killFame / player.attendance).toLocaleString()}`;
          break;
      }

      const response = [
        '**Análise dos últimos 30 dias (batalhas com 20+ players)**',
        '',
        `**${player.name}** [${player.guildName}] - ${mainRole.name}`,
        `Participação: ${player.attendance} batalhas | IP: ${player.avgIp}`,
        roleStats,
        '',
        '**MMR Global:**',
        `${globalPlayerScore.score}/100 (#${globalRank} de ${globalScores.length} ${mainRole.name}s)`,
        '',
        '**MMR na Guild:**',
        `${guildPlayerScore.score}/100 (#${guildRank} de ${guildScores.length} ${mainRole.name}s)`,
        '',
        '**Top Players da Role (Global):**',
        `🥇 ${globalBest.name}: ${globalBest.score}/100 (${globalBest.guildName}) | ${formatPlayerStats(globalBest, mainRole.index)}`,
        `🔻 ${globalWorst.name}: ${globalWorst.score}/100 (${globalWorst.guildName}) | ${formatPlayerStats(globalWorst, mainRole.index)}`,
        '',
        `**Top Players da Role (${player.guildName}):**`,
        `🥇 ${guildBest.name}: ${guildBest.score}/100 | ${formatPlayerStats(guildBest, mainRole.index)}`,
        `🔻 ${guildWorst.name}: ${guildWorst.score}/100 | ${formatPlayerStats(guildWorst, mainRole.index)}`
      ].join('\n');

      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    } catch (error) {
      console.error('Error calculating player MMR:', error);
      const response = 'Erro ao calcular MMR do jogador.';
      if (source.commandName) {
        try {
          if (!source.replied) {
            await source.reply({ content: response, flags: [4096] });
          } else {
            await source.followUp({ content: response, flags: [4096] });
          }
        } catch (e) {
          console.error('Interaction error:', e);
        }
      } else {
        await source.reply(response);
      }
    }
  }

  async handleRefreshCommands(source) {
    // Check if user has admin permissions
    const member = source.member;
    if (!member.permissions.has('ADMINISTRATOR')) {
      const response = 'Você precisa ter permissões de administrador para usar este comando.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
      return;
    }

    try {
      const initialResponse = 'Recarregando comandos slash...';
      if (source.commandName) {
        await source.reply({ content: initialResponse, ephemeral: true });
      } else {
        await source.reply(initialResponse);
      }

      await registerCommands(source.client);

      const successResponse = 'Comandos slash recarregados com sucesso!';
      if (source.commandName) {
        if (source.replied) {
          await source.editReply(successResponse);
        } else {
          await source.reply({ content: successResponse, ephemeral: true });
        }
      } else {
        await source.channel.send(successResponse);
      }
    } catch (error) {
      console.error('Error refreshing commands:', error);
      const errorResponse = 'Erro ao recarregar comandos slash.';
      if (source.commandName) {
        if (source.replied) {
          await source.editReply(errorResponse);
        } else {
          await source.reply({ content: errorResponse, ephemeral: true });
        }
      } else {
        await source.channel.send(errorResponse);
      }
    }
  }

  async handleMMRRank(source) {
    try {
      // Get guild settings
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: source.guildId }
      });

      if (!settings.albionGuildId) {
        const response = 'ID da guild do Albion não configurado. Use /settings setguildid primeiro.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      // Fetch guild stats
      const guildStats = await fetchGuildStats(settings.albionGuildId);
      if (!guildStats || !guildStats.length) {
        const response = 'Não foi possível obter dados da guild.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      // Group players by role
      const roleGroups = [[], [], [], [], [], []]; // One array for each role
      guildStats.forEach(player => {
        const mainRole = getMainRole(player.roles);
        if (player.attendance >= 5) { // Only include players with minimum attendance
          roleGroups[mainRole.index].push(player);
        }
      });

      const roleNames = ['Tank', 'Support', 'Healer', 'DPS Melee', 'DPS Ranged', 'Battlemount'];
      
      const roleParam = source.commandName ? 
        source.options?.getString('role') : 
        source.content.split(' ')[2]?.toLowerCase();

      console.log('Role param:', roleParam); // Debug log
      console.log('Role groups:', roleGroups.map(g => g.length)); // Debug log

      const roleMap = {
        'tank': 0,
        'support': 1,
        'healer': 2,
        'melee': 3,
        'ranged': 4,
        'mount': 5
      };

      // Format response for each role
      const roleRankings = roleGroups.map((players, roleIndex) => {
        if (players.length === 0) {
          console.log(`No players for role ${roleIndex}`); // Debug log
          return null;
        }
        if (roleParam && roleMap[roleParam] !== roleIndex) {
          console.log(`Skipping role ${roleIndex} as it doesn't match param ${roleParam}`); // Debug log
          return null;
        }

        const scores = calculatePlayerScores(players, roleIndex);
        
        let playerList;
        if (roleParam) {
          // Show full ranking for specified role
          playerList = scores;
        } else {
          // Show only top/bottom 5 for overview
          const top5 = scores.slice(0, 5);
          const bottom5 = scores.slice(-5);
          playerList = [...top5, null, ...bottom5];
        }

        const formatPlayerStats = (p) => {
          if (!p) return '';
          const kd = p.deaths > 0 ? 
            ((p.kills - p.deaths) / p.deaths).toFixed(2) : 
            p.kills.toFixed(2);
          const famePerBattle = Math.round(p.killFame / p.attendance).toLocaleString();
          return `${p.name.padEnd(16)} ${p.score.toString().padStart(3)}/100 | ${Math.round(p.avgIp)} IP | ${p.attendance} Battle | K/D: ${kd} | Fame/Battle: ${famePerBattle}`;
        };

        return [
          `\n**${roleNames[roleIndex]}s** (${scores.length} players)`,
          '```',
          roleParam ? 'Ranking Completo:' : 'Top 5:',
          ...playerList.map((p, i) => {
            if (!p) return roleParam ? null : '';
            const position = roleParam ? i + 1 : (i < 5 ? i + 1 : scores.length - 4 + (i - 5));
            return `${position}. ${formatPlayerStats(p)}`;
          }).filter(Boolean),
          '```'
        ].join('\n');
      }).filter(Boolean);

      console.log('Role rankings length:', roleRankings.length); // Debug log

      // Send header message
      const headerMessage = roleParam && roleMap.hasOwnProperty(roleParam) ? 
        [
          `**Ranking MMR ${settings.guildName || 'da Guild'}**`,
          '(últimos 30 dias, mínimo 5 batalhas)',
          `Mostrando ranking completo para: ${roleNames[roleMap[roleParam]]}`,
          ''
        ].join('\n')
        :
        [
          `**Ranking MMR ${settings.guildName || 'da Guild'}**`,
          '(últimos 30 dias, mínimo 5 batalhas)',
          ''
        ].join('\n');

      if (source.commandName) {
        await source.reply({ content: headerMessage, ephemeral: true });
      } else {
        await source.reply(headerMessage);
      }

      // Send each role ranking in separate messages
      for (const roleRanking of roleRankings) {
        if (!roleRanking) continue;

        if (source.commandName) {
          await source.followUp({ content: roleRanking, ephemeral: true });
        } else {
          await source.channel.send(roleRanking);
        }
      }
    } catch (error) {
      console.error('Error generating MMR ranking:', error);
      const response = 'Erro ao gerar ranking MMR.';
      if (source.commandName) {
        if (!source.replied) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.followUp({ content: response, ephemeral: true });
        }
      } else {
        await source.reply(response);
      }
    }
  }
}

module.exports = CommandHandler; 