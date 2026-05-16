/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/nfse/parser/index.js
 * Parser especializado no Padrão Nacional da NFS-e (Portal de Gestão NFS-e)
 * Responsável por extrair dados do XML unificado nacional.
 */
const { XMLParser } = require('fast-xml-parser');
const AppError = require('../../../shared/errors/AppError');

class NFSeParser {
  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "_",
      parseTagValue: true,
    });
  }

  /**
   * Converte o XML da NFS-e Nacional em um objeto padronizado.
   */
  parse(xmlString) {
    try {
      const jsonObj = this.parser.parse(xmlString);
      
      // No Padrão Nacional, os dados principais estão sob a tag 'NFSe' ou 'infNFSe'
      // A estrutura costuma ser: <NFSe><infNFSe>...
      const root = jsonObj.NFSe?.infNFSe || jsonObj.infNFSe || jsonObj.CompNfse?.Nfse?.InfNfse;

      if (!root) {
        throw new AppError('Estrutura de XML da NFS-e Nacional não reconhecida.', 400);
      }

      // Extração seguindo os campos do Modelo Nacional
      return {
        numero_nota: root.nNF?.toString() || root.Numero?.toString(),
        codigo_verificacao: root.cVerif || root.CodigoVerificacao,
        data_emissao: root.dhEmi || root.DataEmissao,
        
        // Identificação do Ambiente (1-Produção, 2-Homologação)
        ambiente: root.tpAmb,

        // Dados do Prestador (Emitente)
        prestador: {
          cnpj: root.emit?.CNPJ || root.PrestadorServico?.IdentificacaoPrestador?.Cnpj,
          razao_social: root.emit?.xNome || root.PrestadorServico?.RazaoSocial,
          inscricao_municipal: root.emit?.IM
        },

        // Dados do Tomador (Destinatário)
        tomador: {
          cnpj_cpf: root.dest?.CNPJ || root.dest?.CPF || root.TomadorServico?.IdentificacaoTomador?.CpfCnpj?.Cnpj,
          razao_social: root.dest?.xNome || root.TomadorServico?.RazaoSocial,
          email: root.dest?.email
        },

        // Valores e Impostos (Base para Auditoria e Dashboard)
        valores: {
          valor_servicos: parseFloat(root.serv?.vServ || root.Servico?.Valores?.ValorServicos || 0),
          valor_bc: parseFloat(root.serv?.vBC || 0),
          valor_iss: parseFloat(root.serv?.vISS || root.Servico?.Valores?.ValorIss || 0),
          valor_pis: parseFloat(root.serv?.vPIS || root.Servico?.Valores?.ValorPis || 0),
          valor_cofins: parseFloat(root.serv?.vCOFINS || root.Servico?.Valores?.ValorCofins || 0),
          valor_inss: parseFloat(root.serv?.vINSS || root.Servico?.Valores?.ValorInss || 0),
          valor_ir: parseFloat(root.serv?.vIR || root.Servico?.Valores?.ValorIr || 0),
          valor_csll: parseFloat(root.serv?.vCSLL || root.Servico?.Valores?.ValorCsll || 0),
          iss_retido: root.serv?.vISSRet > 0 || root.Servico?.Valores?.IssRetido === 1,
          aliquota: parseFloat(root.serv?.pAliq || root.Servico?.Valores?.Aliquota || 0)
        },

        servico: {
          cServ: root.serv?.cServ, // Código do Serviço Nacional
          xDescServ: root.serv?.xDescServ || root.Servico?.Discriminacao
        },
        
        xml_original: xmlString
      };
    } catch (error) {
      throw new AppError(`Erro ao processar XML da NFS-e Nacional: ${error.message}`, 400);
    }
  }
}

module.exports = new NFSeParser();