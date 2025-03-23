const SelectMenu = require('../../structures/SelectMenu');
const { StringSelectMenuBuilder, ActionRowBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { NUMBER_EMOJIS } = require('../../config/constants');

module.exports = new SelectMenu({
    customId: 'select_party',
    async execute(interaction) {
        try {
            const compositionData = interaction.client.compositions.get(interaction.user.id);
            if (!compositionData) {
                return interaction.reply({
                    content: 'No active composition selection found. Please use the /x command again.',
                    ephemeral: true
                });
            }

            const partyIndex = parseInt(interaction.values[0].split('_')[1]);
            const party = compositionData.data.parties[partyIndex];
            
            // Create weapon options for selected party
            const weaponOptions = party.weapons
                .map((weapon, weaponIndex) => {
                    if (weapon.players_required > 0) {
                        const cleanWeaponName = weapon.type.replace("Elder's ", "");
                        const roleStatus = weapon.free_role ? '(Free)' : '';
                        
                        return new StringSelectMenuOptionBuilder()
                            .setLabel(`${cleanWeaponName} ${roleStatus}`)
                            .setDescription(`${weapon.players_required}x required`)
                            .setValue(`${partyIndex}-${weaponIndex}`)
                            .setEmoji(NUMBER_EMOJIS[partyIndex] || '⚔️');
                    }
                    return null;
                })
                .filter(option => option !== null);

            // Add Fill option for this party
            weaponOptions.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Fill')
                    .setDescription(`Fill any role in ${party.name}`)
                    .setValue(`${partyIndex}-fill`)
                    .setEmoji('⬜')
            );

            const weaponSelect = new StringSelectMenuBuilder()
                .setCustomId('select_weapon')
                .setPlaceholder('Select a weapon to ping')
                .addOptions(weaponOptions);

            const row = new ActionRowBuilder()
                .addComponents(weaponSelect);

            await interaction.update({ components: [row] });
        } catch (error) {
            console.error('Error in select_party handler:', error);
            await interaction.reply({
                content: 'An error occurred while processing your party selection.',
                ephemeral: true
            });
        }
    }
});
