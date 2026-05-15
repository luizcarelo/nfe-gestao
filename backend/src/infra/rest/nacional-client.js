// Ficheiro: /home/engeradios/nfe-gestao/backend/src/infra/rest/nacional-client.js

const axios = require('axios');
const https = require('https');
const { logger } = require('../logger');

class NacionalClient {
  constructor(credentials) {
    this.api = axios.create({
      baseURL: 'https://adn.nfse.gov.br', 
      httpsAgent: new https.Agent({
        key: credentials.key,
        cert: credentials.cert,
        rejectUnauthorized: false 
      }),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 15000 
    });
  }

  async get(path) {
    try {
      const response = await this.api.get(path);
      return response.data;
    } catch (error) {
      // VACINA: Interceção silenciosa do 404 de "Fila Vazia" (E2220) para não poluir os logs
      if (error.response && error.response.status === 404) {
         const data = error.response.data;
         const strData = typeof data === 'object' ? JSON.stringify(data) : String(data);
         if (strData.includes('NENHUM_DOCUMENTO_LOCALIZADO') || strData.includes('E2220')) {
             const customError = new Error('NENHUM_DOCUMENTO_LOCALIZADO');
             customError.isE2220 = true;
             throw customError;
         }
      }
      
      logger.error(`❌ Erro API Nacional [GET ${path}]: ${error.message}`);
      if (error.response && error.response.data) {
         const serverError = error.response.data;
         const errorMsg = typeof serverError === 'object' ? JSON.stringify(serverError) : serverError;
         logger.error(`Detalhes ADN: ${errorMsg}`);
         throw new Error(`Rejeição do Portal Nacional: ${error.response.status} - ${errorMsg}`);
      }
      
      throw error;
    }
  }
}

module.exports = NacionalClient;