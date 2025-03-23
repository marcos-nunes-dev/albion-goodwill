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
            if (selectMenu.customId) {
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
            await selectMenu.run(interaction);
        } catch (error) {
            console.error(`Error executing select menu ${interaction.customId}:`, error);
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

module.exports = SelectMenuHandler;
