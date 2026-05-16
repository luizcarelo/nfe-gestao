/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/jobs/service/index.js
 * Serviço de Monitorização de Tarefas (Jobs) - Arquitetura SaaS
 * Inclui listagem, retry (tentar novamente), cancelamento e estatísticas.
 */
const { pool } = require('../../../config/database');
const { logger } = require('../../../infra/logger');
const AppError = require('../../../shared/errors/AppError');

class JobService {
  /**
   * Inicia um novo registo de Job e dispara a execução em background
   */
  async criarJobSincronizacao(tenant_id, empresa_id, tipo) {
    const insertQuery = `
      INSERT INTO jobs (tenant_id, nome_processo, status, payload, tentativas)
      VALUES ($1, $2, $3, $4, 0)
      RETURNING id, nome_processo, status, created_at;
    `;

    const payload = { empresa_id };
    const result = await pool.query(insertQuery, [tenant_id, tipo, 'pendente', JSON.stringify(payload)]);
    const job = result.rows[0];

    this._executarWorker(job.id, tenant_id, empresa_id, tipo);

    return job;
  }

  /**
   * Tenta executar novamente um job que falhou
   */
  async reiniciarJob(tenant_id, job_id) {
    const job = await this.obterJobPorId(tenant_id, job_id);
    
    if (!job) throw new AppError('Tarefa não encontrada.', 404);
    if (job.status === 'processando') throw new AppError('A tarefa já está em execução.', 400);
    if (job.status === 'concluido') throw new AppError('A tarefa já foi concluída com sucesso.', 400);

    // Reinicia o status e incrementa as tentativas
    await pool.query(
      `UPDATE jobs SET status = 'pendente', tentativas = tentativas + 1, erro_mensagem = NULL, updated_at = NOW() 
       WHERE id = $1 AND tenant_id = $2`,
      [job_id, tenant_id]
    );

    // Dispara o worker novamente
    this._executarWorker(job_id, tenant_id, job.payload.empresa_id, job.nome_processo);

    return { message: 'Tarefa reiniciada com sucesso. A processar em background.' };
  }

  /**
   * Cancela um job que está pendente ou bloqueado
   */
  async cancelarJob(tenant_id, job_id) {
    const job = await this.obterJobPorId(tenant_id, job_id);
    
    if (!job) throw new AppError('Tarefa não encontrada.', 404);
    if (['concluido', 'cancelado'].includes(job.status)) {
      throw new AppError(`A tarefa não pode ser cancelada porque o seu estado atual é: ${job.status}.`, 400);
    }

    await pool.query(
      `UPDATE jobs SET status = 'cancelado', erro_mensagem = 'Cancelado manualmente pelo utilizador.', updated_at = NOW() 
       WHERE id = $1 AND tenant_id = $2`,
      [job_id, tenant_id]
    );

    return { message: 'Tarefa cancelada com sucesso.' };
  }

  /**
   * Obtém estatísticas rápidas para o topo do ecrã do Monitor
   */
  async obterEstatisticas(tenant_id) {
    const query = `
      SELECT status, COUNT(*) as quantidade
      FROM jobs
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY status;
    `;
    const result = await pool.query(query, [tenant_id]);
    
    const stats = { pendente: 0, processando: 0, concluido: 0, erro: 0, cancelado: 0 };
    result.rows.forEach(row => {
      if (stats[row.status] !== undefined) {
        stats[row.status] = parseInt(row.quantidade);
      }
    });

    return stats;
  }

  async listarJobs(tenant_id, pagina, limite, status_filtro) {
    const offset = (pagina - 1) * limite;
    
    let whereClause = `WHERE tenant_id = $1`;
    const params = [tenant_id];

    if (status_filtro) {
      whereClause += ` AND status = $2`;
      params.push(status_filtro);
    }

    const countRes = await pool.query(`SELECT COUNT(*) FROM jobs ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count);

    const query = `
      SELECT id, nome_processo, status, tentativas, erro_mensagem, resultado, created_at, updated_at
      FROM jobs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const result = await pool.query(query, [...params, limite, offset]);

    return {
      dados: result.rows,
      metadados: { total, pagina, total_paginas: Math.ceil(total / limite) }
    };
  }

  async obterJobPorId(tenant_id, id) {
    const query = 'SELECT * FROM jobs WHERE id = $1 AND tenant_id = $2';
    const result = await pool.query(query, [id, tenant_id]);
    return result.rows[0] || null;
  }

  /**
   * Worker Simulado (A lógica real de integração ficará aqui)
   */
  async _executarWorker(jobId, tenant_id, empresa_id, tipo) {
    logger.info(`⚙️ [Job ${jobId}] A iniciar worker: ${tipo}`);

    try {
      await pool.query("UPDATE jobs SET status = 'processando', updated_at = NOW() WHERE id = $1", [jobId]);

      // Simulação de processamento demorado
      await new Promise(resolve => setTimeout(resolve, 3000)); 

      // 15% de probabilidade de simular uma falha na SEFAZ para testar o botão "Retry" no monitor
      if (Math.random() < 0.15) {
        throw new Error('Timeout na comunicação com os servidores da SEFAZ.');
      }

      const resultado = {
        notas_encontradas: Math.floor(Math.random() * 50),
        mensagem: "Processamento concluído."
      };

      await pool.query(
        "UPDATE jobs SET status = 'concluido', resultado = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(resultado), jobId]
      );
      logger.info(`✅ [Job ${jobId}] Concluído com sucesso.`);

    } catch (error) {
      logger.error(`❌ [Job ${jobId}] Erro: ${error.message}`);
      await pool.query(
        "UPDATE jobs SET status = 'erro', erro_mensagem = $1, updated_at = NOW() WHERE id = $2",
        [error.message, jobId]
      );
    }
  }
}

module.exports = new JobService();