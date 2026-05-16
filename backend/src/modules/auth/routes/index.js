/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/auth/routes/index.js
 * Rotas públicas de Autenticação
 */
const { Router } = require('express');
const authController = require('../controller');

const authRoutes = Router();

// Rota de Login (Pública)
authRoutes.post('/login', authController.login);

module.exports = authRoutes;