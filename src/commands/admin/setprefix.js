const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { Colors } = require('discord.js');

module.exports = new Command({
    name: 'setprefix',
    description: 'Set the bot command prefix for this server',
    category: 'admin',
    usage: '<new_prefix>',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args, handler) {
        if (!args[0]) {
            await message.reply({
                embeds: [
                    {
                        title: '⚠️ Missing Information',
                        description: 'Please provide a new prefix for the bot commands.',
                        fields: [
                            {
                                name: 'Usage',
                                value: '`!albiongw setprefix <new_prefix>`',
                                inline: true
                            },
                            {
                                name: 'Example',
                                value: '`!albiongw setprefix !ag`',
                                inline: true
                            }
                        ],
                        color: Colors.Yellow,
                        timestamp: new Date().toISOString()
                    }
                ]
            });
            return;
        }

        const newPrefix = args[0];

        // Validate if prefix starts with a special character
        if (!/^[!$%&*#@?.]/.test(newPrefix)) {
            await message.reply({
                embeds: [
                    {
                        title: '⚠️ Invalid Prefix',
                        description: 'O prefixo precisa começar com um caractere especial.',
                        fields: [
                            {
                                name: 'Caracteres Permitidos',
                                value: '`! $ % & * # @ ? .`',
                                inline: true
                            },
                            {
                                name: 'Exemplo',
                                value: '`!albiongw setprefix !ag`',
                                inline: true
                            }
                        ],
                        color: Colors.Yellow,
                        timestamp: new Date().toISOString()
                    }
                ]
            });
            return;
        }

        try {
            await prisma.guildSettings.upsert({
                where: { 
                    guildId: message.guild.id 
                },
                update: { 
                    commandPrefix: newPrefix,
                    guildName: message.guild.name 
                },
                create: {
                    guildId: message.guild.id,
                    commandPrefix: newPrefix,
                    guildName: message.guild.name
                }
            });

            // Update the prefix in the CommandHandler's cache
            handler.prefixCache.set(message.guild.id, newPrefix);

            await message.reply({
                embeds: [
                    {
                        title: '✅ Prefix Updated',
                        description: 'The bot command prefix has been successfully updated.',
                        fields: [
                            {
                                name: 'New Prefix',
                                value: `\`${newPrefix}\``,
                                inline: true
                            },
                            {
                                name: 'Example',
                                value: `\`${newPrefix} help\``,
                                inline: true
                            }
                        ],
                        color: Colors.Green,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Updated by ${message.author.tag}`
                        }
                    }
                ]
            });
        } catch (error) {
            console.error('Error setting prefix:', error);
            await message.reply({
                embeds: [
                    {
                        title: '❌ Update Failed',
                        description: 'An error occurred while trying to update the command prefix.',
                        color: Colors.Red,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Attempted by ${message.author.tag}`
                        }
                    }
                ]
            });
        }
    }
}); 