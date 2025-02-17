const { formatDuration } = require('./timeUtils');
const logger = require('./logger');

async function sendInactivityWarning(client, userId, stats, threshold) {
  try {
    const user = await client.users.fetch(userId);
    if (!user) return;

    const warningMessage = [
      `Olá ${user.username},`,
      '',
      'Notamos que sua participação na guild esta semana esteve abaixo do esperado.',
      `Você teve apenas ${formatDuration(stats.voiceTimeSeconds)} de participação em calls, o que representa menos de ${threshold}% da média dos membros mais ativos.`,
      '',
      'Sua presença é muito importante para a guild, e mantemos uma política de atividade mínima para garantir que todos os membros estejam contribuindo para nosso crescimento.',
      '',
      'Infelizmente, membros que mantêm baixa participação podem ser removidos por inatividade a qualquer momento.',
      '',
      'Esperamos ver você mais ativo na próxima semana! 💪',
      '',
      'Atenciosamente,',
      'Albion Goodwill Bot'
    ].join('\n');

    await user.send(warningMessage);
    logger.info(`Sent inactivity warning`, { username: user.username });
  } catch (error) {
    logger.error(`Failed to send inactivity warning`, { userId, error: error.message });
  }
}

module.exports = { sendInactivityWarning }; 