/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/shared/errors/AppError.js
 * Classe centralizada para tratamento de erros de negócio da aplicação.
 */
class AppError {
  constructor(message, statusCode = 400) {
    this.message = message;
    this.statusCode = statusCode;
  }
}

// IMPORTANTE: Exportação direta da classe. Não usar chaves { AppError }
module.exports = AppError;