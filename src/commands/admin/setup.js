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
            let battlelogWebhook, battlelogChannel;

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
                battlelogChannel = message.options.getChannel('battlelog_channel');
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
                battlelogWebhook: battlelogWebhook || settings?.battlelogWebhook,
                battlelogChannelId: battlelogChannel?.id || settings?.battlelogChannelId
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
                        await message.editReply({ embeds: [errorEmbed] });
                    } else {
                        await message.reply({ embeds: [errorEmbed] });
                    }
                    return;
                }
            }

            // Update battle log channel name if provided
            if (battlelogChannel && battlelogChannel.id !== settings?.battlelogChannelId) {
                try {
                    const stats = await prisma.battleRegistration.aggregate({
                        where: {
                            guildId: message.guildId
                        },
                        _count: {
                            id: true
                        }
                    });

                    const victories = await prisma.battleRegistration.count({
                        where: {
                            guildId: message.guildId,
                            isVictory: true
                        }
                    });

                    const total = stats._count.id;
                    const losses = total - victories;
                    const winRate = total === 0 ? 0 : Math.round((victories / total) * 100);

                    await battlelogChannel.setName(`battles-${victories}w-${losses}l-${winRate}wr`);
                } catch (error) {
                    console.error('Error updating battle log channel:', error);
                }
            }

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Guild Settings Updated')
                .setColor(Colors.Green)
                .addFields(
                    { name: 'Guild ID', value: guildId || 'Not set', inline: true },
                    { name: 'Guild Name', value: guildName || 'Not set', inline: true },
                    { name: 'Prefix', value: prefix || settings?.commandPrefix || '!albiongw', inline: true },
                    { name: 'Verified Role', value: verifiedRole?.toString() || 'Not set', inline: true },
                    { name: 'Tank Role', value: tankRole?.toString() || 'Not set', inline: true },
                    { name: 'Healer Role', value: healerRole?.toString() || 'Not set', inline: true },
                    { name: 'Support Role', value: supportRole?.toString() || 'Not set', inline: true },
                    { name: 'Melee Role', value: meleeRole?.toString() || 'Not set', inline: true },
                    { name: 'Ranged Role', value: rangedRole?.toString() || 'Not set', inline: true },
                    { name: 'Mount Role', value: mountRole?.toString() || 'Not set', inline: true },
                    { name: 'Battle Log Webhook', value: battlelogWebhook ? 'Set ✅' : 'Not set', inline: true },
                    { name: 'Battle Log Channel', value: battlelogChannel?.toString() || 'Not set', inline: true }
                )
                .setTimestamp();

            if (isSlash) {
                await message.editReply({ embeds: [successEmbed] });
            } else {
                await message.reply({ embeds: [successEmbed] });
            }
        } catch (error) {
            console.error('Error in setup command:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while updating guild settings.')
                .setColor(Colors.Red)
                .setTimestamp();

            if (isSlash) {
                await message.editReply({ embeds: [errorEmbed] });
            } else {
                await message.reply({ embeds: [errorEmbed] });
            }
        }
    }
});