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
 * @returns {Promise<{data: Object}>} Aggregated activity data
 */
async function fetchActivityData({ userId, guildId, period, startDate }) {
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

    // Get all daily activities for the period
    const dailyStats = await prisma.dailyActivity.groupBy({
        by: ['userId', 'guildId', 'username'],
        where: {
            userId,
            guildId,
            date: {
                gte: startDate,
                lt: endDate
            }
        },
        _sum: {
            messageCount: true,
            voiceTimeSeconds: true,
            afkTimeSeconds: true,
            mutedDeafenedTimeSeconds: true
        }
    });

    // If no data found, return null
    if (dailyStats.length === 0) {
        return { data: null };
    }

    // Convert the aggregated data to match our expected format
    const stats = {
        voiceTimeSeconds: dailyStats[0]._sum.voiceTimeSeconds || 0,
        afkTimeSeconds: dailyStats[0]._sum.afkTimeSeconds || 0,
        mutedDeafenedTimeSeconds: dailyStats[0]._sum.mutedDeafenedTimeSeconds || 0,
        messageCount: dailyStats[0]._sum.messageCount || 0
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
    // Process all records
    const processedRecords = await Promise.all(
        activityRecords.map(async (record) => {
            const member = await getMember(record.userId).catch(() => null);
            if (!member) return null;

            const stats = calculateActivityStats(record);
            return {
                member,
                ...stats
            };
        })
    );

    // Filter out null entries and sort by active time
    return processedRecords
        .filter(entry => entry !== null)
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
