// Ficheiro: backend/src/infra/soap/soap-client.js
/**
 * Cliente SOAP Especializado para SEFAZ
 * Responsável por gerir a comunicação mTLS (Certificado A1) e chamadas aos WebServices.
 */
const soap = require('soap');
const { logger } = require('../logger');
const a1Manager = require('../crypto/a1-manager');
const https = require('https');

class SoapClient {
  /**
   * Executa uma chamada SOAP para a SEFAZ
   * @param {string} url - URL do WebService (WSDL)
   * @param {string} method - Método do serviço (ex: nfeDistDFeInteresse)
   * @param {Object} message - Dados do envelope XML
   * @param {Object} certConfig - { pfx: Buffer, senhaCriptografada: string }
   */
  async call(url, method, message, certConfig) {
    try {
      const senha = a1Manager.decryptPassword(certConfig.senhaCriptografada);
      
      // Configuração do Agente HTTPS com o Certificado A1 para mTLS
      const httpsAgent = new https.Agent({
        pfx: certConfig.pfx,
        passphrase: senha,
        rejectUnauthorized: false // Em ambientes de governo, por vezes é necessário ignorar erros de cadeia intermédia
      });

      // Criação do cliente SOAP
      const client = await soap.createClientAsync(url, { 
        httpsAgent,
        forceSoap12Headers: true // SEFAZ exige SOAP 1.2
      });

      // Execução da chamada
      const [result] = await client[method + 'Async'](message);
      
      return result;
    } catch (error) {
      logger.error(`❌ Falha na comunicação SOAP [${method}]:`, error);
      throw new Error(`Erro de comunicação com a SEFAZ: ${error.message}`);
    }
  }
}

module.exports = new SoapClient();