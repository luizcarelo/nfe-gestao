// Ficheiro: /home/engeradios/nfe-gestao/backend/src/modules/nfse/controller/index.js

const { pool } = require('../../../config/database');
const { logger } = require('../../../infra/logger');
const nfseService = require('../service');

class NfseController {
  async index(req, res) {
    const { empresaId } = req.params;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM nfse_documentos WHERE empresa_id = $1 ORDER BY data_emissao DESC LIMIT 300',
        [empresaId]
      );

      // Separar as Notas dos Eventos
      const notas = rows.filter(r => r.tipo_documento === 'NFSE');
      const eventos = rows.filter(r => r.tipo_documento === 'EVENTO');

      // Vincular eventos à nota correspondente e categorizar
      const prestadas = [];
      const tomadas = [];
      let canceladasCount = 0;

      const notasOrganizadas = notas.map(nota => {
        // O evento possui a chave da nota no seu próprio ID
        const eventosVinculados = eventos.filter(e => e.chave_acesso.includes(nota.chave_acesso));
        
        const notaCompleta = { ...nota, eventos: eventosVinculados };
        
        if (nota.status_nfse === 'CANCELADA') canceladasCount++;
        if (nota.fluxo === 'PRESTADO') prestadas.push(notaCompleta);
        else tomadas.push(notaCompleta);

        return notaCompleta;
      });

      return res.json({ 
        success: true, 
        data: notasOrganizadas,
        resumo: {
          total_emitidas: prestadas.length,
          total_recebidas: tomadas.length,
          alertas_cancelamento: canceladasCount,
          eventos_processados: eventos.length
        }
      });
    } catch (error) {
      logger.error(`Erro ao listar NFS-e: ${error.message}`);
      return res.status(500).json({ success: false, message: 'Erro ao listar documentos.' });
    }
  }

  async sync(req, res) {
    const { empresaId } = req.params;
    try {
      const resultado = await nfseService.sincronizarADN(empresaId);
      return res.json({ success: true, data: resultado });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  }

  async importar(req, res) {
    const { empresaId } = req.params;
    const file = req.file;

    if (!file) return res.status(400).json({ success: false, message: 'Nenhum ficheiro XML fornecido.' });

    try {
      logger.info(`Recebido upload de XML NFS-e para empresa: ${empresaId}`);
      const resultado = await nfseService.importarXmlManual(empresaId, file.buffer);
      return res.json(resultado);
    } catch (error) {
      logger.error(`Erro na importação manual: ${error.message}`);
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  }

  async downloadXml(req, res) {
    const { empresaId, chaveAcesso } = req.params;
    try {
      const { rows } = await pool.query('SELECT xml_bruto FROM nfse_documentos WHERE empresa_id = $1 AND chave_acesso = $2', [empresaId, chaveAcesso]);
      if (rows.length === 0 || !rows[0].xml_bruto) return res.status(404).json({ success: false, message: 'XML não encontrado.' });

      res.header('Content-Disposition', `attachment; filename="NFSE_${chaveAcesso}.xml"`);
      res.header('Content-Type', 'application/xml');
      return res.send(rows[0].xml_bruto);
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Falha interna ao baixar XML.' });
    }
  }

  async gerarDanfse(req, res) {
    const { empresaId, chaveAcesso } = req.params;
    try {
      const { rows } = await pool.query('SELECT xml_bruto FROM nfse_documentos WHERE empresa_id = $1 AND chave_acesso = $2', [empresaId, chaveAcesso]);
      if (rows.length === 0 || !rows[0].xml_bruto) return res.status(404).json({ success: false, message: 'Documento não encontrado.' });

      res.header('Content-Type', 'application/xml');
      return res.send(rows[0].xml_bruto);
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Falha ao processar o documento visual.' });
    }
  }
}

module.exports = new NfseController();