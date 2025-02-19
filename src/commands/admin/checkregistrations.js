const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');

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

            if (!role) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Missing Information')
                    .setDescription('Please mention the role to check registrations from.')
                    .addFields([
                        {
                            name: 'Usage',
                            value: isSlash ? 
                                '`/checkregistrations role:@role`' : 
                                '`!albiongw checkregistrations @role`'
                        },
                        {
                            name: 'Example',
                            value: isSlash ? 
                                '`/checkregistrations role:@Members`' : 
                                '`!albiongw checkregistrations @Members`'
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
                    .setTitle('✅ All Members Registered')
                    .setDescription(`All members with the ${role.name} role are registered!`)
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
                const memberMention = member.toString();
                if (currentChunk.length + memberMention.length + 1 > CHUNK_SIZE) {
                    memberChunks.push(currentChunk);
                    currentChunk = memberMention;
                } else {
                    currentChunk += (currentChunk ? '\n' : '') + memberMention;
                }
            }
            if (currentChunk) {
                memberChunks.push(currentChunk);
            }

            const resultEmbed = new EmbedBuilder()
                .setTitle('⚠️ Unregistered Members Found')
                .setDescription(`The following members in ${role.name} are not registered:`)
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