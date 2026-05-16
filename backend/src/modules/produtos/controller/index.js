/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/produtos/controller/index.js
 * Controlador de Produtos
 */
const produtoService = require('../service');
const AppError = require('../../../shared/errors/AppError');

class ProdutoController {
  async consultarGtin(req, res, next) {
    try {
      const { gtin } = req.params;
      const gtinLimpo = gtin.replace(/\D/g, '');
      
      if (![8, 12, 13, 14].includes(gtinLimpo.length)) {
        throw new AppError('GTIN inválido. Deve conter 8, 12, 13 ou 14 dígitos numéricos.', 400);
      }

      const dados = await produtoService.buscarDadosExternos(gtinLimpo);
      return res.status(200).json({ success: true, data: dados });
    } catch (error) {
      next(error);
    }
  }

  async cadastrar(req, res, next) {
    try {
      const { tenant_id } = req.user;
      const { gtin } = req.body;

      if (!gtin) throw new AppError('O campo GTIN é obrigatório.', 400);

      const produto = await produtoService.salvarProduto(tenant_id, req.body);
      
      return res.status(201).json({
        success: true,
        message: 'Produto catalogado com sucesso.',
        data: produto
      });
    } catch (error) {
      next(error);
    }
  }

  async listar(req, res, next) {
    try {
      const { tenant_id } = req.user;
      const produtos = await produtoService.listar(tenant_id);
      return res.status(200).json({ success: true, data: produtos });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProdutoController();