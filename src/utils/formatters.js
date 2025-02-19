function formatStats(period, stats) {
    const voiceTime = formatDuration(stats.voiceTimeSeconds);
    const afkTime = formatDuration(stats.afkTimeSeconds);
    const mutedTime = stats.mutedTimeSeconds ? formatDuration(stats.mutedTimeSeconds) : '0m';

    // Calculate total active time (excluding AFK time)
    const activeTimeSeconds = stats.voiceTimeSeconds - stats.afkTimeSeconds;
    const totalTimeSeconds = stats.voiceTimeSeconds;

    // Calculate percentages
    let activePercentage = 0;
    let afkPercentage = 0;

    if (totalTimeSeconds > 0) {
        activePercentage = Math.round((activeTimeSeconds / totalTimeSeconds) * 100);
        afkPercentage = Math.round((stats.afkTimeSeconds / totalTimeSeconds) * 100);
    }

    // Ensure percentages are valid numbers
    activePercentage = isNaN(activePercentage) ? 0 : activePercentage;
    afkPercentage = isNaN(afkPercentage) ? 0 : afkPercentage;

    return [
        `**${period} Activity Stats:**`,
        ' ',
        '**Voice Activity:**',
        `🎤 Active Voice: ${voiceTime}`,
        `💤 AFK: ${afkTime}`,
        `🔇 Muted: ${mutedTime}`,
        ' ',
        '**Chat Activity:**',
        `💬 Messages: ${stats.messageCount}`,
        ' ',
        '**Active Time Distribution:**',
        `🟩 Active: ${activePercentage}%`,
        `⬜ AFK: ${afkPercentage}%`
    ].filter(Boolean).join('\n');
}

module.exports = {
    formatStats
}; 