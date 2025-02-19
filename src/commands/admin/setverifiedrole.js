const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { Colors } = require('discord.js');

module.exports = new Command({
    name: 'setverifiedrole',
    description: 'Set the role for verified Albion Online players',
    category: 'admin',
    usage: '@role',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args) {
        const role = message.mentions.roles.first();

        if (!role) {
            await message.reply({
                embeds: [
                    {
                        title: '⚠️ Missing Information',
                        description: 'Please mention the Discord role to be used for verified players.',
                        fields: [
                            {
                                name: 'Usage',
                                value: '`!albiongw setverifiedrole @role`',
                                inline: true
                            },
                            {
                                name: 'Example',
                                value: '`!albiongw setverifiedrole @Verified`',
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
                    nicknameVerifiedId: role.id,
                    guildName: message.guild.name
                },
                create: {
                    guildId: message.guild.id,
                    nicknameVerifiedId: role.id,
                    guildName: message.guild.name
                }
            });

            await message.reply({
                embeds: [
                    {
                        title: '✅ Verified Role Updated',
                        description: 'The verified role has been successfully updated.',
                        fields: [
                            {
                                name: 'New Verified Role',
                                value: `<@&${role.id}>`,
                                inline: true
                            },
                            {
                                name: 'Role Name',
                                value: `\`${role.name}\``,
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
            console.error('Error setting verified role:', error);
            await message.reply({
                embeds: [
                    {
                        title: '❌ Update Failed',
                        description: 'An error occurred while trying to update the verified role.',
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