const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Command = require('../../structures/Command');
const { formatDuration, getWeekStart, getMonthStart } = require('../../utils/timeUtils');
const { calculateActivityStats, fetchActivityData } = require('../../utils/activityUtils');

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
                        stats: stats || null // Ensure we have a null if no stats
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

            // Process all members
            const memberStats = activityData
                .map(data => {
                    const stats = data.stats;
                    const voiceTime = stats?.voiceTimeSeconds || 0;
                    const afkTime = stats?.afkTimeSeconds || 0;
                    const mutedTime = stats?.mutedDeafenedTimeSeconds || 0;
                    const totalTime = voiceTime || 1; // Prevent division by zero
                    const percentage = ((voiceTime / topAvgVoiceTime) * 100) || 0;
                    
                    return {
                        member: data.member,
                        voiceTime,
                        afkTime,
                        mutedTime,
                        percentage: percentage.toFixed(1),
                        displayName: data.member.displayName || data.member.user.username,
                        hasData: stats !== null,
                        isActive: voiceTime >= minimumThreshold
                    };
                })
                // Filter out active members
                .filter(member => !member.isActive)
                .sort((a, b) => {
                    // Sort by data presence first, then by voice time
                    if (a.hasData !== b.hasData) return b.hasData - a.hasData;
                    return b.voiceTime - a.voiceTime;
                });

            // Get active members for display
            const activeMembers = activityData
                .filter(data => (data.stats?.voiceTimeSeconds || 0) >= minimumThreshold)
                .length;

            if (memberStats.length === 0) {
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
            const totalPages = Math.ceil(memberStats.length / ITEMS_PER_PAGE);
            let currentPage = 0;

            // Create page embed
            const getPageEmbed = (page) => {
                const start = page * ITEMS_PER_PAGE;
                const end = Math.min(start + ITEMS_PER_PAGE, memberStats.length);
                const pageMembers = memberStats.slice(start, end);

                const description = pageMembers.map(({ displayName, voiceTime, afkTime, mutedTime, percentage, hasData }) => {
                    if (!hasData) {
                        return `${displayName}\n❌ No activity data recorded`;
                    }

                    const totalTime = voiceTime + afkTime + mutedTime || 1;
                    const activePercent = Math.round((voiceTime / totalTime) * 100) || 0;
                    const afkPercent = Math.round((afkTime / totalTime) * 100) || 0;
                    const mutedPercent = Math.round((mutedTime / totalTime) * 100) || 0;

                    return `${displayName} 🔴\n` +
                           `• Voice Time: \`${formatDuration(voiceTime)}\`\n` +
                           `• AFK Time: \`${formatDuration(afkTime)}\`\n` +
                           `• Muted Time: \`${formatDuration(mutedTime)}\`\n` +
                           `• Activity: \`${percentage}%\` of top average\n` +
                           `• Distribution: Active \`${activePercent}%\` | AFK \`${afkPercent}%\` | Muted \`${mutedPercent}%\``;
                }).join('\n\n');

                const totalMembers = role.members.size;
                const noDataCount = memberStats.filter(m => !m.hasData).length;
                const inactiveCount = memberStats.length - noDataCount;

                return new EmbedBuilder()
                    .setTitle(`${title} - ${role.name}`)
                    .setColor(0xFF4444)
                    .setDescription(description)
                    .setFooter({ 
                        text: `Required Active Time: ${formatDuration(minimumThreshold)} • ` +
                             `Total Members: ${totalMembers} • Active: ${activeMembers} • ` +
                             `Inactive: ${inactiveCount} • No Data: ${noDataCount} • ` +
                             `Page ${page + 1}/${totalPages}` 
                    })
                    .setTimestamp();
            };

            // Send initial message
            const initialEmbed = getPageEmbed(0);
            
            const response = await (isSlash ? 
                message.editReply({ embeds: [initialEmbed] }) :
                message.reply({ embeds: [initialEmbed] })
            );

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