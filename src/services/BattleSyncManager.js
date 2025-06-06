const prisma = require("../config/prisma");
const axios = require("axios");
const { EmbedBuilder, Colors } = require("discord.js");
const logger = require("../utils/logger");

class BattleSyncManager {
  constructor(client) {
    this.client = client;
    this.API_BASE_URL = "https://api.albionbb.com/us";
    this.REQUEST_DELAY = 1000; // 1 second between requests
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getGuildInfo(guildId) {
    try {
      const response = await axios.get(
        `${this.API_BASE_URL}/stats/guilds/${guildId}?minPlayers=10`
      );
      if (!Array.isArray(response.data) || response.data.length === 0) {
        return null;
      }
      return {
        guildName: response.data[0].guildName,
      };
    } catch (error) {
      logger.error("Error fetching guild info:", error);
      return null;
    }
  }

  async getBattleDetails(battleId) {
    try {
      const response = await axios.get(
        `${this.API_BASE_URL}/battles/kills?ids=${battleId}`
      );
      return Array.isArray(response.data) ? response.data : null;
    } catch (error) {
      logger.error(
        `Error fetching battle details for battle ${battleId}:`,
        error
      );
      return null;
    }
  }

  formatBattleDate(date) {
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async processBattle(battle, guildSettings, guildName) {
    if (!battle || !battle.startedAt || !battle.albionId) {
      logger.warn(
        `Invalid battle data received for guild ${guildSettings.guildId}`
      );
      return;
    }

    try {
      // Check if battle already registered
      const existingBattle = await prisma.battleRegistration.findFirst({
        where: {
          guildId: guildSettings.guildId,
          battleTime: new Date(battle.startedAt),
        },
      });

      if (existingBattle) {
        return;
      }

      // Get our guild's data from the battle
      const ourGuild = battle.guilds.find((g) => g.name === guildName);
      if (
        !ourGuild ||
        ourGuild.players < (guildSettings.minGuildPlayers || 14)
      ) {
        return;
      }

      // Get battle details
      const battleDetails = await this.getBattleDetails(battle.albionId);
      if (!battleDetails || !Array.isArray(battleDetails)) {
        return;
      }

      // Process battle details
      const ourKills = battleDetails.filter(
        (event) => event.Killer.GuildName === guildName
      ).length;

      const ourDeaths = battleDetails.filter(
        (event) => event.Victim.GuildName === guildName
      ).length;

      // Calculate if we won (more kills than deaths)
      const isVictory = ourKills > ourDeaths;

      // Get enemy guilds (excluding our guild)
      const enemyGuilds = battle.guilds
        .filter((g) => g.name !== guildName)
        .map((g) => g.name);

      // Create battle registration
      await prisma.battleRegistration.create({
        data: {
          guildId: guildSettings.guildId,
          userId: this.client.user.id,
          battleTime: new Date(battle.startedAt),
          enemyGuilds,
          deaths: ourDeaths,
          kills: ourKills,
          isVictory,
          battleUrl: `https://albionbb.com/battles/${battle.albionId}`,
        },
      });

      logger.info(
        `Saved battle ${battle.albionId} - ${
          isVictory ? "Victory" : "Defeat"
        } (${ourKills}/${ourDeaths}) vs ${enemyGuilds.join(", ")}`
      );

      // Send webhook if configured
      if (guildSettings.battlelogWebhook) {
        try {
          const webhookMessage = {
            embeds: [
              {
                title: isVictory ? "🏆 Victory!" : "💀 Defeat",
                description: `Battle against ${enemyGuilds.join(", ")}`,
                color: isVictory ? 0x00ff00 : 0xff0000,
                fields: [
                  {
                    name: "Stats",
                    value: `Kills: ${ourKills}\nDeaths: ${ourDeaths}`,
                    inline: true,
                  },
                  {
                    name: "Time",
                    value: new Date(battle.startedAt)
                      .toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                      .replace(",", ""),
                    inline: true,
                  },
                  {
                    name: "Battle Report",
                    value: `[View on Battleboard](https://albionbb.com/battles/${battle.albionId})`,
                    inline: true,
                  },
                ],
                timestamp: new Date(battle.startedAt).toISOString(),
              },
            ],
          };

          await axios.post(guildSettings.battlelogWebhook, webhookMessage);
        } catch (error) {
          logger.error(
            `Error sending webhook for guild ${guildSettings.guildId}:`,
            error
          );
        }
      }
    } catch (error) {
      logger.error(
        `Error processing battle ${battle.albionId} for guild ${guildSettings.guildId}:`,
        error
      );
    }
  }

  async syncBattles(customStartDate = null, specificGuildId = null) {
    try {
      logger.info("Starting battle sync...");

      // Get guild settings based on whether we're syncing for a specific guild or all guilds
      const guildsToSync = await prisma.guildSettings.findMany({
        where: {
          AND: [
            { albionGuildId: { not: null } },
            { battlelogChannelId: { not: null } },
            { battlelogWebhook: { not: null } },
            ...(specificGuildId ? [{ guildId: specificGuildId }] : [])
          ],
        },
      });

      if (guildsToSync.length === 0) {
        logger.info(specificGuildId 
          ? "No battle configuration found for the specified guild"
          : "No guilds found with complete battle configuration");
        return;
      }

      logger.info(`Found ${guildsToSync.length} guild${guildsToSync.length > 1 ? 's' : ''} to sync battles for`);

      for (const guildSettings of guildsToSync) {
        try {
          // Get guild info
          const guildInfo = await this.getGuildInfo(
            guildSettings.albionGuildId
          );
          if (!guildInfo) {
            continue;
          }

          // Get last battle time or use custom start date
          const lastBattle = await prisma.battleRegistration.findFirst({
            where: { guildId: guildSettings.guildId },
            orderBy: { battleTime: "desc" },
          });

          const lastBattleTime = lastBattle
            ? new Date(lastBattle.battleTime)
            : null;
          
          // Use custom start date if provided, otherwise default to 2 days ago
          const startDate = customStartDate || new Date();
          if (!customStartDate) {
            startDate.setDate(startDate.getDate() - 2);
          }

          let page = 1;
          let shouldContinue = true;

          while (shouldContinue) {
            // Get battles from API using guild's custom minimum player requirements
            logger.info(
              `Fetching battles page ${page} for guild ${guildInfo.guildName}...`
            );
            const response = await axios.get(
              `${this.API_BASE_URL}/battles?guildId=${
                guildSettings.albionGuildId
              }&minPlayers=${guildSettings.minTotalPlayers || 20}&page=${page}`
            );

            const battles = Array.isArray(response.data) ? response.data : [];
            if (battles.length === 0) {
              break;
            }

            let foundOldBattle = false;

            // Process each battle
            for (const battle of battles) {
              if (!battle || !battle.startedAt || !battle.albionId) {
                logger.warn(`Invalid battle data received on page ${page}`);
                continue;
              }

              const battleTime = new Date(battle.startedAt);

              // Stop if we hit a battle older than our cutoff
              if (lastBattleTime && battleTime <= lastBattleTime) {
                foundOldBattle = true;
                break;
              }

              // Skip battles older than 2 days if no last battle
              if (!lastBattleTime && battleTime < startDate) {
                foundOldBattle = true;
                break;
              }

              // Get our guild's data from the battle
              const ourGuild = battle.guilds.find(
                (g) => g.name === guildInfo.guildName
              );
              if (
                !ourGuild ||
                ourGuild.players < (guildSettings.minGuildPlayers || 14)
              ) {
                continue;
              }

              await this.processBattle(
                battle,
                guildSettings,
                guildInfo.guildName
              );

              // Rate limiting
              await this.sleep(this.REQUEST_DELAY);
            }

            if (foundOldBattle) {
              break;
            }

            page++;
          }
        } catch (error) {
          logger.error(
            `Error processing guild ${guildSettings.guildId}:`,
            error
          );
        }

        // Rate limiting between guilds
        await this.sleep(this.REQUEST_DELAY * 2);
      }

      logger.info("Battle sync complete");
    } catch (error) {
      logger.error("Error in battle sync:", error);
    }
  }
}

module.exports = BattleSyncManager;
