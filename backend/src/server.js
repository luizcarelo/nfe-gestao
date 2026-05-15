// Ficheiro: /home/engeradios/nfe-gestao/backend/src/server.js

require('dotenv').config();
const app = require('./app');
const { logger } = require('./infra/logger');
const { pool } = require('./config/database');

const PORT = process.env.PORT || 3333;

/**
 * Função principal para inicializar o servidor.
 * Valida a infraestrutura antes de abrir o tráfego.
 */
async function startServer() {
  try {
    // 1. Validar ligação ao PostgreSQL
    const client = await pool.connect();
    logger.info('🐘 Ligação ao PostgreSQL estabelecida com sucesso.');
    client.release();

    // 2. Iniciar a escuta de pedidos HTTP
    const server = app.listen(PORT, () => {
      logger.info(`🚀 ERP Fiscal em execução na porta ${PORT} [Ambiente: ${process.env.NODE_ENV || 'development'}]`);
    });

    // 3. Gestão de Encerramento Gracioso (Graceful Shutdown)
    const gracefulShutdown = () => {
      logger.info('🛑 Sinal de encerramento recebido. Fechando servidor HTTP...');
      server.close(async () => {
        logger.info('HTTP server fechado.');
        try {
          await pool.end();
          logger.info('Pool de conexões do banco de dados encerrado.');
          process.exit(0);
        } catch (err) {
          logger.error('Erro ao fechar o pool do banco de dados:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error('❌ Erro fatal ao iniciar o servidor:', error);
    process.exit(1);
  }
}

// Capturar erros não tratados para evitar quedas silenciosas
process.on('uncaughtException', (err) => {
  logger.error('🔥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();