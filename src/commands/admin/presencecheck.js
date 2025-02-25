const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { formatDuration, getWeekStart, getMonthStart } = require('../../utils/timeUtils');
const { fetchActivityData } = require('../../utils/activityUtils');

const ACTIVITY_THRESHOLD_PERCENTAGE = 5; // 5% of top 10 average

module.exports = new Command({
    name: 'presencecheck',
    description: 'Check presence activity of members with a specific role',
    category: 'admin',
    permissions: ['ADMINISTRATOR'],
    usage: '@role [daily|weekly|monthly]',
    cooldown: 10,
    async execute(message, args, handler) {
        try {
            // Handle both slash commands and prefix commands
            const isSlash = message.commandName === 'presencecheck';
            
            // Get role based on command type
            const role = isSlash ? 
                message.options.getRole('role') : 
                message.mentions.roles.first();

            if (!role) {
                const response = 'Please mention a role to check.';
                if (isSlash) {
                    await message.reply({ content: response, ephemeral: true });
                } else {
                    await message.reply(response);
                }
                return;
            }

            // Get period (daily, weekly or monthly)
            const period = isSlash ?
                (message.options.getString('period') || 'monthly') :
                (args[1] || 'monthly');

            // Validate period
            const validPeriods = ['daily', 'weekly', 'monthly'];
            const normalizedPeriod = period.toLowerCase();
            
            if (!validPeriods.includes(normalizedPeriod)) {
                const response = 'Invalid period. Use: daily, weekly or monthly';
                if (isSlash) {
                    await message.reply({ content: response, ephemeral: true });
                } else {
                    await message.reply(response);
                }
                return;
            }

            // Get the appropriate date and table based on period 
            let startDate;
            let title;

            switch (normalizedPeriod) {
                case 'daily':
                    startDate = new Date();
                    startDate.setHours(0, 0, 0, 0);
                    title = 'Daily Activity Check';
                    break;
                case 'weekly':
                    startDate = getWeekStart(new Date());
                    title = 'Weekly Activity Check';
                    break;
                case 'monthly':
                    startDate = getMonthStart(new Date());
                    title = 'Monthly Activity Check';
                    break;
            }

            // Get role members
            const members = role.members;

            // Get activity data
            const activityData = await Promise.all(
                Array.from(members.values()).map(async (member) => {
                    const { data: stats } = await fetchActivityData({
                        userId: member.id,
                        guildId: message.guild.id,
                        period,
                        startDate
                    });
                    
                    return {
                        member,
                        stats
                    };
                })
            );

            // Calculate threshold from top performers
            const validData = activityData.filter(data => data.stats !== null);
            const topPerformers = validData
                .sort((a, b) => (b.stats?.voiceTimeSeconds || 0) - (a.stats?.voiceTimeSeconds || 0))
                .slice(0, 10);

            const topAvgVoiceTime = topPerformers.reduce((sum, data) =>
                sum + (data.stats?.voiceTimeSeconds || 0), 0) / (topPerformers.length || 1);

            const minimumThreshold = topAvgVoiceTime * (ACTIVITY_THRESHOLD_PERCENTAGE / 100);

            // Find inactive members
            const inactiveMembers = validData
                .filter(data => (data.stats?.voiceTimeSeconds || 0) < minimumThreshold)
                .map(data => {
                    const voiceTime = data.stats?.voiceTimeSeconds || 0;
                    const percentage = ((voiceTime / topAvgVoiceTime) * 100).toFixed(1);
                    
                    return {
                        member: data.member,
                        voiceTime,
                        percentage,
                        displayName: data.member.displayName || data.member.user.username
                    };
                })
                .sort((a, b) => b.voiceTime - a.voiceTime);

            // Setup pagination
            const itemsPerPage = 10;
            const pages = Math.ceil(inactiveMembers.length / itemsPerPage);
            let currentPage = 0;

            // Create page embed function
            const getPageEmbed = (page) => {
                const start = page * itemsPerPage;
                const end = Math.min(start + itemsPerPage, inactiveMembers.length);
                const pageMembers = inactiveMembers.slice(start, end);

                return new EmbedBuilder()
                    .setTitle(`${title} - ${role.name}`)
                    .setColor('#FF4444')
                    .setDescription(pageMembers.map(({ displayName, voiceTime, percentage }) =>
                        `${displayName}\n• Voice Time: ${formatDuration(voiceTime)}\n• Activity: ${percentage}% of top average`
                    ).join('\n\n'))
                    .setFooter({ 
                        text: `Required Active Time: ${formatDuration(minimumThreshold)} • Total inactive: ${inactiveMembers.length}` 
                    });
            };

            // Create navigation buttons
            const getButtons = (currentPage) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('first')
                        .setLabel('⏪ First')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === pages - 1),
                    new ButtonBuilder()
                        .setCustomId('last')
                        .setLabel('Last ⏩')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === pages - 1)
                );
            };

            // Send initial page
            const pageMessage = await (isSlash ?
                message.reply({
                    embeds: [getPageEmbed(0)],
                    components: [getButtons(0)]
                }) :
                message.channel.send({
                    embeds: [getPageEmbed(0)],
                    components: [getButtons(0)]
                })
            );

            // Create button collector
            const collector = pageMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (interaction) => {
                if (interaction.user.id !== (isSlash ? message.user.id : message.author.id)) {
                    await interaction.reply({ 
                        content: 'Only the command user can navigate pages.', 
                        ephemeral: true 
                    });
                    return;
                }

                switch (interaction.customId) {
                    case 'first':
                        currentPage = 0;
                        break;
                    case 'prev':
                        currentPage = Math.max(0, currentPage - 1);
                        break;
                    case 'next':
                        currentPage = Math.min(pages - 1, currentPage + 1);
                        break;
                    case 'last':
                        currentPage = pages - 1;
                        break;
                }

                await interaction.update({
                    embeds: [getPageEmbed(currentPage)],
                    components: [getButtons(currentPage)]
                });
            });

            collector.on('end', () => {
                pageMessage.edit({ components: [] }).catch(() => {});
            });

        } catch (error) {
            console.error('Role check error:', error);
            const response = 'Error checking role activity.';
            if (isSlash) {
                if (!message.replied) {
                    await message.reply({ content: response, ephemeral: true });
                } else {
                    await message.followUp({ content: response, ephemeral: true });
                }
            } else {
                await message.reply(response);
            }
        }
    }
}); 