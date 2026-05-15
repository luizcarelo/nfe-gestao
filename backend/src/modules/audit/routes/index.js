// Ficheiro: backend/src/modules/audit/routes/index.js

const { Router } = require('express');
const controller = require('../controller');

const routes = Router();

// Endpoint de leitura dos logs (Aceita '?limit=50' via Query Params)
routes.get('/logs', (req, res) => controller.logs(req, res));

module.exports = routes;