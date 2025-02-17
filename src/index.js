require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const VoiceTracker = require('./handlers/VoiceTracker');
const MessageTracker = require('./handlers/MessageTracker');
const prisma = require('./config/prisma');
const { formatDuration } = require('./utils/timeUtils');
const CommandHandler = require('./handlers/CommandHandler');
const ActivityAggregator = require('./services/ActivityAggregator');

console.log('Starting bot...');
console.log('Checking environment variables:');
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

const voiceTracker = new VoiceTracker(prisma);
const messageTracker = new MessageTracker();
const commandHandler = new CommandHandler();
const activityAggregator = new ActivityAggregator();

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log('Bot is ready!');
  
  // Track all users already in voice channels when bot starts
  try {
    for (const guild of client.guilds.cache.values()) {
      const voiceStates = guild.voiceStates.cache;
      
      for (const voiceState of voiceStates.values()) {
        if (voiceState.channelId) {  // If user is in a voice channel
          await voiceTracker.handleVoiceJoin(
            voiceState.member.user.id,
            voiceState.member.user.username,
            voiceState
          );
          console.log(`Tracked existing voice user: ${voiceState.member.user.username}`);
        }
      }
    }
  } catch (error) {
    console.error('Error tracking existing voice users:', error);
  }

  console.log('Servers:', client.guilds.cache.map(g => g.name));
  console.log('Command prefix:', commandHandler.prefix);
});

client.on('error', (error) => {
  console.error('Client error:', error);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    
    console.log('New message:', {
      content: message.content,
      author: message.author.username,
      channel: message.channel.name,
      guild: message.guild?.name,
      permissions: message.guild?.members.me?.permissions.toArray(),
      canSendMessages: message.channel.permissionsFor(client.user)?.has('SendMessages'),
      canViewChannel: message.channel.permissionsFor(client.user)?.has('ViewChannel'),
    });

    // Track message
    await messageTracker.handleMessage(message);

    // Handle commands
    await commandHandler.handleCommand(message);
  } catch (error) {
    console.error('Error processing message:', error);
    console.error(error.stack);
  }
});

client.on('voiceStateUpdate', (oldState, newState) => {
  voiceTracker.handleVoiceStateUpdate(oldState, newState);
});

// Replace the existing aggregation interval with this:
setInterval(async () => {
  const now = new Date();
  
  try {
    // Run weekly aggregation on Sunday at midnight
    if (now.getDay() === 0 && now.getHours() === 0 && now.getMinutes() === 0) {
      console.log('Running weekly aggregation...');
      await activityAggregator.aggregateWeeklyStats();
    }

    // Run monthly aggregation on the 1st of each month at midnight
    if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
      console.log('Running monthly aggregation...');
      await activityAggregator.aggregateMonthlyStats();
    }

    // Run daily aggregation at midnight
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      console.log('Running daily cleanup...');
      // Optionally clean up old daily data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      await prisma.dailyActivity.deleteMany({
        where: {
          date: {
            lt: thirtyDaysAgo
          }
        }
      });
    }
  } catch (error) {
    console.error('Error during scheduled aggregation:', error);
  }
}, 60000); // Check every minute

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

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Login successful!'))
  .catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
  }); 