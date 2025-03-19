const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');
const BattleChannelManager = require('../../services/BattleChannelManager');

// Emoji indicators
const checkMark = '✅';
const crossMark = '❌';
const newMark = '🆕';

const command = new Command({
    name: 'setup',
    description: 'Configure guild settings',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args, handler) {
        const isSlash = message.commandName === 'setup';
        const guildId = message.guildId;

        try {
            // Get current settings
            let settings = await prisma.guildSettings.findUnique({
                where: { guildId }
            });

            // If no settings exist, create them
            if (!settings) {
                settings = await prisma.guildSettings.create({
                    data: { guildId }
                });
            }

            // Get update data from options
            const updateData = settings;

            // Get role references
            const verifiedRole = updateData.nicknameVerifiedId ? 
                message.guild.roles.cache.get(updateData.nicknameVerifiedId) : null;
            const tankRole = updateData.tankRoleId ? 
                message.guild.roles.cache.get(updateData.tankRoleId) : null;
            const healerRole = updateData.healerRoleId ? 
                message.guild.roles.cache.get(updateData.healerRoleId) : null;
            const supportRole = updateData.supportRoleId ? 
                message.guild.roles.cache.get(updateData.supportRoleId) : null;
            const meleeRole = updateData.dpsMeleeRoleId ? 
                message.guild.roles.cache.get(updateData.dpsMeleeRoleId) : null;
            const rangedRole = updateData.dpsRangedRoleId ? 
                message.guild.roles.cache.get(updateData.dpsRangedRoleId) : null;
            const mountRole = updateData.battlemountRoleId ? 
                message.guild.roles.cache.get(updateData.battlemountRoleId) : null;
            const battlelogChannel = updateData.battlelogChannelId ? 
                message.guild.channels.cache.get(updateData.battlelogChannelId) : null;

            // Update battle channel name if it exists
            if (battlelogChannel) {
                const stats = await prisma.battleRegistration.findMany({
                    where: {
                        guildId: guildId
                    },
                    select: {
                        isVictory: true,
                        kills: true,
                        deaths: true
                    }
                });

                const channelManager = new BattleChannelManager(message.client);
                await channelManager.updateGuildChannel({ guildId, battlelogChannelId: battlelogChannel.id });
            }

            // Create embed
            const setupEmbed = new EmbedBuilder()
                .setTitle('🛠️ Guild Configuration Status')
                .addFields([
                    {
                        name: 'Required Settings',
                        value: [
                            `Guild ID: ${updateData.albionGuildId ? 
                                `${updateData.albionGuildId ? newMark : checkMark} ${updateData.albionGuildId}` : 
                                `${crossMark} Not Set`}`,
                            `Guild Name: ${updateData.guildName ? 
                                `${updateData.guildName ? newMark : checkMark} ${updateData.guildName}` : 
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
                                `${updateData.commandPrefix ? newMark : checkMark} ${updateData.commandPrefix}` : 
                                `${checkMark} Default (!albiongw)`}`,
                            `Battle Log Channel: ${updateData.battlelogChannelId ? 
                                `${battlelogChannel ? newMark : checkMark} <#${updateData.battlelogChannelId}>` : 
                                `${crossMark} Not Set`}`,
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

            // Send response
            if (isSlash) {
                await message.reply({ embeds: [setupEmbed], ephemeral: true });
            } else {
                await message.reply({ embeds: [setupEmbed] });
            }
        } catch (error) {
            console.error('Error in setup command:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while configuring the guild.')
                .setColor(Colors.Red);

            if (isSlash) {
                await message.reply({ embeds: [errorEmbed], ephemeral: true });
            } else {
                await message.reply({ embeds: [errorEmbed] });
            }
        }
    }
});

module.exports = command;