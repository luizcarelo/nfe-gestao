/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/infra/rest/brasil-api-client.js
 * Cliente para integração com a BrasilAPI (CNPJ v1)
 */
const axios = require('axios');
const { logger } = require('../logger');
const AppError = require('../../shared/errors/AppError');

class BrasilApiClient {
  constructor() {
    this.baseUrl = 'https://brasilapi.com.br/api';
  }

  /**
   * Consulta dados completos de um CNPJ
   * @param {string} cnpj - Apenas números
   */
  async consultarCnpj(cnpj) {
    try {
      const cleanCnpj = cnpj.replace(/\D/g, '');
      logger.info(`🔍 Consultando BrasilAPI para CNPJ: ${cleanCnpj}`);
      
      const response = await axios.get(`${this.baseUrl}/cnpj/v1/${cleanCnpj}`, {
        timeout: 10000 // 10 segundos de timeout
      });

      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new AppError('CNPJ não encontrado na base da Receita Federal.', 404);
      }
      logger.error(`❌ Erro BrasilAPI: ${error.message}`);
      throw new AppError('Falha ao comunicar com o serviço de consulta de CNPJ.', 502);
    }
  }
}

module.exports = new BrasilApiClient();