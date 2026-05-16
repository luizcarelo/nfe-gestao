/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/parceiros/service/index.js
 * Serviço de Parceiros 100% blindado contra valores nulos na Base de Dados.
 */
const { pool } = require('../../../config/database');
const brasilApiClient = require('../../../infra/rest/brasil-api-client');
const { logger } = require('../../../infra/logger');
const AppError = require('../../../shared/errors/AppError');

class ParceiroService {
  
  async buscarDadosExternos(cnpj) {
    const rawData = await brasilApiClient.consultarCnpj(cnpj);
    return {
      cnpj: rawData.cnpj,
      razao_social: rawData.razao_social ? rawData.razao_social.toUpperCase() : null,
      nome_fantasia: rawData.nome_fantasia ? rawData.nome_fantasia.toUpperCase() : null,
      situacao: rawData.descricao_situacao_cadastral || 'ATIVA',
      logradouro: rawData.descricao_tipo_de_logradouro ? `${rawData.descricao_tipo_de_logradouro} ${rawData.logradouro}` : rawData.logradouro,
      numero: rawData.numero,
      municipio: rawData.municipio,
      uf: rawData.uf,
      email: rawData.email ? rawData.email.toLowerCase() : null,
      full_payload: rawData
    };
  }

  async salvarParceiro(tenant_id, dados) {
    const cnpjLimpo = dados.cnpj ? String(dados.cnpj).replace(/\D/g, '') : null;
    if (!cnpjLimpo) throw new AppError('CNPJ é obrigatório para salvar o parceiro.', 400);

    let nome = dados.razao_social || dados.nome;
    let situacao = dados.situacao || dados.situacao_cadastral || 'ATIVA';
    let payloadCompleto = dados.full_payload || dados;

    if (!nome) {
       try {
           logger.info(`🔄 Nome não fornecido para CNPJ ${cnpjLimpo}. Buscando na BrasilAPI...`);
           const apiData = await this.buscarDadosExternos(cnpjLimpo);
           nome = apiData.razao_social || apiData.nome_fantasia;
           situacao = apiData.situacao;
           payloadCompleto = apiData.full_payload;
       } catch (error) {
           logger.warn(`⚠️ BrasilAPI indisponível ou CNPJ não encontrado. A usar nome de emergência.`);
       }
    }

    // 🔥 BLINDAGEM ABSOLUTA: Se a API falhar, o nome não fica NULO.
    const nomeFinalSeguro = nome || `PARCEIRO ${cnpjLimpo}`;

    const query = `
      INSERT INTO parceiros (
        tenant_id, cnpj_cpf, nome, situacao_cadastral, dados_completos, data_consulta_api
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (tenant_id, cnpj_cpf) 
      DO UPDATE SET 
        nome = EXCLUDED.nome,
        situacao_cadastral = EXCLUDED.situacao_cadastral,
        dados_completos = EXCLUDED.dados_completos,
        data_consulta_api = NOW()
      RETURNING *;
    `;

    try {
      const result = await pool.query(query, [
        tenant_id, 
        cnpjLimpo, 
        nomeFinalSeguro, 
        situacao,
        JSON.stringify(payloadCompleto)
      ]);
      return result.rows[0];
    } catch (error) {
      throw new AppError(`Erro na Base de Dados ao salvar parceiro: ${error.message}`, 500);
    }
  }

  async listar(tenant_id) {
    const result = await pool.query('SELECT * FROM parceiros WHERE tenant_id = $1 ORDER BY nome ASC', [tenant_id]);
    return result.rows;
  }
}

module.exports = new ParceiroService();