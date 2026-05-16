/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/audit/controller/index.js
 * Controlador de Auditoria de Sistema
 */
const auditService = require('../service');
const AppError = require('../../../shared/errors/AppError');

class AuditController {
  
  /**
   * Lista o histórico de ações dos utilizadores do Tenant.
   * Rota ideal para uma tabela no painel do Administrador (SaaS).
   */
  async listar(req, res) {
    const { tenant_id, role } = req.user;
    
    // Medida de segurança extra: Apenas admins ou auditores podem ver logs de segurança
    if (role !== 'admin' && role !== 'auditor') {
        throw new AppError('Acesso negado. Apenas administradores podem visualizar os logs de auditoria.', 403);
    }

    const { pagina = 1, limite = 50, user_id, acao, entidade, data_inicio, data_fim } = req.query;

    const filtros = { user_id, acao, entidade, data_inicio, data_fim };

    const result = await auditService.listarLogs(tenant_id, filtros, parseInt(pagina), parseInt(limite));

    return res.status(200).json({
      success: true,
      data: result.dados,
      paginacao: result.metadados
    });
  }

  /**
   * Consulta os detalhes de um log, incluindo o payload dos dados alterados.
   */
  async detalhar(req, res) {
    const { tenant_id, role } = req.user;
    const { id } = req.params;

    if (role !== 'admin' && role !== 'auditor') {
        throw new AppError('Acesso negado. Apenas administradores podem visualizar os logs de auditoria.', 403);
    }

    const log = await auditService.obterDetalhes(tenant_id, id);
    if (!log) throw new AppError('Registo de auditoria não encontrado.', 404);

    return res.status(200).json({
      success: true,
      data: log
    });
  }
}

module.exports = new AuditController();