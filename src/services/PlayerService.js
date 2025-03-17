const prisma = require('../config/prisma');

/**
 * Gets the verified character name for a Discord user in a specific guild
 * @param {string} discordId - The Discord user ID
 * @param {string} guildId - The Discord guild ID
 * @returns {Promise<string|null>} The verified character name or null if not found
 */
async function getVerifiedCharacter(discordId, guildId) {
    try {
        if (!discordId || !guildId) {
            console.warn('Missing required parameters for verification check');
            return null;
        }

        console.log('Checking verification for Discord ID:', discordId, 'in Guild:', guildId);
        
        const user = await prisma.playerRegistration.findFirst({
            where: {
                userId: discordId,
                guildId: guildId
            },
            select: {
                playerName: true
            }
        }).catch(error => {
            console.error('Prisma query error:', error);
            return null;
        });

        return user?.playerName || null;
    } catch (error) {
        console.error('Error fetching verified character:', error);
        return null;
    }
}

module.exports = {
    getVerifiedCharacter
};
