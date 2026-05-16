/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/empresas/controller/index.js
 * Controlador de Gestão de Empresas com tratamento assíncrono (try/catch + next)
 */
const empresaService = require('../service');
const AppError = require('../../../shared/errors/AppError');

class EmpresaController {
  
  async cadastrar(req, res, next) {
    try {
      const { tenant_id } = req.user;
      const { cnpj } = req.body;

      if (!cnpj) throw new AppError('O CNPJ é obrigatório para cadastrar a empresa.', 400);

      const empresa = await empresaService.cadastrar(tenant_id, req.body);

      return res.status(201).json({
        success: true,
        message: 'Empresa cadastrada com sucesso.',
        data: empresa
      });
    } catch (error) {
      next(error); // Permite que o erro 409 chegue ao nosso middleware global e ao script de teste
    }
  }

  async listar(req, res, next) {
    try {
      const { tenant_id } = req.user;
      const empresas = await empresaService.listar(tenant_id);

      return res.status(200).json({
        success: true,
        data: empresas
      });
    } catch (error) {
      next(error);
    }
  }

  async detalhar(req, res, next) {
    try {
      const { tenant_id } = req.user;
      const { id } = req.params;

      const empresa = await empresaService.obterDetalhes(tenant_id, id);
      if (!empresa) throw new AppError('Empresa não encontrada.', 404);

      return res.status(200).json({
        success: true,
        data: empresa
      });
    } catch (error) {
      next(error);
    }
  }

  async configurarCertificado(req, res, next) {
    try {
      const { tenant_id } = req.user;
      const { id } = req.params;
      const { arquivo_pfx_base64, senha } = req.body;

      if (!arquivo_pfx_base64 || !senha) {
          throw new AppError('O arquivo do certificado (Base64) e a senha são obrigatórios.', 400);
      }

      await empresaService.configurarCertificadoA1(tenant_id, id, arquivo_pfx_base64, senha);

      return res.status(200).json({
        success: true,
        message: 'Certificado digital importado e configurado com segurança.'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EmpresaController();