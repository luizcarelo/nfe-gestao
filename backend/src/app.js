// Ficheiro: /home/engeradios/nfe-gestao/backend/src/app.js

const express = require('express');
require('express-async-errors');
const cors = require('cors');
const helmet = require('helmet');
const { errorHandler } = require('./shared/middleware/errorHandler');
const { loggerMiddleware } = require('./infra/logger');

// Importação das Rotas dos Módulos
const empresaRoutes = require('./modules/empresas/routes');
const jobRoutes = require('./modules/jobs/routes');
const nfeRoutes = require('./modules/nfe/routes');
const nfseRoutes = require('./modules/nfse/routes');
const dashboardRoutes = require('./modules/dashboard/routes'); // NOVO
const auditRoutes = require('./modules/audit/routes');         // NOVO
const parceirosRoutes = require('./modules/parceiros/routes'); // NOVO: Módulo de Parceiros

const app = express();

// Middlewares de Segurança e Log
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(loggerMiddleware);

// Rota de Health Check para monitorização
app.get('/health', (req, res) => res.json({ status: 'online' }));

/**
 * Vinculação dos Módulos sob o prefixo /v1
 */
app.use('/v1/empresas', empresaRoutes);
app.use('/v1/jobs', jobRoutes);
app.use('/v1/nfe', nfeRoutes);
app.use('/v1/nfse', nfseRoutes);
app.use('/v1/dashboard', dashboardRoutes); // NOVO
app.use('/v1/audit', auditRoutes);         // NOVO
app.use('/v1/parceiros', parceirosRoutes); // NOVO: Rotas de Parceiros (BrasilAPI)

// Tratamento de erros centralizado
app.use(errorHandler);

module.exports = app;