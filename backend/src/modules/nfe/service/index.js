// Ficheiro: /home/engeradios/nfe-gestao/backend/src/modules/nfe/service/index.js

const { pool } = require('../../../config/database');
const a1Manager = require('../../../infra/crypto/a1-manager');
const xmlSigner = require('../../../infra/crypto/xml-signer');
const { logger } = require('../../../infra/logger');
const https = require('https');
const { AppError } = require('../../../shared/errors/AppError');
const xml2js = require('xml2js');
const zlib = require('zlib');
const nfeParser = require('../parser');

class NFeService {
  async sincronizarComSefaz(empresaId) {
    try {
      logger.info(`[NFeService] Iniciando sincronização para a empresa ID: ${empresaId}`);
      
      // Auto-Cura: Reprocessa Notas antigas e injeta CST, Produtos, etc.
      await this._healNfeDatabase(empresaId);

      const { rows: certRows } = await pool.query(
        `SELECT c.pfx_binario, c.senha_criptografada, e.uf, e.cnpj, e.ultimo_nsu 
         FROM certificados c JOIN empresas e ON c.empresa_id = e.id WHERE c.empresa_id = $1`, [empresaId]
      );

      if (certRows.length === 0) throw new AppError('Certificado A1 não configurado.', 404);

      const { pfx_binario, senha_criptografada, uf, cnpj, ultimo_nsu } = certRows[0];
      const senhaLimpa = a1Manager.decryptPassword(senha_criptografada);
      const credentials = a1Manager.getCredentials(pfx_binario, senhaLimpa);

      let nsuFormatado = (ultimo_nsu || '0').toString().padStart(15, '0');
      let totalSalvas = 0;
      let maxAlcancado = false;

      // Loop acelerado de Lotes pendentes na SEFAZ
      for (let i = 0; i < 3; i++) {
        logger.info(`[NFeService] Consultando a partir do NSU: ${nsuFormatado}`);
        const soapBody = this._buildDistribuicaoEnvelope(cnpj, uf, nsuFormatado);
        const sefazResponse = await this._sendSoapRequest(credentials, soapBody, '/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx', 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse');

        const resultado = await this._parseDistribuicaoResponse(sefazResponse, empresaId);
        totalSalvas += resultado.notasSalvas;

        if (resultado.ultNSU) {
            nsuFormatado = resultado.ultNSU.toString().padStart(15, '0');
        }

        if (resultado.maxNsuAlcancado || resultado.notasSalvas === 0) {
            maxAlcancado = true;
            break;
        }
      }

      logger.info(`[NFeService] Sincronização concluída. Notas/Eventos salvos: ${totalSalvas}`);
      return { success: true, docs: totalSalvas, message: maxAlcancado ? 'Sincronização atualizada até o limite da SEFAZ.' : 'Ainda há notas para descarregar. Consulte novamente.' };
    } catch (error) {
      throw new AppError(`Falha ao sincronizar com a SEFAZ: ${error.message}`, error.statusCode || 500);
    }
  }

  async importarXmlManual(empresaId, xmlBuffer) {
    try {
      const xmlString = xmlBuffer.toString('utf-8');
      
      logger.info(`[NFeService] Importação manual de XML iniciada para empresa: ${empresaId}`);
      await this._saveNfeToDatabase(empresaId, 0, xmlString);
      
      return { success: true, message: 'Ficheiro XML importado e itens extraídos com sucesso.' };
    } catch (error) {
      logger.error(`[NFeService] Erro ao importar XML: ${error.message}`);
      throw new AppError(`Falha na importação do XML: ${error.message}`, error.statusCode || 500);
    }
  }

  async _healNfeDatabase(empresaId) {
    try {
        const checkQuery = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='documentos_fiscais' and column_name='emit_cnpj'`);
        if (checkQuery.rows.length === 0) {
            logger.warn(`[NFeService] AVISO: Colunas avançadas de NF-e não existem. A auto-cura foi ignorada. Execute a migração SQL no banco.`);
            return;
        }

        const { rows } = await pool.query(`SELECT id, chave_acesso, xml_bruto FROM documentos_fiscais WHERE empresa_id = $1 AND status_documento = 'AUTORIZADA' AND emit_cnpj IS NULL LIMIT 200`, [empresaId]);
        if (rows.length === 0) return;
        
        logger.info(`[NFeService] Auto-Cura Profunda NF-e: Extraindo Itens e Tributos de ${rows.length} notas antigas...`);
        
        for (const row of rows) {
            try {
                await this._saveNfeToDatabase(empresaId, 0, row.xml_bruto);
            } catch (e) {
                // Silencia falhas individuais de parse no loop
            }
        }
    } catch (error) {
        logger.error(`[NFeService] Erro na Auto-Cura NF-e: ${error.message}`);
    }
  }

  async manifestarCiencia(empresaId, chaveAcesso) {
    try {
      logger.info(`[NFeService] Iniciando Manifestação (Ciência) para NF-e: ${chaveAcesso}`);
      
      const { rows: certRows } = await pool.query(
        `SELECT c.pfx_binario, c.senha_criptografada, e.cnpj FROM certificados c JOIN empresas e ON c.empresa_id = e.id WHERE c.empresa_id = $1`, [empresaId]
      );
      if (certRows.length === 0) throw new AppError('Certificado não encontrado.', 404);

      const { pfx_binario, senha_criptografada, cnpj } = certRows[0];
      const senhaLimpa = a1Manager.decryptPassword(senha_criptografada);
      const credentials = a1Manager.getCredentials(pfx_binario, senhaLimpa);

      const now = new Date();
      const tzOffset = -now.getTimezoneOffset();
      const diff = tzOffset >= 0 ? '+' : '-';
      const pad = (num) => String(Math.floor(Math.abs(num))).padStart(2, '0');
      const tz = `${diff}${pad(tzOffset / 60)}:${pad(tzOffset % 60)}`;
      const dhEvento = now.toISOString().split('.')[0] + tz;

      const idEvento = `ID210210${chaveAcesso}01`;
      const xmlEvento = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><evento versao="1.00"><infEvento Id="${idEvento}"><cOrgao>91</cOrgao><tpAmb>1</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${chaveAcesso}</chNFe><dhEvento>${dhEvento}</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento></evento></envEvento>`;

      const signedXml = xmlSigner.sign(xmlEvento, 'infEvento', credentials.key, credentials.cert);
      const soapBody = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${signedXml}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;

      const sefazResponse = await this._sendSoapRequest(credentials, soapBody, '/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx', 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento');

      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttributes: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
      const result = await parser.parseStringPromise(sefazResponse);
      
      const envelope = result.Envelope;
      if (!envelope) throw new Error('Estrutura de resposta SOAP inválida.');
      
      const body = envelope.Body;
      if (!body) throw new Error('Nó Body não encontrado no envelope SOAP.');
      
      let retEnvEvento = body.retEnvEvento || 
                         (body.nfeResultMsg && body.nfeResultMsg.retEnvEvento) || 
                         (body.nfeRecepcaoEvento4Result && body.nfeRecepcaoEvento4Result.retEnvEvento);

      if (!retEnvEvento) {
          for (const key of Object.keys(body)) {
              if (body[key] && body[key].retEnvEvento) {
                  retEnvEvento = body[key].retEnvEvento;
                  break;
              }
          }
      }

      if (!retEnvEvento) {
          throw new Error('Nó retEnvEvento não encontrado na resposta da SEFAZ.');
      }

      const infEvento = retEnvEvento.retEvento?.infEvento;
      const extractText = (node) => (typeof node === 'object' && node !== null) ? node._ : node;

      if (!infEvento) {
          const motivo = extractText(retEnvEvento.xMotivo);
          throw new Error(`Rejeição do Lote: ${motivo || 'Motivo Desconhecido'}`);
      }

      const cStat = extractText(infEvento.cStat);
      const xMotivo = extractText(infEvento.xMotivo);

      if (['135', '136', '573'].includes(cStat)) {
        await pool.query(
          `UPDATE documentos_fiscais SET status_documento = 'CIENCIA', updated_at = CURRENT_TIMESTAMP WHERE chave_acesso = $1`,
          [chaveAcesso]
        );
        logger.info(`[NFeService] Manifestação concluída com sucesso: ${xMotivo}`);
        return { success: true, message: xMotivo };
      } else {
        throw new Error(`Rejeição SEFAZ [${cStat}]: ${xMotivo}`);
      }
    } catch (error) {
      logger.error(`[NFeService] Erro ao manifestar NF-e ${chaveAcesso}: ${error.message}`);
      throw new AppError(`Falha na manifestação: ${error.message}`, 500);
    }
  }

  _getIbgeCode(uf) {
    const ufs = { 'RO': '11', 'AC': '12', 'AM': '13', 'RR': '14', 'PA': '15', 'AP': '16', 'TO': '17', 'MA': '21', 'PI': '22', 'CE': '23', 'RN': '24', 'PB': '25', 'PE': '26', 'AL': '27', 'SE': '28', 'BA': '29', 'MG': '31', 'ES': '32', 'RJ': '33', 'SP': '35', 'PR': '41', 'SC': '42', 'RS': '43', 'MS': '50', 'MT': '51', 'GO': '52', 'DF': '53' };
    return ufs[uf?.toUpperCase()] || '35'; 
  }

  _buildDistribuicaoEnvelope(cnpj, uf, nsu) {
    const cUF = this._getIbgeCode(uf);
    return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg><distDFeInt versao="1.35" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>1</tpAmb><cUFAutor>${cUF}</cUFAutor><CNPJ>${cnpj}</CNPJ><distNSU><ultNSU>${nsu}</ultNSU></distNSU></distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
  }

  _sendSoapRequest(credentials, xmlBody, soapPath, soapAction) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'www1.nfe.fazenda.gov.br', port: 443, path: soapPath, method: 'POST',
        key: credentials.key, cert: credentials.cert,
        headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${soapAction}"`, 'Content-Length': Buffer.byteLength(xmlBody, 'utf8') },
        rejectUnauthorized: false 
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { res.statusCode === 200 ? resolve(data) : reject(new Error(`SEFAZ HTTP ${res.statusCode}`)); });
      });

      req.on('socket', (socket) => { socket.setTimeout(15000); socket.on('timeout', () => { req.destroy(); reject(new Error('Timeout SEFAZ')); }); });
      req.on('error', (err) => { reject(new Error(`Erro rede: ${err.message}`)); });
      req.write(xmlBody); req.end();
    });
  }

  async _parseDistribuicaoResponse(xmlResponse, empresaId) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttributes: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
    try {
      const result = await parser.parseStringPromise(xmlResponse);
      const envelope = result.Envelope;
      if (!envelope) throw new Error('Envelope SOAP não encontrado.');
      
      const body = envelope.Body;
      const fault = body?.Fault || body?.['soap12:Fault'];
      if (fault) {
          throw new Error(`Erro Interno SOAP SEFAZ: ${fault.Reason?.Text?._ || JSON.stringify(fault)}`);
      }

      let retDistDFeInt = null;
      for (const key of Object.keys(body || {})) {
          if (body[key]?.nfeDistDFeInteresseResult?.retDistDFeInt) {
              retDistDFeInt = body[key].nfeDistDFeInteresseResult.retDistDFeInt;
              break;
          } else if (body[key]?.retDistDFeInt) {
              retDistDFeInt = body[key].retDistDFeInt;
              break;
          }
      }

      if (!retDistDFeInt) retDistDFeInt = body?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult?.retDistDFeInt;
      if (!retDistDFeInt) throw new Error('Nó retDistDFeInt ausente na resposta da SEFAZ.');

      const cStat = typeof retDistDFeInt.cStat === 'object' ? retDistDFeInt.cStat._ : retDistDFeInt.cStat;
      const ultNSU = typeof retDistDFeInt.ultNSU === 'object' ? retDistDFeInt.ultNSU._ : retDistDFeInt.ultNSU;
      const maxNSU = typeof retDistDFeInt.maxNSU === 'object' ? retDistDFeInt.maxNSU._ : retDistDFeInt.maxNSU;

      if (ultNSU) await pool.query('UPDATE empresas SET ultimo_nsu = $1 WHERE id = $2', [ultNSU, empresaId]);
      
      if (cStat === '137') return { notasSalvas: 0, maxNsuAlcancado: true, ultNSU };

      if (cStat === '138') {
        let docs = [];
        const lote = retDistDFeInt.loteDistDFeInt;
        if (lote && lote.docZip) {
           docs = Array.isArray(lote.docZip) ? lote.docZip : [lote.docZip];
        }

        let gravados = 0;
        for (const doc of docs) {
          const nsu = typeof doc.$.NSU === 'object' ? doc.$.NSU._ : doc.$.NSU;
          const schema = typeof doc.$.schema === 'object' ? doc.$.schema._ : (doc.$.schema || '');
          const base64Content = doc._ || doc.valueOf();

          if (!base64Content) continue;

          try {
            const buffer = Buffer.from(base64Content, 'base64');
            let xmlDescompactado;
            try { xmlDescompactado = zlib.gunzipSync(buffer).toString('utf-8'); } catch(e) { xmlDescompactado = zlib.unzipSync(buffer).toString('utf-8'); }

            if (schema.includes('resNFe') || schema.includes('procNFe') || schema.includes('NFe')) {
              await this._saveNfeToDatabase(empresaId, nsu, xmlDescompactado);
              gravados++;
            } else if (schema.includes('resEvento') || schema.includes('procEventoNFe')) {
              await this._saveNfeEventToDatabase(empresaId, nsu, xmlDescompactado);
              gravados++; 
            }
          } catch (err) {
            logger.warn(`[NFeService] Falha ao extrair doc NSU ${nsu}: ${err.message}`);
          }
        }
        return { notasSalvas: gravados, maxNsuAlcancado: ultNSU === maxNSU, ultNSU };
      }
      
      const xMotivo = typeof retDistDFeInt.xMotivo === 'object' ? retDistDFeInt.xMotivo._ : retDistDFeInt.xMotivo;
      throw new Error(`Rejeição SEFAZ [${cStat}]: ${xMotivo}`);
    } catch (error) { throw new Error(`Parse XML: ${error.message}`); }
  }

  async _saveNfeToDatabase(empresaId, nsu, xmlString) {
    try {
      let isCompleto = xmlString.includes('<det') && xmlString.includes('</det>');
      let parsedData = null;
      let chave = '', emissao = null, valorTotal = 0, numero = '', serie = '';
      let emitCnpj = null, emitNome = null, destCnpj = null, destNome = null;

      // ATUALIZAÇÃO: Extração correta do Emitente mesmo quando é "Resumo" da SEFAZ
      if (isCompleto) {
        parsedData = nfeParser.parseNFe(xmlString);
        chave = parsedData.header.chave;
        numero = parsedData.header.numero;
        serie = parsedData.header.serie;
        emissao = parsedData.header.data_emissao;
        valorTotal = parsedData.totais?.vNF || 0;
        emitCnpj = parsedData.emitente?.cnpj || null;
        emitNome = parsedData.emitente?.nome || null;
        destCnpj = parsedData.destinatario?.cnpj || null;
        destNome = parsedData.destinatario?.nome || null;
      } else {
        const xml2jsParser = new xml2js.Parser({ explicitArray: false, ignoreAttributes: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
        const res = await xml2jsParser.parseStringPromise(xmlString);
        if (!res.resNFe) return;
        chave = res.resNFe.chNFe; 
        emissao = res.resNFe.dhEmi; 
        valorTotal = parseFloat(res.resNFe.vNF || 0);
        numero = chave.substring(25, 34); 
        serie = chave.substring(22, 25);
        emitCnpj = res.resNFe.CNPJ || res.resNFe.CPF || null;
        emitNome = res.resNFe.xNome || null;
      }

      if (!chave) return;

      const statusDoc = isCompleto ? 'AUTORIZADA' : 'AGUARDANDO_MANIFESTACAO';

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // ATUALIZAÇÃO: A instrução DO UPDATE SET agora também forçará a atualização do status_documento
        const { rows: docRows } = await client.query(
          `INSERT INTO documentos_fiscais (
              empresa_id, chave_acesso, numero, serie, data_emissao, valor_total_nota, xml_bruto, nsu_sefaz, status_documento,
              emit_cnpj, emit_nome, dest_cnpj, dest_nome, json_dados
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (chave_acesso) DO UPDATE SET 
              numero = EXCLUDED.numero, serie = EXCLUDED.serie, data_emissao = EXCLUDED.data_emissao, 
              valor_total_nota = EXCLUDED.valor_total_nota, xml_bruto = EXCLUDED.xml_bruto, nsu_sefaz = EXCLUDED.nsu_sefaz, 
              emit_cnpj = EXCLUDED.emit_cnpj, emit_nome = EXCLUDED.emit_nome, dest_cnpj = EXCLUDED.dest_cnpj, dest_nome = EXCLUDED.dest_nome,
              json_dados = EXCLUDED.json_dados, status_documento = EXCLUDED.status_documento, updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [
            empresaId, chave, numero, serie, emissao, valorTotal, xmlString, nsu, statusDoc,
            emitCnpj, emitNome, destCnpj, destNome, parsedData?.json_dados || null
          ]
        );

        const documentoId = docRows[0].id;

        if (isCompleto && parsedData && parsedData.items) {
          await client.query('DELETE FROM itens_documento WHERE documento_id = $1', [documentoId]);

          for (const item of parsedData.items) {
             const { rows: itemRows } = await client.query(
               `INSERT INTO itens_documento (
                  documento_id, n_item, c_prod, x_prod, ncm, cfop, u_com, q_com, v_un_com, v_prod, v_desc
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
               [
                  documentoId, item.n_item, item.c_prod, item.x_prod, item.ncm, item.cfop, 
                  item.u_com, item.q_com, item.v_un_com, item.v_prod, item.v_desc
               ]
             );
             
             const itemId = itemRows[0].id;
             const trib = item.tributos;

             await client.query(
               `INSERT INTO item_tributos (
                  item_id, origem, cst_icms, icms_base, icms_aliq, icms_valor, icms_st_base, icms_st_aliq, icms_st_valor,
                  cst_pis, pis_valor, cst_cofins, cofins_valor, cst_ipi, ipi_valor
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
               [
                  itemId, trib.icms?.origem || '', trib.icms?.cst || '',
                  trib.icms?.base || 0, trib.icms?.aliq || 0, trib.icms?.valor || 0,
                  trib.icms?.base_st || 0, trib.icms?.aliq_st || 0, trib.icms?.valor_st || 0,
                  trib.pis?.cst || '', trib.pis?.valor || 0,
                  trib.cofins?.cst || '', trib.cofins?.valor || 0,
                  trib.ipi?.cst || '', trib.ipi?.valor || 0
               ]
             );
          }
        }
        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK');
        logger.error(`[NFeService] Falha na transação DB da Nota ${chave}: ${dbErr.message}`);
        throw dbErr;
      } finally {
        client.release();
      }

    } catch (error) {
      logger.error(`[NFeService] Erro interno ao gravar NSU ${nsu}: ${error.message}`);
    }
  }

  async _saveNfeEventToDatabase(empresaId, nsu, xmlString) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttributes: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
    try {
      const res = await parser.parseStringPromise(xmlString);
      let chNFe = '', tpEvento = '';

      if (res.resEvento) {
        chNFe = res.resEvento.chNFe;
        tpEvento = res.resEvento.tpEvento;
      } else if (res.procEventoNFe) {
        const infEvento = res.procEventoNFe.evento?.infEvento || res.procEventoNFe.retEvento?.infEvento;
        chNFe = infEvento?.chNFe;
        tpEvento = infEvento?.tpEvento;
      }

      if (chNFe && (tpEvento === '110111' || tpEvento === '110112')) {
        await pool.query(
          `UPDATE documentos_fiscais SET status_documento = 'CANCELADA', nsu_sefaz = $1, updated_at = CURRENT_TIMESTAMP WHERE chave_acesso = $2`,
          [nsu, chNFe]
        );
        logger.info(`[NFeService] NF-e ${chNFe} marcada como CANCELADA devido a evento NSU ${nsu}.`);
      }
    } catch (error) {
      logger.error(`[NFeService] Erro ao gravar evento NSU ${nsu}: ${error.message}`);
    }
  }
}

module.exports = new NFeService();