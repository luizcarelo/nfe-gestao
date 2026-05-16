/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/app.js
 * Configuração do Express, Middlewares de Log e Tratamento de Erros
 */
const express = require('express');
const cors = require('cors');
const { logger } = require('./infra/logger');
const AppError = require('./shared/errors/AppError');

// Importação do Middleware de Autenticação
const authMiddleware = require('./shared/middleware/authMiddleware');

// Importação das Rotas SaaS
const authRoutes = require('./modules/auth/routes'); 
const dashboardRoutes = require('./modules/dashboard/routes');
const empresasRoutes = require('./modules/empresas/routes');
const parceirosRoutes = require('./modules/parceiros/routes');
const produtosRoutes = require('./modules/produtos/routes');
const nfeRoutes = require('./modules/nfe/routes');
const nfseRoutes = require('./modules/nfse/routes');
const jobsRoutes = require('./modules/jobs/routes');
const auditRoutes = require('./modules/audit/routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 1. MIDDLEWARE DE OBSERVABILIDADE E LOGS DE REQUISIÇÃO
app.use((req, res, next) => {
    logger.info(`[HTTP] ${req.method} ${req.url}`);
    
    // Log do Body (Evitando logar passwords)
    if (req.body && Object.keys(req.body).length > 0) {
        const bodyToLog = { ...req.body };
        if (bodyToLog.senha) bodyToLog.senha = '***OCULTA***';
        logger.info(`[HTTP Body] ${JSON.stringify(bodyToLog)}`);
    }
    next();
});

// 2. REGISTO DAS ROTAS
// A rota de Auth é pública (não leva o middleware)
app.use('/v1/auth', authRoutes); 

// As rotas abaixo são protegidas e obrigam à injeção do req.user contendo o tenant_id
app.use('/v1/dashboard', authMiddleware, dashboardRoutes);
app.use('/v1/empresas', authMiddleware, empresasRoutes);
app.use('/v1/parceiros', authMiddleware, parceirosRoutes);
app.use('/v1/produtos', authMiddleware, produtosRoutes);
app.use('/v1/nfe', authMiddleware, nfeRoutes);
app.use('/v1/nfse', authMiddleware, nfseRoutes);
app.use('/v1/jobs', authMiddleware, jobsRoutes);
app.use('/v1/audit', authMiddleware, auditRoutes);

// 3. MIDDLEWARE GLOBAL DE TRATAMENTO DE ERROS (Extremamente detalhado)
app.use((err, req, res, next) => {
    // Escreve o Stack Trace completo (a linha de código onde falhou) no log do servidor
    logger.error(`[App Error Middleware] Msg: ${err.message}`);
    if (err.stack) {
        logger.error(`[Stack Trace]\n${err.stack}`);
    }

    // Se for um Erro de Negócio (AppError lançado por nós)
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message
        });
    }

    // Se for um erro da Base de Dados ou Código quebrado (ex: null variable)
    return res.status(500).json({
        success: false,
        message: 'Ocorreu um erro interno no servidor.',
        error: err.message, // Revela a mensagem exata do DB (ex: "null value in column nome")
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
});

module.exports = app;