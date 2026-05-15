// Ficheiro: /home/engeradios/nfe-gestao/backend/src/modules/nfse/service/danfse-generator.js

const PDFDocument = require('pdfkit');
const xml2js = require('xml2js');
const { AppError } = require('../../../shared/errors/AppError');

class DanfseGenerator {
  /**
   * Lê o XML da NFS-e Nacional e desenha o DANFSe em formato PDF vetorial.
   */
  async gerarPdf(xmlString, outputStream) {
    const parser = new xml2js.Parser({ explicitArray: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
    let xmlObj;
    
    try {
      xmlObj = await parser.parseStringPromise(xmlString);
    } catch (err) {
      throw new AppError('Falha ao processar o ficheiro XML da Nota de Serviço.', 500);
    }

    // Função de extração profunda (Deep-Search) para lidar com a complexidade dos Namespaces da NFS-e
    const findNode = (obj, searchKeys) => {
        if (!obj || typeof obj !== 'object') return null;
        for (let key of searchKeys) {
            const match = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
            if (match && obj[match] !== undefined) {
                let val = obj[match];
                if (Array.isArray(val)) val = val[0];
                if (val && typeof val === 'object' && val._) return val._;
                if (typeof val !== 'object') return val;
            }
        }
        for (let k in obj) {
            if (typeof obj[k] === 'object') {
                const res = findNode(obj[k], searchKeys);
                if (res !== null) return res;
            }
        }
        return null;
    };

    // Extração de Dados Principais
    const numero = findNode(xmlObj, ['nNFSe', 'numero', 'nDFSe']) || '0';
    const codigoVerificacao = findNode(xmlObj, ['cVerif', 'CodigoVerificacao', 'chaveAcesso', 'Id']) || '';
    const dataEmissao = findNode(xmlObj, ['dhEmi', 'dataEmissao', 'dhProc']) || '';
    const municipio = findNode(xmlObj, ['xLocEmi', 'xMunEmi', 'MunicipioEmissor']) || 'Portal Nacional';
    
    // Prestador
    const prestCNPJ = findNode(xmlObj, ['CNPJ', 'Cnpj', 'cpfCnpj']) || '';
    const prestNome = findNode(xmlObj, ['xNome', 'RazaoSocial', 'Nome']) || 'NÃO INFORMADO';
    const prestIM = findNode(xmlObj, ['IM', 'InscricaoMunicipal']) || '';
    
    // Tomador
    const tomadorNode = findNode(xmlObj, ['toma', 'Tomador', 'tomaServico']) || {};
    const tomCNPJ = findNode(tomadorNode, ['CNPJ', 'CPF', 'CpfCnpj']) || '';
    const tomNome = findNode(tomadorNode, ['xNome', 'RazaoSocial', 'Nome']) || 'CONSUMIDOR NÃO IDENTIFICADO';
    
    // Serviço e Valores
    const descServico = findNode(xmlObj, ['xDesc', 'Discriminacao', 'DescricaoServico']) || 'Serviço prestado conforme legislação vigente.';
    const valorServicos = findNode(xmlObj, ['vServPrest', 'vServ', 'valorServicos']) || '0.00';
    const valorISS = findNode(xmlObj, ['vISS', 'valorISS']) || '0.00';

    // Formatadores
    const formatMoney = (val) => parseFloat(String(val).replace(',', '.')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '';

    // Iniciar PDF
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    doc.pipe(outputStream);

    const drawBox = (x, y, w, h, title, value, align = 'left') => {
      doc.rect(x, y, w, h).stroke('#333333');
      if (title) doc.fontSize(6).font('Helvetica-Bold').fillColor('#555555').text(title.toUpperCase(), x + 3, y + 3);
      if (value) doc.fontSize(9).font('Helvetica').fillColor('#000000').text(value, x + 3, y + 12, { width: w - 6, align: align });
    };

    // Cabeçalho
    doc.rect(30, 30, 535, 70).stroke();
    doc.fontSize(14).font('Helvetica-Bold').text('DANFSe - Documento Auxiliar da NFS-e', 30, 45, { align: 'center', width: 535 });
    doc.fontSize(10).font('Helvetica').text(`Município Emissor: ${municipio}`, 30, 65, { align: 'center', width: 535 });
    doc.fontSize(8).font('Helvetica-Bold').text('Padrão Sistema Nacional / Ambiente de Dados Nacional (ADN)', 30, 80, { align: 'center', width: 535 });

    // Informações da Nota
    drawBox(30, 110, 175, 35, 'Número da NFS-e', numero, 'center');
    drawBox(210, 110, 175, 35, 'Data e Hora de Emissão', formatDate(dataEmissao), 'center');
    drawBox(390, 110, 175, 35, 'Código de Verificação / Chave', codigoVerificacao.replace('NFS', '').substring(0, 15) + '...', 'center');

    // Prestador
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('PRESTADOR DE SERVIÇOS', 30, 160);
    drawBox(30, 175, 535, 45, 'Razão Social / Nome', prestNome);
    drawBox(30, 225, 265, 35, 'CNPJ / CPF', prestCNPJ);
    drawBox(300, 225, 265, 35, 'Inscrição Municipal', prestIM);

    // Tomador
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('TOMADOR DE SERVIÇOS', 30, 275);
    drawBox(30, 290, 535, 45, 'Razão Social / Nome', tomNome);
    drawBox(30, 340, 535, 35, 'CNPJ / CPF', tomCNPJ);

    // Serviço
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('DISCRIMINAÇÃO DOS SERVIÇOS', 30, 390);
    doc.rect(30, 405, 535, 150).stroke();
    doc.fontSize(9).font('Helvetica').text(descServico, 35, 415, { width: 525, align: 'justify' });

    // Valores
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('VALORES TOTAIS E IMPOSTOS', 30, 570);
    drawBox(30, 585, 265, 40, 'Valor Total dos Serviços', formatMoney(valorServicos), 'right');
    drawBox(300, 585, 265, 40, 'Valor do ISS', formatMoney(valorISS), 'right');

    // Rodapé Legal
    doc.fontSize(7).font('Helvetica-Oblique').fillColor('#777777').text(
      'Este documento é uma representação gráfica da Nota Fiscal de Serviço Eletrônica Nacional. O documento oficial em formato XML encontra-se armazenado no Ambiente de Dados Nacional (ADN) e na base de dados deste ERP.', 
      30, 750, { align: 'center', width: 535 }
    );

    doc.end();
  }
}

module.exports = new DanfseGenerator();