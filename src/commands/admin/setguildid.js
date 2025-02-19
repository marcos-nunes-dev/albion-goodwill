const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { isAdmin } = require('../../utils/validators');
const { Colors } = require('discord.js');

module.exports = new Command({
    name: 'setguildid',
    description: 'Set the Albion guild ID',
    category: 'admin',
    usage: '<guild_id>',
    permissions: ['ADMINISTRATOR'],
    cooldown: 10,
    async execute(message, args) {
        if (!args[0]) {
            await message.reply({
                embeds: [
                    {
                        title: '⚠️ Missing Information',
                        description: 'Please provide the Albion guild ID.',
                        fields: [
                            {
                                name: 'Usage',
                                value: '`!albiongw setguildid <guild_id>`'
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
                    albionGuildId: args[0],
                    guildName: message.guild.name
                },
                create: {
                    guildId: message.guild.id,
                    albionGuildId: args[0],
                    guildName: message.guild.name
                }
            });

            await message.reply({
                embeds: [
                    {
                        title: '✅ Guild ID Updated',
                        description: 'The Albion guild ID has been successfully updated. Note that this will only work if the guild ID is correct.',
                        fields: [
                            {
                                name: 'Guild ID',
                                value: `\`${args[0]}\``,
                                inline: true
                            },
                            {
                                name: 'Discord Server',
                                value: `\`${message.guild.name}\``,
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
            console.error('Error setting guild ID:', error);
            await message.reply({
                embeds: [
                    {
                        title: '❌ Update Failed',
                        description: 'An error occurred while trying to update the Albion guild ID.',
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