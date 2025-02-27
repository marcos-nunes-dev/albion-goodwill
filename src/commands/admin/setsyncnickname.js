const { EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');

async function updateNicknamePermissions(guild, enabled) {
    try {
        // Get @everyone role
        const everyoneRole = guild.roles.everyone;

        // Update the permission
        await everyoneRole.setPermissions(
            enabled ? 
                everyoneRole.permissions.remove('ChangeNickname') :
                everyoneRole.permissions.add('ChangeNickname')
        );

        return true;
    } catch (error) {
        console.error('Error updating nickname permissions:', error);
        return false;
    }
}

module.exports = new Command({
    name: 'setsyncnickname',
    description: 'Enable/disable automatic Albion nickname synchronization',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    options: [
        {
            name: 'enabled',
            description: 'Enable or disable nickname sync',
            type: 5, // Boolean type
            required: true
        }
    ],
    async execute(message, args, isSlash = false) {
        try {
            if (isSlash) {
                await message.deferReply({ ephemeral: true });
            }

            const enabled = isSlash ? 
                message.options.getBoolean('enabled') : 
                args[0]?.toLowerCase() === 'true';

            // Update the setting
            await prisma.guildSettings.update({
                where: {
                    guildId: message.guildId
                },
                data: {
                    syncAlbionNickname: enabled
                }
            });

            // Update nickname permissions
            const permissionsUpdated = await updateNicknamePermissions(message.guild, enabled);

            const embed = new EmbedBuilder()
                .setTitle('✅ Nickname Sync Setting Updated')
                .setDescription(`Albion nickname synchronization is now ${enabled ? 'enabled' : 'disabled'}.`)
                .setColor(enabled ? 0x00FF00 : 0xFF0000)
                .addFields([
                    {
                        name: 'What this means',
                        value: enabled ? 
                            'Members\' Discord nicknames will automatically sync with their registered Albion character names.' :
                            'Members\' Discord nicknames will not be automatically changed.'
                    },
                    {
                        name: 'Permissions',
                        value: permissionsUpdated ?
                            `Members can ${enabled ? 'no longer' : 'now'} change their own nicknames.` :
                            '⚠️ Failed to update nickname permissions. Please check bot permissions.'
                    }
                ])
                .setTimestamp();

            // If enabling, add prompt for bulk sync
            let components = [];
            if (enabled) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('sync_now')
                        .setLabel('Sync All Nicknames Now')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('skip_sync')
                        .setLabel('Skip')
                        .setStyle(ButtonStyle.Secondary)
                );
                components.push(row);
            }

            const response = await (isSlash ? 
                message.editReply({ embeds: [embed], components }) :
                message.reply({ embeds: [embed], components }));

            if (enabled) {
                // Create collector for the buttons
                const collector = response.createMessageComponentCollector({
                    time: 30000 // 30 seconds
                });

                collector.on('collect', async (interaction) => {
                    // Check if the interaction is from the command user
                    if (interaction.user.id !== (isSlash ? message.user.id : message.author.id)) {
                        await interaction.reply({
                            content: 'Only the command user can use these buttons.',
                            ephemeral: true
                        });
                        return;
                    }

                    if (interaction.customId === 'sync_now') {
                        await interaction.deferUpdate();

                        try {
                            // Get all registered players for this guild
                            const registrations = await prisma.playerRegistration.findMany({
                                where: {
                                    guildId: message.guildId
                                }
                            });

                            let succeeded = 0;
                            let failed = 0;
                            const errors = [];

                            // Update nicknames
                            for (const reg of registrations) {
                                try {
                                    const member = await message.guild.members.fetch(reg.userId);
                                    if (member) {
                                        await member.setNickname(reg.playerName);
                                        succeeded++;
                                    }
                                } catch (error) {
                                    failed++;
                                    errors.push(`${reg.playerName}: ${error.message}`);
                                }
                            }

                            // Create result embed
                            const resultEmbed = new EmbedBuilder()
                                .setTitle('Nickname Sync Results')
                                .setDescription([
                                    `✅ Successfully updated: ${succeeded}`,
                                    `❌ Failed to update: ${failed}`,
                                    failed > 0 ? '\nErrors:' : '',
                                    ...errors.slice(0, 10),
                                    errors.length > 10 ? `...and ${errors.length - 10} more errors` : ''
                                ].join('\n'))
                                .setColor(failed > 0 ? 0xFFAA00 : 0x00FF00)
                                .setTimestamp();

                            await interaction.editReply({
                                embeds: [embed, resultEmbed],
                                components: []
                            });
                        } catch (error) {
                            console.error('Error syncing nicknames:', error);
                            await interaction.editReply({
                                embeds: [embed, new EmbedBuilder()
                                    .setTitle('❌ Error')
                                    .setDescription('An error occurred while syncing nicknames.')
                                    .setColor(0xFF0000)],
                                components: []
                            });
                        }
                    } else if (interaction.customId === 'skip_sync') {
                        await interaction.update({
                            embeds: [embed],
                            components: []
                        });
                    }
                });

                // Remove buttons when collector expires
                collector.on('end', () => {
                    if (isSlash) {
                        message.editReply({ embeds: [embed], components: [] }).catch(() => {});
                    } else {
                        response.edit({ embeds: [embed], components: [] }).catch(() => {});
                    }
                });
            }

        } catch (error) {
            console.error('Error in setsyncnickname command:', error);
            const errorMessage = 'An error occurred while updating the nickname sync setting.';
            
            if (isSlash) {
                try {
                    await message.editReply(errorMessage);
                } catch {
                    await message.reply({ content: errorMessage, ephemeral: true });
                }
            } else {
                await message.reply(errorMessage);
            }
        }
    }
}); 