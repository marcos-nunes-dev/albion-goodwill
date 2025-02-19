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
                                '`/setprefix prefix:<prefix>` - Set command prefix',
                                '`/setguildname name:<name>` - Set Albion guild name',
                                '`/setguildid id:<id>` - Set Albion guild ID',
                                '`/setrole type:<type> role:@role` - Set role for class type',
                                '`/setverifiedrole role:@role` - Set verified member role'
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
                .setTitle('ℹ️ Current Guild Settings')
                .addFields([
                    {
                        name: 'General',
                        value: [
                            `Command Prefix: \`${settings.commandPrefix || '!albiongw'}\``,
                            `Guild Name: \`${settings.guildName || 'Not set'}\``,
                            `Albion Guild ID: \`${settings.albionGuildId || 'Not set'}\``
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: 'Roles',
                        value: [
                            `Tank: ${settings.tankRoleId ? `<@&${settings.tankRoleId}>` : '`Not set`'}`,
                            `Support: ${settings.supportRoleId ? `<@&${settings.supportRoleId}>` : '`Not set`'}`,
                            `Healer: ${settings.healerRoleId ? `<@&${settings.healerRoleId}>` : '`Not set`'}`,
                            `DPS Melee: ${settings.dpsMeleeRoleId ? `<@&${settings.dpsMeleeRoleId}>` : '`Not set`'}`,
                            `DPS Ranged: ${settings.dpsRangedRoleId ? `<@&${settings.dpsRangedRoleId}>` : '`Not set`'}`,
                            `Battlemount: ${settings.battlemountRoleId ? `<@&${settings.battlemountRoleId}>` : '`Not set`'}`,
                            `Verified: ${settings.nicknameVerifiedId ? `<@&${settings.nicknameVerifiedId}>` : '`Not set`'}`
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: 'Competitor Guilds',
                        value: settings.competitorIds?.length > 0 
                            ? settings.competitorIds.map((id, index) => `${index + 1}. \`${id}\``).join('\n')
                            : '`No competitor guilds set`',
                        inline: false
                    },
                    {
                        name: 'Available Commands',
                        value: [
                            '`/setprefix prefix:<prefix>` - Set command prefix',
                            '`/setguildname name:<name>` - Set Albion guild name',
                            '`/setguildid id:<id>` - Set Albion guild ID',
                            '`/setrole type:<type> role:@role` - Set role for class type',
                            '`/setverifiedrole role:@role` - Set verified member role',
                            '`/competitors add/remove/list` - Manage competitor guilds'
                        ].join('\n'),
                        inline: false
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
            console.error('Error showing settings:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while trying to fetch the settings.')
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