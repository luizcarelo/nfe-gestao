/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/server.js
 * Ponto de entrada do Backend - Configuração de Alta Disponibilidade
 */
require('dotenv').config();
const app = require('./app');
const { logger } = require('./infra/logger');

// Importação segura do Gestor de Tarefas em Background (Cron Jobs)
let cronManager = null;
try {
    cronManager = require('./workers');
} catch (err) {
    // Se o ficheiro src/workers/index.js ainda não existir, o servidor não deve ir abaixo
    logger.warn('⚠️ [Aviso] Módulo de Workers não encontrado. O motor de captura SEFAZ não será iniciado.');
}

// Utilizamos a porta 3333, conforme os testes anteriores
const PORT = process.env.PORT || 3333;

const server = app.listen(PORT, () => {
    logger.info(`🚀 Servidor NFe SaaS rodando na porta ${PORT}`);
    logger.info(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    
    // Inicializa o motor de captura SEFAZ apenas se o módulo foi carregado com sucesso
    if (cronManager && typeof cronManager.iniciar === 'function') {
        cronManager.iniciar();
    }
});

// Captura falhas críticas do Node.js que derrubariam o servidor em silêncio
process.on('uncaughtException', (err) => {
    logger.error(`🔥 [Uncaught Exception] Erro Crítico no Node.js: ${err.message}`);
    logger.error(err.stack);
    // Em produção, o PM2/Docker reiniciará o processo automaticamente
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`🔥 [Unhandled Rejection] Promessa rejeitada não tratada: ${reason}`);
    if (reason && reason.stack) {
        logger.error(reason.stack);
    }
});

// Desligamento Seguro (Graceful Shutdown)
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

function shutDown() {
    logger.info('🛑 Sinal de encerramento recebido. A fechar conexões de rede...');
    server.close(() => {
        logger.info('✅ Servidor HTTP encerrado com segurança.');
        process.exit(0);
    });
}