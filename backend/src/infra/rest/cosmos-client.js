/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/infra/rest/cosmos-client.js
 * Cliente para integração com a API Cosmos Bluesoft (GTIN/EAN/NCM)
 */
const axios = require('axios');
const { logger } = require('../logger');
const AppError = require('../../shared/errors/AppError');

class CosmosClient {
  constructor() {
    this.baseUrl = 'https://api.cosmos.bluesoft.com.br';
    // O token deve ser configurado no .env. Caso não exista, as consultas falharão em produção.
    this.token = process.env.COSMOS_TOKEN || ''; 
  }

  /**
   * Configura os headers padrão da Cosmos API
   */
  _getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Cosmos-Token': this.token,
      'User-Agent': 'Cosmos-API-NodeJS'
    };
  }

  /**
   * Consulta detalhes do produto por GTIN/EAN
   */
  async consultarGtin(gtin) {
    try {
      logger.info(`📦 Consultando Cosmos para GTIN: ${gtin}`);
      const response = await axios.get(`${this.baseUrl}/gtins/${gtin}`, {
        headers: this._getHeaders()
      });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) return null;
      logger.error(`❌ Erro Cosmos (GTIN): ${error.message}`);
      throw new AppError('Falha ao consultar catálogo de produtos.', 502);
    }
  }

  /**
   * Pesquisa lista de produtos por descrição ou GTIN
   */
  async pesquisarProdutos(query) {
    try {
      const response = await axios.get(`${this.baseUrl}/products?query=${encodeURIComponent(query)}`, {
        headers: this._getHeaders()
      });
      return response.data;
    } catch (error) {
      logger.error(`❌ Erro Cosmos (Pesquisa): ${error.message}`);
      return [];
    }
  }

  /**
   * Consulta produtos vinculados a um NCM
   */
  async consultarPorNcm(ncm) {
    try {
      const response = await axios.get(`${this.baseUrl}/ncms/${ncm}/products`, {
        headers: this._getHeaders()
      });
      return response.data;
    } catch (error) {
      return null;
    }
  }
}

module.exports = new CosmosClient();