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

module.exports = {
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
    async autocomplete(interaction) {
        await handleAutocomplete(interaction);
    },
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const targetUser = interaction.options.getUser('user');
            const targetMember = await interaction.guild.members.fetch(targetUser.id);
            const region = interaction.options.getString('region');
            const nickname = interaction.options.getString('character');

            if (!targetUser || !region || !nickname) {
                return await interaction.editReply('❌ Please provide all required parameters: user, region, and character name.');
            }

            // Get guild settings
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: interaction.guildId }
            });

            if (!settings?.nicknameVerifiedId) {
                return await interaction.editReply('⚠️ Verified role not configured. Use `/setverifiedrole` to configure.');
            }

            const apiEndpoint = getApiEndpoint(region);
            if (!apiEndpoint) {
                return await interaction.editReply('❌ Invalid region. Use: america, europe or asia');
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
                
                return await interaction.editReply(response);
            }

            const { playerName } = playerResult;

            // Check if player name is available
            if (!await checkPlayerNameAvailability(playerName, targetUser.id)) {
                return await interaction.editReply(`❌ "${playerName}" is already registered by another user.`);
            }

            // Register player
            await registerPlayer({
                userId: targetUser.id,
                guildId: interaction.guildId,
                region,
                playerName,
                albionGuildId: settings.albionGuildId
            });

            // Handle roles and nickname
            const roleResult = await handleRolesAndNickname({
                member: targetMember,
                guild: interaction.guild,
                settings,
                playerName
            });

            const embed = new EmbedBuilder()
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
                    text: `Registered by ${interaction.user.tag}` 
                });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in registerhim command:', error);
            await interaction.editReply('An error occurred while registering the player.');
        }
    }
};