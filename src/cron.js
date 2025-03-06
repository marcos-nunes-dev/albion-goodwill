const cron = require('node-cron');
const { updateBattles } = require('./scripts/updateBattles');
const { syncAlbionBattles } = require('./scripts/syncAlbionBattles');
const logger = require('./utils/logger');

// Function to validate cron schedule
function validateCronSchedule(schedule) {
    return cron.validate(schedule);
}

// Function to schedule a cron job with error handling
function scheduleCronJob(schedule, task, description) {
    if (!validateCronSchedule(schedule)) {
        logger.error(`Invalid cron schedule for ${description}: ${schedule}`);
        return;
    }

    const job = cron.schedule(schedule, async () => {
        logger.info(`Starting ${description}`);
        try {
            await task();
            logger.info(`Completed ${description} successfully`);
        } catch (error) {
            logger.error(`Error in ${description}:`, error);
        }
    });

    if (!job) {
        logger.error(`Failed to schedule ${description}`);
        return;
    }

    logger.info(`Scheduled ${description} with pattern: ${schedule}`);
    return job;
}

// Schedule updateBattles jobs
const updateBattlesJobs = [
    { schedule: '0 12 * * *', description: 'updateBattles at 12:00 UTC' },
    { schedule: '0 0 * * *', description: 'updateBattles at 00:00 UTC' }
];

// Schedule syncAlbionBattles jobs
const syncAlbionBattlesJobs = [
    { schedule: '30 12 * * *', description: 'syncAlbionBattles at 12:30 UTC' },
    { schedule: '30 0 * * *', description: 'syncAlbionBattles at 00:30 UTC' }
];

// Schedule all jobs
const jobs = [
    ...updateBattlesJobs.map(job => 
        scheduleCronJob(job.schedule, updateBattles, job.description)
    ),
    ...syncAlbionBattlesJobs.map(job => 
        scheduleCronJob(job.schedule, syncAlbionBattles, job.description)
    )
].filter(Boolean);

// Log the number of successfully scheduled jobs
logger.info(`Successfully scheduled ${jobs.length} cron jobs`);

// Export the jobs for potential manual control
module.exports = {
    jobs,
    scheduleCronJob
}; 