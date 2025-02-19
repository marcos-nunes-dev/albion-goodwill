const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { Colors } = require('discord.js');

module.exports = new Command({
    name: 'checkregistrations',
    description: 'Check unregistered members in a role',
    category: 'admin',
    usage: '@role',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args, handler) {
        // Check if a role was mentioned
        const role = message.mentions.roles.first();
        if (!role) {
            await message.reply({
                embeds: [
                    {
                        title: '⚠️ Missing Information',
                        description: 'Please mention the role to check registrations from.',
                        fields: [
                            {
                                name: 'Usage',
                                value: '`!albiongw checkregistrations @role`',
                                inline: true
                            },
                            {
                                name: 'Example',
                                value: '`!albiongw checkregistrations @Members`',
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
            // Get all members with the specified role
            const members = role.members;

            // Get all registrations for these members
            const registeredUsers = await prisma.playerRegistration.findMany({
                where: {
                    userId: {
                        in: [...members.keys()]
                    }
                }
            });

            // Find unregistered members
            const registeredUserIds = new Set(registeredUsers.map(reg => reg.userId));
            const unregisteredMembers = [...members.values()].filter(
                member => !registeredUserIds.has(member.id)
            );

            if (unregisteredMembers.length === 0) {
                await message.reply({
                    embeds: [
                        {
                            title: '✅ All Members Registered',
                            description: `All members with the ${role.name} role are registered!`,
                            color: Colors.Green,
                            timestamp: new Date().toISOString()
                        }
                    ]
                });
                return;
            }

            // Create mention list and message
            const mentions = unregisteredMembers.map(member => member.toString()).join('\n');
            await message.reply({
                embeds: [
                    {
                        title: '⚠️ Unregistered Members Found',
                        description: `The following members in ${role.name} are not registered:`,
                        fields: [
                            {
                                name: 'Members',
                                value: mentions,
                                inline: false
                            },
                            {
                                name: 'How to Register',
                                value: 'Use `/register region:america nickname:YourNick` to register your character.\nAvailable regions: america, europe, asia',
                                inline: false
                            }
                        ],
                        color: Colors.Yellow,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Total unregistered: ${unregisteredMembers.length}`
                        }
                    }
                ]
            });

        } catch (error) {
            console.error('Error checking registrations:', error);
            await message.reply({
                embeds: [
                    {
                        title: '❌ Error',
                        description: 'An error occurred while checking registrations.',
                        color: Colors.Red,
                        timestamp: new Date().toISOString()
                    }
                ]
            });
        }
    }
}); 