require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const VoiceTracker = require('./handlers/VoiceTracker');
const MessageTracker = require('./handlers/MessageTracker');
const prisma = require('./config/prisma');
const { formatDuration } = require('./utils/timeUtils');
const CommandHandler = require('./handlers/CommandHandler');
const AutocompleteHandler = require('./handlers/AutocompleteHandler');
const GuildManager = require('./services/GuildManager');
const { registerSlashCommands } = require('./slashCommands/registerCommands');
const logger = require('./utils/logger');

console.log('Starting bot...');
console.log('Checking required environment variables...');
console.log('- DISCORD_TOKEN:', process.env.DISCORD_TOKEN ? 'Found' : 'Missing');
console.log('- DATABASE_URL:', process.env.DATABASE_URL ? 'Found' : 'Missing');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages,
  ]
});

// Initialize services in correct order
const guildManager = new GuildManager();
const voiceTracker = new VoiceTracker(prisma, guildManager);
const messageTracker = new MessageTracker();
const commandHandler = new CommandHandler();
const autocompleteHandler = new AutocompleteHandler(client);

// Update railway.toml settings
let serverStarted = false;

// Add environment validation
const requiredEnvVars = ['DISCORD_TOKEN', 'DATABASE_URL'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  logger.error('Missing required environment variables', { missing: missingVars });
  process.exit(1);
}

// Start server only after bot is ready
client.once('ready', async () => {
  client.user.setActivity('Monitorando atividade', { type: 'WATCHING' });
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

    // Start server after initialization
    if (!serverStarted) {
      serverStarted = true;
      console.log('HTTP server started');
    }
  } catch (error) {
    logger.error('Initialization failed', { error: error.message });
    process.exit(1);
  }
});

client.on('error', (error) => {
  console.error('Client error:', error);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    await messageTracker.handleMessage(message);
    await commandHandler.handleCommand(message);
  } catch (error) {
    console.error('Message handling error:', error.message);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    await voiceTracker.handleVoiceStateUpdate(oldState, newState);
  } catch (error) {
    console.error('Voice state update error:', error);
  }
});

// Add periodic check (every 5 minutes)
setInterval(async () => {
  try {
    console.log('Running periodic voice state check...');
    
    // Run cleanup first
    await voiceTracker.cleanupStaleSessions();

    for (const guild of client.guilds.cache.values()) {
      // Get all current voice states
      const currentVoiceStates = guild.voiceStates.cache;
      
      // Get all active sessions from database
      const activeSessions = await prisma.voiceSession.findMany({
        where: { isActive: true }
      });

      // Check for users who left but weren't tracked
      for (const session of activeSessions) {
        const voiceState = currentVoiceStates.get(session.userId);
        if (!voiceState || !voiceState.channelId) {
          console.log(`Found untracked leave for user ${session.username}`);
          await voiceTracker.handleVoiceLeave(session.userId);
        }
      }

      // Check for new users who weren't tracked
      for (const [userId, voiceState] of currentVoiceStates) {
        if (voiceState.channelId) {
          const hasActiveSession = await prisma.voiceSession.findFirst({
            where: {
              userId,
              isActive: true
            }
          });

          if (!hasActiveSession) {
            console.log(`Found untracked join for user ${voiceState.member.user.username}`);
            await voiceTracker.handleVoiceJoin(
              userId,
              voiceState.member.user.username,
              voiceState
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in periodic voice state check:', error);
  }
}, 5 * 60 * 1000); // Run every 5 minutes

console.log('Bot permissions:', client.application?.flags.toArray());

client.on('debug', (info) => {
  if (!info.includes('heartbeat')) {  // Filter out heartbeat messages
    console.log('Debug:', info);
  }
});

client.on('warn', (info) => {
  console.warn('Warning:', info);
});

client.on('guildCreate', async (guild) => {
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

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      await autocompleteHandler.handleAutocomplete(interaction);
    } else {
      await commandHandler.handleInteraction(interaction);
    }
  } catch (error) {
    console.error('Interaction error:', error.message);
  }
});

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Login successful!'))
  .catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
  });

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Gracefully close database connection
  prisma.$disconnect()
    .then(() => process.exit(1))
    .catch(() => process.exit(1));
});

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  try {
    // Close Discord client
    client.destroy();
    
    // Close database connection
    await prisma.$disconnect();
    
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Add cleanup interval
setInterval(async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [deletedActivities, deletedSessions] = await Promise.all([
      prisma.dailyActivity.deleteMany({
        where: { date: { lt: thirtyDaysAgo } }
      }),
      prisma.voiceSession.deleteMany({
        where: { joinTime: { lt: thirtyDaysAgo } }
      })
    ]);

    logger.info('Cleanup completed', { 
      deletedActivities: deletedActivities.count,
      deletedSessions: deletedSessions.count
    });
  } catch (error) {
    logger.error('Cleanup failed', { error: error.message });
  }
}, 24 * 60 * 60 * 1000); 