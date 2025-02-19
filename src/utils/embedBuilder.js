const { EmbedBuilder } = require('discord.js');

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
}

module.exports = EmbedBuilderUtil; 