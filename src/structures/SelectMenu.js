const { StringSelectMenuInteraction } = require('discord.js');

class SelectMenu {
    constructor(options) {
        this.customId = options.customId;
        this.execute = options.execute;
    }

    /**
     * @param {StringSelectMenuInteraction} interaction
     */
    async run(interaction) {
        try {
            await this.execute(interaction);
        } catch (error) {
            console.error(`Error executing select menu ${this.customId}:`, error);
            const reply = {
                content: 'There was an error processing your selection!',
                ephemeral: true
            };
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }
}

module.exports = SelectMenu;
