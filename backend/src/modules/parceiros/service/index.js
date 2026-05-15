// Ficheiro: backend/src/modules/parceiros/service/index.js

const { pool } = require('../../../config/database');
const axios = require('axios');
const { logger } = require('../../../infra/logger');

class ParceirosService {
  /**
   * Sincroniza e cadastra automaticamente os parceiros lendo os XMLs já processados.
   * Agora grava TODAS as informações da BrasilAPI usando transações relacionais.
   */
  async syncFromXmls(empresaId) {
    try {
      logger.info(`[ParceirosService] Iniciando extração de CNPJs e consulta à BrasilAPI para a empresa ${empresaId}`);

      // 1. Isolar os CNPJs de Fornecedores e Clientes a partir das NFS-e
      const { rows: parceirosNfse } = await pool.query(`
        SELECT cnpj_prestador as cnpj, razao_social_prestador as nome, 'FORNECEDOR' as tipo 
        FROM nfse_documentos 
        WHERE empresa_id = $1 AND fluxo = 'TOMADO' AND cnpj_prestador IS NOT NULL AND cnpj_prestador != '00000000000000'
        UNION
        SELECT cnpj_tomador as cnpj, razao_social_tomador as nome, 'CLIENTE' as tipo 
        FROM nfse_documentos 
        WHERE empresa_id = $1 AND fluxo = 'PRESTADO' AND cnpj_tomador IS NOT NULL AND cnpj_tomador != '00000000000000'
      `, [empresaId]);

      // Consolidação de tipos caso o parceiro atue como Cliente E Fornecedor
      const entidadesMap = {};
      parceirosNfse.forEach(row => {
        if (!entidadesMap[row.cnpj]) {
            entidadesMap[row.cnpj] = { cnpj: row.cnpj, nome: row.nome, tipos: new Set([row.tipo]) };
        } else {
            entidadesMap[row.cnpj].tipos.add(row.tipo);
        }
      });

      let syncCount = 0;
      let updateCount = 0;

      // 2. Consultar a BrasilAPI para cada CNPJ ainda não cadastrado
      for (const key of Object.keys(entidadesMap)) {
        const entidade = entidadesMap[key];
        const tipoFinal = entidade.tipos.size > 1 ? 'AMBOS' : Array.from(entidade.tipos)[0];

        // Verifica se a entidade já está no banco
        const { rows: existing } = await pool.query('SELECT cnpj FROM parceiros WHERE cnpj = $1', [entidade.cnpj]);

        if (existing.length === 0) {
          try {
            // Consulta de dados Oficiais (BrasilAPI)
            const apiRes = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${entidade.cnpj}`);
            const data = apiRes.data;

            // Motor Lógico Tributário Primário
            const optanteSimples = data.opcao_pelo_simples === true;
            const optanteMei = data.opcao_pelo_mei === true;
            const regime = optanteSimples ? 'SIMPLES_NACIONAL' : 'REGIME_NORMAL';

            // Usar uma Transação para garantir que Parceiro, Sócios e CNAEs são gravados de forma atómica
            const client = await pool.connect();
            try {
              await client.query('BEGIN');

              // A. Inserir Dados Base do Parceiro
              await client.query(`
                INSERT INTO parceiros (
                  cnpj, razao_social, nome_fantasia, cnae_fiscal, cnae_fiscal_descricao,
                  optante_simples, optante_mei, regime_tributario, natureza_juridica, porte,
                  capital_social, data_inicio_atividade, situacao_cadastral, data_situacao_cadastral,
                  uf, municipio, cep, bairro, logradouro, numero, complemento, email, telefone, dados_rfb
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
                )
              `, [
                entidade.cnpj, 
                data.razao_social || entidade.nome, 
                data.nome_fantasia || '',
                data.cnae_fiscal || null,
                data.cnae_fiscal_descricao || null,
                optanteSimples, 
                optanteMei,
                regime, 
                data.natureza_juridica || null, 
                data.descricao_porte || data.porte || null, 
                data.capital_social || 0,
                data.data_inicio_atividade || null,
                data.descricao_situacao_cadastral || null,
                data.data_situacao_cadastral || null,
                data.uf || null, 
                data.municipio || null, 
                data.cep || null,
                data.bairro || null,
                data.logradouro || null,
                data.numero || null,
                data.complemento || null,
                data.email || null,
                (data.ddd_telefone_1 || '') + (data.ddd_telefone_2 ? ` / ${data.ddd_telefone_2}` : ''),
                JSON.stringify(data)
              ]);

              // B. Inserir Quadro de Sócios (QSA)
              if (data.qsa && Array.isArray(data.qsa)) {
                for (const socio of data.qsa) {
                  await client.query(`
                    INSERT INTO parceiro_socios (
                      cnpj_parceiro, nome_socio, qualificacao_socio, faixa_etaria, 
                      data_entrada_sociedade, cpf_representante_legal, nome_representante_legal
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                  `, [
                    entidade.cnpj,
                    socio.nome_socio || '',
                    socio.qualificacao_socio || '',
                    socio.faixa_etaria || '',
                    socio.data_entrada_sociedade || null,
                    socio.cpf_representante_legal || '',
                    socio.nome_representante_legal || ''
                  ]);
                }
              }

              // C. Inserir CNAEs Secundários
              if (data.cnaes_secundarios && Array.isArray(data.cnaes_secundarios)) {
                for (const cnae of data.cnaes_secundarios) {
                  await client.query(`
                    INSERT INTO parceiro_cnaes (cnpj_parceiro, codigo, descricao)
                    VALUES ($1, $2, $3)
                  `, [
                    entidade.cnpj,
                    cnae.codigo || '',
                    cnae.descricao || ''
                  ]);
                }
              }

              await client.query('COMMIT');
              syncCount++;
              
            } catch (dbError) {
              await client.query('ROLLBACK');
              logger.error(`[ParceirosService] Falha na transação ao gravar CNPJ ${entidade.cnpj}: ${dbError.message}`);
            } finally {
              client.release();
            }
            
            // Pausa de 500ms para evitar erro 429 (Too Many Requests) na BrasilAPI
            await new Promise(res => setTimeout(res, 500));
          } catch (e) {
            logger.warn(`[ParceirosService] Erro ao consultar BrasilAPI para CNPJ ${entidade.cnpj}: ${e.message}`);
            // Em caso de falha/timeout da API, grava o básico extraído do XML para não bloquear o sistema
            await pool.query(`
              INSERT INTO parceiros (cnpj, razao_social, regime_tributario) 
              VALUES ($1, $2, 'DESCONHECIDO')
              ON CONFLICT (cnpj) DO NOTHING
            `, [entidade.cnpj, entidade.nome]);
          }
        }

        // 3. Vincular o parceiro à Empresa logada na tabela associativa
        const { rowCount } = await pool.query(`
          INSERT INTO empresa_parceiros (empresa_id, cnpj_parceiro, tipo_relacao) 
          VALUES ($1, $2, $3)
          ON CONFLICT (empresa_id, cnpj_parceiro) DO UPDATE SET tipo_relacao = EXCLUDED.tipo_relacao
        `, [empresaId, entidade.cnpj, tipoFinal]);
        
        if(rowCount > 0 && existing.length > 0) updateCount++;
      }

      return { novos: syncCount, atualizados: updateCount, total_base: Object.keys(entidadesMap).length };

    } catch (error) {
      logger.error(`[ParceirosService] Erro na sincronização de Parceiros: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lista todos os parceiros consolidados com as métricas de auditoria
   */
  async listParceiros(empresaId) {
    const { rows } = await pool.query(`
      SELECT 
        p.cnpj, p.razao_social, p.regime_tributario, p.optante_simples, p.uf, p.porte,
        p.municipio, p.natureza_juridica, p.situacao_cadastral, p.email, p.telefone,
        ep.tipo_relacao as tipo,
        (SELECT COUNT(*) FROM nfse_documentos n WHERE n.empresa_id = ep.empresa_id AND (n.cnpj_prestador = p.cnpj OR n.cnpj_tomador = p.cnpj)) as total_notas,
        (SELECT SUM(valor_iss) FROM nfse_documentos n WHERE n.empresa_id = ep.empresa_id AND (n.cnpj_prestador = p.cnpj OR n.cnpj_tomador = p.cnpj) AND n.iss_retido = true) as total_iss_retido
      FROM parceiros p
      JOIN empresa_parceiros ep ON ep.cnpj_parceiro = p.cnpj
      WHERE ep.empresa_id = $1
      ORDER BY p.razao_social ASC
    `, [empresaId]);
    
    return rows;
  }
}

module.exports = new ParceirosService();