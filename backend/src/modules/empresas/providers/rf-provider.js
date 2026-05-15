// Ficheiro: backend/src/modules/empresas/providers/rf-provider.js
/**
 * Adaptador para consulta de dados cadastrais na Receita Federal
 * Utiliza o BrasilAPI (Open Data RFB) por ser performático e formatado.
 */
const axios = require('axios');
const { logger } = require('../../../infra/logger');

class RFProvider {
  /**
   * Consulta os dados do CNPJ na BrasilAPI
   * @param {string} cnpj - Apenas números
   */
  async lookup(cnpj) {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    
    try {
      logger.info(`[RFProvider] A iniciar consulta BrasilAPI para o CNPJ: ${cleanCnpj}`);
      
      const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
        timeout: 10000 // 10 segundos de timeout preventivo
      });
      
      return {
        raw: data,
        source: 'RFB/BrasilAPI',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (error.response) {
        logger.warn(`[RFProvider] A BrasilAPI retornou status ${error.response.status} para o CNPJ ${cleanCnpj}.`);
      } else {
        logger.error(`[RFProvider] Falha de rede na consulta à BrasilAPI: ${error.message}`);
      }
      return null;
    }
  }
}

module.exports = new RFProvider();