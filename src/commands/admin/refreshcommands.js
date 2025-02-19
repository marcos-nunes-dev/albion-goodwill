const Command = require('../../structures/Command');
const { registerSlashCommands } = require('../../slashCommands/registerCommands');

module.exports = new Command({
    name: 'refreshcommands',
    description: 'Refresh and re-register all slash commands',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    cooldown: 30,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'refreshcommands';
            
            // Initial response
            const initialResponse = 'Recarregando comandos slash...';
            if (isSlash) {
                await message.reply({ content: initialResponse, ephemeral: true });
            } else {
                await message.reply(initialResponse);
            }

            // Wait for client to be ready
            await message.client.application?.commands.fetch();
            
            // Register commands
            await registerSlashCommands(message.client);

            const successResponse = 'Comandos slash recarregados com sucesso!';
            if (isSlash) {
                if (message.replied) {
                    await message.editReply(successResponse);
                } else {
                    await message.reply({ content: successResponse, ephemeral: true });
                }
            } else {
                await message.channel.send(successResponse);
            }
        } catch (error) {
            console.error('Error refreshing commands:', error);
            const errorResponse = 'Erro ao recarregar comandos slash.';
            if (isSlash) {
                if (message.replied) {
                    await message.editReply(errorResponse);
                } else {
                    await message.reply({ content: errorResponse, ephemeral: true });
                }
            } else {
                await message.channel.send(errorResponse);
            }
        }
    }
}); 