/**
 * Configuração do Pool de Conexões do PostgreSQL
 * Preparado para alta performance e reutilização de ligações.
 */
const { Pool } = require('pg');
const { logger } = require('../infra/logger');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  max: 20, // Máximo de conexões simultâneas
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('❌ Erro inesperado no pool do PostgreSQL', err);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};