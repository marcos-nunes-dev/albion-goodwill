const BaseCommand = require('./BaseCommand');
const ResponseFormatter = require('../../utils/ResponseFormatter');
const { formatHelpText } = require('../../config/helpText');
const { CATEGORIES, commandMetadata } = require('../../config/commandMetadata');

class UtilityCommands extends BaseCommand {
    async handlePing(source) {
        const commandName = 'ping';
        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const sent = await source.reply('Pong!');
            const latency = sent.createdTimestamp - source.createdTimestamp;
            const apiLatency = Math.round(source.client.ws.ping);

            const response = [
                ResponseFormatter.info('🏓 Pong!'),
                `Latência: ${latency}ms`,
                `API Latência: ${apiLatency}ms`
            ].join('\n');

            if (source.commandName) {
                await source.editReply(response);
            } else {
                await sent.edit(response);
            }
        } catch (error) {
            await this.handleError(error, source, 'Erro ao verificar latência.');
        }
    }

    async showHelp(source, prefix) {
        const commandName = 'help';
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const categorizedCommands = Object.entries(commandMetadata)
                .reduce((acc, [name, meta]) => {
                    if (!acc[meta.category]) acc[meta.category] = [];
                    acc[meta.category].push({ name, ...meta });
                    return acc;
                }, {});

            const response = Object.entries(CATEGORIES).map(([categoryKey, category]) => {
                const commands = categorizedCommands[category];
                if (!commands?.length) return '';

                return [
                    `**${categoryKey}:**`,
                    ...commands.map(cmd => 
                        `\`${prefix} ${cmd.usage}\` - ${cmd.description}`
                    ),
                    ''
                ].join('\n');
            }).filter(Boolean).join('\n');

            await this.reply(source, response, true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao mostrar ajuda.');
        }
    }
}

module.exports = new UtilityCommands(); 