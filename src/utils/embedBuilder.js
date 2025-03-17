const { EmbedBuilder } = require('discord.js');
const { cleanWeaponName } = require('./weaponStats');

class EmbedBuilderUtil {
    static error(message) {
        return new EmbedBuilder()
            .setColor(0xFF0000)
            .setDescription(`❌ ${message}`);
    }

    static success(message) {
        return new EmbedBuilder()
            .setColor(0x00FF00)
            .setDescription(`✅ ${message}`);
    }

    static info(message) {
        return new EmbedBuilder()
            .setColor(0x0099FF)
            .setDescription(`ℹ️ ${message}`);
    }

    static warning(message) {
        return new EmbedBuilder()
            .setColor(0xFFFF00)
            .setDescription(`⚠️ ${message}`);
    }

    static custom({ title, description, fields, color, footer, thumbnail }) {
        const embed = new EmbedBuilder()
            .setColor(color || 0x0099FF);

        if (title) embed.setTitle(title);
        if (description) embed.setDescription(description);
        if (fields) embed.addFields(fields);
        if (footer) embed.setFooter(footer);
        if (thumbnail) embed.setThumbnail(thumbnail);

        return embed;
    }

    static createCompositionEmbed(composition, role) {
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(composition.title)
            .setDescription(composition.description);

        // Add fields for each party
        composition.parties.forEach(party => {
            let partyContent = '';
            
            // Group weapons by type and count required players
            const weaponGroups = new Map();
            party.weapons.forEach(weapon => {
                if (weapon.players_required > 0) {
                    const roleStatus = weapon.free_role ? '(Free)' : '';
                    const key = `${cleanWeaponName(weapon.type)} ${roleStatus}`;
                    weaponGroups.set(key, (weaponGroups.get(key) || 0) + weapon.players_required);
                }
            });

            // Format weapon groups
            weaponGroups.forEach((count, weaponType) => {
                partyContent += `\`${count}x\` ${weaponType}\n`;
            });

            if (partyContent) {
                embed.addFields({ 
                    name: `⚔️ ${party.name}`,
                    value: partyContent.trim(),
                    inline: true
                });
            }
        });

        // Add footer with role mention
        embed.setFooter({ 
            text: `Use /x to join /xremove to leave`
        });

        return embed;
    }
}

module.exports = EmbedBuilderUtil;