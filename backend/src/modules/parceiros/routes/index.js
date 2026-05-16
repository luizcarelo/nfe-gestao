/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/parceiros/routes/index.js
 * Rotas do Módulo de Parceiros (Clientes/Fornecedores)
 */
const { Router } = require('express');
const parceiroController = require('../controller');

const parceiroRoutes = Router();

// Rota solicitada para consulta externa via BrasilAPI
// Ex: GET /v1/parceiros/api/cnpj/19131243000197
parceiroRoutes.get('/api/cnpj/:cnpj', parceiroController.consultarCnpj);

// Listar parceiros cadastrados do Tenant
parceiroRoutes.get('/', parceiroController.listar);

// Cadastrar ou atualizar parceiro (Upsert)
parceiroRoutes.post('/', parceiroController.cadastrar);

module.exports = parceiroRoutes;