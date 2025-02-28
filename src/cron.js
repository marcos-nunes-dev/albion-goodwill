const cron = require('node-cron');
const { updateBattles } = require('./scripts/updateBattles');
const { syncAlbionBattles } = require('./scripts/syncAlbionBattles');

// Update battles at 12:00 UTC and 00:00 UTC
cron.schedule('0 12 * * *', async () => {
    console.log('Running updateBattles at 12:00 UTC');
    try {
        await updateBattles();
    } catch (error) {
        console.error('Error in updateBattles cron job:', error);
    }
});

cron.schedule('0 0 * * *', async () => {
    console.log('Running updateBattles at 00:00 UTC');
    try {
        await updateBattles();
    } catch (error) {
        console.error('Error in updateBattles cron job:', error);
    }
});

// Sync Albion battles at 12:30 UTC and 00:30 UTC
cron.schedule('30 12 * * *', async () => {
    console.log('Running syncAlbionBattles at 12:30 UTC');
    try {
        await syncAlbionBattles();
    } catch (error) {
        console.error('Error in syncAlbionBattles cron job:', error);
    }
});

cron.schedule('30 0 * * *', async () => {
    console.log('Running syncAlbionBattles at 00:30 UTC');
    try {
        await syncAlbionBattles();
    } catch (error) {
        console.error('Error in syncAlbionBattles cron job:', error);
    }
}); 