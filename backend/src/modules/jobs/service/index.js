// Ficheiro: backend/src/modules/jobs/service/index.js

const { pool } = require('../../../config/database');
const { logger } = require('../../../infra/logger');
const nfeService = require('../../nfe/service');
const nfseService = require('../../nfse/service');
const parceirosService = require('../../parceiros/service');

class JobService {
  /**
   * Executa a sincronização global de todas as empresas com certificado ativo.
   * Orquestra a busca na SEFAZ (NF-e), no ADN (NFS-e) e atualiza os Parceiros de Negócio.
   */
  async runSyncAll() {
    logger.info('[JobService] Iniciando orquestração global de sincronização fiscal (SYNC_GLOBAL_FISCAL).');
    
    const jobId = await this._startLog('SYNC_GLOBAL_FISCAL');
    const resultados = { nfe_salvas: 0, nfse_salvas: 0, parceiros_novos: 0, erros: [] };

    try {
      // Busca todas as empresas matrizes que possuem certificados ativos
      const { rows: empresas } = await pool.query(`
        SELECT e.id, e.cnpj, e.razao_social 
        FROM empresas e 
        JOIN certificados c ON c.empresa_id = e.id 
        WHERE c.ativo = true AND e.is_filial = false
      `);

      if (empresas.length === 0) {
        logger.info('[JobService] Nenhuma empresa com certificado ativo encontrada para sincronização.');
        await this._finishLog(jobId, 'SUCCESS', { mensagem: 'Nenhum certificado ativo localizado.' });
        return resultados;
      }

      for (const empresa of empresas) {
        logger.info(`[JobService] A processar entidade: ${empresa.razao_social} (${empresa.cnpj})`);
        
        // 1. Sincronização de NF-e (Mercadorias / SEFAZ)
        try {
          const resNFe = await nfeService.sincronizarComSefaz(empresa.id);
          resultados.nfe_salvas += (resNFe.docs || 0);
        } catch (err) {
          logger.error(`[JobService] Erro NF-e na empresa ${empresa.cnpj}: ${err.message}`);
          resultados.erros.push({ modulo: 'NFE', empresa: empresa.razao_social, erro: err.message });
        }

        // 2. Sincronização de NFS-e (Serviços / ADN Nacional)
        try {
          const resNFSe = await nfseService.sincronizarADN(empresa.id);
          resultados.nfse_salvas += (resNFSe.count || 0);
        } catch (err) {
          logger.error(`[JobService] Erro NFS-e na empresa ${empresa.cnpj}: ${err.message}`);
          resultados.erros.push({ modulo: 'NFSE', empresa: empresa.razao_social, erro: err.message });
        }

        // 3. Extração e Auditoria de Parceiros (Clientes/Fornecedores) via BrasilAPI
        try {
          const resParceiros = await parceirosService.syncFromXmls(empresa.id);
          resultados.parceiros_novos += (resParceiros.novos || 0);
        } catch (err) {
          logger.error(`[JobService] Erro de Parceiros na empresa ${empresa.cnpj}: ${err.message}`);
          resultados.erros.push({ modulo: 'PARCEIROS', empresa: empresa.razao_social, erro: err.message });
        }
      }

      const statusFinal = resultados.erros.length > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
      await this._finishLog(jobId, statusFinal, resultados);
      
      logger.info(`[JobService] Orquestração global concluída. NF-e: ${resultados.nfe_salvas} | NFS-e: ${resultados.nfse_salvas} | Parceiros: ${resultados.parceiros_novos}`);
      
      return resultados;

    } catch (error) {
      logger.error(`[JobService] ❌ Erro FATAL no orquestrador: ${error.message}`);
      await this._finishLog(jobId, 'FAILED', { erro_fatal: error.message, stack: error.stack });
      throw error;
    }
  }

  async _startLog(name) {
    try {
      const res = await pool.query(
        'INSERT INTO job_logs (job_name, status) VALUES ($1, $2) RETURNING id',
        [name, 'RUNNING']
      );
      return res.rows[0].id;
    } catch (err) {
      logger.error(`[JobService] Falha ao iniciar log de auditoria: ${err.message}`);
      return null; 
    }
  }

  async _finishLog(id, status, detalhes) {
    if (!id) return;
    try {
      await pool.query(
        'UPDATE job_logs SET status = $1, detalhes = $2, finished_at = CURRENT_TIMESTAMP WHERE id = $3',
        [status, JSON.stringify(detalhes), id]
      );
    } catch (err) {
      logger.error(`[JobService] Falha ao concluir log de auditoria: ${err.message}`);
    }
  }
}

module.exports = new JobService();