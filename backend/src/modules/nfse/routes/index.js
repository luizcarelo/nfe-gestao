/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/nfse/routes/index.js
 * Rotas para o Módulo de NFS-e Nacional
 */
const { Router } = require('express');
const nfseController = require('../controller');

const nfseRoutes = Router();

// Rota de Upload de XML (Portal Nacional)
nfseRoutes.post('/upload', nfseController.uploadXml);

// Rota de Listagem
nfseRoutes.get('/', nfseController.listar);

// Detalhes da Nota
nfseRoutes.get('/:id/detalhes', nfseController.detalhar);

// Download do PDF (DANFSe)
nfseRoutes.get('/:id/pdf', nfseController.baixarPdf);

module.exports = nfseRoutes;