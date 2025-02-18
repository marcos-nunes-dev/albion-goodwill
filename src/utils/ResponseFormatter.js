class ResponseFormatter {
    static success(message) {
        return `✅ ${message}`;
    }

    static error(message) {
        return `❌ ${message}`;
    }

    static warning(message) {
        return `⚠️ ${message}`;
    }

    static info(message) {
        return `ℹ️ ${message}`;
    }

    static formatList(title, items, empty = 'Nenhum item encontrado.') {
        if (!items?.length) return empty;
        return [
            `**${title}**`,
            '',
            ...items.map((item, index) => `${index + 1}. ${item}`)
        ].join('\n');
    }

    static formatStats(stats) {
        return Object.entries(stats)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
    }

    static formatTable(headers, rows) {
        // Implementation for table-like responses
    }
}

module.exports = ResponseFormatter; 