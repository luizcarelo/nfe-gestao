/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/audit/service/index.js
 * Serviço de Auditoria de Sistema (Security Audit Logs)
 * Regista e lista as ações dos utilizadores de forma imutável e isolada por Tenant.
 */
const { pool } = require('../../../config/database');
const { logger } = require('../../../infra/logger');

class AuditService {
  /**
   * Regista uma nova ação no log de auditoria.
   * NOTA: Este método é geralmente chamado internamente por outros serviços ou middlewares,
   * e não diretamente por uma rota HTTP pública.
   */
  async registrarLog(dadosLog) {
    const { 
      tenant_id, 
      user_id, 
      acao, 
      entidade, 
      entidade_id, 
      dados_anteriores = null, 
      dados_novos = null, 
      ip_address = null 
    } = dadosLog;

    const query = `
      INSERT INTO audit_logs (
        tenant_id, user_id, acao, entidade, entidade_id, 
        dados_anteriores, dados_novos, ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id;
    `;

    const values = [
      tenant_id, 
      user_id, 
      acao, 
      entidade, 
      entidade_id, 
      dados_anteriores ? JSON.stringify(dados_anteriores) : null, 
      dados_novos ? JSON.stringify(dados_novos) : null, 
      ip_address
    ];

    try {
      await pool.query(query, values);
      // Não bloqueiaremos o fluxo principal em caso de sucesso silencioso
    } catch (error) {
      // Se falhar o registo do log, não deitamos o sistema abaixo, mas registamos criticamente
      logger.error(`[Security] Falha ao gravar log de auditoria para Tenant ${tenant_id}: ${error.message}`);
    }
  }

  /**
   * Lista os logs de auditoria do Tenant com paginação e filtros.
   */
  async listarLogs(tenant_id, filtros, pagina = 1, limite = 50) {
    const offset = (pagina - 1) * limite;
    const { user_id, acao, entidade, data_inicio, data_fim } = filtros;

    let whereClause = `WHERE a.tenant_id = $1`;
    const params = [tenant_id];
    let paramIndex = 2;

    if (user_id) {
      whereClause += ` AND a.user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }

    if (acao) {
      whereClause += ` AND a.acao = $${paramIndex}`;
      params.push(acao);
      paramIndex++;
    }

    if (entidade) {
      whereClause += ` AND a.entidade = $${paramIndex}`;
      params.push(entidade);
      paramIndex++;
    }

    if (data_inicio && data_fim) {
      whereClause += ` AND a.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(data_inicio, data_fim);
      paramIndex += 2;
    }

    // Contagem Total para Paginação
    const countRes = await pool.query(`SELECT COUNT(*) FROM audit_logs a ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count);

    // Consulta de Dados (com JOIN para obter o nome/email do utilizador)
    const query = `
      SELECT a.id, a.acao, a.entidade, a.entidade_id, a.ip_address, a.created_at,
             u.nome as utilizador_nome, u.email as utilizador_email
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
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
   * Obtém os detalhes completos de um log específico (útil para ver o JSON de "dados_anteriores" e "dados_novos")
   */
  async obterDetalhes(tenant_id, id) {
    const query = `
      SELECT a.*, u.nome as utilizador_nome, u.email as utilizador_email
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.id = $1 AND a.tenant_id = $2
    `;
    const result = await pool.query(query, [id, tenant_id]);
    return result.rows[0] || null;
  }
}

module.exports = new AuditService();