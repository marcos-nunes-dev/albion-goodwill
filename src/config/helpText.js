const commandGroups = {
    general: [
        ['ping', 'Verificar se o bot está funcionando'],
        ['daily [@user]', 'Mostrar atividade diária (sua ou do usuário mencionado)'],
        ['weekly [@user]', 'Mostrar atividade semanal'],
        ['monthly [@user]', 'Mostrar atividade mensal'],
        ['leaderboard', 'Mostrar top 10 usuários ativos hoje'],
        ['rolecheck @role [daily|weekly]', 'Verificar atividade dos membros de um cargo'],
        ['register <region> <nickname>', 'Registrar seu personagem do Albion']
    ],
    admin: [
        ['setguildid <id>', 'Definir ID da guild do Albion'],
        ['setprefix <prefix>', 'Definir novo prefixo para comandos'],
        ['setguildname <name>', 'Definir nome da guild'],
        ['setrole <type> @role', 'Definir cargo para uma role do Albion'],
        ['setverifiedrole @role', 'Definir cargo para membros verificados'],
        ['updatemembersrole @role', 'Atualizar roles dos membros baseado na main class'],
        ['unregister <playername>', 'Remover registro de um jogador'],
        ['checkregistrations @role', 'Verificar membros não registrados em um cargo']
    ],
    competitors: [
        ['competitors add <id>', 'Adicionar guild competidora'],
        ['competitors remove <id>', 'Remover guild competidora'],
        ['competitors list', 'Listar todas as guilds competidoras']
    ],
    mmr: [
        ['playermmr <player>', 'Verificar MMR do jogador'],
        ['mmrrank [role]', 'Mostrar ranking MMR por role da guild']
    ],
    other: [
        ['refresh', 'Recarregar comandos slash'],
        ['help', 'Mostrar esta mensagem de ajuda']
    ]
};

function formatHelpText(prefix) {
    const sections = [
        ['Albion Goodwill Bot Commands:', 'general'],
        ['Comandos de Administrador:', 'admin'],
        ['Comandos de Competidores:', 'competitors'],
        ['Comandos de MMR:', 'mmr'],
        ['Outros Comandos:', 'other']
    ];

    return sections.map(([title, group]) => [
        `**${title}**`,
        ...commandGroups[group].map(([cmd, desc]) => 
            `\`${prefix} ${cmd}\` - ${desc}`
        ),
        ''
    ].join('\n')).join('\n');
}

module.exports = { formatHelpText }; 