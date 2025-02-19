const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');

module.exports = new Command({
    name: 'setprefix',
    description: 'Set the bot command prefix for this server',
    category: 'admin',
    usage: '<new_prefix>',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'setprefix';
            const newPrefix = isSlash ? 
                message.options.getString('prefix') : 
                args[0];

            if (!newPrefix) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Missing Information')
                    .setDescription('Please provide a new prefix for the bot commands.')
                    .addFields([
                        {
                            name: 'Usage',
                            value: isSlash ? 
                                '`/setprefix prefix:<new_prefix>`' : 
                                '`!albiongw setprefix <new_prefix>`'
                        },
                        {
                            name: 'Example',
                            value: isSlash ? 
                                '`/setprefix prefix:!ag`' : 
                                '`!albiongw setprefix !ag`'
                        }
                    ])
                    .setColor(Colors.Yellow)
                    .setTimestamp();

                await message.reply({
                    embeds: [errorEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            // Validate if prefix starts with a special character
            if (!/^[!$%&*#@?.]/.test(newPrefix)) {
                const invalidEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Invalid Prefix')
                    .setDescription('O prefixo precisa começar com um caractere especial.')
                    .addFields([
                        {
                            name: 'Caracteres Permitidos',
                            value: '`! $ % & * # @ ? .`'
                        },
                        {
                            name: 'Exemplo',
                            value: isSlash ? 
                                '`/setprefix prefix:!ag`' : 
                                '`!albiongw setprefix !ag`'
                        }
                    ])
                    .setColor(Colors.Yellow)
                    .setTimestamp();

                await message.reply({
                    embeds: [invalidEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            await prisma.guildSettings.upsert({
                where: { 
                    guildId: message.guildId 
                },
                update: { 
                    commandPrefix: newPrefix,
                    guildName: message.guild.name 
                },
                create: {
                    guildId: message.guildId,
                    commandPrefix: newPrefix,
                    guildName: message.guild.name
                }
            });

            // Update the prefix in the CommandHandler's cache
            handler.prefixCache.set(message.guildId, newPrefix);

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Prefix Updated')
                .setDescription('The bot command prefix has been successfully updated.')
                .addFields([
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
                ])
                .setColor(Colors.Green)
                .setTimestamp()
                .setFooter({
                    text: `Updated by ${isSlash ? message.user.tag : message.author.tag}`
                });

            await message.reply({
                embeds: [successEmbed],
                ephemeral: isSlash
            });
        } catch (error) {
            console.error('Error setting prefix:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Update Failed')
                .setDescription('An error occurred while trying to update the command prefix.')
                .setColor(Colors.Red)
                .setTimestamp()
                .setFooter({
                    text: `Attempted by ${isSlash ? message.user.tag : message.author.tag}`
                });

            await message.reply({
                embeds: [errorEmbed],
                ephemeral: isSlash
            });
        }
    }
}); 