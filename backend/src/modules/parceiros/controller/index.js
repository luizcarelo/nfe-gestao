// Ficheiro: backend/src/modules/parceiros/controller/index.js

const service = require('../service');
const { logger } = require('../../../infra/logger');

class ParceirosController {
  async index(req, res) {
    try {
      const data = await service.listParceiros(req.params.empresaId);
      return res.json({ success: true, data });
    } catch (e) {
      logger.error(`Erro ao listar parceiros: ${e.message}`);
      return res.status(500).json({ success: false, message: e.message });
    }
  }
  
  async sync(req, res) {
    try {
      // Inicia a varredura em lote via XMLs -> BrasilAPI
      const result = await service.syncFromXmls(req.params.empresaId);
      return res.json({ 
        success: true, 
        data: result, 
        message: `Auditoria e Pré-Cadastro concluídos: ${result.novos} novos parceiros detetados e avaliados.` 
      });
    } catch (e) {
      logger.error(`Erro na sincronização de parceiros: ${e.message}`);
      return res.status(500).json({ success: false, message: e.message });
    }
  }
}

module.exports = new ParceirosController();