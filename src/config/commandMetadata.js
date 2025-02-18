const { ROLE_CHOICES, REGIONS } = require('./constants');

const CATEGORIES = {
    UTILITY: 'utility',
    ACTIVITY: 'activity',
    ADMIN: 'admin',
    COMPETITOR: 'competitor',
    MMR: 'mmr',
    REGISTRATION: 'registration'
};

const PERMISSIONS = {
    ADMIN: 'ADMINISTRATOR',
    NONE: null
};

const commandMetadata = {
    // Utility Commands
    ping: {
        category: CATEGORIES.UTILITY,
        description: 'Verificar latência do bot',
        usage: 'ping',
        permissions: PERMISSIONS.NONE,
        cooldown: 3000,
        examples: ['ping'],
        slashCommand: true
    },
    help: {
        category: CATEGORIES.UTILITY,
        description: 'Mostrar lista de comandos',
        usage: 'help',
        permissions: PERMISSIONS.NONE,
        cooldown: 5000,
        examples: ['help'],
        slashCommand: true
    },

    // Activity Commands
    daily: {
        category: CATEGORIES.ACTIVITY,
        description: 'Mostrar atividade diária',
        usage: 'daily [@user]',
        permissions: PERMISSIONS.NONE,
        cooldown: 3000,
        examples: ['daily', 'daily @usuario'],
        slashCommand: true,
        options: {
            user: {
                type: 'USER',
                description: 'Usuário para verificar atividade',
                required: false
            }
        }
    },
    weekly: {
        category: CATEGORIES.ACTIVITY,
        description: 'Mostrar atividade semanal',
        usage: 'weekly [@user]',
        permissions: PERMISSIONS.NONE,
        cooldown: 3000,
        examples: ['weekly', 'weekly @usuario'],
        slashCommand: true,
        options: {
            user: {
                type: 'USER',
                description: 'Usuário para verificar atividade',
                required: false
            }
        }
    },
    monthly: {
        category: CATEGORIES.ACTIVITY,
        description: 'Mostrar atividade mensal',
        usage: 'monthly [@user]',
        permissions: PERMISSIONS.NONE,
        cooldown: 3000,
        examples: ['monthly', 'monthly @usuario'],
        slashCommand: true,
        options: {
            user: {
                type: 'USER',
                description: 'Usuário para verificar atividade',
                required: false
            }
        }
    },
    leaderboard: {
        category: CATEGORIES.ACTIVITY,
        description: 'Mostrar ranking de atividade',
        usage: 'leaderboard',
        permissions: PERMISSIONS.NONE,
        cooldown: 5000,
        examples: ['leaderboard'],
        slashCommand: true
    },
    rolecheck: {
        category: CATEGORIES.ACTIVITY,
        description: 'Verificar atividade de um cargo',
        usage: 'rolecheck @role [daily|weekly]',
        permissions: PERMISSIONS.NONE,
        cooldown: 5000,
        examples: ['rolecheck @Tank', 'rolecheck @Healer daily'],
        slashCommand: true,
        options: {
            role: {
                type: 'ROLE',
                description: 'Cargo para verificar',
                required: true
            },
            period: {
                type: 'STRING',
                description: 'Período para verificar',
                required: false,
                choices: [
                    { name: 'Diário', value: 'daily' },
                    { name: 'Semanal', value: 'weekly' }
                ]
            }
        }
    },

    // Admin Commands
    settings: {
        category: CATEGORIES.ADMIN,
        description: 'Configurações do bot',
        permissions: PERMISSIONS.ADMIN,
        cooldown: 3000,
        slashCommand: true,
        subcommands: {
            setguildid: {
                description: 'Definir ID da guild do Albion',
                usage: 'settings setguildid <id>',
                examples: ['settings setguildid abc123'],
                options: {
                    id: {
                        type: 'STRING',
                        description: 'ID da guild do Albion',
                        required: true
                    }
                }
            },
            setprefix: {
                description: 'Definir prefixo dos comandos',
                usage: 'settings setprefix <prefix>',
                examples: ['settings setprefix !'],
                options: {
                    prefix: {
                        type: 'STRING',
                        description: 'Novo prefixo',
                        required: true
                    }
                }
            },
            setrole: {
                description: 'Definir cargo para uma role',
                usage: 'settings setrole <type> @role',
                examples: ['settings setrole tank @Tank'],
                options: {
                    type: {
                        type: 'STRING',
                        description: 'Tipo de role',
                        required: true,
                        choices: ROLE_CHOICES
                    },
                    role: {
                        type: 'ROLE',
                        description: 'Cargo do Discord',
                        required: true
                    }
                }
            },
            setverifiedrole: {
                description: 'Definir cargo para membros verificados',
                usage: 'settings setverifiedrole @role',
                examples: ['settings setverifiedrole @Verificado'],
                options: {
                    role: {
                        type: 'ROLE',
                        description: 'Cargo de verificado',
                        required: true
                    }
                }
            }
        }
    },

    // Competitor Commands
    competitors: {
        category: CATEGORIES.COMPETITOR,
        description: 'Gerenciar guilds competidoras',
        permissions: PERMISSIONS.ADMIN,
        cooldown: 3000,
        slashCommand: true,
        subcommands: {
            add: {
                description: 'Adicionar guild competidora',
                usage: 'competitors add <id>',
                examples: ['competitors add xyz789'],
                options: {
                    id: {
                        type: 'STRING',
                        description: 'ID da guild competidora',
                        required: true
                    }
                }
            },
            remove: {
                description: 'Remover guild competidora',
                usage: 'competitors remove <id>',
                examples: ['competitors remove xyz789'],
                options: {
                    id: {
                        type: 'STRING',
                        description: 'ID da guild competidora',
                        required: true
                    }
                }
            },
            list: {
                description: 'Listar guilds competidoras',
                usage: 'competitors list',
                examples: ['competitors list']
            }
        }
    },

    // MMR Commands
    playermmr: {
        category: CATEGORIES.MMR,
        description: 'Verificar MMR de um jogador',
        usage: 'playermmr <player>',
        permissions: PERMISSIONS.NONE,
        cooldown: 3000,
        examples: ['playermmr PlayerName'],
        slashCommand: true,
        options: {
            player: {
                type: 'STRING',
                description: 'Nome do jogador',
                required: true
            }
        }
    },
    mmrrank: {
        category: CATEGORIES.MMR,
        description: 'Mostrar ranking MMR por role',
        usage: 'mmrrank [role]',
        permissions: PERMISSIONS.NONE,
        cooldown: 5000,
        examples: ['mmrrank', 'mmrrank tank'],
        slashCommand: true,
        options: {
            role: {
                type: 'STRING',
                description: 'Tipo de role',
                required: false,
                choices: ROLE_CHOICES
            }
        }
    },

    // Registration Commands
    register: {
        category: CATEGORIES.REGISTRATION,
        description: 'Registrar personagem do Albion',
        usage: 'register <region> <nickname>',
        permissions: PERMISSIONS.NONE,
        cooldown: 5000,
        examples: ['register america PlayerName'],
        slashCommand: true,
        options: {
            region: {
                type: 'STRING',
                description: 'Região do servidor',
                required: true,
                choices: REGIONS.map(region => ({
                    name: region.charAt(0).toUpperCase() + region.slice(1),
                    value: region
                }))
            },
            nickname: {
                type: 'STRING',
                description: 'Nickname no Albion',
                required: true
            }
        }
    },
    unregister: {
        category: CATEGORIES.REGISTRATION,
        description: 'Remover registro de jogador',
        usage: 'unregister <playername>',
        permissions: PERMISSIONS.ADMIN,
        cooldown: 5000,
        examples: ['unregister PlayerName'],
        slashCommand: true,
        options: {
            playername: {
                type: 'STRING',
                description: 'Nome do jogador',
                required: true
            }
        }
    },
    checkregistrations: {
        category: CATEGORIES.REGISTRATION,
        description: 'Verificar registros de um cargo',
        usage: 'checkregistrations @role',
        permissions: PERMISSIONS.ADMIN,
        cooldown: 5000,
        examples: ['checkregistrations @Membro'],
        slashCommand: true,
        options: {
            role: {
                type: 'ROLE',
                description: 'Cargo para verificar',
                required: true
            }
        }
    }
};

module.exports = {
    CATEGORIES,
    PERMISSIONS,
    commandMetadata
}; 