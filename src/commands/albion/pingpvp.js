const Command = require('../../structures/Command');
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const AlbionItems = require('../../services/AlbionItems');

module.exports = new Command({
    name: 'pingpvp',
    description: 'Pings a role with a PVP event message using a composition template',
    category: 'albion',
    usage: '<role> <template>',
    cooldown: 10,
    permissions: [PermissionFlagsBits.MentionEveryone],
    async execute(interaction, args, handler) {
        try {
            // Initialize items service if not already done
            if (!AlbionItems.isInitialized) {
                await interaction.deferReply({ ephemeral: true });
                await AlbionItems.init();
            }

            // Get the role from the interaction
            const role = interaction.options.getRole('role');
            const template = interaction.options.getAttachment('template');
            const jsonInput = interaction.options.getString('json');

            if (!role) {
                return interaction.reply({ 
                    content: 'Please provide a valid role to ping!', 
                    ephemeral: true 
                });
            }

            if (!template && !jsonInput) {
                return interaction.reply({
                    content: 'Please provide either a text file or JSON input!',
                    ephemeral: true
                });
            }

            // If not already deferred (from items init)
            if (!interaction.deferred) {
                await interaction.deferReply();
            }

            try {
                let textContent;
                
                if (template && template.url) {
                    // Fetch the text content from file
                    const fileResponse = await fetch(template.url);
                    textContent = await fileResponse.text();
                } else {
                    // Use the direct JSON input
                    textContent = jsonInput;
                }

                console.log('Received text content:', textContent); // Debug log

                // Clean up the text content
                textContent = textContent.trim();
                
                // Try to parse the text content as JSON
                let composition;
                try {
                    composition = JSON.parse(textContent);
                } catch (parseError) {
                    console.error('JSON Parse Error:', parseError.message);
                    console.error('Text content causing error:', textContent);
                    return interaction.editReply({
                        content: `Error parsing JSON: ${parseError.message}\nMake sure your JSON is properly formatted with double quotes around property names and no trailing commas.`,
                        ephemeral: true
                    });
                }

                // Validate the JSON structure
                if (!composition.title || !composition.parties || !Array.isArray(composition.parties)) {
                    return interaction.editReply({
                        content: 'Invalid template format! Make sure the text file contains valid JSON with title and parties.',
                        ephemeral: true
                    });
                }

                // Validate weapon names
                for (const party of composition.parties) {
                    if (!party.weapons || !Array.isArray(party.weapons)) {
                        return interaction.editReply({
                            content: `Invalid party format in "${party.name}": missing weapons array.`,
                            ephemeral: true
                        });
                    }

                    for (const weapon of party.weapons) {
                        if (!AlbionItems.validateWeaponName(weapon.type)) {
                            return interaction.editReply({
                                content: `Invalid weapon name in party "${party.name}": "${weapon.type}" is not a valid Albion Online weapon.`,
                                ephemeral: true
                            });
                        }
                    }
                }

                // Create an embed for the event
                const embed = new EmbedBuilder()
                    .setTitle(`🗡️ ${composition.title} 🗡️`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                if (composition.description) {
                    embed.setDescription(composition.description);
                }

                // Calculate total players needed
                let totalPlayersNeeded = 0;
                composition.parties.forEach(party => {
                    party.weapons.forEach(weapon => {
                        totalPlayersNeeded += weapon.players_required;
                    });
                });

                // Add party fields to the embed
                composition.parties.forEach((party, index) => {
                    let partyText = '';
                    let partyTotal = 0;

                    party.weapons.forEach(weapon => {
                        partyTotal += weapon.players_required;
                        const roleText = weapon.free_role ? '(Free Role)' : '';
                        partyText += `• ${weapon.type} x${weapon.players_required} ${roleText}\n`;
                    });

                    embed.addFields({
                        name: `${party.name} (${partyTotal} players)`,
                        value: partyText || 'No weapons specified',
                        inline: true
                    });
                });

                // Add total players field
                embed.addFields({
                    name: 'Total Players Needed',
                    value: `${totalPlayersNeeded} players`,
                    inline: false
                });

                // Send the message with role ping and embed
                await interaction.editReply({
                    content: `${role}`,
                    embeds: [embed]
                });

            } catch (error) {
                console.error('Error in template processing:', error);
                return interaction.editReply({
                    content: `Error processing template: ${error.message}`,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Error in pingpvp command:', error);
            const errorMessage = error.response?.data?.message || error.message || 'There was an error executing this command!';
            
            if (interaction.deferred) {
                await interaction.editReply({ 
                    content: `Error: ${errorMessage}`, 
                    ephemeral: true 
                });
            } else {
                await interaction.reply({ 
                    content: `Error: ${errorMessage}`, 
                    ephemeral: true 
                });
            }
        }
    }
}); 