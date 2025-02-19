const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { Colors } = require('discord.js');

module.exports = new Command({
    name: 'settings',
    description: 'View current guild settings',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args) {
        try {
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guild.id }
            });

            if (!settings) {
                await message.reply({
                    embeds: [
                        {
                            title: 'ℹ️ Guild Settings',
                            description: 'No settings have been configured yet.',
                            fields: [
                                {
                                    name: 'Available Commands',
                                    value: [
                                        '`!albiongw setprefix <prefix>` - Set command prefix',
                                        '`!albiongw setguildname <name>` - Set Albion guild name',
                                        '`!albiongw setguildid <id>` - Set Albion guild ID',
                                        '`!albiongw setrole <type> @role` - Set role for class type',
                                        '`!albiongw setverifiedrole @role` - Set verified member role'
                                    ].join('\n')
                                }
                            ],
                            color: Colors.Blue,
                            timestamp: new Date().toISOString()
                        }
                    ]
                });
                return;
            }

            await message.reply({
                embeds: [
                    {
                        title: 'ℹ️ Current Guild Settings',
                        fields: [
                            {
                                name: 'General',
                                value: [
                                    `Command Prefix: \`${settings.commandPrefix || '!albiongw'}\``,
                                    `Guild Name: \`${settings.guildName || 'Not set'}\``,
                                    `Albion Guild ID: \`${settings.albionGuildId || 'Not set'}\``
                                ].join('\n'),
                                inline: false
                            },
                            {
                                name: 'Roles',
                                value: [
                                    `Tank: ${settings.tankRoleId ? `<@&${settings.tankRoleId}>` : '`Not set`'}`,
                                    `Support: ${settings.supportRoleId ? `<@&${settings.supportRoleId}>` : '`Not set`'}`,
                                    `Healer: ${settings.healerRoleId ? `<@&${settings.healerRoleId}>` : '`Not set`'}`,
                                    `DPS Melee: ${settings.dpsMeleeRoleId ? `<@&${settings.dpsMeleeRoleId}>` : '`Not set`'}`,
                                    `DPS Ranged: ${settings.dpsRangedRoleId ? `<@&${settings.dpsRangedRoleId}>` : '`Not set`'}`,
                                    `Battlemount: ${settings.battlemountRoleId ? `<@&${settings.battlemountRoleId}>` : '`Not set`'}`,
                                    `Verified: ${settings.nicknameVerifiedId ? `<@&${settings.nicknameVerifiedId}>` : '`Not set`'}`
                                ].join('\n'),
                                inline: false
                            },
                            {
                                name: 'Available Commands',
                                value: [
                                    '`!albiongw setprefix <prefix>` - Set command prefix',
                                    '`!albiongw setguildname <name>` - Set Albion guild name',
                                    '`!albiongw setguildid <id>` - Set Albion guild ID',
                                    '`!albiongw setrole <type> @role` - Set role for class type',
                                    '`!albiongw setverifiedrole @role` - Set verified member role'
                                ].join('\n'),
                                inline: false
                            }
                        ],
                        color: Colors.Blue,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Requested by ${message.author.tag}`
                        }
                    }
                ]
            });
        } catch (error) {
            console.error('Error showing settings:', error);
            await message.reply({
                embeds: [
                    {
                        title: '❌ Error',
                        description: 'An error occurred while trying to fetch the settings.',
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