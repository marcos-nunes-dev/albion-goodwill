const BaseCommand = require('./BaseCommand');
const prisma = require('../../config/prisma');
const ResponseFormatter = require('../../utils/ResponseFormatter');
const { MAX_COMPETITORS } = require('../../config/constants');

class CompetitorCommands extends BaseCommand {
    async handleAddCompetitor(source, competitorId) {
        const commandName = 'competitors';
        const subcommand = 'add';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ competitorId }, {
                competitorId: {
                    required: true,
                    message: 'Por favor, forneça o ID da guild competidora.'
                }
            });

            if (errors.length) {
                await this.showUsage(source, commandName);
                await this.reply(source, ResponseFormatter.error(errors[0]), true);
                return;
            }

            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: source.guildId }
            });

            if (settings.competitorIds.includes(competitorId)) {
                await this.reply(source, ResponseFormatter.warning('Esta guild já está na lista de competidores.'), true);
                return;
            }

            if (settings.competitorIds.length >= MAX_COMPETITORS) {
                await this.reply(source, ResponseFormatter.error(`Limite máximo de ${MAX_COMPETITORS} guilds competidoras atingido.`), true);
                return;
            }

            await prisma.guildSettings.update({
                where: { guildId: source.guildId },
                data: {
                    competitorIds: {
                        push: competitorId
                    }
                }
            });

            await this.reply(source, ResponseFormatter.success(`Guild competidora adicionada: ${competitorId}`), true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao adicionar guild competidora.');
        }
    }

    async handleRemoveCompetitor(source, competitorId) {
        const commandName = 'competitors';
        const subcommand = 'remove';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ competitorId }, {
                competitorId: {
                    required: true,
                    message: 'Por favor, forneça o ID da guild competidora.'
                }
            });

            if (errors.length) {
                await this.showUsage(source, commandName);
                await this.reply(source, ResponseFormatter.error(errors[0]), true);
                return;
            }

            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: source.guildId }
            });

            if (!settings.competitorIds.includes(competitorId)) {
                await this.reply(source, ResponseFormatter.warning('Esta guild não está na lista de competidores.'), true);
                return;
            }

            await prisma.guildSettings.update({
                where: { guildId: source.guildId },
                data: {
                    competitorIds: settings.competitorIds.filter(id => id !== competitorId)
                }
            });

            await this.reply(source, ResponseFormatter.success(`Guild competidora removida: ${competitorId}`), true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao remover guild competidora.');
        }
    }

    async listCompetitors(source) {
        const commandName = 'competitors';
        const subcommand = 'list';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: source.guildId }
            });

            if (!settings?.competitorIds?.length) {
                await this.reply(source, ResponseFormatter.info('Nenhuma guild competidora configurada.'), true);
                return;
            }

            const response = ResponseFormatter.formatList(
                'Guilds Competidoras',
                settings.competitorIds
            );

            await this.reply(source, response, true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao listar guilds competidoras.');
        }
    }
}

module.exports = new CompetitorCommands(); 