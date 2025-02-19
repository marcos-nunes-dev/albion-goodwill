const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const EmbedBuilder = require('../../utils/embedBuilder');
const { Colors } = require('discord.js');

module.exports = new Command({
    name: 'unregister',
    description: 'Remove a player registration',
    category: 'admin',
    usage: '<player_name>',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args) {
        if (!args[0]) {
            await message.reply({
                embeds: [EmbedBuilder.warning('Please provide a player name to unregister.')]
            });
            return;
        }

        const playerName = args[0];

        try {
            // Find registration
            const registration = await prisma.playerRegistration.findUnique({
                where: {
                    playerName: playerName
                }
            });

            if (!registration) {
                await message.reply({
                    embeds: [EmbedBuilder.warning(`Player "${playerName}" is not registered.`)]
                });
                return;
            }

            // Get guild settings to check for verified role
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guild.id }
            });

            let roleRemoved = false;
            // Try to remove verified role if configured
            if (settings?.nicknameVerifiedId) {
                try {
                    const member = await message.guild.members.fetch(registration.userId);
                    if (member) {
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
                    playerName: playerName
                }
            });

            await message.reply({
                embeds: [
                    {
                        title: '✅ Unregistration Successful',
                        description: 'The player registration has been removed successfully.',
                        fields: [
                            {
                                name: 'Character Name',
                                value: `\`${playerName}\``,
                                inline: true
                            },
                            {
                                name: 'Discord User',
                                value: `<@${registration.userId}>`,
                                inline: true
                            },
                            {
                                name: 'Status',
                                value: settings?.nicknameVerifiedId 
                                    ? roleRemoved 
                                        ? '🎭 Verified role removed'
                                        : '⚠️ Could not remove verified role'
                                    : '📝 No role configuration',
                                inline: true
                            }
                        ],
                        color: Colors.Green,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Unregistered by ${message.author.tag}`
                        }
                    }
                ]
            });

        } catch (error) {
            console.error('Error unregistering player:', error);
            await message.reply({
                embeds: [
                    {
                        title: '❌ Unregistration Failed',
                        description: 'An error occurred while trying to unregister the player.',
                        color: Colors.Red,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Attempted by ${message.author.tag}`
                        }
                    }
                ]
            });
        }
    }
}); 