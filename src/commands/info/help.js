const Command = require('../../structures/Command');
const { Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = new Command({
    name: 'help',
    description: 'Shows all commands or info about a specific command',
    category: 'info',
    usage: '[command]',
    cooldown: 5,
    async execute(source, args, handler) {
        try {
            const isInteraction = source.commandName !== undefined;
            const guildId = isInteraction ? source.guildId : source.guild.id;
            
            // Helper function to handle replies consistently
            const reply = async (content, isFirstMessage = true) => {
                if (isInteraction) {
                    if (isFirstMessage) {
                        return source.reply({ content, flags: [4096] });
                    }
                    return source.followUp({ content, flags: [4096] });
                }
                return source.channel.send(content);
            };

            const commandName = isInteraction ? 
                source.options?.getString('command') : 
                args[0]?.toLowerCase();

            const guildPrefix = await handler.getGuildPrefix(guildId);

            if (!commandName) {
                // Group commands by category
                const categories = new Collection();
                
                handler.commands.forEach(command => {
                    const category = command.category || 'Uncategorized';
                    if (!categories.has(category)) {
                        categories.set(category, []);
                    }
                    categories.get(category).push(command);
                });

                // Sort categories and prepare pages
                const pages = [];
                const sortedCategories = Array.from(categories.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]));

                // Add welcome page
                pages.push({
                    title: 'Albion Goodwill Bot Help',
                    content: [
                        '**Welcome to the Help Menu!**',
                        '',
                        'Use the buttons below to navigate through the command categories.',
                        'Each category contains related commands and their descriptions.',
                        '',
                        `You can also use \`${guildPrefix} help [command]\` or \`/help command:[command]\``,
                        'to get detailed information about a specific command.',
                        '',
                        '**Available Categories:**',
                        sortedCategories.map(([category]) => 
                            `• ${category.charAt(0).toUpperCase() + category.slice(1)}`
                        ).join('\n')
                    ].join('\n')
                });

                // Add category pages
                for (const [category, commands] of sortedCategories) {
                    const sortedCommands = commands.sort((a, b) => a.name.localeCompare(b.name));
                    
                    const commandList = sortedCommands.map(cmd => {
                        const usage = cmd.usage ? ` ${cmd.usage}` : '';
                        return `• \`${cmd.name}\`${usage}\n  ${cmd.description}`;
                    }).join('\n\n');

                    pages.push({
                        title: `${category.charAt(0).toUpperCase() + category.slice(1)} Commands`,
                        content: commandList
                    });
                }

                let currentPage = 0;

                // Create buttons
                const buttons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('first')
                            .setLabel('≪')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('previous')
                            .setLabel('←')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('→')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('last')
                            .setLabel('≫')
                            .setStyle(ButtonStyle.Primary)
                    );

                // Function to get page content
                const getPage = (page) => {
                    return {
                        content: [
                            `**${pages[page].title}**`,
                            '',
                            pages[page].content,
                            '',
                            `Page ${page + 1} of ${pages.length}`
                        ].join('\n'),
                        components: [buttons],
                        flags: isInteraction ? [4096] : undefined
                    };
                };

                // Send initial message
                const response = isInteraction ?
                    await source.reply(getPage(currentPage)) :
                    await source.channel.send(getPage(currentPage));

                // Create button collector
                const collector = response.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 300000 // 5 minutes
                });

                collector.on('collect', async (interaction) => {
                    if (interaction.user.id !== (isInteraction ? source.user.id : source.author.id)) {
                        await interaction.reply({
                            content: 'You cannot use these buttons.',
                            ephemeral: true
                        });
                        return;
                    }

                    switch (interaction.customId) {
                        case 'first':
                            currentPage = 0;
                            break;
                        case 'previous':
                            currentPage = Math.max(0, currentPage - 1);
                            break;
                        case 'next':
                            currentPage = Math.min(pages.length - 1, currentPage + 1);
                            break;
                        case 'last':
                            currentPage = pages.length - 1;
                            break;
                    }

                    await interaction.update(getPage(currentPage));
                });

                collector.on('end', async () => {
                    const disabledButtons = new ActionRowBuilder()
                        .addComponents(
                            buttons.components.map(button => 
                                ButtonBuilder.from(button).setDisabled(true)
                            )
                        );

                    if (isInteraction) {
                        await response.edit({ components: [disabledButtons] });
                    } else {
                        await response.edit({ components: [disabledButtons] });
                    }
                });

                return;
            }

            // Show info about a specific command
            const command = handler.commands.get(commandName) || 
                          handler.commands.find(cmd => cmd.aliases?.includes(commandName));

            if (!command) {
                return reply('That command does not exist.');
            }

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
                commandInfo.push(`**Slash Usage:** /${command.name} ${command.usage.replace(/[<>]/g, '')}`);
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

            await reply(commandInfo.join('\n'));
        } catch (error) {
            console.error('Error in help command:', error);
            const errorMsg = 'Error showing help menu!';
            if (source.commandName) {
                await source.reply({ content: errorMsg, ephemeral: true });
            } else {
                await source.reply(errorMsg);
            }
        }
    }
}); 