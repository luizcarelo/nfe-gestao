// Caminho completo do ficheiro: backend/src/modules/nfe/routes/index.js

import { Router } from 'express';
import { NfeController } from '../controller/index.js';

const nfeRouter = Router();
const nfeController = new NfeController();

/**
 * ============================================================================
 * MÓDULO: DOWNLOAD E IMPORTAÇÃO DE NF-E VIA API
 * Objetivo Fiscal: Garantir a imutabilidade, rastreabilidade e integridade 
 * da aquisição de documentos fiscais através do Web Service Nacional (SEFAZ).
 * ============================================================================
 */

/**
 * Rota: POST /api/nfe/sincronizar
 * Descrição: Aciona o NacionalClient para comunicar com o nfeDistDFeInteresse.
 * Descarrega os XMLs completos e encaminha para o NFeParserService para 
 * armazenamento relacional integral e imutável.
 * * Payload esperado: { "cnpj_empresa": "12345678000199", "ultimo_nsu": "1005" }
 */
nfeRouter.post('/sincronizar', nfeController.sincronizarNotasSefaz.bind(nfeController));

/**
 * Rota: GET /api/nfe/:chave_acesso
 * Descrição: Rota de apoio à auditoria fiscal. Recupera uma NF-e específica
 * (cabeçalho, itens, e impostos) já processada e armazenada no PostgreSQL.
 * * Parâmetro: chave_acesso (String de 44 posições numéricas)
 */
nfeRouter.get('/:chave_acesso', nfeController.obterNotaPorChave.bind(nfeController));

// Exporte o router para ser injetado no backend/src/app.js
export default nfeRouter;