/**
 * Handles errors consistently across commands
 * @param {Error} error - The error object
 * @param {Interaction} interaction - The Discord interaction
 * @param {Message} [message] - Optional message object
 */
async function handleError(error, interaction, message = null) {
    console.error('Command error:', error);

    const errorMessage = 'An error occurred while processing your request. Please try again later.';
    
    try {
        if (message && !message.deleted) {
            await message.delete().catch(() => {});
        }

        if (interaction.deferred) {
            await interaction.editReply({ content: errorMessage, ephemeral: true });
        } else if (!interaction.replied) {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    } catch (replyError) {
        console.error('Error while handling error:', replyError);
    }
}

module.exports = {
    handleError
};
