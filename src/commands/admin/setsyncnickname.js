const { EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');

// Batch size for processing members
const BATCH_SIZE = 50;
const COLLECTOR_TIMEOUT = 600000; // 10 minutes

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

async function processMemberBatch(members, registrationMap, interaction, progress) {
    const results = {
        succeeded: 0,
        failed: 0,
        errors: []
    };

    for (const member of members) {
        try {
            const registration = registrationMap.get(member.id);
            if (registration) {
                await member.setNickname(registration.playerName);
                results.succeeded++;
            }
        } catch (error) {
            results.failed++;
            results.errors.push(`${member.user.tag}: ${error.message}`);
        }

        // Update progress every 10 members
        if ((results.succeeded + results.failed) % 10 === 0) {
            const progressEmbed = new EmbedBuilder()
                .setTitle('Syncing Nicknames - In Progress')
                .setDescription(`Progress: ${progress.current}/${progress.total} members processed\n` +
                    `✅ Success: ${progress.succeeded + results.succeeded}\n` +
                    `❌ Failed: ${progress.failed + results.failed}`)
                .setColor(0xFFAA00)
                .setTimestamp();

            await interaction.editReply({
                embeds: [progressEmbed]
            });
        }
    }

    return results;
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
                    time: COLLECTOR_TIMEOUT // 10 minutes
                });

                collector.on('collect', async (interaction) => {
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

                            // Create a map for faster lookups
                            const registrationMap = new Map(
                                registrations.map(reg => [reg.userId, reg])
                            );

                            // Fetch all guild members
                            await message.guild.members.fetch();
                            const allMembers = Array.from(message.guild.members.cache.values());
                            const totalMembers = allMembers.length;

                            const progress = {
                                current: 0,
                                total: totalMembers,
                                succeeded: 0,
                                failed: 0,
                                errors: []
                            };

                            // Initial progress message
                            const progressEmbed = new EmbedBuilder()
                                .setTitle('Starting Nickname Sync')
                                .setDescription(`Preparing to process ${totalMembers} members...`)
                                .setColor(0xFFAA00)
                                .setTimestamp();

                            await interaction.editReply({ embeds: [progressEmbed] });

                            // Process members in batches
                            for (let i = 0; i < allMembers.length; i += BATCH_SIZE) {
                                const batch = allMembers.slice(i, i + BATCH_SIZE);
                                const batchResults = await processMemberBatch(
                                    batch,
                                    registrationMap,
                                    interaction,
                                    progress
                                );

                                progress.current += batch.length;
                                progress.succeeded += batchResults.succeeded;
                                progress.failed += batchResults.failed;
                                progress.errors.push(...batchResults.errors);
                            }

                            // Create final result embed
                            const resultEmbed = new EmbedBuilder()
                                .setTitle('Nickname Sync Complete')
                                .setDescription([
                                    `✅ Successfully updated: ${progress.succeeded}`,
                                    `❌ Failed to update: ${progress.failed}`,
                                    `📊 Total processed: ${progress.current}`,
                                    progress.errors.length > 0 ? '\nLast 10 Errors:' : '',
                                    ...progress.errors.slice(-10)
                                ].join('\n'))
                                .setColor(progress.failed > 0 ? 0xFFAA00 : 0x00FF00)
                                .setTimestamp();

                            await interaction.editReply({
                                embeds: [resultEmbed],
                                components: []
                            });

                            // If there are many errors, create an error log
                            if (progress.errors.length > 10) {
                                const errorLog = progress.errors.join('\n');
                                await interaction.followUp({
                                    content: 'Complete error log:',
                                    files: [{
                                        name: 'error_log.txt',
                                        attachment: Buffer.from(errorLog, 'utf8')
                                    }],
                                    ephemeral: true
                                });
                            }

                        } catch (error) {
                            console.error('Error syncing nicknames:', error);
                            await interaction.editReply({
                                embeds: [new EmbedBuilder()
                                    .setTitle('❌ Error')
                                    .setDescription('An error occurred while syncing nicknames: ' + error.message)
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

                // Increase collector timeout for large servers
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