// Ficheiro: /home/engeradios/nfe-gestao/backend/src/modules/nfse/service/index.js

const { pool } = require('../../../config/database');
const a1Manager = require('../../../infra/crypto/a1-manager');
const NacionalClient = require('../../../infra/rest/nacional-client');
const { logger } = require('../../../infra/logger');
const { AppError } = require('../../../shared/errors/AppError');
const zlib = require('zlib');
const xml2js = require('xml2js');

class NfseService {
  async sincronizarADN(empresaId) {
    try {
      logger.info(`[NfseService] A iniciar sincronização ADN para a empresa ID: ${empresaId}`);

      // 0. Auto-Cura Profunda: Reprocessa XMLs antigos para preencher novos campos de BI e IBS/CBS
      await this._healDatabase(empresaId);

      // 1. Obter certificado e o ponteiro NSU
      const { rows: certRows } = await pool.query(
        `SELECT c.pfx_binario, c.senha_criptografada, e.cnpj, e.ultimo_nsu_nfse
         FROM certificados c 
         JOIN empresas e ON c.empresa_id = e.id 
         WHERE c.empresa_id = $1`,
        [empresaId]
      );

      if (certRows.length === 0) throw new AppError('Certificado A1 não configurado para esta empresa.', 404);

      const { pfx_binario, senha_criptografada, cnpj, ultimo_nsu_nfse } = certRows[0];
      const cnpjEmpresa = cnpj.replace(/\D/g, ''); 

      // 2. Extração segura PEM
      const senhaLimpa = a1Manager.decryptPassword(senha_criptografada);
      const credentials = a1Manager.getCredentials(pfx_binario, senhaLimpa);
      const client = new NacionalClient(credentials);

      let nsu = ultimo_nsu_nfse ? parseInt(ultimo_nsu_nfse, 10) : 0;
      logger.info(`[NfseService] A consultar ADN a partir do NSU: ${nsu}`);

      // 3. Consulta à API do Governo
      const endpoint = `/contribuintes/DFe/${nsu}?cnpj=${cnpjEmpresa}`;
      let respostaADN;
      
      try {
        respostaADN = await client.get(endpoint);
      } catch (apiError) {
        if (apiError.isE2220 || (apiError.message && (apiError.message.includes('NENHUM_DOCUMENTO_LOCALIZADO') || apiError.message.includes('E2220')))) {
            logger.info(`[NfseService] Sincronização em dia. Fila vazia no ADN a partir do NSU ${nsu}.`);
            return { count: 0, message: 'Sincronização concluída. Nenhum documento novo encontrado.' };
        }
        throw apiError;
      }

      let gravados = 0;
      let novoUltimoNsu = nsu;
      let documentos = [];

      if (Array.isArray(respostaADN)) {
         documentos = respostaADN;
      } else if (respostaADN && typeof respostaADN === 'object') {
         if (respostaADN.LoteDFe) documentos = Array.isArray(respostaADN.LoteDFe) ? respostaADN.LoteDFe : [respostaADN.LoteDFe];
         else if (respostaADN.DFe) documentos = Array.isArray(respostaADN.DFe) ? respostaADN.DFe : [respostaADN.DFe];
         else if (respostaADN.Documentos) documentos = Array.isArray(respostaADN.Documentos) ? respostaADN.Documentos : [respostaADN.Documentos];
      }

      for (const doc of documentos) {
         if (!doc) continue;

         const tipoSefaz = doc.TipoDocumento ? doc.TipoDocumento.toUpperCase() : 'NFSE'; 
         let chaveLote = doc.ChaveAcesso || doc.chaveAcesso;
         if (!chaveLote) continue;
         
         chaveLote = chaveLote.replace('NFS', ''); // Normalização da chave Nacional

         const nsuDoc = doc.NSU || doc.nsu ? parseInt(doc.NSU || doc.nsu, 10) : (nsu + 1);
         if (nsuDoc > novoUltimoNsu) { novoUltimoNsu = nsuDoc; }

         let xmlDescompactado = JSON.stringify(doc);
         let parsedXml = null;

         if (doc.ArquivoXml) {
             try {
                 const bufferBase64 = Buffer.from(doc.ArquivoXml, 'base64');
                 try { xmlDescompactado = zlib.gunzipSync(bufferBase64).toString('utf-8'); } 
                 catch(e) { xmlDescompactado = zlib.unzipSync(bufferBase64).toString('utf-8'); }
                 
                 const parser = new xml2js.Parser({ explicitArray: false, ignoreAttributes: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
                 parsedXml = await parser.parseStringPromise(xmlDescompactado);
             } catch (err) {
                 logger.warn(`[NfseService] Falha ao descompactar XML GZIP para a chave ${chaveLote}: ${err.message}`);
             }
         }

         if (tipoSefaz === 'EVENTO' || this._findNodeGlobal(parsedXml, ['evento', 'infEvento'])) {
             await this._processarEvento(empresaId, nsuDoc, chaveLote, parsedXml, xmlDescompactado);
             gravados++;
         } else {
             await this._processarNotaFiscal(empresaId, nsuDoc, chaveLote, parsedXml, xmlDescompactado, cnpjEmpresa);
             gravados++;
         }
      }

      if (novoUltimoNsu > nsu) {
        await pool.query('UPDATE empresas SET ultimo_nsu_nfse = $1 WHERE id = $2', [novoUltimoNsu, empresaId]);
        logger.info(`[NfseService] NSU da NFS-e atualizado para: ${novoUltimoNsu}`);
      }

      return { count: gravados, message: `Sincronização concluída: ${gravados} registos processados.` };

    } catch (error) {
      logger.error(`[NfseService] Erro na Sincronização ADN: ${error.message}`);
      throw new AppError(`Falha ao sincronizar com o Portal Nacional: ${error.message}`, error.statusCode || 500);
    }
  }

  async importarXmlManual(empresaId, xmlBuffer) {
    try {
      const xmlString = xmlBuffer.toString('utf-8');
      const parser = new xml2js.Parser({ explicitArray: false, ignoreAttributes: false, tagNameProcessors: [xml2js.processors.stripPrefix] });
      const xmlObj = await parser.parseStringPromise(xmlString);

      logger.info(`[NfseService] Importação manual de XML iniciada para empresa: ${empresaId}`);

      const dadosNota = this._extractNfseData(xmlObj);

      if ((dadosNota.numero === '0' || dadosNota.numero === 'S/N') && !xmlString.toLowerCase().includes('nfse')) {
        throw new AppError('O ficheiro enviado não aparenta ser um XML de NFS-e válido.', 400);
      }

      const { rows: empRows } = await pool.query('SELECT cnpj FROM empresas WHERE id = $1', [empresaId]);
      const cnpjEmpresa = empRows.length > 0 ? empRows[0].cnpj.replace(/\D/g, '') : '';

      let fluxo = 'DESCONHECIDO';
      if (dadosNota.cnpjPrestador && dadosNota.cnpjPrestador === cnpjEmpresa) fluxo = 'PRESTADO';
      else if (dadosNota.cnpjTomador && dadosNota.cnpjTomador === cnpjEmpresa) fluxo = 'TOMADO';

      let chaveLote = this._findNodeGlobal(xmlObj, ['chNFSe', 'chaveAcesso', 'Id']);
      if (typeof chaveLote === 'object' && chaveLote._) chaveLote = chaveLote._;
      if (typeof chaveLote !== 'string') chaveLote = '';
      
      chaveLote = chaveLote.replace('NFS', '');
      if (!chaveLote) chaveLote = `MANUAL_${new Date().getTime()}`;

      await pool.query(
        `INSERT INTO nfse_documentos 
          (empresa_id, chave_acesso, tipo_documento, fluxo, numero_nfse, serie_nfse, data_emissao, valor_servicos, valor_iss, xml_bruto, nsu_nfse, 
           cnpj_prestador, cnpj_tomador, valor_deducoes, valor_pis, valor_cofins, valor_inss, valor_ir, valor_csll, status_nfse,
           competencia, municipio_prestacao, municipio_incidencia, codigo_tributacao, cnae, razao_social_prestador, razao_social_tomador, base_calculo, aliquota_iss, iss_retido, json_dados,
           valor_ibs, valor_cbs, aliquota_ibs, aliquota_cbs, base_calculo_ibs_cbs, cst_ibs_cbs)
         VALUES ($1, $2, 'NFSE', $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, $12, $13, $14, $15, $16, $17, 'AUTORIZADA',
                 $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)
         ON CONFLICT (chave_acesso) DO UPDATE SET 
          fluxo = EXCLUDED.fluxo, numero_nfse = EXCLUDED.numero_nfse, serie_nfse = EXCLUDED.serie_nfse, data_emissao = EXCLUDED.data_emissao,
          valor_servicos = EXCLUDED.valor_servicos, valor_iss = EXCLUDED.valor_iss, xml_bruto = EXCLUDED.xml_bruto,
          cnpj_prestador = EXCLUDED.cnpj_prestador, cnpj_tomador = EXCLUDED.cnpj_tomador, valor_deducoes = EXCLUDED.valor_deducoes, 
          valor_pis = EXCLUDED.valor_pis, valor_cofins = EXCLUDED.valor_cofins, valor_inss = EXCLUDED.valor_inss, valor_ir = EXCLUDED.valor_ir, valor_csll = EXCLUDED.valor_csll,
          competencia = EXCLUDED.competencia, municipio_prestacao = EXCLUDED.municipio_prestacao, municipio_incidencia = EXCLUDED.municipio_incidencia,
          codigo_tributacao = EXCLUDED.codigo_tributacao, cnae = EXCLUDED.cnae, razao_social_prestador = EXCLUDED.razao_social_prestador,
          razao_social_tomador = EXCLUDED.razao_social_tomador, base_calculo = EXCLUDED.base_calculo, aliquota_iss = EXCLUDED.aliquota_iss,
          iss_retido = EXCLUDED.iss_retido, json_dados = EXCLUDED.json_dados,
          valor_ibs = EXCLUDED.valor_ibs, valor_cbs = EXCLUDED.valor_cbs, aliquota_ibs = EXCLUDED.aliquota_ibs, aliquota_cbs = EXCLUDED.aliquota_cbs,
          base_calculo_ibs_cbs = EXCLUDED.base_calculo_ibs_cbs, cst_ibs_cbs = EXCLUDED.cst_ibs_cbs,
          updated_at = CURRENT_TIMESTAMP`,
        [empresaId, chaveLote, fluxo, dadosNota.numero, dadosNota.serie, dadosNota.dataEmissao, dadosNota.valor, dadosNota.iss, xmlString, dadosNota.cnpjPrestador, dadosNota.cnpjTomador, dadosNota.deducoes, dadosNota.pis, dadosNota.cofins, dadosNota.inss, dadosNota.ir, dadosNota.csll,
         dadosNota.competencia, dadosNota.municipioPrestacao, dadosNota.municipioIncidencia, dadosNota.codigoTributacao, dadosNota.cnae, dadosNota.razaoSocialPrestador, dadosNota.razaoSocialTomador, dadosNota.baseCalculo, dadosNota.aliquotaIss, dadosNota.issRetido, dadosNota.jsonDados,
         dadosNota.valorIbs, dadosNota.valorCbs, dadosNota.aliquotaIbs, dadosNota.aliquotaCbs, dadosNota.baseCalculoIbsCbs, dadosNota.cstIbsCbs]
      );

      return { success: true, message: 'Ficheiro XML de NFS-e importado com sucesso.' };
    } catch (error) {
      logger.error(`[NfseService] Erro ao importar XML: ${error.message}`);
      throw new AppError(`Falha na importação do XML: ${error.message}`, error.statusCode || 500);
    }
  }

  async _processarEvento(empresaId, nsuDoc, chaveLote, parsedXml, xmlBruto) {
      let dataEmissao = new Date();
      let codigoEvento = '';
      let chaveNotaOriginal = chaveLote;

      if (parsedXml) {
          const infEvento = this._findNodeGlobal(parsedXml, ['infEvento', 'evento']);
          if (infEvento) {
              const dhEvento = this._getText(this._findNodeGlobal(infEvento, ['dhEvento', 'DataHora']));
              if (dhEvento) dataEmissao = new Date(dhEvento);
              
              codigoEvento = this._getText(this._findNodeGlobal(infEvento, ['cEvt', 'tpEvento', 'tipoEvento'])) || '';
              const chNFe = this._getText(this._findNodeGlobal(infEvento, ['chNFSe', 'chNFe', 'chaveAcesso'])) || '';
              if (chNFe) chaveNotaOriginal = chNFe;
          }
      }

      chaveNotaOriginal = chaveNotaOriginal.replace('NFS', '');

      const statusEvento = `EVT_${codigoEvento}`;
      const chavePrimariaEvento = `EVT_${chaveNotaOriginal}_${codigoEvento || nsuDoc}`;

      await pool.query(
        `INSERT INTO nfse_documentos 
          (empresa_id, chave_acesso, tipo_documento, numero_nfse, serie_nfse, data_emissao, valor_servicos, valor_iss, xml_bruto, nsu_nfse, fluxo, status_nfse)
         VALUES ($1, $2, 'EVENTO', 'EVENTO', 'EVT', $3, 0, 0, $4, $5, 'AUDITORIA', $6)
         ON CONFLICT (chave_acesso) DO UPDATE SET nsu_nfse = EXCLUDED.nsu_nfse, xml_bruto = EXCLUDED.xml_bruto`,
        [empresaId, chavePrimariaEvento, dataEmissao, xmlBruto, nsuDoc, statusEvento]
      );

      const codigosDestrutivos = ['1101', '1102', '105102', '101101', '305101', '105104'];
      if (codigosDestrutivos.includes(codigoEvento)) {
          logger.info(`[NfseService] Evento de Cancelamento (${codigoEvento}) cruzado com a NFS-e: ${chaveNotaOriginal}`);
          await pool.query(
              `UPDATE nfse_documentos SET status_nfse = 'CANCELADA', updated_at = CURRENT_TIMESTAMP WHERE chave_acesso = $1 AND tipo_documento = 'NFSE'`,
              [chaveNotaOriginal]
          );
      }
  }

  async _processarNotaFiscal(empresaId, nsuDoc, chaveLote, parsedXml, xmlBruto, cnpjEmpresa) {
      let nota = this._getEmptyNotaData();
      if (parsedXml) nota = this._extractNfseData(parsedXml);

      let fluxo = 'DESCONHECIDO';
      if (nota.cnpjPrestador && nota.cnpjPrestador === cnpjEmpresa) fluxo = 'PRESTADO';
      else if (nota.cnpjTomador && nota.cnpjTomador === cnpjEmpresa) fluxo = 'TOMADO';

      const { rows: evtRows } = await pool.query(`SELECT status_nfse FROM nfse_documentos WHERE chave_acesso LIKE $1 AND tipo_documento = 'EVENTO'`, [`%${chaveLote}%`]);
      let statusNota = 'AUTORIZADA';
      for (const row of evtRows) {
          const codEvt = row.status_nfse.replace('EVT_', '');
          if (['1101', '1102', '105102', '101101', '305101', '105104'].includes(codEvt)) {
              statusNota = 'CANCELADA'; break;
          }
      }

      await pool.query(
        `INSERT INTO nfse_documentos 
          (empresa_id, chave_acesso, tipo_documento, fluxo, numero_nfse, serie_nfse, data_emissao, valor_servicos, valor_iss, xml_bruto, nsu_nfse, 
           cnpj_prestador, cnpj_tomador, valor_deducoes, valor_pis, valor_cofins, valor_inss, valor_ir, valor_csll, status_nfse,
           competencia, municipio_prestacao, municipio_incidencia, codigo_tributacao, cnae, razao_social_prestador, razao_social_tomador, base_calculo, aliquota_iss, iss_retido, json_dados,
           valor_ibs, valor_cbs, aliquota_ibs, aliquota_cbs, base_calculo_ibs_cbs, cst_ibs_cbs)
         VALUES ($1, $2, 'NFSE', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                 $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)
         ON CONFLICT (chave_acesso) DO UPDATE SET 
          fluxo = EXCLUDED.fluxo, numero_nfse = EXCLUDED.numero_nfse, serie_nfse = EXCLUDED.serie_nfse, data_emissao = EXCLUDED.data_emissao,
          valor_servicos = EXCLUDED.valor_servicos, valor_iss = EXCLUDED.valor_iss, xml_bruto = EXCLUDED.xml_bruto, nsu_nfse = EXCLUDED.nsu_nfse, 
          cnpj_prestador = EXCLUDED.cnpj_prestador, cnpj_tomador = EXCLUDED.cnpj_tomador, valor_deducoes = EXCLUDED.valor_deducoes, 
          valor_pis = EXCLUDED.valor_pis, valor_cofins = EXCLUDED.valor_cofins, valor_inss = EXCLUDED.valor_inss, valor_ir = EXCLUDED.valor_ir, valor_csll = EXCLUDED.valor_csll,
          status_nfse = EXCLUDED.status_nfse,
          competencia = EXCLUDED.competencia, municipio_prestacao = EXCLUDED.municipio_prestacao, municipio_incidencia = EXCLUDED.municipio_incidencia,
          codigo_tributacao = EXCLUDED.codigo_tributacao, cnae = EXCLUDED.cnae, razao_social_prestador = EXCLUDED.razao_social_prestador,
          razao_social_tomador = EXCLUDED.razao_social_tomador, base_calculo = EXCLUDED.base_calculo, aliquota_iss = EXCLUDED.aliquota_iss,
          iss_retido = EXCLUDED.iss_retido, json_dados = EXCLUDED.json_dados,
          valor_ibs = EXCLUDED.valor_ibs, valor_cbs = EXCLUDED.valor_cbs, aliquota_ibs = EXCLUDED.aliquota_ibs, aliquota_cbs = EXCLUDED.aliquota_cbs,
          base_calculo_ibs_cbs = EXCLUDED.base_calculo_ibs_cbs, cst_ibs_cbs = EXCLUDED.cst_ibs_cbs,
          updated_at = CURRENT_TIMESTAMP`,
        [empresaId, chaveLote, fluxo, nota.numero, nota.serie, nota.dataEmissao, nota.valor, nota.iss, xmlBruto, nsuDoc, nota.cnpjPrestador, nota.cnpjTomador, nota.deducoes, nota.pis, nota.cofins, nota.inss, nota.ir, nota.csll, statusNota,
         nota.competencia, nota.municipioPrestacao, nota.municipioIncidencia, nota.codigoTributacao, nota.cnae, nota.razaoSocialPrestador, nota.razaoSocialTomador, nota.baseCalculo, nota.aliquotaIss, nota.issRetido, nota.jsonDados,
         nota.valorIbs, nota.valorCbs, nota.aliquotaIbs, nota.aliquotaCbs, nota.baseCalculoIbsCbs, nota.cstIbsCbs]
       );
  }

  async _healDatabase(empresaId) {
      try {
          // Garante que não irá travar se a coluna não existir, verificando de antemão
          const checkQuery = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='nfse_documentos' and column_name='competencia'
          `);
          
          if (checkQuery.rows.length === 0) {
              logger.warn(`[NfseService] AVISO: As colunas da Reforma Tributária ainda não foram criadas no banco de dados. A Auto-Cura foi ignorada para não gerar erros. Por favor, execute o script SQL de migração.`);
              return;
          }

          const { rows } = await pool.query(`SELECT id, chave_acesso, xml_bruto FROM nfse_documentos WHERE empresa_id = $1 AND tipo_documento = 'NFSE'`, [empresaId]);
          if (rows.length === 0) return;
          
          logger.info(`[NfseService] Auto-Cura Profunda: A processar expansão de campos da Reforma Tributária (IBS/CBS) em ${rows.length} documentos históricos.`);
          
          const parser = new xml2js.Parser({ explicitArray: false, ignoreAttributes: false, tagNameProcessors: [xml2js.processors.stripPrefix] });

          for (const row of rows) {
              try {
                  let xmlReal = row.xml_bruto;
                  if (xmlReal.trim().startsWith('{')) {
                      const docJson = JSON.parse(xmlReal);
                      if (docJson.ArquivoXml) {
                          const bufferBase64 = Buffer.from(docJson.ArquivoXml, 'base64');
                          try { xmlReal = zlib.gunzipSync(bufferBase64).toString('utf-8'); } catch(e) { xmlReal = zlib.unzipSync(bufferBase64).toString('utf-8'); }
                      } else { continue; }
                  }

                  const xmlObj = await parser.parseStringPromise(xmlReal);
                  const nota = this._extractNfseData(xmlObj);
                  
                  await pool.query(`
                      UPDATE nfse_documentos SET
                          numero_nfse = $1, serie_nfse = $2, data_emissao = $3, valor_servicos = $4, valor_iss = $5,
                          cnpj_prestador = $6, cnpj_tomador = $7, valor_deducoes = $8, valor_pis = $9, 
                          valor_cofins = $10, valor_inss = $11, valor_ir = $12, valor_csll = $13,
                          competencia = $14, municipio_prestacao = $15, municipio_incidencia = $16, codigo_tributacao = $17, cnae = $18,
                          razao_social_prestador = $19, razao_social_tomador = $20, base_calculo = $21, aliquota_iss = $22, iss_retido = $23,
                          json_dados = $24, valor_ibs = $25, valor_cbs = $26, aliquota_ibs = $27, aliquota_cbs = $28, 
                          base_calculo_ibs_cbs = $29, cst_ibs_cbs = $30
                      WHERE id = $31
                  `, [
                      nota.numero, nota.serie, nota.dataEmissao, nota.valor, nota.iss,
                      nota.cnpjPrestador, nota.cnpjTomador, nota.deducoes, nota.pis,
                      nota.cofins, nota.inss, nota.ir, nota.csll,
                      nota.competencia, nota.municipioPrestacao, nota.municipioIncidencia, nota.codigoTributacao, nota.cnae,
                      nota.razaoSocialPrestador, nota.razaoSocialTomador, nota.baseCalculo, nota.aliquotaIss, nota.issRetido,
                      nota.jsonDados, nota.valorIbs, nota.valorCbs, nota.aliquotaIbs, nota.aliquotaCbs,
                      nota.baseCalculoIbsCbs, nota.cstIbsCbs, row.id
                  ]);
              } catch (e) {
                  // Silencia erros individuais de parse para não quebrar o batch de cura
              }
          }
      } catch (error) {
          logger.error(`[NfseService] Erro na Auto-Cura: ${error.message}`);
      }
  }

  /**
   * SUPER MOTOR FISCAL: BREADTH-FIRST SEARCH (BFS)
   * Explora recursivamente o XML em largura até encontrar o valor, lidando com namespaces e aninhamentos.
   */
  _findNodeDeep(obj, searchKeys) {
      if (!obj) return null;
      let queue = [obj];
      
      while (queue.length > 0) {
          let current = queue.shift();
          if (typeof current !== 'object' || current === null) continue;
          
          for (let key of searchKeys) {
              const match = Object.keys(current).find(k => k.toLowerCase() === key.toLowerCase());
              if (match && current[match] !== undefined && current[match] !== '') {
                  let val = current[match];
                  if (Array.isArray(val)) val = val[0];
                  
                  if (val && typeof val === 'object') {
                      if (val._ !== undefined) return val._;
                      // ATUALIZAÇÃO CRÍTICA: Retornar o objeto se ele tiver múltiplos nós internos
                      return val;
                  } else if (typeof val !== 'object') {
                      return val;
                  }
              }
          }
          
          for (let k of Object.keys(current)) {
              if (typeof current[k] === 'object' && current[k] !== null) {
                  queue.push(current[k]);
              }
          }
      }
      return null;
  }

  _findNodeGlobal(obj, searchKeys) { return this._findNodeDeep(obj, searchKeys); }

  _getText(val) {
      if (Array.isArray(val)) val = val[0];
      if (val && typeof val === 'object' && val._) return val._;
      if (val && typeof val === 'object') {
          for (let k of Object.keys(val)) { if (typeof val[k] !== 'object') return val[k]; }
          return null;
      }
      return val ? String(val) : '';
  }

  _getNum(val) {
      const t = this._getText(val);
      if (!t) return 0;
      const parsed = parseFloat(String(t).replace(',', '.').trim());
      return isNaN(parsed) ? 0 : parsed;
  }

  _getEmptyNotaData() {
      return { 
        numero: 'S/N', serie: 'UN', dataEmissao: new Date(), valor: 0, iss: 0, 
        cnpjPrestador: '00000000000000', cnpjTomador: '00000000000000', deducoes: 0, 
        pis: 0, cofins: 0, inss: 0, ir: 0, csll: 0,
        competencia: '', municipioPrestacao: '', municipioIncidencia: '',
        codigoTributacao: '', cnae: '', razaoSocialPrestador: '', razaoSocialTomador: '',
        baseCalculo: 0, aliquotaIss: 0, issRetido: false, jsonDados: null,
        valorIbs: 0, valorCbs: 0, aliquotaIbs: 0, aliquotaCbs: 0, baseCalculoIbsCbs: 0, cstIbsCbs: ''
      };
  }

  /**
   * Extração Strict Domain de Serviços - Mapeamento Oficial do Leiaute Nacional DPS / ADN
   * Incluindo extração nativa para Reforma Tributária (IBS / CBS)
   */
  _extractNfseData(xmlObj) {
    const rawNum = this._findNodeDeep(xmlObj, ['nNFSe', 'Numero', 'nDFSe']) || 'S/N';
    const rawSer = this._findNodeDeep(xmlObj, ['sNFSe', 'Serie']) || 'UN';
    const rawData = this._findNodeDeep(xmlObj, ['dhEmi', 'DataEmissao', 'dhProc', 'Competencia']);

    let dataEmissao = new Date();
    if (rawData) {
        const parsedData = new Date(rawData);
        if (!isNaN(parsedData.getTime())) dataEmissao = parsedData;
    }

    const prestNode = this._findNodeDeep(xmlObj, ['PrestadorServico', 'Prestador', 'emit', 'prest']);
    const rawCnpjPrestador = prestNode ? this._findNodeDeep(prestNode, ['CNPJ', 'CPF', 'CpfCnpj']) : null;
    const razaoSocialPrestador = this._getText(this._findNodeDeep(prestNode, ['xNome', 'RazaoSocial', 'Nome', 'NomeFantasia'])) || '';
    
    const tomaNode = this._findNodeDeep(xmlObj, ['TomadorServico', 'Tomador', 'dest', 'toma']);
    const rawCnpjTomador = tomaNode ? this._findNodeDeep(tomaNode, ['CNPJ', 'CPF', 'CpfCnpj']) : null;
    const razaoSocialTomador = this._getText(this._findNodeDeep(tomaNode, ['xNome', 'RazaoSocial', 'Nome', 'NomeFantasia'])) || '';

    const competencia = this._getText(this._findNodeDeep(xmlObj, ['Competencia', 'dComp']))?.substring(0, 7) || dataEmissao.toISOString().substring(0, 7);
    const municipioPrestacao = this._getText(this._findNodeDeep(xmlObj, ['cLocPrestacao', 'MunicipioPrestacao'])) || '';
    const municipioIncidencia = this._getText(this._findNodeDeep(xmlObj, ['cLocIncid', 'MunicipioIncidencia'])) || '';
    const cnae = this._getText(this._findNodeDeep(xmlObj, ['cnae', 'Cnae'])) || '';
    const codigoTributacao = this._getText(this._findNodeDeep(xmlObj, ['cTribNac', 'cServ', 'ItemListaServico'])) || '';

    const valor = this._getNum(this._findNodeDeep(xmlObj, ['vServPrest', 'vServ', 'ValorServicos']));
    const iss = this._getNum(this._findNodeDeep(xmlObj, ['vISSQN', 'ValorIss', 'vISS']));
    const deducoes = this._getNum(this._findNodeDeep(xmlObj, ['vDeduc', 'ValorDeducoes', 'vDeducao', 'vDescIncond', 'vDescCond']));
    const pis = this._getNum(this._findNodeDeep(xmlObj, ['vRetPIS', 'ValorPis', 'vPIS']));
    const cofins = this._getNum(this._findNodeDeep(xmlObj, ['vRetCOFINS', 'ValorCofins', 'vCOFINS']));
    const inss = this._getNum(this._findNodeDeep(xmlObj, ['vRetCP', 'ValorInss', 'vINSS'])); 
    const ir = this._getNum(this._findNodeDeep(xmlObj, ['vRetIRRF', 'ValorIr', 'vIR', 'vIRRF']));
    const csll = this._getNum(this._findNodeDeep(xmlObj, ['vRetCSLL', 'ValorCsll', 'vCSLL']));

    const baseCalculo = this._getNum(this._findNodeDeep(xmlObj, ['vBC', 'vBCISS', 'BaseCalculo']));
    const aliquotaIss = this._getNum(this._findNodeDeep(xmlObj, ['pAliq', 'pAliqISS', 'Aliquota', 'pISS']));
    
    // Análise de Retenção de ISS
    const vIssRet = this._getNum(this._findNodeDeep(xmlObj, ['vISSRet', 'ValorIssRetido', 'vISSRetido']));
    const indRetencao = this._getText(this._findNodeDeep(xmlObj, ['tpRetISS', 'ISSQNRetido', 'RetencaoISS'])); 
    
    let issRetido = false;
    if (vIssRet > 0) {
        issRetido = true;
    } else if (indRetencao) {
        const ind = String(indRetencao).trim().toUpperCase();
        // ADN: 2 (Retido Tomador), 3 (Retido Intermediario) | ABRASF: 1 (Sim)
        if (ind === '2' || ind === '3' || ind === 'S' || ind === 'SIM') {
            issRetido = true;
        } else if (ind === '1' && !xmlObj.NFSe?.infNFSe?.valores?.trib?.tribMun?.tpRetISS) {
            issRetido = true; 
        }
    }

    // --- REFORMA TRIBUTÁRIA (IVA DUAL - IBS e CBS) ---
    const valorIbs = this._getNum(this._findNodeDeep(xmlObj, ['vIBS', 'ValorIBS']));
    const valorCbs = this._getNum(this._findNodeDeep(xmlObj, ['vCBS', 'ValorCBS']));
    const aliquotaIbs = this._getNum(this._findNodeDeep(xmlObj, ['pIBS', 'AliquotaIBS', 'pAliqIBS']));
    const aliquotaCbs = this._getNum(this._findNodeDeep(xmlObj, ['pCBS', 'AliquotaCBS', 'pAliqCBS']));
    const baseCalculoIbsCbs = this._getNum(this._findNodeDeep(xmlObj, ['vBCIBS', 'vBCCBS', 'BaseCalculoIBSCBS', 'vBCIBSCBS']));
    const cstIbsCbs = this._getText(this._findNodeDeep(xmlObj, ['CSTReg', 'CSTIBSCBS', 'cClassTribReg', 'CST'])) || '';

    // Cria o JSON Stringificado de segurança garantindo 100% dos dados para BI
    let jsonDados = null;
    try { jsonDados = JSON.stringify(xmlObj); } catch(e) {}

    return {
        numero: String(rawNum), serie: String(rawSer), dataEmissao,
        valor, iss,
        cnpjPrestador: rawCnpjPrestador ? String(rawCnpjPrestador).replace(/\D/g, '') : '00000000000000',
        cnpjTomador: rawCnpjTomador ? String(rawCnpjTomador).replace(/\D/g, '') : '00000000000000',
        deducoes, pis, cofins, inss, ir, csll,
        competencia, municipioPrestacao, municipioIncidencia, cnae, codigoTributacao,
        razaoSocialPrestador, razaoSocialTomador, baseCalculo, aliquotaIss, issRetido,
        jsonDados,
        valorIbs, valorCbs, aliquotaIbs, aliquotaCbs, baseCalculoIbsCbs, cstIbsCbs
    };
  }
}

module.exports = new NfseService();