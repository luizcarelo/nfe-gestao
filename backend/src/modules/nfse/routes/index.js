// Ficheiro: /home/engeradios/nfe-gestao/backend/src/modules/nfse/routes/index.js

const { Router } = require('express');
const multer = require('multer');
const controller = require('../controller');

const routes = Router();
const upload = multer(); // Permite processar ficheiros na memória

/**
 * Endpoints: /v1/nfse
 */

// Monitor de Notas de Serviço
routes.get('/list/:empresaId', (req, res) => controller.index(req, res));

// Gatilho de Sincronização com o ADN
routes.post('/sync/:empresaId', (req, res) => controller.sync(req, res));

// Upload Manual de XML da NFS-e
routes.post('/import/:empresaId', upload.single('xml'), (req, res) => controller.importar(req, res));

// Download do Ficheiro XML Original
routes.get('/download/:empresaId/:chaveAcesso', (req, res) => controller.downloadXml(req, res));

// Geração e Visualização do DANFSe (PDF)
routes.get('/danfse/:empresaId/:chaveAcesso', (req, res) => controller.gerarDanfse(req, res));

module.exports = routes;