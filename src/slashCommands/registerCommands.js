const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const prisma = require('../config/prisma');

const commands = [
    // Info Commands
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Display help information about commands')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Get detailed info about a specific command')
                .setRequired(false)
        ),

    // Admin Commands
    new SlashCommandBuilder()
        .setName('setupcreateroles')
        .setDescription('Create and configure all required roles for the bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
                .setDescription('Time period to check')
                .setRequired(false)
                .addChoices(
                    { name: 'Daily', value: 'daily' },
                    { name: 'Weekly', value: 'weekly' },
                    { name: 'Monthly', value: 'monthly' }
                )
        )
        .addRoleOption(option =>
            option.setName('exclude')
                .setDescription('Role to exclude from the check (e.g., whitelist role)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('competitors')
        .setDescription('Manage competitors to compare your guild against it')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform (add/remove/list)')
                .setRequired(true)
                .addChoices(
                    { name: 'List competitors', value: 'list' },
                    { name: 'Add competitor', value: 'add' },
                    { name: 'Remove competitor', value: 'remove' }
                )
        )
        .addStringOption(option =>
            option.setName('guild_id')
                .setDescription('Competitor guild id (required for add/remove)')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('checkregistrations')
        .setDescription('Check unregistered members in a role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to check registrations for')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('updatemembersrole')
        .setDescription('Update roles of members based on their main class in Albion Online')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role containing members to update')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('setprefix')
        .setDescription('Set the bot command prefix')
        .addStringOption(option =>
            option.setName('prefix')
                .setDescription('The new command prefix (must start with: ! $ % & * # @ ? .)')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('settings')
        .setDescription('View current guild settings'),
    new SlashCommandBuilder()
        .setName('setverifiedrole')
        .setDescription('Set the role for verified Albion Online players')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The Discord role to assign to verified players')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('setrole')
        .setDescription('Set a role for a specific Albion Online class')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('The role type to set')
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
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The Discord role to assign')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('setguildname')
        .setDescription('Set the Albion guild name')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('The Albion guild name to set')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('setguildid')
        .setDescription('Set the Albion guild ID')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The Albion guild ID to set')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('unregister')
        .setDescription('Unregister a member from Albion Online verification')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The Discord user to unregister')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('refreshcommands')
        .setDescription('Refresh and re-register all slash commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setsyncnickname')
        .setDescription('Enable/disable automatic Albion nickname synchronization')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addBooleanOption(option =>
            option.setName('enabled')
                .setDescription('Enable or disable nickname sync')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('registerhim')
        .setDescription('Register an Albion Online character for another user (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The Discord user to register')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('region')
                .setDescription('Player region')
                .setRequired(true)
                .addChoices(
                    { name: 'America', value: 'america' },
                    { name: 'Europe', value: 'europe' },
                    { name: 'Asia', value: 'asia' }
                )
        )
        .addStringOption(option =>
            option.setName('character')
                .setDescription('Albion Online character name')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    new SlashCommandBuilder()
        .setName('battleregister')
        .setDescription('Register a battle against enemy guilds')
        .addStringOption(option =>
            option.setName('enemies')
                .setDescription('Enemy guild names (comma-separated)')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('victory')
                .setDescription('Was the battle a victory?')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('date')
                .setDescription('Which day was the battle?')
                .setRequired(true)
                .addChoices(
                    { name: 'Today', value: 'today' },
                    { name: 'Yesterday', value: 'yesterday' },
                    { name: '2 days ago', value: '2days' },
                    { name: '3 days ago', value: '3days' },
                    { name: 'Custom (YYYY-MM-DD)', value: 'custom' }
                )
        )
        .addStringOption(option =>
            option.setName('time')
                .setDescription('What time was the battle? (UTC)')
                .setRequired(true)
                .addChoices(
                    { name: '00:00 UTC', value: '00:00' },
                    { name: '01:00 UTC', value: '01:00' },
                    { name: '02:00 UTC', value: '02:00' },
                    { name: '03:00 UTC', value: '03:00' },
                    { name: '04:00 UTC', value: '04:00' },
                    { name: '05:00 UTC', value: '05:00' },
                    { name: '06:00 UTC', value: '06:00' },
                    { name: '07:00 UTC', value: '07:00' },
                    { name: '08:00 UTC', value: '08:00' },
                    { name: '09:00 UTC', value: '09:00' },
                    { name: '10:00 UTC', value: '10:00' },
                    { name: '11:00 UTC', value: '11:00' },
                    { name: '12:00 UTC', value: '12:00' },
                    { name: '13:00 UTC', value: '13:00' },
                    { name: '14:00 UTC', value: '14:00' },
                    { name: '15:00 UTC', value: '15:00' },
                    { name: '16:00 UTC', value: '16:00' },
                    { name: '17:00 UTC', value: '17:00' },
                    { name: '18:00 UTC', value: '18:00' },
                    { name: '19:00 UTC', value: '19:00' },
                    { name: '20:00 UTC', value: '20:00' },
                    { name: '21:00 UTC', value: '21:00' },
                    { name: '22:00 UTC', value: '22:00' },
                    { name: '23:00 UTC', value: '23:00' }
                )
        )
        .addIntegerOption(option =>
            option.setName('kills')
                .setDescription('Total number of kills in the battle')
                .setRequired(false)
                .setMinValue(0)
        )
        .addIntegerOption(option =>
            option.setName('deaths')
                .setDescription('Total number of deaths in the battle')
                .setRequired(false)
                .setMinValue(0)
        )
        .addStringOption(option =>
            option.setName('custom_date')
                .setDescription('If you selected Custom Date, enter the date (YYYY-MM-DD)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL to the battle report')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('updatebattles')
        .setDescription('Manually trigger battle updates for pending registrations')
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
        .setName('presencemonthly')
        .setDescription('Display monthly presence stats')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check (default: yourself)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('presenceweekly')
        .setDescription('Display weekly presence stats')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check stats for (defaults to you)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('presencedaily')
        .setDescription('Display daily presence stats')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check stats for (defaults to you)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure all guild settings at once')
        .addStringOption(option =>
            option.setName('guild_id')
                .setDescription('Your Albion guild ID')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('guild_name')
                .setDescription('Your Albion guild name')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('verified_role')
                .setDescription('Role for verified members')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('tank_role')
                .setDescription('Role for Tank players')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('healer_role')
                .setDescription('Role for Healer players')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('support_role')
                .setDescription('Role for Support players')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('melee_role')
                .setDescription('Role for Melee DPS players')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('ranged_role')
                .setDescription('Role for Ranged DPS players')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('mount_role')
                .setDescription('Role for Battlemount players')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('prefix')
                .setDescription('Custom command prefix (must start with: ! $ % & * # @ ? .)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('membersdiff')
        .setDescription('Compare members in a role with a list from a text file')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option =>
            option.setName('members_role')
                .setDescription('The role to check members against')
                .setRequired(true)
        )
        .addAttachmentOption(option =>
            option.setName('members_file')
                .setDescription('Text file containing member list')
                .setRequired(true)
        ),
];

async function registerSlashCommands(client) {
    try {
        if (!client || !client.user) {
            throw new Error('Client not properly initialized');
        }

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