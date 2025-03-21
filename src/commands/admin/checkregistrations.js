const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');
const languageManager = require('../../utils/languageUtils');

module.exports = new Command({
    name: 'checkregistrations',
    description: 'Check unregistered members in a role',
    category: 'admin',
    usage: '@role',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'checkregistrations';
            const role = isSlash ? 
                message.options.getRole('role') : 
                message.mentions.roles.first();

            const language = await handler.getGuildLanguage(message.guild.id);

            if (!role) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle(languageManager.translate('commands.checkregistrations.missingRole.title', language))
                    .setDescription(languageManager.translate('commands.checkregistrations.missingRole.description', language))
                    .addFields([
                        {
                            name: languageManager.translate('commands.checkregistrations.missingRole.usage', language),
                            value: isSlash ? 
                                `\`${languageManager.translate('commands.checkregistrations.missingRole.slashUsage', language)}\`` : 
                                `\`${languageManager.translate('commands.checkregistrations.missingRole.prefixUsage', language)}\``
                        },
                        {
                            name: languageManager.translate('commands.checkregistrations.missingRole.example', language),
                            value: isSlash ? 
                                `\`${languageManager.translate('commands.checkregistrations.missingRole.slashExample', language)}\`` : 
                                `\`${languageManager.translate('commands.checkregistrations.missingRole.prefixExample', language)}\``
                        }
                    ])
                    .setColor(Colors.Yellow)
                    .setTimestamp();

                await message.reply({
                    embeds: [errorEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            // Get all members with the specified role
            const members = role.members;

            // Get all registrations for these members
            const registeredUsers = await prisma.playerRegistration.findMany({
                where: {
                    userId: {
                        in: [...members.keys()]
                    },
                    guildId: message.guildId
                }
            });

            // Find unregistered members
            const registeredUserIds = new Set(registeredUsers.map(reg => reg.userId));
            const unregisteredMembers = [...members.values()].filter(
                member => !registeredUserIds.has(member.id)
            );

            if (unregisteredMembers.length === 0) {
                const successEmbed = new EmbedBuilder()
                    .setTitle(languageManager.translate('commands.checkregistrations.allRegistered.title', language))
                    .setDescription(languageManager.translate('commands.checkregistrations.allRegistered.description', language, { roleName: role.name }))
                    .setColor(Colors.Green)
                    .setTimestamp();

                await message.reply({
                    embeds: [successEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            // Split members into chunks if the list is too long
            const CHUNK_SIZE = 1024; // Discord's field value limit
            const memberChunks = [];
            let currentChunk = '';

            for (const member of unregisteredMembers) {
                const memberDisplay = member.displayName || member.user.username;
                if (currentChunk.length + memberDisplay.length + 1 > CHUNK_SIZE) {
                    memberChunks.push(currentChunk);
                    currentChunk = memberDisplay;
                } else {
                    currentChunk += (currentChunk ? '\n' : '') + memberDisplay;
                }
            }
            if (currentChunk) {
                memberChunks.push(currentChunk);
            }

            const resultEmbed = new EmbedBuilder()
                .setTitle(languageManager.translate('commands.checkregistrations.unregistered.title', language))
                .setDescription(languageManager.translate('commands.checkregistrations.unregistered.description', language, { roleName: role.name }))
                .setColor(Colors.Yellow)
                .setTimestamp()
                .setFooter({
                    text: `Total unregistered: ${unregisteredMembers.length}`
                });

            // Add member chunks as separate fields
            memberChunks.forEach((chunk, index) => {
                resultEmbed.addFields({
                    name: index === 0 ? 'Members' : '\u200B',
                    value: chunk,
                    inline: false
                });
            });

            // Add registration instructions
            resultEmbed.addFields({
                name: 'How to Register',
                value: [
                    'Use `/register` with the following options:',
                    '• `region`: america, europe, or asia',
                    '• `character`: Your Albion Online character name',
                    '',
                    'Example: `/register region:america character:PlayerName`'
                ].join('\n'),
                inline: false
            });

            await message.reply({
                embeds: [resultEmbed],
                ephemeral: isSlash
            });

        } catch (error) {
            console.error('Error checking registrations:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while checking registrations.')
                .setColor(Colors.Red)
                .setTimestamp()
                .setFooter({
                    text: `Attempted by ${isSlash ? message.user.tag : message.author.tag}`
                });

            await message.reply({
                embeds: [errorEmbed],
                ephemeral: isSlash
            });
        }
    }
}); 