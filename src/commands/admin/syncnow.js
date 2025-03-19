const Command = require('../../structures/Command');
const BattleSyncManager = require('../../services/BattleSyncManager');
const BattleChannelManager = require('../../services/BattleChannelManager');

const command = new Command({
    name: 'syncnow',
    description: 'Force sync battles from Albion Online',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 0,
    async execute(message, args, handler) {
        const client = message.client || handler.client;
        
        try {
            // Acknowledge interaction first
            if (message.commandName === 'syncnow') {
                await message.reply({ content: '🔄 Syncing battles...', ephemeral: true });
            }

            // Run battle sync
            const battleSyncManager = new BattleSyncManager(client);
            await battleSyncManager.syncBattles();

            // Update battle channels
            const battleChannelManager = new BattleChannelManager(client);
            await battleChannelManager.updateChannels();

            // Update the reply
            if (message.commandName === 'syncnow') {
                await message.editReply({ content: '✅ Sync complete!', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in syncnow command:', error);
            if (message.commandName === 'syncnow') {
                if (message.replied || message.deferred) {
                    await message.editReply({ content: '❌ Error during sync', ephemeral: true });
                } else {
                    await message.reply({ content: '❌ Error during sync', ephemeral: true });
                }
            }
        }
    }
});

module.exports = command;
