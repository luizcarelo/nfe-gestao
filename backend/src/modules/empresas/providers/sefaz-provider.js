// Ficheiro: backend/src/modules/empresas/providers/sefaz-provider.js
/**
 * Adaptador para consulta no Cadastro Centralizado de Contribuintes (CCC)
 * Utiliza WebService SOAP nfeConsultaCadastro com mTLS (Certificado A1).
 */
const soapClient = require('../../../infra/soap/soap-client');
const { logger } = require('../../../infra/logger');

class SefazProvider {
  static ENDPOINTS = {
    // SVRS costuma atender a maioria das UFs sem WS próprio
    SVRS: 'https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro2.asmx?WSDL',
  };

  async lookup(cnpj, uf, certConfig) {
    try {
      if (!certConfig) {
        logger.info(`[SefazProvider] Consulta CCC ignorada para ${cnpj}: Certificado A1 não fornecido.`);
        return null;
      }

      logger.info(`[SefazProvider] A consultar SEFAZ (CCC) para o CNPJ: ${cnpj} | UF: ${uf}`);
      
      const message = {
        nfeDadosMsg: {
          consCad: {
            attributes: { xmlns: 'http://www.portalfiscal.inf.br/nfe', versao: '2.00' },
            infCons: {
              xServ: 'CONS-CAD',
              UF: uf,
              CNPJ: cnpj.replace(/\D/g, '')
            }
          }
        }
      };

      const result = await soapClient.call(SefazProvider.ENDPOINTS.SVRS, 'consultaCadastro', message, certConfig);
      
      return {
        raw: result,
        source: 'SEFAZ/CCC',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`[SefazProvider] Erro na consulta SEFAZ CCC para ${cnpj}: ${error.message}`);
      return null;
    }
  }
}

module.exports = new SefazProvider();