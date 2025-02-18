const BaseCommand = require('./BaseCommand');
const prisma = require('../../config/prisma');
const { registerCommands } = require('../../commands/registerCommands');
const { fetchGuildStats, getMainRole } = require('../../utils/albionApi');
const ResponseFormatter = require('../../utils/ResponseFormatter');
const { ROLE_FIELD_MAP } = require('../../config/constants');

class AdminCommands extends BaseCommand {
    async handleSetGuildId(source, guildId) {
        const commandName = 'settings';
        const subcommand = 'setguildid';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ guildId }, {
                guildId: {
                    required: true,
                    message: 'Por favor, forneça o ID da guild do Albion.'
                }
            });

            if (errors.length) {
                await this.showUsage(source, commandName);
                await this.reply(source, ResponseFormatter.error(errors[0]), true);
                return;
            }

            await prisma.guildSettings.upsert({
                where: { guildId: source.guildId },
                update: { albionGuildId: guildId },
                create: {
                    guildId: source.guildId,
                    guildName: source.guild.name,
                    albionGuildId: guildId
                }
            });

            await this.reply(source, ResponseFormatter.success(`ID da guild do Albion definido como: ${guildId}`), true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao definir ID da guild.');
        }
    }

    async handleSetPrefix(source, newPrefix) {
        const commandName = 'settings';
        const subcommand = 'setprefix';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ newPrefix }, {
                newPrefix: {
                    required: true,
                    message: 'Por favor, forneça o novo prefixo.'
                }
            });

            if (errors.length) {
                await this.showUsage(source, commandName);
                await this.reply(source, ResponseFormatter.error(errors[0]), true);
                return;
            }

            await prisma.guildSettings.update({
                where: { guildId: source.guildId },
                data: { commandPrefix: newPrefix }
            });

            await this.reply(source, ResponseFormatter.success(`Prefixo atualizado para: ${newPrefix}`), true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao atualizar prefixo.');
        }
    }

    async handleSetGuildName(source, guildName) {
        const commandName = 'settings';
        const subcommand = 'setguildname';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ guildName }, {
                guildName: {
                    required: true,
                    message: 'Por favor, forneça o nome da guild.'
                }
            });

            if (errors.length) {
                await this.showUsage(source, commandName);
                await this.reply(source, ResponseFormatter.error(errors[0]), true);
                return;
            }

            await prisma.guildSettings.update({
                where: { guildId: source.guildId },
                data: { guildName }
            });

            await this.reply(source, ResponseFormatter.success(`Nome da guild atualizado para: ${guildName}`), true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao atualizar nome da guild.');
        }
    }

    async handleSetRole(source, type, role) {
        const commandName = 'settings';
        const subcommand = 'setrole';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ type, role }, {
                type: {
                    required: true,
                    message: 'Por favor, forneça o tipo de role.',
                    validate: (value) => ROLE_FIELD_MAP.hasOwnProperty(value),
                    error: 'Tipo de role inválido.'
                },
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

            const fieldName = ROLE_FIELD_MAP[type];
            await prisma.guildSettings.update({
                where: { guildId: source.guildId },
                data: { [fieldName]: role.id }
            });

            await this.reply(source, ResponseFormatter.success(`Cargo ${role.name} definido como ${type}.`), true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao definir cargo.');
        }
    }

    async handleSetVerifiedRole(source, role) {
        const commandName = 'settings';
        const subcommand = 'setverifiedrole';

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

            await prisma.guildSettings.update({
                where: { guildId: source.guildId },
                data: { nicknameVerifiedId: role.id }
            });

            await this.reply(source, ResponseFormatter.success(`Cargo ${role.name} definido como cargo de nickname verificado.`), true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao definir cargo de nickname verificado.');
        }
    }

    async handleRefreshCommands(source) {
        const commandName = 'refresh';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            await this.reply(source, ResponseFormatter.info('Recarregando comandos slash...'), true);
            await registerCommands(source.client);
            await this.reply(source, ResponseFormatter.success('Comandos slash recarregados com sucesso!'), true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao recarregar comandos slash.');
        }
    }

    async handleUpdateMembersRole(source, membersRole) {
        const commandName = 'updatemembersrole';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ membersRole }, {
                membersRole: {
                    required: true,
                    message: 'Por favor, mencione um cargo.'
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

            if (!settings?.albionGuildId) {
                await this.reply(source, ResponseFormatter.warning('ID da guild do Albion não configurado. Use /settings setguildid primeiro.'), true);
                return;
            }

            if (!settings?.nicknameVerifiedId) {
                await this.reply(source, ResponseFormatter.warning('Cargo verificado não configurado. Use /settings setverifiedrole primeiro.'), true);
                return;
            }

            const roleIds = {
                'Tank': settings.tankRoleId,
                'Support': settings.supportRoleId,
                'Healer': settings.healerRoleId,
                'DPS Melee': settings.dpsMeleeRoleId,
                'DPS Ranged': settings.dpsRangedRoleId,
                'Battlemount': settings.battlemountRoleId
            };

            const missingRoles = Object.entries(roleIds)
                .filter(([_, id]) => !id)
                .map(([role]) => role);

            if (missingRoles.length > 0) {
                await this.reply(source, ResponseFormatter.warning(
                    `As seguintes roles precisam ser configuradas primeiro usando /settings setrole:\n${missingRoles.join(', ')}`
                ), true);
                return;
            }

            await this.reply(source, ResponseFormatter.info('Atualizando roles dos membros verificados...'), true);

            const guildStats = await fetchGuildStats(settings.albionGuildId);
            if (!guildStats || !guildStats.length) {
                const response = 'Não foi possível obter dados da guild.';
                if (source.commandName) {
                    await source.editReply(response);
                } else {
                    await source.channel.send(response);
                }
                return;
            }

            const members = membersRole.members;
            let updated = 0;
            let notFound = 0;
            let notVerified = 0;
            const notFoundMembers = [];
            const notVerifiedMembers = [];

            for (const [memberId, member] of members) {
                if (!member.roles.cache.has(settings.nicknameVerifiedId)) {
                    notVerified++;
                    notVerifiedMembers.push(member.displayName);
                    continue;
                }

                const registration = await prisma.playerRegistration.findFirst({
                    where: {
                        userId: memberId
                    }
                });

                if (!registration) {
                    notVerified++;
                    notVerifiedMembers.push(member.displayName);
                    continue;
                }

                const player = guildStats.find(p =>
                    p.name.toLowerCase() === registration.playerName.toLowerCase()
                );

                if (player) {
                    const mainRole = getMainRole(player.roles);
                    const roleId = roleIds[mainRole.name];
                    const role = await source.guild.roles.fetch(roleId);

                    if (role && !member.roles.cache.has(roleId)) {
                        await member.roles.add(role);
                        updated++;
                    }
                } else {
                    notFound++;
                    notFoundMembers.push(registration.playerName);
                }
            }

            const stats = {
                updated,
                notVerified,
                notFound,
                notVerifiedMembers,
                notFoundMembers
            };

            const finalResponse = this.formatMemberRoleUpdateResults(stats);
            await this.reply(source, finalResponse);

        } catch (error) {
            await this.handleError(error, source, 'Erro ao atualizar roles dos membros.');
        }
    }

    // Helper method for formatting member role update results
    formatMemberRoleUpdateResults(stats) {
        return [
            ResponseFormatter.success('Atualização completa!'),
            '📊 Resultados:',
            `- ${stats.updated} membros atualizados`,
            `- ${stats.notVerified} membros não verificados`,
            `- ${stats.notFound} membros não encontrados na guild`,
            stats.notVerifiedMembers.length > 0 ? `\nMembros não verificados:\n${stats.notVerifiedMembers.join(', ')}` : '',
            stats.notFoundMembers.length > 0 ? `\nMembros não encontrados na guild:\n${stats.notFoundMembers.join(', ')}` : ''
        ].filter(Boolean).join('\n');
    }
}

module.exports = new AdminCommands(); 