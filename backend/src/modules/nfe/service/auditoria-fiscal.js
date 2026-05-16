/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/nfe/service/auditoria-fiscal.js
 * Serviço de Auditoria Fiscal Inteligente (Oceano Azul)
 * Analisa profundamente o XML para encontrar divergências de impostos,
 * cruzamentos inválidos de CFOP/CST e anomalias matemáticas.
 */
const { XMLParser } = require('fast-xml-parser');
const { logger } = require('../../../infra/logger');
const AppError = require('../../../shared/errors/AppError');

class AuditoriaFiscalService {
  constructor() {
    // Configuração do Parser para manter toda a estrutura complexa do XML
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "_",
      parseTagValue: true,
    });
  }

  /**
   * Método principal que orquestra todas as regras de auditoria
   * @param {string} xmlString - O conteúdo original do XML da NFe
   * @returns {Object} Relatório detalhado com alertas
   */
  async analisar(xmlString) {
    try {
      const jsonObj = this.parser.parse(xmlString);
      const infNFe = jsonObj.nfeProc ? jsonObj.nfeProc.NFe?.infNFe : jsonObj.NFe?.infNFe;

      if (!infNFe) {
        throw new AppError('Estrutura de XML inválida para auditoria.', 400);
      }

      const alertas = [];
      
      // 1. Verificação Matemática de Totais (Soma dos Itens vs Total Declarado na Nota)
      this._auditarTotaisMatematicos(infNFe, alertas);

      // 2. Auditoria de Tributação (Cruzamento de CFOP vs CST/CSOSN nos Itens)
      this._auditarTributacaoItens(infNFe, alertas);

      // 3. (Futuro) Integração com BrasilAPI para validar se o CNPJ do Fornecedor está "Inapto" na Receita
      // this._auditarFornecedorReceitaFederal(infNFe.emit.CNPJ, alertas);

      logger.info(`Auditoria Fiscal concluída para a NFe ${infNFe.ide.nNF}. Alertas encontrados: ${alertas.length}`);

      return {
        numero_nota: infNFe.ide.nNF,
        chave_acesso: infNFe._Id ? infNFe._Id.replace('NFe', '') : 'N/A',
        data_auditoria: new Date(),
        total_alertas: alertas.length,
        alertas: alertas // Retorna a lista de divergências (CRITICO, AVISO, INFO)
      };

    } catch (error) {
        logger.error(`Erro na Auditoria Fiscal: ${error.message}`);
        throw new AppError('Falha interna ao processar a auditoria fiscal no XML.', 500);
    }
  }

  /**
   * REGRA 1: Validação Matemática Rigorosa
   * Verifica se a soma dos produtos e impostos individuais corresponde ao Bloco de Totais
   */
  _auditarTotaisMatematicos(infNFe, alertas) {
      const totalXml = infNFe.total?.ICMSTot;
      if (!totalXml) return;

      let somaProdutos = 0;
      let somaICMS = 0;

      // Os itens (det) podem ser um array (múltiplos produtos) ou um objeto (único produto)
      let itens = infNFe.det;
      if (!Array.isArray(itens)) {
          itens = [itens];
      }

      itens.forEach((item, index) => {
          // Soma de produtos
          const vProdItem = parseFloat(item.prod?.vProd || 0);
          somaProdutos += vProdItem;

          // Soma de ICMS: Localiza o valor do ICMS dentro das tags variáveis (ICMS00, ICMS10, SN101, etc.)
          const icmsNode = item.imposto?.ICMS;
          if (icmsNode) {
              const tipoIcms = Object.keys(icmsNode)[0]; // Extrai a chave exata, ex: 'ICMS00'
              const vIcmsItem = parseFloat(icmsNode[tipoIcms]?.vICMS || 0);
              somaICMS += vIcmsItem;
          }
      });

      const vProdTotalDeclarado = parseFloat(totalXml.vProd || 0);
      const vICMSTotalDeclarado = parseFloat(totalXml.vICMS || 0);

      // Aplica uma margem de tolerância de 0.05 cêntimos devido a arredondamentos legais
      if (Math.abs(somaProdutos - vProdTotalDeclarado) > 0.05) {
          alertas.push({
              tipo: 'CRITICO',
              categoria: 'MATEMATICA',
              mensagem: `A soma do valor dos itens (${somaProdutos.toFixed(2)}) diverge do Total de Produtos declarado na nota (${vProdTotalDeclarado.toFixed(2)}). Risco de autuação.`
          });
      }

      if (Math.abs(somaICMS - vICMSTotalDeclarado) > 0.05) {
           alertas.push({
              tipo: 'AVISO',
              categoria: 'TRIBUTARIA',
              mensagem: `A soma do ICMS dos itens (${somaICMS.toFixed(2)}) não bate exatamente com o Total de ICMS da nota (${vICMSTotalDeclarado.toFixed(2)}).`
          });
      }
  }

  /**
   * REGRA 2: Validação Semântica de CFOP e NCM
   * Verifica inconsistências no preenchimento de regras tributárias.
   */
  _auditarTributacaoItens(infNFe, alertas) {
      let itens = infNFe.det;
      if (!itens) return;
      if (!Array.isArray(itens)) {
          itens = [itens];
      }

      itens.forEach((item, index) => {
          const numItem = item._nItem || (index + 1);
          const cfop = item.prod?.CFOP?.toString();
          const ncm = item.prod?.NCM?.toString();
          
          if (!cfop) return;

          // Regra A: CFOP de Substituição Tributária (ex: 5405) não deve possuir destaque de ICMS Normal
          if (['5405', '5403', '6403', '6404'].includes(cfop)) {
               const icmsNode = item.imposto?.ICMS;
               if (icmsNode) {
                   const tipoIcms = Object.keys(icmsNode)[0];
                   const vIcms = parseFloat(icmsNode[tipoIcms]?.vICMS || 0);
                   
                   if (vIcms > 0 && !['ICMS10', 'ICMS30', 'ICMS70', 'ICMS90'].includes(tipoIcms)) {
                        alertas.push({
                            tipo: 'AVISO',
                            categoria: 'CFOP_CST',
                            mensagem: `Item ${numItem} com CFOP ${cfop} (Subst. Tributária) apresenta destaque de ICMS normal, o que é incompatível.`
                        });
                   }
               }
          }

          // Regra B: NCMs Genéricos (risco de retenção de mercadoria na alfândega/barreiras)
          if (ncm === '99999999' || ncm === '00000000') {
               alertas.push({
                    tipo: 'INFO',
                    categoria: 'CADASTRO_PRODUTO',
                    mensagem: `O Item ${numItem} ("${item.prod.xProd}") está a utilizar um código NCM genérico (${ncm}). Isto pode causar problemas de fiscalização.`
               });
          }
      });
  }
}

module.exports = new AuditoriaFiscalService();