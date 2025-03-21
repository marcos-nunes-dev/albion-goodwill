const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');
const axios = require('axios');

const command = new Command({
    name: 'competitors',
    description: 'Manage competitor guilds',
    category: 'admin',
    usage: 'list | add <guild_id> | remove <guild_id>',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(source, args) {
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
        
        if (!action) {
            const embed = new EmbedBuilder()
                .setTitle('Missing Action')
                .setDescription('Please specify an action to perform')
                .addFields(
                    { 
                        name: 'Available Commands', 
                        value: [
                            '```',
                            'list   - View all competitor guilds',
                            'add    - Add a new competitor guild',
                            'remove - Remove a competitor guild',
                            '```'
                        ].join('\n')
                    }
                )
                .setColor(Colors.Yellow)
                .setTimestamp()
                .setFooter({ text: 'Use /help competitors for more information' });
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        if (action === 'list') {
            await listCompetitors(source);
            return;
        }

        // Require guild_id for add and remove actions
        if (!guildId && (action === 'add' || action === 'remove')) {
            const embed = new EmbedBuilder()
                .setTitle('Missing Guild ID')
                .setDescription('You must provide a guild ID when using add or remove')
                .setColor(Colors.Red)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        switch (action.toLowerCase()) {
            case 'add':
                await handleAddCompetitor(source, guildId);
                break;

            case 'remove':
                await handleRemoveCompetitor(source, guildId);
                break;

            default:
                const embed = new EmbedBuilder()
                    .setTitle('Invalid Subcommand')
                    .setDescription('Please use one of the following subcommands:')
                    .addFields(
                        { 
                            name: 'Available Commands', 
                            value: [
                                '```',
                                'list   - View all competitor guilds',
                                'add    - Add a new competitor guild',
                                'remove - Remove a competitor guild',
                                '```'
                            ].join('\n')
                        }
                    )
                    .setColor(Colors.Yellow)
                    .setTimestamp()
                    .setFooter({ text: 'Use /help competitors for more information' });
                await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
        }
    }
});

async function handleAddCompetitor(source, competitorId) {
    const isInteraction = source.commandName !== undefined;
    try {
        // First, verify if the guild exists by fetching from the API
        let response;
        try {
            response = await axios.get(`https://api.albionbb.com/us/stats/guilds/${competitorId}?minPlayers=2`);
        } catch (apiError) {
            // Handle API errors specifically
            if (apiError.response?.status === 404) {
                const embed = new EmbedBuilder()
                    .setTitle('Guild Not Found')
                    .setDescription([
                        '❌ This guild ID does not exist.',
                        '',
                        '**How to get the correct Guild ID:**',
                        '1. Go to https://albionbb.com',
                        '2. Search for your guild',
                        '3. Copy the ID from the URL',
                        '',
                        '**Example:**',
                        'For URL: `https://albionbb.com/guild/hZNTkb_CTcexTNajA0TOsw`',
                        'The ID would be: `hZNTkb_CTcexTNajA0TOsw`'
                    ].join('\n'))
                    .setColor(Colors.Red)
                    .setTimestamp();
                await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
                return;
            }
            
            // Handle other API errors
            const embed = new EmbedBuilder()
                .setTitle('API Error')
                .setDescription('Failed to connect to Albion API. Please try again later.')
                .setColor(Colors.Red)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        const guildData = response.data;

        if (!Array.isArray(guildData) || guildData.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('Invalid Guild')
                .setDescription('This guild exists but has no recent battle data.')
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
                .setTitle('Already Tracking')
                .setDescription(`The guild "${guildName}" is already being tracked.`)
                .setColor(Colors.Yellow)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        if (settings.competitorIds.length >= 5) {
            const embed = new EmbedBuilder()
                .setTitle('Limit Reached')
                .setDescription('You can only track up to 5 competitor guilds.')
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
            .setTitle('Competitor Added')
            .setDescription(`Successfully added "${guildName}" ${allianceName ? `[${allianceName}]` : ''} to competitor tracking.`)
            .setColor(Colors.Green)
            .setTimestamp();
        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));

    } catch (error) {
        console.error('Error adding competitor:', error);
        const embed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('An error occurred while adding the competitor guild.')
            .setColor(Colors.Red)
            .setTimestamp();
        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
    }
}

async function handleRemoveCompetitor(source, competitorId) {
    const isInteraction = source.commandName !== undefined;
    try {
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId: isInteraction ? source.guildId : source.guild.id }
        });

        if (!settings.competitorIds.includes(competitorId)) {
            const embed = new EmbedBuilder()
                .setTitle('Not Found')
                .setDescription('This guild is not in your competitors list.')
                .addFields({
                    name: 'Guild ID',
                    value: `\`${competitorId}\``
                })
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
            .setTitle('Competitor Removed')
            .setDescription('Successfully removed the competitor guild from your tracking list.')
            .addFields(
                { name: 'Guild ID', value: `\`${competitorId}\``, inline: true },
                { name: 'Total Competitors', value: `${settings.competitorIds.length - 1}/5`, inline: true }
            )
            .setColor(Colors.Green)
            .setTimestamp();
        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
    } catch (error) {
        console.error('Error removing competitor:', error);
        const embed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('An error occurred while removing the competitor guild.')
            .setColor(Colors.Red)
            .setTimestamp();
        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
    }
}

async function listCompetitors(source) {
    const isInteraction = source.commandName !== undefined;
    try {
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId: isInteraction ? source.guildId : source.guild.id }
        });

        if (!settings.competitorIds.length) {
            const embed = new EmbedBuilder()
                .setTitle('Competitor Guilds')
                .setDescription('No competitor guilds are currently configured.')
                .addFields({
                    name: 'How to Add',
                    value: 'Use `/competitors add <guild_id>` to start tracking competitor guilds.'
                })
                .setColor(Colors.Blue)
                .setTimestamp();
            await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('Competitor Guilds')
            .setDescription('Here are all the competitor guilds you are currently tracking:')
            .addFields({
                name: 'Tracked Guilds',
                value: settings.competitorIds.map((id, index) => 
                    `\`${index + 1}.\` ${id}`
                ).join('\n')
            })
            .setColor(Colors.Blue)
            .setFooter({ text: `Total Competitors: ${settings.competitorIds.length}/5` })
            .setTimestamp();

        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
    } catch (error) {
        console.error('Error listing competitors:', error);
        const embed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('An error occurred while fetching the competitor guilds list.')
            .setColor(Colors.Red)
            .setTimestamp();
        await (isInteraction ? source.reply({ embeds: [embed] }) : source.reply({ embeds: [embed] }));
    }
}

module.exports = command; 