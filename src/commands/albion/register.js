const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const EmbedBuilder = require('../../utils/embedBuilder');
const { Colors } = require('discord.js');
const {
    getApiEndpoint,
    findPlayer,
    checkExistingUserRegistration,
    checkPlayerNameAvailability,
    registerPlayer,
    handleRolesAndNickname,
    handleAutocomplete
} = require('../../utils/albionRegistration');

module.exports = new Command({
    name: 'register',
    description: 'Register your Albion Online character',
    category: 'albion',
    usage: '<region> <nickname>',
    cooldown: 10,
    // Add autocomplete handler
    async autocomplete(interaction) {
        await handleAutocomplete(interaction);
    },
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

        const userId = interaction.user?.id || interaction.author.id;
        const { guild } = interaction;

        // Check if user is already registered in this server
        const existingUserRegistration = await checkExistingUserRegistration(userId, guild.id);

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

        const apiEndpoint = getApiEndpoint(region);
        if (!apiEndpoint) {
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
            // Find player
            const playerResult = await findPlayer(nickname, apiEndpoint);

            if (!playerResult.found) {
                if (playerResult.multipleResults) {
                    const response = {
                        embeds: [EmbedBuilder.warning([
                            'Found multiple players:',
                            playerResult.multipleResults.map(name => `- ${name}`).join('\n'),
                            'Please use the exact character name.'
                        ].join('\n'))]
                    };
                } else {
                    const response = {
                        embeds: [EmbedBuilder.error('Player not found.')]
                    };
                }
                
                if (interaction.isCommand?.()) {
                    await interaction.editReply(response);
                } else {
                    await interaction.edit(response);
                }
                return;
            }

            const { playerName } = playerResult;

            // Get guild settings
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: guild.id }
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

            // Check if player name is available
            if (!await checkPlayerNameAvailability(playerName, userId)) {
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

            // Register player
            await registerPlayer({
                userId,
                guildId: guild.id,
                region,
                playerName,
                albionGuildId: settings.albionGuildId
            });

            // Handle roles and nickname
            const roleResult = await handleRolesAndNickname({
                member: interaction.member,
                guild,
                settings,
                playerName
            });

            const response = {
                embeds: [
                    {
                        title: roleResult.success ? '✅ Registration Successful' : '⚠️ Partial Registration',
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
                                value: roleResult.status,
                                inline: true
                            }
                        ],
                        color: roleResult.success ? Colors.Green : Colors.Yellow,
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