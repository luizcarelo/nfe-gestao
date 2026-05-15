/**
 * Middleware de Tratamento de Erros Centralizado
 * Garante que erros técnicos não vazem para o cliente e que tudo seja auditado.
 */
const { logger } = require('../../infra/logger');

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';

  // Logar o erro com stack trace completo para auditoria
  logger.error(`[HTTP ERROR] ${req.method} ${req.url} - Status: ${statusCode} - Msg: ${message}`, {
    stack: err.stack,
    body: req.body,
    params: req.params
  });

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Ocorreu um erro inesperado no processamento fiscal.' : message,
    // Em desenvolvimento, enviamos o erro real, em produção algo genérico por segurança
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

module.exports = { errorHandler };