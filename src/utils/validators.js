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

module.exports = {
    isAdmin,
    validateGuildSettings
}; 