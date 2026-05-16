/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/jobs/workers/sefaz-sync.js
 * Worker em Background para Sincronização Automática de NFe
 */
const { pool } = require('../../../config/database');
const sefazProvider = require('../../../infra/providers/sefaz-provider');
const nfeService = require('../../nfe/service');
const jobService = require('../service');
const { logger } = require('../../../infra/logger');

class SefazSyncWorker {
  
  /**
   * Executa a rotina varrendo todas as empresas SaaS que possuam Certificado A1.
   */
  async processarRotinaGlobal() {
    logger.info('🤖 [SefazSyncWorker] A iniciar rotina global de captura de XMLs...');
    
    try {
      // 1. Busca todas as empresas que têm certificado A1 configurado
      const query = `
        SELECT id, tenant_id, cnpj, razao_social, certificado_a1_pfx, certificado_senha 
        FROM empresas 
        WHERE certificado_a1_pfx IS NOT NULL
      `;
      const result = await pool.query(query);
      const empresas = result.rows;

      if (empresas.length === 0) {
          logger.info('🤖 [SefazSyncWorker] Nenhuma empresa com certificado digital encontrada. Abortando.');
          return;
      }

      logger.info(`🤖 [SefazSyncWorker] ${empresas.length} empresas elegíveis para sincronização.`);

      // 2. Itera sobre cada empresa (em produção de larga escala, isto seria enviado para uma fila como Redis/BullMQ)
      for (const empresa of empresas) {
        await this._sincronizarEmpresa(empresa);
      }

      logger.info('🤖 [SefazSyncWorker] Rotina global concluída com sucesso.');

    } catch (error) {
      logger.error(`🤖❌ [SefazSyncWorker] Erro crítico na rotina global: ${error.message}`);
    }
  }

  /**
   * Processa a sincronização de uma única empresa.
   */
  async _sincronizarEmpresa(empresa) {
    let jobId = null;
    try {
      // Registamos a intenção no Módulo de Jobs para que o cliente veja no seu Monitor!
      const job = await jobService.criarJobSincronizacao(empresa.tenant_id, empresa.id, 'sync_nfe_sefaz');
      jobId = job.id;

      logger.info(`   🔄 [Job ${jobId}] Sincronizando: ${empresa.razao_social} (CNPJ: ${empresa.cnpj})`);
      
      // Atualiza status do job
      await pool.query("UPDATE jobs SET status = 'processando', updated_at = NOW() WHERE id = $1", [jobId]);

      // 1. Chama a SEFAZ utilizando o certificado da empresa
      const xmlsBaixados = await sefazProvider.consultarNotasDestinadas(
          empresa.cnpj, 
          empresa.certificado_a1_pfx, 
          empresa.certificado_senha
      );

      let inseridasSucesso = 0;
      let duplicadasOmitidas = 0;

      // 2. Tenta inserir cada XML baixado no Módulo NFe
      for (const xmlString of xmlsBaixados) {
          try {
             await nfeService.processarUploadXML(empresa.tenant_id, empresa.id, xmlString);
             inseridasSucesso++;
          } catch (insertError) {
             if (insertError.statusCode === 409) {
                 duplicadasOmitidas++;
             } else {
                 logger.warn(`   ⚠️ Falha ao salvar uma nota da SEFAZ: ${insertError.message}`);
             }
          }
      }

      // 3. Finaliza o Job com estatísticas
      const resultado = {
          notas_baixadas: xmlsBaixados.length,
          inseridas: inseridasSucesso,
          duplicadas_ignoradas: duplicadasOmitidas,
          mensagem: xmlsBaixados.length > 0 ? 'Novas notas importadas com sucesso.' : 'Nenhuma nota nova encontrada.'
      };

      await pool.query(
        "UPDATE jobs SET status = 'concluido', resultado = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(resultado), jobId]
      );

      logger.info(`   ✅ [Job ${jobId}] Concluído. Novas: ${inseridasSucesso} | Duplicadas: ${duplicadasOmitidas}`);

    } catch (error) {
       logger.error(`   ❌ Falha na sincronização da empresa ${empresa.cnpj}: ${error.message}`);
       
       if (jobId) {
           await pool.query(
             "UPDATE jobs SET status = 'erro', erro_mensagem = $1, updated_at = NOW() WHERE id = $2",
             [error.message, jobId]
           );
       }
    }
  }
}

module.exports = new SefazSyncWorker();