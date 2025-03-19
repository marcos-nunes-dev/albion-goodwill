const Command = require('../../structures/Command');
const { EmbedBuilder, Colors } = require('discord.js');
const BattleSyncManager = require('../../services/BattleSyncManager');
const BattleChannelManager = require('../../services/BattleChannelManager');

const command = new Command({
    name: 'syncnow',
    description: 'Force sync battles from Albion Online',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 0,
    async execute(message, args, handler) {
        const isSlash = message.commandName === 'syncnow';
        
        try {
            // Defer reply since this might take a while
            if (isSlash) {
                await message.deferReply({ ephemeral: true });
            }

            // Create status embed
            const statusEmbed = new EmbedBuilder()
                .setTitle('🔄 Battle Sync Started')
                .setDescription('Fetching battles from Albion Online...')
                .setColor(Colors.Blue)
                .setTimestamp();

            const reply = isSlash ? 
                await message.editReply({ embeds: [statusEmbed] }) :
                await message.reply({ embeds: [statusEmbed] });

            // Run battle sync
            const battleSyncManager = new BattleSyncManager();
            const results = await battleSyncManager.syncBattles();

            // Update battle channels
            const client = message.client || handler.client;
            const battleChannelManager = new BattleChannelManager(client);
            await battleChannelManager.updateChannels();

            // Create completion embed
            const completionEmbed = new EmbedBuilder()
                .setTitle('✅ Battle Sync Complete')
                .addFields([
                    {
                        name: 'Results',
                        value: [
                            `Guilds Processed: ${results.guildsProcessed}`,
                            `Battles Processed: ${results.battlesProcessed}`,
                            `Errors: ${results.errors}`,
                            `Channel Updates: Completed`
                        ].join('\n')
                    }
                ])
                .setColor(results.errors > 0 ? Colors.Yellow : Colors.Green)
                .setTimestamp();

            if (isSlash) {
                await message.editReply({ embeds: [completionEmbed] });
            } else {
                await reply.edit({ embeds: [completionEmbed] });
            }
        } catch (error) {
            console.error('Error in syncnow command:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while syncing battles.')
                .setColor(Colors.Red)
                .setTimestamp();

            if (isSlash) {
                await message.editReply({ embeds: [errorEmbed] });
            } else {
                await message.reply({ embeds: [errorEmbed] });
            }
        }
    }
});

module.exports = command;
