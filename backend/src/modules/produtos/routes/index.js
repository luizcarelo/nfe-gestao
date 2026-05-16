/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/produtos/routes/index.js
 * Rotas do Módulo de Catálogo de Produtos
 */
const { Router } = require('express');
const produtoController = require('../controller');

const produtoRoutes = Router();

// Rota para consulta externa via Cosmos Bluesoft
produtoRoutes.get('/api/gtin/:gtin', produtoController.consultarGtin);

// Listar produtos cadastrados no catálogo do Tenant
produtoRoutes.get('/', produtoController.listar);

// Cadastrar ou atualizar produto (Upsert)
produtoRoutes.post('/', produtoController.cadastrar);

module.exports = produtoRoutes;