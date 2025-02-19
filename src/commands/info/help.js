const Command = require('../../structures/Command');
const { Collection } = require('discord.js');

module.exports = new Command({
    name: 'help',
    description: 'Shows all commands or info about a specific command',
    category: 'info',
    usage: '[command]',
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            if (!args.length) {
                const guildPrefix = await handler.getGuildPrefix(message.guild.id);
                
                // Group commands by category
                const categories = new Collection();
                
                handler.commands.forEach(command => {
                    const category = command.category || 'Uncategorized';
                    if (!categories.has(category)) {
                        categories.set(category, []);
                    }
                    categories.get(category).push(command);
                });

                // Sort categories alphabetically
                const sortedCategories = Array.from(categories.entries()).sort((a, b) => a[0].localeCompare(b[0]));

                // Build help message
                const helpLines = [
                    '**Albion Goodwill Bot Commands**',
                    `Use \`${guildPrefix} help [command]\` to get detailed info about a specific command.`,
                    ''  // Empty line for spacing
                ];

                for (const [category, commands] of sortedCategories) {
                    // Sort commands alphabetically within each category
                    const sortedCommands = commands.sort((a, b) => a.name.localeCompare(b.name));
                    
                    // Add category header
                    helpLines.push(`**${category.charAt(0).toUpperCase() + category.slice(1)} Commands:**`);
                    
                    // Add commands
                    sortedCommands.forEach(cmd => {
                        const usage = cmd.usage ? ` ${cmd.usage}` : '';
                        helpLines.push(`\`${guildPrefix} ${cmd.name}${usage}\` - ${cmd.description}`);
                    });
                    
                    helpLines.push(''); // Empty line between categories
                }

                await message.reply(helpLines.join('\n'));
                return;
            }

            // Show info about a specific command
            const commandName = args[0].toLowerCase();
            const command = handler.commands.get(commandName) || 
                          handler.commands.find(cmd => cmd.aliases?.includes(commandName));

            if (!command) {
                return message.reply('That command does not exist.');
            }

            const guildPrefix = await handler.getGuildPrefix(message.guild.id);
            
            const commandInfo = [
                `**Command: ${command.name}**`,
                '',
                `**Description:** ${command.description || 'No description provided'}`
            ];

            if (command.aliases?.length) {
                commandInfo.push(`**Aliases:** ${command.aliases.join(', ')}`);
            }

            if (command.usage) {
                commandInfo.push(`**Usage:** ${guildPrefix} ${command.name} ${command.usage}`);
            }

            if (command.cooldown) {
                commandInfo.push(`**Cooldown:** ${command.cooldown} second(s)`);
            }

            if (command.permissions?.length) {
                commandInfo.push(`**Required Permissions:** ${command.permissions.join(', ')}`);
            }

            if (command.category) {
                commandInfo.push(`**Category:** ${command.category.charAt(0).toUpperCase() + command.category.slice(1)}`);
            }

            await message.reply(commandInfo.join('\n'));
        } catch (error) {
            console.error('Error in help command:', error);
            await message.reply('Error showing help menu!');
        }
    }
}); 