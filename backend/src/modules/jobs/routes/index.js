// Ficheiro: backend/src/modules/jobs/routes/index.js

const { Router } = require('express');
const controller = require('../controller');

const routes = Router();

// Listagem do histórico de tarefas e auditorias (Para o Canvas/Monitor)
routes.get('/', (req, res) => controller.index(req, res));

// Gatilho para orquestrar a extração em lote (NF-e, NFS-e e Parceiros)
routes.post('/sync', (req, res) => controller.syncAll(req, res));

module.exports = routes;