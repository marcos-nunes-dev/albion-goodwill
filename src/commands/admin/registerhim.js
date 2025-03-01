const { EmbedBuilder, PermissionFlagsBits, Colors } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const axios = require('axios');

module.exports = new Command({
    name: 'registerhim',
    description: 'Register an Albion Online character for another user (Admin only)',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    options: [
        {
            name: 'user',
            description: 'The Discord user to register',
            type: 6,
            required: true
        },
        {
            name: 'region',
            description: 'Player region',
            type: 3,
            required: true,
            choices: [
                { name: 'America', value: 'america' },
                { name: 'Europe', value: 'europe' },
                { name: 'Asia', value: 'asia' }
            ]
        },
        {
            name: 'character',
            description: 'Albion Online character name',
            type: 3,
            required: true,
            autocomplete: true
        }
    ],
    // Add autocomplete handler
    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused();
            const region = interaction.options.getString('region');

            if (!region || !focusedValue || focusedValue.length < 3) {
                await interaction.respond([]);
                return;
            }

            const apiEndpoint = {
                'america': 'https://murderledger.albiononline2d.com',
                'europe': 'https://murderledger-europe.albiononline2d.com',
                'asia': 'https://murderledger-asia.albiononline2d.com'
            }[region];

            if (!apiEndpoint) {
                await interaction.respond([]);
                return;
            }

            const searchResponse = await axios.get(
                `${apiEndpoint}/api/player-search/${encodeURIComponent(focusedValue)}`
            );

            const { results } = searchResponse.data;

            if (!results || !results.length) {
                await interaction.respond([]);
                return;
            }

            await interaction.respond(
                results.slice(0, 25).map(name => ({
                    name,
                    value: name
                }))
            );
        } catch (error) {
            console.error('Error in registerhim autocomplete:', error);
            await interaction.respond([]);
        }
    },
    async execute(message, args, isSlash = false) {
        try {
            if (isSlash) {
                await message.deferReply({ ephemeral: true });
            }

            const targetUser = isSlash ? 
                message.options.getUser('user') : 
                message.mentions.users.first();

            const targetMember = await message.guild.members.fetch(targetUser.id);

            const region = isSlash ? 
                message.options.getString('region') : 
                args[1]?.toLowerCase();

            const nickname = isSlash ? 
                message.options.getString('character') : 
                args[2];

            if (!targetUser || !region || !nickname) {
                const errorMessage = '❌ Please provide all required parameters: user, region, and character name.';
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

            if (!settings?.nicknameVerifiedId) {
                const response = '⚠️ Verified role not configured. Use `/setverifiedrole` to configure.';
                if (isSlash) {
                    await message.editReply(response);
                } else {
                    await message.reply(response);
                }
                return;
            }

            // Select API endpoint based on region
            const apiEndpoint = {
                'america': 'https://murderledger.albiononline2d.com',
                'europe': 'https://murderledger-europe.albiononline2d.com',
                'asia': 'https://murderledger-asia.albiononline2d.com'
            }[region];

            let playerName;
            let playerFound = false;

            // First try: Search for player using search API
            try {
                const searchResponse = await axios.get(
                    `${apiEndpoint}/api/player-search/${encodeURIComponent(nickname)}`
                );

                const { results } = searchResponse.data;

                if (results && results.length > 0) {
                    // Handle multiple results
                    if (results.length > 1) {
                        // Check for exact match
                        const exactMatch = results.find(name => name === nickname);
                        if (exactMatch) {
                            playerName = exactMatch;
                            playerFound = true;
                        } else {
                            const response = [
                                '❌ Found multiple players:',
                                results.map(name => `- ${name}`).join('\n'),
                                'Please use the exact character name.'
                            ].join('\n');
                            
                            if (isSlash) {
                                await message.editReply(response);
                            } else {
                                await message.reply(response);
                            }
                            return;
                        }
                    } else {
                        playerName = results[0];
                        playerFound = true;
                    }
                }
            } catch (searchError) {
                console.error('Error searching for player:', searchError);
            }

            // Second try: If player not found, check player's ledger directly
            if (!playerFound) {
                try {
                    const ledgerResponse = await axios.get(
                        `${apiEndpoint}/api/players/${encodeURIComponent(nickname)}/events?skip=0`
                    );
                    
                    // Check if the response has events data
                    const { events } = ledgerResponse.data;
                    if (ledgerResponse.status === 200 && events.length > 0) {
                        // Even if events is empty, if we got a 200 and events array exists, the player exists
                        playerName = nickname;
                        playerFound = true;
                    }
                } catch (ledgerError) {
                    console.error('Error checking player ledger:', ledgerError);
                }

                // If both attempts fail, player doesn't exist
                if (!playerFound) {
                    const response = '❌ Player not found.';
                    if (isSlash) {
                        await message.editReply(response);
                    } else {
                        await message.reply(response);
                    }
                    return;
                }
            }

            // Check existing registration
            const existingRegistration = await prisma.playerRegistration.findFirst({
                where: { playerName }
            });

            if (existingRegistration && existingRegistration.userId !== targetUser.id) {
                const response = `❌ "${playerName}" is already registered by another user.`;
                if (isSlash) {
                    await message.editReply(response);
                } else {
                    await message.reply(response);
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
                    guildId: message.guildId,
                    albionGuildId: settings.albionGuildId,
                    userId: targetUser.id
                },
                create: {
                    userId: targetUser.id,
                    guildId: message.guildId,
                    region,
                    playerName,
                    albionGuildId: settings.albionGuildId
                }
            });

            try {
                // Add verified role and update nickname if sync is enabled
                const verifiedRole = await message.guild.roles.fetch(settings.nicknameVerifiedId);
                if (verifiedRole) {
                    await targetMember.roles.add(verifiedRole);
                }

                // Set nickname if sync is enabled
                let nicknameStatus = '🎭 Verified role assigned';
                if (settings.syncAlbionNickname) {
                    try {
                        await targetMember.setNickname(playerName);
                        nicknameStatus += '\n🔄 Nickname synchronized';
                    } catch (nickError) {
                        console.error('Error setting nickname:', nickError);
                        nicknameStatus += '\n⚠️ Failed to synchronize nickname';
                    }
                }

                const response = {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('✅ Registration Successful')
                            .setDescription(`Successfully registered Albion Online character for ${targetUser.toString()}`)
                            .addFields([
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
                            ])
                            .setColor(Colors.Green)
                            .setTimestamp()
                            .setFooter({ 
                                text: `Registered by ${message.user?.tag || message.author.tag}` 
                            })
                    ]
                };

                if (isSlash) {
                    await message.editReply(response);
                } else {
                    await message.reply(response);
                }

            } catch (error) {
                console.error('Error in registration process:', error);
                const errorMessage = 'An error occurred during the registration process.';
                if (isSlash) {
                    await message.editReply(errorMessage);
                } else {
                    await message.reply(errorMessage);
                }
            }

        } catch (error) {
            console.error('Error in registerhim command:', error);
            const errorMessage = 'An error occurred while registering the player.';
            if (isSlash) {
                await message.editReply(errorMessage);
            } else {
                await message.reply(errorMessage);
            }
        }
    }
}); 