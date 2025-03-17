const LOOKBACK_DAYS = 30;

// Cache for weapon stats to avoid repeated API calls
const weaponStatsCache = new Map();

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;
const requestTimestamps = new Map();

function cleanupRateLimitData() {
    const now = Date.now();
    for (const [playerName, timestamps] of requestTimestamps.entries()) {
        const recentTimestamps = timestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
        if (recentTimestamps.length === 0) {
            requestTimestamps.delete(playerName);
        } else {
            requestTimestamps.set(playerName, recentTimestamps);
        }
    }
}

function isRateLimited(playerName) {
    const now = Date.now();
    const timestamps = requestTimestamps.get(playerName) || [];
    const recentTimestamps = timestamps.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    
    if (recentTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
        return true;
    }
    
    recentTimestamps.push(now);
    requestTimestamps.set(playerName, recentTimestamps);
    
    if (Math.random() < 0.1) {
        cleanupRateLimitData();
    }
    
    return false;
}

async function fetchPlayerWeaponStats(playerName, lookbackDays = LOOKBACK_DAYS) {
    try {
        const cacheKey = `${playerName}-${lookbackDays}`;
        const cachedStats = weaponStatsCache.get(cacheKey);
        
        if (cachedStats) {
            return cachedStats;
        }

        if (isRateLimited(playerName)) {
            console.warn(`Rate limit hit for player: ${playerName}`);
            return [];
        }

        const response = await fetch(`https://murderledger.albiononline2d.com/api/players/${playerName}/stats/weapons${lookbackDays ? `?lookback_days=${lookbackDays}` : ''}`, {
            timeout: 5000
        });
        
        if (!response.ok) {
            if (response.status === 429) {
                console.warn(`Rate limit hit from API for player: ${playerName}`);
                return [];
            }
            if (response.status === 404) {
                console.warn(`Player not found: ${playerName}`);
                return [];
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid response data format');
        }

        const stats = data.weapons || [];
        if (!Array.isArray(stats)) {
            throw new Error('Invalid weapons data format');
        }

        weaponStatsCache.set(cacheKey, stats);
        setTimeout(() => weaponStatsCache.delete(cacheKey), 5 * 60 * 1000);
        
        return stats;
    } catch (error) {
        console.error('Error fetching weapon stats:', error);
        return [];
    }
}

async function checkWeaponExperience(playerName, weaponName) {
    try {
        const [recentStats, allTimeStats] = await Promise.all([
            fetchPlayerWeaponStats(playerName, 30),
            fetchPlayerWeaponStats(playerName, 9999)
        ]);

        const cleanWeaponName = weaponName.replace("Elder's ", "");

        const findWeapon = (stats, name) => {
            return stats.find(w => 
                w.weapon_name.toLowerCase() === name.toLowerCase() ||
                w.weapon.toLowerCase() === name.toLowerCase() ||
                w.weapon_name.toLowerCase().includes(name.toLowerCase())
            );
        };

        const recentWeapon = findWeapon(recentStats, cleanWeaponName);
        const allTimeWeapon = findWeapon(allTimeStats, cleanWeaponName);

        const sortedRecentWeapons = recentStats
            .filter(w => w.usages > 0)
            .sort((a, b) => b.usages - a.usages)
            .slice(0, 5);

        const sortedAllTimeWeapons = allTimeStats
            .filter(w => w.usages > 0)
            .sort((a, b) => b.usages - a.usages)
            .slice(0, 5);

        return {
            hasExperience: !!(recentWeapon && recentWeapon.usages > 0),
            recentStats: recentWeapon,
            allTimeStats: allTimeWeapon,
            topRecentWeapons: sortedRecentWeapons,
            topAllTimeWeapons: sortedAllTimeWeapons
        };
    } catch (error) {
        console.error('Error checking weapon experience:', error);
        return {
            hasExperience: false,
            recentStats: null,
            allTimeStats: null,
            topRecentWeapons: [],
            topAllTimeWeapons: []
        };
    }
}

module.exports = {
    checkWeaponExperience,
    fetchPlayerWeaponStats
};
