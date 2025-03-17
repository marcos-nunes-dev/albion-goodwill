const Command = require('../../structures/Command');
const { EmbedBuilder } = require('discord.js');
const prisma = require('../../config/prisma');

module.exports = new Command({
    name: 'xremove',
    description: 'Remove a player from the composition',
    category: 'albion',
    options: [
        {
            name: 'user',
            description: 'The user to remove (Admin only)',
            type: 6, // USER type
            required: false
        }
    ],
    async execute(interaction) {
        try {
            await interaction.deferReply();

            // Check if command is used in a thread
            if (!interaction.channel.isThread()) {
                return interaction.editReply('This command can only be used in a composition thread.');
            }

            // Get the composition from database
            const activeComposition = await prisma.composition.findFirst({
                where: {
                    threadId: interaction.channel.id,
                    status: 'open'
                }
            });

            if (!activeComposition) {
                return interaction.editReply('No active composition found for this thread.');
            }

            // Get target user
            const targetUser = interaction.options.getUser('user');
            const userToRemove = targetUser || interaction.user;

            // If target user is specified, check if the executor has admin permissions
            if (targetUser) {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                if (!member.permissions.has('Administrator')) {
                    return interaction.editReply('Only administrators can remove other users.');
                }
            }

            try {
                // Get the channel and message
                const channel = await interaction.client.channels.fetch(activeComposition.channelId);
                const message = await channel.messages.fetch(activeComposition.messageId);
                
                // Get the original embed
                const originalEmbed = message.embeds[0];
                if (originalEmbed) {
                    const newEmbed = EmbedBuilder.from(originalEmbed);
                    let wasRemoved = false;
                    let removedFrom = '';

                    // Update the fields to remove the user mention
                    newEmbed.data.fields = originalEmbed.fields.map(field => {
                        if (field.name === '⏳ Fill Queue') {
                            // Remove from fill queue if present
                            const fillQueue = field.value.match(/<@(\d+)>/g)?.map(mention => mention.match(/<@(\d+)>/)[1]) || [];
                            const updatedQueue = fillQueue.filter(id => id !== userToRemove.id);
                            
                            if (fillQueue.length !== updatedQueue.length) {
                                wasRemoved = true;
                                removedFrom = 'fill queue';
                            }

                            return {
                                name: field.name,
                                value: updatedQueue.length > 0 ? updatedQueue.map(id => `<@${id}>`).join('\n') : 'No players in queue',
                                inline: field.inline
                            };
                        }

                        let value = field.value;
                        const lines = value.split('\n');
                        
                        // Remove the user's mention from any weapon
                        const cleanedLines = lines.map(line => {
                            const originalLine = line;
                            line = line.replace(`<@${userToRemove.id}> (fill)`, '').trim() // Remove with (fill)
                                   .replace(`<@${userToRemove.id}>`, '').trim(); // Remove without (fill)
                            
                            if (originalLine !== line) {
                                wasRemoved = true;
                                removedFrom = field.name;
                            }

                            return line;
                        }).filter(line => line); // Remove empty lines
                        
                        return {
                            name: field.name,
                            value: cleanedLines.join('\n') || 'No players assigned',
                            inline: field.inline
                        };
                    });

                    // Update the message
                    await message.edit({ embeds: [newEmbed] });

                    // Create response embed
                    const responseEmbed = new EmbedBuilder()
                        .setColor(0x808080)
                        .setTitle('Player Removed')
                        .setDescription(wasRemoved 
                            ? `✅ Removed ${userToRemove} from ${removedFrom}`
                            : `❌ ${userToRemove} was not found in any position`)
                        .setFooter({ 
                            text: targetUser 
                                ? `Removed by ${interaction.user.tag}`
                                : `Self-removed by ${interaction.user.tag}` 
                        });

                    // Send response
                    await interaction.editReply({
                        embeds: [responseEmbed]
                    });
                }
            } catch (error) {
                console.error('Error updating composition message:', error);
                await interaction.editReply('Error removing player from composition. Please try again.');
            }

        } catch (error) {
            console.error('Error in xremove command:', error);
            await interaction.editReply('An error occurred while processing the command.');
        }
    }
});
