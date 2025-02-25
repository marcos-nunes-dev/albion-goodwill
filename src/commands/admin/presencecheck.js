const { EmbedBuilder } = require('discord.js');
const Command = require('../../structures/Command');
const { formatDuration, getWeekStart, getMonthStart } = require('../../utils/timeUtils');
const { fetchActivityData } = require('../../utils/activityUtils');

const ACTIVITY_THRESHOLD_PERCENTAGE = 5; // 5% of top 10 average

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
            required: true,
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

            // Get period based on command type
            const period = isSlash ? 
                message.options.getString('period') : 
                args.period || 'weekly';

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
                    startDate = getMonthStart(now);
                    title = 'Monthly Activity Check';
                    break;
                default:
                    startDate = getWeekStart(now);
                    title = 'Weekly Activity Check';
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

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`${title} - ${role.name}`)
                .setColor(inactiveMembers.length > 0 ? 0xFF4444 : 0x00FF00)
                .setTimestamp();

            if (inactiveMembers.length === 0) {
                embed.setDescription('✅ All members are active!');
            } else {
                const description = inactiveMembers.map(({ displayName, voiceTime, percentage }) =>
                    `${displayName}\n• Voice Time: \`${formatDuration(voiceTime)}\`\n• Activity: \`${percentage}%\` of top average`
                ).join('\n\n');

                embed.setDescription(description)
                    .setFooter({ 
                        text: `Required Active Time: ${formatDuration(minimumThreshold)} • Total inactive: ${inactiveMembers.length}` 
                    });
            }

            // Send the response based on command type
            if (isSlash) {
                await message.editReply({ embeds: [embed] });
            } else {
                await message.reply({ embeds: [embed] });
            }

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