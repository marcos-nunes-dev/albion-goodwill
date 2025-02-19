const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const prisma = require('../config/prisma');

const commands = [
    // Info Commands
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Display help information about commands'),

    // Admin Commands
    new SlashCommandBuilder()
        .setName('presencecheck')
        .setDescription('Check presence activity of members with a specific role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to check')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('period')
                .setDescription('Time period to check (daily, weekly, monthly)')
                .setRequired(false)
                .addChoices(
                    { name: 'Daily', value: 'daily' },
                    { name: 'Weekly', value: 'weekly' },
                    { name: 'Monthly', value: 'monthly' }
                )
        ),
    new SlashCommandBuilder()
        .setName('competitors')
        .setDescription('Manage competitor settings'),
    new SlashCommandBuilder()
        .setName('checkregistrations')
        .setDescription('Check unregistered members in a role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to check registrations from')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('updatemembersrole')
        .setDescription('Update roles of members based on their main class in Albion Online')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to update members from')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('setprefix')
        .setDescription('Set the bot command prefix')
        .addStringOption(option =>
            option.setName('prefix')
                .setDescription('The new prefix')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('settings')
        .setDescription('View or modify bot settings'),
    new SlashCommandBuilder()
        .setName('setverifiedrole')
        .setDescription('Set the verified role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to set as verified')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('setrole')
        .setDescription('Set a role configuration')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to configure')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('setguildname')
        .setDescription('Set the Albion guild name')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('The guild name')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('setguildid')
        .setDescription('Set the Albion guild ID')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The guild ID')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('unregister')
        .setDescription('Unregister a member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to unregister')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('refreshcommands')
        .setDescription('Refresh and re-register all slash commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Albion Commands
    new SlashCommandBuilder()
        .setName('canplay')
        .setDescription('Check if members can play together based on MMR')
        .addStringOption(option =>
            option.setName('player')
                .setDescription('Player name to check')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName('role')
                .setDescription('Role to check')
                .setRequired(true)
                .addChoices(
                    { name: 'Tank', value: 'tank' },
                    { name: 'Support', value: 'support' },
                    { name: 'Healer', value: 'healer' },
                    { name: 'Melee DPS', value: 'melee' },
                    { name: 'Ranged DPS', value: 'ranged' },
                    { name: 'Battlemount', value: 'mount' }
                )
        )
        .addBooleanOption(option =>
            option.setName('alltime')
                .setDescription('Check all-time stats instead of last 30 days')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('compare_to')
                .setDescription('Compare with specific players (comma-separated)')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    new SlashCommandBuilder()
        .setName('mmrrank')
        .setDescription('Display MMR rankings')
        .addStringOption(option =>
            option.setName('role')
                .setDescription('Filter by role')
                .setRequired(false)
                .addChoices(
                    { name: 'Tank', value: 'tank' },
                    { name: 'Support', value: 'support' },
                    { name: 'Healer', value: 'healer' },
                    { name: 'Melee DPS', value: 'melee' },
                    { name: 'Ranged DPS', value: 'ranged' },
                    { name: 'Battlemount', value: 'mount' }
                )
        ),
    new SlashCommandBuilder()
        .setName('playermmr')
        .setDescription('Check a player\'s MMR')
        .addStringOption(option =>
            option.setName('player')
                .setDescription('The player name to check')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register your Albion Online character')
        .addStringOption(option =>
            option.setName('region')
                .setDescription('Your region')
                .setRequired(true)
                .addChoices(
                    { name: 'America', value: 'america' },
                    { name: 'Europe', value: 'europe' },
                    { name: 'Asia', value: 'asia' }
                )
        )
        .addStringOption(option =>
            option.setName('character')
                .setDescription('Your Albion Online character name')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    // Stats Commands
    new SlashCommandBuilder()
        .setName('presenceleaderboard')
        .setDescription('Display presence leaderboard'),
    new SlashCommandBuilder()
        .setName('presenceweekly')
        .setDescription('Display weekly presence stats'),
    new SlashCommandBuilder()
        .setName('presencemonthly')
        .setDescription('Display monthly presence stats'),
    new SlashCommandBuilder()
        .setName('presencedaily')
        .setDescription('Display daily presence stats')
];

async function registerSlashCommands(client) {
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

module.exports = { registerSlashCommands, commands }; 