const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');
const { updateBattleLogChannelName } = require('../../utils/battleStats');

module.exports = new Command({
    name: 'battleregister',
    description: 'Register a battle against enemy guilds',
    category: 'albion',
    permissions: [],
    cooldown: 5,
    async execute(message, args, handler) {
        try {
            const isSlash = message.commandName === 'battleregister';

            // Get guild settings first
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: message.guildId }
            });

            // Check if guild is properly configured
            if (!settings?.albionGuildId || !settings?.guildName) {
                const setupEmbed = new EmbedBuilder()
                    .setTitle('❌ Guild Not Configured')
                    .setDescription([
                        'This guild needs to be configured before using battle registration.',
                        '',
                        '**Required Settings Missing:**',
                        !settings?.albionGuildId ? '• Albion Guild ID' : '',
                        !settings?.guildName ? '• Guild Name' : '',
                        '',
                        'Please ask an administrator to use the `/setup` command to configure these settings.'
                    ].filter(Boolean).join('\n'))
                    .setColor(Colors.Red)
                    .setTimestamp();

                return await message.reply({
                    embeds: [setupEmbed],
                    ephemeral: true
                });
            }

            // Get parameters based on command type
            const enemyGuildsStr = message.options.getString('enemies');
            const dateOption = message.options.getString('date');
            const timeStr = message.options.getString('time');
            const customDate = message.options.getString('custom_date');
            const isVictory = message.options.getBoolean('victory');
            const kills = message.options.getInteger('kills') ?? 0; // Default to 0 if not provided
            const deaths = message.options.getInteger('deaths') ?? 0; // Default to 0 if not provided
            const battleUrl = message.options.getString('url');
            
            // Handle date based on selection
            let dateStr;
            const now = new Date();
            
            switch (dateOption) {
                case 'today':
                    dateStr = now.toISOString().split('T')[0];
                    break;
                case 'yesterday':
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    dateStr = yesterday.toISOString().split('T')[0];
                    break;
                case '2days':
                    const twoDaysAgo = new Date(now);
                    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
                    dateStr = twoDaysAgo.toISOString().split('T')[0];
                    break;
                case '3days':
                    const threeDaysAgo = new Date(now);
                    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                    dateStr = threeDaysAgo.toISOString().split('T')[0];
                    break;
                case 'custom':
                    if (!customDate) {
                        return await message.reply({
                            content: 'Please provide a custom date in YYYY-MM-DD format when selecting Custom Date option.',
                            ephemeral: true
                        });
                    }
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
                        return await message.reply({
                            content: 'Invalid custom date format. Please use YYYY-MM-DD format.',
                            ephemeral: true
                        });
                    }
                    dateStr = customDate;
                    break;
                default:
                    return await message.reply({
                        content: 'Invalid date option selected.',
                        ephemeral: true
                    });
            }

            // Combine date and time
            const battleTime = new Date(`${dateStr}T${timeStr}:00Z`);
            if (isNaN(battleTime.getTime())) {
                return await message.reply({
                    content: 'Invalid date/time combination. Please check your input.',
                    ephemeral: true
                });
            }

            // Split and trim enemy guild names
            const enemyGuilds = enemyGuildsStr.split(',').map(guild => guild.trim()).filter(guild => guild.length > 0);

            if (enemyGuilds.length === 0) {
                return await message.reply({
                    content: 'Please provide at least one enemy guild name.',
                    ephemeral: true
                });
            }

            // Create the battle registration
            await prisma.battleRegistration.create({
                data: {
                    userId: isSlash ? message.user.id : message.author.id,
                    guildId: message.guildId,
                    battleTime,
                    enemyGuilds,
                    isVictory,
                    kills,
                    deaths,
                    battleUrl: battleUrl || null
                }
            });

            // After successfully registering the battle, update the channel name
            if (settings.battlelogChannelId) {
                await updateBattleLogChannelName(message.guild, settings.battlelogChannelId);
            }

            const formattedTime = battleTime.toISOString().replace('T', ' ').slice(0, -5) + ' UTC';
            const result = isVictory ? '🏆 Victory' : '💀 Defeat';
            const kdStr = kills > 0 || deaths > 0 ? `\n**K/D:** ${kills}/${deaths} (${(kills/(deaths || 1)).toFixed(2)})` : '';
            
            const battleEmbed = new EmbedBuilder()
                .setTitle('⚔️ Battle Registration')
                .setDescription([
                    `**Time:** ${formattedTime}`,
                    `**Result:** ${result}`,
                    `**Enemy Guilds:** ${enemyGuilds.join(', ')}`,
                    kdStr,
                    battleUrl ? `**Battle Report:** [View Report](${battleUrl})` : ''
                ].filter(Boolean).join('\n'))
                .setColor(isVictory ? Colors.Green : Colors.Red)
                .setTimestamp()
                .setFooter({
                    text: `Registered by ${isSlash ? message.user.tag : message.author.tag}`
                });

            await message.reply({
                embeds: [battleEmbed],
                ephemeral: false
            });

        } catch (error) {
            console.error('Error in battleregister command:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Battle Registration Error')
                .setDescription('An error occurred while registering the battle. Please try again.')
                .setColor(Colors.Red)
                .setTimestamp();

            const user = message.user || message.author;
            errorEmbed.setFooter({
                text: `Attempted by ${user.tag}`
            });

            await message.reply({
                embeds: [errorEmbed],
                ephemeral: true
            });
        }
    }
}); 