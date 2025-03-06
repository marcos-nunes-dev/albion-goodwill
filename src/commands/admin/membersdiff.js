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

            // Get all registered players for the guild
            const allGuildRegistrations = await prisma.playerRegistration.findMany({
                where: {
                    guildId: message.guild.id
                }
            });

            // Find members without role (registered but don't have the role)
            const membersWithoutRole = allGuildRegistrations.filter(reg => {
                // Check if the player is in the file (guild list)
                const isInFile = fileMembers.includes(reg.playerName);
                
                // Check if the user has the role
                const member = message.guild.members.cache.get(reg.userId);
                const hasRole = member && member.roles.cache.has(role.id);
                
                console.log(`Player: ${reg.playerName}`);
                console.log(`User ID: ${reg.userId}`);
                console.log(`Is in file: ${isInFile}`);
                console.log(`Has role: ${hasRole}`);
                console.log('---');
                
                // We want players who are in the file but don't have the role
                return isInFile && !hasRole;
            });

            // Setup pagination
            const totalPagesNoRole = Math.ceil(membersWithoutRole.length / ITEMS_PER_PAGE);
            let currentPage = 0;

            // Create page embed
            const getPageEmbed = (page) => {
                const totalPages = Math.max(1, Math.ceil(membersWithoutRole.length / ITEMS_PER_PAGE));
                const start = page * ITEMS_PER_PAGE;
                const end = Math.min(start + ITEMS_PER_PAGE, membersWithoutRole.length);
                const pageItems = membersWithoutRole.slice(start, end);

                return new EmbedBuilder()
                    .setTitle('👥 Registered Members Without Role')
                    .setColor(0x00AAFF)
                    .setDescription(pageItems.map(reg => `${reg.playerName} (<@${reg.userId}>)`).join('\n') || 'No members found.')
                    .setFooter({ 
                        text: `Page ${page + 1}/${totalPages} • ` +
                              `Total members without role: ${membersWithoutRole.length}`
                    })
                    .setTimestamp();
            };

            // Create navigation buttons
            const getButtons = (page) => {
                const totalPages = Math.max(1, Math.ceil(membersWithoutRole.length / ITEMS_PER_PAGE));
                
                return [new ActionRowBuilder().addComponents([
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
                        .setDisabled(page === totalPages - 1)
                ])];
            };

            // Send initial message
            const initialEmbed = getPageEmbed(0);
            const initialButtons = getButtons(0);
            
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
                    const totalPages = Math.max(1, Math.ceil(membersWithoutRole.length / ITEMS_PER_PAGE));

                    // Handle button clicks
                    switch (interaction.customId) {
                        case 'first':
                            currentPage = 0;
                            await interaction.update({
                                embeds: [getPageEmbed(currentPage)],
                                components: getButtons(currentPage)
                            });
                            break;
                        case 'prev':
                            currentPage = Math.max(0, currentPage - 1);
                            await interaction.update({
                                embeds: [getPageEmbed(currentPage)],
                                components: getButtons(currentPage)
                            });
                            break;
                        case 'next':
                            currentPage = Math.min(totalPages - 1, currentPage + 1);
                            await interaction.update({
                                embeds: [getPageEmbed(currentPage)],
                                components: getButtons(currentPage)
                            });
                            break;
                        case 'last':
                            currentPage = totalPages - 1;
                            await interaction.update({
                                embeds: [getPageEmbed(currentPage)],
                                components: getButtons(currentPage)
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