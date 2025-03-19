const { CommandInteraction } = require('discord.js');

class Command {
    constructor(options) {
        this.name = options.name;
        this.description = options.description;
        this.category = options.category;
        this.aliases = options.aliases || [];
        this.usage = options.usage || '';
        this.examples = options.examples || [];
        this.permissions = options.permissions || [];
        this.cooldown = options.cooldown || 3;
        this.ownerOnly = options.ownerOnly || false;
        this.guildOnly = options.guildOnly || false;
        this.execute = options.execute;
    }

    /**
     * @param {CommandInteraction} interaction
     */
    async run(interaction) {
        try {
            await this.execute(interaction);
        } catch (error) {
            console.error(`Error executing ${this.name}:`, error);
            const reply = {
                content: 'There was an error executing this command!',
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

module.exports = Command;