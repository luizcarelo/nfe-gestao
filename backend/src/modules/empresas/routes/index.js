// Ficheiro: backend/src/modules/empresas/routes/index.js

const { Router } = require('express');
const multer = require('multer');
const controller = require('../controller');

const routes = Router();

// Configuração do Multer para processar o Certificado A1 diretamente em Memória RAM.
// Impede a gravação de arquivos temporários no disco e aumenta a segurança.
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // Limite de 10MB para o certificado (.pfx ou .p12)
});

// ==========================================
// GESTÃO DE MATRIZES E CADASTRO (RFB + SEFAZ)
// ==========================================
routes.get('/', (req, res) => controller.index(req, res));

// A rota lookup aceita opcionalmente ?matrizId=xxx no query params para invocar o CCC da SEFAZ via A1
routes.get('/lookup/:cnpj', (req, res) => controller.lookup(req, res));

routes.post('/', (req, res) => controller.store(req, res));
routes.put('/:id', (req, res) => controller.update(req, res));

// ==========================================
// GESTÃO DE SEGURANÇA (CUSTÓDIA DO CERTIFICADO A1)
// ==========================================
routes.post('/:id/certificado', upload.single('certificado'), (req, res) => controller.uploadCertificado(req, res));

// ==========================================
// GESTÃO DE FILIAIS E COMPLIANCE TRIBUTÁRIO (IA)
// ==========================================
routes.get('/:matrizId/filiais', (req, res) => controller.listFiliais(req, res));
routes.post('/:matrizId/filiais', (req, res) => controller.storeFilial(req, res));

// Endpoint exclusivo que aciona o LLM (Gemini) para análise da estrutura societária Matriz-Filial
routes.get('/:matrizId/analise-ia', (req, res) => controller.analiseEstruturaIa(req, res));

module.exports = routes;