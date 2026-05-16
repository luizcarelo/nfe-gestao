/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/nfse/service/index.js
 * Serviço de NFSe - Suporte ao Portal Nacional e Arquitetura Multi-Tenant
 */
const nfseParser = require('../parser');
const { pool } = require('../../../config/database');
const AppError = require('../../../shared/errors/AppError');
const { logger } = require('../../../infra/logger');

class NFSeService {
  /**
   * Processa o upload de XML da NFSe Nacional
   */
  async processarUploadXML(tenant_id, empresa_id, xmlString) {
    const dadosNfse = nfseParser.parse(xmlString);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Segurança SaaS: Valida se a empresa pertence ao Tenant
      const empresaQuery = await client.query(
        'SELECT id FROM empresas WHERE id = $1 AND tenant_id = $2',
        [empresa_id, tenant_id]
      );
      if (empresaQuery.rows.length === 0) {
        throw new AppError('Empresa não encontrada ou não pertence à sua conta.', 404);
      }

      // Evita duplicidade baseada no número da nota nacional e empresa
      const existe = await client.query(
        'SELECT id FROM nfse WHERE tenant_id = $1 AND empresa_id = $2 AND numero_nota = $3',
        [tenant_id, empresa_id, dadosNfse.numero_nota]
      );
      if (existe.rows.length > 0) {
        throw new AppError(`A NFS-e nº ${dadosNfse.numero_nota} já foi importada anteriormente.`, 409);
      }

      const insertQuery = `
        INSERT INTO nfse (
          tenant_id, empresa_id, numero_nota, codigo_verificacao, 
          data_emissao, valor_servicos, iss_retido, status, xml_original
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, numero_nota;
      `;

      const result = await client.query(insertQuery, [
        tenant_id,
        empresa_id,
        dadosNfse.numero_nota,
        dadosNfse.codigo_verificacao,
        dadosNfse.data_emissao,
        dadosNfse.valores.valor_servicos,
        dadosNfse.valores.iss_retido,
        'emitida',
        xmlString
      ]);

      await client.query('COMMIT');
      logger.info(`✅ NFSe Nacional ${dadosNfse.numero_nota} gravada com sucesso (Tenant: ${tenant_id})`);
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Listagem paginada de NFS-e do Tenant
   */
  async listar(tenant_id, filtros, pagina = 1, limite = 50) {
    const offset = (pagina - 1) * limite;
    const { empresa_id, data_inicio, data_fim } = filtros;
    
    let where = ` WHERE n.tenant_id = $1 `;
    const params = [tenant_id];
    let paramIndex = 2;

    if (empresa_id) {
      where += ` AND n.empresa_id = $${paramIndex} `;
      params.push(empresa_id);
      paramIndex++;
    }

    if (data_inicio && data_fim) {
      where += ` AND n.data_emissao BETWEEN $${paramIndex} AND $${paramIndex + 1} `;
      params.push(data_inicio, data_fim);
      paramIndex += 2;
    }

    const countRes = await pool.query(`SELECT COUNT(*) FROM nfse n ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const query = `
      SELECT n.id, n.numero_nota, n.valor_servicos, n.data_emissao, n.status,
             e.razao_social as empresa_nome
      FROM nfse n
      JOIN empresas e ON n.empresa_id = e.id
      ${where}
      ORDER BY n.data_emissao DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await pool.query(query, [...params, limite, offset]);

    return {
      dados: result.rows,
      metadados: { 
        total, 
        pagina, 
        total_paginas: Math.ceil(total / limite),
        limite 
      }
    };
  }

  /**
   * Detalhes da NFS-e com parse do XML
   */
  async obterDetalhes(tenant_id, id) {
    const query = `
      SELECT n.*, e.razao_social as empresa_nome, e.cnpj as empresa_cnpj
      FROM nfse n
      JOIN empresas e ON n.empresa_id = e.id
      WHERE n.id = $1 AND n.tenant_id = $2
    `;
    const res = await pool.query(query, [id, tenant_id]);
    if (res.rows.length === 0) return null;
    
    const nota = res.rows[0];
    return { 
        ...nota, 
        detalhes_nfse: nfseParser.parse(nota.xml_original) 
    };
  }
}

module.exports = new NFSeService();