const Command = require('../../structures/Command');

module.exports = new Command({
    name: 'ping',
    description: 'Check bot latency',
    category: 'info',
    cooldown: 5,
    async execute(message, args) {
        try {
            const sent = await message.reply('Pinging...');
            const latency = sent.createdTimestamp - message.createdTimestamp;
            const wsLatency = message.client.ws.ping;
            
            await sent.edit(`Pong! 🏓\nLatency: ${latency}ms\nAPI Latency: ${wsLatency}ms`);
        } catch (error) {
            console.error('Error in ping command:', error);
            await message.reply('Error checking latency!');
        }
    }
}); 