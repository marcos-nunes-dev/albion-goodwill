const REGIONS = ['america', 'europe', 'asia'];

const ROLE_TYPES = {
    TANK: { id: 'tank', name: 'Tank', fieldName: 'tankRoleId' },
    SUPPORT: { id: 'support', name: 'Support', fieldName: 'supportRoleId' },
    HEALER: { id: 'healer', name: 'Healer', fieldName: 'healerRoleId' },
    MELEE: { id: 'melee', name: 'DPS Melee', fieldName: 'dpsMeleeRoleId' },
    RANGED: { id: 'ranged', name: 'DPS Ranged', fieldName: 'dpsRangedRoleId' },
    MOUNT: { id: 'mount', name: 'Battlemount', fieldName: 'battlemountRoleId' }
};

const ROLE_CHOICES = Object.values(ROLE_TYPES).map(role => ({
    name: role.name,
    value: role.id
}));

const ROLE_FIELD_MAP = Object.values(ROLE_TYPES).reduce((acc, role) => {
    acc[role.id] = role.fieldName;
    return acc;
}, {});

module.exports = {
    REGIONS,
    ROLE_TYPES,
    ROLE_CHOICES,
    ROLE_FIELD_MAP,
    MAX_COMPETITORS: 5,
    DEFAULT_PREFIX: '!albiongw',
    DEFAULT_COOLDOWN: 3000, // 3 seconds
    COMMAND_ALIASES: {
        'lb': 'leaderboard',
        'reg': 'register',
        'unreg': 'unregister',
        'comp': 'competitors'
    }
}; 