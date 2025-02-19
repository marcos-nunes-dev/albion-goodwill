const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { Colors } = require('discord.js');

module.exports = new Command({
    name: 'setrole',
    description: 'Set a role for a specific Albion Online class',
    category: 'admin',
    usage: '<type> @role',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args) {
        if (args.length < 2) {
            await message.reply({
                embeds: [
                    {
                        title: '⚠️ Missing Information',
                        description: 'Please provide both the role type and mention the Discord role.',
                        fields: [
                            {
                                name: 'Usage',
                                value: '`!albiongw setrole <type> @role`',
                                inline: false
                            },
                            {
                                name: 'Available Types',
                                value: '`tank`, `support`, `healer`, `melee`, `ranged`, `mount`',
                                inline: false
                            },
                            {
                                name: 'Example',
                                value: '`!albiongw setrole tank @Tank`',
                                inline: false
                            }
                        ],
                        color: Colors.Yellow,
                        timestamp: new Date().toISOString()
                    }
                ]
            });
            return;
        }

        const roleType = args[0].toLowerCase();
        const role = message.mentions.roles.first();

        if (!role) {
            await message.reply({
                embeds: [
                    {
                        title: '⚠️ Invalid Role',
                        description: 'Please mention a valid Discord role.',
                        color: Colors.Yellow,
                        timestamp: new Date().toISOString()
                    }
                ]
            });
            return;
        }

        const roleMap = {
            'tank': 'tankRoleId',
            'support': 'supportRoleId',
            'healer': 'healerRoleId',
            'melee': 'dpsMeleeRoleId',
            'ranged': 'dpsRangedRoleId',
            'mount': 'battlemountRoleId'
        };

        if (!roleMap[roleType]) {
            await message.reply({
                embeds: [
                    {
                        title: '❌ Invalid Role Type',
                        description: 'The specified role type is not valid.',
                        fields: [
                            {
                                name: 'Available Types',
                                value: '`tank`, `support`, `healer`, `melee`, `ranged`, `mount`'
                            }
                        ],
                        color: Colors.Red,
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
                    [roleMap[roleType]]: role.id,
                    guildName: message.guild.name
                },
                create: {
                    guildId: message.guild.id,
                    [roleMap[roleType]]: role.id,
                    guildName: message.guild.name
                }
            });

            await message.reply({
                embeds: [
                    {
                        title: '✅ Role Assignment Updated',
                        description: 'The role assignment has been successfully updated.',
                        fields: [
                            {
                                name: 'Role Type',
                                value: `\`${roleType}\``,
                                inline: true
                            },
                            {
                                name: 'Discord Role',
                                value: `<@&${role.id}>`,
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
            console.error('Error setting role:', error);
            await message.reply({
                embeds: [
                    {
                        title: '❌ Update Failed',
                        description: 'An error occurred while trying to update the role assignment.',
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