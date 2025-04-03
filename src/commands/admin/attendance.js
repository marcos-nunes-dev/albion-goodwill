const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');

const ITEMS_PER_PAGE = 10;

module.exports = new Command({
    name: 'attendance',
    description: 'Show attendance statistics for the guild or a specific user',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    options: [
        {
            name: 'members_file',
            description: 'Text file containing member list',
            type: 11,
            required: true
        },
        {
            name: 'user',
            description: 'The user to check attendance for (optional)',
            type: 6,
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

            // Get user if specified
            const user = isSlash ? 
                message.options.getUser('user') : 
                message.mentions.users.first();

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

            // Format numbers to K/M format
            const formatNumber = (num) => {
                if (num >= 1000000) {
                    return (num / 1000000).toFixed(1) + 'M';
                }
                if (num >= 1000) {
                    return (num / 1000).toFixed(1) + 'K';
                }
                return num.toString();
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

            // Find members with no participation
            const membersWithNoParticipation = fileMembers.filter(name => 
                !apiData.some(player => player.name.toLowerCase() === name.toLowerCase())
            );

            // Combine API data with no participation members
            const allData = [
                ...apiData,
                ...membersWithNoParticipation.map(name => ({
                    name,
                    attendance: 0,
                    kills: 0,
                    deaths: 0,
                    killFame: 0,
                    deathFame: 0,
                    heal: 0,
                    damage: 0,
                    avgIp: 0,
                    lastBattle: null
                }))
            ];

            // If user is specified, find their registration
            let playerData = null;
            if (user) {
                const registration = await prisma.playerRegistration.findFirst({
                    where: {
                        userId: user.id,
                        guildId: message.guildId
                    }
                });

                if (registration) {
                    playerData = allData.find(p => 
                        p.name.toLowerCase() === registration.playerName.toLowerCase()
                    );
                }
            }

            // Create embed based on whether we're showing single user or all users
            if (user && playerData) {
                const embed = new EmbedBuilder()
                    .setTitle(`📊 ${user.username}'s Attendance`)
                    .setColor(0x00FF00)
                    .addFields([
                        {
                            name: '👤 Player',
                            value: playerData.name,
                            inline: true
                        },
                        {
                            name: '🎯 Attendance',
                            value: playerData.attendance.toString(),
                            inline: true
                        },
                        {
                            name: '⚔️ Last Battle',
                            value: playerData.lastBattle ? new Date(playerData.lastBattle).toLocaleDateString() : 'No data',
                            inline: true
                        },
                        {
                            name: '🛡️ IP',
                            value: playerData.avgIp.toString(),
                            inline: true
                        },
                        {
                            name: '💀 K/D',
                            value: `${playerData.kills}/${playerData.deaths}`,
                            inline: true
                        },
                        {
                            name: '⭐ Kill Fame',
                            value: formatNumber(playerData.killFame),
                            inline: true
                        },
                        {
                            name: '💀 Death Fame',
                            value: formatNumber(playerData.deathFame),
                            inline: true
                        },
                        {
                            name: '💚 Healing',
                            value: formatNumber(playerData.heal),
                            inline: true
                        },
                        {
                            name: '⚡ Damage',
                            value: formatNumber(playerData.damage),
                            inline: true
                        }
                    ])
                    .setFooter({ text: `📅 ${formatDate(startDate)} → ${formatDate(endDate)}` })
                    .setTimestamp();

                if (isSlash) {
                    await message.editReply({ embeds: [embed] });
                } else {
                    await message.reply({ embeds: [embed] });
                }
                return;
            }

            // Setup pagination for all users
            const totalPages = Math.ceil(allData.length / ITEMS_PER_PAGE);
            let currentPage = 0;

            // Create page embed
            const getPageEmbed = (page) => {
                const start = page * ITEMS_PER_PAGE;
                const end = Math.min(start + ITEMS_PER_PAGE, allData.length);
                const pagePlayers = allData.slice(start, end);

                const description = pagePlayers.map(player => {
                    if (player.lastBattle === null) {
                        return [
                            `**👤 ${player.name}**`,
                            `❌ No participation in the last 30 days`
                        ].join('\n');
                    }

                    return [
                        `**👤 ${player.name}**`,
                        `🎯 ${player.attendance} | ⚔️ ${player.kills}/${player.deaths} | 🛡️ ${player.avgIp}`,
                        `⭐ ${formatNumber(player.killFame)} | 💀 ${formatNumber(player.deathFame)} | 💚 ${formatNumber(player.heal)} | 🩸 ${formatNumber(player.damage)}`,
                    ].join('\n');
                }).join('\n\n');

                return new EmbedBuilder()
                    .setTitle('📊 Guild Attendance')
                    .setColor(0x00FF00)
                    .setDescription(description)
                    .setFooter({ 
                        text: `📄 ${page + 1}/${totalPages} • 👥 ${allData.length} (${membersWithNoParticipation.length} inactive) • 📅 ${formatDate(startDate)} → ${formatDate(endDate)}`
                    })
                    .setTimestamp();
            };

            // Create navigation buttons
            const getButtons = (page) => {
                return new ActionRowBuilder().addComponents([
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
            };

            // Send initial message
            const initialEmbed = getPageEmbed(0);
            const initialButtons = getButtons(0);
            
            const messageResponse = await (isSlash ? 
                message.editReply({ embeds: [initialEmbed], components: [initialButtons] }) :
                message.reply({ embeds: [initialEmbed], components: [initialButtons] })
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
                    // Handle button clicks
                    switch (interaction.customId) {
                        case 'first':
                            currentPage = 0;
                            break;
                        case 'prev':
                            currentPage = Math.max(0, currentPage - 1);
                            break;
                        case 'next':
                            currentPage = Math.min(totalPages - 1, currentPage + 1);
                            break;
                        case 'last':
                            currentPage = totalPages - 1;
                            break;
                    }

                    await interaction.update({
                        embeds: [getPageEmbed(currentPage)],
                        components: [getButtons(currentPage)]
                    });
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
            console.error('Error in attendance command:', error);
            const errorMessage = 'An error occurred while fetching attendance data.';
            
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