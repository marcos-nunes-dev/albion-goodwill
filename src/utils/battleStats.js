const prisma = require('../config/prisma');
const { EmbedBuilder } = require('discord.js');

async function calculateBattleStats(guildId) {
    try {
        const battles = await prisma.battleRegistration.findMany({
            where: {
                guildId: guildId,
                battleUrl: {
                    not: 'stale',
                    not: null,
                    not: ''
                }
            },
            select: {
                isVictory: true,
                kills: true,
                deaths: true
            }
        });

        const stats = battles.reduce((acc, battle) => {
            acc.wins += battle.isVictory ? 1 : 0;
            acc.losses += battle.isVictory ? 0 : 1;
            acc.kills += battle.kills || 0;
            acc.deaths += battle.deaths || 0;
            return acc;
        }, { wins: 0, losses: 0, kills: 0, deaths: 0 });

        // Calculate KD and format it
        let kdFormatted;
        if (stats.deaths === 0) {
            kdFormatted = stats.kills > 0 ? stats.kills.toString() : '0';
        } else {
            const kdRatio = stats.kills / stats.deaths;
            if (stats.kills < stats.deaths) {
                // More deaths than kills, show as negative
                kdFormatted = `-${Math.round((stats.deaths - stats.kills) / stats.deaths * 10)}`;
            } else if (kdRatio < 1) {
                // Less than 1 KD but kills <= deaths, show with leading zero
                kdFormatted = kdRatio.toFixed(1).replace('.', '');
            } else {
                // Normal KD ratio >= 1
                kdFormatted = kdRatio.toFixed(1).replace('.0', '');
            }
        }
        
        return {
            ...stats,
            kd: kdFormatted,
            channelName: `🏆${stats.wins}-💀${stats.losses}・🩸${kdFormatted}`
        };
    } catch (error) {
        console.error('Error calculating battle stats:', error);
        return {
            wins: 0,
            losses: 0,
            kills: 0,
            deaths: 0,
            kd: '0',
            channelName: '🏆0-💀0・🩸0'
        };
    }
}

async function updateBattleLogChannelName(guild, channelId) {
    // If no channel ID is provided, this feature is disabled
    if (!channelId) return;
    
    try {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        // If channel doesn't exist anymore, remove it from settings
        if (!channel) {
            await prisma.guildSettings.update({
                where: { guildId: guild.id },
                data: { battlelogChannelId: null }
            });
            return;
        }
        
        const stats = await calculateBattleStats(guild.id);
        
        // Update channel name if different
        if (channel.name !== stats.channelName) {
            await channel.setName(stats.channelName);
        }

        // Fetch all messages in the channel
        const messages = await channel.messages.fetch();
        
        // Keep track of which battles we've already posted
        const postedBattleIds = new Set();
        
        // Get the welcome message (should be the last/oldest message)
        const welcomeMsg = messages.last();
        
        // Get all non-welcome messages
        const battleMessages = messages.filter(msg => msg !== welcomeMsg);
        
        // Extract battle IDs from existing messages
        battleMessages.forEach(msg => {
            const embed = msg.embeds[0];
            if (embed?.footer?.text) {
                const battleId = embed.footer.text.split(':')[1]?.trim();
                if (battleId) postedBattleIds.add(battleId);
            }
        });

        // Get the timestamp of the last posted battle
        let lastPostedBattle = null;
        if (battleMessages.size > 0) {
            const lastBattleMessage = battleMessages.first();
            if (lastBattleMessage?.embeds[0]?.timestamp) {
                lastPostedBattle = new Date(lastBattleMessage.embeds[0].timestamp);
            }
        }

        // Fetch only new battles that haven't been posted yet
        const battles = await prisma.battleRegistration.findMany({
            where: {
                guildId: guild.id,
                battleUrl: {
                    not: 'stale',
                    not: null,
                    not: ''
                },
                ...(lastPostedBattle && {
                    battleTime: {
                        gt: lastPostedBattle
                    }
                }),
                id: {
                    notIn: Array.from(postedBattleIds)
                }
            },
            orderBy: {
                battleTime: 'asc'
            }
        });

        // Post new battles that haven't been posted yet
        for (const battle of battles) {
            // Limit enemy guilds list to fit Discord's title limit
            let enemyGuildsList = battle.enemyGuilds.join(', ');
            if (enemyGuildsList.length > 200) {
                const truncatedGuilds = [];
                let totalLength = 0;
                for (const guild of battle.enemyGuilds) {
                    if (totalLength + guild.length + 2 > 197) {
                        truncatedGuilds.push('...');
                        break;
                    }
                    truncatedGuilds.push(guild);
                    totalLength += guild.length + 2;
                }
                enemyGuildsList = truncatedGuilds.join(', ');
            }

            const battleEmbed = new EmbedBuilder()
                .setTitle(`${battle.isVictory ? '🏆 Victory' : '💀 Defeat'} vs ${enemyGuildsList}`)
                .setDescription([
                    `⚔️ **Battle Stats**`,
                    `Kills: ${battle.kills || 0}`,
                    `Deaths: ${battle.deaths || 0}`,
                    `K/D: ${battle.deaths > 0 ? (battle.kills / battle.deaths).toFixed(2) : battle.kills > 0 ? '∞' : '0'}`,
                    '',
                    battle.battleUrl ? `[View Battle Report](${battle.battleUrl})` : 'No battle report available'
                ].join('\n'))
                .setColor(battle.isVictory ? '#00FF00' : '#FF0000')
                .setTimestamp(new Date(battle.battleTime))
                .setFooter({ text: `Battle ID: ${battle.id}` });

            await channel.send({ embeds: [battleEmbed] });
        }

    } catch (error) {
        console.error('Error updating battle log channel:', error);
        // If we can't update the channel (permissions, etc.), don't throw
    }
}

module.exports = {
    calculateBattleStats,
    updateBattleLogChannelName
}; 