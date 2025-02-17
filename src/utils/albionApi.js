const axios = require('axios');

async function fetchGuildStats(guildId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const start = thirtyDaysAgo.toISOString().split('T')[0];
  const end = new Date().toISOString().split('T')[0];
  
  try {
    const response = await axios.get(
      `https://api.albionbb.com/us/stats/guilds/${guildId}?minPlayers=20&start=${start}&end=${end}`
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching guild stats:', error.message);
    return null;
  }
}

function getMainRole(roles) {
  const roleNames = ['Tank', 'Support', 'Healer', 'DPS Melee', 'DPS Ranged', 'Battlemount'];
  const mainRoleIndex = roles.reduce((maxIndex, current, index, array) => {
    return current > array[maxIndex] ? index : maxIndex;
  }, 0);
  
  return {
    name: roleNames[mainRoleIndex],
    index: mainRoleIndex,
    count: roles[mainRoleIndex]
  };
}

function calculatePlayerScores(players, roleIndex) {
  // Filter players by same role and minimum attendance
  const rolePlayers = players.filter(p => {
    const playerMainRole = getMainRole(p.roles);
    return playerMainRole.index === roleIndex && p.attendance >= 5;
  });

  // Define metrics based on role
  const getMetrics = (player) => {
    switch(roleIndex) {
      case 0: // Tank
        return {
          kdRatio: { 
            weight: 0.4,
            value: player.deaths > 0 ? player.kills / player.deaths : player.kills
          },
          killFamePerBattle: { 
            weight: 0.3,
            value: player.attendance > 0 ? player.killFame / player.attendance : 0
          },
          avgIp: { 
            weight: 0.3,
            value: player.avgIp
          }
        };
      case 1: // Support
      case 2: // Healer
        return {
          kdRatio: { 
            weight: 0.3,
            value: player.deaths > 0 ? player.kills / player.deaths : player.kills
          },
          healPerBattle: {
            weight: 0.4,
            value: player.attendance > 0 ? player.heal / player.attendance : 0
          },
          avgIp: { 
            weight: 0.3,
            value: player.avgIp
          }
        };
      case 3: // DPS Melee
      case 4: // DPS Ranged
        return {
          kdRatio: { 
            weight: 0.25,
            value: player.deaths > 0 ? player.kills / player.deaths : player.kills
          },
          killFamePerBattle: { 
            weight: 0.25,
            value: player.attendance > 0 ? player.killFame / player.attendance : 0
          },
          damagePerBattle: {
            weight: 0.25,
            value: player.attendance > 0 ? player.damage / player.attendance : 0
          },
          avgIp: { 
            weight: 0.25,
            value: player.avgIp
          }
        };
      case 5: // Battlemount
        return {
          kdRatio: { 
            weight: 0.4,
            value: player.deaths > 0 ? player.kills / player.deaths : player.kills
          },
          killFamePerBattle: { 
            weight: 0.4,
            value: player.attendance > 0 ? player.killFame / player.attendance : 0
          },
          avgIp: { 
            weight: 0.2,
            value: player.avgIp
          }
        };
    }
  };

  // Calculate min/max for each metric across all role players
  const metricRanges = {};
  rolePlayers.forEach(player => {
    const metrics = getMetrics(player);
    Object.entries(metrics).forEach(([metric, { value }]) => {
      if (!metricRanges[metric]) {
        metricRanges[metric] = { min: value, max: value };
      } else {
        metricRanges[metric].min = Math.min(metricRanges[metric].min, value);
        metricRanges[metric].max = Math.max(metricRanges[metric].max, value);
      }
    });
  });

  // Calculate raw scores first
  const playersWithRawScores = rolePlayers.map(player => {
    const metrics = getMetrics(player);
    let totalScore = 0;

    Object.entries(metrics).forEach(([metric, { weight, value }]) => {
      const { min, max } = metricRanges[metric];
      const range = max - min;
      
      if (range > 0) {
        const normalizedScore = (value - min) / range;
        totalScore += normalizedScore * weight;
      }
    });

    return {
      ...player,
      score: totalScore
    };
  });

  // Find min and max scores to normalize to 0-100 range
  const minScore = Math.min(...playersWithRawScores.map(p => p.score));
  const maxScore = Math.max(...playersWithRawScores.map(p => p.score));
  const scoreRange = maxScore - minScore;

  // Normalize scores to ensure top player gets 100
  return playersWithRawScores.map(player => ({
    ...player,
    score: Math.round(((player.score - minScore) / scoreRange) * 100)
  })).sort((a, b) => b.score - a.score);
}

module.exports = {
  fetchGuildStats,
  getMainRole,
  calculatePlayerScores
}; 