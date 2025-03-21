const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');
const axios = require('axios');
const languageManager = require('../../utils/languageUtils');

const command = new Command({
    name: 'competitors',
    description: 'Manage competitor guilds',
    category: 'admin',
    usage: 'list | add <guild_id> | remove <guild_id>',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(source, args, handler) {
        // Handle both message commands and slash commands
        const isInteraction = source.commandName !== undefined;

        // Get action and guildId based on command type
        let action, guildId;
        if (isInteraction) {
            action = source.options.getString('action');
            guildId = source.options.getString('guild_id');
        } else {
            action = args[0]?.toLowerCase();
            guildId = args[1];
        }

        const language = await handler.getGuildLanguage(source.guild.id);

        if (!action) {
            const embed = new EmbedBuilder()
                .setTitle(languageManager.translate('commands.competitors.missingAction.title', language))
                .setDescription(languageManager.translate('commands.competitors.missingAction.description', language))
                .addFields(
                    {
                        name: languageManager.translate('commands.competitors.missingAction.availableCommands', language),
                        value: [
                            '```',
                            ...languageManager.translate('commands.competitors.missingAction.commands', language),
                            '```'
                        ].join('\n')
                    }
                )
                .setColor(Colors.Yellow)
                .setTimestamp()
                .setFooter({ text: languageManager.translate('commands.competitors.missingAction.footer', language) });
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        if (action === 'list') {
            await listCompetitors(source, handler);
            return;
        }

        // Require guild_id for add and remove actions
        if (!guildId && (action === 'add' || action === 'remove')) {
            const embed = new EmbedBuilder()
                .setTitle(languageManager.translate(`commands.competitors.${action}.missingId.title`, language))
                .setDescription(languageManager.translate(`commands.competitors.${action}.missingId.description`, language))
                .setColor(Colors.Yellow)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        switch (action.toLowerCase()) {
            case 'add':
                await handleAddCompetitor(source, guildId, handler);
                break;

            case 'remove':
                await handleRemoveCompetitor(source, guildId, handler);
                break;

            default:
                const embed = new EmbedBuilder()
                    .setTitle(languageManager.translate('commands.competitors.missingAction.title', language))
                    .setDescription(languageManager.translate('commands.competitors.missingAction.description', language))
                    .addFields(
                        {
                            name: languageManager.translate('commands.competitors.missingAction.availableCommands', language),
                            value: [
                                '```',
                                ...languageManager.translate('commands.competitors.missingAction.commands', language),
                                '```'
                            ].join('\n')
                        }
                    )
                    .setColor(Colors.Yellow)
                    .setTimestamp()
                    .setFooter({ text: languageManager.translate('commands.competitors.missingAction.footer', language) });
                await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
        }
    }
});

async function handleAddCompetitor(source, competitorId, handler) {
    const isInteraction = source.commandName !== undefined;
    const language = await handler.getGuildLanguage(source.guild.id);
    try {
        // First, verify if the guild exists by fetching from the API
        let response;
        try {
            response = await axios.get(`https://api.albionbb.com/us/stats/guilds/${competitorId}?minPlayers=2`);
        } catch (apiError) {
            // Handle API errors specifically
            if (apiError.response?.status === 404) {
                const embed = new EmbedBuilder()
                    .setTitle(languageManager.translate('commands.competitors.add.invalidId.title', language))
                    .setDescription(languageManager.translate('commands.competitors.add.invalidId.description', language))
                    .setColor(Colors.Red)
                    .setTimestamp();
                await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
                return;
            }

            // Handle other API errors
            const embed = new EmbedBuilder()
                .setTitle(languageManager.translate('commands.competitors.add.error.title', language))
                .setDescription(languageManager.translate('commands.competitors.add.error.description', language))
                .setColor(Colors.Red)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        const guildData = response.data;

        if (!Array.isArray(guildData) || guildData.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle(languageManager.translate('commands.competitors.add.invalidGuild.title', language))
                .setDescription(languageManager.translate('commands.competitors.add.invalidGuild.description', language))
                .setColor(Colors.Yellow)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        const guildName = guildData[0].guildName;
        const allianceName = guildData[0].allianceName;

        // Get current settings
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId: isInteraction ? source.guildId : source.guild.id }
        });

        if (settings.competitorIds.includes(competitorId)) {
            const embed = new EmbedBuilder()
                .setTitle(languageManager.translate('commands.competitors.add.alreadyAdded.title', language))
                .setDescription(languageManager.translate('commands.competitors.add.alreadyAdded.description', language))
                .setColor(Colors.Yellow)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        if (settings.competitorIds.length >= 5) {
            const embed = new EmbedBuilder()
                .setTitle(languageManager.translate('commands.competitors.add.limitReached.title', language))
                .setDescription(languageManager.translate('commands.competitors.add.limitReached.description', language))
                .setColor(Colors.Red)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        // Add the competitor
        await prisma.guildSettings.update({
            where: { guildId: isInteraction ? source.guildId : source.guild.id },
            data: {
                competitorIds: {
                    push: competitorId
                }
            }
        });

        const embed = new EmbedBuilder()
            .setTitle(languageManager.translate('commands.competitors.add.success.title', language))
            .setDescription(languageManager.translate('commands.competitors.add.success.description', language, { guildName: `${guildName}${allianceName ? ` [${allianceName}]` : ''}` }))
            .setColor(Colors.Green)
            .setTimestamp();
        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));

    } catch (error) {
        console.error('Error adding competitor:', error);
        const embed = new EmbedBuilder()
            .setTitle(languageManager.translate('commands.competitors.add.error.title', language))
            .setDescription(languageManager.translate('commands.competitors.add.error.description', language))
            .setColor(Colors.Red)
            .setTimestamp();
        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
    }
}

async function handleRemoveCompetitor(source, competitorId, handler) {
    const isInteraction = source.commandName !== undefined;
    const language = await handler.getGuildLanguage(source.guild.id);
    try {
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId: isInteraction ? source.guildId : source.guild.id }
        });

        if (!settings.competitorIds.includes(competitorId)) {
            const embed = new EmbedBuilder()
                .setTitle(languageManager.translate('commands.competitors.remove.notFound.title', language))
                .setDescription(languageManager.translate('commands.competitors.remove.notFound.description', language))
                .setColor(Colors.Yellow)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        await prisma.guildSettings.update({
            where: { guildId: isInteraction ? source.guildId : source.guild.id },
            data: {
                competitorIds: {
                    set: settings.competitorIds.filter(id => id !== competitorId)
                }
            }
        });

        const embed = new EmbedBuilder()
            .setTitle(languageManager.translate('commands.competitors.remove.success.title', language))
            .setDescription(languageManager.translate('commands.competitors.remove.success.description', language))
            .setColor(Colors.Green)
            .setTimestamp();
        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
    } catch (error) {
        console.error('Error removing competitor:', error);
        const embed = new EmbedBuilder()
            .setTitle(languageManager.translate('commands.competitors.remove.error.title', language))
            .setDescription(languageManager.translate('commands.competitors.remove.error.description', language))
            .setColor(Colors.Red)
            .setTimestamp();
        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
    }
}

async function listCompetitors(source, handler) {
    const isInteraction = source.commandName !== undefined;
    const language = await handler.getGuildLanguage(source.guild.id);
    try {
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId: isInteraction ? source.guildId : source.guild.id }
        });

        if (!settings.competitorIds.length) {
            const embed = new EmbedBuilder()
                .setTitle(languageManager.translate('commands.competitors.list.title', language))
                .setDescription(languageManager.translate('commands.competitors.list.noCompetitors', language))
                .setColor(Colors.Blue)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(languageManager.translate('commands.competitors.list.title', language))
            .setDescription(languageManager.translate('commands.competitors.list.currentCompetitors', language))
            .addFields({
                name: languageManager.translate('commands.competitors.list.title', language),
                value: settings.competitorIds.map((id, index) =>
                    languageManager.translate('commands.competitors.list.guildEntry', language, { guildId: id, guildName: `Guild ${index + 1}` })
                ).join('\n')
            })
            .setColor(Colors.Blue)
            .setFooter({ text: `Total: ${settings.competitorIds.length}/5` })
            .setTimestamp();

        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
    } catch (error) {
        console.error('Error listing competitors:', error);
        const embed = new EmbedBuilder()
            .setTitle(languageManager.translate('commands.competitors.list.error.title', language))
            .setDescription(languageManager.translate('commands.competitors.list.error.description', language))
            .setColor(Colors.Red)
            .setTimestamp();
        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
    }
}

module.exports = command; 