// Ficheiro: backend/src/modules/audit/service/index.js

const { pool } = require('../../../config/database');
const { logger } = require('../../../infra/logger');

class AuditService {
  /**
   * Recupera a trilha de auditoria sistémica a partir dos logs de orquestração.
   * Transforma os dados brutos num formato de Compliance para o Frontend.
   */
  async getSystemLogs(limit = 100) {
    try {
      const { rows } = await pool.query(`
        SELECT 
          id, 
          started_at as date, 
          CASE 
            WHEN job_name = 'SYNC_GLOBAL_FISCAL' THEN 'Sincronização Fiscal Distribuída'
            ELSE 'Tarefa Automática: ' || job_name 
          END as action, 
          'Orquestrador Backend' as user, 
          'internal-network' as ip,
          status,
          detalhes
        FROM job_logs 
        ORDER BY started_at DESC 
        LIMIT $1
      `, [limit]);
      
      return rows;
    } catch (error) {
      logger.error(`[AuditService] Falha ao recuperar logs do banco de dados: ${error.message}`);
      throw error;
    }
  }

  /**
   * MÉTODO STUB: Preparado para futura implementação de Autenticação (JWT).
   * Registará quem fez o quê, quando e de onde (Event Sourcing).
   */
  async registerUserAction(action, userEmail, ipAddress, details = {}) {
    logger.info(`[AUDIT] Ação: ${action} | Utilizador: ${userEmail} | IP: ${ipAddress}`);
    // Futura inserção numa tabela 'audit_events'
    // await pool.query('INSERT INTO audit_events (action, user_email, ip, details) VALUES ($1, $2, $3, $4)', [...]);
  }
}

module.exports = new AuditService();