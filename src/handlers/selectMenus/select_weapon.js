const { EmbedBuilder } = require('discord.js');
const { fetchPlayerWeaponStats, getExperiencedWeapons, cleanWeaponName, isSimilarWeaponName } = require('../../utils/weaponStats');
const EmbedBuilderUtil = require('../../utils/embedBuilder');
const prisma = require('../../config/prisma');

module.exports = {
    customId: 'select_weapon',
    async execute(interaction) {
        try {
            await interaction.deferUpdate();
            console.log('Starting select_weapon handler');

            // Get cached composition data
            const cache = interaction.client.compositions?.get(interaction.user.id);
            if (!cache || Date.now() > cache.expires) {
                console.log('Cache expired or not found');
                await interaction.editReply({
                    content: 'Selection expired. Please use the /x command again.',
                    components: []
                });
                return;
            }

            // Get the composition from database to check role
            const activeComposition = await prisma.composition.findFirst({
                where: {
                    threadId: interaction.channel.id,
                    status: 'open'
                }
            });

            if (!activeComposition) {
                await interaction.editReply({
                    content: 'No active composition found for this thread.',
                    components: []
                });
                return;
            }

            // Double check role permission
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const role = await interaction.guild.roles.fetch(activeComposition.roleId);
            const isAdmin = member.permissions.has('Administrator');

            if (!isAdmin && !member.roles.cache.has(role.id)) {
                await interaction.editReply({
                    content: `You need the ${role.name} role to use this command.`,
                    components: []
                });
                return;
            }

            console.log('Processing selection:', interaction.values[0]);
            const value = interaction.values[0];
            let title, selectedWeaponName;

            // Get target user (if specified in cache)
            let targetUser = null;
            if (cache.targetUserId) {
                try {
                    targetUser = await interaction.client.users.fetch(cache.targetUserId);
                    console.log('Fetched target user:', targetUser.tag);
                } catch (error) {
                    console.error('Error fetching target user:', error);
                }
            }

            // Get the user to check stats for
            const userToCheck = targetUser || interaction.user;
            console.log('Checking stats for user:', userToCheck.tag);

            // Check if user is registered
            const registration = await prisma.playerRegistration.findFirst({
                where: {
                    userId: userToCheck.id,
                    guildId: interaction.guildId
                }
            });

            if (!registration) {
                await interaction.editReply({
                    content: targetUser 
                        ? `${targetUser.tag} is not registered. They need to register with /register first.`
                        : 'You need to register with /register first.',
                    components: []
                });
                return;
            }

            if (value === 'fill') {
                // Handle Fill option
                title = '⬜ Fill';
                selectedWeaponName = null;

                // Get the original composition message
                const activeComposition = await prisma.composition.findFirst({
                    where: {
                        threadId: interaction.channel.id,
                        status: 'open'
                    }
                });

                if (activeComposition) {
                    try {
                        // Get the channel and message
                        const channel = await interaction.client.channels.fetch(activeComposition.channelId);
                        const message = await channel.messages.fetch(activeComposition.messageId);
                        
                        // Get the original embed
                        const originalEmbed = message.embeds[0];
                        if (originalEmbed) {
                            const newEmbed = EmbedBuilder.from(originalEmbed);
                            let fillQueue = [];

                            // Get existing fill queue if it exists
                            const existingQueueField = originalEmbed.fields.find(f => f.name === '⏳ Fill Queue');
                            if (existingQueueField) {
                                fillQueue = existingQueueField.value.match(/<@(\d+)>/g)?.map(mention => mention.match(/<@(\d+)>/)[1]) || [];
                            }

                            // First remove user from any weapon fields
                            newEmbed.data.fields = originalEmbed.fields.map(field => {
                                if (field.name === '⏳ Fill Queue') return field;
                                
                                let value = field.value;
                                const lines = value.split('\n');
                                
                                // Remove the user's mention from any existing weapon
                                const cleanedLines = lines.map(line => 
                                    line.replace(`<@${userToCheck.id}> (fill)`, '').trim() // Remove with (fill)
                                    .replace(`<@${userToCheck.id}>`, '').trim() // Remove without (fill)
                                ).filter(line => line); // Remove empty lines
                                
                                return {
                                    name: field.name,
                                    value: cleanedLines.join('\n') || 'No players assigned',
                                    inline: field.inline
                                };
                            });

                            // Add the user to fill queue if not already in it
                            if (!fillQueue.includes(userToCheck.id)) {
                                fillQueue.push(userToCheck.id);
                            }

                            // Update or add the fill queue field
                            const queueField = {
                                name: '⏳ Fill Queue',
                                value: fillQueue.map(id => `<@${id}>`).join('\n'),
                                inline: false
                            };

                            const queueFieldIndex = newEmbed.data.fields.findIndex(f => f.name === '⏳ Fill Queue');
                            if (queueFieldIndex !== -1) {
                                newEmbed.data.fields[queueFieldIndex] = queueField;
                            } else {
                                newEmbed.data.fields.push(queueField);
                            }

                            // Update the message
                            await message.edit({ embeds: [newEmbed] });

                            // Create an embed to show in the thread
                            const embed = new EmbedBuilder()
                                .setColor(0x808080)
                                .setTitle(title)
                                .setDescription(`Added to fill queue and removed from any previous weapon assignments`)
                                .setFooter({ 
                                    text: targetUser 
                                        ? `Requested by ${interaction.user.tag} for ${targetUser.tag} (${registration.playerName})`
                                        : `Requested by ${interaction.user.tag} (${registration.playerName})` 
                                });

                            // Send message in the thread
                            await interaction.channel.send({
                                content: targetUser ? `${targetUser}` : null,
                                embeds: [embed]
                            });
                        }
                    } catch (error) {
                        console.error('Error updating composition message:', error);
                        await interaction.editReply({
                            content: 'Error adding you to fill queue. Please try again.',
                            components: []
                        });
                        return;
                    }
                }
            } else {
                try {
                    // Handle specific weapon
                    const [partyIndex, weaponIndex] = value.split('-').map(Number);
                    const compositionData = cache.data;
                    const party = compositionData.parties[partyIndex];
                    const weapon = party.weapons[weaponIndex];
                    
                    title = cleanWeaponName(weapon.type);
                    selectedWeaponName = weapon.type;

                    // Fetch weapon stats first
                    console.log('Fetching stats for Albion player:', registration.playerName);
                    const weaponStats = await fetchPlayerWeaponStats(registration.playerName);
                    const experiencedWeapons = getExperiencedWeapons(weaponStats);
                    const hasExperience = experiencedWeapons.some(w => 
                        cleanWeaponName(w.name) === cleanWeaponName(selectedWeaponName)
                    );

                    // Check for weapon role bypass
                    const cleanWeaponRole = cleanWeaponName(selectedWeaponName).toLowerCase();
                    const hasWeaponRole = member.roles.cache.some(role => 
                        isSimilarWeaponName(role.name, cleanWeaponRole)
                    );

                    const matchedRole = hasWeaponRole ? 
                        member.roles.cache.find(role => isSimilarWeaponName(role.name, cleanWeaponRole)) : 
                        null;

                    // User is considered experienced if they have stats or the weapon role
                    const isExperienced = hasExperience || hasWeaponRole;

                    // Get the original composition message
                    const activeComposition = await prisma.composition.findFirst({
                        where: {
                            threadId: interaction.channel.id,
                            status: 'open'
                        }
                    });

                    if (activeComposition) {
                        try {
                            // Get the channel and message
                            const channel = await interaction.client.channels.fetch(activeComposition.channelId);
                            const message = await channel.messages.fetch(activeComposition.messageId);
                            
                            // Get the original embed
                            const originalEmbed = message.embeds[0];
                            if (originalEmbed) {
                                const newEmbed = EmbedBuilder.from(originalEmbed);
                                let fillQueue = [];

                                // Remove user from fill queue when selecting a specific weapon
                                const fillQueueField = originalEmbed.fields.find(f => f.name === '⏳ Fill Queue');
                                if (fillQueueField) {
                                    fillQueue = fillQueueField.value.match(/<@(\d+)>/g)?.map(mention => mention.match(/<@(\d+)>/)[1]) || [];
                                    fillQueue = fillQueue.filter(id => id !== userToCheck.id);
                                }

                                // Update the fields to add the user mention
                                newEmbed.data.fields = originalEmbed.fields.map(field => {
                                    if (field.name === '⏳ Fill Queue') {
                                        return {
                                            name: field.name,
                                            value: fillQueue.length > 0 ? fillQueue.map(id => `<@${id}>`).join('\n') : 'No players in queue',
                                            inline: field.inline
                                        };
                                    }

                                    let value = field.value;
                                    const lines = value.split('\n');
                                    
                                    // First remove the user's mention from any existing weapon
                                    const cleanedLines = lines.map(line => 
                                        line.replace(`<@${userToCheck.id}> (fill)`, '').trim() // Remove with (fill)
                                        .replace(`<@${userToCheck.id}>`, '').trim() // Remove without (fill)
                                    ).filter(line => line); // Remove empty lines
                                    
                                    // Then add the user's mention to their new selection
                                    const updatedLines = cleanedLines.map(line => {
                                        if (line.includes(cleanWeaponName(selectedWeaponName))) {
                                            // Count required players from the line (format: `4x Bear Paws`)
                                            const match = line.match(/(\d+)x/);
                                            if (!match) return line;
                                            
                                            const requiredPlayers = parseInt(match[1]);
                                            
                                            // Get all current mentions and their fill status
                                            const mentions = line.match(/<@(\d+)>( \(fill\))?/g) || [];
                                            const currentPlayers = mentions.map(mention => ({
                                                id: mention.match(/<@(\d+)>/)[1],
                                                isFill: mention.includes('(fill)')
                                            }));

                                            // If we're full but the new player has experience and there's a fill
                                            if (currentPlayers.length >= requiredPlayers && isExperienced) {
                                                // Find the first fill player to replace
                                                const fillPlayerIndex = currentPlayers.findIndex(p => p.isFill);
                                                if (fillPlayerIndex !== -1) {
                                                    // Add the fill player to the queue if not already in it
                                                    const fillPlayerId = currentPlayers[fillPlayerIndex].id;
                                                    if (!fillQueue.includes(fillPlayerId)) {
                                                        fillQueue.push(fillPlayerId);
                                                    }
                                                    // Remove the fill player
                                                    currentPlayers.splice(fillPlayerIndex, 1);
                                                    // Add the new experienced player
                                                    currentPlayers.push({ id: userToCheck.id, isFill: false });
                                                } else {
                                                    throw new Error(`No slots available for ${cleanWeaponName(selectedWeaponName)}. All ${requiredPlayers} slots are taken by experienced players.`);
                                                }
                                            } else if (currentPlayers.length >= requiredPlayers) {
                                                throw new Error(`No slots available for ${cleanWeaponName(selectedWeaponName)}. All ${requiredPlayers} slots are taken.`);
                                            } else {
                                                // Add the new player
                                                currentPlayers.push({ id: userToCheck.id, isFill: !isExperienced });
                                            }

                                            // Rebuild the line with the updated players
                                            const baseLine = line.split('<@')[0].trim();
                                            const playerMentions = currentPlayers.map(p => 
                                                p.isFill ? `<@${p.id}> (fill)` : `<@${p.id}>`
                                            ).join(' ');

                                            return `${baseLine} ${playerMentions}`;
                                        }
                                        return line;
                                    });
                                    
                                    return {
                                        name: field.name,
                                        value: updatedLines.join('\n'),
                                        inline: field.inline
                                    };
                                });

                                // Add fill queue field if it doesn't exist
                                const hasQueueField = newEmbed.data.fields.some(field => field.name === '⏳ Fill Queue');
                                if (!hasQueueField) {
                                    newEmbed.data.fields.push({
                                        name: '⏳ Fill Queue',
                                        value: fillQueue.length > 0 ? fillQueue.map(id => `<@${id}>`).join('\n') : 'No players in queue',
                                        inline: false
                                    });
                                }

                                // Update the message
                                await message.edit({ embeds: [newEmbed] });

                                // Create embed for the ping
                                const embed = new EmbedBuilder()
                                    .setColor(isExperienced ? 0x00FF00 : 0xFF0000)
                                    .setTitle(title);

                                // Build description
                                let description;
                                if (hasExperience) {
                                    description = `✅ Weapon experience: ${cleanWeaponName(selectedWeaponName)} (${experiencedWeapons.find(w => cleanWeaponName(w.name) === cleanWeaponName(selectedWeaponName)).usage})`;
                                } else if (hasWeaponRole) {
                                    description = `✅ Weapon role found: ${cleanWeaponName(selectedWeaponName)} (Role: ${matchedRole.name})`;
                                } else {
                                    description = `❌ No experience with this weapon.\nI'm gonna ping you as fill, ok?`;
                                }

                                // Add list of experienced weapons
                                if (experiencedWeapons.length > 0) {
                                    const weaponList = experiencedWeapons
                                        .map(w => `${cleanWeaponName(w.name)} (${w.usage})`)
                                        .join(', ');
                                    description += `\n\nExperienced weapons: ${weaponList}`;
                                }

                                embed.setDescription(description)
                                    .setFooter({ 
                                        text: targetUser 
                                            ? `Requested by ${interaction.user.tag} for ${targetUser.tag} (${registration.playerName})`
                                            : `Requested by ${interaction.user.tag} (${registration.playerName})` 
                                    });

                                // Send message in the thread
                                await interaction.channel.send({
                                    content: targetUser ? `${targetUser}` : null,
                                    embeds: [embed]
                                });

                                // Acknowledge the selection
                                await interaction.editReply({
                                    content: 'Selection processed successfully!',
                                    components: []
                                });
                            }
                        } catch (error) {
                            console.error('Error updating composition message:', error);
                            if (error.message.includes('No slots available')) {
                                await interaction.editReply({
                                    content: error.message,
                                    components: []
                                });
                                return;
                            }
                            throw error;
                        }
                    }
                } catch (error) {
                    console.error('Error processing weapon selection:', error);
                    await interaction.editReply({
                        content: 'Failed to process weapon selection. Please try again.',
                        components: []
                    });
                }
            }

        } catch (error) {
            console.error('Critical error in select_weapon handler:', error);
            try {
                await interaction.editReply({
                    content: 'An error occurred while processing your selection.',
                    components: []
                });
            } catch (e) {
                console.error('Failed to send error message:', e);
                try {
                    await interaction.reply({
                        content: 'An error occurred while processing your selection.',
                        ephemeral: true
                    });
                } catch (e2) {
                    console.error('Failed to send any error message:', e2);
                }
            }
        }
    }
};
