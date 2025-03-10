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
        },
        {
            name: 'exclude',
            description: 'Role to exclude from the check (e.g., whitelist role)',
            type: 8,
            required: false
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

            // Get exclude role based on command type
            const excludeRole = isSlash ? 
                message.options.getRole('exclude') : 
                message.mentions.roles.last();

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

            // Get role members (excluding members with the exclude role)
            console.log(`Fetching members for role: ${role.name}`);
            console.log(`Initial members count: ${role.members.size}`);
            
            try {
                // Fetch members with a longer timeout and chunk size
                await message.guild.members.fetch({ 
                    cache: true,
                    force: true,
                    timeout: 30000 // 30 seconds timeout
                });
            } catch (error) {
                console.error('Error fetching members:', error);
                // Continue with cached members if fetch fails
            }
            
            // Get all members with the role
            const allMembers = message.guild.members.cache.filter(member => 
                member.roles.cache.has(role.id)
            );
            
            console.log(`Total members with role: ${allMembers.size}`);
            
            // Filter out members with exclude role if specified
            const members = excludeRole ? 
                allMembers.filter(member => !member.roles.cache.has(excludeRole.id)) :
                allMembers;
            
            console.log(`Final members count after filtering: ${members.size}`);
            console.log(`Exclude role: ${excludeRole ? excludeRole.name : 'None'}`);

            if (!members.size) {
                const errorMessage = '❌ No members found with this role' + 
                    (excludeRole ? ' (after excluding members with the specified role).' : '.');
                if (isSlash) {
                    await message.editReply(errorMessage);
                } else {
                    await message.reply(errorMessage);
                }
                return;
            }

            // Process members in chunks to avoid rate limits
            const CHUNK_SIZE = 10;
            const memberChunks = [];
            const memberArray = Array.from(members.values());
            
            for (let i = 0; i < memberArray.length; i += CHUNK_SIZE) {
                memberChunks.push(memberArray.slice(i, i + CHUNK_SIZE));
            }

            console.log(`Processing ${memberChunks.length} chunks of members`);

            // Get activity data for all members in chunks
            const activityData = [];
            for (const chunk of memberChunks) {
                try {
                    const chunkData = await Promise.all(
                        chunk.map(async (member) => {
                            try {
                                const { data: stats } = await fetchActivityData({
                                    userId: member.id,
                                    guildId: message.guild.id,
                                    period,
                                    startDate
                                });
                                
                                return {
                                    member,
                                    stats: stats || null
                                };
                            } catch (error) {
                                console.error(`Error fetching activity data for member ${member.id}:`, error);
                                return {
                                    member,
                                    stats: null
                                };
                            }
                        })
                    );
                    activityData.push(...chunkData);
                    
                    // Add a small delay between chunks to avoid rate limits
                    if (memberChunks.indexOf(chunk) < memberChunks.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    console.error('Error processing member chunk:', error);
                }
            }

            console.log(`Activity data fetched for ${activityData.length} members`);

            // Calculate threshold from top performers
            const validData = activityData.filter(data => data.stats !== null);
            const topPerformers = validData
                .sort((a, b) => (b.stats?.voiceTimeSeconds || 0) - (a.stats?.voiceTimeSeconds || 0))
                .slice(0, 10);

            const topAvgVoiceTime = topPerformers.reduce((sum, data) =>
                sum + (data.stats?.voiceTimeSeconds || 0), 0) / (topPerformers.length || 1);

            const minimumThreshold = topAvgVoiceTime * (ACTIVITY_THRESHOLD_PERCENTAGE / 100);

            // Process all members
            const allMemberStats = activityData
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
                .sort((a, b) => {
                    // Sort by data presence first, then by voice time
                    if (a.hasData !== b.hasData) return b.hasData - a.hasData;
                    return b.voiceTime - a.voiceTime;
                });

            // Split into active and inactive members
            const activeMemberStats = allMemberStats.filter(member => member.isActive);
            const inactiveMemberStats = allMemberStats.filter(member => !member.isActive);

            // Combine active and inactive members, with active members first
            const memberStats = [...activeMemberStats, ...inactiveMemberStats];

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

                const description = pageMembers.map(({ displayName, voiceTime, afkTime, mutedTime, percentage, hasData, isActive, member }) => {
                    if (!hasData) {
                        const joinedAt = member.joinedAt;
                        const joinDuration = formatDuration((Date.now() - joinedAt.getTime()) / 1000);
                        return [
                            `**${displayName}**`,
                            `📅 Joined: ${joinedAt.toLocaleDateString()} (${joinDuration} ago)`,
                            `❌ No activity data recorded`,
                            `• Last Seen: ${member.lastMessageAt ? member.lastMessageAt.toLocaleString() : 'Never'}`,
                            `• Account Created: ${member.user.createdAt.toLocaleDateString()}`
                        ].join('\n');
                    }

                    const totalTime = voiceTime + afkTime + mutedTime || 1;
                    const activePercent = Math.round((voiceTime / totalTime) * 100) || 0;
                    const afkPercent = Math.round((afkTime / totalTime) * 100) || 0;
                    const mutedPercent = Math.round((mutedTime / totalTime) * 100) || 0;
                    const joinedAt = member.joinedAt;
                    const joinDuration = formatDuration((Date.now() - joinedAt.getTime()) / 1000);

                    return [
                        `**${displayName}** ${isActive ? '✅' : '⚠️'}`,
                        `📅 Joined: ${joinedAt.toLocaleDateString()} (${joinDuration} ago)`,
                        `• Voice Time: \`${formatDuration(voiceTime)}\` (${activePercent}%)`,
                        `• AFK Time: \`${formatDuration(afkTime)}\` (${afkPercent}%)`,
                        `• Muted Time: \`${formatDuration(mutedTime)}\` (${mutedPercent}%)`,
                        `• Activity: \`${percentage}%\` of top average`,
                        `• Last Seen: ${member.lastMessageAt ? member.lastMessageAt.toLocaleString() : 'Never'}`
                    ].join('\n');
                }).join('\n\n');

                const totalMembers = role.members.size;
                const activeCount = activeMemberStats.length;
                const noDataCount = memberStats.filter(m => !m.hasData).length;
                const inactiveCount = inactiveMemberStats.filter(m => m.hasData).length;

                const footerText = `Required Active Time: ${formatDuration(minimumThreshold)} • ` +
                    `Total Members: ${totalMembers} • Active: ${activeCount} • ` +
                    `Inactive: ${inactiveCount} • No Data: ${noDataCount}` +
                    (excludeRole ? ` • Excluded Role: ${excludeRole.name}` : '') +
                    ` • Page ${page + 1}/${totalPages}`;

                const embed = new EmbedBuilder()
                    .setTitle(`${title} - ${role.name}`)
                    .setColor(0xFF4444)
                    .setDescription(description)
                    .setFooter({ text: footerText })
                    .setTimestamp();

                // Add role information at the top
                const roleInfo = [
                    `**Role Information:**`,
                    `• Total Members: ${role.members.size}`,
                    `• Active Members: ${activeCount}`,
                    `• Inactive Members: ${inactiveCount}`,
                    `• Members Without Data: ${noDataCount}`,
                    `• Required Active Time: ${formatDuration(minimumThreshold)}`,
                    excludeRole ? `• Excluded Role: ${excludeRole.name}` : '',
                    `• Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`,
                    `• Page ${page + 1}/${totalPages}`
                ].filter(Boolean).join('\n');

                embed.setDescription(roleInfo + '\n\n' + description);

                return embed;
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