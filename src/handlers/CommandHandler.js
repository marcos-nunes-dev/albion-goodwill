const { Collection } = require('discord.js');
const { readdirSync, statSync } = require('fs');
const { join } = require('path');
const prisma = require('../config/prisma');
const { formatDuration, getWeekStart, getMonthStart } = require('../utils/timeUtils');
const { fetchGuildStats, getMainRole, calculatePlayerScores } = require('../utils/albionApi');
const axios = require('axios');
const { EmbedBuilder, Colors } = require('discord.js');
const { fetchActivityData } = require('../utils/activityUtils');

class CommandHandler {
  constructor(client) {
    this.client = client;
    this.commands = new Collection();
    this.cooldowns = new Collection();
    this.prefix = '!albiongw';
    this.prefixCache = new Map();
    this.MAX_COMPETITORS = 5;
    
    this.loadCommands();
  }

  loadCommands() {
    const commandsPath = join(__dirname, '..', 'commands');
    const items = readdirSync(commandsPath);

    for (const item of items) {
      const itemPath = join(commandsPath, item);
      
      // Skip if it's not a directory
      if (!statSync(itemPath).isDirectory()) {
        continue;
      }

      const commandFiles = readdirSync(itemPath)
        .filter(file => file.endsWith('.js'));

      for (const file of commandFiles) {
        const command = require(join(itemPath, file));
        this.commands.set(command.name, command);
      }
    }
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
    if (message.author.bot) return;

    const guildPrefix = await this.getGuildPrefix(message.guild.id);

    // Check if message starts with prefix (case insensitive)
    if (!message.content.toLowerCase().startsWith(guildPrefix.toLowerCase())) return;

    const args = message.content.slice(guildPrefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    const command = this.commands.get(commandName) || 
                   this.commands.find(cmd => cmd.aliases?.includes(commandName));

    if (!command) return;

    try {
      // Check permissions
      if (command.permissions?.length > 0) {
        const missingPerms = command.permissions.filter(perm => !message.member.permissions.has(perm));
        if (missingPerms.length > 0) {
          return message.reply(`You need the following permissions: ${missingPerms.join(', ')}`);
        }
      }

      // Check cooldown
      if (!this.checkCooldown(message, command)) return;

      // Execute command with handler instance
      await command.execute(message, args, this);
    } catch (error) {
      console.error('Command error:', error);
      await message.reply('There was an error executing this command!');
    }
  }

  checkCooldown(source, command) {
    if (!this.cooldowns.has(command.name)) {
      this.cooldowns.set(command.name, new Collection());
    }

    const now = Date.now();
    const timestamps = this.cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    // Get user ID and handle response based on source type
    const userId = source.user?.id || source.author?.id;
    const reply = (content) => {
      if (source.reply) {
        return source.reply(typeof content === 'string' ? { content } : content);
      }
      return source.channel.send(content);
    };

    if (!userId) return true; // Allow command to proceed if we can't determine user

    if (timestamps.has(userId)) {
      const expirationTime = timestamps.get(userId) + cooldownAmount;

      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        const cooldownMessage = {
          content: `Please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.name}\` command.`,
          ephemeral: true
        };
        reply(cooldownMessage);
        return false;
      }
    }

    timestamps.set(userId, now);
    setTimeout(() => timestamps.delete(userId), cooldownAmount);
    return true;
  }

  async showHelp(message) {
    const guildPrefix = await this.getGuildPrefix(message.guild.id);
    const commands = [
      '**Albion Goodwill Bot Commands:**',
      `\`${guildPrefix} ping\` - Verificar se o bot está funcionando`,
      `\`${guildPrefix} presencedaily [@user]\` - Mostrar presença diária (sua ou do usuário mencionado)`,
      `\`${guildPrefix} presenceweekly [@user]\` - Mostrar presença semanal`,
      `\`${guildPrefix} presencemonthly [@user]\` - Mostrar presença mensal`,
      '',
      '**Comandos de Administrador:**',
      `\`${guildPrefix} setguildid <id>\` - Definir ID da guild do Albion`,
      `\`${guildPrefix} setprefix <prefix>\` - Definir novo prefixo para comandos`,
      `\`${guildPrefix} setguildname <name>\` - Definir nome da guild`,
      `\`${guildPrefix} setrole <type> @role\` - Definir cargo para uma role do Albion`,
      `\`${guildPrefix} setverifiedrole @role\` - Definir cargo para membros verificados`,
      `\`${guildPrefix} updatemembersrole @role\` - Atualizar roles dos membros baseado na main class`,
      `\`${guildPrefix} unregister <playername>\` - Remover registro de um jogador`,
      `\`${guildPrefix} checkregistrations @role\` - Verificar membros não registrados em um cargo`,
      '',
      '**Comandos de Competidores:**',
      `\`${guildPrefix} competitors add <id>\` - Adicionar guild competidora`,
      `\`${guildPrefix} competitors remove <id>\` - Remover guild competidora`,
      `\`${guildPrefix} competitors list\` - Listar todas as guilds competidoras`,
      '',
      '**Comandos de MMR:**',
      `\`${guildPrefix} playermmr <player>\` - Verificar MMR do jogador`,
      `\`${guildPrefix} mmrrank [role]\` - Mostrar ranking MMR por role da guild`,
      '',
      '**Outros Comandos:**',
      `\`${guildPrefix} refresh\` - Recarregar comandos slash`,
      `\`${guildPrefix} help\` - Mostrar esta mensagem de ajuda`
    ].join('\n');

    await message.reply(commands);
  }

  async getDailyStats(message, targetUser) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const userId = targetUser ? targetUser.id : message.author.id;
      const displayName = targetUser ? 
          (targetUser.displayName || targetUser.user.username) : 
          (message.member?.displayName || message.author.username);

      const { data: stats } = await fetchActivityData({
        userId,
        guildId: message.guild.id,
        period: 'daily',
        startDate: today
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
      const { data: stats } = await fetchActivityData({
        userId: targetUser.id,
        guildId: message.guild.id,
        period: 'weekly',
        startDate: weekStart
      });

      if (!stats) {
        await message.reply(`No activity recorded this week for ${targetUser ? targetUser.displayName || targetUser.user.username : 'you'}.`);
        return;
      }

      const response = this.formatStats(`${targetUser ? `${targetUser.displayName || targetUser.user.username}'s` : 'Your'} Weekly`, stats);
      await message.reply(response);
    } catch (error) {
      console.error('Error fetching weekly stats:', error);
      await message.reply('Failed to fetch weekly stats.');
    }
  }

  async getMonthlyStats(message, targetUser) {
    try {
      const monthStart = getMonthStart(new Date());
      const { data: stats } = await fetchActivityData({
        userId: targetUser.id,
        guildId: message.guild.id,
        period: 'monthly',
        startDate: monthStart
      });

      if (!stats) {
        await message.reply(`No activity recorded this month for ${targetUser ? targetUser.displayName || targetUser.user.username : 'you'}.`);
        return;
      }

      const response = this.formatStats(`${targetUser ? `${targetUser.displayName || targetUser.user.username}'s` : 'Your'} Monthly`, stats);
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

      const { data: topUsers } = await fetchActivityData({
        guildId: message.guild.id,
        period: 'daily',
        startDate: today
      });

      if (!topUsers || !topUsers.length) {
        await message.reply('No activity recorded today.');
        return;
      }

      const members = await message.guild.members.fetch();

      const leaderboardLines = topUsers.map((user, index) => {
        const member = members.get(user.userId);
        const displayName = member ? (member.displayName || member.user.username) : user.userId;

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
      const now = new Date();
      const startDate = period === 'daily' ? now : period === 'weekly' ? getWeekStart(now) : getMonthStart(now);
      
      const members = role.members;
      const activityData = await Promise.all(
        Array.from(members.values()).map(async (member) => {
          const { data: stats } = await fetchActivityData({
            userId: member.id,
            guildId: source.guild.id,
            period,
            startDate
          });
          
          return {
            member,
            stats
          };
        })
      );

      const veryInactiveMembers = activityData.filter(data => data.stats !== null).map(data => {
        const { member, stats } = data;
        const voiceTime = stats.voiceTimeSeconds;
        const topAvgVoiceTime = activityData.reduce((sum, data) => sum + data.stats.voiceTimeSeconds, 0) / activityData.length;
        const minimumThreshold = topAvgVoiceTime * 0.05; // 5% threshold
        const percentage = ((voiceTime / topAvgVoiceTime) * 100).toFixed(1);

        return {
          member,
          voiceTime,
          percentage,
          displayName: member.displayName || member.user.username
        };
      }).filter(data => data.voiceTime < minimumThreshold);

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
        ...veryInactiveMembers.map(({ displayName, voiceTime, percentage }) =>
          `${displayName}: ${formatDuration(voiceTime)} (${percentage}%)`
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
    const mutedTime = stats.mutedTimeSeconds ? formatDuration(stats.mutedTimeSeconds) : '0m';

    // Calculate total active time (excluding AFK time)
    const activeTimeSeconds = stats.voiceTimeSeconds - stats.afkTimeSeconds;
    const totalTimeSeconds = stats.voiceTimeSeconds;

    // Calculate percentages based on total time
    let activePercentage = 0;
    let afkPercentage = 0;

    if (totalTimeSeconds > 0) {
        activePercentage = Math.round((activeTimeSeconds / totalTimeSeconds) * 100);
        afkPercentage = Math.round((stats.afkTimeSeconds / totalTimeSeconds) * 100);
    }

    // Ensure percentages are valid numbers
    activePercentage = isNaN(activePercentage) ? 0 : activePercentage;
    afkPercentage = isNaN(afkPercentage) ? 0 : afkPercentage;

    return [
        `**${period} Activity Stats:**`,
        ' ',
        '**Voice Activity:**',
        `🎤 Active Voice: ${voiceTime}`,
        `💤 AFK: ${afkTime}`,
        `🔇 Muted: ${mutedTime}`,
        ' ',
        '**Chat Activity:**',
        `💬 Messages: ${stats.messageCount}`,
        ' ',
        '**Active Time Distribution:**',
        `🟩 Active: ${activePercentage}%`,
        `⬜ AFK: ${afkPercentage}%`
    ].filter(Boolean).join('\n');
  }

  async handleInteraction(interaction) {
    if (!interaction.isCommand()) return;

    const command = this.commands.get(interaction.commandName);
    if (!command) return;

    try {
      // Check permissions
      if (command.permissions?.length > 0) {
        const missingPerms = command.permissions.filter(perm => !interaction.member.permissions.has(perm));
        if (missingPerms.length > 0) {
          return interaction.reply({
            content: `You need the following permissions: ${missingPerms.join(', ')}`,
            ephemeral: true
          });
        }
      }

      // Check cooldown
      if (!this.checkCooldown(interaction, command)) return;

      // List of commands that don't require full configuration
      const setupCommands = [
        'settings',
        'setprefix',
        'setguildid',
        'setguildname',
        'setrole',
        'setverifiedrole',
        'competitors',
        'help',
        'ping',
        'setup',
        'refreshcommands',
        'setupcreateroles'
      ];

      // Skip configuration check for setup commands
      if (!setupCommands.includes(interaction.commandName)) {
        const { validateGuildConfiguration } = require('../utils/validators');
        const { isConfigured, missingFields } = await validateGuildConfiguration(interaction.guildId);

        if (!isConfigured) {
          const embed = new EmbedBuilder()
            .setTitle('⚠️ Missing Configuration')
            .setDescription('This command requires all guild settings to be configured first.')
            .addFields({
              name: 'Missing Settings',
              value: missingFields.map(field => `• ${field}`).join('\n')
            })
            .addFields({
              name: 'How to Fix',
              value: 'Use `/settings` to view current settings and configure missing fields. Use `/setup` to configure all settings.'
            })
            .setColor(Colors.Yellow)
            .setTimestamp();

          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }

      // Execute command with handler instance
      await command.execute(interaction, [], this);
    } catch (error) {
      console.error('Interaction error:', error);
      const reply = { content: 'There was an error executing this command!', ephemeral: true };
      
      if (interaction.deferred) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply(reply);
      }
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

  clearPrefixCache(guildId) {
    this.prefixCache.delete(guildId);
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
      await prisma.guildSettings.upsert({
        where: { 
          guildId: source.guildId 
        },
        update: { 
          commandPrefix: newPrefix,
          guildName: source.guild.name
        },
        create: {
          guildId: source.guildId,
          commandPrefix: newPrefix,
          guildName: source.guild.name
        }
      });

      // Clear and update cache
      this.clearPrefixCache(source.guildId);
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

        switch (roleIndex) {
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

      switch (mainRole.index) {
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
        if (players.length === 0) return null;
        if (roleParam && roleMap[roleParam] !== roleIndex) return null;

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

  async handleSetRole(source, type, role) {
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
      const roleMap = {
        'tank': 'tankRoleId',
        'support': 'supportRoleId',
        'healer': 'healerRoleId',
        'melee': 'dpsMeleeRoleId',
        'ranged': 'dpsRangedRoleId',
        'mount': 'battlemountRoleId'
      };

      const fieldToUpdate = roleMap[type];
      if (!fieldToUpdate) {
        const response = 'Tipo de role inválido.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      await prisma.guildSettings.update({
        where: {
          guildId: source.guildId
        },
        data: {
          [fieldToUpdate]: role.id
        }
      });

      const response = `Cargo ${role.name} definido como ${type}.`;
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    } catch (error) {
      console.error('Error setting role:', error);
      const response = 'Erro ao definir cargo.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    }
  }

  async handleUpdateMembersRole(source, membersRole) {
    // Check admin permissions
    if (!source.member.permissions.has('ADMINISTRATOR')) {
      const response = 'Você precisa ter permissões de administrador para usar este comando.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
      return;
    }

    try {
      // Get guild settings
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: source.guildId }
      });

      // Check if guild has Albion guild ID configured
      if (!settings?.albionGuildId) {
        const response = 'ID da guild do Albion não configurado. Use /settings setguildid primeiro.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      // Check if verified role is configured
      if (!settings?.nicknameVerifiedId) {
        const response = 'Cargo verificado não configurado. Use /settings setverifiedrole primeiro.';
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      // Check if all role IDs are configured
      const roleIds = {
        'Tank': settings.tankRoleId,
        'Support': settings.supportRoleId,
        'Healer': settings.healerRoleId,
        'DPS Melee': settings.dpsMeleeRoleId,
        'DPS Ranged': settings.dpsRangedRoleId,
        'Battlemount': settings.battlemountRoleId
      };

      const missingRoles = Object.entries(roleIds)
        .filter(([_, id]) => !id)
        .map(([role]) => role);

      if (missingRoles.length > 0) {
        const response = `As seguintes roles precisam ser configuradas primeiro usando /settings setrole:\n${missingRoles.join(', ')}`;
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      // Initial response
      const initialResponse = 'Atualizando roles dos membros verificados...';
      if (source.commandName) {
        await source.reply({ content: initialResponse, ephemeral: true });
      } else {
        await source.reply(initialResponse);
      }

      // Fetch guild stats from Albion API
      const guildStats = await fetchGuildStats(settings.albionGuildId);
      if (!guildStats || !guildStats.length) {
        const response = 'Não foi possível obter dados da guild.';
        if (source.commandName) {
          await source.editReply(response);
        } else {
          await source.channel.send(response);
        }
        return;
      }

      // Get all members with the specified role
      const members = membersRole.members;

      let updated = 0;
      let notFound = 0;
      let notVerified = 0;
      const notFoundMembers = [];
      const notVerifiedMembers = [];

      // Process each member
      for (const [memberId, member] of members) {
        // Check if member has verified role
        if (!member.roles.cache.has(settings.nicknameVerifiedId)) {
          notVerified++;
          notVerifiedMembers.push(member.displayName || member.user.username);
          continue;
        }

        // Get player registration
        const registration = await prisma.playerRegistration.findFirst({
          where: {
            userId: memberId
          }
        });

        if (!registration) {
          notVerified++;
          notVerifiedMembers.push(member.displayName || member.user.username);
          continue;
        }

        // Find player in guild stats
        const player = guildStats.find(p =>
          p.name.toLowerCase() === registration.playerName.toLowerCase()
        );

        if (player) {
          const mainRole = getMainRole(player.roles);
          const roleId = roleIds[mainRole.name];
          const role = await source.guild.roles.fetch(roleId);

          if (role) {
            // Remove all class roles first
            const allClassRoles = Object.values(roleIds).filter(id => id);
            for (const classRoleId of allClassRoles) {
              if (member.roles.cache.has(classRoleId)) {
                await member.roles.remove(classRoleId);
              }
            }

            // Add the new role
            if (!member.roles.cache.has(roleId)) {
              await member.roles.add(role);
              updated++;
            }
          }
        } else {
          notFound++;
          notFoundMembers.push(registration.playerName);
        }
      }

      // Final response
      const finalResponse = [
        `✅ Atualização completa!`,
        `📊 Resultados:`,
        `- ${updated} membros atualizados`,
        `- ${notVerified} membros não verificados`,
        `- ${notFound} membros não encontrados na guild`,
        notVerifiedMembers.length > 0 ? `\nMembros não verificados:\n${notVerifiedMembers.join(', ')}` : '',
        notFoundMembers.length > 0 ? `\nMembros não encontrados na guild:\n${notFoundMembers.join(', ')}` : ''
      ].filter(Boolean).join('\n');

      if (source.commandName) {
        await source.editReply(finalResponse);
      } else {
        await source.channel.send(finalResponse);
      }

    } catch (error) {
      console.error('Error updating member roles:', error);
      const response = 'Erro ao atualizar roles dos membros.';
      if (source.commandName) {
        if (source.replied) {
          await source.editReply(response);
        } else {
          await source.reply({ content: response, ephemeral: true });
        }
      } else {
        await source.channel.send(response);
      }
    }
  }

  async handleSetVerifiedRole(source, role) {
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
          nicknameVerifiedId: role.id
        }
      });

      const response = `Cargo ${role.name} definido como cargo de nickname verificado.`;
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    } catch (error) {
      console.error('Error setting verified role:', error);
      const response = 'Erro ao definir cargo de nickname verificado.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    }
  }

  async handleRegister(source, region, nickname) {
    try {
      // Initial response
      const initialResponse = 'Procurando jogador...';
      if (source.commandName) {
        await source.reply({ content: initialResponse, ephemeral: true });
      } else {
        await source.reply(initialResponse);
      }

      // Select API endpoint based on region
      const apiEndpoint = {
        'america': 'https://murderledger.albiononline2d.com',
        'europe': 'https://murderledger-europe.albiononline2d.com',
        'asia': 'https://murderledger-asia.albiononline2d.com'
      }[region];

      // Search for player
      const searchResponse = await axios.get(
        `${apiEndpoint}/api/player-search/${encodeURIComponent(nickname)}`
      );

      const { results } = searchResponse.data;

      if (!results || results.length === 0) {
        const response = '❌ Jogador não encontrado.';
        if (source.commandName) {
          await source.editReply(response);
        } else {
          await source.channel.send(response);
        }
        return;
      }

      // If we have multiple results, show them
      if (results.length > 1) {
        const response = [
          '❌ Encontrei vários jogadores:',
          results.map(name => `- ${name}`).join('\n'),
          'Use o nome exato do personagem.'
        ].join('\n');

        if (source.commandName) {
          await source.editReply(response);
        } else {
          await source.channel.send(response);
        }
        return;
      }

      // If we have exactly one result, register the player
      const playerName = results[0];

      // Get guild settings first to check for verified role
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: source.guildId }
      });

      if (!settings?.nicknameVerifiedId) {
        const response = '⚠️ Cargo verificado não configurado. Peça para um administrador configurar.';
        if (source.member.permissions.has('ADMINISTRATOR')) {
          response += '\nUse `/settings setverifiedrole` para configurar.';
        }

        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      // Check if player is already registered
      const existingRegistration = await prisma.playerRegistration.findFirst({
        where: {
          playerName: playerName // Using playerName as unique now
        }
      });

      if (existingRegistration && existingRegistration.userId !== source.member.id) {
        const response = `❌ "${playerName}" já está registrado por outro usuário.`;
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      // Update or create registration
      if (existingRegistration) {
        await prisma.playerRegistration.update({
          where: {
            playerName: playerName
          },
          data: {
            region,
            guildId: source.guildId,
            albionGuildId: settings.albionGuildId
          }
        });
      } else {
        await prisma.playerRegistration.create({
          data: {
            userId: source.member.id,
            guildId: source.guildId,
            region,
            playerName,
            albionGuildId: settings.albionGuildId
          }
        });
      }

      // Add verified role
      let verifiedRole = null;  // Declare outside try/catch
      try {
        verifiedRole = await source.guild.roles.fetch(settings.nicknameVerifiedId);
        if (verifiedRole) {
          await source.member.roles.add(verifiedRole);
        }
      } catch (roleError) {
        console.error('Error adding verified role:', roleError);
      }

      const response = [
        `✅ ${playerName} registrado com sucesso!`,
        verifiedRole ? '🎭 Cargo verificado atribuído' : '⚠️ Erro ao atribuir cargo'
      ].join('\n');

      if (source.commandName) {
        await source.editReply(response);
      } else {
        await source.channel.send(response);
      }

    } catch (error) {
      console.error('Error registering player:', error);
      const response = '❌ Erro ao registrar jogador.';
      if (source.commandName) {
        if (source.replied) {
          await source.editReply(response);
        } else {
          await source.reply({ content: response, ephemeral: true });
        }
      } else {
        await source.channel.send(response);
      }
    }
  }

  async handleUnregister(source, playerName) {
    // Check if user has admin permissions
    if (!source.member.permissions.has('ADMINISTRATOR')) {
      const response = 'Você precisa ter permissões de administrador para usar este comando.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
      return;
    }

    try {
      // Find registration
      const registration = await prisma.playerRegistration.findUnique({
        where: {
          playerName: playerName
        }
      });

      if (!registration) {
        const response = `❌ Jogador "${playerName}" não está registrado.`;
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      // Get guild settings to check for verified role
      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: source.guildId }
      });

      // Try to remove verified role if configured
      if (settings?.nicknameVerifiedId) {
        try {
          const member = await source.guild.members.fetch(registration.userId);
          if (member) {
            await member.roles.remove(settings.nicknameVerifiedId);
          }
        } catch (roleError) {
          console.error('Error removing verified role:', roleError);
        }
      }

      // Delete registration
      await prisma.playerRegistration.delete({
        where: {
          playerName: playerName
        }
      });

      const response = [
        `✅ Registro removido com sucesso!`,
        `📝 Detalhes:`,
        `- Jogador: ${playerName}`,
        `- Discord ID: ${registration.userId}`,
        settings?.nicknameVerifiedId ? '- Cargo verificado removido' : ''
      ].filter(Boolean).join('\n');

      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }

    } catch (error) {
      console.error('Error unregistering player:', error);
      const response = '❌ Erro ao remover registro do jogador.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    }
  }

  async handleCheckRegistrations(source, role) {
    // Check admin permissions
    if (!source.member.permissions.has('ADMINISTRATOR')) {
      const response = 'Você precisa ter permissões de administrador para usar este comando.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
      return;
    }

    try {
      // Get all members with the specified role
      const members = role.members;

      // Get all registrations for these members
      const registeredUsers = await prisma.playerRegistration.findMany({
        where: {
          userId: {
            in: [...members.keys()]
          }
        }
      });

      // Find unregistered members
      const registeredUserIds = new Set(registeredUsers.map(reg => reg.userId));
      const unregisteredMembers = [...members.values()].filter(
        member => !registeredUserIds.has(member.id)
      );

      if (unregisteredMembers.length === 0) {
        const response = `✅ Todos os membros do cargo ${role.name} estão registrados!`;
        if (source.commandName) {
          await source.reply({ content: response, ephemeral: true });
        } else {
          await source.reply(response);
        }
        return;
      }

      // Create mention list and message
      const memberList = unregisteredMembers.map(member => member.displayName || member.user.username).join('\n');
      const response = [
        `⚠️ **Membros não registrados no cargo ${role.name}:**`,
        memberList,
        '',
        '📝 Use o comando `/register` para registrar seu personagem do Albion.',
        'Exemplo: `/register region:america nickname:SeuNick`'
      ].join('\n');

      if (source.commandName) {
        await source.reply({ content: response });
      } else {
        await source.channel.send(response);
      }

    } catch (error) {
      console.error('Error checking registrations:', error);
      const response = '❌ Erro ao verificar registros.';
      if (source.commandName) {
        await source.reply({ content: response, ephemeral: true });
      } else {
        await source.reply(response);
      }
    }
  }
}

module.exports = CommandHandler;