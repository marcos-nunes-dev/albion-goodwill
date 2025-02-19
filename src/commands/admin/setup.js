const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');

module.exports = new Command({
    name: 'setup',
    description: 'Configure all guild settings at once',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 30,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'setup';
            
            // Get parameters based on command type
            let guildId, guildName, verifiedRole, tankRole, healerRole, supportRole;
            let meleeRole, rangedRole, mountRole, prefix;

            if (isSlash) {
                guildId = message.options.getString('guild_id');
                guildName = message.options.getString('guild_name');
                verifiedRole = message.options.getRole('verified_role');
                tankRole = message.options.getRole('tank_role');
                healerRole = message.options.getRole('healer_role');
                supportRole = message.options.getRole('support_role');
                meleeRole = message.options.getRole('melee_role');
                rangedRole = message.options.getRole('ranged_role');
                mountRole = message.options.getRole('mount_role');
                prefix = message.options.getString('prefix');
            }

            // Get current settings
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guildId }
            });

            // Update settings with new values if provided
            const updateData = {
                guildId: message.guildId,
                guildName: guildName || settings?.guildName,
                albionGuildId: guildId || settings?.albionGuildId,
                nicknameVerifiedId: verifiedRole?.id || settings?.nicknameVerifiedId,
                tankRoleId: tankRole?.id || settings?.tankRoleId,
                healerRoleId: healerRole?.id || settings?.healerRoleId,
                supportRoleId: supportRole?.id || settings?.supportRoleId,
                dpsMeleeRoleId: meleeRole?.id || settings?.dpsMeleeRoleId,
                dpsRangedRoleId: rangedRole?.id || settings?.dpsRangedRoleId,
                battlemountRoleId: mountRole?.id || settings?.battlemountRoleId,
                commandPrefix: prefix || settings?.commandPrefix
            };

            // Update database
            await prisma.guildSettings.upsert({
                where: { guildId: message.guildId },
                update: updateData,
                create: updateData
            });

            // Create response embed
            const checkMark = '✅';
            const crossMark = '❌';
            const newMark = '🆕';

            const setupEmbed = new EmbedBuilder()
                .setTitle('🛠️ Guild Configuration Status')
                .addFields([
                    {
                        name: 'Required Settings',
                        value: [
                            `Guild ID: ${updateData.albionGuildId ? 
                                `${guildId ? newMark : checkMark} ${updateData.albionGuildId}` : 
                                `${crossMark} Not Set`}`,
                            `Guild Name: ${updateData.guildName ? 
                                `${guildName ? newMark : checkMark} ${updateData.guildName}` : 
                                `${crossMark} Not Set`}`,
                            `Verified Role: ${updateData.nicknameVerifiedId ? 
                                `${verifiedRole ? newMark : checkMark} <@&${updateData.nicknameVerifiedId}>` : 
                                `${crossMark} Not Set`}`
                        ].join('\n')
                    },
                    {
                        name: 'Class Roles',
                        value: [
                            `Tank: ${updateData.tankRoleId ? 
                                `${tankRole ? newMark : checkMark} <@&${updateData.tankRoleId}>` : 
                                `${crossMark} Not Set`}`,
                            `Healer: ${updateData.healerRoleId ? 
                                `${healerRole ? newMark : checkMark} <@&${updateData.healerRoleId}>` : 
                                `${crossMark} Not Set`}`,
                            `Support: ${updateData.supportRoleId ? 
                                `${supportRole ? newMark : checkMark} <@&${updateData.supportRoleId}>` : 
                                `${crossMark} Not Set`}`,
                            `Melee DPS: ${updateData.dpsMeleeRoleId ? 
                                `${meleeRole ? newMark : checkMark} <@&${updateData.dpsMeleeRoleId}>` : 
                                `${crossMark} Not Set`}`,
                            `Ranged DPS: ${updateData.dpsRangedRoleId ? 
                                `${rangedRole ? newMark : checkMark} <@&${updateData.dpsRangedRoleId}>` : 
                                `${crossMark} Not Set`}`,
                            `Battlemount: ${updateData.battlemountRoleId ? 
                                `${mountRole ? newMark : checkMark} <@&${updateData.battlemountRoleId}>` : 
                                `${crossMark} Not Set`}`
                        ].join('\n')
                    },
                    {
                        name: 'Optional Settings',
                        value: [
                            `Command Prefix: ${updateData.commandPrefix ? 
                                `${prefix ? newMark : checkMark} ${updateData.commandPrefix}` : 
                                `${checkMark} Default (!albiongw)`}`,
                            `Competitor Guilds: ${settings?.competitorIds?.length ? 
                                `${checkMark} ${settings.competitorIds.length} set` : 
                                `${crossMark} None set`} (Use /competitors to manage)`
                        ].join('\n')
                    }
                ])
                .setColor(Colors.Blue)
                .setTimestamp()
                .setFooter({
                    text: `Updated by ${isSlash ? message.user.tag : message.author.tag}`
                });

            await message.reply({
                embeds: [setupEmbed],
                ephemeral: isSlash
            });

        } catch (error) {
            console.error('Error in setup command:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Setup Error')
                .setDescription('An error occurred while updating the configuration.')
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