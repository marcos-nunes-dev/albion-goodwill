const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Command = require('../../structures/Command');
const { formatDuration, getWeekStart, getMonthStart } = require('../../utils/timeUtils');
const { fetchActivityData } = require('../../utils/activityUtils');

const ACTIVITY_THRESHOLD_PERCENTAGE = 5; // 5% of top 10 average
const ITEMS_PER_PAGE = 10;

module.exports = new Command({
    name: 'presencecheck',
    description: 'Check activity for a role',
    defaultMemberPermissions: ['ManageRoles'],
    options: [
        {
            name: 'role',
            description: 'Role to check activity for',
            type: 8,
            required: true
        },
        {
            name: 'period',
            description: 'Period to check activity for',
            type: 3,
            required: false,
            choices: [
                { name: 'Daily', value: 'daily' },
                { name: 'Weekly', value: 'weekly' },
                { name: 'Monthly', value: 'monthly' }
            ]
        }
    ],
    async execute(message, args, isSlash = false) {
        try {
            // For slash commands, defer the reply immediately
            if (isSlash) {
                await message.deferReply({ ephemeral: true });
            }

            // Get role based on command type
            const role = isSlash ? 
                message.options.getRole('role') : 
                message.mentions.roles.first();

            if (!role) {
                const errorMessage = '❌ Please specify a valid role.';
                if (isSlash) {
                    await message.editReply(errorMessage);
                } else {
                    await message.reply(errorMessage);
                }
                return;
            }

            // Get period based on command type (default to monthly)
            const period = isSlash ? 
                (message.options.getString('period') || 'monthly') : 
                (args.period || 'monthly');

            // Calculate start date based on period
            const now = new Date();
            let startDate;
            let title;

            switch (period) {
                case 'daily':
                    startDate = new Date(now);
                    startDate.setHours(0, 0, 0, 0);
                    title = 'Daily Activity Check';
                    break;
                case 'weekly':
                    startDate = getWeekStart(now);
                    title = 'Weekly Activity Check';
                    break;
                case 'monthly':
                default:
                    startDate = getMonthStart(now);
                    title = 'Monthly Activity Check';
                    break;
            }

            // Get role members
            const members = role.members;
            if (!members.size) {
                const errorMessage = '❌ No members found with this role.';
                if (isSlash) {
                    await message.editReply(errorMessage);
                } else {
                    await message.reply(errorMessage);
                }
                return;
            }

            // Get activity data for all members
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

            if (inactiveMembers.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle(`${title} - ${role.name}`)
                    .setColor(0x00FF00)
                    .setDescription('✅ All members are active!')
                    .setTimestamp();

                if (isSlash) {
                    await message.editReply({ embeds: [embed] });
                } else {
                    await message.reply({ embeds: [embed] });
                }
                return;
            }

            // Setup pagination
            const totalPages = Math.ceil(inactiveMembers.length / ITEMS_PER_PAGE);
            let currentPage = 0;

            // Create page embed
            const getPageEmbed = (page) => {
                const start = page * ITEMS_PER_PAGE;
                const end = Math.min(start + ITEMS_PER_PAGE, inactiveMembers.length);
                const pageMembers = inactiveMembers.slice(start, end);

                return new EmbedBuilder()
                    .setTitle(`${title} - ${role.name}`)
                    .setColor(0xFF4444)
                    .setDescription(pageMembers.map(({ displayName, voiceTime, percentage }) =>
                        `${displayName}\n• Voice Time: \`${formatDuration(voiceTime)}\`\n• Activity: \`${percentage}%\` of top average`
                    ).join('\n\n'))
                    .setFooter({ 
                        text: `Required Active Time: ${formatDuration(minimumThreshold)} • Total inactive: ${inactiveMembers.length} • Page ${page + 1}/${totalPages}` 
                    })
                    .setTimestamp();
            };

            // Create navigation buttons
            const getButtons = (page) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('first')
                        .setLabel('⏪ First')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId('last')
                        .setLabel('Last ⏩')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1)
                );
            };

            // Send initial message
            const initialEmbed = getPageEmbed(0);
            const initialButtons = getButtons(0);
            
            const response = await (isSlash ? 
                message.editReply({ embeds: [initialEmbed], components: [initialButtons] }) :
                message.reply({ embeds: [initialEmbed], components: [initialButtons] })
            );

            // Create button collector
            const collector = response.createMessageComponentCollector({
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (interaction) => {
                // Check if the interaction is from the command user
                if (interaction.user.id !== (isSlash ? message.user.id : message.author.id)) {
                    await interaction.reply({
                        content: 'Only the command user can navigate pages.',
                        ephemeral: true
                    });
                    return;
                }

                // Update current page based on button clicked
                switch (interaction.customId) {
                    case 'first':
                        currentPage = 0;
                        break;
                    case 'prev':
                        currentPage = Math.max(0, currentPage - 1);
                        break;
                    case 'next':
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                        break;
                    case 'last':
                        currentPage = totalPages - 1;
                        break;
                }

                // Update message with new page
                await interaction.update({
                    embeds: [getPageEmbed(currentPage)],
                    components: [getButtons(currentPage)]
                });
            });

            // Remove buttons when collector expires
            collector.on('end', () => {
                if (isSlash) {
                    message.editReply({ components: [] }).catch(() => {});
                } else {
                    response.edit({ components: [] }).catch(() => {});
                }
            });

        } catch (error) {
            console.error('Error in presencecheck command:', error);
            const errorMessage = 'An error occurred while checking role activity.';
            
            if (isSlash) {
                try {
                    await message.editReply(errorMessage);
                } catch {
                    // If editReply fails, try to send a new reply
                    await message.reply({ content: errorMessage, ephemeral: true });
                }
            } else {
                await message.reply(errorMessage);
            }
        }
    }
});