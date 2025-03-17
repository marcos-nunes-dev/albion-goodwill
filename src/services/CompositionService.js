const { EmbedBuilder } = require('discord.js');

const COMPOSITION_STATUS = {
    OPEN: 'open',
    CLOSED: 'closed',
    CANCELLED: 'cancelled'
};

// Store active compositions with their participants
const activeCompositions = new Map();

function isWeaponFullWithRegulars(weapon) {
    if (!weapon.players) return false;
    const regularPlayers = weapon.players.filter(p => !p.isFill);
    return regularPlayers.length >= (weapon.slots || 1);
}

function getFillPlayersCount(weapon) {
    if (!weapon.players) return 0;
    return weapon.players.filter(p => p.isFill).length;
}

function updateEmbedWithFillQueue(embed, compositionState) {
    if (!compositionState.fillQueue || compositionState.fillQueue.length === 0) {
        return embed;
    }

    let fillQueueText = '';
    compositionState.fillQueue.forEach((player, index) => {
        // Format player experience text with better organization
        const experienceText = player.experience ? 
            `\n> Experience: ${player.experience}` : 
            '\n> No recent experience';

        fillQueueText += `${index + 1}. **${player.name}**${experienceText}\n`;
    });

    // Add fill queue section with better formatting
    embed.addFields({ 
        name: '📋 Fill Queue', 
        value: fillQueueText || 'No players in queue', 
        inline: false 
    });

    return embed;
}

function validateComposition(composition) {
    try {
        if (!composition || typeof composition !== 'object') {
            return { isValid: false, error: 'Invalid composition format' };
        }

        if (!Array.isArray(composition.weapons)) {
            return { isValid: false, error: 'Weapons must be an array' };
        }

        for (const weapon of composition.weapons) {
            if (!weapon.name || typeof weapon.name !== 'string') {
                return { isValid: false, error: 'Each weapon must have a name' };
            }

            if (!weapon.slots || typeof weapon.slots !== 'number' || weapon.slots < 1) {
                return { isValid: false, error: 'Each weapon must have valid slots (number >= 1)' };
            }

            if (weapon.players && !Array.isArray(weapon.players)) {
                return { isValid: false, error: 'Players must be an array' };
            }
        }

        return { isValid: true };
    } catch (error) {
        console.error('Error validating composition:', error);
        return { isValid: false, error: 'Validation error occurred' };
    }
}

function cleanupComposition(threadId) {
    if (activeCompositions.has(threadId)) {
        activeCompositions.delete(threadId);
    }
}

function updateCompositionStatus(compositionState, newStatus, reason = '') {
    if (!Object.values(COMPOSITION_STATUS).includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
    }

    // Use the original embed as base
    const embed = new EmbedBuilder(compositionState.embed.data);
    
    // Only update the status in description
    embed.setDescription('Status: ' + newStatus.toUpperCase());

    // Clear existing fields to rebuild them
    embed.setFields([]);

    if (compositionState.weapons) {
        let totalPlayersRequired = 0;
        let fillPlayers = new Map(); // Track fill players and their experience

        // First, group weapons by party and sort by position
        const weaponsByParty = new Map();
        compositionState.weapons.forEach((weapon, weaponName) => {
            const partyName = weapon.partyName || 'Main Party';
            if (!weaponsByParty.has(partyName)) {
                weaponsByParty.set(partyName, []);
            }
            weaponsByParty.get(partyName).push({ ...weapon, name: weaponName });
        });

        // Process each party's weapons in order
        weaponsByParty.forEach((weapons, partyName) => {
            // Sort weapons by position
            weapons.sort((a, b) => (a.position || 0) - (b.position || 0));

            // Add party header
            embed.addFields({
                name: `🎯 ${partyName.toUpperCase()}`,
                value: ' ',
                inline: false
            });

            // Add each weapon
            weapons.forEach(weapon => {
                const players = weapon.players || [];
                totalPlayersRequired += weapon.required || 1;

                embed.addFields({
                    name: `${weapon.name} (${players.length}/${weapon.required || 1})`,
                    value: `\`\`\`gw ${weapon.name.toLowerCase()}\`\`\``,
                    inline: false
                });

                // Add players if any
                if (players.length > 0) {
                    const playerList = players.map(p => {
                        if (p.isFill) {
                            // Store fill player info for the fill queue section
                            fillPlayers.set(p.id, {
                                name: p.name,
                                experience: p.experience,
                                weapon: weapon.name
                            });
                            return `${p.name} (fill)`;
                        }
                        return p.name;
                    });
                    
                    if (playerList.length > 0) {
                        embed.addFields({
                            name: '\u200b',
                            value: playerList.join(', '),
                            inline: false
                        });
                    }
                }
            });

            // Add spacing between parties
            embed.addFields({ name: '\u200b', value: ' ', inline: false });
        });

        // Add total composition section
        embed.addFields({
            name: '📊 TOTAL COMPOSITION',
            value: `👥 **Total Players Required:** ${totalPlayersRequired}`,
            inline: false
        });

        // Add spacing
        embed.addFields({ name: '\u200b', value: ' ', inline: false });

        // Add fill queue section
        let fillQueueContent = ['Want to join as a fill player? Use:\n```gw fill```'];
        
        if (fillPlayers.size > 0) {
            fillQueueContent.push('\n**Current Fill Players:**');
            for (const [id, player] of fillPlayers) {
                fillQueueContent.push(`${player.name} [${player.experience}]`);
            }
        }

        embed.addFields({
            name: '👥 FILL QUEUE',
            value: fillQueueContent.join('\n'),
            inline: false
        });
    }

    return embed;
}

function updateWeaponState(weapon, userId, action, playerData = {}) {
    if (!weapon.players) {
        weapon.players = [];
    }

    // Preserve weapon properties
    if (!weapon.required) {
        weapon.required = weapon.slots || 1;
    }
    if (!weapon.position) {
        weapon.position = playerData.position || 1;
    }
    if (!weapon.partyName) {
        weapon.partyName = playerData.partyName || 'Main Party';
    }

    if (action === 'add') {
        // Remove existing entry if present
        weapon.players = weapon.players.filter(p => p.id !== userId);
        
        // Add new player entry
        weapon.players.push({
            id: userId,
            name: `<@${userId}>`,
            isFill: playerData.isFill || false,
            experience: playerData.experience || null
        });

        // Sort players - regular players first, then fill players
        weapon.players.sort((a, b) => {
            if (a.isFill === b.isFill) return 0;
            return a.isFill ? 1 : -1;
        });
    } else if (action === 'remove') {
        weapon.players = weapon.players.filter(p => p.id !== userId);
    }

    return weapon;
}

function formatWeaponName(weaponName) {
    return weaponName
        .replace(/^(Elder's|Master's|Grandmaster's|8\.3) /, '')
        .replace(/(Adept's|Expert's|Journeyman's) /, '')
        .replace(/\b(Staff|Spear|Bow|Crossbow|Dagger|Sword|Axe|Mace|Hammer|Quarterstaff|Cursed Staff|Fire Staff|Frost Staff|Holy Staff|Nature Staff|Arcane Staff)\b/i, (match) => {
            const shortForms = {
                'Staff': 'Staff',
                'Spear': 'Spear',
                'Bow': 'Bow',
                'Crossbow': 'Xbow',
                'Dagger': 'Dagger',
                'Sword': 'Sword',
                'Axe': 'Axe',
                'Mace': 'Mace',
                'Hammer': 'Hammer',
                'Quarterstaff': 'QStaff',
                'Cursed Staff': 'Cursed',
                'Fire Staff': 'Fire',
                'Frost Staff': 'Frost',
                'Holy Staff': 'Holy',
                'Nature Staff': 'Nature',
                'Arcane Staff': 'Arcane'
            };
            return shortForms[match] || match;
        });
}

function getStatusColor(status) {
    switch (status.toLowerCase()) {
        case COMPOSITION_STATUS.OPEN:
            return 0x00FF00; // Green
        case COMPOSITION_STATUS.CLOSED:
            return 0xFF0000; // Red
        case COMPOSITION_STATUS.CANCELLED:
            return 0x808080; // Gray
        default:
            return 0x0099FF; // Blue
    }
}

module.exports = {
    COMPOSITION_STATUS,
    activeCompositions,
    isWeaponFullWithRegulars,
    getFillPlayersCount,
    updateEmbedWithFillQueue,
    validateComposition,
    cleanupComposition,
    updateCompositionStatus,
    updateWeaponState,
    formatWeaponName,
    getStatusColor
};
