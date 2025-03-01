const { EmbedBuilder, PermissionFlagsBits, Colors } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const {
    getApiEndpoint,
    findPlayer,
    checkPlayerNameAvailability,
    registerPlayer,
    handleRolesAndNickname,
    handleAutocomplete
} = require('../../utils/albionRegistration');

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
        await handleAutocomplete(interaction);
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

            const apiEndpoint = getApiEndpoint(region);
            if (!apiEndpoint) {
                const response = '❌ Invalid region. Use: america, europe or asia';
                if (isSlash) {
                    await message.editReply(response);
                } else {
                    await message.reply(response);
                }
                return;
            }

            // Find player
            const playerResult = await findPlayer(nickname, apiEndpoint);

            if (!playerResult.found) {
                let response;
                if (playerResult.multipleResults) {
                    response = [
                        '❌ Found multiple players:',
                        playerResult.multipleResults.map(name => `- ${name}`).join('\n'),
                        'Please use the exact character name.'
                    ].join('\n');
                } else {
                    response = '❌ Player not found.';
                }
                
                if (isSlash) {
                    await message.editReply(response);
                } else {
                    await message.reply(response);
                }
                return;
            }

            const { playerName } = playerResult;

            // Check if player name is available
            if (!await checkPlayerNameAvailability(playerName, targetUser.id)) {
                const response = `❌ "${playerName}" is already registered by another user.`;
                if (isSlash) {
                    await message.editReply(response);
                } else {
                    await message.reply(response);
                }
                return;
            }

            // Register player
            await registerPlayer({
                userId: targetUser.id,
                guildId: message.guildId,
                region,
                playerName,
                albionGuildId: settings.albionGuildId
            });

            // Handle roles and nickname
            const roleResult = await handleRolesAndNickname({
                member: targetMember,
                guild: message.guild,
                settings,
                playerName
            });

            const response = {
                embeds: [
                    new EmbedBuilder()
                        .setTitle(roleResult.success ? '✅ Registration Successful' : '⚠️ Partial Registration')
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
                                value: roleResult.status,
                                inline: true
                            }
                        ])
                        .setColor(roleResult.success ? Colors.Green : Colors.Yellow)
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