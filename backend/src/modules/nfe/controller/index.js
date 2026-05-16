/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/nfe/controller/index.js
 * Controlador de NFe com tratamento assíncrono (try/catch + next) e contexto seguro.
 */
const nfeService = require('../service');
const auditoriaFiscalService = require('../service/auditoria-fiscal'); 
const danfeGeneratorService = require('../service/danfe-generator');
const AppError = require('../../../shared/errors/AppError');

class NFeController {
  
  // Usamos Arrow Functions para garantir que o 'this' nunca se perde
  // quando passado como callback para as rotas do Express.
  uploadXml = async (req, res, next) => {
    try {
      const { empresa_id, xml } = req.body;
      const { tenant_id } = req.user;

      if (!empresa_id || !xml) {
        throw new AppError('Os parâmetros "empresa_id" e "xml" são obrigatórios.', 400);
      }

      const result = await nfeService.processarUploadXML(tenant_id, empresa_id, xml);

      return res.status(201).json({
        success: true,
        message: 'NFe importada e processada com sucesso.',
        data: result
      });
    } catch (error) {
      next(error); // Encaminha o erro para o Middleware Global
    }
  };

  listar = async (req, res, next) => {
    try {
      const { tenant_id } = req.user;
      const { pagina = 1, limite = 50, empresa_id, data_inicio, data_fim, tipo_operacao } = req.query;
      
      const filtros = { empresa_id, data_inicio, data_fim, tipo_operacao };

      const notas = await nfeService.listarNotasPorTenant(tenant_id, filtros, parseInt(pagina), parseInt(limite));

      return res.status(200).json({
        success: true,
        data: notas.dados,
        paginacao: notas.metadados
      });
    } catch (error) {
      next(error);
    }
  };

  detalhar = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.user;

      const notaDetalhada = await nfeService.obterDetalhesNfe(tenant_id, id);

      if (!notaDetalhada) {
          throw new AppError('NFe não encontrada ou sem permissão de acesso.', 404);
      }

      return res.status(200).json({
        success: true,
        data: notaDetalhada
      });
    } catch (error) {
      next(error);
    }
  };

  baixarDanfe = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.user;

      const nota = await nfeService.obterDetalhesNfe(tenant_id, id);
      
      if (!nota || !nota.xml_original) {
          throw new AppError('XML original não encontrado para gerar o DANFE.', 404);
      }

      const pdfBuffer = await danfeGeneratorService.gerarPdf(nota.xml_original);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=DANFE_${nota.chave_acesso}.pdf`);

      return res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  };

  auditarNota = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.user;

      const nota = await nfeService.obterDetalhesNfe(tenant_id, id);
      
      if (!nota) {
          throw new AppError('NFe não encontrada.', 404);
      }

      const relatorioAuditoria = await auditoriaFiscalService.analisar(nota.xml_original);

      return res.status(200).json({
          success: true,
          message: 'Auditoria concluída.',
          data: relatorioAuditoria
      });
    } catch (error) {
      next(error);
    }
  };

  manifestar = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { tipo_manifestacao, justificativa } = req.body;
      const { tenant_id } = req.user;

      if (!tipo_manifestacao) {
          throw new AppError('O tipo de manifestação é obrigatório.', 400);
      }

      const resultado = await nfeService.manifestarDestinatario(tenant_id, id, tipo_manifestacao, justificativa);

      return res.status(200).json({
          success: true,
          message: 'Manifestação registada com sucesso na SEFAZ.',
          data: resultado
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new NFeController();