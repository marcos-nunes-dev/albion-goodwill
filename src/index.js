require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const VoiceTracker = require("./handlers/VoiceTracker");
const MessageTracker = require("./handlers/MessageTracker");
const prisma = require("./config/prisma");
const { formatDuration } = require("./utils/timeUtils");
const CommandHandler = require("./handlers/CommandHandler");
const AutocompleteHandler = require("./handlers/AutocompleteHandler");
const SelectMenuHandler = require("./handlers/SelectMenuHandler");
const GuildManager = require("./services/GuildManager");
const BattleChannelManager = require("./services/BattleChannelManager");
const BattleSyncManager = require("./services/BattleSyncManager");
const { registerSlashCommands } = require("./slashCommands/registerCommands");
const logger = require("./utils/logger");
const { getSharedClient } = require("./config/discordClient");
const cron = require("node-cron");
const proxyRouter = require("./api/proxy");

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.use("/api", proxyRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

console.log("Starting bot...");
console.log("Checking required environment variables...");
console.log(
  "- DISCORD_TOKEN:",
  process.env.DISCORD_TOKEN ? "Found" : "Missing"
);
console.log("- DATABASE_URL:", process.env.DATABASE_URL ? "Found" : "Missing");

// Add environment validation
const requiredEnvVars = ["DISCORD_TOKEN", "DATABASE_URL"];
const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  logger.error("Missing required environment variables", {
    missing: missingVars,
  });
  process.exit(1);
}

// Initialize services
const guildManager = new GuildManager();
const voiceTracker = new VoiceTracker(prisma, guildManager);
const messageTracker = new MessageTracker(prisma, guildManager);
const commandHandler = new CommandHandler();
const selectMenuHandler = new SelectMenuHandler();
const autocompleteHandler = new AutocompleteHandler();

// Update railway.toml settings
let serverStarted = false;

async function initializeBot() {
  try {
    // Initialize the shared Discord client
    const client = await getSharedClient();
    logger.info("Shared Discord client initialized");

    // Set up event handlers
    client.once("ready", async () => {
      client.user.setActivity("Monitorando atividade", { type: "WATCHING" });
      logger.info(`Bot logged in`, { username: client.user.tag });

      try {
        // Register slash commands
        await registerSlashCommands(client);

        // Initialize settings for all current guilds
        for (const guild of client.guilds.cache.values()) {
          await guildManager.initializeGuild(guild);

          // Track voice users
          const voiceStates = guild.voiceStates.cache;
          for (const voiceState of voiceStates.values()) {
            if (voiceState.channelId) {
              await voiceTracker.handleVoiceJoin(
                voiceState.member.user.id,
                voiceState.member.user.username,
                voiceState
              );
            }
          }
        }
        console.log(`Initialized ${client.guilds.cache.size} servers`);

        // Initialize managers
        const battleSyncManager = new BattleSyncManager(client);
        const battleChannelManager = new BattleChannelManager(client);

        // Start battle channel manager
        logger.info("Battle channel manager initialized");

        // Set up hourly cron job for battle sync
        cron.schedule("0 * * * *", async () => {
          try {
            logger.info("Starting hourly battle sync...");

            // Get all guilds with battle log channels
            const guildsWithChannels = await prisma.guildSettings.findMany({
              where: {
                battlelogChannelId: {
                  not: null,
                },
              },
            });

            // Send temporary status message to each channel
            const statusMessages = [];
            for (const guild of guildsWithChannels) {
              try {
                const channel = await client.channels.fetch(
                  guild.battlelogChannelId
                );
                if (channel) {
                  const statusMsg = await channel.send({
                    embeds: [
                      {
                        title: "🔄 Auto-Sync Started",
                        description: "Checking for new battles...",
                        color: 0x3498db,
                        footer: {
                          text: "This message will be deleted after sync completes",
                        },
                      },
                    ],
                  });
                  statusMessages.push(statusMsg);
                }
              } catch (error) {
                logger.error(
                  `Error sending status to channel ${guild.battlelogChannelId}:`,
                  error
                );
              }
            }

            // Run battle sync
            const results = await battleSyncManager.syncBattles();
            logger.info("Battle sync completed", results);

            // Force update battle channels after sync
            await battleChannelManager.updateChannels();
            logger.info("Battle channel update completed");

            // Delete status messages after a delay
            setTimeout(async () => {
              for (const msg of statusMessages) {
                try {
                  await msg.delete();
                } catch (error) {
                  logger.error("Error deleting status message:", error);
                }
              }
            }, 5000); // Delete after 5 seconds
          } catch (error) {
            logger.error("Error in hourly battle sync:", error);
          }
        });

        // Start server after initialization
        if (!serverStarted) {
          serverStarted = true;
          console.log("HTTP server started");
        }
      } catch (error) {
        logger.error("Initialization failed", { error: error.message });
        process.exit(1);
      }
    });

    client.on("error", (error) => {
      logger.error("Client error:", error);
    });

    client.on("messageCreate", async (message) => {
      try {
        if (message.author.bot) return;
        await messageTracker.handleMessage(message);
        await commandHandler.handleCommand(message);
      } catch (error) {
        console.error("Message handling error:", error.message);
      }
    });

    client.on("interactionCreate", async (interaction) => {
      try {
        if (interaction.isAutocomplete()) {
          await autocompleteHandler.handleAutocomplete(interaction);
        } else if (interaction.isStringSelectMenu()) {
          await selectMenuHandler.handleSelectMenu(interaction);
        } else {
          await commandHandler.handleInteraction(interaction);
        }
      } catch (error) {
        console.error("Interaction handling error:", error);
      }
    });

    client.on("voiceStateUpdate", async (oldState, newState) => {
      try {
        await voiceTracker.handleVoiceStateUpdate(oldState, newState);
      } catch (error) {
        console.error("Voice state update error:", error);
      }
    });

    // Add periodic check (every 5 minutes)
    let periodicCheckInterval;
    async function runPeriodicCheck() {
      try {
        console.log("Running periodic voice state check...");

        // Run cleanup first
        await voiceTracker.cleanupStaleSessions();

        for (const guild of client.guilds.cache.values()) {
          try {
            // Get all current voice states
            const currentVoiceStates = guild.voiceStates.cache;

            // Get all active sessions from database
            const activeSessions = await prisma.voiceSession.findMany({
              where: {
                isActive: true,
                guildId: guild.id, // Add guildId filter for better performance
              },
            });

            // Create a map of current voice states for faster lookup
            const currentVoiceStateMap = new Map(
              Array.from(currentVoiceStates.entries()).map(
                ([userId, state]) => [userId, state]
              )
            );

            // Check for users who left but weren't tracked
            for (const session of activeSessions) {
              const voiceState = currentVoiceStateMap.get(session.userId);
              if (!voiceState || !voiceState.channelId) {
                console.log(
                  `Found untracked leave for user ${session.username} in guild ${guild.name}`
                );
                await voiceTracker.handleVoiceLeave(session.userId);
              }
            }

            // Check for new users who weren't tracked
            for (const [userId, voiceState] of currentVoiceStates) {
              if (voiceState.channelId) {
                const hasActiveSession = activeSessions.some(
                  (session) => session.userId === userId && session.isActive
                );

                if (!hasActiveSession) {
                  console.log(
                    `Found untracked join for user ${voiceState.member.user.username} in guild ${guild.name}`
                  );
                  await voiceTracker.handleVoiceJoin(
                    userId,
                    voiceState.member.user.username,
                    voiceState
                  );
                }
              }
            }
          } catch (guildError) {
            console.error(`Error processing guild ${guild.name}:`, guildError);
            // Continue with next guild even if one fails
            continue;
          }
        }
      } catch (error) {
        console.error("Error in periodic voice state check:", error);
        // Restart the interval if it fails
        clearInterval(periodicCheckInterval);
        periodicCheckInterval = setInterval(runPeriodicCheck, 5 * 60 * 1000);
      }
    }

    // Start the periodic check
    periodicCheckInterval = setInterval(runPeriodicCheck, 5 * 60 * 1000);

    console.log("Bot permissions:", client.application?.flags.toArray());

    client.on("debug", (info) => {
      if (!info.includes("heartbeat")) {
        // Filter out heartbeat messages
        console.log("Debug:", info);
      }
    });

    client.on("warn", (info) => {
      console.warn("Warning:", info);
    });

    client.on("guildCreate", async (guild) => {
      console.log(`Joined new guild: ${guild.name}`);
      try {
        // Initialize guild settings
        await guildManager.initializeGuild(guild);

        // Track existing voice users
        const voiceStates = guild.voiceStates.cache;
        for (const voiceState of voiceStates.values()) {
          if (voiceState.channelId) {
            await voiceTracker.handleVoiceJoin(
              voiceState.member.user.id,
              voiceState.member.user.username,
              voiceState
            );
          }
        }
      } catch (error) {
        console.error(`Error initializing guild ${guild.name}:`, error);
      }
    });

    // Set up shutdown handlers
    async function shutdown(signal) {
      console.log(`${signal} received. Shutting down gracefully...`);
      try {
        // Close Discord client
        client.destroy();

        // Close database connection
        await prisma.$disconnect();

        console.log("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        console.error("Error during shutdown:", error);
        process.exit(1);
      }
    }

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Handle unhandled rejections and exceptions
    process.on("unhandledRejection", (error) => {
      console.error("Unhandled promise rejection:", error);
    });

    process.on("uncaughtException", (error) => {
      console.error("Uncaught exception:", error);
      // Gracefully close database connection
      prisma
        .$disconnect()
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });

    // Login with the token
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    logger.error("Failed to initialize bot:", error);
    process.exit(1);
  }
}

// Start the bot
initializeBot();
