/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/empresas/service/index.js
 * Serviço de Gestão de Empresas (SaaS Multi-Tenant)
 * Responsável pela validação de quotas, integração BrasilAPI e segurança de certificados.
 */
const { pool } = require('../../../config/database');
const brasilApiClient = require('../../../infra/rest/brasil-api-client');
const { logger } = require('../../../infra/logger');
const AppError = require('../../../shared/errors/AppError');

class EmpresaService {
  /**
   * Cadastra uma nova empresa validando a quota do plano SaaS e enriquecendo dados.
   */
  async cadastrar(tenant_id, dados) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const cnpjLimpo = dados.cnpj.replace(/\D/g, '');
      if (cnpjLimpo.length !== 14) throw new AppError('CNPJ inválido.', 400);

      // 1. Validação de Quota SaaS: O Tenant ainda pode cadastrar empresas?
      const tenantQuery = await client.query('SELECT max_empresas FROM tenants WHERE id = $1', [tenant_id]);
      const maxEmpresas = tenantQuery.rows[0].max_empresas;

      const contagemQuery = await client.query('SELECT COUNT(*) FROM empresas WHERE tenant_id = $1', [tenant_id]);
      const totalCadastradas = parseInt(contagemQuery.rows[0].count);

      if (totalCadastradas >= maxEmpresas) {
        throw new AppError(`Limite de plano atingido. Você pode cadastrar no máximo ${maxEmpresas} empresas.`, 403);
      }

      // 2. Validação de Duplicidade
      const existeQuery = await client.query('SELECT id FROM empresas WHERE tenant_id = $1 AND cnpj = $2', [tenant_id, cnpjLimpo]);
      if (existeQuery.rows.length > 0) {
        throw new AppError('Esta empresa (CNPJ) já está cadastrada na sua conta.', 409);
      }

      // 3. Enriquecimento Automático de Dados via BrasilAPI se a Razão Social não for enviada
      let razao_social = dados.razao_social;
      let nome_fantasia = dados.nome_fantasia;
      let cidade = dados.cidade;
      let uf = dados.uf;

      if (!razao_social) {
        try {
          const apiData = await brasilApiClient.consultarCnpj(cnpjLimpo);
          razao_social = apiData.razao_social;
          nome_fantasia = apiData.nome_fantasia || null;
          cidade = apiData.municipio;
          uf = apiData.uf;
        } catch (apiError) {
          throw new AppError('Não foi possível buscar os dados na Receita. Informe a Razão Social manualmente.', 400);
        }
      }

      // 4. Inserção Segura
      const insertQuery = `
        INSERT INTO empresas (
          tenant_id, cnpj, razao_social, nome_fantasia, 
          inscricao_estadual, inscricao_municipal, cidade, uf, email, telefone
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, cnpj, razao_social, cidade, uf;
      `;

      const values = [
        tenant_id, cnpjLimpo, razao_social, nome_fantasia,
        dados.inscricao_estadual || null, dados.inscricao_municipal || null,
        cidade || null, uf || null, dados.email || null, dados.telefone || null
      ];

      const result = await client.query(insertQuery, values);
      await client.query('COMMIT');
      
      logger.info(`🏢 Empresa ${cnpjLimpo} cadastrada com sucesso para o Tenant ${tenant_id}`);
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`[EmpresaService] Erro no cadastro: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Salva o Certificado A1 e a palavra-passe no banco de forma segura.
   * O PFX deve chegar em Base64 pelo Frontend.
   */
  async configurarCertificadoA1(tenant_id, empresa_id, pfxBase64, senha) {
    if (!pfxBase64 || !senha) {
      throw new AppError('O ficheiro do certificado (Base64) e a senha são obrigatórios.', 400);
    }

    // Valida se a empresa pertence ao Tenant
    const checkQuery = await pool.query('SELECT id FROM empresas WHERE id = $1 AND tenant_id = $2', [empresa_id, tenant_id]);
    if (checkQuery.rows.length === 0) throw new AppError('Empresa não encontrada.', 404);

    // Converte Base64 para Buffer (BYTEA no PostgreSQL)
    const certificadoBuffer = Buffer.from(pfxBase64, 'base64');

    // Nota: Em produção extrema, a 'senha' aqui deveria ser cifrada com uma Master Key local 
    // antes de ir para o banco, para que num vazamento do DB não levem o A1 e a senha limpa.
    const updateQuery = `
      UPDATE empresas 
      SET certificado_a1_pfx = $1, certificado_senha = $2, updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4
      RETURNING id, razao_social;
    `;

    const result = await pool.query(updateQuery, [certificadoBuffer, senha, empresa_id, tenant_id]);
    logger.info(`🔐 Certificado A1 configurado para a Empresa ID ${empresa_id} (Tenant ${tenant_id})`);
    
    return result.rows[0];
  }

  async listar(tenant_id) {
    const result = await pool.query(`
      SELECT id, cnpj, razao_social, nome_fantasia, cidade, uf, 
             (certificado_a1_pfx IS NOT NULL) as possui_certificado, created_at 
      FROM empresas 
      WHERE tenant_id = $1 
      ORDER BY razao_social ASC
    `, [tenant_id]);
    
    return result.rows;
  }

  async obterDetalhes(tenant_id, id) {
    const result = await pool.query(`
      SELECT id, cnpj, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal,
             cidade, uf, logradouro, numero, bairro, cep, email, telefone, config_sefaz,
             (certificado_a1_pfx IS NOT NULL) as possui_certificado
      FROM empresas 
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenant_id]);
    
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }
}

module.exports = new EmpresaService();