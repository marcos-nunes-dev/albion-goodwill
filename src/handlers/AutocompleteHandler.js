const prisma = require('../config/prisma');
const { fetchGuildStats } = require('../utils/albionApi');
const axios = require('axios');

class AutocompleteHandler {
    constructor(client) {
        this.client = client;
    }

    async handleAutocomplete(interaction) {
        const command = interaction.commandName;
        const focusedOption = interaction.options.getFocused(true);
        let choices = [];

        try {
            switch (command) {
                case 'canplay':
                case 'playermmr':
                    if (focusedOption.name === 'player' || focusedOption.name === 'compare_to') {
                        choices = await this.getPlayerChoices(interaction);
                    }
                    break;

                case 'register':
                case 'registerhim':
                    if (focusedOption.name === 'character') {
                        const region = interaction.options.getString('region');
                        if (region) {
                            choices = await this.searchAlbionPlayer(focusedOption.value, region);
                        }
                    }
                    break;
            }

            // Return up to 25 choices that match the focused value
            const filtered = choices
                .filter(choice => choice.toLowerCase().includes(focusedOption.value.toLowerCase()))
                .slice(0, 25)
                .map(choice => ({ name: choice, value: choice }));

            await interaction.respond(filtered);
        } catch (error) {
            console.error('Autocomplete error:', error);
            await interaction.respond([]);
        }
    }

    async getPlayerChoices(interaction) {
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId: interaction.guildId }
        });

        if (!settings?.albionGuildId) {
            return [];
        }

        try {
            // Fetch guild stats
            const guildStats = await fetchGuildStats(settings.albionGuildId);
            
            // Get competitor stats if configured
            let competitorStats = [];
            if (settings.competitorIds?.length) {
                const competitorPromises = settings.competitorIds.map(id => fetchGuildStats(id));
                competitorStats = (await Promise.all(competitorPromises)).flat();
            }

            // Combine and get unique player names
            const allPlayers = [...guildStats, ...competitorStats];
            return [...new Set(allPlayers.map(player => player.name))];
        } catch (error) {
            console.error('Error fetching player choices:', error);
            return [];
        }
    }

    async searchAlbionPlayer(query, region) {
        if (!query || query.length < 3) return [];

        try {
            const apiEndpoint = {
                'america': 'https://murderledger.albiononline2d.com',
                'europe': 'https://murderledger-europe.albiononline2d.com',
                'asia': 'https://murderledger-asia.albiononline2d.com'
            }[region];

            const response = await axios.get(
                `${apiEndpoint}/api/player-search/${encodeURIComponent(query)}`
            );

            return response.data.results || [];
        } catch (error) {
            console.error('Error searching Albion player:', error);
            return [];
        }
    }
}

module.exports = AutocompleteHandler; 