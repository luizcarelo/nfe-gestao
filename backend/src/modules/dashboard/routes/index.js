// Ficheiro: /home/engeradios/nfe-gestao/backend/src/modules/dashboard/routes/index.js

const { Router } = require('express');
const controller = require('../controller');

const routes = Router();

routes.get('/', (req, res) => controller.index(req, res));

module.exports = routes;