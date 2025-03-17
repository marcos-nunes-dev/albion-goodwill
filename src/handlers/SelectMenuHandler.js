const fs = require('fs');
const path = require('path');

class SelectMenuHandler {
    constructor() {
        this.selectMenus = new Map();
        this.loadSelectMenus();
    }

    loadSelectMenus() {
        const selectMenusPath = path.join(__dirname, 'selectMenus');
        const selectMenuFiles = fs.readdirSync(selectMenusPath).filter(file => file.endsWith('.js'));

        for (const file of selectMenuFiles) {
            const selectMenu = require(path.join(selectMenusPath, file));
            if (selectMenu.customId && selectMenu.execute) {
                console.log(`Loading select menu: ${selectMenu.customId}`);
                this.selectMenus.set(selectMenu.customId, selectMenu);
            }
        }
    }

    async handleSelectMenu(interaction) {
        if (!interaction.isStringSelectMenu()) return;

        const selectMenu = this.selectMenus.get(interaction.customId);
        if (!selectMenu) {
            console.error(`No select menu handler found for ${interaction.customId}`);
            return;
        }

        try {
            await selectMenu.execute(interaction);
        } catch (error) {
            console.error(`Error executing select menu ${interaction.customId}:`, error);
            try {
                const reply = interaction.deferred || interaction.replied
                    ? interaction.editReply.bind(interaction)
                    : interaction.reply.bind(interaction);

                await reply({
                    content: 'There was an error while executing this select menu!',
                    ephemeral: true
                });
            } catch (e) {
                console.error('Failed to send error message:', e);
            }
        }
    }
}

module.exports = SelectMenuHandler;
