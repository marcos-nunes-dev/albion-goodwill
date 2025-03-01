const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');

module.exports = new Command({
    name: 'unregister',
    description: 'Unregister a member from Albion Online verification',
    category: 'admin',
    usage: '<player_name>',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args) {
        try {
            // Check if it's a slash command
            const isSlash = message.commandName === 'unregister';

            // Defer the reply for slash commands
            if (isSlash) {
                await message.deferReply();
            }

            const targetUser = isSlash ? 
                message.options.getUser('user') : 
                message.mentions.users.first();

            if (!targetUser) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Missing Information')
                    .setDescription('Please mention the user to unregister.')
                    .addFields([
                        {
                            name: 'Usage',
                            value: isSlash ? 
                                '`/unregister user:@User`' : 
                                '`!albiongw unregister @User`'
                        },
                        {
                            name: 'Example',
                            value: isSlash ? 
                                '`/unregister user:@John`' : 
                                '`!albiongw unregister @John`'
                        }
                    ])
                    .setColor(Colors.Yellow)
                    .setTimestamp();

                if (isSlash) {
                    await message.editReply({ embeds: [errorEmbed] });
                } else {
                    await message.reply({ embeds: [errorEmbed] });
                }
                return;
            }

            // Find registration
            const registration = await prisma.playerRegistration.findFirst({
                where: {
                    userId: targetUser.id,
                    guildId: message.guildId
                }
            });

            if (!registration) {
                const notFoundEmbed = new EmbedBuilder()
                    .setTitle('❌ Not Found')
                    .setDescription(`User ${targetUser.toString()} is not registered.`)
                    .setColor(Colors.Red)
                    .setTimestamp();

                if (isSlash) {
                    await message.editReply({ embeds: [notFoundEmbed] });
                } else {
                    await message.reply({ embeds: [notFoundEmbed] });
                }
                return;
            }

            // Get guild settings to check for verified role
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guildId }
            });

            // Try to remove verified role if configured
            let roleRemoved = false;
            if (settings?.nicknameVerifiedId) {
                try {
                    const member = await message.guild.members.fetch(targetUser.id);
                    if (member && member.roles.cache.has(settings.nicknameVerifiedId)) {
                        await member.roles.remove(settings.nicknameVerifiedId);
                        roleRemoved = true;
                    }
                } catch (roleError) {
                    console.error('Error removing verified role:', roleError);
                }
            }

            // Delete registration
            await prisma.playerRegistration.delete({
                where: {
                    id: registration.id
                }
            });

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Registration Removed')
                .setDescription('User has been unregistered successfully.')
                .addFields([
                    {
                        name: 'User',
                        value: targetUser.toString(),
                        inline: true
                    },
                    {
                        name: 'Player Name',
                        value: `\`${registration.playerName}\``,
                        inline: true
                    },
                    {
                        name: 'Status',
                        value: roleRemoved ? 
                            '✅ Verified role removed' : 
                            '⚠️ Could not remove verified role',
                        inline: false
                    }
                ])
                .setColor(Colors.Green)
                .setTimestamp()
                .setFooter({
                    text: `Unregistered by ${isSlash ? message.user.tag : message.author.tag}`
                });

            if (isSlash) {
                await message.editReply({ embeds: [successEmbed] });
            } else {
                await message.reply({ embeds: [successEmbed] });
            }

        } catch (error) {
            console.error('Error unregistering user:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while trying to unregister the user.')
                .setColor(Colors.Red)
                .setTimestamp()
                .setFooter({
                    text: `Attempted by ${message.user?.tag || message.author.tag}`
                });

            if (isSlash) {
                await message.editReply({ embeds: [errorEmbed] });
            } else {
                await message.reply({ embeds: [errorEmbed] });
            }
        }
    }
}); 