const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');

module.exports = new Command({
    name: 'setsyncbattles',
    description: 'Enable/disable automatic Albion battle synchronization',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'setsyncbattles';
            const enabled = message.options.getBoolean('enabled');

            // Get current settings
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guildId }
            });

            if (!settings?.albionGuildId) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Configuration Required')
                    .setDescription([
                        'Albion Guild ID must be configured before enabling battle sync.',
                        '',
                        'Please use `/setguildid` to set your Albion guild ID first.'
                    ].join('\n'))
                    .setColor(Colors.Red)
                    .setTimestamp();

                return await message.reply({
                    embeds: [errorEmbed],
                    ephemeral: true
                });
            }

            // Update the setting
            await prisma.guildSettings.update({
                where: { guildId: message.guildId },
                data: { syncAlbionBattles: enabled }
            });

            const responseEmbed = new EmbedBuilder()
                .setTitle(`${enabled ? '✅ Battle Sync Enabled' : '❌ Battle Sync Disabled'}`)
                .setDescription([
                    `Automatic battle synchronization has been ${enabled ? 'enabled' : 'disabled'}.`,
                    '',
                    enabled ? [
                        '**What this means:**',
                        '• Battles will be automatically fetched from Albion Online API',
                        '• Battle logs channel will be updated with new battles',
                        '• Channel name will reflect current battle statistics',
                        '',
                        'You can still manually register battles using `/battleregister`'
                    ].join('\n') : [
                        '**What this means:**',
                        '• Battles will not be automatically synced',
                        '• You will need to manually register battles using `/battleregister`',
                        '• Channel name and logs will only update with manual registrations'
                    ].join('\n')
                ].join('\n'))
                .setColor(enabled ? Colors.Green : Colors.Red)
                .setTimestamp()
                .setFooter({
                    text: `Updated by ${isSlash ? message.user.tag : message.author.tag}`
                });

            await message.reply({
                embeds: [responseEmbed],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in setsyncbattles command:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while updating battle sync settings.')
                .setColor(Colors.Red)
                .setTimestamp();

            await message.reply({
                embeds: [errorEmbed],
                ephemeral: true
            });
        }
    }
}); 