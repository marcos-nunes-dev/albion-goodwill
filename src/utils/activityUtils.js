const prisma = require('../config/prisma');

/**
 * Calculates activity stats from raw activity data
 * @param {Object} activityData - Raw activity data from database
 * @param {number} activityData.voiceTimeSeconds - Total voice time in seconds
 * @param {number} activityData.afkTimeSeconds - AFK time in seconds
 * @param {number} activityData.messageCount - Number of messages
 * @returns {Object} Processed activity stats
 */
function calculateActivityStats(activityData) {
    // Ensure we have non-negative values
    const totalTime = Math.max(0, activityData?.voiceTimeSeconds || 0);
    const afkTime = Math.max(0, Math.min(totalTime, activityData?.afkTimeSeconds || 0));
    const messageCount = Math.max(0, activityData?.messageCount || 0);
    
    // Calculate active time (total - afk), ensuring it's not negative
    const activeTime = Math.max(0, totalTime - afkTime);
    
    // Calculate active percentage
    const activePercentage = totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 0;
    
    return {
        totalTime,
        activeTime,
        afkTime,
        messageCount,
        activePercentage
    };
}

/**
 * Fetches activity data for a specific period from daily activities
 * @param {Object} params - Parameters for fetching activity data
 * @param {string} params.userId - User ID to fetch data for
 * @param {string} params.guildId - Guild ID to fetch data for
 * @param {string} params.period - Period to fetch data for ('daily', 'weekly', 'monthly')
 * @param {Date} params.startDate - Start date for the period
 * @param {boolean} [params.includeAllMembers=false] - Whether to include all members or not
 * @returns {Promise<{data: Object|Array}>} Aggregated activity data
 */
async function fetchActivityData({ userId, guildId, period, startDate, includeAllMembers = false }) {
    const endDate = new Date(startDate);
    
    // Calculate end date based on period
    switch (period) {
        case 'monthly':
            endDate.setMonth(endDate.getMonth() + 1);
            break;
        case 'weekly':
            endDate.setDate(endDate.getDate() + 7);
            break;
        case 'daily':
            endDate.setDate(endDate.getDate() + 1);
            break;
    }

    // Build the where clause
    const whereClause = {
        guildId,
        date: {
            gte: startDate,
            lt: endDate
        }
    };

    // Add userId to where clause if not including all members
    if (!includeAllMembers && userId) {
        whereClause.userId = userId;
    }

    // Get all daily activities for the period
    const dailyStats = await prisma.dailyActivity.groupBy({
        by: ['userId'],
        where: whereClause,
        _sum: {
            messageCount: true,
            voiceTimeSeconds: true,
            afkTimeSeconds: true,
            mutedDeafenedTimeSeconds: true
        }
    });

    // If no data found and specific user requested
    if (!includeAllMembers && dailyStats.length === 0) {
        return { data: null };
    }

    // For leaderboard (all members), return array of stats
    if (includeAllMembers) {
        return {
            data: dailyStats.map(stat => ({
                userId: stat.userId,
                voiceTimeSeconds: stat._sum.voiceTimeSeconds || 0,
                afkTimeSeconds: stat._sum.afkTimeSeconds || 0,
                mutedDeafenedTimeSeconds: stat._sum.mutedDeafenedTimeSeconds || 0,
                messageCount: stat._sum.messageCount || 0
            }))
        };
    }

    // For single user, return single stat object
    const stats = {
        voiceTimeSeconds: dailyStats[0]?._sum.voiceTimeSeconds || 0,
        afkTimeSeconds: dailyStats[0]?._sum.afkTimeSeconds || 0,
        mutedDeafenedTimeSeconds: dailyStats[0]?._sum.mutedDeafenedTimeSeconds || 0,
        messageCount: dailyStats[0]?._sum.messageCount || 0
    };

    return { data: stats };
}

/**
 * Processes multiple activity records and returns sorted results
 * @param {Array} activityRecords - Array of activity records from database
 * @param {Function} getMember - Function to get member object for a user ID
 * @returns {Promise<Array>} Sorted array of processed activity records with member data
 */
async function processActivityRecords(activityRecords, getMember) {
    if (!Array.isArray(activityRecords)) {
        console.error('processActivityRecords: activityRecords is not an array');
        return [];
    }

    // Process all records
    const processedRecords = await Promise.all(
        activityRecords.map(async (record) => {
            if (!record || !record.userId) {
                console.error('processActivityRecords: Invalid record:', record);
                return null;
            }

            const member = await getMember(record.userId).catch((error) => {
                console.error(`Failed to fetch member ${record.userId}:`, error);
                return null;
            });
            
            if (!member) return null;

            // Calculate active time (total - afk)
            const totalTime = Math.max(0, record.voiceTimeSeconds || 0);
            const afkTime = Math.max(0, Math.min(totalTime, record.afkTimeSeconds || 0));
            const mutedTime = Math.max(0, record.mutedDeafenedTimeSeconds || 0);
            const activeTime = Math.max(0, totalTime - afkTime);
            const messageCount = Math.max(0, record.messageCount || 0);

            return {
                member,
                stats: record,
                totalTime,
                activeTime,
                afkTime,
                mutedTime,
                messageCount
            };
        })
    );

    // Filter out null entries and sort by active time
    return processedRecords
        .filter(entry => entry !== null && entry.activeTime > 0)
        .sort((a, b) => b.activeTime - a.activeTime);
}

/**
 * Calculates activity distribution stats
 * @param {Array} processedRecords - Array of processed activity records
 * @param {number} activityThreshold - Minimum active time to be considered active
 * @returns {Object} Activity distribution stats
 */
function calculateActivityDistribution(processedRecords, activityThreshold = 0) {
    const totalMembers = processedRecords.length;
    const activeMembers = processedRecords.filter(entry => entry.activeTime >= activityThreshold).length;
    const inactiveMembers = totalMembers - activeMembers;
    const activePercentage = totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 100) : 0;
    
    return {
        totalMembers,
        activeMembers,
        inactiveMembers,
        activePercentage,
        inactivePercentage: 100 - activePercentage
    };
}

/**
 * Calculates top activity stats
 * @param {Array} processedRecords - Array of processed activity records
 * @param {number} topCount - Number of top records to consider
 * @param {number} thresholdPercentage - Percentage of top average to use as threshold
 * @returns {Object} Top activity stats
 */
function calculateTopActivityStats(processedRecords, topCount = 10, thresholdPercentage = 30) {
    const topRecords = processedRecords.slice(0, topCount);
    const topAverage = topRecords.length > 0
        ? topRecords.reduce((sum, record) => sum + record.activeTime, 0) / topRecords.length
        : 0;
    
    return {
        topAverage,
        activityThreshold: topAverage * (thresholdPercentage / 100)
    };
}

module.exports = {
    calculateActivityStats,
    fetchActivityData,
    processActivityRecords,
    calculateActivityDistribution,
    calculateTopActivityStats
};
