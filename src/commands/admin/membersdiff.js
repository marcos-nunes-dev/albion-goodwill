const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');

const ITEMS_PER_PAGE = 10;

module.exports = new Command({
    name: 'membersdiff',
    description: 'Compare members in a role with a list from a text file',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    options: [
        {
            name: 'members_role',
            description: 'The role to check members against',
            type: 8,
            required: true
        },
        {
            name: 'members_file',
            description: 'Text file containing member list',
            type: 11,
            required: true
        }
    ],
    async execute(message, args, isSlash = false) {
        try {
            // For slash commands, defer the reply immediately
            if (isSlash) {
                await message.deferReply({ ephemeral: true });
            }

            // Get role based on command type
            const role = isSlash ? 
                message.options.getRole('members_role') : 
                message.mentions.roles.first();

            if (!role) {
                const errorMessage = '❌ Please specify a valid role.';
                if (isSlash) {
                    await message.editReply(errorMessage);
                } else {
                    await message.reply(errorMessage);
                }
                return;
            }

            // Get file attachment
            const attachment = isSlash ?
                message.options.getAttachment('members_file') :
                message.attachments.first();

            if (!attachment || !attachment.url) {
                const errorMessage = '❌ Please provide a valid text file.';
                if (isSlash) {
                    await message.editReply(errorMessage);
                } else {
                    await message.reply(errorMessage);
                }
                return;
            }

            // Fetch and parse file content
            const fileResponse = await fetch(attachment.url);
            const fileContent = await fileResponse.text();
            
            // Parse member names from file
            const fileMembers = fileContent
                .split('\n')
                .slice(1)  // Skip the first line (header)
                .map(line => {
                    const match = line.match(/"([^"]+)"/);
                    return match ? match[1] : null;
                })
                .filter(Boolean);

            if (!fileMembers.length) {
                const errorMessage = '❌ No valid member names found in the file.';
                if (isSlash) {
                    await message.editReply(errorMessage);
                } else {
                    await message.reply(errorMessage);
                }
                return;
            }

            // Get all registered players for the role members
            const registeredPlayers = await prisma.playerRegistration.findMany({
                where: {
                    userId: {
                        in: [...role.members.keys()]
                    }
                }
            });

            // Find members to remove (in role but not in file)
            const membersToRemove = role.members.filter(member => {
                const playerReg = registeredPlayers.find(reg => reg.userId === member.id);
                return playerReg && !fileMembers.includes(playerReg.playerName);
            });

            // Find members without registration (in file but not registered to any role member)
            const roleMemberIds = new Set([...role.members.keys()]);
            const registeredNames = new Set(
                registeredPlayers
                    .filter(reg => roleMemberIds.has(reg.userId))
                    .map(reg => reg.playerName)
            );
            const membersWithoutReg = fileMembers.filter(name => !registeredNames.has(name));

            // Find members without role (registered but don't have the role)
            const membersWithoutRole = await prisma.playerRegistration.findMany({
                where: {
                    playerName: {
                        in: fileMembers
                    },
                    userId: {
                        notIn: [...roleMemberIds]
                    },
                    guildId: message.guild.id
                },
                include: {
                    user: true
                }
            });

            // Setup pagination
            const totalPagesRemove = Math.ceil(membersToRemove.size / ITEMS_PER_PAGE);
            const totalPagesUnreg = Math.ceil(membersWithoutReg.length / ITEMS_PER_PAGE);
            const totalPagesNoRole = Math.ceil(membersWithoutRole.length / ITEMS_PER_PAGE);
            let currentPage = 0;
            let currentList = 'remove'; // 'remove' or 'unreg' or 'norole'

            // Create page embed
            const getPageEmbed = (page, listType) => {
                let items, title, color, formatItem;
                
                switch(listType) {
                    case 'remove':
                        items = Array.from(membersToRemove.values());
                        title = '🔄 Members to Remove';
                        color = 0xFF4444;
                        formatItem = (member) => {
                            const reg = registeredPlayers.find(r => r.userId === member.id);
                            return `<@${member.id}> (${reg?.playerName || 'Unknown'})`;
                        };
                        break;
                    case 'unreg':
                        items = membersWithoutReg;
                        title = '⚠️ Members Without Registration';
                        color = 0xFFAA00;
                        formatItem = (name) => name;
                        break;
                    case 'norole':
                        items = membersWithoutRole;
                        title = '👥 Registered Members Without Role';
                        color = 0x00AAFF;
                        formatItem = (reg) => `${reg.playerName} (<@${reg.userId}>)`;
                        break;
                }

                const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
                const start = page * ITEMS_PER_PAGE;
                const end = Math.min(start + ITEMS_PER_PAGE, items.length);
                const pageItems = items.slice(start, end);

                return new EmbedBuilder()
                    .setTitle(title)
                    .setColor(color)
                    .setDescription(pageItems.map(formatItem).join('\n') || 'No members found.')
                    .setFooter({ 
                        text: `Page ${page + 1}/${totalPages} • ` +
                              `To remove: ${membersToRemove.size} • ` +
                              `Without registration: ${membersWithoutReg.length} • ` +
                              `Without role: ${membersWithoutRole.length}`
                    })
                    .setTimestamp();
            };

            // Create navigation buttons
            const getButtons = (page, listType) => {
                let items;
                switch(listType) {
                    case 'remove':
                        items = Array.from(membersToRemove.values());
                        break;
                    case 'unreg':
                        items = membersWithoutReg;
                        break;
                    case 'norole':
                        items = membersWithoutRole;
                        break;
                }
                
                const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
                
                const navigationButtons = new ActionRowBuilder().addComponents([
                    new ButtonBuilder()
                        .setCustomId('first')
                        .setLabel('⏪ First')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId('last')
                        .setLabel('Last ⏩')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId('toggle')
                        .setLabel(
                            listType === 'remove' ? 'Show Unregistered' :
                            listType === 'unreg' ? 'Show Without Role' :
                            'Show To Remove'
                        )
                        .setStyle(ButtonStyle.Secondary)
                ]);

                const components = [navigationButtons];

                // Add remove permissions button in a separate row when showing remove list
                if (listType === 'remove' && membersToRemove.size > 0) {
                    const actionButtons = new ActionRowBuilder().addComponents([
                        new ButtonBuilder()
                            .setCustomId('remove_permissions')
                            .setLabel('Remove Permissions')
                            .setStyle(ButtonStyle.Danger)
                    ]);
                    components.push(actionButtons);
                }

                return components;
            };

            // Send initial message
            const initialEmbed = getPageEmbed(0, 'remove');
            const initialButtons = getButtons(0, 'remove');
            
            const response = await (isSlash ? 
                message.editReply({ embeds: [initialEmbed], components: initialButtons }) :
                message.reply({ embeds: [initialEmbed], components: initialButtons })
            );

            // Create button collector
            const collector = response.createMessageComponentCollector({
                time: 300000 // 5 minutes
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

                try {
                    const totalPages = Math.max(1, Math.ceil((currentList === 'remove' ? membersToRemove.size : currentList === 'unreg' ? membersWithoutReg.length : membersWithoutRole.length) / ITEMS_PER_PAGE));

                    // Handle button clicks
                    switch (interaction.customId) {
                        case 'remove_permissions':
                            try {
                                await interaction.deferUpdate();
                                let removed = 0;
                                let items;
                                switch (currentList) {
                                    case 'remove':
                                        items = Array.from(membersToRemove.values());
                                        break;
                                    case 'unreg':
                                        items = membersWithoutReg;
                                        break;
                                    case 'norole':
                                        items = membersWithoutRole;
                                        break;
                                }
                                for (const item of items) {
                                    try {
                                        if (currentList === 'remove') {
                                            const member = item;
                                            const playerReg = registeredPlayers.find(reg => reg.userId === member.id);
                                            if (playerReg) {
                                                await member.roles.remove(role);
                                                removed++;
                                            }
                                        } else if (currentList === 'unreg') {
                                            const name = item;
                                            const playerReg = registeredPlayers.find(reg => reg.playerName === name);
                                            if (playerReg) {
                                                await member.roles.remove(role);
                                                removed++;
                                            }
                                        } else if (currentList === 'norole') {
                                            const reg = item;
                                            const playerReg = registeredPlayers.find(r => r.playerName === reg.playerName && r.userId === reg.userId);
                                            if (playerReg) {
                                                await member.roles.remove(role);
                                                removed++;
                                            }
                                        }
                                    } catch (error) {
                                        console.error(`Failed to remove role from ${item.id || item.playerName}:`, error);
                                    }
                                }
                                
                                await interaction.followUp({
                                    content: `✅ Removed role from ${removed} members.`,
                                    ephemeral: true
                                });

                                // Update the embed to reflect changes
                                await interaction.editReply({
                                    embeds: [getPageEmbed(currentPage, currentList)],
                                    components: getButtons(currentPage, currentList)
                                });
                            } catch (error) {
                                console.error('Error removing permissions:', error);
                                await interaction.followUp({
                                    content: '❌ Error removing permissions.',
                                    ephemeral: true
                                });
                            }
                            break;

                        case 'toggle':
                            currentList = currentList === 'remove' ? 'unreg' : 
                                        currentList === 'unreg' ? 'norole' : 'remove';
                            currentPage = 0;
                            await interaction.update({
                                embeds: [getPageEmbed(currentPage, currentList)],
                                components: getButtons(currentPage, currentList)
                            });
                            break;
                        case 'first':
                            currentPage = 0;
                            await interaction.update({
                                embeds: [getPageEmbed(currentPage, currentList)],
                                components: getButtons(currentPage, currentList)
                            });
                            break;
                        case 'prev':
                            currentPage = Math.max(0, currentPage - 1);
                            await interaction.update({
                                embeds: [getPageEmbed(currentPage, currentList)],
                                components: getButtons(currentPage, currentList)
                            });
                            break;
                        case 'next':
                            currentPage = Math.min(totalPages - 1, currentPage + 1);
                            await interaction.update({
                                embeds: [getPageEmbed(currentPage, currentList)],
                                components: getButtons(currentPage, currentList)
                            });
                            break;
                        case 'last':
                            currentPage = totalPages - 1;
                            await interaction.update({
                                embeds: [getPageEmbed(currentPage, currentList)],
                                components: getButtons(currentPage, currentList)
                            });
                            break;
                    }
                } catch (error) {
                    console.error('Error handling button interaction:', error);
                    await interaction.reply({
                        content: 'An error occurred while updating the page.',
                        ephemeral: true
                    });
                }
            });

            // Remove buttons when collector expires
            collector.on('end', () => {
                if (isSlash) {
                    message.editReply({ components: [] }).catch(() => {});
                } else {
                    response.edit({ components: [] }).catch(() => {});
                }
            });

        } catch (error) {
            console.error('Error in membersdiff command:', error);
            const errorMessage = 'An error occurred while comparing members.';
            
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