const Command = require('../../structures/Command');
const languageManager = require('../../utils/languageUtils');

module.exports = new Command({
    name: 'ping',
    description: 'Check bot latency',
    category: 'info',
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const language = await handler.getGuildLanguage(message.guild.id);
            const sent = await message.reply(languageManager.translate('commands.ping.checking', language));
            const latency = sent.createdTimestamp - message.createdTimestamp;
            const wsLatency = message.client.ws.ping;
            
            await sent.edit(languageManager.translate('commands.ping.response', language, {
                latency,
                apiLatency: wsLatency
            }));
        } catch (error) {
            console.error('Error in ping command:', error);
            const language = await handler.getGuildLanguage(message.guild.id);
            await message.reply(languageManager.translate('commands.ping.error', language));
        }
    }
}); 