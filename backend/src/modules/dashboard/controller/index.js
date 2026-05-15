// Ficheiro: /home/engeradios/nfe-gestao/backend/src/modules/dashboard/controller/index.js

const { pool } = require('../../../config/database');
const { logger } = require('../../../infra/logger');
const { XMLParser } = require('fast-xml-parser');

class DashboardController {
  async index(req, res) {
    try {
      // 1. Buscar os XMLs autorizados de NF-e para extração profunda
      const { rows: nfeRows } = await pool.query(`SELECT xml_bruto FROM documentos_fiscais WHERE status_documento != 'CANCELADA' AND xml_bruto IS NOT NULL`);
      
      const parser = new XMLParser({ ignoreAttributes: false, tagNameProcessors: [name => name.replace(/.*:/, '')] });
      
      let nfeStats = { total: 0, icms: 0, ipi: 0, pis: 0, cofins: 0, qtd: nfeRows.length };

      nfeRows.forEach(row => {
        try {
          const xml = parser.parse(row.xml_bruto);
          const infNFe = xml.nfeProc ? xml.nfeProc.NFe?.infNFe : xml.NFe?.infNFe;
          
          if (infNFe && infNFe.total && infNFe.total.ICMSTot) {
            const tot = infNFe.total.ICMSTot;
            nfeStats.total += parseFloat(tot.vNF || 0);
            nfeStats.icms += parseFloat(tot.vICMS || 0);
            nfeStats.ipi += parseFloat(tot.vIPI || 0);
            nfeStats.pis += parseFloat(tot.vPIS || 0);
            nfeStats.cofins += parseFloat(tot.vCOFINS || 0);
          }
        } catch (e) { /* Ignora falhas de parse em notas isoladas */ }
      });

      // 2. Dados da NFS-e Nacional
      const { rows: nfseRows } = await pool.query(`SELECT valor_servicos, valor_iss, valor_pis, valor_cofins, valor_inss, valor_ir, valor_csll, status_nfse FROM nfse_documentos WHERE fluxo = 'PRESTADO'`);
      
      let nfseStats = { total: 0, iss: 0, retencoes: 0, canceladas: 0, qtd: nfseRows.length };
      nfseRows.forEach(row => {
        if (row.status_nfse === 'CANCELADA') {
          nfseStats.canceladas++;
        } else {
          nfseStats.total += parseFloat(row.valor_servicos || 0);
          nfseStats.iss += parseFloat(row.valor_iss || 0);
          nfseStats.retencoes += parseFloat(row.valor_pis || 0) + parseFloat(row.valor_cofins || 0) + parseFloat(row.valor_inss || 0) + parseFloat(row.valor_ir || 0) + parseFloat(row.valor_csll || 0);
        }
      });

      // 3. Atividades Recentes
      const { rows: atividadesRes } = await pool.query(`SELECT id, job_name as tipo, status, started_at as tempo, detalhes FROM job_logs ORDER BY started_at DESC LIMIT 4`);

      const metricas = {
        receitaBruta: nfeStats.total + nfseStats.total,
        impostosDetalhados: {
          icms: nfeStats.icms,
          ipi: nfeStats.ipi,
          pis: nfeStats.pis,
          cofins: nfeStats.cofins,
          iss: nfseStats.iss,
          retencoesFederais: nfseStats.retencoes
        },
        impostosApurados: nfeStats.icms + nfeStats.pis + nfeStats.cofins + nfseStats.iss,
        notasCanceladas: nfseStats.canceladas, // Pode adicionar NFe aqui também
        totalDocs: nfeStats.qtd + nfseStats.qtd,
        atividades: atividadesRes.map(job => ({
          id: job.id, tipo: job.tipo,
          desc: job.tipo === 'SYNC_GLOBAL_FISCAL' ? 'Sincronização Global da Empresa' : `Processamento: ${job.tipo}`,
          tempo: job.tempo, status: job.status
        }))
      };

      return res.json({ success: true, data: metricas });
    } catch (error) {
      logger.error(`Erro ao carregar Dashboard Analytics: ${error.message}`);
      return res.status(500).json({ success: false, message: 'Erro interno ao processar XMLs.' });
    }
  }
}

module.exports = new DashboardController();