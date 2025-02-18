const prisma = require('../config/prisma');
const { 
    ActivityCommands, 
    AdminCommands,
    CompetitorCommands,
    MMRCommands,
    RegistrationCommands,
    UtilityCommands 
} = require('./commands');
const { DEFAULT_PREFIX } = require('../config/constants');
const { commandMetadata } = require('../config/commandMetadata');

class CommandHandler {
    constructor() {
        this.prefix = DEFAULT_PREFIX;
        this.prefixCache = new Map();
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

    getCommandHandler(commandName) {
        const metadata = commandMetadata[commandName];
        if (!metadata) return null;

        switch (metadata.category) {
            case 'utility':
                return UtilityCommands;
            case 'activity':
                return ActivityCommands;
            case 'admin':
                return AdminCommands;
            case 'competitor':
                return CompetitorCommands;
            case 'mmr':
                return MMRCommands;
            case 'registration':
                return RegistrationCommands;
            default:
                return null;
        }
    }

    async handleCommand(message) {
        const guildPrefix = await this.getGuildPrefix(message.guild.id);
        if (!message.content.startsWith(guildPrefix)) return;

        const args = message.content.slice(guildPrefix.length).trim().split(/ +/);
        let command = args.shift()?.toLowerCase();
        
        // Check for command aliases
        command = UtilityCommands.resolveAlias(command);

        try {
            const handler = this.getCommandHandler(command);
            if (!handler) {
                await message.reply('Comando não encontrado. Use /help para ver a lista de comandos.');
                return;
            }

            const methodName = `handle${command.charAt(0).toUpperCase() + command.slice(1)}`;
            if (typeof handler[methodName] !== 'function') {
                await message.reply('Comando não implementado.');
                return;
            }

            await handler[methodName](message, ...args);
        } catch (error) {
            console.error('Command error:', error);
            await message.reply('Ocorreu um erro ao executar este comando!');
        }
    }

    async handleInteraction(interaction) {
        if (!interaction.isChatInputCommand()) return;

        try {
            const { commandName, options } = interaction;
            const handler = this.getCommandHandler(commandName);

            if (!handler) {
                await interaction.reply({
                    content: 'Comando não encontrado.',
                    ephemeral: true
                });
                return;
            }

            const metadata = commandMetadata[commandName];
            if (metadata.subcommands && options.getSubcommand(false)) {
                const subcommand = options.getSubcommand();
                const methodName = `handle${commandName.charAt(0).toUpperCase() + commandName.slice(1)}${subcommand.charAt(0).toUpperCase() + subcommand.slice(1)}`;
                if (typeof handler[methodName] !== 'function') {
                    await interaction.reply({
                        content: 'Subcomando não implementado.',
                        ephemeral: true
                    });
                    return;
                }
                await handler[methodName](interaction, ...this.getOptionsFromMetadata(options, metadata.subcommands[subcommand].options));
            } else {
                const methodName = `handle${commandName.charAt(0).toUpperCase() + commandName.slice(1)}`;
                if (typeof handler[methodName] !== 'function') {
                    await interaction.reply({
                        content: 'Comando não implementado.',
                        ephemeral: true
                    });
                    return;
                }
                await handler[methodName](interaction, ...this.getOptionsFromMetadata(options, metadata.options));
            }
        } catch (error) {
            console.error('Interaction error:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: 'Ocorreu um erro ao executar este comando!',
                    ephemeral: true
                });
            }
        }
    }

    getOptionsFromMetadata(options, metadata) {
        if (!metadata) return [];
        return Object.entries(metadata)
            .map(([name, option]) => {
                switch (option.type) {
                    case 'USER':
                        return options.getUser(name);
                    case 'ROLE':
                        return options.getRole(name);
                    case 'CHANNEL':
                        return options.getChannel(name);
                    case 'STRING':
                        return options.getString(name);
                    case 'INTEGER':
                        return options.getInteger(name);
                    case 'BOOLEAN':
                        return options.getBoolean(name);
                    case 'NUMBER':
                        return options.getNumber(name);
                    default:
                        return options.getString(name);
                }
            });
    }
}

module.exports = CommandHandler; 