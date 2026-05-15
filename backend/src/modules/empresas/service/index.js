// Ficheiro: backend/src/modules/empresas/service/index.js

const { pool } = require('../../../config/database');
const { logger } = require('../../../infra/logger');
const a1Manager = require('../../../infra/crypto/a1-manager');
const geminiClient = require('../../../infra/ai/gemini-client');
const { AppError } = require('../../../shared/errors/AppError');
const rfProvider = require('../providers/rf-provider');
const sefazProvider = require('../providers/sefaz-provider');
const empresaLookupParser = require('../parser');

class EmpresaService {
  async listMatrizes() {
    const { rows } = await pool.query(`
        SELECT e.*, 
        (SELECT COUNT(*) FROM certificados c WHERE c.empresa_id = e.id AND c.ativo = true) > 0 as has_certificado
        FROM empresas e 
        WHERE is_filial = false 
        ORDER BY razao_social ASC
    `);
    return rows;
  }

  async lookupCnpj(cnpj, matrizId = null) {
    const cleanCnpj = String(cnpj).replace(/\D/g, '');
    logger.info(`[EmpresaService] A iniciar orquestração de Lookup para CNPJ: ${cleanCnpj}`);
    
    const rfbData = await rfProvider.lookup(cleanCnpj);
    if (!rfbData) throw new AppError('CNPJ não encontrado ou RFB indisponível no momento.', 404);

    let sefazData = null;
    if (matrizId) {
      const { rows: certRows } = await pool.query(
        `SELECT pfx_binario, senha_criptografada FROM certificados WHERE empresa_id = $1 AND ativo = true`, [matrizId]
      );
      if (certRows.length > 0) {
        const certConfig = {
          pfx: certRows[0].pfx_binario,
          senhaCriptografada: certRows[0].senha_criptografada
        };
        sefazData = await sefazProvider.lookup(cleanCnpj, rfbData.raw.uf, certConfig);
      }
    }

    const parsedData = empresaLookupParser.parse(rfbData, sefazData);
    
    return {
      identificacao: parsedData.identificacao,
      fiscal: parsedData.fiscal,
      endereco: parsedData.endereco,
      regime_tributario: parsedData.regime,
      cnpj: parsedData.identificacao.cnpj,
      optante_simples: parsedData.regime.optante_simples,
      dados_brutos: parsedData.dados_brutos
    };
  }

  async createMatriz(payload) {
    const { identificacao, endereco, fiscal, regime, cnpj, optante_simples, dados_brutos } = payload;
    const cleanCnpj = String(cnpj).replace(/\D/g, '');
    const statusRegime = regime?.status || (optante_simples ? 'SIMPLES_NACIONAL' : 'REGIME_NORMAL');
    
    const { rows } = await pool.query(
      `INSERT INTO empresas (razao_social, nome_fantasia, cnpj, uf, municipio_codigo, inscricao_estadual, optante_simples, regime_tributario, dados_rfb, is_filial) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false) RETURNING *`,
      [
          identificacao?.razao_social || 'NÃO INFORMADO', 
          identificacao?.nome_fantasia || '', 
          cleanCnpj, 
          endereco?.uf || fiscal?.uf || 'SP', 
          endereco?.municipio_ibge || '3550308',
          fiscal?.inscricao_estadual || 'ISENTO', 
          optante_simples || false, 
          statusRegime, 
          JSON.stringify(dados_brutos || {})
      ]
    );
    return rows[0];
  }

  async updateEmpresa(id, payload) {
    const { razao_social, inscricao_estadual, uf, regime_tributario } = payload;
    const { rows } = await pool.query(
      `UPDATE empresas SET 
        razao_social = $1, inscricao_estadual = $2, uf = $3, regime_tributario = $4, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $5 RETURNING *`,
      [razao_social, inscricao_estadual, uf, regime_tributario, id]
    );
    if (rows.length === 0) throw new AppError('Entidade não encontrada.', 404);
    return rows[0];
  }

  async saveCertificado(empresaId, pfxBuffer, senha) {
    logger.info(`[EmpresaService] Processando custódia de certificado A1 para Empresa ID: ${empresaId}`);
    
    const info = a1Manager.validateAndExtract(pfxBuffer, senha);
    const senhaCripto = a1Manager.encryptPassword(senha);

    const { rows } = await pool.query(`
      INSERT INTO certificados (empresa_id, pfx_binario, senha_criptografada, data_vencimento, cnpj_certificado, ativo)
      VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT (empresa_id) DO UPDATE SET
        pfx_binario = EXCLUDED.pfx_binario,
        senha_criptografada = EXCLUDED.senha_criptografada,
        data_vencimento = EXCLUDED.data_vencimento,
        cnpj_certificado = EXCLUDED.cnpj_certificado,
        updated_at = CURRENT_TIMESTAMP
      RETURNING data_vencimento, cnpj_certificado;
    `, [empresaId, pfxBuffer, senhaCripto, info.validTo, info.subject.replace(/[^0-9]/g, '')]);

    return { vencimento: rows[0].data_vencimento, emitente: rows[0].cnpj_certificado };
  }

  async listFiliais(matrizId) {
    const { rows } = await pool.query('SELECT * FROM empresas WHERE matriz_id = $1 AND is_filial = true ORDER BY razao_social ASC', [matrizId]);
    return rows;
  }

  async createFilial(matrizId, cnpj) {
    const cleanCnpj = String(cnpj).replace(/\D/g, '');
    logger.info(`[EmpresaService] A criar filial a partir do Lookup para o CNPJ: ${cleanCnpj}`);
    
    try {
      const data = await this.lookupCnpj(cleanCnpj, matrizId);

      const { rows } = await pool.query(`
        INSERT INTO empresas (razao_social, nome_fantasia, cnpj, uf, municipio_codigo, inscricao_estadual, optante_simples, regime_tributario, dados_rfb, matriz_id, is_filial)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true) RETURNING *
      `, [
        data.identificacao.razao_social, 
        data.identificacao.nome_fantasia || '', 
        data.cnpj, 
        data.endereco?.uf || 'SP',
        data.endereco?.municipio_ibge || '3550308',
        data.fiscal.inscricao_estadual || 'ISENTO',
        data.optante_simples, 
        data.regime_tributario?.status || 'REGIME_NORMAL', 
        JSON.stringify(data.dados_brutos), 
        matrizId
      ]);
      
      return rows[0];
    } catch (error) {
      throw new AppError(`Falha ao injetar filial: ${error.message}`, 500);
    }
  }

  async analiseEstruturaIa(matrizId) {
    const { rows: matrizRows } = await pool.query('SELECT * FROM empresas WHERE id = $1', [matrizId]);
    const { rows: filiaisRows } = await pool.query('SELECT * FROM empresas WHERE matriz_id = $1 AND is_filial = true', [matrizId]);

    if (matrizRows.length === 0) throw new AppError("Entidade Matriz não encontrada.", 404);

    const matriz = matrizRows[0];
    
    const ies = filiaisRows.map(f => `${f.uf}: ${f.inscricao_estadual}`).join(' | ');

    const prompt = `Analise a seguinte estrutura societária do ponto de vista de conformidade e planeamento tributário no Brasil:
    - Matriz: ${matriz.razao_social} (CNPJ: ${matriz.cnpj}) localizada em ${matriz.uf}. Regime: ${matriz.regime_tributario}. Inscrição Estadual: ${matriz.inscricao_estadual}.
    - Quantidade de Filiais Ativas: ${filiaisRows.length}.
    - Jurisdições e IEs das Filiais: ${ies || 'Nenhuma filial com Inscrição Estadual registada.'}.
    
    Forneça um parecer executivo focado em:
    1. Complexidade de obrigações acessórias (SPED, ICMS ST, Reforma Tributária) decorrente desta capilaridade.
    2. Alertas de conformidade para a centralização de apuramentos.
    3. Sugestão estratégica para a equipa de contabilidade.`;

    const sysPrompt = "Você é um Auditor Tributário Sênior (LLM). Responda em português de Portugal ou Brasil de forma cirúrgica e estruturada com bullet points.";

    return await geminiClient.generateContent(prompt, sysPrompt);
  }
}

module.exports = new EmpresaService();