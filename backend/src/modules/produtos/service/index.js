/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/produtos/service/index.js
 */
const { pool } = require('../../../config/database');
const cosmosClient = require('../../../infra/rest/cosmos-client');
const { logger } = require('../../../infra/logger');
const AppError = require('../../../shared/errors/AppError');

class ProdutoService {
  
  async buscarDadosExternos(gtin) {
    const rawData = await cosmosClient.consultarGtin(gtin);
    return {
      gtin: rawData.gtin,
      descricao: rawData.description?.toUpperCase(),
      ncm_codigo: rawData.ncm?.code,
      marca: rawData.brand?.name?.toUpperCase() || 'SEM MARCA',
      foto_url: rawData.thumbnail || null,
      full_payload: rawData 
    };
  }

  async salvarProduto(tenant_id, dados) {
    const gtinLimpo = dados.gtin ? String(dados.gtin).replace(/\D/g, '') : null;
    
    let descricao = dados.descricao;
    let ncm_codigo = dados.ncm_codigo || dados.ncm;
    let marca = dados.marca || 'SEM MARCA';
    let foto_url = dados.foto_url || null;
    let payloadCompleto = dados.full_payload || dados;

    if (!descricao) {
        try {
            logger.info(`🔄 Descrição não fornecida para GTIN ${gtinLimpo}. Buscando na Cosmos API...`);
            const apiData = await this.buscarDadosExternos(gtinLimpo);
            descricao = apiData.descricao;
            ncm_codigo = apiData.ncm_codigo;
            marca = apiData.marca;
            foto_url = apiData.foto_url;
            payloadCompleto = apiData.full_payload;
        } catch (error) {
            logger.warn(`⚠️ Cosmos API falhou ou GTIN não encontrado. A usar descrição de emergência.`);
        }
    }

    // 🔥 BLINDAGEM ABSOLUTA: Evita o erro 'null value in column descricao'
    const descricaoFinalSegura = descricao || `PRODUTO GTIN ${gtinLimpo}`;

    const query = `
      INSERT INTO produtos (
        tenant_id, gtin, descricao, ncm, marca, foto_url, dados_completos, data_atualizacao
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (tenant_id, gtin) 
      DO UPDATE SET 
        descricao = EXCLUDED.descricao,
        ncm = EXCLUDED.ncm,
        marca = EXCLUDED.marca,
        foto_url = EXCLUDED.foto_url,
        dados_completos = EXCLUDED.dados_completos,
        data_atualizacao = NOW()
      RETURNING *;
    `;

    try {
      const result = await pool.query(query, [
        tenant_id, gtinLimpo, descricaoFinalSegura, ncm_codigo, marca, foto_url, JSON.stringify(payloadCompleto)
      ]);
      return result.rows[0];
    } catch (error) {
      throw new AppError(`Erro na Base de Dados ao salvar produto: ${error.message}`, 500);
    }
  }

  async listar(tenant_id) {
    const result = await pool.query('SELECT * FROM produtos WHERE tenant_id = $1 ORDER BY descricao ASC', [tenant_id]);
    return result.rows;
  }
}

module.exports = new ProdutoService();