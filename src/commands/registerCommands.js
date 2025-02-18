const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { commandMetadata } = require('../config/commandMetadata');

const DISCORD_OPTION_TYPES = {
    STRING: 3,
    INTEGER: 4,
    BOOLEAN: 5,
    USER: 6,
    CHANNEL: 7,
    ROLE: 8,
    MENTIONABLE: 9,
    NUMBER: 10
};

function buildCommandData(name, metadata) {
    const data = {
        name,
        description: metadata.description,
        defaultPermission: !metadata.permissions,
        options: []
    };

    if (metadata.subcommands) {
        data.options = Object.entries(metadata.subcommands).map(([subName, subMeta]) => ({
            type: 1, // SUB_COMMAND
            name: subName,
            description: subMeta.description,
            options: buildOptionsArray(subMeta.options)
        }));
    } else if (metadata.options) {
        data.options = buildOptionsArray(metadata.options);
    }

    return data;
}

function buildOptionsArray(options) {
    if (!options) return [];

    return Object.entries(options).map(([name, option]) => ({
        type: DISCORD_OPTION_TYPES[option.type] || DISCORD_OPTION_TYPES.STRING,
        name,
        description: option.description,
        required: option.required ?? false,
        choices: option.choices,
        channelTypes: option.channelTypes,
        minValue: option.minValue,
        maxValue: option.maxValue,
        autocomplete: option.autocomplete
    }));
}

async function registerCommands(client) {
    try {
        console.log('Started refreshing application (/) commands.');

        const commands = Object.entries(commandMetadata)
            .filter(([_, metadata]) => metadata.slashCommand)
            .map(([name, metadata]) => buildCommandData(name, metadata));

        const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

        // Register commands globally
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        // Register guild-specific commands if needed
        if (process.env.DEVELOPMENT_GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, process.env.DEVELOPMENT_GUILD_ID),
                { body: commands }
            );
        }

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error refreshing commands:', error);
        throw error; // Re-throw to handle in the calling code
    }
}

function validateCommandMetadata() {
    const errors = [];

    for (const [commandName, metadata] of Object.entries(commandMetadata)) {
        // Validate basic properties
        if (!metadata.category) {
            errors.push(`Command "${commandName}" is missing category`);
        }
        if (!metadata.description) {
            errors.push(`Command "${commandName}" is missing description`);
        }
        if (!metadata.usage) {
            errors.push(`Command "${commandName}" is missing usage information`);
        }

        // Validate subcommands
        if (metadata.subcommands) {
            for (const [subName, subMeta] of Object.entries(metadata.subcommands)) {
                if (!subMeta.description) {
                    errors.push(`Subcommand "${commandName} ${subName}" is missing description`);
                }
                if (subMeta.options) {
                    validateOptions(`${commandName} ${subName}`, subMeta.options, errors);
                }
            }
        }

        // Validate options
        if (metadata.options) {
            validateOptions(commandName, metadata.options, errors);
        }
    }

    if (errors.length > 0) {
        console.error('Command metadata validation failed:');
        errors.forEach(error => console.error(`- ${error}`));
        throw new Error('Invalid command metadata');
    }
}

function validateOptions(commandPath, options, errors) {
    for (const [optionName, option] of Object.entries(options)) {
        if (!option.type) {
            errors.push(`Option "${optionName}" in "${commandPath}" is missing type`);
        }
        if (!option.description) {
            errors.push(`Option "${optionName}" in "${commandPath}" is missing description`);
        }
        if (option.type && !DISCORD_OPTION_TYPES[option.type]) {
            errors.push(`Option "${optionName}" in "${commandPath}" has invalid type: ${option.type}`);
        }
        if (option.choices && !Array.isArray(option.choices)) {
            errors.push(`Option "${optionName}" in "${commandPath}" has invalid choices format`);
        }
    }
}

module.exports = {
    registerCommands,
    validateCommandMetadata
}; 