// Ficheiro: backend/src/modules/audit/controller/index.js

const { logger } = require('../../../infra/logger');
const auditService = require('../service');

class AuditController {
  /**
   * Endpoint para listar a trilha de auditoria.
   * Limita-se a receber o pedido HTTP e devolver a resposta formatada do Service.
   */
  async logs(req, res) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
      
      const data = await auditService.getSystemLogs(limit);
      
      return res.json({ success: true, data });
    } catch (error) {
      logger.error(`[AuditController] Erro ao processar o pedido de logs: ${error.message}`);
      return res.status(500).json({ success: false, message: 'Falha ao carregar a trilha de auditoria de conformidade.' });
    }
  }
}

module.exports = new AuditController();