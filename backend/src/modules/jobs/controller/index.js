/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/jobs/controller/index.js
 * Controlador do Monitor de Tarefas
 */
const jobService = require('../service');
const AppError = require('../../../shared/errors/AppError');

class JobController {
  
  async iniciarSincronizacao(req, res) {
    const { tenant_id } = req.user;
    const { tipo, empresa_id } = req.body;

    if (!tipo || !empresa_id) {
      throw new AppError('O tipo de sincronização e o ID da empresa são obrigatórios.', 400);
    }

    const job = await jobService.criarJobSincronizacao(tenant_id, empresa_id, tipo);

    return res.status(201).json({ success: true, message: 'Tarefa iniciada.', data: job });
  }

  async listar(req, res) {
    const { tenant_id } = req.user;
    const { pagina = 1, limite = 20, status } = req.query;

    const result = await jobService.listarJobs(tenant_id, parseInt(pagina), parseInt(limite), status);

    return res.status(200).json({
      success: true,
      data: result.dados,
      paginacao: result.metadados
    });
  }

  async consultarStatus(req, res) {
    const { tenant_id } = req.user;
    const { id } = req.params;

    const job = await jobService.obterJobPorId(tenant_id, id);
    if (!job) throw new AppError('Tarefa não encontrada.', 404);

    return res.status(200).json({ success: true, data: job });
  }

  async obterEstatisticas(req, res) {
    const { tenant_id } = req.user;
    const stats = await jobService.obterEstatisticas(tenant_id);

    return res.status(200).json({ success: true, data: stats });
  }

  async tentarNovamente(req, res) {
    const { tenant_id } = req.user;
    const { id } = req.params;

    const resultado = await jobService.reiniciarJob(tenant_id, id);
    return res.status(200).json({ success: true, message: resultado.message });
  }

  async cancelar(req, res) {
    const { tenant_id } = req.user;
    const { id } = req.params;

    const resultado = await jobService.cancelarJob(tenant_id, id);
    return res.status(200).json({ success: true, message: resultado.message });
  }
}

module.exports = new JobController();