const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');
const { fetchGuildStats, getMainRole } = require('../../utils/albionApi');

module.exports = new Command({
    name: 'updatemembersrole',
    description: 'Update roles of members based on their main class in Albion Online',
    category: 'admin',
    usage: '@role',
    permissions: ['ADMINISTRATOR'],
    cooldown: 10,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'updatemembersrole';
            const role = isSlash ? 
                message.options.getRole('role') : 
                message.mentions.roles.first();

            if (!role) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Missing Information')
                    .setDescription('Please mention the role to update members from.')
                    .addFields([
                        {
                            name: 'Usage',
                            value: isSlash ? 
                                '`/updatemembersrole role:@role`' : 
                                '`!albiongw updatemembersrole @role`'
                        },
                        {
                            name: 'Example',
                            value: isSlash ? 
                                '`/updatemembersrole role:@Members`' : 
                                '`!albiongw updatemembersrole @Members`'
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

            // Get guild settings
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guildId }
            });

            // Check if guild has Albion guild ID configured
            if (!settings?.albionGuildId) {
                const noGuildEmbed = new EmbedBuilder()
                    .setTitle('❌ Missing Configuration')
                    .setDescription('Albion guild ID not configured. Use `/setguildid` first.')
                    .setColor(Colors.Red)
                    .setTimestamp();

                await message.reply({
                    embeds: [noGuildEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            // Check if verified role is configured
            if (!settings?.nicknameVerifiedId) {
                const noVerifiedEmbed = new EmbedBuilder()
                    .setTitle('❌ Missing Configuration')
                    .setDescription('Verified role not configured. Use `/setverifiedrole` first.')
                    .setColor(Colors.Red)
                    .setTimestamp();

                await message.reply({
                    embeds: [noVerifiedEmbed],
                    ephemeral: isSlash
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
                const missingRolesEmbed = new EmbedBuilder()
                    .setTitle('❌ Missing Role Configuration')
                    .setDescription('The following roles need to be configured first using `/setrole`:')
                    .addFields([
                        {
                            name: 'Missing Roles',
                            value: missingRoles.join('\n')
                        }
                    ])
                    .setColor(Colors.Red)
                    .setTimestamp();

                await message.reply({
                    embeds: [missingRolesEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            // Initial response
            const loadingEmbed = new EmbedBuilder()
                .setTitle('⏳ Updating Member Roles')
                .setDescription('Fetching guild data and updating roles...')
                .setColor(Colors.Blue)
                .setTimestamp();

            const initialResponse = await message.reply({
                embeds: [loadingEmbed],
                fetchReply: true
            });

            // Fetch guild stats from Albion API
            const guildStats = await fetchGuildStats(settings.albionGuildId);
            if (!guildStats || !guildStats.length) {
                const noDataEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Failed to fetch guild data. Your guild ID may be incorrect.')
                    .setColor(Colors.Red)
                    .setTimestamp();

                await initialResponse.edit({
                    embeds: [noDataEmbed]
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
                        userId: memberId,
                        guildId: message.guildId
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
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Role Update Complete')
                .setDescription('Member roles have been updated based on their main class.')
                .addFields([
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
                ].filter(Boolean))
                .setColor(Colors.Green)
                .setTimestamp()
                .setFooter({
                    text: `Updated by ${isSlash ? message.user.tag : message.author.tag}`
                });

            await initialResponse.edit({
                embeds: [resultEmbed]
            });

        } catch (error) {
            console.error('Error updating member roles:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Update Failed')
                .setDescription('An error occurred while trying to update member roles.')
                .setColor(Colors.Red)
                .setTimestamp()
                .setFooter({
                    text: `Attempted by ${isSlash ? message.user.tag : message.author.tag}`
                });

            if (message.replied) {
                await message.editReply({
                    embeds: [errorEmbed]
                });
            } else {
                await message.reply({
                    embeds: [errorEmbed],
                    ephemeral: isSlash
                });
            }
        }
    }
}); 