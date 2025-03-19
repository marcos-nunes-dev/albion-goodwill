const { Client } = require('discord.js');
const prisma = require('../config/prisma');

class BattleChannelManager {
    /**
     * @param {Client} client Discord.js client instance
     */
    constructor(client) {
        this.client = client;
        // Initialize default logger if client.logger is not available
        this.logger = client.logger || {
            info: console.log,
            error: console.error,
            warn: console.warn,
            debug: console.debug
        };
    }

    /**
     * Format channel name based on battle statistics
     * @param {number} victories - Number of victories
     * @param {number} losses - Number of losses
     * @param {number} kills - Number of kills
     * @param {number} deaths - Number of deaths
     * @returns {string} Formatted channel name
     */
    formatChannelName(victories, losses, kills, deaths) {
        const kd = deaths > 0 ? (kills / deaths).toFixed(1) : kills.toFixed(1);
        const winRate = (victories + losses) > 0 ? Math.round((victories / (victories + losses)) * 100) : 0;
        return `🏆${victories}-${losses}🩸${kd}🎯${winRate}%`;
    }

    /**
     * Update a guild's battle log channel name with current stats
     * @param {Object} guildSettings Guild settings
     */
    async updateGuildChannel(guildSettings) {
        try {
            // Get battle statistics
            const stats = await prisma.battleRegistration.findMany({
                where: {
                    guildId: guildSettings.guildId
                },
                select: {
                    isVictory: true,
                    kills: true,
                    deaths: true
                }
            });

            // Calculate stats
            const victories = stats.filter(b => b.isVictory).length;
            const losses = stats.length - victories;
            const kills = stats.reduce((sum, b) => sum + b.kills, 0);
            const deaths = stats.reduce((sum, b) => sum + b.deaths, 0);

            // Format channel name
            const channelName = this.formatChannelName(victories, losses, kills, deaths);

            // Get channel
            const channel = await this.client.channels.fetch(guildSettings.battlelogChannelId);
            if (!channel) {
                this.logger.error(`Channel ${guildSettings.battlelogChannelId} not found for guild ${guildSettings.guildId}`);
                return;
            }

            // Update channel name if different
            if (channel.name !== channelName) {
                await channel.setName(channelName);
                this.logger.info(`Updated channel name for guild ${guildSettings.guildId} to ${channelName}`);
            }
        } catch (error) {
            this.logger.error(`Error updating channel for guild ${guildSettings.guildId}:`, error);
        }
    }

    /**
     * Update all configured battle channels with current stats
     */
    async updateChannels() {
        try {
            // Get all guilds with battlelog channel configured
            const guildsToUpdate = await prisma.guildSettings.findMany({
                where: {
                    AND: [
                        { battlelogChannelId: { not: null } },
                        { battlelogWebhook: { not: null } }
                    ]
                }
            });

            if (guildsToUpdate.length === 0) {
                this.logger.info('No guilds with battlelog configuration found');
                return;
            }

            for (const guild of guildsToUpdate) {
                try {
                    await this.updateGuildChannel(guild);
                } catch (error) {
                    this.logger.error(`Error updating channel for guild ${guild.guildId}:`, error);
                }
            }
        } catch (error) {
            this.logger.error('Error updating battle channels:', error);
        }
    }
}

module.exports = BattleChannelManager;
