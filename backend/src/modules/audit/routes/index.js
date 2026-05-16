/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/audit/routes/index.js
 * Rotas da API para visualização dos logs de Auditoria de Sistema
 */
const { Router } = require('express');
const auditController = require('../controller');

const auditRoutes = Router();

// Rota de listagem de logs (com paginação e filtros)
// Ex: GET /v1/audit?acao=DOWNLOAD_XML&entidade=NFE
auditRoutes.get('/', auditController.listar);

// Rota para detalhes completos do log (dados novos vs dados antigos)
// Ex: GET /v1/audit/123
auditRoutes.get('/:id', auditController.detalhar);

module.exports = auditRoutes;