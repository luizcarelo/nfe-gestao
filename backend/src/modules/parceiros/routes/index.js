// Ficheiro: backend/src/modules/parceiros/routes/index.js

const { Router } = require('express');
const controller = require('../controller');

const routes = Router();

routes.get('/list/:empresaId', (req, res) => controller.index(req, res));
routes.post('/sync/:empresaId', (req, res) => controller.sync(req, res));

module.exports = routes;