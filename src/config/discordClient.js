const { Client, GatewayIntentBits } = require('discord.js');

let sharedClient = null;

async function getSharedClient() {
    if (!sharedClient) {
        sharedClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.MessageContent
            ]
        });
        await sharedClient.login(process.env.DISCORD_TOKEN);
    }
    return sharedClient;
}

module.exports = {
    getSharedClient
}; 