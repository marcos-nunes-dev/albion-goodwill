const Command = require('../../structures/Command');
const { EmbedBuilder, Colors } = require('discord.js');

module.exports = new Command({
    name: 'help',
    description: 'Shows all commands or info about a specific command',
    category: 'info',
    usage: '[command]',
    cooldown: 5,
    async execute(source, args, handler) {
        try {
            const isInteraction = source.commandName !== undefined;
            const commandName = isInteraction ? 
                source.options?.getString('command') : 
                args[0]?.toLowerCase();

            // If a specific command is requested
            if (commandName) {
                const command = handler.commands.get(commandName) || 
                              handler.commands.find(cmd => cmd.aliases?.includes(commandName));

                if (!command) {
                    return source.reply({ 
                        content: 'That command does not exist.', 
                        ephemeral: true 
                    });
                }

                const commandEmbed = new EmbedBuilder()
                    .setTitle(`Command: ${command.name}`)
                    .setDescription(command.description || 'No description available')
                    .addFields([
                        command.usage && {
                            name: 'Usage',
                            value: `\`/${command.name} ${command.usage}\``,
                            inline: true
                        },
                        command.aliases?.length > 0 && {
                            name: 'Aliases',
                            value: command.aliases.map(a => `\`${a}\``).join(', '),
                            inline: true
                        },
                        command.permissions?.length > 0 && {
                            name: 'Required Permissions',
                            value: command.permissions.join(', '),
                            inline: true
                        }
                    ].filter(Boolean))
                    .setColor(Colors.Blue)
                    .setTimestamp();

                return source.reply({ 
                    embeds: [commandEmbed],
                    ephemeral: true 
                });
            }

            // Create the help embed
            const helpEmbed = new EmbedBuilder()
                .setTitle('📚 Available Commands')
                .setDescription('Use `/help <command>` for more details about a specific command.');

            // Sort commands
            const commands = Array.from(handler.commands.values())
                .sort((a, b) => a.name.localeCompare(b.name));

            // Split commands into smaller groups (6 commands per field)
            const COMMANDS_PER_FIELD = 6;
            for (let i = 0; i < commands.length; i += COMMANDS_PER_FIELD) {
                const groupCommands = commands.slice(i, i + COMMANDS_PER_FIELD);
                const commandList = groupCommands.map(cmd => {
                    const isAdmin = cmd.permissions?.includes('Administrator');
                    return `• \`/${cmd.name}\`${isAdmin ? ' (Admin)' : ''} - ${cmd.description}`;
                }).join('\n');

                helpEmbed.addFields({
                    name: '\u200b',
                    value: commandList
                });
            }

            helpEmbed
                .setColor(Colors.Blue)
                .setFooter({
                    text: `${handler.commands.size} commands available • (Admin) requires Administrator permission`
                });

            return source.reply({ 
                embeds: [helpEmbed],
                ephemeral: true 
            });

        } catch (error) {
            console.error('Error in help command:', error);
            return source.reply({ 
                content: 'There was an error showing the help menu!',
                ephemeral: true
            });
        }
    }
}); 