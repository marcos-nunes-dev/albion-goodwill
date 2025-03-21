const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChannelType } = require('discord.js');

// Constants
const DEFAULT_BATTLELOG_CHANNEL = '🏆0-0🩸00🎯0';

module.exports = new Command({
    name: 'setupcreateroles',
    description: 'Create and configure all required roles for the bot',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 10,
    async execute(message, args, handler) {
        // Validate guild permissions
        if (!message.guild) {
            throw new Error('This command can only be used in a server.');
        }

        const isSlash = message.commandName === 'setupcreateroles';
        const guildId = message.guildId;
        const guild = message.guild;
        
        try {
            // Send warning and confirmation message
            const warningEmbed = new EmbedBuilder()
                .setTitle('⚠️ Role Creation Warning')
                .setDescription([
                    '**This command should only be used if:**',
                    '• This is a new server setup',
                    '• The required roles don\'t exist yet',
                    '• You want to create a fresh set of roles',
                    '',
                    '**The following will be created:**',
                    '',
                    '**Roles:**',
                    '• 🛡️ Tank',
                    '• 🏹 DPS Ranged',
                    '• ⚔️ DPS Melee',
                    '• 💚 Healer',
                    '• 💙 Support',
                    '• 🐎 Battlemount',
                    '• ✅ Verified',
                    '',
                    '**Channel:**',
                    `• 📜 #${DEFAULT_BATTLELOG_CHANNEL} (with webhook)`,
                    '',
                    '**Note:** If any of these already exist, new ones will be created alongside them.',
                    'Make sure this is what you want to do!'
                ].join('\n'))
                .setColor(Colors.Yellow)
                .setTimestamp();

            // Create confirm and cancel buttons
            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_roles')
                .setLabel('Create Roles')
                .setStyle(ButtonStyle.Success);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_roles')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);

            // Send the warning message with buttons
            const warningMessage = await message.reply({
                embeds: [warningEmbed],
                components: [row],
                fetchReply: true
            });

            // Create a button interaction collector
            const collector = warningMessage.createMessageComponentCollector({
                filter: i => i.user.id === message.member.id,
                time: 60000, // 1 minute timeout
                max: 1
            });

            collector.on('collect', async interaction => {
                if (interaction.customId === 'cancel_roles') {
                    const cancelEmbed = new EmbedBuilder()
                        .setTitle('❌ Operation Cancelled')
                        .setDescription('Role creation cancelled.')
                        .setColor(Colors.Red)
                        .setTimestamp();

                    await interaction.update({
                        embeds: [cancelEmbed],
                        components: []
                    });
                    return;
                }

                if (interaction.customId === 'confirm_roles') {
                    // Update the message to show we're creating roles
                    const initialEmbed = new EmbedBuilder()
                        .setTitle('🛠️ Creating Roles')
                        .setDescription('Creating and configuring all required roles...')
                        .setColor(Colors.Blue)
                        .setTimestamp();

                    await interaction.update({
                        embeds: [initialEmbed],
                        components: []
                    });

                    // Define roles to create with their configurations
                    const rolesToCreate = [
                        {
                            name: '🛡️ Tank',
                            color: '#808080',
                            settingField: 'tankRoleId',
                            reason: 'Albion Online Tank role'
                        },
                        {
                            name: '🏹 DPS Ranged',
                            color: '#FF0000',
                            settingField: 'dpsRangedRoleId',
                            reason: 'Albion Online Ranged DPS role'
                        },
                        {
                            name: '⚔️ DPS Melee',
                            color: '#FFA500',
                            settingField: 'dpsMeleeRoleId',
                            reason: 'Albion Online Melee DPS role'
                        },
                        {
                            name: '💚 Healer',
                            color: '#00FF00',
                            settingField: 'healerRoleId',
                            reason: 'Albion Online Healer role'
                        },
                        {
                            name: '💙 Support',
                            color: '#0000FF',
                            settingField: 'supportRoleId',
                            reason: 'Albion Online Support role'
                        },
                        {
                            name: '🐎 Battlemount',
                            color: '#800080',
                            settingField: 'battlemountRoleId',
                            reason: 'Albion Online Battlemount role'
                        },
                        {
                            name: '✅ Verified',
                            color: '#32CD32',
                            settingField: 'nicknameVerifiedId',
                            reason: 'Albion Online Verified Member role'
                        }
                    ];

                    // Create battlelog channel first
                    let battlelogChannel;
                    try {
                        battlelogChannel = await interaction.guild.channels.create({
                            name: DEFAULT_BATTLELOG_CHANNEL,
                            type: ChannelType.GuildText,
                            reason: 'Albion Goodwill battlelog channel',
                            position: 0 // This will attempt to place it at the top
                        });

                        // Create webhook for the battlelog channel
                        const webhook = await battlelogChannel.createWebhook({
                            name: 'Albion Goodwill',
                            reason: 'Webhook for battle logs'
                        });

                        // Update database with webhook URL and channel ID
                        await prisma.guildSettings.upsert({
                            where: { guildId: interaction.guild.id },
                            update: {
                                guildName: interaction.guild.name,
                                battlelogWebhook: webhook.url,
                                battlelogChannelId: battlelogChannel.id,
                                commandPrefix: '!albiongw',
                                syncAlbionNickname: false
                            },
                            create: {
                                guildId: interaction.guild.id,
                                guildName: interaction.guild.name,
                                battlelogWebhook: webhook.url,
                                battlelogChannelId: battlelogChannel.id,
                                commandPrefix: '!albiongw',
                                syncAlbionNickname: false,
                                competitorIds: []
                            }
                        });
                    } catch (error) {
                        console.error('Error creating battlelog channel or webhook:', error);
                    }

                    const createdRoles = [];
                    const createdRoleObjects = [];
                    const errors = [];

                    // Create roles and update settings
                    for (const roleConfig of rolesToCreate) {
                        try {
                            const role = await guild.roles.create({
                                name: roleConfig.name,
                                color: roleConfig.color,
                                reason: roleConfig.reason,
                                permissions: []
                            });

                            await prisma.guildSettings.upsert({
                                where: { guildId: guildId },
                                update: {
                                    [roleConfig.settingField]: role.id,
                                    guildName: guild.name
                                },
                                create: {
                                    guildId: guildId,
                                    guildName: guild.name,
                                    [roleConfig.settingField]: role.id,
                                    commandPrefix: '!albiongw',
                                    syncAlbionNickname: false,
                                    competitorIds: []
                                }
                            });

                            createdRoles.push(roleConfig.name);
                            createdRoleObjects.push(role);
                        } catch (error) {
                            console.error(`Error creating role ${roleConfig.name}:`, error);
                            errors.push(roleConfig.name);
                        }
                    }

                    // No need for this update as we're already using upsert for each role

                    // Create response embed
                    const setupEmbed = new EmbedBuilder()
                        .setTitle(errors.length === 0 ? '✅ Roles Created Successfully' : '⚠️ Roles Creation Complete')
                        .setColor(errors.length === 0 ? Colors.Green : Colors.Yellow)
                        .setTimestamp();



                    if (createdRoles.length > 0) {
                        setupEmbed.addFields({
                            name: '✅ Created Roles',
                            value: createdRoles.map((roleName, index) => {
                                const roleId = createdRoleObjects[index]?.id;
                                return roleId ? `• <@&${roleId}> (${roleName})` : `• ${roleName}`;
                            }).join('\n')
                        });
                    }

                    if (errors.length > 0) {
                        setupEmbed.addFields({
                            name: '❌ Failed to Create',
                            value: errors.map(role => `• ${role}`).join('\n')
                        });
                    }

                    setupEmbed.addFields(
                        {
                            name: '📜 Battlelog Setup',
                            value: battlelogChannel 
                                ? `✅ Channel ${battlelogChannel} created with webhook successfully!` 
                                : '❌ Failed to create channel and webhook'
                        },
                        {
                            name: '📋 Next Steps',
                            value: [
                                '1. Use `/setup` to set your Albion guild ID (must have so the battleboard channel can works)',
                                '2. Use `/competitors add` to add competitor guilds',
                                '3. Organize the role hierarchy as needed',
                            ].join('\n')
                        }
                    );

                    await interaction.editReply({ embeds: [setupEmbed] });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('⏰ Timed Out')
                        .setDescription('Role creation cancelled due to timeout.')
                        .setColor(Colors.Red)
                        .setTimestamp();

                    warningMessage.edit({
                        embeds: [timeoutEmbed],
                        components: []
                    });
                }
            });

        } catch (error) {
            console.error('Error in setupcreateroles command:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`An error occurred while setting up the server:\n\`\`\`\n${error.message}\n\`\`\`\nPlease try again or contact support if the issue persists.`)
                .setColor(Colors.Red)
                .setTimestamp();

            const replyMethod = isSlash ? message.editReply : message.reply;
            await replyMethod.call(message, { embeds: [errorEmbed] });
        }
    }
}); 