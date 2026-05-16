/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/dashboard/routes/index.js
 * Rotas da API para o Dashboard (Analytics e Métricas)
 */
const { Router } = require('express');
const dashboardController = require('../controller');

const dashboardRoutes = Router();

// Rota Principal: Resumo de faturamento, impostos e atividades
// Ex: GET /v1/dashboard/?periodo_inicio=2023-01-01&periodo_fim=2023-12-31
dashboardRoutes.get('/', dashboardController.index);

// Rota para o gráfico de evolução financeira (Faturamento por mês)
// Ex: GET /v1/dashboard/evolucao?ano=2023
dashboardRoutes.get('/evolucao', dashboardController.obterEvolucaoFinanceira);

// Rota para Alertas de Auditoria (Oceano Azul)
// Ex: GET /v1/dashboard/alertas
dashboardRoutes.get('/alertas', dashboardController.obterAlertasFiscais);

module.exports = dashboardRoutes;