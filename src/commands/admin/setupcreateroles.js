const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChannelType } = require('discord.js');
const { calculateBattleStats, updateBattleLogChannelName } = require('../../utils/battleStats');

module.exports = new Command({
    name: 'setupcreateroles',
    description: 'Create and configure all required roles for the bot',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 10,
    async execute(message, args, handler) {
        const isSlash = message.commandName === 'setupcreateroles';
        
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
                    '**The following roles will be created:**',
                    '• 🛡️ Tank',
                    '• 🏹 DPS Ranged',
                    '• ⚔️ DPS Melee',
                    '• 💚 Healer',
                    '• 💙 Support',
                    '• 🐎 Battlemount',
                    '• ✅ Verified',
                    '',
                    '**The following channel will be created:**',
                    '• 📜 battle-logs',
                    '',
                    '**Note:** If these roles/channels already exist, new ones will be created alongside them.',
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
                time: 30000,
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

                    const createdRoles = [];
                    const errors = [];

                    // Create roles and update settings
                    for (const roleConfig of rolesToCreate) {
                        try {
                            const role = await message.guild.roles.create({
                                name: roleConfig.name,
                                color: roleConfig.color,
                                reason: roleConfig.reason,
                                permissions: []
                            });

                            await prisma.guildSettings.upsert({
                                where: { guildId: message.guildId },
                                update: {
                                    [roleConfig.settingField]: role.id,
                                    guildName: message.guild.name
                                },
                                create: {
                                    guildId: message.guildId,
                                    guildName: message.guild.name,
                                    [roleConfig.settingField]: role.id
                                }
                            });

                            createdRoles.push(roleConfig.name);
                        } catch (error) {
                            console.error(`Error creating role ${roleConfig.name}:`, error);
                            errors.push(roleConfig.name);
                        }
                    }

                    // Create battle logs channel
                    try {
                        const stats = await calculateBattleStats(message.guildId);
                        const channel = await message.guild.channels.create({
                            name: 'battle-logs',
                            type: ChannelType.GuildText,
                            topic: 'Automatic battle logs from Albion Online',
                            reason: 'Albion Online battle logs channel',
                            permissionOverwrites: [
                                {
                                    id: message.guild.roles.everyone.id,
                                    deny: [PermissionFlagsBits.SendMessages],
                                    allow: [PermissionFlagsBits.ViewChannel]
                                },
                                {
                                    id: message.client.user.id,
                                    allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel]
                                }
                            ]
                        });

                        // Send welcome message
                        const welcomeEmbed = new EmbedBuilder()
                            .setTitle('📜 Battle Logs Channel')
                            .setDescription('This channel will keep track of all registered battles.\nThe channel name will be automatically updated with current W/L and K/D stats.')
                            .setColor(Colors.Blue)
                            .setTimestamp();

                        await channel.send({ embeds: [welcomeEmbed] });

                        await prisma.guildSettings.update({
                            where: { guildId: message.guildId },
                            data: {
                                battlelogChannelId: channel.id
                            }
                        });

                        // Update the channel name immediately with current stats
                        await updateBattleLogChannelName(message.guild, channel.id);
                        createdRoles.push(`📜 Battle Logs Channel`);
                    } catch (error) {
                        console.error('Error creating battle-logs channel:', error);
                        errors.push('📜 Battle Logs Channel');
                    }

                    // Create final response embed
                    const finalEmbed = new EmbedBuilder()
                        .setTitle(errors.length === 0 ? '✅ Roles Created Successfully' : '⚠️ Roles Creation Complete')
                        .setColor(errors.length === 0 ? Colors.Green : Colors.Yellow)
                        .setTimestamp();

                    if (createdRoles.length > 0) {
                        finalEmbed.addFields({
                            name: '✅ Created Roles',
                            value: createdRoles.map(role => `• ${role}`).join('\n')
                        });
                    }

                    if (errors.length > 0) {
                        finalEmbed.addFields({
                            name: '❌ Failed to Create',
                            value: errors.map(role => `• ${role}`).join('\n')
                        });
                    }

                    finalEmbed.addFields({
                        name: 'Next Steps',
                        value: [
                            '1. Use `/setguildid` to set your Albion guild ID',
                            '2. Use `/competitors add` to add competitor guilds',
                            '3. Organize the role hierarchy as needed'
                        ].join('\n')
                    });

                    await interaction.editReply({ embeds: [finalEmbed] });
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
                .setDescription('An error occurred while creating roles.')
                .setColor(Colors.Red)
                .setTimestamp();

            await message.reply({ embeds: [errorEmbed] });
        }
    }
}); 