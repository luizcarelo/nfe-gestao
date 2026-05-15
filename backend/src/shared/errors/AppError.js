// Ficheiro: /home/engeradios/nfe-gestao/backend/src/shared/errors/AppError.js

/**
 * Classe customizada para tratamento de erros operacionais.
 * Permite que o sistema diferencie erros de negócio de falhas inesperadas.
 */
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.message = message;
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { AppError };