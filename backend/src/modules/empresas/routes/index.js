/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/empresas/routes/index.js
 * Rotas da API para a Gestão de Empresas do Cliente
 */
const { Router } = require('express');
const empresaController = require('../controller');

const empresaRoutes = Router();

// Listar todas as empresas do Tenant
// Ex: GET /v1/empresas
empresaRoutes.get('/', empresaController.listar);

// Cadastrar nova empresa (Valida limite de quota SaaS)
// Ex: POST /v1/empresas
empresaRoutes.post('/', empresaController.cadastrar);

// Detalhes de uma empresa específica
// Ex: GET /v1/empresas/1
empresaRoutes.get('/:id', empresaController.detalhar);

// Upload e Configuração do Certificado Digital A1
// Ex: POST /v1/empresas/1/certificado
empresaRoutes.post('/:id/certificado', empresaController.configurarCertificado);

module.exports = empresaRoutes;