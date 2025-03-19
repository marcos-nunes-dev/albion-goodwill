const prisma = require('../config/prisma');
const { Client } = require('discord.js');
const logger = require('../utils/logger'); 

class BattleChannelManager {
    /**
     * @param {Client} client - Discord.js client instance
     */
    constructor(client) {
        if (!client) {
            throw new Error('Discord client is required for BattleChannelManager');
        }
        this.client = client;
        logger.info('BattleChannelManager initialized with client');
        // Update channel names every 30 minutes
        this.updateInterval = 30 * 60 * 1000;
        this.isRunning = false;
        setInterval(() => this.updateChannels(), this.updateInterval);
    }

    /**
     * Start the battle channel update loop
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
    }

    /**
     * Stop the battle channel update loop
     */
    stop() {
        this.isRunning = false;
    }

    /**
     * Update all configured battle channels with current stats
     */
    async updateChannels() {
        const logger = this.client.logger;
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
                logger.info('No guilds with battlelog configuration found');
                return;
            }

            for (const guild of guildsToUpdate) {
                try {
                    await this.updateGuildChannel(guild);
                } catch (error) {
                    logger.error(`Error updating channel for guild ${guild.guildId}:`, error);
                }
            }
        } catch (error) {
            logger.error('Error updating battle channels:', error);
        }
    }

    /**
     * Update channel for a specific guild
     * @param {Object} guildSettings - Guild settings from database
     */
    async updateGuildChannel(guildSettings) {
        if (!guildSettings.battlelogChannelId) {
            logger.info(`No battle log channel set for guild ${guildSettings.guildId}`);
            return;
        }

        try {
            logger.info(`Getting battle stats for guild ${guildSettings.guildId}...`);
            
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

            logger.info(`Found ${stats.length} battles for guild ${guildSettings.guildId}`);

            // Calculate statistics
            const victories = stats.filter(b => b.isVictory).length;
            const total = stats.length;
            const losses = total - victories;
            const kills = stats.reduce((sum, b) => sum + (b.kills || 0), 0);
            const deaths = stats.reduce((sum, b) => sum + (b.deaths || 0), 0);

            // Format channel name
            const channelName = this.formatChannelName(victories, losses, kills, deaths);
            logger.info(`Calculated new channel name: ${channelName} for guild ${guildSettings.guildId}`);

            try {
                // Update Discord channel
                logger.info(`Fetching channel ${guildSettings.battlelogChannelId}...`);
                const channel = await this.client.channels.fetch(guildSettings.battlelogChannelId);
                
                if (!channel) {
                    logger.error(`Channel ${guildSettings.battlelogChannelId} not found for guild ${guildSettings.guildId}`);
                    return;
                }

                // Check bot permissions
                const botMember = channel.guild.members.cache.get(this.client.user.id);
                if (!botMember?.permissions.has('ManageChannels')) {
                    logger.error(`Bot lacks ManageChannels permission in guild ${guildSettings.guildId}`);
                    return;
                }

                if (channel.name !== channelName) {
                    logger.info(`Updating channel name from ${channel.name} to ${channelName}...`);
                    await channel.setName(channelName);
                    logger.info(`Successfully updated channel name for guild ${guildSettings.guildId}`);
                } else {
                    logger.info(`Channel name already up to date (${channelName}) for guild ${guildSettings.guildId}`);
                }
            } catch (error) {
                logger.error(`Error updating channel ${guildSettings.battlelogChannelId} for guild ${guildSettings.guildId}:`, error);
            }
        } catch (error) {
            logger.error(`Error getting stats for guild ${guildSettings.guildId}:`, error);
        }
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
}

module.exports = BattleChannelManager;
