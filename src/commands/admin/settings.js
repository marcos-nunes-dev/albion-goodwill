const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');

module.exports = new Command({
    name: 'settings',
    description: 'View current guild settings',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'settings';
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guildId }
            });

            if (!settings) {
                const noSettingsEmbed = new EmbedBuilder()
                    .setTitle('ℹ️ Guild Settings')
                    .setDescription('No settings have been configured yet.')
                    .addFields([
                        {
                            name: 'Available Commands',
                            value: [
                                '`/setup` - Configure all settings at once',
                                '`/setupcreateroles` - Create required roles',
                                '`/setguildid id:<id>` - Set Albion guild ID'
                            ].join('\n')
                        }
                    ])
                    .setColor(Colors.Blue)
                    .setTimestamp();

                await message.reply({
                    embeds: [noSettingsEmbed],
                    ephemeral: isSlash
                });
                return;
            }

            const settingsEmbed = new EmbedBuilder()
                .setTitle('⚙️ Current Guild Settings')
                .addFields([
                    {
                        name: 'Guild Configuration',
                        value: [
                            `Albion Guild ID: ${settings.albionGuildId ? `✅ \`${settings.albionGuildId}\`` : '❌ Not set'}`,
                            `Guild Name: ${settings.guildName ? `✅ ${settings.guildName}` : '❌ Not set'}`,
                            `Command Prefix: ${settings.commandPrefix || '!albiongw'}`
                        ].join('\n')
                    },
                    {
                        name: 'Role Configuration',
                        value: [
                            `Verified Role: ${settings.nicknameVerifiedId ? `✅ <@&${settings.nicknameVerifiedId}>` : '❌ Not set'}`,
                            `Tank Role: ${settings.tankRoleId ? `✅ <@&${settings.tankRoleId}>` : '❌ Not set'}`,
                            `Healer Role: ${settings.healerRoleId ? `✅ <@&${settings.healerRoleId}>` : '❌ Not set'}`,
                            `Support Role: ${settings.supportRoleId ? `✅ <@&${settings.supportRoleId}>` : '❌ Not set'}`,
                            `DPS Melee Role: ${settings.dpsMeleeRoleId ? `✅ <@&${settings.dpsMeleeRoleId}>` : '❌ Not set'}`,
                            `DPS Ranged Role: ${settings.dpsRangedRoleId ? `✅ <@&${settings.dpsRangedRoleId}>` : '❌ Not set'}`,
                            `Battlemount Role: ${settings.battlemountRoleId ? `✅ <@&${settings.battlemountRoleId}>` : '❌ Not set'}`
                        ].join('\n')
                    },
                    {
                        name: 'Channel Configuration',
                        value: [
                            `Battle Log Webhook: ${settings.battlelogWebhook ? '✅ Configured' : '❌ Not set'}`,
                            `Battle Log Channel: ${settings.battlelogChannelId ? `✅ <#${settings.battlelogChannelId}>` : '❌ Not set'}`
                        ].join('\n')
                    },
                    {
                        name: 'Available Commands',
                        value: [
                            '`/setup` - Configure all settings at once',
                            '`/setupcreateroles` - Create required roles',
                            '`/setguildid id:<id>` - Set Albion guild ID'
                        ].join('\n')
                    }
                ])
                .setColor(Colors.Blue)
                .setTimestamp()
                .setFooter({
                    text: `Requested by ${isSlash ? message.user.tag : message.author.tag}`
                });

            await message.reply({
                embeds: [settingsEmbed],
                ephemeral: isSlash
            });

        } catch (error) {
            console.error('Error in settings command:', error);
            await message.reply({
                content: 'An error occurred while fetching settings.',
                ephemeral: true
            });
        }
    }
}); 