const Command = require('../../structures/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { validateComposition } = require('../../utils/compositionValidator');
const { createCompositionEmbed } = require('../../utils/embedBuilder');
const prisma = require('../../config/prisma');

// Thread auto-archive duration (3 days in minutes)
const THREAD_AUTO_ARCHIVE_DURATION = 4320;

module.exports = new Command({
    name: 'pingpvp',
    description: 'Creates a PVP event message with composition template (v2)',
    category: 'albion',
    permissions: [PermissionFlagsBits.MentionEveryone],
    options: [
        {
            name: 'role',
            description: 'Role to ping',
            type: 8, // ROLE type
            required: true
        },
        {
            name: 'composition',
            description: 'JSON file containing the composition template',
            type: 11, // ATTACHMENT type
            required: true
        }
    ],
    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            const role = interaction.options.getRole('role');
            const compositionFile = interaction.options.getAttachment('composition');

            // Validate file type
            if (!compositionFile.name.endsWith('.json')) {
                return interaction.editReply('Please provide a valid JSON file.');
            }

            // Fetch and parse JSON content
            try {
                const response = await fetch(compositionFile.url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch file: ${response.statusText}`);
                }
                const compositionJson = await response.text();
                const composition = JSON.parse(compositionJson);

                // Validate composition structure
                const validationResult = validateComposition(composition);
                if (!validationResult.isValid) {
                    return interaction.editReply(`Invalid composition structure: ${validationResult.error}`);
                }

                // Create embed
                const embed = createCompositionEmbed(composition, role);
                
                // Send the message and get the message reference
                const message = await interaction.editReply({ 
                    content: `${role}`,
                    embeds: [embed],
                    allowedMentions: { roles: [role.id] }
                });

                // Create a thread for the composition
                const threadName = composition.title.length > 50 
                    ? composition.title.substring(0, 47) + '...' 
                    : composition.title;

                const thread = await message.startThread({
                    name: threadName,
                    autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
                    reason: 'Composition discussion thread'
                });

                // Send initial message in thread
                await thread.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x0099FF)
                            .setDescription('Use `/x` command in this thread to ping for a specific weapon or `/xremove` to cancel your participation')
                    ]
                });

                // Save composition to database
                await prisma.composition.create({
                    data: {
                        guildId: interaction.guildId,
                        channelId: interaction.channelId,
                        messageId: message.id,
                        threadId: thread.id,
                        roleId: role.id,
                        title: composition.title,
                        description: composition.description,
                        data: composition,
                        createdBy: interaction.user.id,
                        status: 'open'
                    }
                });

            } catch (error) {
                console.error('Error processing composition file:', error);
                return interaction.editReply('Failed to process the composition file. Make sure it contains valid JSON.');
            }

        } catch (error) {
            console.error('Error in pingpvp command:', error);
            return interaction.editReply('An error occurred while processing the command.');
        }
    }
});
