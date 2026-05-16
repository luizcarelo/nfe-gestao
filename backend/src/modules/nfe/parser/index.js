/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/nfe/parser/index.js
 * Parser de NFe para extração de dados do XML
 */
const { XMLParser } = require('fast-xml-parser');
const AppError = require('../../../shared/errors/AppError');

class NFeParser {
  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "_",
      parseTagValue: true,
    });
  }

  parse(xmlString) {
    try {
      const jsonObj = this.parser.parse(xmlString);
      const infNFe = jsonObj.nfeProc ? jsonObj.nfeProc.NFe?.infNFe : jsonObj.NFe?.infNFe;

      if (!infNFe) {
        throw new AppError('Estrutura de XML de NFe não reconhecida ou inválida.', 400);
      }

      return {
        chave_acesso: infNFe._Id ? infNFe._Id.replace('NFe', '') : '',
        numero_nota: infNFe.ide?.nNF?.toString(),
        serie: infNFe.ide?.serie?.toString(),
        data_emissao: infNFe.ide?.dhEmi,
        tipo_operacao: infNFe.ide?.tpNF,
        valor_total: parseFloat(infNFe.total?.ICMSTot?.vNF || 0),
        xml_original: xmlString
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Erro no processamento do XML de NFe: ${error.message}`, 400);
    }
  }
}

// IMPORTANTE: Exportar a instância!
module.exports = new NFeParser();