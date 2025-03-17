const fetch = require('node-fetch');

// Calculate Levenshtein distance between two strings
function levenshteinDistance(str1, str2) {
    const track = Array(str2.length + 1).fill(null).map(() =>
        Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) track[0][i] = i;
    for (let j = 0; j <= str2.length; j++) track[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1, // deletion
                track[j - 1][i] + 1, // insertion
                track[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    
    return track[str2.length][str1.length];
}

// Check if two strings are similar enough (fuzzy match)
function isSimilarWeaponName(name1, name2) {
    // Convert both names to lowercase and remove spaces
    const clean1 = name1.toLowerCase().replace(/\s+/g, '');
    const clean2 = name2.toLowerCase().replace(/\s+/g, '');

    // Direct match after cleaning
    if (clean1 === clean2) return true;

    // Common variations
    const variations = {
        'hallowfall': ['hallofall', 'hollowfall', 'halowfall', 'hallowfal'],
        'greatarcane': ['greatark', 'garkane', 'garcane'],
        'bloodletter': ['bloodleter', 'bletter', 'bloodlet'],
        'spirithunter': ['spirhunter', 'sprhunter', 'spirithntr'],
        'dawnbreaker': ['dawnbraker', 'dbreaker', 'dawnbreak'],
        'clarent': ['clarence', 'clarient', 'clarant'],
        'carving': ['carvin', 'craving', 'karving'],
        'bridled': ['briddle', 'bridle', 'brideled'],
        'mistpiercer': ['mistpierce', 'mistpercer', 'mistpircer'],
        'shadowcaller': ['shadowcaler', 'shadocaller', 'shadowcall'],
        'enigmatic': ['enigma', 'enigmatik', 'enigmatc'],
        'occult': ['ocult', 'ocult', 'oculte'],
        'cursed': ['curse', 'curs', 'coursed'],
        'demonic': ['demon', 'demoni', 'demonc'],
        'lifecurse': ['lifecurs', 'lifcurse', 'lifecurce'],
        'soulscythe': ['soulscyte', 'soulscyth', 'soulscyte'],
        'realmbreaker': ['realmbraker', 'realmbreak', 'realbreak'],
        'grovekeeper': ['grovkeeper', 'grovekeep', 'gkeeper'],
        'morningstar': ['mstar', 'mornstar', 'morningstr'],
        'camlann': ['camlan', 'camlan', 'camlam'],
        'permafrost': ['perma', 'permfrst', 'permafros'],
        'icicle': ['icycle', 'icikle', 'iceicle'],
        'hoarfrost': ['hoarfrst', 'hoarfros', 'hoarfst'],
        'glacial': ['glaciel', 'glacia', 'glacal'],
        'galatine': ['galatyne', 'galetine', 'galatyn'],
        'kingmaker': ['kingmake', 'kmaker', 'kingmakr'],
        'carving': ['karving', 'carvin', 'craving']
    };

    // Check against variations
    for (const [base, vars] of Object.entries(variations)) {
        if (clean1.includes(base) || vars.some(v => clean1.includes(v))) {
            if (clean2.includes(base) || vars.some(v => clean2.includes(v))) {
                return true;
            }
        }
    }

    // If no variation matches, use Levenshtein distance
    // Allow more distance for longer names
    const maxDistance = Math.floor(Math.min(clean1.length, clean2.length) * 0.3); // 30% of length
    return levenshteinDistance(clean1, clean2) <= maxDistance;
}

async function fetchPlayerWeaponStats(playerName) {
    try {        
        // Fetch both 30 days and all time stats
        const [last30DaysResponse, allTimeResponse] = await Promise.all([
            fetch(`https://murderledger.albiononline2d.com/api/players/${encodeURIComponent(playerName)}/stats/weapons`, {
                timeout: 5000
            }),
            fetch(`https://murderledger.albiononline2d.com/api/players/${encodeURIComponent(playerName)}/stats/weapons?lookback_days=9999`, {
                timeout: 5000
            })
        ]);

        if (!last30DaysResponse.ok) {
            throw new Error(`HTTP error! status: ${last30DaysResponse.status}`);
        }

        if (!allTimeResponse.ok) {
            throw new Error(`HTTP error! status: ${allTimeResponse.status}`);
        }

        // Get the data from both endpoints
        const last30DaysData = await last30DaysResponse.json();
        const allTimeData = await allTimeResponse.json();

        // Combine weapons from both periods
        const weaponMap = new Map();

        // Process all-time stats first (they take precedence)
        (allTimeData.weapons || []).forEach(weapon => {
            if (weapon.weapon_name && weapon.usages > 0) {
                weaponMap.set(weapon.weapon_name, {
                    name: weapon.weapon_name,
                    usage: weapon.usages
                });
            }
        });

        // Add any weapons from last 30 days that aren't in all-time
        (last30DaysData.weapons || []).forEach(weapon => {
            if (weapon.weapon_name && weapon.usages > 0 && !weaponMap.has(weapon.weapon_name)) {
                weaponMap.set(weapon.weapon_name, {
                    name: weapon.weapon_name,
                    usage: weapon.usages
                });
            }
        });

        // Convert map to array
        const result = Array.from(weaponMap.values());
        return result;

    } catch (error) {
        console.error('Error fetching weapon stats:', error);
        return [];
    }
}

function getExperiencedWeapons(weaponStats, minUsage = 100) {
    const experienced = weaponStats.filter(weapon => weapon.usage >= minUsage);
    return experienced;
}

function cleanWeaponName(name) {
    return name
        .replace(/Elder's\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = {
    fetchPlayerWeaponStats,
    getExperiencedWeapons,
    cleanWeaponName,
    isSimilarWeaponName
};
