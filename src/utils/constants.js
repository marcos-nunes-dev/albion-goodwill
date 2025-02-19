// Role indices
const ROLE_INDICES = {
    TANK: 0,
    SUPPORT: 1,
    HEALER: 2,
    DPS_MELEE: 3,
    DPS_RANGED: 4,
    BATTLEMOUNT: 5
};

// Role names
const ROLE_NAMES = {
    [ROLE_INDICES.TANK]: 'Tank',
    [ROLE_INDICES.SUPPORT]: 'Support',
    [ROLE_INDICES.HEALER]: 'Healer',
    [ROLE_INDICES.DPS_MELEE]: 'DPS Melee',
    [ROLE_INDICES.DPS_RANGED]: 'DPS Ranged',
    [ROLE_INDICES.BATTLEMOUNT]: 'Battlemount'
};

// MMR Weights per role
const MMR_WEIGHTS = {
    [ROLE_INDICES.TANK]: {
        kdRatio: 0.3,
        killFamePerBattle: 0.4,
        avgIp: 0.3
    },
    [ROLE_INDICES.SUPPORT]: {
        kdRatio: 0.3,
        killFamePerBattle: 0.4,
        avgIp: 0.3
    },
    [ROLE_INDICES.HEALER]: {
        healPerBattle: 0.5,
        kdRatio: 0.2,
        avgIp: 0.3
    },
    [ROLE_INDICES.DPS_MELEE]: {
        damagePerBattle: 0.4,
        kdRatio: 0.2,
        killFamePerBattle: 0.2,
        avgIp: 0.2
    },
    [ROLE_INDICES.DPS_RANGED]: {
        damagePerBattle: 0.4,
        kdRatio: 0.2,
        killFamePerBattle: 0.2,
        avgIp: 0.2
    },
    [ROLE_INDICES.BATTLEMOUNT]: {
        kdRatio: 0.4,
        killFamePerBattle: 0.4,
        avgIp: 0.2
    }
};

// Minimum battles required for MMR calculation
const MIN_BATTLES = 5;

module.exports = {
    ROLE_INDICES,
    ROLE_NAMES,
    MMR_WEIGHTS,
    MIN_BATTLES
}; 