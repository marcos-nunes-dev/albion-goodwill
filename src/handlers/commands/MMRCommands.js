const BaseCommand = require('./BaseCommand');
const prisma = require('../../config/prisma');
const { fetchGuildStats, getMainRole } = require('../../utils/albionApi');
const ResponseFormatter = require('../../utils/ResponseFormatter');

class MMRCommands extends BaseCommand {
    async handlePlayerMMR(source, playerName) {
        const commandName = 'playermmr';

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

            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: source.guildId }
            });

            if (!settings?.albionGuildId) {
                await this.reply(source, ResponseFormatter.warning('ID da guild do Albion não configurado. Use /settings setguildid primeiro.'), true);
                return;
            }

            const guildStats = await fetchGuildStats(settings.albionGuildId);
            if (!guildStats || !guildStats.length) {
                await this.reply(source, ResponseFormatter.error('Não foi possível obter dados da guild.'), true);
                return;
            }

            const player = guildStats.find(p => 
                p.name.toLowerCase() === playerName.toLowerCase()
            );

            if (!player) {
                await this.reply(source, ResponseFormatter.error(`Jogador "${playerName}" não encontrado na guild.`), true);
                return;
            }

            const mainRole = getMainRole(player.roles);
            const stats = this.formatPlayerStats(player, mainRole);
            await this.reply(source, stats, true);

        } catch (error) {
            await this.handleError(error, source, 'Erro ao buscar MMR do jogador.');
        }
    }

    async handleMMRRank(source, roleFilter = null) {
        const commandName = 'mmrrank';

        if (!await this.checkPermissions(source, commandName)) return;
        if (!await this.checkCooldown(source, commandName)) return;

        try {
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId: source.guildId }
            });

            if (!settings?.albionGuildId) {
                await this.reply(source, ResponseFormatter.warning('ID da guild do Albion não configurado. Use /settings setguildid primeiro.'), true);
                return;
            }

            const guildStats = await fetchGuildStats(settings.albionGuildId);
            if (!guildStats || !guildStats.length) {
                await this.reply(source, ResponseFormatter.error('Não foi possível obter dados da guild.'), true);
                return;
            }

            const players = guildStats.map(player => ({
                ...player,
                mainRole: getMainRole(player.roles)
            }));

            if (roleFilter) {
                const response = this.formatRoleRanking(players, roleFilter);
                await this.reply(source, response, true);
            } else {
                const response = this.formatFullRanking(players);
                await this.reply(source, response, true);
            }
        } catch (error) {
            await this.handleError(error, source, 'Erro ao buscar ranking MMR.');
        }
    }

    formatPlayerStats(player, mainRole) {
        const kd = player.deaths > 0 ? 
            (player.kills / player.deaths).toFixed(2) : 
            player.kills.toFixed(2);

        let roleStats;
        switch (mainRole.index) {
            case 0: // Tank
                roleStats = `K/D: ${kd} | Fame/Batalha: ${Math.round(player.killFame / player.attendance).toLocaleString()}`;
                break;
            case 1: // Support
                roleStats = `K/D: ${kd} | Assistências/Batalha: ${(player.assists / player.attendance).toFixed(1)}`;
                break;
            case 2: // Healer
                roleStats = `K/D: ${kd} | Cura/Batalha: ${Math.round(player.healingDone / player.attendance).toLocaleString()}`;
                break;
            default: // DPS
                roleStats = `K/D: ${kd} | Dano/Batalha: ${Math.round(player.damageDealt / player.attendance).toLocaleString()}`;
        }

        return ResponseFormatter.formatStats({
            [`**${player.name}** (${mainRole.name})`]: '',
            'MMR': player.mmr,
            'Estatísticas': roleStats,
            'Participação': `${player.attendance} batalhas`
        });
    }

    formatRoleRanking(players, roleFilter) {
        const roleMapping = {
            'tank': 0,
            'support': 1,
            'healer': 2,
            'melee': 3,
            'ranged': 4,
            'mount': 5
        };

        const roleIndex = roleMapping[roleFilter];
        const rolePlayers = players
            .filter(p => p.mainRole.index === roleIndex)
            .sort((a, b) => b.mmr - a.mmr);

        if (rolePlayers.length === 0) {
            return ResponseFormatter.warning(`Nenhum jogador encontrado para a role ${roleFilter}.`);
        }

        return ResponseFormatter.formatList(
            `Top ${rolePlayers[0].mainRole.name} por MMR`,
            rolePlayers.map(p => `${p.name} (${p.mmr} MMR)`)
        );
    }

    formatFullRanking(players) {
        const roleGroups = players.reduce((acc, player) => {
            const role = player.mainRole.name;
            if (!acc[role]) acc[role] = [];
            acc[role].push(player);
            return acc;
        }, {});

        Object.keys(roleGroups).forEach(role => {
            roleGroups[role].sort((a, b) => b.mmr - a.mmr);
        });

        return [
            '**Top 3 MMR por Role:**',
            '',
            ...Object.entries(roleGroups).map(([role, players]) => 
                ResponseFormatter.formatList(
                    role,
                    players.slice(0, 3).map(p => `${p.name} (${p.mmr} MMR)`),
                    ''
                )
            )
        ].join('\n');
    }
}

module.exports = new MMRCommands(); 