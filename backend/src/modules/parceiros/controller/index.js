/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/parceiros/controller/index.js
 * Controlador de Parceiros com tratamento assíncrono (try/catch + next)
 */
const parceiroService = require('../service');
const AppError = require('../../../shared/errors/AppError');
const { logger } = require('../../../infra/logger');

class ParceiroController {
  async consultarCnpj(req, res, next) {
    try {
      const { cnpj } = req.params;
      const cnpjLimpo = cnpj.replace(/\D/g, '');
      
      if (cnpjLimpo.length !== 14) {
        throw new AppError('CNPJ inválido. Deve conter 14 dígitos numéricos.', 400);
      }

      const dados = await parceiroService.buscarDadosExternos(cnpjLimpo);
      return res.status(200).json({ success: true, data: dados });
    } catch (error) {
      next(error); // Envia o erro para o middleware global do app.js
    }
  }

  async cadastrar(req, res, next) {
    try {
      const { tenant_id } = req.user;
      const { cnpj } = req.body;

      if (!cnpj) throw new AppError('O campo CNPJ é obrigatório para o cadastro.', 400);

      // Passamos o body inteiro, o Serviço trata do auto-preenchimento
      const parceiro = await parceiroService.salvarParceiro(tenant_id, req.body);
      
      return res.status(201).json({
        success: true,
        message: 'Parceiro processado com sucesso.',
        data: parceiro
      });
    } catch (error) {
      next(error); // Impede o "Unhandled Rejection"
    }
  }

  async listar(req, res, next) {
    try {
      const { tenant_id } = req.user;
      const parceiros = await parceiroService.listar(tenant_id);
      return res.status(200).json({ success: true, data: parceiros });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ParceiroController();