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
 * Fetches activity data with fallback to lower granularity data
 * @param {Object} params - Parameters for fetching activity data
 * @param {string} params.userId - User ID to fetch data for
 * @param {string} params.guildId - Guild ID to fetch data for
 * @param {string} params.period - Period to fetch data for ('daily', 'weekly', 'monthly')
 * @param {Date} params.startDate - Start date for the period
 * @returns {Promise<{data: Object, isPartialData: boolean}>} Activity data and whether it's partial
 */
async function fetchActivityData({ userId, guildId, period, startDate }) {
    let stats = null;
    let isPartialData = false;

    // Try to get data from the primary granularity
    switch (period) {
        case 'daily': {
            stats = await prisma.dailyActivity.findUnique({
                where: {
                    userId_guildId_date: {
                        userId,
                        guildId,
                        date: startDate
                    }
                }
            });
            break;
        }
        case 'weekly': {
            stats = await prisma.weeklyActivity.findUnique({
                where: {
                    userId_guildId_weekStart: {
                        userId,
                        guildId,
                        weekStart: startDate
                    }
                }
            });
            break;
        }
        case 'monthly': {
            stats = await prisma.monthlyActivity.findUnique({
                where: {
                    userId_guildId_monthStart: {
                        userId,
                        guildId,
                        monthStart: startDate
                    }
                }
            });
            break;
        }
    }

    // If no data found, try lower granularity
    if (!stats) {
        const endDate = new Date(startDate);
        switch (period) {
            case 'monthly': {
                // Try weekly data first
                endDate.setMonth(endDate.getMonth() + 1);
                const weeklyStats = await prisma.weeklyActivity.findMany({
                    where: {
                        userId,
                        guildId,
                        weekStart: {
                            gte: startDate,
                            lt: endDate
                        }
                    }
                });

                if (weeklyStats.length > 0) {
                    isPartialData = true;
                    stats = weeklyStats.reduce((acc, curr) => ({
                        voiceTimeSeconds: (acc.voiceTimeSeconds || 0) + curr.voiceTimeSeconds,
                        afkTimeSeconds: (acc.afkTimeSeconds || 0) + curr.afkTimeSeconds,
                        mutedDeafenedTimeSeconds: (acc.mutedDeafenedTimeSeconds || 0) + curr.mutedDeafenedTimeSeconds,
                        messageCount: (acc.messageCount || 0) + curr.messageCount
                    }), {});
                    break;
                }
                // If no weekly data, fall through to try daily data
            }
            case 'weekly': {
                // For weekly or if monthly had no weekly data
                if (period === 'weekly') {
                    endDate.setDate(endDate.getDate() + 7);
                }
                const dailyStats = await prisma.dailyActivity.findMany({
                    where: {
                        userId,
                        guildId,
                        date: {
                            gte: startDate,
                            lt: endDate
                        }
                    }
                });

                if (dailyStats.length > 0) {
                    isPartialData = true;
                    stats = dailyStats.reduce((acc, curr) => ({
                        voiceTimeSeconds: (acc.voiceTimeSeconds || 0) + curr.voiceTimeSeconds,
                        afkTimeSeconds: (acc.afkTimeSeconds || 0) + curr.afkTimeSeconds,
                        mutedDeafenedTimeSeconds: (acc.mutedDeafenedTimeSeconds || 0) + curr.mutedDeafenedTimeSeconds,
                        messageCount: (acc.messageCount || 0) + curr.messageCount
                    }), {});
                }
                break;
            }
        }
    }

    return { data: stats, isPartialData };
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
