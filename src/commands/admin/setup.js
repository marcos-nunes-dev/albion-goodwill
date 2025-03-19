const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');

module.exports = new Command({
    name: 'setup',
    description: 'Configure all guild settings at once',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 30,
    async execute(message, args, handler) {
        const isSlash = message.commandName === 'setup';
        
        try {
            // Defer the reply for slash commands since this might take a while
            if (isSlash) {
                await message.deferReply({ ephemeral: true });
            }
            
            // Get parameters based on command type
            let guildId, guildName, verifiedRole, tankRole, healerRole, supportRole;
            let meleeRole, rangedRole, mountRole, prefix;
            let battlelogWebhook;

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
                battlelogWebhook = message.options.getString('battlelog_webhook');
            }

            // Validate webhook URL if provided
            if (battlelogWebhook && !battlelogWebhook.startsWith('https://discord.com/api/webhooks/')) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Invalid Webhook URL')
                    .setDescription('Please provide a valid Discord webhook URL.')
                    .setColor(Colors.Red)
                    .setTimestamp();

                await message.reply({
                    embeds: [errorEmbed],
                    ephemeral: true
                });
                return;
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
                commandPrefix: prefix || settings?.commandPrefix,
                battlelogWebhook: battlelogWebhook || settings?.battlelogWebhook
            };

            // Update database
            await prisma.guildSettings.upsert({
                where: { guildId: message.guildId },
                update: updateData,
                create: updateData
            });

            // Test webhook if it's new or changed
            if (battlelogWebhook && battlelogWebhook !== settings?.battlelogWebhook) {
                try {
                    const welcomeEmbed = new EmbedBuilder()
                        .setTitle('📜 Battle Logs Webhook')
                        .setDescription('This webhook has been configured to receive battle logs.')
                        .setColor(Colors.Blue)
                        .setTimestamp();

                    await axios.post(battlelogWebhook, {
                        embeds: [welcomeEmbed]
                    });
                } catch (error) {
                    console.error('Error testing webhook:', error);
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('⚠️ Webhook Warning')
                        .setDescription('The webhook was saved but there was an error testing it. Please verify the URL is correct.')
                        .setColor(Colors.Yellow)
                        .setTimestamp();

                    if (isSlash) {
                        await message.followUp({
                            embeds: [errorEmbed],
                            ephemeral: true
                        });
                    } else {
                        await message.reply({
                            embeds: [errorEmbed]
                        });
                    }
                }
            }

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
                            `Battle Log Webhook: ${updateData.battlelogWebhook ? 
                                `${battlelogWebhook ? newMark : checkMark} Configured` : 
                                `${crossMark} Not set`}`,
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

            // Send response based on command type
            if (isSlash) {
                await message.editReply({
                    embeds: [setupEmbed]
                });
            } else {
                await message.reply({
                    embeds: [setupEmbed]
                });
            }

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

            if (isSlash) {
                if (message.deferred) {
                    await message.editReply({
                        embeds: [errorEmbed]
                    });
                } else {
                    await message.reply({
                        embeds: [errorEmbed],
                        ephemeral: true
                    });
                }
            } else {
                await message.reply({
                    embeds: [errorEmbed]
                });
            }
        }
    }
}); 