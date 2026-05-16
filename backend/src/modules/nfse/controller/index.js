/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/nfse/controller/index.js
 * Controlador de NFS-e - Foco no Padrão Nacional
 */
const nfseService = require('../service');
const danfseGenerator = require('../service/danfse-generator');
const AppError = require('../../../shared/errors/AppError');

class NFSeController {
  
  async uploadXml(req, res) {
    const { empresa_id, xml } = req.body;
    const { tenant_id } = req.user;

    if (!empresa_id || !xml) {
      throw new AppError('Empresa e XML são obrigatórios.', 400);
    }

    const result = await nfseService.processarUploadXML(tenant_id, empresa_id, xml);

    return res.status(201).json({
      success: true,
      message: 'NFS-e Nacional processada com sucesso.',
      data: result
    });
  }

  async listar(req, res) {
    const { tenant_id } = req.user;
    const { pagina = 1, limite = 50, empresa_id, data_inicio, data_fim } = req.query;

    const filtros = { empresa_id, data_inicio, data_fim };
    const result = await nfseService.listar(tenant_id, filtros, parseInt(pagina), parseInt(limite));

    return res.status(200).json({
      success: true,
      data: result.dados,
      paginacao: result.metadados
    });
  }

  async detalhar(req, res) {
    const { id } = req.params;
    const { tenant_id } = req.user;

    const nota = await nfseService.obterDetalhes(tenant_id, id);
    if (!nota) throw new AppError('NFS-e não encontrada.', 404);

    return res.status(200).json({
      success: true,
      data: nota
    });
  }

  async baixarPdf(req, res) {
    const { id } = req.params;
    const { tenant_id } = req.user;

    const nota = await nfseService.obterDetalhes(tenant_id, id);
    if (!nota) throw new AppError('NFS-e não encontrada.', 404);

    const pdfBuffer = await danfseGenerator.gerarPdf(nota.xml_original);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=NFSe_${nota.numero_nota}.pdf`);

    return res.send(pdfBuffer);
  }
}

module.exports = new NFSeController();