/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/nfe/service/danfe-generator.js
 * Serviço de Geração de DANFE (PDF)
 * Utiliza a biblioteca especializada danfe-pdf para converter o XML da NFe
 * em um documento PDF fiel aos padrões da SEFAZ.
 */

const Danfe = require('danfe-pdf');
const { logger } = require('../../../infra/logger');
const AppError = require('../../../shared/errors/AppError');

class DanfeGeneratorService {
  /**
   * Converte uma string XML de NFe em um Buffer PDF.
   * @param {string} xmlString - Conteúdo bruto do XML da NFe.
   * @returns {Promise<Buffer>} - Buffer do PDF gerado para envio via HTTP.
   */
  async gerarPdf(xmlString) {
    return new Promise((resolve, reject) => {
      try {
        if (!xmlString || typeof xmlString !== 'string') {
          throw new AppError('Conteúdo XML inválido ou inexistente.', 400);
        }

        logger.info('Iniciando renderização de DANFE via motor especializado (danfe-pdf).');

        // Instancia o gerador com o XML
        const danfe = new Danfe(xmlString);

        // Opções de configuração (Podem ser expandidas para o Tenant futuramente)
        const opcoes = {
          font: 'Times-Roman', // Fonte padrão oficial
          format: 'a4',
          ajusteMargem: true,
          logo: null // Caminho para imagem se o Tenant tiver logo cadastrado
        };

        // Geração do PDF em stream para captura em Buffer
        danfe.gerarPDF(opcoes, (err, pdf) => {
          if (err) {
            logger.error(`Erro interno no motor danfe-pdf: ${err.message}`);
            return reject(new AppError('Falha ao processar a estrutura visual do DANFE.', 500));
          }

          logger.info('DANFE (PDF) gerado com sucesso em memória.');
          resolve(pdf);
        });

      } catch (error) {
        logger.error(`Erro crítico no serviço de DANFE: ${error.message}`);
        
        if (error instanceof AppError) {
          reject(error);
        } else {
          reject(new AppError('Erro inesperado no motor de PDF.', 500));
        }
      }
    });
  }
}

module.exports = new DanfeGeneratorService();