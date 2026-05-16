/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/workers/index.js
 * Gestor de Agendamentos de Background (Cron Jobs)
 * Para instalar a dependência, execute: npm install node-cron
 */
const cron = require('node-cron');

// Caminho corrigido: sobe um nível (..) a partir da pasta 'workers' para a 'src' e entra no módulo de jobs
const sefazSyncWorker = require('../modules/jobs/workers/sefaz-sync');
const { logger } = require('../infra/logger');

class CronManager {
  iniciar() {
    logger.info('⏰ [CronManager] Inicializando agendador de tarefas em background...');

    // Agendamento: Executa a cada hora cheia (ex: 08:00, 09:00, 10:00)
    // Padrão Cron: '0 * * * *'
    // Para testes imediatos, mude para '*/1 * * * *' (a cada 1 minuto)
    cron.schedule('*/1 * * * *', async () => {
      logger.info('⏰ [CronManager] Disparando rotina de Sincronização SEFAZ...');
      await sefazSyncWorker.processarRotinaGlobal();
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
    });

    logger.info('⏰ [CronManager] Sincronização SEFAZ agendada para rodar a cada 1 minuto.');
  }
}

module.exports = new CronManager();