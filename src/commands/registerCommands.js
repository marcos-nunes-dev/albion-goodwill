const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const prisma = require('../config/prisma');

const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Check your activity stats ')
    .addSubcommand(subcommand =>
      subcommand
        .setName('daily')
        .setDescription('Check your daily activity stats')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to check stats for (optional)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('weekly')
        .setDescription('Check your weekly activity stats')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to check stats for (optional)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('monthly')
        .setDescription('Check your monthly activity stats')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to check stats for (optional)')
            .setRequired(false))),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show server activity leaderboard'),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Verificar latência do bot'),
  new SlashCommandBuilder()
    .setName('rolecheck')
    .setDescription('Verificar atividade dos membros de um cargo')
    .addRoleOption(option => 
      option
        .setName('role')
        .setDescription('Cargo para verificar')
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName('period')
        .setDescription('Período para verificar')
        .addChoices(
          { name: 'Hoje', value: 'daily' },
          { name: 'Semanal', value: 'weekly' }
        )
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configurar bot')
    .setDefaultMemberPermissions('0')
    .addSubcommand(subcommand =>
      subcommand
        .setName('setguildid')
        .setDescription('Definir ID da guild do Albion')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('ID da guild do Albion')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('setprefix')
        .setDescription('Definir prefixo dos comandos')
        .addStringOption(option =>
          option
            .setName('prefix')
            .setDescription('Novo prefixo para comandos (ex: !ag)')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('setguildname')
        .setDescription('Definir nome da guild')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Nome da guild no Albion')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('setrole')
        .setDescription('Definir cargo para uma role do Albion')
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Tipo de role')
            .setRequired(true)
            .addChoices(
              { name: 'Tank', value: 'tank' },
              { name: 'Support', value: 'support' },
              { name: 'Healer', value: 'healer' },
              { name: 'DPS Melee', value: 'melee' },
              { name: 'DPS Ranged', value: 'ranged' },
              { name: 'Battlemount', value: 'mount' }
            ))
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Cargo do Discord')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('setverifiedrole')
        .setDescription('Definir cargo para membros com nickname verificado')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Cargo para membros verificados')
            .setRequired(true))),
  new SlashCommandBuilder()
    .setName('competitors')
    .setDescription('Gerenciar guilds competidoras')
    .setDefaultMemberPermissions('0')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Adicionar guild competidora')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('ID da guild competidora do Albion')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remover guild competidora')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('ID da guild competidora do Albion')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Listar todas as guilds competidoras')),
  new SlashCommandBuilder()
    .setName('playermmr')
    .setDescription('Verificar MMR do jogador')
    .addStringOption(option =>
      option
        .setName('player')
        .setDescription('Nome do jogador')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Recarregar comandos slash (apenas admin)')
    .setDefaultMemberPermissions('0'),
  new SlashCommandBuilder()
    .setName('mmrrank')
    .setDescription('Mostrar ranking MMR por role da guild')
    .addStringOption(option =>
      option
        .setName('role')
        .setDescription('Role específica para ver ranking completo')
        .addChoices(
          { name: 'Tank', value: 'tank' },
          { name: 'Support', value: 'support' },
          { name: 'Healer', value: 'healer' },
          { name: 'DPS Melee', value: 'melee' },
          { name: 'DPS Ranged', value: 'ranged' },
          { name: 'Battlemount', value: 'mount' }
        )
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('updatemembersrole')
    .setDescription('Atualizar roles dos membros baseado na main class')
    .setDefaultMemberPermissions('0') // Admin only
    .addRoleOption(option =>
        option
            .setName('members')
            .setDescription('Cargo dos membros para atualizar')
            .setRequired(true)),
  new SlashCommandBuilder()
    .setName('register')
    .setDescription('Registrar seu personagem do Albion')
    .addStringOption(option =>
        option
            .setName('region')
            .setDescription('Região do servidor')
            .setRequired(true)
            .addChoices(
                { name: 'América', value: 'america' },
                { name: 'Europa', value: 'europe' },
                { name: 'Ásia', value: 'asia' }
            ))
    .addStringOption(option =>
        option
            .setName('nickname')
            .setDescription('Seu nickname no Albion Online')
            .setRequired(true)),
  new SlashCommandBuilder()
    .setName('unregister')
    .setDescription('Remover registro de um jogador')
    .setDefaultMemberPermissions('0') // Admin only
    .addStringOption(option =>
        option
            .setName('playername')
            .setDescription('Nome do jogador no Albion')
            .setRequired(true)),
  new SlashCommandBuilder()
    .setName('checkregistrations')
    .setDescription('Verificar membros não registrados em um cargo')
    .setDefaultMemberPermissions('0') // Admin only
    .addRoleOption(option =>
        option
            .setName('role')
            .setDescription('Cargo para verificar registros')
            .setRequired(true)),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Mostrar lista de comandos disponíveis'),
  {
    ...new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Configuração inicial completa do bot')
      .setDefaultMemberPermissions('0') // Admin only
      .addStringOption(option =>
        option
          .setName('guildname')
          .setDescription('Nome da guild no Albion')
          .setRequired(true))
      .addStringOption(option =>
        option
          .setName('commandprefix')
          .setDescription('Prefixo para comandos (ex: !ag)')
          .setRequired(true))
      .addStringOption(option =>
        option
          .setName('albionguildid')
          .setDescription('ID da guild do Albion')
          .setRequired(true))
      .addStringOption(option =>
        option
          .setName('competitorsids')
          .setDescription('IDs das guilds competidoras (separados por vírgula)')
          .setRequired(true))
      .addRoleOption(option =>
        option
          .setName('battlemountrole')
          .setDescription('Cargo para Battlemount')
          .setRequired(true))
      .addRoleOption(option =>
        option
          .setName('meleerole')
          .setDescription('Cargo para DPS Melee')
          .setRequired(true))
      .addRoleOption(option =>
        option
          .setName('rangedrole')
          .setDescription('Cargo para DPS Ranged')
          .setRequired(true))
      .addRoleOption(option =>
        option
          .setName('healerrole')
          .setDescription('Cargo para Healer')
          .setRequired(true))
      .addRoleOption(option =>
        option
          .setName('supportrole')
          .setDescription('Cargo para Support')
          .setRequired(true))
      .addRoleOption(option =>
        option
          .setName('tankrole')
          .setDescription('Cargo para Tank')
          .setRequired(true))
      .addRoleOption(option =>
        option
          .setName('verifiedrole')
          .setDescription('Cargo para membros com nickname verificado')
          .setRequired(true))
      .toJSON(),
    async execute(interaction, handler) {
      try {
        const guildName = interaction.options.getString('guildname');
        const commandPrefix = interaction.options.getString('commandprefix');
        const albionGuildId = interaction.options.getString('albionguildid');
        const competitorsIds = interaction.options.getString('competitorsids').split(',').map(id => id.trim());
        
        // Get all the role options
        const battlemountRole = interaction.options.getRole('battlemountrole');
        const meleeRole = interaction.options.getRole('meleerole');
        const rangedRole = interaction.options.getRole('rangedrole');
        const healerRole = interaction.options.getRole('healerrole');
        const supportRole = interaction.options.getRole('supportrole');
        const tankRole = interaction.options.getRole('tankrole');
        const verifiedRole = interaction.options.getRole('verifiedrole');

        // Update guild settings
        await prisma.guildSettings.upsert({
          where: { guildId: interaction.guildId },
          update: {
            guildName,
            commandPrefix,
            albionGuildId,
            competitorIds: competitorsIds,
            battlemountRoleId: battlemountRole.id,
            dpsMeleeRoleId: meleeRole.id,
            dpsRangedRoleId: rangedRole.id,
            healerRoleId: healerRole.id,
            supportRoleId: supportRole.id,
            tankRoleId: tankRole.id,
            nicknameVerifiedId: verifiedRole.id
          },
          create: {
            guildId: interaction.guildId,
            guildName,
            commandPrefix,
            albionGuildId,
            competitorIds: competitorsIds,
            battlemountRoleId: battlemountRole.id,
            dpsMeleeRoleId: meleeRole.id,
            dpsRangedRoleId: rangedRole.id,
            healerRoleId: healerRole.id,
            supportRoleId: supportRole.id,
            tankRoleId: tankRole.id,
            nicknameVerifiedId: verifiedRole.id
          }
        });

        await interaction.editReply({
          content: '✅ Configuração concluída com sucesso!',
          ephemeral: true
        });
      } catch (error) {
        console.error('Setup error:', error);
        await interaction.editReply({
          content: '❌ Erro ao realizar configuração: ' + error.message,
          ephemeral: true
        });
      }
    }
  }
];

async function registerCommands(client) {
  try {
    console.log('Started refreshing application (/) commands.');

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

module.exports = { registerCommands, commands }; 