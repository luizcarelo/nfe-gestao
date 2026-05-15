// Ficheiro: /home/engeradios/nfe-gestao/backend/src/modules/jobs/controller/index.js

const { pool } = require('../../../config/database');
const { logger } = require('../../../infra/logger');
const nfeService = require('../../nfe/service');
const nfseService = require('../../nfse/service');

class JobController {
  /**
   * Lista o histórico de execuções da tabela job_logs
   */
  async index(req, res) {
    try {// Ficheiro: backend/src/modules/jobs/controller/index.js

const { pool } = require('../../../config/database');
const { logger } = require('../../../infra/logger');
const jobService = require('../service');

class JobController {
  /**
   * Lista o histórico de execuções para o Monitor de Tarefas e Auditoria no Frontend
   */
  async index(req, res) {
    try {
      const { rows } = await pool.query(`
        SELECT id, job_name, status, detalhes, started_at, finished_at 
        FROM job_logs 
        ORDER BY started_at DESC LIMIT 100
      `);
      return res.json({ success: true, data: rows });
    } catch (error) {
      logger.error(`[JobController] Erro ao listar auditoria de jobs: ${error.message}`);
      return res.status(500).json({ success: false, message: 'Falha ao carregar a trilha de tarefas.' });
    }
  }

  /**
   * Endpoint acionado pelo Frontend (ou via Cron) para disparar a sincronização.
   * Utiliza o padrão Fire-and-Forget para não manter o HTTP request pendurado.
   */
  async syncAll(req, res) {
    try {
      logger.info('[JobController] Pedido de Sincronização Global recebido.');
      
      // Responder imediatamente para libertar o cliente HTTP
      res.json({ success: true, message: 'Orquestração de Sincronização Global iniciada em background. Consulte o monitor para ver o progresso.' });

      // Dispara o serviço em background (Fire and Forget)
      jobService.runSyncAll().catch(err => {
        logger.error(`[JobController] Falha crítica no background job: ${err.message}`);
      });

    } catch (error) {
      logger.error(`[JobController] Erro ao disparar job: ${error.message}`);
      if (!res.headersSent) {
          return res.status(500).json({ success: false, message: 'Falha ao iniciar orquestração de tarefas.' });
      }
    }
  }
}

module.exports = new JobController();
      const { rows } = await pool.query(
        `SELECT id, job_name, status, detalhes, started_at, finished_at 
         FROM job_logs 
         ORDER BY started_at DESC LIMIT 50`
      );
      return res.json({ success: true, data: rows });
    } catch (error) {
      logger.error(`Erro ao listar logs de jobs: ${error.message}`);
      return res.status(500).json({ success: false, message: 'Falha ao carregar monitor de tarefas.' });
    }
  }

  /**
   * Dispara manualmente a sincronização global para todas as empresas
   */
  async syncAll(req, res) {
    try {
      logger.info('[JobController] Disparando Sincronização Global Manual');
      
      // Obter todas as empresas cadastradas
      const { rows: empresas } = await pool.query('SELECT id, razao_social FROM empresas');
      
      // Responder imediatamente ao cliente (Fire and Forget) para não travar o frontend
      res.json({ success: true, message: `Sincronização global iniciada para ${empresas.length} empresas em background.` });

      // Execução em background
      for (const empresa of empresas) {
          try {
              // Sincroniza NF-e (SEFAZ)
              await nfeService.sincronizarComSefaz(empresa.id);
              // Sincroniza NFS-e (ADN Nacional)
              await nfseService.sincronizarADN(empresa.id);
          } catch (err) {
              logger.error(`[Job] Falha na sincronização automática da empresa ${empresa.razao_social}: ${err.message}`);
          }
      }
    } catch (error) {
      logger.error(`Erro ao disparar job global: ${error.message}`);
      if (!res.headersSent) {
          return res.status(500).json({ success: false, message: error.message });
      }
    }
  }
}

module.exports = new JobController();