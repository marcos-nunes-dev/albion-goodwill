const { EmbedBuilder } = require('discord.js');
const WeaponStatsService = require('../../../services/WeaponStatsService');
const CompositionService = require('../../../services/CompositionService');
const PlayerService = require('../../../services/PlayerService');
const { handleError } = require('../../../utils/ErrorHandler');

async function handleAddCommand(msg, args, compositionState, message) {
    try {
        const weaponName = args[0]; // First argument is the weapon name
        const targetUser = msg.mentions.users.first(); // Optional mentioned user for admin commands
        const playerName = targetUser ? await PlayerService.getVerifiedCharacter(targetUser.id, msg.guild.id) : await PlayerService.getVerifiedCharacter(msg.author.id, msg.guild.id);

        if (!playerName) {
            await msg.reply('You must be verified with `/register` before joining a composition.');
            return;
        }

        const weapon = compositionState.weapons.get(weaponName.toLowerCase());

        if (!weapon) {
            await msg.reply(`Weapon "${weaponName}" not found in the composition.`);
            return;
        }

        // Check if player is already in this weapon
        if (weapon.participants.has(targetUser ? targetUser.id : msg.author.id)) {
            await msg.reply(`${playerName} is already assigned to ${weapon.name}.`);
            return;
        }

        // If not an admin command, check weapon experience
        if (!targetUser && !weapon.isFreeRole) {
            try {
                const experience = await WeaponStatsService.checkWeaponExperience(playerName, weapon.name);
                
                if (!experience.hasExperience) {
                    let responseMessage = `⚠️ **Warning: No Recent Experience with ${weapon.name}**\n\n`;
                    
                    // Show specific weapon stats if available
                    if (experience.allTimeStats) {
                        responseMessage += `**${weapon.name} Usage:**\n`;
                        responseMessage += `• Recent (30 days): ${experience.recentStats?.usages || 0} uses\n`;
                        responseMessage += `• All-time: ${experience.allTimeStats?.usages || 0} uses\n\n`;
                    }

                    // Add recent weapons experience
                    if (experience.topRecentWeapons?.filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0).length > 0) {
                        responseMessage += '**Recent Weapon Activity (Last 30 days):**\n';
                        experience.topRecentWeapons
                            .filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0)
                            .forEach(w => {
                                responseMessage += `• ${w.weapon_name}: ${w.usages} uses\n`;
                            });
                        responseMessage += '\n';
                    } else {
                        responseMessage += '**Recent Activity (Last 30 days):**\n• No PvP activity found\n\n';
                    }

                    // Add all-time weapons experience
                    if (experience.topAllTimeWeapons?.filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0).length > 0) {
                        responseMessage += '**All-Time Top Weapons:**\n';
                        experience.topAllTimeWeapons
                            .filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0)
                            .forEach(w => {
                                responseMessage += `• ${w.weapon_name}: ${w.usages} uses\n`;
                            });
                        responseMessage += '\n';
                    } else {
                        responseMessage += '**All-Time Activity:**\n• No PvP records found\n\n';
                    }
                    
                    responseMessage += '**Status:** You will be marked as a fill player. 📝';

                    // Add as fill player with experience data
                    const experienceText = experience.topRecentWeapons
                        .filter(w => w.weapon_name && w.weapon_name.trim() !== '' && w.usages > 0)
                        .map(w => `${w.weapon_name} (${w.usages}x)`)
                        .join(', ');

                    const playerData = {
                        isFill: true,
                        experience: experienceText || 'No recent experience'
                    };
                    
                    CompositionService.updateWeaponState(weapon, msg.author.id, 'add', playerData);

                    const embed = CompositionService.updateCompositionStatus(compositionState, compositionState.status);
                    await message.edit({ embeds: [embed] });

                    // Send assignment confirmation messages
                    await msg.channel.send(`${targetUser ? targetUser : msg.author} joined as ${weapon.name}`);
                    await msg.channel.send('Composition updated!');

                    await msg.reply({
                        content: responseMessage,
                        ephemeral: true
                    });
                    await msg.delete().catch(() => {});
                    return;
                }

                // Add player as regular player since they have experience
                const playerData = {
                    isFill: false,
                    experience: null
                };
                CompositionService.updateWeaponState(weapon, targetUser ? targetUser.id : msg.author.id, 'add', playerData);

                const embed = CompositionService.updateCompositionStatus(compositionState, compositionState.status);
                await message.edit({ embeds: [embed] });

                // Send assignment confirmation messages
                await msg.channel.send(`${targetUser ? targetUser : msg.author} joined as ${weapon.name}`);
                await msg.channel.send('Composition updated!');
                await msg.delete().catch(() => {});
            } catch (error) {
                console.error('Error checking weapon experience:', error);
                await msg.reply({
                    content: 'There was an error checking your weapon experience. Please try again.',
                    ephemeral: true
                });
                return;
            }
        }

        // Add player to weapon as regular player
        const playerData = {
            isFill: false,
            experience: null
        };
        CompositionService.updateWeaponState(weapon, targetUser ? targetUser.id : msg.author.id, 'add', playerData);

        const embed = CompositionService.updateCompositionStatus(compositionState, compositionState.status);
        await message.edit({ embeds: [embed] });

        // Send assignment confirmation messages
        await msg.channel.send(`${targetUser ? targetUser : msg.author} joined as ${weapon.name}`);
        await msg.channel.send('Composition updated!');
        await msg.delete().catch(() => {});
    } catch (error) {
        await handleError(error, null, msg);
    }
}

async function handleRemoveCommand(msg, args, compositionState, message) {
    try {
        const targetUser = msg.mentions.users.first();
        const userId = targetUser ? targetUser.id : msg.author.id;

        // Find which weapon the user is in
        let foundWeapon = null;
        for (const [weaponName, weapon] of compositionState.weapons.entries()) {
            if (weapon.participants.has(userId)) {
                foundWeapon = weapon;
                break;
            }
        }

        if (!foundWeapon) {
            await msg.reply(targetUser ? 
                `${targetUser.username} is not assigned to any weapon.` :
                'You are not assigned to any weapon.'
            );
            return;
        }

        // Remove player from weapon
        CompositionService.updateWeaponState(foundWeapon, userId, 'remove');

        const embed = CompositionService.updateCompositionStatus(compositionState, compositionState.status);
        await message.edit({ embeds: [embed] });
        await msg.delete().catch(() => {});
    } catch (error) {
        await handleError(error, null, msg);
    }
}

async function handleFillCommand(msg, args, compositionState, message) {
    try {
        const verifiedName = await PlayerService.getVerifiedCharacter(msg.author.id, msg.guild.id);

        if (!verifiedName) {
            await msg.reply('You must be verified with `/register` before joining the fill queue.');
            return;
        }

        // Check if already in fill queue
        if (compositionState.fillQueue?.some(p => p.id === msg.author.id)) {
            await msg.reply('You are already in the fill queue.');
            return;
        }

        // Get player's weapon experience for all weapons
        const allWeapons = Array.from(compositionState.weapons.keys());
        const experiencePromises = allWeapons.map(weapon => 
            WeaponStatsService.checkWeaponExperience(verifiedName, weapon)
        );

        const experiences = await Promise.all(experiencePromises);
        
        // Format experience text to show both recent and all-time stats
        const recentExperience = experiences
            .filter(exp => exp.hasExperience)
            .map(exp => {
                const weapon = exp.recentStats;
                return weapon ? `${weapon.weapon_name} (${weapon.usages}x)` : null;
            })
            .filter(Boolean)
            .join(', ');

        compositionState.fillQueue = compositionState.fillQueue || [];
        compositionState.fillQueue.push({
            id: msg.author.id,
            name: verifiedName,
            experience: recentExperience || 'No recent experience'
        });

        const embed = CompositionService.updateCompositionStatus(compositionState, compositionState.status);
        await message.edit({ embeds: [embed] });
        await msg.delete().catch(() => {});
    } catch (error) {
        await handleError(error, null, msg);
    }
}

async function handleStatusCommand(msg, args, compositionState, message, role) {
    try {
        if (!args[1]) {
            await msg.reply('Usage: gw status <open|close|cancel>');
            return;
        }

        const newStatus = args[1].toLowerCase();
        const validStatuses = ['open', 'close', 'cancel'];

        if (!validStatuses.includes(newStatus)) {
            await msg.reply('Invalid status. Use: open, close, or cancel');
            return;
        }

        // Check permissions
        const member = await msg.guild.members.fetch(msg.author.id);
        const hasPermission = member.permissions.has('MANAGE_MESSAGES') || 
                            msg.author.id === compositionState.createdBy;

        if (!hasPermission) {
            await msg.reply('You do not have permission to change the composition status.');
            return;
        }

        const embed = CompositionService.updateCompositionStatus(compositionState, newStatus);
        await message.edit({ embeds: [embed] });
        await msg.delete().catch(() => {});

        // Send status update message
        const statusMessages = {
            'open': '🟢 Composition is now open for signups!',
            'close': '🔴 Composition is now closed for signups.',
            'cancel': '⚫ Composition has been cancelled.'
        };

        await msg.channel.send(statusMessages[newStatus]);
    } catch (error) {
        await handleError(error, null, msg);
    }
}

async function handleHelpCommand(msg) {
    try {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📖 Composition Commands')
            .setColor(0x00FF00)
            .setDescription([
                'Here are the available commands:',
                '',
                '`gw <weapon>` - Join a weapon slot',
                '`gw remove` - Remove yourself from your current weapon',
                '`gw fill` - Add yourself to the fill queue',
                '`gw status <open|close|cancel>` - Change composition status (admin only)',
                '',
                'Admin Commands:',
                '`gw <weapon> @user` - Add a user to a weapon',
                '`gw remove @user` - Remove a user from their weapon'
            ].join('\n'));

        await msg.reply({ embeds: [helpEmbed], ephemeral: true });
    } catch (error) {
        await handleError(error, null, msg);
    }
}

async function handleCloseCommand(msg, args, compositionState, message) {
    return handleStatusCommand(msg, ['status', 'close'], compositionState, message);
}

async function handleCancelCommand(msg, args, compositionState, message) {
    return handleStatusCommand(msg, ['status', 'cancel'], compositionState, message);
}

module.exports = {
    handleAddCommand,
    handleRemoveCommand,
    handleFillCommand,
    handleStatusCommand,
    handleHelpCommand,
    handleCloseCommand,
    handleCancelCommand
};
