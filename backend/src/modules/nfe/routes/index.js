/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/nfe/routes/index.js
 * Definição dos endpoints da API para Gestão de Notas Fiscais Eletrónicas (SaaS)
 * Todas as rotas assumem que o authMiddleware (com tenant_id) já foi aplicado no app.js
 */

const { Router } = require('express');
const nfeController = require('../controller');

const nfeRoutes = Router();

// Rota POST para processamento de upload manual de XML da Nota Fiscal
// Ex: POST /v1/nfe/upload
nfeRoutes.post('/upload', nfeController.uploadXml);

// Rota GET para listar as notas do Tenant com paginação e filtros
// Ex: GET /v1/nfe?pagina=1&limite=50&empresa_id=5
nfeRoutes.get('/', nfeController.listar);

// Rota GET para obter todos os detalhes de uma NFe específica
// Ex: GET /v1/nfe/123/detalhes
nfeRoutes.get('/:id/detalhes', nfeController.detalhar);

// Rota GET para descarregar o PDF (DANFE) da NFe
// Ex: GET /v1/nfe/123/danfe
nfeRoutes.get('/:id/danfe', nfeController.baixarDanfe);

// Rota POST para executar a auditoria fiscal inteligente na NFe (Oceano Azul)
// Ex: POST /v1/nfe/123/auditar
nfeRoutes.post('/:id/auditar', nfeController.auditarNota);

// Rota POST para Manifestação do Destinatário (Ciência, Desconhecimento, etc.) na SEFAZ
// Ex: POST /v1/nfe/123/manifestar
nfeRoutes.post('/:id/manifestar', nfeController.manifestar);

module.exports = nfeRoutes;