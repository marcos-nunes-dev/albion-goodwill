const BaseCommand = require('./BaseCommand');
const prisma = require('../../config/prisma');
const { formatDuration, getWeekStart, getMonthStart } = require('../../utils/timeUtils');
const ResponseFormatter = require('../../utils/ResponseFormatter');

class ActivityCommands extends BaseCommand {
    async handleDailyStats(source, targetUser) {
        const commandName = 'daily';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const userId = targetUser ? targetUser.id : source.member.id;
            const displayName = targetUser ? targetUser.displayName : source.member.displayName;

            const stats = await prisma.dailyActivity.findUnique({
                where: {
                    userId_guildId_date: {
                        userId,
                        guildId: source.guildId,
                        date: today
                    }
                }
            });

            if (!stats) {
                await this.reply(source, ResponseFormatter.info(`Nenhuma atividade registrada para ${targetUser ? displayName : 'você'}.`), true);
                return;
            }

            const response = this.formatActivityStats(`${targetUser ? `${displayName}` : 'Sua'} Atividade Diária`, stats);
            await this.reply(source, response, true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao buscar estatísticas diárias.');
        }
    }

    async handleWeeklyStats(source, targetUser) {
        const commandName = 'weekly';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const weekStart = getWeekStart(new Date());

            const userId = targetUser ? targetUser.id : source.member.id;
            const displayName = targetUser ? targetUser.displayName : source.member.displayName;

            const stats = await prisma.weeklyActivity.findUnique({
                where: {
                    userId_guildId_weekStart: {
                        userId,
                        guildId: source.guildId,
                        weekStart
                    }
                }
            });

            if (!stats) {
                await this.reply(source, ResponseFormatter.info(`Nenhuma atividade registrada para ${targetUser ? displayName : 'você'} esta semana.`), true);
                return;
            }

            const response = this.formatActivityStats(`${targetUser ? `${displayName}` : 'Sua'} Atividade Semanal`, stats);
            await this.reply(source, response, true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao buscar estatísticas semanais.');
        }
    }

    async handleMonthlyStats(source, targetUser) {
        const commandName = 'monthly';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const monthStart = getMonthStart(new Date());

            const userId = targetUser ? targetUser.id : source.member.id;
            const displayName = targetUser ? targetUser.displayName : source.member.displayName;

            const stats = await prisma.monthlyActivity.findUnique({
                where: {
                    userId_guildId_monthStart: {
                        userId,
                        guildId: source.guildId,
                        monthStart
                    }
                }
            });

            if (!stats) {
                await this.reply(source, ResponseFormatter.info(`Nenhuma atividade registrada para ${targetUser ? displayName : 'você'} este mês.`), true);
                return;
            }

            const response = this.formatActivityStats(`${targetUser ? `${displayName}` : 'Sua'} Atividade Mensal`, stats);
            await this.reply(source, response, true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao buscar estatísticas mensais.');
        }
    }

    async handleLeaderboard(source) {
        const commandName = 'leaderboard';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const topUsers = await prisma.dailyActivity.findMany({
                where: {
                    date: today,
                    guildId: source.guildId
                },
                orderBy: [
                    { voiceTimeSeconds: 'desc' },
                    { messageCount: 'desc' }
                ],
                take: 10
            });

            if (!topUsers.length) {
                await this.reply(source, ResponseFormatter.info('Nenhuma atividade registrada hoje.'), true);
                return;
            }

            const members = await source.guild.members.fetch();
            const leaderboardItems = topUsers.map(user => {
                const member = members.get(user.userId);
                const displayName = member ? member.displayName : user.username;
                return this.formatUserActivity(displayName, user);
            });

            const response = ResponseFormatter.formatList(
                '🏆 Membros Mais Ativos Hoje',
                leaderboardItems
            );

            await this.reply(source, response, true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao buscar leaderboard.');
        }
    }

    async handleRoleActivityCheck(source, role, period = 'weekly') {
        const commandName = 'rolecheck';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const errors = this.validateArgs({ role, period }, {
                role: {
                    required: true,
                    message: 'Por favor, mencione um cargo.'
                },
                period: {
                    validate: (value) => ['daily', 'weekly'].includes(value),
                    error: 'Período inválido. Use: daily ou weekly'
                }
            });

            if (errors.length) {
                await this.showUsage(source, commandName);
                await this.reply(source, ResponseFormatter.error(errors[0]), true);
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const activityModel = period === 'daily' ? prisma.dailyActivity : prisma.weeklyActivity;
            const timeField = period === 'daily' ? 'date' : 'weekStart';
            const timeValue = period === 'daily' ? today : getWeekStart(today);

            const activities = await activityModel.findMany({
                where: {
                    userId: { in: [...role.members.keys()] },
                    guildId: source.guildId,
                    [timeField]: timeValue
                }
            });

            if (!activities.length) {
                await this.reply(source, ResponseFormatter.info(`Nenhuma atividade ${period === 'daily' ? 'diária' : 'semanal'} registrada para membros com o cargo ${role.name}.`), true);
                return;
            }

            activities.sort((a, b) => b.voiceTimeSeconds - a.voiceTimeSeconds);

            const activityItems = activities.map(activity => {
                const member = role.members.get(activity.userId);
                const displayName = member ? member.displayName : activity.username;
                return this.formatUserActivity(displayName, activity);
            });

            const response = ResponseFormatter.formatList(
                `${role.name} - Atividade ${period === 'daily' ? 'Diária' : 'Semanal'}`,
                activityItems,
                `\nTotal: ${activities.length}/${role.members.size} membros`
            );

            await this.reply(source, response, true);
        } catch (error) {
            await this.handleError(error, source, 'Erro ao verificar atividade do cargo.');
        }
    }

    formatActivityStats(title, stats) {
        return ResponseFormatter.formatStats({
            [title]: '',
            '🎤 Tempo em Call': formatDuration(stats.voiceTimeSeconds),
            '💬 Mensagens': stats.messageCount,
            ...(stats.afkTimeSeconds > 0 ? { '💤 Tempo AFK': formatDuration(stats.afkTimeSeconds) } : {}),
            ...(stats.mutedDeafenedTimeSeconds > 0 ? { '🔇 Tempo Mutado': formatDuration(stats.mutedDeafenedTimeSeconds) } : {})
        });
    }

    formatUserActivity(displayName, activity) {
        return [
            `**${displayName}**`,
            `🎤 ${formatDuration(activity.voiceTimeSeconds)}`,
            `💬 ${activity.messageCount} msgs`,
            activity.afkTimeSeconds > 0 ? `💤 AFK: ${formatDuration(activity.afkTimeSeconds)}` : ''
        ].filter(Boolean).join(' | ');
    }
}

module.exports = new ActivityCommands(); 