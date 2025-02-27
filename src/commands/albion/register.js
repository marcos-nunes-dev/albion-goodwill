const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const axios = require('axios');
const EmbedBuilder = require('../../utils/embedBuilder');
const { Colors } = require('discord.js');

module.exports = new Command({
    name: 'register',
    description: 'Register your Albion Online character',
    category: 'albion',
    usage: '<region> <nickname>',
    cooldown: 10,
    async execute(message, args, handler) {
        let interaction, region, nickname;

        // Handle slash command
        if (message.isCommand?.()) {
            interaction = message;
            region = interaction.options.getString('region');
            nickname = interaction.options.getString('character');
        } else {
            // Handle traditional command
            if (!args[0] || !args[1]) {
                await message.reply({
                    embeds: [EmbedBuilder.warning(
                        'Please use the command like this: `/register <region> <nickname>`\n' +
                        'Available regions: america, europe, asia'
                    )]
                });
                return;
            }
            interaction = message;
            region = args[0].toLowerCase();
            nickname = args[1];
        }

        // Check if user is already registered in this server
        const existingUserRegistration = await prisma.playerRegistration.findFirst({
            where: {
                userId: interaction.user?.id || interaction.author.id,
                guildId: interaction.guild.id
            }
        });

        if (existingUserRegistration) {
            const response = {
                embeds: [EmbedBuilder.warning(
                    `You are already registered as "${existingUserRegistration.playerName}" in this server.\n` +
                    'Please use `/unregister` first if you want to register a different character.'
                )]
            };
            
            if (interaction.isCommand?.()) {
                await interaction.reply(response);
            } else {
                await interaction.reply(response);
            }
            return;
        }

        if (!['america', 'europe', 'asia'].includes(region)) {
            const response = {
                embeds: [EmbedBuilder.error('Invalid region. Use: america, europe or asia')]
            };
            
            if (interaction.isCommand?.()) {
                await interaction.reply(response);
            } else {
                await interaction.reply(response);
            }
            return;
        }

        // Send initial response
        if (interaction.isCommand?.()) {
            await interaction.deferReply();
        } else {
            await interaction.reply({
                embeds: [EmbedBuilder.info('Searching for player...')]
            });
        }

        try {
            // Select API endpoint based on region
            const apiEndpoint = {
                'america': 'https://murderledger.albiononline2d.com',
                'europe': 'https://murderledger-europe.albiononline2d.com',
                'asia': 'https://murderledger-asia.albiononline2d.com'
            }[region];

            // Search for player
            const searchResponse = await axios.get(
                `${apiEndpoint}/api/player-search/${encodeURIComponent(nickname)}`
            );

            const { results } = searchResponse.data;

            if (!results || results.length === 0) {
                const response = {
                    embeds: [EmbedBuilder.error('Player not found.')]
                };
                
                if (interaction.isCommand?.()) {
                    await interaction.editReply(response);
                } else {
                    await interaction.edit(response);
                }
                return;
            }

            // Handle multiple results
            if (results.length > 1) {
                // Check if there's an exact match first
                const exactMatch = results.find(name => name === nickname);
                if (exactMatch) {
                    // Use the exact match and continue with registration
                    playerName = exactMatch;
                } else {
                    // No exact match found, show the list of similar names
                    const response = {
                        embeds: [EmbedBuilder.warning([
                            'Found multiple players:',
                            results.map(name => `- ${name}`).join('\n'),
                            'Please use the exact character name.'
                        ].join('\n'))]
                    };
                    
                    if (interaction.isCommand?.()) {
                        await interaction.editReply(response);
                    } else {
                        await interaction.edit(response);
                    }
                    return;
                }
            } else {
                playerName = results[0];
            }

            // Get guild settings
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: interaction.guild.id }
            });

            if (!settings?.nicknameVerifiedId) {
                let response = '⚠️ Verified role not configured.';
                if (interaction.member.permissions.has('ADMINISTRATOR')) {
                    response += ' Use `/settings setverifiedrole` to configure.';
                }
                
                const responseObj = {
                    embeds: [EmbedBuilder.warning(response)]
                };
                
                if (interaction.isCommand?.()) {
                    await interaction.editReply(responseObj);
                } else {
                    await interaction.edit(responseObj);
                }
                return;
            }

            // Check existing registration
            const existingRegistration = await prisma.playerRegistration.findFirst({
                where: { playerName }
            });

            if (existingRegistration && existingRegistration.userId !== (interaction.user?.id || interaction.author.id)) {
                const response = {
                    embeds: [EmbedBuilder.error(`"${playerName}" is already registered by another user.`)]
                };
                
                if (interaction.isCommand?.()) {
                    await interaction.editReply(response);
                } else {
                    await interaction.edit(response);
                }
                return;
            }

            // Update or create registration
            await prisma.playerRegistration.upsert({
                where: {
                    playerName: playerName
                },
                update: {
                    region,
                    guildId: interaction.guild.id,
                    albionGuildId: settings.albionGuildId
                },
                create: {
                    userId: interaction.user?.id || interaction.author.id,
                    guildId: interaction.guild.id,
                    region,
                    playerName,
                    albionGuildId: settings.albionGuildId
                }
            });

            // Add verified role and update nickname if sync is enabled
            try {
                // Get guild settings to check for sync setting
                const guildSettings = await prisma.guildSettings.findUnique({
                    where: { guildId: interaction.guild.id }
                });

                const verifiedRole = await interaction.guild.roles.fetch(settings.nicknameVerifiedId);
                if (verifiedRole) {
                    await interaction.member.roles.add(verifiedRole);
                }

                // Set nickname if sync is enabled
                let nicknameStatus = '🎭 Verified role assigned';
                if (guildSettings?.syncAlbionNickname) {
                    try {
                        await interaction.member.setNickname(playerName);
                        nicknameStatus += '\n🔄 Nickname synchronized';
                    } catch (nickError) {
                        console.error('Error setting nickname:', nickError);
                        nicknameStatus += '\n⚠️ Failed to synchronize nickname';
                    }
                }

                const response = {
                    embeds: [
                        {
                            title: '✅ Registration Successful',
                            description: `Your Albion Online character has been registered successfully.`,
                            fields: [
                                {
                                    name: 'Character Name',
                                    value: `\`${playerName}\``,
                                    inline: true
                                },
                                {
                                    name: 'Region',
                                    value: `\`${region.charAt(0).toUpperCase() + region.slice(1)}\``,
                                    inline: true
                                },
                                {
                                    name: 'Status',
                                    value: nicknameStatus,
                                    inline: true
                                }
                            ],
                            color: Colors.Green,
                            timestamp: new Date().toISOString(),
                            footer: {
                                text: `Registered by ${interaction.user?.tag || interaction.author.tag}`
                            }
                        }
                    ]
                };
                
                if (interaction.isCommand?.()) {
                    await interaction.editReply(response);
                } else {
                    await interaction.edit(response);
                }
            } catch (roleError) {
                console.error('Error adding verified role:', roleError);
                const response = {
                    embeds: [
                        {
                            title: '⚠️ Partial Registration',
                            description: `Your Albion Online character has been registered, but there was an issue with the role assignment.`,
                            fields: [
                                {
                                    name: 'Character Name',
                                    value: `\`${playerName}\``,
                                    inline: true
                                },
                                {
                                    name: 'Region',
                                    value: `\`${region.charAt(0).toUpperCase() + region.slice(1)}\``,
                                    inline: true
                                },
                                {
                                    name: 'Status',
                                    value: '⚠️ Error assigning verified role',
                                    inline: true
                                }
                            ],
                            color: Colors.Yellow,
                            timestamp: new Date().toISOString(),
                            footer: {
                                text: `Registered by ${interaction.user?.tag || interaction.author.tag}`
                            }
                        }
                    ]
                };
                
                if (interaction.isCommand?.()) {
                    await interaction.editReply(response);
                } else {
                    await interaction.edit(response);
                }
            }

        } catch (error) {
            console.error('Error registering player:', error);
            const response = {
                embeds: [EmbedBuilder.error('Error registering player.')]
            };
            
            if (interaction.isCommand?.()) {
                await interaction.editReply(response);
            } else {
                await interaction.edit(response);
            }
        }
    }
}); 