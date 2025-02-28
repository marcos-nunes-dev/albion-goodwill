const Command = require('../../structures/Command');
const { EmbedBuilder } = require('discord.js');
const updateBattles = require('../../scripts/updateBattles');

module.exports = new Command({
    name: 'updatebattles',
    description: 'Manually trigger battle updates for pending registrations',
    category: 'admin',
    permissions: ['Administrator'],
    async execute(interaction) {
        try {
            // Initial response
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('Battle Update Process')
                        .setDescription('Starting battle update process...')
                ]
            });

            // Override console.log to collect messages
            const logs = [];
            const originalLog = console.log;
            const originalError = console.error;

            console.log = (...args) => {
                // Skip logging the battle details API response
                const message = args.join(' ');
                if (!message.includes('Battle details API response:')) {
                    logs.push(`ℹ️ ${message}`);
                }
                originalLog.apply(console, args);
            };

            console.error = (...args) => {
                logs.push(`❌ ${args.join(' ')}`);
                originalError.apply(console, args);
            };

            // Run the update process
            await updateBattles();

            // Restore console functions
            console.log = originalLog;
            console.error = originalError;

            // Send the results
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('Battle Update Process')
                        .setDescription(logs.join('\n') || 'No logs generated')
                ]
            });

        } catch (error) {
            console.error('Error in updatebattles command:', error);
            
            // Only send error response if we haven't replied yet
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('Error')
                            .setDescription('An error occurred while updating battles. Please check the logs.')
                    ],
                    ephemeral: true
                });
            }
        }
    }
}); 