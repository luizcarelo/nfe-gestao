/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/infra/providers/sefaz-provider.js
 * Provider de Comunicação com a SEFAZ (Ambiente Nacional de Distribuição DFe)
 */
const { logger } = require('../logger');
const AppError = require('../../shared/errors/AppError');

class SefazProvider {
  /**
   * Conecta ao WebService NfeDistDFeInteresse da SEFAZ utilizando o Certificado A1.
   * @param {string} cnpj - CNPJ da empresa
   * @param {Buffer} certificadoPfx - Buffer binário do ficheiro .pfx
   * @param {string} senha - Palavra-passe do certificado
   * @returns {Promise<Array>} - Retorna um array de strings XML das notas fiscais encontradas.
   */
  async consultarNotasDestinadas(cnpj, certificadoPfx, senha) {
    logger.info(`🌐 [SEFAZ Provider] A iniciar comunicação segura com a SEFAZ para o CNPJ ${cnpj}...`);

    try {
      // NOTA TÉCNICA: Num cenário real de produção, aqui utilizaríamos a biblioteca 'soap' 
      // ou um motor em C#/Java via fila, injetando o certificadoPfx no agente HTTPS.
      // const agent = new https.Agent({ pfx: certificadoPfx, passphrase: senha });
      
      // Simulação de latência de rede da SEFAZ
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulação de falha esporádica (típica dos servidores da SEFAZ aos finais de mês)
      if (Math.random() < 0.05) {
          throw new Error('SEFAZ: Ambiente Nacional Indisponível (HTTP 503)');
      }

      // Mock de XMLs retornados pela SEFAZ
      const notasBaixadas = [];
      const quantidadeNovasNotas = Math.floor(Math.random() * 3); // Retorna entre 0 a 2 notas novas
      
      for (let i = 0; i < quantidadeNovasNotas; i++) {
        const nNF = Math.floor(Math.random() * 9000) + 1000;
        const vNF = (Math.random() * 1000).toFixed(2);
        
        notasBaixadas.push(`<?xml version="1.0" encoding="UTF-8"?>
          <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
            <NFe>
              <infNFe Id="NFe3523101913124300019755001000000${nNF}1000001234" versao="4.00">
                <ide><nNF>${nNF}</nNF><serie>1</serie><dhEmi>${new Date().toISOString()}</dhEmi><tpNF>0</tpNF></ide>
                <emit><CNPJ>00000000000191</CNPJ><xNome>Fornecedor Distante Lda</xNome></emit>
                <dest><CNPJ>${cnpj}</CNPJ><xNome>Nossa Empresa Cliente</xNome></dest>
                <det nItem="1">
                  <prod><cProd>A1</cProd><xProd>Materia Prima Essencial</xProd><CFOP>1102</CFOP><vProd>${vNF}</vProd></prod>
                  <imposto><ICMS><ICMS00><vICMS>${(vNF * 0.18).toFixed(2)}</vICMS></ICMS00></ICMS></imposto>
                </det>
                <total><ICMSTot><vProd>${vNF}</vProd><vNF>${vNF}</vNF><vICMS>${(vNF * 0.18).toFixed(2)}</vICMS></ICMSTot></total>
              </infNFe>
            </NFe>
          </nfeProc>`);
      }

      logger.info(`✅ [SEFAZ Provider] Consulta concluída. ${notasBaixadas.length} novos XMLs encontrados para o CNPJ ${cnpj}.`);
      return notasBaixadas;

    } catch (error) {
      logger.error(`❌ [SEFAZ Provider] Erro de comunicação: ${error.message}`);
      throw new AppError(`Falha na comunicação com a SEFAZ: ${error.message}`, 502);
    }
  }
}

module.exports = new SefazProvider();