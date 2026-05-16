/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/jobs/routes/index.js
 * Rotas da API para o Monitor de Tarefas (Jobs)
 */
const { Router } = require('express');
const jobController = require('../controller');

const jobRoutes = Router();

// Estatísticas globais para o topo da página do monitor
// GET /v1/jobs/stats
jobRoutes.get('/stats', jobController.obterEstatisticas);

// Inicia um novo job
// POST /v1/jobs/sync
jobRoutes.post('/sync', jobController.iniciarSincronizacao);

// Lista histórico com filtros opcionais (ex: ?status=erro)
// GET /v1/jobs/
jobRoutes.get('/', jobController.listar);

// Consulta status específico
// GET /v1/jobs/:id
jobRoutes.get('/:id', jobController.consultarStatus);

// Tenta executar novamente uma tarefa que falhou (Retry)
// POST /v1/jobs/:id/retry
jobRoutes.post('/:id/retry', jobController.tentarNovamente);

// Cancela uma tarefa
// POST /v1/jobs/:id/cancel
jobRoutes.post('/:id/cancel', jobController.cancelar);

module.exports = jobRoutes;