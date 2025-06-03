const Command = require('../../structures/Command');
const BattleSyncManager = require('../../services/BattleSyncManager');
const BattleChannelManager = require('../../services/BattleChannelManager');

const command = new Command({
    name: 'syncfromdays',
    description: 'Sync battles from a specific number of days ago for the current guild',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 0,
    options: [
        {
            name: 'days',
            description: 'Number of days to look back',
            type: 4, // INTEGER type
            required: true,
            min_value: 1,
            max_value: 30 // Limiting to 30 days to prevent abuse
        }
    ],
    async execute(message, args, handler) {
        const client = message.client || handler.client;
        const days = message.options?.getInteger('days') || parseInt(args[0]);
        const guildId = message.guild.id;
        
        if (!days || isNaN(days) || days < 1 || days > 30) {
            return message.reply({ 
                content: '❌ Please provide a valid number of days between 1 and 30', 
                ephemeral: true 
            });
        }

        try {
            // Acknowledge interaction first
            if (message.commandName === 'syncfromdays') {
                await message.reply({ 
                    content: `🔄 Syncing battles from ${days} days ago for this guild...`, 
                    ephemeral: true 
                });
            }

            // Run battle sync with custom start date and specific guild
            const battleSyncManager = new BattleSyncManager(client);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            await battleSyncManager.syncBattles(startDate, guildId);

            // Update battle channels for this guild only
            const battleChannelManager = new BattleChannelManager(client);
            await battleChannelManager.updateChannels(guildId);

            // Update the reply
            if (message.commandName === 'syncfromdays') {
                await message.editReply({ 
                    content: `✅ Sync complete! Fetched battles from ${days} days ago for this guild.`, 
                    ephemeral: true 
                });
            }
        } catch (error) {
            console.error('Error in syncfromdays command:', error);
            if (message.commandName === 'syncfromdays') {
                if (message.replied || message.deferred) {
                    await message.editReply({ 
                        content: '❌ Error during sync', 
                        ephemeral: true 
                    });
                } else {
                    await message.reply({ 
                        content: '❌ Error during sync', 
                        ephemeral: true 
                    });
                }
            }
        }
    }
});

module.exports = command; 