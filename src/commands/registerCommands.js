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
    .setDescription('Show server activity leaderboard')
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