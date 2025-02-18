const BaseCommand = require('./BaseCommand');
const prisma = require('../../config/prisma');
const ResponseFormatter = require('../../utils/ResponseFormatter');
const { REGIONS } = require('../../config/constants');

class RegistrationCommands extends BaseCommand {
    async handleRegister(source, region, nickname) {
        const commandName = 'register';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ region, nickname }, {
                region: {
                    required: true,
                    message: 'Por favor, forneça a região.',
                    validate: (value) => REGIONS.includes(value.toLowerCase()),
                    error: `Região inválida. Use: ${REGIONS.join(', ')}`
                },
                nickname: {
                    required: true,
                    message: 'Por favor, forneça seu nickname do Albion.'
                }
            });

            if (errors.length) {
                await this.showUsage(source, commandName);
                await this.reply(source, ResponseFormatter.error(errors[0]), true);
                return;
            }

            const existingRegistration = await prisma.playerRegistration.findFirst({
                where: {
                    userId: source.member.id
                }
            });

            if (existingRegistration) {
                await this.reply(source, ResponseFormatter.warning(
                    `Você já está registrado como: ${existingRegistration.playerName}\n` +
                    'Use /unregister primeiro para registrar outro personagem.'
                ), true);
                return;
            }

            await prisma.playerRegistration.create({
                data: {
                    userId: source.member.id,
                    guildId: source.guildId,
                    playerName: nickname,
                    region: region.toLowerCase()
                }
            });

            await this.reply(source, ResponseFormatter.success(
                `Registro concluído!\n` +
                `Nickname: ${nickname}\n` +
                `Região: ${region}`
            ), true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao registrar jogador.');
        }
    }

    async handleUnregister(source, playerName) {
        const commandName = 'unregister';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ playerName }, {
                playerName: {
                    required: true,
                    message: 'Por favor, forneça o nome do jogador.'
                }
            });

            if (errors.length) {
                await this.showUsage(source, commandName);
                await this.reply(source, ResponseFormatter.error(errors[0]), true);
                return;
            }

            const registration = await prisma.playerRegistration.findFirst({
                where: {
                    guildId: source.guildId,
                    playerName: {
                        equals: playerName,
                        mode: 'insensitive'
                    }
                }
            });

            if (!registration) {
                await this.reply(source, ResponseFormatter.error(`Jogador "${playerName}" não encontrado.`), true);
                return;
            }

            await prisma.playerRegistration.delete({
                where: {
                    id: registration.id
                }
            });

            await this.reply(source, ResponseFormatter.success(`Registro de ${playerName} removido com sucesso.`), true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao remover registro.');
        }
    }

    async handleCheckRegistrations(source, role) {
        const commandName = 'checkregistrations';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ role }, {
                role: {
                    required: true,
                    message: 'Por favor, mencione um cargo.'
                }
            });

            if (errors.length) {
                await this.showUsage(source, commandName);
                await this.reply(source, ResponseFormatter.error(errors[0]), true);
                return;
            }

            const members = role.members;
            const registrations = await prisma.playerRegistration.findMany({
                where: {
                    userId: {
                        in: [...members.keys()]
                    },
                    guildId: source.guildId
                }
            });

            const registeredUsers = new Set(registrations.map(r => r.userId));
            const unregisteredMembers = [...members.values()]
                .filter(member => !registeredUsers.has(member.id))
                .map(member => member.displayName);

            if (unregisteredMembers.length === 0) {
                await this.reply(source, ResponseFormatter.success(`Todos os membros do cargo ${role.name} estão registrados!`), true);
                return;
            }

            const response = ResponseFormatter.formatList(
                `Membros não registrados do cargo ${role.name}`,
                unregisteredMembers,
                `\nTotal: ${unregisteredMembers.length}/${members.size} membros`
            );

            await this.reply(source, response, true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao verificar registros.');
        }
    }
}

module.exports = new RegistrationCommands(); 