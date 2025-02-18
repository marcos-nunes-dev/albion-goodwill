async initializeGuildSettings(guild) {
    try {
        await prisma.guildSettings.upsert({
            where: {
                guildId: guild.id
            },
            create: {
                guildId: guild.id,
                guildName: guild.name,
                commandPrefix: "!albiongw",
                afkChannelId: guild.afkChannelId
            },
            update: {
                guildName: guild.name,
                afkChannelId: guild.afkChannelId
            }
        });
    } catch (error) {
        console.error(`Error initializing guild settings for ${guild.name}:`, error);
    }
} 