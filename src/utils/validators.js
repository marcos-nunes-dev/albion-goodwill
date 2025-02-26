const prisma = require('../config/prisma');

const isAdmin = (member) => {
    return member.permissions.has('ADMINISTRATOR');
};

const validateGuildSettings = async (guildId) => {
    const settings = await prisma.guildSettings.findUnique({
        where: { guildId }
    });

    const errors = [];
    if (!settings?.albionGuildId) {
        errors.push('Albion guild ID not configured');
    }
    if (!settings?.nicknameVerifiedId) {
        errors.push('Verified role not configured');
    }

    return {
        isValid: errors.length === 0,
        errors,
        settings
    };
};

const validateGuildConfiguration = async (guildId) => {
    const settings = await prisma.guildSettings.findUnique({
        where: { guildId }
    });

    const missingFields = [];

    // Check for required fields
    if (!settings?.albionGuildId) {
        missingFields.push('Albion Guild ID');
    }

    if (!settings?.competitorIds || settings.competitorIds.length === 0) {
        missingFields.push('Competitor Guild IDs');
    }

    if (!settings?.battlemountRoleId) {
        missingFields.push('Battlemount Role');
    }

    if (!settings?.dpsMeleeRoleId) {
        missingFields.push('DPS Melee Role');
    }

    if (!settings?.dpsRangedRoleId) {
        missingFields.push('DPS Ranged Role');
    }

    if (!settings?.healerRoleId) {
        missingFields.push('Healer Role');
    }

    if (!settings?.nicknameVerifiedId) {
        missingFields.push('Nickname Verified Role');
    }

    if (!settings?.supportRoleId) {
        missingFields.push('Support Role');
    }

    if (!settings?.tankRoleId) {
        missingFields.push('Tank Role');
    }

    return {
        isConfigured: missingFields.length === 0,
        missingFields,
        settings
    };
};

module.exports = {
    isAdmin,
    validateGuildSettings,
    validateGuildConfiguration
}; 