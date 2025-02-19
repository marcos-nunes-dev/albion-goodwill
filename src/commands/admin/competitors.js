const Command = require('../../structures/Command');
const prisma = require('../../config/prisma');
const { EmbedBuilder, Colors } = require('discord.js');

const command = new Command({
    name: 'competitors',
    description: 'Manage competitor guilds',
    category: 'admin',
    usage: '<add|remove|list> [guild_id]',
    permissions: ['ADMINISTRATOR'],
    cooldown: 5,
    async execute(message, args) {
        if (!args[0]) {
            await listCompetitors(message);
            return;
        }

        switch (args[0].toLowerCase()) {
            case 'add':
                if (!args[1]) {
                    const embed = new EmbedBuilder()
                        .setTitle('Missing Information')
                        .setDescription('Please provide the competitor guild ID.')
                        .addFields(
                            { name: 'Usage', value: '```!albiongw competitors add <guild_id>```', inline: true },
                            { name: 'Example', value: '```!albiongw competitors add 1234567890```', inline: true }
                        )
                        .setColor(Colors.Yellow)
                        .setTimestamp();
                    await message.reply({ embeds: [embed] });
                    return;
                }
                await handleAddCompetitor(message, args[1]);
                break;

            case 'remove':
                if (!args[1]) {
                    const embed = new EmbedBuilder()
                        .setTitle('Missing Information')
                        .setDescription('Please provide the competitor guild ID to remove.')
                        .addFields(
                            { name: 'Usage', value: '```!albiongw competitors remove <guild_id>```', inline: true },
                            { name: 'Example', value: '```!albiongw competitors remove 1234567890```', inline: true }
                        )
                        .setColor(Colors.Yellow)
                        .setTimestamp();
                    await message.reply({ embeds: [embed] });
                    return;
                }
                await handleRemoveCompetitor(message, args[1]);
                break;

            case 'list':
                await listCompetitors(message);
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
                    .setFooter({ text: 'Use !albiongw help competitors for more information' });
                await message.reply({ embeds: [embed] });
        }
    }
});

async function handleAddCompetitor(message, competitorId) {
    try {
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId: message.guild.id }
        });

        if (settings.competitorIds.length >= 5) {
            const embed = new EmbedBuilder()
                .setTitle('Maximum Limit Reached')
                .setDescription('You cannot add more than 5 competitor guilds.')
                .addFields({
                    name: 'What to do?',
                    value: 'Remove an existing competitor guild before adding a new one.'
                })
                .setColor(Colors.Red)
                .setTimestamp();
            await message.reply({ embeds: [embed] });
            return;
        }

        if (settings.competitorIds.includes(competitorId)) {
            const embed = new EmbedBuilder()
                .setTitle('Duplicate Entry')
                .setDescription('This guild is already in your competitors list.')
                .addFields({
                    name: 'Guild ID',
                    value: `\`${competitorId}\``
                })
                .setColor(Colors.Yellow)
                .setTimestamp();
            await message.reply({ embeds: [embed] });
            return;
        }

        await prisma.guildSettings.update({
            where: { guildId: message.guild.id },
            data: {
                competitorIds: {
                    push: competitorId
                }
            }
        });

        const embed = new EmbedBuilder()
            .setTitle('Competitor Added')
            .setDescription('Successfully added the competitor guild to your tracking list.')
            .addFields(
                { name: 'Guild ID', value: `\`${competitorId}\``, inline: true },
                { name: 'Total Competitors', value: `${settings.competitorIds.length + 1}/5`, inline: true }
            )
            .setColor(Colors.Green)
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error adding competitor:', error);
        const embed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('An error occurred while adding the competitor guild.')
            .setColor(Colors.Red)
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    }
}

async function handleRemoveCompetitor(message, competitorId) {
    try {
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId: message.guild.id }
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
            await message.reply({ embeds: [embed] });
            return;
        }

        await prisma.guildSettings.update({
            where: { guildId: message.guild.id },
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
        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error removing competitor:', error);
        const embed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('An error occurred while removing the competitor guild.')
            .setColor(Colors.Red)
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    }
}

async function listCompetitors(message) {
    try {
        const settings = await prisma.guildSettings.findUnique({
            where: { guildId: message.guild.id }
        });

        if (!settings.competitorIds.length) {
            const embed = new EmbedBuilder()
                .setTitle('Competitor Guilds')
                .setDescription('No competitor guilds are currently configured.')
                .addFields({
                    name: 'How to Add',
                    value: 'Use `!albiongw competitors add <guild_id>` to start tracking competitor guilds.'
                })
                .setColor(Colors.Blue)
                .setTimestamp();
            await message.reply({ embeds: [embed] });
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

        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error listing competitors:', error);
        const embed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('An error occurred while fetching the competitor guilds list.')
            .setColor(Colors.Red)
            .setTimestamp();
        await message.reply({ embeds: [embed] });
    }
}

module.exports = command; 