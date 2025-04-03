const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');

const ITEMS_PER_PAGE = 10;

module.exports = new Command({
    name: 'attendancekick',
    description: 'Identify members with low attendance based on a threshold or guild average',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    options: [
        {
            name: 'members_file',
            description: 'Text file containing member list',
            type: 11,
            required: true
        },
        {
            name: 'threshold',
            description: 'Minimum attendance threshold (optional)',
            type: 4,
            required: false
        }
    ],
    async execute(message, args, isSlash = false) {
        try {
            // For slash commands, defer the reply immediately
            if (isSlash) {
                await message.deferReply({ ephemeral: true });
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

            // Get threshold if provided
            const threshold = isSlash ? 
                message.options.getInteger('threshold') : 
                parseInt(args[0]);

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

            // Get guild settings
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guildId }
            });

            if (!settings || !settings.albionGuildId) {
                const errorMessage = '❌ Guild settings not configured. Please use `/setguild` first.';
                if (isSlash) {
                    await message.editReply(errorMessage);
                } else {
                    await message.reply(errorMessage);
                }
                return;
            }

            // Calculate date range (last 30 days)
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);

            // Format dates for API
            const formatDate = (date) => {
                return date.toISOString().split('T')[0];
            };

            // Fetch attendance data from Albion API
            const apiUrl = `https://api.albionbb.com/us/stats/guilds/${settings.albionGuildId}?minPlayers=15&start=${formatDate(startDate)}&end=${formatDate(endDate)}`;
            const apiResponse = await fetch(apiUrl);
            const apiData = await apiResponse.json();

            if (!apiData || !Array.isArray(apiData)) {
                const errorMessage = '❌ Failed to fetch attendance data from Albion API.';
                if (isSlash) {
                    await message.editReply(errorMessage);
                } else {
                    await message.reply(errorMessage);
                }
                return;
            }

            // Calculate average attendance if no threshold provided
            let attendanceThreshold = threshold;
            if (!attendanceThreshold) {
                const activePlayers = apiData.filter(player => player.attendance > 0);
                const averageAttendance = activePlayers.reduce((sum, player) => sum + player.attendance, 0) / activePlayers.length;
                attendanceThreshold = Math.floor(averageAttendance * 0.5); // 50% below average
            }

            // Find members with low participation
            const membersWithLowParticipation = fileMembers
                .map(name => {
                    const playerData = apiData.find(p => p.name.toLowerCase() === name.toLowerCase());
                    return {
                        name,
                        attendance: playerData ? playerData.attendance : 0,
                        lastBattle: playerData ? playerData.lastBattle : null
                    };
                })
                .filter(player => player.attendance < attendanceThreshold)
                .sort((a, b) => a.attendance - b.attendance);

            if (membersWithLowParticipation.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('✅ No Low Attendance Members')
                    .setDescription(`No members found with attendance below ${attendanceThreshold}.`)
                    .setColor(0x00FF00)
                    .setFooter({ text: `📅 ${formatDate(startDate)} → ${formatDate(endDate)}` })
                    .setTimestamp();

                if (isSlash) {
                    await message.editReply({ embeds: [embed] });
                } else {
                    await message.reply({ embeds: [embed] });
                }
                return;
            }

            // Setup pagination
            const totalPages = Math.ceil(membersWithLowParticipation.length / ITEMS_PER_PAGE);
            let currentPage = 0;

            // Create page embed
            const getPageEmbed = (page) => {
                const start = page * ITEMS_PER_PAGE;
                const end = Math.min(start + ITEMS_PER_PAGE, membersWithLowParticipation.length);
                const pagePlayers = membersWithLowParticipation.slice(start, end);

                const description = pagePlayers.map(player => {
                    return [
                        `**👤 ${player.name}**`,
                        `🎯 Attendance: ${player.attendance} (Threshold: ${attendanceThreshold})`,
                        `📅 Last Battle: ${player.lastBattle ? new Date(player.lastBattle).toLocaleDateString() : 'Never'}`
                    ].join('\n');
                }).join('\n\n');

                return new EmbedBuilder()
                    .setTitle('⚠️ Low Attendance Members')
                    .setColor(0xFF4444)
                    .setDescription(description)
                    .setFooter({ 
                        text: `📄 ${page + 1}/${totalPages} • 👥 ${membersWithLowParticipation.length} members below threshold • 📅 ${formatDate(startDate)} → ${formatDate(endDate)}`
                    })
                    .setTimestamp();
            };

            // Create navigation buttons
            const getButtons = (page) => {
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
                        .setDisabled(page === totalPages - 1)
                ]);

                const components = [navigationButtons];

                // Add kick permissions button in a separate row
                if (membersWithLowParticipation.length > 0) {
                    const actionButtons = new ActionRowBuilder().addComponents([
                        new ButtonBuilder()
                            .setCustomId('kick_permissions')
                            .setLabel('Remove Permissions')
                            .setStyle(ButtonStyle.Danger)
                    ]);
                    components.push(actionButtons);
                }

                return components;
            };

            // Send initial message
            const initialEmbed = getPageEmbed(0);
            const initialButtons = getButtons(0);
            
            const messageResponse = await (isSlash ? 
                message.editReply({ embeds: [initialEmbed], components: initialButtons }) :
                message.reply({ embeds: [initialEmbed], components: initialButtons })
            );

            // Create button collector
            const collector = messageResponse.createMessageComponentCollector({
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
                    switch (interaction.customId) {
                        case 'kick_permissions':
                            try {
                                await interaction.deferUpdate();
                                let removed = 0;
                                
                                // Get all members with low participation
                                const lowParticipationMembers = membersWithLowParticipation;
                                
                                // Get all registrations for the guild
                                const registrations = await prisma.playerRegistration.findMany({
                                    where: {
                                        guildId: message.guildId
                                    }
                                });

                                // Process each low participation member
                                for (const player of lowParticipationMembers) {
                                    const registration = registrations.find(reg => 
                                        reg.playerName.toLowerCase() === player.name.toLowerCase()
                                    );

                                    if (registration) {
                                        const member = await message.guild.members.fetch(registration.userId).catch(() => null);
                                        if (member) {
                                            // Remove all class roles
                                            const classRoles = await prisma.classRole.findMany({
                                                where: { guildId: message.guildId }
                                            });

                                            for (const role of classRoles) {
                                                if (member.roles.cache.has(role.roleId)) {
                                                    await member.roles.remove(role.roleId);
                                                }
                                            }

                                            // Remove verified role if exists
                                            if (settings.nicknameVerifiedId && member.roles.cache.has(settings.nicknameVerifiedId)) {
                                                await member.roles.remove(settings.nicknameVerifiedId);
                                            }

                                            removed++;
                                        }
                                    }
                                }
                                
                                await interaction.followUp({
                                    content: `✅ Removed permissions from ${removed} members with low attendance.`,
                                    ephemeral: true
                                });

                                // Update the embed to reflect changes
                                await interaction.editReply({
                                    embeds: [getPageEmbed(currentPage)],
                                    components: getButtons(currentPage)
                                });
                            } catch (error) {
                                console.error('Error removing permissions:', error);
                                await interaction.followUp({
                                    content: '❌ Error removing permissions.',
                                    ephemeral: true
                                });
                            }
                            break;

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
                    messageResponse.edit({ components: [] }).catch(() => {});
                }
            });

        } catch (error) {
            console.error('Error in attendancekick command:', error);
            const errorMessage = 'An error occurred while processing attendance data.';
            
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