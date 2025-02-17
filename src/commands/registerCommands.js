const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Check your activity stats')
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