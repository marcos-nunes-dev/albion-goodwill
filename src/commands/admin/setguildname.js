const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { Colors } = require('discord.js');

module.exports = new Command({
    name: 'setguildname',
    description: 'Set the Albion guild name for this server',
    category: 'admin',
    usage: '<guild_name>',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args) {
        if (!args[0]) {
            await message.reply({
                embeds: [
                    {
                        title: '⚠️ Missing Information',
                        description: 'Please provide the Albion guild name.',
                        fields: [
                            {
                                name: 'Usage',
                                value: '`!albiongw setguildname <guild_name>`',
                                inline: true
                            },
                            {
                                name: 'Example',
                                value: '`!albiongw setguildname MyGuild`',
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

        const guildName = args.join(' ');

        try {
            await prisma.guildSettings.upsert({
                where: { 
                    guildId: message.guild.id 
                },
                update: { 
                    guildName: guildName 
                },
                create: {
                    guildId: message.guild.id,
                    guildName: guildName
                }
            });

            await message.reply({
                embeds: [
                    {
                        title: '✅ Guild Name Updated',
                        description: 'The Albion guild name has been successfully updated.',
                        fields: [
                            {
                                name: 'New Guild Name',
                                value: `\`${guildName}\``,
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
            console.error('Error setting guild name:', error);
            await message.reply({
                embeds: [
                    {
                        title: '❌ Update Failed',
                        description: 'An error occurred while trying to update the guild name.',
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