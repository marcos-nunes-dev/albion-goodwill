const { ROLE_INDICES, MMR_WEIGHTS, MIN_BATTLES, ROLE_NAMES } = require('./constants');

// Helper function to calculate K/D ratio
function calculateKD(kills, deaths) {
    if (!deaths) {
        return kills || 0; // If no deaths, return kills (or 0 if no kills)
    }
    if (!kills) {
        return -deaths; // If no kills but has deaths, return negative deaths
    }
    const ratio = kills / deaths;
    return ratio < 1 ? -deaths / kills : ratio;
}

// Helper function to format K/D ratio
function formatKD(kd) {
    if (isNaN(kd) || !isFinite(kd)) return '0.00';
    return kd.toFixed(2);
}

// Helper function to normalize a metric
function normalizeMetric(value, min, max) {
    const range = max - min;
    return range > 0 ? (value - min) / range : 0;
}

// Calculate metrics for a player
function calculatePlayerMetrics(player) {
    return {
        kdRatio: player.deaths > 0 ? player.kills / player.deaths : (player.kills || 0),
        killFamePerBattle: player.attendance > 0 ? Math.round(player.killFame / player.attendance) : 0,
        damagePerBattle: player.attendance > 0 ? Math.round(player.damage / player.attendance) : 0,
        healPerBattle: player.attendance > 0 ? Math.round(player.heal / player.attendance) : 0,
        avgIp: player.avgIp || 0
    };
}

// Calculate metric ranges for a group of players
function calculateMetricRanges(players) {
    const ranges = {};
    players.forEach(player => {
        const metrics = calculatePlayerMetrics(player);
        Object.entries(metrics).forEach(([metric, value]) => {
            if (!ranges[metric]) {
                ranges[metric] = { min: value, max: value };
            } else {
                ranges[metric].min = Math.min(ranges[metric].min, value);
                ranges[metric].max = Math.max(ranges[metric].max, value);
            }
        });
    });
    return ranges;
}

// Calculate raw score for a player based on their role
function calculateRawScore(player, metricRanges, roleIndex) {
    const metrics = calculatePlayerMetrics(player);
    const weights = MMR_WEIGHTS[roleIndex];
    let totalScore = 0;

    Object.entries(weights).forEach(([metric, weight]) => {
        const normalizedValue = normalizeMetric(
            metrics[metric],
            metricRanges[metric].min,
            metricRanges[metric].max
        );
        totalScore += normalizedValue * weight;
    });

    return totalScore;
}

// Calculate normalized scores (0-100) for a group of players
function calculateNormalizedScores(players, roleIndex) {
    if (!players.length) return [];

    // Filter players by minimum battles
    const qualifiedPlayers = players.filter(p => p.attendance >= MIN_BATTLES);
    if (!qualifiedPlayers.length) return [];

    // Calculate metric ranges
    const metricRanges = calculateMetricRanges(qualifiedPlayers);

    // Calculate raw scores
    const rawScores = qualifiedPlayers.map(player => ({
        ...player,
        score: calculateRawScore(player, metricRanges, roleIndex)
    }));

    // Normalize to 0-100 range
    const minScore = Math.min(...rawScores.map(p => p.score));
    const maxScore = Math.max(...rawScores.map(p => p.score));
    const scoreRange = maxScore - minScore;

    return rawScores.map(player => ({
        ...player,
        score: Math.round(((player.score - minScore) / scoreRange) * 100)
    })).sort((a, b) => b.score - a.score);
}

// Get role-specific MMR explanation
function getRoleMMRExplanation(roleIndex) {
    const weights = MMR_WEIGHTS[roleIndex];
    const components = Object.entries(weights).map(([metric, weight]) => {
        const percentage = Math.round(weight * 100);
        const readableMetric = metric
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .replace('Per Battle', '/Battle');
        return `${percentage}% ${readableMetric}`;
    });

    const roleType = ROLE_NAMES[roleIndex];
    return `${roleType} MMR = (${components.join(') + (')}) | Normalized against all ${roleType}s with ${MIN_BATTLES}+ battles`;
}

// Get stat comparison between two players
function getStatComparison(player, topPlayer) {
    const formatDiff = (curr, top, isKD = false) => {
        if (isKD) {
            if (curr === top) return '=';
            const symbol = curr > top ? '↓' : '↑';
            return `${symbol}${Math.abs(top - curr).toFixed(2)}`;
        }
        const diff = top - curr;
        if (diff === 0) return '=';
        const symbol = diff > 0 ? '↑' : '↓';
        return `${symbol}${Math.abs(Math.round(diff)).toLocaleString()}`;
    };

    // Use the same metric calculations as used in MMR scoring
    const playerMetrics = calculatePlayerMetrics(player);
    const topPlayerMetrics = calculatePlayerMetrics(topPlayer);

    return {
        playerAvgs: {
            damage: playerMetrics.damagePerBattle,
            healing: playerMetrics.healPerBattle,
            damageTaken: player.attendance > 0 ? player.damageTaken / player.attendance : 0,
            killFame: playerMetrics.killFamePerBattle,
            kd: playerMetrics.kdRatio
        },
        topAvgs: {
            damage: topPlayerMetrics.damagePerBattle,
            healing: topPlayerMetrics.healPerBattle,
            damageTaken: topPlayer.attendance > 0 ? topPlayer.damageTaken / topPlayer.attendance : 0,
            killFame: topPlayerMetrics.killFamePerBattle,
            kd: topPlayerMetrics.kdRatio
        },
        comparisons: {
            battles: formatDiff(player.attendance, topPlayer.attendance),
            avgIp: formatDiff(playerMetrics.avgIp, topPlayerMetrics.avgIp),
            kd: formatDiff(playerMetrics.kdRatio, topPlayerMetrics.kdRatio, true),
            damage: formatDiff(playerMetrics.damagePerBattle, topPlayerMetrics.damagePerBattle),
            healing: formatDiff(playerMetrics.healPerBattle, topPlayerMetrics.healPerBattle),
            damageTaken: formatDiff(
                player.attendance > 0 ? player.damageTaken / player.attendance : 0,
                topPlayer.attendance > 0 ? topPlayer.damageTaken / topPlayer.attendance : 0
            ),
            killFame: formatDiff(playerMetrics.killFamePerBattle, topPlayerMetrics.killFamePerBattle)
        }
    };
}

module.exports = {
    calculateKD,
    formatKD,
    calculatePlayerMetrics,
    calculateNormalizedScores,
    getRoleMMRExplanation,
    getStatComparison,
    MIN_BATTLES
}; 