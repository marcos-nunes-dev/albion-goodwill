const Command = require('../../structures/Command');
const { registerSlashCommands } = require('../../slashCommands/registerCommands');

module.exports = new Command({
    name: 'refreshcommands',
    description: 'Refresh and re-register all slash commands',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    usage: '',
    cooldown: 10,
    async execute(message, args, handler) {
        try {
            const reply = await message.reply('🔄 Refreshing slash commands...');
            
            await registerSlashCommands(handler.client);
            
            await reply.edit('✅ Successfully refreshed all slash commands!');
        } catch (error) {
            console.error('Error refreshing commands:', error);
            await message.reply('❌ Error refreshing slash commands. Check console for details.');
        }
    }
}); 