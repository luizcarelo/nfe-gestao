// Ficheiro: backend/src/modules/empresas/controller/index.js

const { logger } = require('../../../infra/logger');
const empresaService = require('../service');

class EmpresaController {
  async index(req, res) {
    try {
      const data = await empresaService.listMatrizes();
      return res.json({ success: true, data });
    } catch (error) {
      logger.error(`[EmpresaController] Erro ao listar empresas: ${error.message}`);
      return res.status(500).json({ success: false, message: 'Erro interno ao listar entidades.' });
    }
  }

  async lookup(req, res) {
    try {
      // Recebe o matrizId via Query Params para validar a IE no CCC caso exista um A1
      const matrizId = req.query.matrizId || null;
      const data = await empresaService.lookupCnpj(req.params.cnpj, matrizId);
      return res.json({ success: true, data });
    } catch (error) {
      logger.error(`[EmpresaController] Erro no lookup: ${error.message}`);
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  async store(req, res) {
    try {
      const result = await empresaService.createMatriz(req.body);
      return res.json({ success: true, data: result, message: 'Empresa Matriz cadastrada com sucesso.' });
    } catch (error) {
      logger.error(`[EmpresaController] Erro na criação: ${error.message}`);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async update(req, res) {
    try {
      const result = await empresaService.updateEmpresa(req.params.id, req.body);
      return res.json({ success: true, data: result, message: 'Dados da empresa atualizados com sucesso.' });
    } catch (error) {
      logger.error(`[EmpresaController] Erro na edição: ${error.message}`);
      return res.status(500).json({ success: false, message: 'Falha ao atualizar dados da entidade.' });
    }
  }

  async uploadCertificado(req, res) {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'Ficheiro do certificado não fornecido.' });
      
      const { senha } = req.body;
      if (!senha) return res.status(400).json({ success: false, message: 'A senha do certificado é obrigatória.' });

      const result = await empresaService.saveCertificado(req.params.id, req.file.buffer, senha);
      return res.json({ success: true, data: result, message: 'Certificado guardado em custódia segura.' });
    } catch (error) {
      logger.error(`[EmpresaController] Erro no certificado: ${error.message}`);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async listFiliais(req, res) {
    try {
      const data = await empresaService.listFiliais(req.params.matrizId);
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async storeFilial(req, res) {
    try {
      const result = await empresaService.createFilial(req.params.matrizId, req.body.cnpj);
      return res.json({ success: true, data: result, message: 'Filial vinculada à Matriz com sucesso.' });
    } catch (error) {
      logger.error(`[EmpresaController] Erro ao cadastrar filial: ${error.message}`);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async analiseEstruturaIa(req, res) {
    try {
       const analise = await empresaService.analiseEstruturaIa(req.params.matrizId);
       return res.json({ success: true, data: analise });
    } catch (error) {
       logger.error(`[EmpresaController] Erro na análise IA: ${error.message}`);
       return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new EmpresaController();