const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { Colors } = require('discord.js');
const { fetchGuildStats, getMainRole } = require('../../utils/albionApi');

module.exports = new Command({
    name: 'updatemembersrole',
    description: 'Update roles of members based on their main class in Albion Online',
    category: 'admin',
    usage: '@role',
    permissions: ['ADMINISTRATOR'],
    cooldown: 10,
    async execute(message, args, handler) {
        // Check if a role was mentioned
        const role = message.mentions.roles.first();
        if (!role) {
            await message.reply({
                embeds: [
                    {
                        title: '⚠️ Missing Information',
                        description: 'Please mention the role to update members from.',
                        fields: [
                            {
                                name: 'Usage',
                                value: '`!albiongw updatemembersrole @role`',
                                inline: true
                            },
                            {
                                name: 'Example',
                                value: '`!albiongw updatemembersrole @Members`',
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
            // Get guild settings
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guild.id }
            });

            // Check if guild has Albion guild ID configured
            if (!settings?.albionGuildId) {
                await message.reply({
                    embeds: [
                        {
                            title: '❌ Missing Configuration',
                            description: 'Albion guild ID not configured. Use `/settings setguildid` first.',
                            color: Colors.Red,
                            timestamp: new Date().toISOString()
                        }
                    ]
                });
                return;
            }

            // Check if verified role is configured
            if (!settings?.nicknameVerifiedId) {
                await message.reply({
                    embeds: [
                        {
                            title: '❌ Missing Configuration',
                            description: 'Verified role not configured. Use `/settings setverifiedrole` first.',
                            color: Colors.Red,
                            timestamp: new Date().toISOString()
                        }
                    ]
                });
                return;
            }

            // Check if all role IDs are configured
            const roleIds = {
                'Tank': settings.tankRoleId,
                'Support': settings.supportRoleId,
                'Healer': settings.healerRoleId,
                'DPS Melee': settings.dpsMeleeRoleId,
                'DPS Ranged': settings.dpsRangedRoleId,
                'Battlemount': settings.battlemountRoleId
            };

            const missingRoles = Object.entries(roleIds)
                .filter(([_, id]) => !id)
                .map(([role]) => role);

            if (missingRoles.length > 0) {
                await message.reply({
                    embeds: [
                        {
                            title: '❌ Missing Role Configuration',
                            description: 'The following roles need to be configured first using `/settings setrole`:',
                            fields: [
                                {
                                    name: 'Missing Roles',
                                    value: missingRoles.join('\n'),
                                    inline: false
                                }
                            ],
                            color: Colors.Red,
                            timestamp: new Date().toISOString()
                        }
                    ]
                });
                return;
            }

            // Initial response
            const initialResponse = await message.reply({
                embeds: [
                    {
                        title: '⏳ Updating Member Roles',
                        description: 'Fetching guild data and updating roles...',
                        color: Colors.Blue,
                        timestamp: new Date().toISOString()
                    }
                ]
            });

            // Fetch guild stats from Albion API
            const guildStats = await fetchGuildStats(settings.albionGuildId);
            if (!guildStats || !guildStats.length) {
                await initialResponse.edit({
                    embeds: [
                        {
                            title: '❌ Error',
                            description: 'Failed to fetch guild data. Your guild ID may be incorrect.',
                            color: Colors.Red,
                            timestamp: new Date().toISOString()
                        }
                    ]
                });
                return;
            }

            // Get all members with the specified role
            const members = role.members;

            let updated = 0;
            let notFound = 0;
            let notVerified = 0;
            const notFoundMembers = [];
            const notVerifiedMembers = [];

            // Process each member
            for (const [memberId, member] of members) {
                // Check if member has verified role
                if (!member.roles.cache.has(settings.nicknameVerifiedId)) {
                    notVerified++;
                    notVerifiedMembers.push(member.displayName);
                    continue;
                }

                // Get player registration
                const registration = await prisma.playerRegistration.findFirst({
                    where: {
                        userId: memberId
                    }
                });

                if (!registration) {
                    notVerified++;
                    notVerifiedMembers.push(member.displayName);
                    continue;
                }

                // Find player in guild stats
                const player = guildStats.find(p =>
                    p.name.toLowerCase() === registration.playerName.toLowerCase()
                );

                if (player) {
                    const mainRole = getMainRole(player.roles);
                    const roleId = roleIds[mainRole.name];
                    const role = await message.guild.roles.fetch(roleId);

                    if (role) {
                        // Remove all class roles first
                        const allClassRoles = Object.values(roleIds).filter(id => id);
                        for (const classRoleId of allClassRoles) {
                            if (member.roles.cache.has(classRoleId)) {
                                await member.roles.remove(classRoleId);
                            }
                        }

                        // Add the new role
                        if (!member.roles.cache.has(roleId)) {
                            await member.roles.add(role);
                            updated++;
                        }
                    }
                } else {
                    notFound++;
                    notFoundMembers.push(registration.playerName);
                }
            }

            // Final response
            await initialResponse.edit({
                embeds: [
                    {
                        title: '✅ Role Update Complete',
                        description: 'Member roles have been updated based on their main class.',
                        fields: [
                            {
                                name: '📊 Results',
                                value: [
                                    `Updated: ${updated}`,
                                    `Not Verified: ${notVerified}`,
                                    `Not Found: ${notFound}`
                                ].join('\n'),
                                inline: false
                            },
                            notVerifiedMembers.length > 0 ? {
                                name: '❌ Not Verified Members',
                                value: notVerifiedMembers.join(', '),
                                inline: false
                            } : null,
                            notFoundMembers.length > 0 ? {
                                name: '❓ Members Not Found in Guild',
                                value: notFoundMembers.join(', '),
                                inline: false
                            } : null
                        ].filter(Boolean),
                        color: Colors.Green,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Updated by ${message.author.tag}`
                        }
                    }
                ]
            });
        } catch (error) {
            console.error('Error updating member roles:', error);
            await message.reply({
                embeds: [
                    {
                        title: '❌ Update Failed',
                        description: 'An error occurred while trying to update member roles.',
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