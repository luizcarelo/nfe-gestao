// Ficheiro: backend/src/modules/nfe/service/danfe-generator.js

const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const xml2js = require('xml2js');
const { AppError } = require('../../../shared/errors/AppError');

class DanfeGenerator {
  /**
   * Renderiza o DANFE Oficial da SEFAZ com base no XML completo.
   */
  async gerarPdf(xmlString, outputStream) {
    const parser = new xml2js.Parser({ explicitArray: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
    let result;
    
    try {
      result = await parser.parseStringPromise(xmlString);
    } catch (err) {
      throw new AppError('Falha ao processar o ficheiro XML da Nota Fiscal.', 500);
    }

    const nfeProc = result.nfeProc || result;
    const nfe = nfeProc?.NFe?.infNFe;
    const prot = nfeProc?.protNFe?.infProt || {};

    if (!nfe) {
      throw new AppError('Este XML é um resumo ou está incompleto. Efetue a Ciência da Operação e aguarde o download da SEFAZ para obter o XML com os Itens.', 400);
    }

    const doc = new PDFDocument({ size: 'A4', margin: 20 });
    doc.pipe(outputStream);

    const drawBox = (x, y, w, h, title, value, align = 'left', valSize = 7) => {
      doc.rect(x, y, w, h).stroke();
      if (title) doc.fontSize(5).font('Helvetica').text(title.toUpperCase(), x + 2, y + 2);
      if (value) doc.fontSize(valSize).font('Helvetica-Bold').text(String(value), x + 2, y + 10, { width: w - 4, align: align, lineBreak: false });
    };

    const formatDoc = (docNum) => {
      if (!docNum) return '';
      const str = String(docNum).padStart(14, '0');
      return str.length === 14 
        ? str.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
        : str.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    };

    const formatMoney = (val) => val ? parseFloat(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00';
    const formatDate = (isoDate) => isoDate ? new Date(isoDate).toLocaleDateString('pt-BR') : '';

    // --- 1. RECIBO (CANHOTO) ---
    doc.dash(2, { space: 2 });
    doc.moveTo(20, 50).lineTo(575, 50).stroke(); 
    doc.undash();
    
    drawBox(20, 20, 440, 25, 'Recebemos de ' + (nfe.emit?.xNome || '') + ' os produtos/serviços constantes da NF-e indicada ao lado', '');
    drawBox(20, 45, 100, 20, 'Data de Recebimento', '');
    drawBox(120, 45, 340, 20, 'Identificação e Assinatura do Recebedor', '');
    doc.fontSize(10).font('Helvetica-Bold').text('NF-e', 470, 25, { width: 105, align: 'center' });
    doc.fontSize(10).font('Helvetica-Bold').text('Nº ' + (nfe.ide?.nNF || ''), 470, 38, { width: 105, align: 'center' });
    doc.fontSize(10).font('Helvetica-Bold').text('SÉRIE: ' + (nfe.ide?.serie || ''), 470, 51, { width: 105, align: 'center' });

    // --- 2. CABEÇALHO DO DANFE ---
    const startY = 85;
    
    drawBox(20, startY, 240, 85, '', '');
    doc.fontSize(9).font('Helvetica-Bold').text(nfe.emit?.xNome || '', 22, startY + 5, { width: 236, align: 'center' });
    const enderEmit = nfe.emit?.enderEmit || {};
    doc.fontSize(7).font('Helvetica').text(`${enderEmit.xLgr || ''}, ${enderEmit.nro || ''} - ${enderEmit.xBairro || ''}\n${enderEmit.xMun || ''} - ${enderEmit.UF || ''} - CEP: ${enderEmit.CEP || ''}\nTelefone: ${enderEmit.fone || ''}`, 22, startY + 35, { width: 236, align: 'center' });

    drawBox(260, startY, 80, 85, '', '');
    doc.fontSize(12).font('Helvetica-Bold').text('DANFE', 260, startY + 5, { width: 80, align: 'center' });
    doc.fontSize(6).font('Helvetica').text('Documento Auxiliar da\nNota Fiscal Eletrônica\n\n0 - Entrada\n1 - Saída\n\nNº ' + (nfe.ide?.nNF || '') + '\nSÉRIE: ' + (nfe.ide?.serie || '') + '\nPágina 1 de 1', 260, startY + 20, { width: 80, align: 'center' });
    doc.rect(320, startY + 35, 12, 12).stroke();
    doc.fontSize(10).font('Helvetica-Bold').text(nfe.ide?.tpNF || '', 320, startY + 37, { width: 12, align: 'center' });

    drawBox(340, startY, 235, 85, '', '');
    try {
      const barcodeChave = (nfe.ide?.Id || nfe.$?.Id).replace('NFe', '');
      const pngBuffer = await bwipjs.toBuffer({ bcid: 'code128', text: barcodeChave, scale: 3, height: 10, includetext: false });
      doc.image(pngBuffer, 350, startY + 10, { width: 215, height: 30 });
      drawBox(340, startY + 55, 235, 30, 'Chave de Acesso', barcodeChave.replace(/(\d{4})/g, '$1 '), 'center', 9);
    } catch (e) {
      drawBox(340, startY + 55, 235, 30, 'Chave de Acesso', (nfe.ide?.Id || nfe.$?.Id || '').replace('NFe', '').replace(/(\d{4})/g, '$1 '), 'center', 9);
    }

    drawBox(20, startY + 85, 320, 25, 'Natureza da Operação', nfe.ide?.natOp);
    drawBox(340, startY + 85, 235, 25, 'Protocolo de Autorização de Uso', `${prot.nProt || ''} - ${formatDate(prot.dhRecbto)}`, 'center');

    drawBox(20, startY + 110, 185, 20, 'Inscrição Estadual', nfe.emit?.IE);
    drawBox(205, startY + 110, 185, 20, 'Inscrição Estadual do Subst. Trib.', nfe.emit?.IEST || '');
    drawBox(390, startY + 110, 185, 20, 'CNPJ', formatDoc(nfe.emit?.CNPJ));

    // --- 3. DESTINATÁRIO ---
    doc.fontSize(8).font('Helvetica-Bold').text('DESTINATÁRIO / REMETENTE', 20, startY + 135);
    const enderDest = nfe.dest?.enderDest || {};
    drawBox(20, startY + 145, 330, 20, 'Nome / Razão Social', nfe.dest?.xNome);
    drawBox(350, startY + 145, 125, 20, 'CNPJ / CPF', formatDoc(nfe.dest?.CNPJ || nfe.dest?.CPF));
    drawBox(475, startY + 145, 100, 20, 'Data da Emissão', formatDate(nfe.ide?.dhEmi));
    
    drawBox(20, startY + 165, 260, 20, 'Endereço', `${enderDest.xLgr || ''}, ${enderDest.nro || ''}`);
    drawBox(280, startY + 165, 150, 20, 'Bairro / Distrito', enderDest.xBairro);
    drawBox(430, startY + 165, 65, 20, 'CEP', enderDest.CEP);
    drawBox(495, startY + 165, 80, 20, 'Data de Saída/Entrada', formatDate(nfe.ide?.dhSaiEnt));
    
    drawBox(20, startY + 185, 200, 20, 'Município', enderDest.xMun);
    drawBox(220, startY + 185, 60, 20, 'Fone / Fax', enderDest.fone);
    drawBox(280, startY + 185, 30, 20, 'UF', enderDest.UF, 'center');
    drawBox(310, startY + 185, 165, 20, 'Inscrição Estadual', nfe.dest?.IE);
    drawBox(475, startY + 185, 100, 20, 'Hora de Saída', nfe.ide?.dhSaiEnt ? new Date(nfe.ide?.dhSaiEnt).toLocaleTimeString('pt-BR') : '');

    // --- 4. TOTAIS ---
    const total = nfe.total?.ICMSTot || {};
    doc.fontSize(8).font('Helvetica-Bold').text('CÁLCULO DO IMPOSTO', 20, startY + 210);
    drawBox(20, startY + 220, 111, 20, 'Base de Cálculo do ICMS', formatMoney(total.vBC), 'right');
    drawBox(131, startY + 220, 111, 20, 'Valor do ICMS', formatMoney(total.vICMS), 'right');
    drawBox(242, startY + 220, 111, 20, 'Base de Cálculo do ICMS ST', formatMoney(total.vBCST), 'right');
    drawBox(353, startY + 220, 111, 20, 'Valor do ICMS Substituição', formatMoney(total.vST), 'right');
    drawBox(464, startY + 220, 111, 20, 'Valor Total dos Produtos', formatMoney(total.vProd), 'right');

    drawBox(20, startY + 240, 111, 20, 'Valor do Frete', formatMoney(total.vFrete), 'right');
    drawBox(131, startY + 240, 111, 20, 'Valor do Seguro', formatMoney(total.vSeg), 'right');
    drawBox(242, startY + 240, 111, 20, 'Desconto', formatMoney(total.vDesc), 'right');
    drawBox(353, startY + 240, 111, 20, 'Outras Despesas Acessórias', formatMoney(total.vOutro), 'right');
    drawBox(464, startY + 240, 111, 20, 'Valor Total da Nota', formatMoney(total.vNF), 'right');

    // --- 5. TRANSPORTADOR / VOLUMES ---
    const transp = nfe.transp || {};
    const transpor = transp.transporta || {};
    const vol = Array.isArray(transp.vol) ? transp.vol[0] : (transp.vol || {});
    doc.fontSize(8).font('Helvetica-Bold').text('TRANSPORTADOR / VOLUMES TRANSPORTADOS', 20, startY + 265);
    drawBox(20, startY + 275, 260, 20, 'Razão Social', transpor.xNome);
    drawBox(280, startY + 275, 70, 20, 'Frete por Conta', transp.modFrete === '0' ? '0 - Remetente' : '1 - Destinatário', 'center');
    drawBox(350, startY + 275, 125, 20, 'CNPJ / CPF', formatDoc(transpor.CNPJ || transpor.CPF));
    drawBox(475, startY + 275, 100, 20, 'Placa do Veículo', transp.veicTransp?.placa);

    drawBox(20, startY + 295, 260, 20, 'Endereço', transpor.xEnder);
    drawBox(280, startY + 295, 150, 20, 'Município', transpor.xMun);
    drawBox(430, startY + 295, 45, 20, 'UF', transpor.UF, 'center');
    drawBox(475, startY + 295, 100, 20, 'Inscrição Estadual', transpor.IE);

    drawBox(20, startY + 315, 60, 20, 'Quantidade', vol.qVol, 'center');
    drawBox(80, startY + 315, 100, 20, 'Espécie', vol.esp);
    drawBox(180, startY + 315, 100, 20, 'Marca', vol.marca);
    drawBox(280, startY + 315, 100, 20, 'Numeração', vol.nVol);
    drawBox(380, startY + 315, 97, 20, 'Peso Bruto', vol.pesoB, 'right');
    drawBox(477, startY + 315, 98, 20, 'Peso Líquido', vol.pesoL, 'right');

    // --- 6. ITENS DA NOTA FISCAL (Tabela) ---
    doc.fontSize(8).font('Helvetica-Bold').text('DADOS DOS PRODUTOS / SERVIÇOS', 20, startY + 345);
    let tableY = startY + 355;
    
    doc.rect(20, tableY, 555, 15).stroke();
    const headers = ['CÓDIGO', 'DESCRIÇÃO', 'NCM', 'CFOP', 'UN', 'QTD', 'VLR UN', 'VLR TOT', 'BC ICMS', 'V. ICMS', 'VLR IPI', '%ICMS', '%IPI'];
    const xPos = [22, 60, 220, 250, 275, 295, 335, 375, 415, 455, 490, 520, 550];
    
    doc.fontSize(5).font('Helvetica-Bold');
    headers.forEach((h, i) => doc.text(h, xPos[i], tableY + 5));
    tableY += 15;

    let itens = Array.isArray(nfe.det) ? nfe.det : [nfe.det];
    doc.fontSize(6).font('Helvetica');
    
    itens.forEach(item => {
      const prod = item?.prod || {};
      const imp = item?.imposto || {};
      
      const icmsTag = Object.keys(imp.ICMS || {}).find(k => k.startsWith('ICMS'));
      const icmsNode = icmsTag ? imp.ICMS[icmsTag] : {};
      
      const ipiTag = Object.keys(imp.IPI || {}).find(k => k.startsWith('IPI'));
      const ipiNode = ipiTag ? imp.IPI[ipiTag] : {};

      doc.text(prod.cProd || '', xPos[0], tableY + 3, { width: 35 });
      doc.text(prod.xProd || '', xPos[1], tableY + 3, { width: 155, height: 10, ellipsis: true });
      doc.text(prod.NCM || '', xPos[2], tableY + 3, { width: 30 });
      doc.text(prod.CFOP || '', xPos[3], tableY + 3, { width: 25 });
      doc.text(prod.uCom || '', xPos[4], tableY + 3, { width: 20 });
      doc.text(formatMoney(prod.qCom), xPos[5], tableY + 3, { width: 35, align: 'right' });
      doc.text(formatMoney(prod.vUnCom), xPos[6], tableY + 3, { width: 35, align: 'right' });
      doc.text(formatMoney(prod.vProd), xPos[7], tableY + 3, { width: 35, align: 'right' });
      
      doc.text(formatMoney(icmsNode.vBC), xPos[8], tableY + 3, { width: 35, align: 'right' });
      doc.text(formatMoney(icmsNode.vICMS), xPos[9], tableY + 3, { width: 30, align: 'right' });
      doc.text(formatMoney(ipiNode.vIPI), xPos[10], tableY + 3, { width: 25, align: 'right' });
      doc.text(formatMoney(icmsNode.pICMS), xPos[11], tableY + 3, { width: 20, align: 'right' });
      doc.text(formatMoney(ipiNode.pIPI), xPos[12], tableY + 3, { width: 20, align: 'right' });
      
      doc.rect(20, tableY, 555, 12).stroke('#E2E8F0');
      tableY += 12;
      
      if (tableY > 750) {
        doc.addPage();
        tableY = 20;
      }
    });

    doc.rect(20, startY + 355, 555, tableY - (startY + 355)).stroke('#000000');

    // --- 7. DADOS ADICIONAIS ---
    if (tableY > 700) { doc.addPage(); tableY = 20; }
    doc.fontSize(8).font('Helvetica-Bold').text('DADOS ADICIONAIS', 20, tableY + 10);
    drawBox(20, tableY + 20, 555, 60, 'Informações Complementares', nfe.infAdic?.infCpl || nfe.infAdic?.infAdFisco || 'Nenhuma informação adicional fornecida pela SEFAZ.', 'left', 6);

    doc.end();
  }
}

module.exports = new DanfeGenerator();