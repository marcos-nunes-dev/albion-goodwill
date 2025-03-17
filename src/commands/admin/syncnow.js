const Command = require('../../structures/Command');
const { EmbedBuilder, Colors } = require('discord.js');
const { getSharedBattleSync } = require('../../services/BattleSyncService');

module.exports = new Command({
    name: 'syncnow',
    description: 'Manually trigger the battle sync process',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 30, // 30 seconds cooldown
    async execute(message, args, handler) {
        const isSlash = message.commandName === 'syncnow';
        let response;
        
        try {
            // Send initial response
            response = isSlash ? 
                await message.deferReply() : 
                await message.reply('🔄 Starting manual battle sync...');

            // Get the shared BattleSyncService instance
            const battleSyncService = getSharedBattleSync();
            if (!battleSyncService) {
                throw new Error('Battle sync service is not initialized');
            }

            // Run the sync process
            const results = await battleSyncService.syncRecentBattles();

            // Create response embed
            const resultEmbed = new EmbedBuilder()
                .setTitle('Manual Battle Sync Complete')
                .setDescription([
                    '**Process Summary:**',
                    `• Guilds Processed: ${results.guildsProcessed}`,
                    `• Battles Found: ${results.battlesFound}`,
                    `• Battles Registered: ${results.battlesRegistered}`,
                    `• Errors Encountered: ${results.errors}`
                ].join('\n'))
                .setColor(results.errors > 0 ? Colors.Orange : Colors.Green)
                .setTimestamp();

            // Send or edit the response
            if (isSlash) {
                await message.editReply({ embeds: [resultEmbed] });
            } else {
                await response.edit({ embeds: [resultEmbed] });
            }

        } catch (error) {
            console.error('Error in syncnow command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while running the battle sync.')
                .setColor(Colors.Red)
                .setTimestamp();

            if (isSlash) {
                if (message.deferred) {
                    await message.editReply({ embeds: [errorEmbed] });
                } else {
                    await message.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            } else if (response) {
                await response.edit({ embeds: [errorEmbed] });
            } else {
                await message.reply({ embeds: [errorEmbed] });
            }
        }
    }
});