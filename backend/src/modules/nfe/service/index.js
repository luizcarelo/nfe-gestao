/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/nfe/service/index.js
 * Serviço de NFe - Arquitetura SaaS Profissional
 * Responsável pela lógica de negócio: Upload, Listagem Paginada, Detalhamento e Manifestação.
 */
const nfeParser = require('../parser');
const { pool } = require('../../../config/database');
const AppError = require('../../../shared/errors/AppError');
const { logger } = require('../../../infra/logger');

class NFeService {
  
  /**
   * Processa o upload manual de um XML, efetua o parse e guarda na base de dados.
   * Garante que a empresa e a nota pertencem ao Tenant correto.
   */
  async processarUploadXML(tenant_id, empresa_id, xmlString) {
    const dadosNfe = nfeParser.parse(xmlString);
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Segurança SaaS: A empresa existe e PERTENCE a este Tenant?
      const empresaQuery = await client.query(
        'SELECT id FROM empresas WHERE id = $1 AND tenant_id = $2', 
        [empresa_id, tenant_id]
      );
      
      if (empresaQuery.rows.length === 0) {
        throw new AppError('Empresa não encontrada ou não pertence à sua conta.', 404);
      }

      // 2. Integridade SaaS: A nota já existe neste Tenant?
      const notaExistente = await client.query(
        'SELECT id FROM nfe WHERE tenant_id = $1 AND chave_acesso = $2', 
        [tenant_id, dadosNfe.chave_acesso]
      );
      
      if (notaExistente.rows.length > 0) {
        throw new AppError('Esta NFe já se encontra importada na sua base de dados.', 409);
      }

      // 3. Inserção Segura
      const insertQuery = `
        INSERT INTO nfe (
          tenant_id, empresa_id, chave_acesso, numero_nota, serie, data_emissao,
          tipo_operacao, valor_total, status, xml_original
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, chave_acesso, numero_nota;
      `;
      
      const valores = [
        tenant_id,
        empresa_id,
        dadosNfe.chave_acesso,
        dadosNfe.numero_nota,
        dadosNfe.serie,
        dadosNfe.data_emissao,
        dadosNfe.tipo_operacao,
        dadosNfe.valor_total,
        'autorizada',
        dadosNfe.xml_original
      ];

      const result = await client.query(insertQuery, valores);
      await client.query('COMMIT');
      
      logger.info(`🧾 NFe ${dadosNfe.numero_nota} importada. (Tenant: ${tenant_id}, Empresa: ${empresa_id})`);
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Lista as Notas Fiscais Eletrónicas do Tenant com suporte a paginação e filtros.
   */
  async listarNotasPorTenant(tenant_id, filtros, pagina = 1, limite = 50) {
    const offset = (pagina - 1) * limite;
    const { empresa_id, data_inicio, data_fim, tipo_operacao } = filtros;

    let queryFiltro = ` n.tenant_id = $1 `;
    const params = [tenant_id];
    let paramIndex = 2;

    if (empresa_id) {
        queryFiltro += ` AND n.empresa_id = $${paramIndex} `;
        params.push(empresa_id);
        paramIndex++;
    }

    if (data_inicio && data_fim) {
        queryFiltro += ` AND n.data_emissao BETWEEN $${paramIndex} AND $${paramIndex + 1} `;
        params.push(data_inicio, data_fim);
        paramIndex += 2;
    }

    if (tipo_operacao !== undefined) {
        queryFiltro += ` AND n.tipo_operacao = $${paramIndex} `;
        params.push(tipo_operacao);
        paramIndex++;
    }

    // Conta o total de registos para a paginação
    const countQuery = `SELECT COUNT(*) FROM nfe n WHERE ${queryFiltro}`;
    const countResult = await pool.query(countQuery, params);
    const totalRegistos = parseInt(countResult.rows[0].count);

    // Obtém os registos paginados
    const dadosQuery = `
      SELECT n.id, n.chave_acesso, n.numero_nota, n.serie, n.valor_total, 
             n.data_emissao, n.tipo_operacao, n.status, n.status_manifestacao,
             e.razao_social as empresa_nome 
      FROM nfe n
      JOIN empresas e ON n.empresa_id = e.id
      WHERE ${queryFiltro}
      ORDER BY n.data_emissao DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;
    
    // params = [tenant_id, ...filtros]
    // Cria uma nova array de parametros só para a pesquisa principal para evitar mutações indesejadas
    const queryParams = [...params, limite, offset];
    
    const result = await pool.query(dadosQuery, queryParams);

    return {
        dados: result.rows,
        metadados: {
            total_registos: totalRegistos,
            pagina_atual: pagina,
            total_paginas: Math.ceil(totalRegistos / limite),
            limite: limite
        }
    };
  }

  /**
   * Obtém os detalhes completos de uma NFe, incluindo o XML original.
   */
  async obterDetalhesNfe(tenant_id, id) {
      const query = `
          SELECT n.*, e.razao_social as empresa_nome, e.cnpj as empresa_cnpj
          FROM nfe n
          JOIN empresas e ON n.empresa_id = e.id
          WHERE n.id = $1 AND n.tenant_id = $2
      `;
      const result = await pool.query(query, [id, tenant_id]);
      
      if (result.rows.length === 0) {
          return null;
      }

      // Poderíamos usar o nfeParser.parse(result.rows[0].xml_original) aqui
      // se precisarmos de devolver os produtos detalhados em JSON para o Frontend
      const nota = result.rows[0];
      const xmlMapeado = nfeParser.parse(nota.xml_original);
      
      return {
          ...nota,
          detalhes_extraidos: xmlMapeado
      };
  }

  /**
   * Regista a Manifestação do Destinatário.
   * Por enquanto apenas guarda na base de dados. A integração real com a SEFAZ
   * ocorrerá no módulo SEFAZ Provider futuramente.
   */
  async manifestarDestinatario(tenant_id, nfe_id, tipo_manifestacao, justificativa) {
      const notaExistente = await this.obterDetalhesNfe(tenant_id, nfe_id);
      
      if (!notaExistente) {
          throw new AppError('NFe não encontrada para manifestação.', 404);
      }

      // Validação básica dos tipos permitidos
      const tiposPermitidos = ['ciencia', 'confirmacao', 'desconhecimento', 'operacao_nao_realizada'];
      if (!tiposPermitidos.includes(tipo_manifestacao)) {
          throw new AppError('Tipo de manifestação inválido.', 400);
      }

      if (tipo_manifestacao === 'operacao_nao_realizada' && !justificativa) {
           throw new AppError('A justificativa é obrigatória para operações não realizadas.', 400);
      }

      // Atualiza o status na base de dados
      const updateQuery = `
          UPDATE nfe 
          SET status_manifestacao = $1 
          WHERE id = $2 AND tenant_id = $3
          RETURNING id, chave_acesso, status_manifestacao;
      `;
      
      const result = await pool.query(updateQuery, [tipo_manifestacao, nfe_id, tenant_id]);
      
      logger.info(`Manifestação '${tipo_manifestacao}' registada para a NFe ${notaExistente.chave_acesso}.`);

      // TODO: Chamar o SefazProvider para efetuar o envio real do evento XML para a Receita.

      return result.rows[0];
  }
}

module.exports = new NFeService();