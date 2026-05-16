/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/database/setup-saas-db.js
 * Script de inicialização da Base de Dados para Arquitetura SaaS (Multi-Tenant)
 * ATENÇÃO: Este script recria a estrutura completa para o modelo SaaS.
 */

const path = require('path');
// Carregamento absoluto do .env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { pool } = require('../src/config/database');
const { logger } = require('../src/infra/logger');

const schemaSQL = `
-- Habilitar UUIDs (útil para tokens e chaves públicas SaaS)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. LIMPEZA DA ESTRUTURA ANTIGA (MIGRAÇÃO)
-- ==========================================
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS nfse CASCADE;
DROP TABLE IF EXISTS nfe CASCADE;
DROP TABLE IF EXISTS produtos CASCADE;
DROP TABLE IF EXISTS parceiros CASCADE;
DROP TABLE IF EXISTS empresas CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- ==========================================
-- 2. CRIAÇÃO DA ESTRUTURA SAAS MULTI-TENANT
-- ==========================================

-- 2.1 TENANTS (Os Clientes que assinam o seu SaaS)
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    nome VARCHAR(255) NOT NULL,
    documento VARCHAR(20) UNIQUE NOT NULL, -- CNPJ/CPF do assinante
    plano VARCHAR(50) DEFAULT 'basic', -- basic, pro, enterprise
    max_empresas INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'ativo', -- ativo, suspenso, cancelado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2.2 UTILIZADORES (Acesso ao Painel SaaS)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'operador', -- admin, auditor, operador
    status VARCHAR(20) DEFAULT 'ativo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2.3 EMPRESAS (CNPJs geridos pelo Tenant)
CREATE TABLE empresas (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    cnpj VARCHAR(14) NOT NULL,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    inscricao_estadual VARCHAR(20),
    inscricao_municipal VARCHAR(20),
    logradouro VARCHAR(255),
    numero VARCHAR(20),
    complemento VARCHAR(100),
    bairro VARCHAR(100),
    cidade VARCHAR(100),
    uf CHAR(2),
    cep VARCHAR(8),
    email VARCHAR(150),
    telefone VARCHAR(20),
    certificado_a1_pfx BYTEA, -- Certificado armazenado de forma binária (criptografado via app)
    certificado_senha VARCHAR(255), -- Senha criptografada
    config_sefaz JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, cnpj) -- Uma empresa só pode ser cadastrada 1x por cliente
);

-- 2.4 NFe (Notas de Produtos Entradas/Saídas)
CREATE TABLE nfe (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
    chave_acesso VARCHAR(44) NOT NULL,
    numero_nota VARCHAR(20) NOT NULL,
    serie VARCHAR(5) NOT NULL,
    data_emissao TIMESTAMP WITH TIME ZONE NOT NULL,
    tipo_operacao INTEGER, -- 0-Entrada, 1-Saída
    valor_total DECIMAL(15,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'autorizada',
    status_manifestacao VARCHAR(50) DEFAULT 'sem_manifestacao',
    xml_original TEXT NOT NULL,
    pdf_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, chave_acesso) -- Evita duplicação da mesma nota no mesmo tenant
);

-- 2.5 NFSe (Notas de Serviços)
CREATE TABLE nfse (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
    numero_nota VARCHAR(20) NOT NULL,
    codigo_verificacao VARCHAR(50),
    data_emissao TIMESTAMP WITH TIME ZONE NOT NULL,
    valor_servicos DECIMAL(15,2) NOT NULL,
    iss_retido BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'emitida',
    xml_original TEXT NOT NULL,
    pdf_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2.6 PARCEIROS (Fornecedores e Clientes - Integração BrasilAPI)
CREATE TABLE parceiros (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    cnpj_cpf VARCHAR(14) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    tipo_parceiro VARCHAR(50),
    situacao_cadastral VARCHAR(50),
    dados_completos JSONB, -- Armazena a resposta integral da BrasilAPI
    data_consulta_api TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, cnpj_cpf)
);

-- 2.7 PRODUTOS (Catálogo - Integração Cosmos Bluesoft)
CREATE TABLE produtos (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    gtin VARCHAR(14) NOT NULL,
    descricao VARCHAR(255) NOT NULL,
    ncm VARCHAR(20),
    marca VARCHAR(100),
    foto_url TEXT,
    dados_completos JSONB, -- Armazena a resposta integral da Cosmos
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, gtin)
);

-- 2.8 JOBS (Processamento Background SaaS)
CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    nome_processo VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente',
    payload JSONB,
    resultado JSONB,
    erro_mensagem TEXT,
    tentativas INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2.9 AUDITORIA (Logs de Segurança Rastreáveis)
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    acao VARCHAR(100) NOT NULL,
    entidade VARCHAR(50),
    entidade_id INTEGER,
    dados_anteriores JSONB,
    dados_novos JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 3. ÍNDICES DE ALTA PERFORMANCE
-- ==========================================
CREATE INDEX idx_tenant_users ON users(tenant_id);
CREATE INDEX idx_tenant_empresas ON empresas(tenant_id);
CREATE INDEX idx_tenant_nfe ON nfe(tenant_id, chave_acesso);
CREATE INDEX idx_tenant_nfse ON nfse(tenant_id, numero_nota);
CREATE INDEX idx_tenant_parceiros ON parceiros(tenant_id, cnpj_cpf);
CREATE INDEX idx_tenant_produtos ON produtos(tenant_id, gtin);
CREATE INDEX idx_jobs_status ON jobs(status);
`;

async function runSaaSDatabaseSetup() {
  try {
    if (!process.env.DB_PASS || typeof process.env.DB_PASS !== 'string') {
      throw new Error('A variável de ambiente DB_PASS não está definida no ficheiro .env');
    }

    logger.info('🏢 [SaaS] Conectando ao PostgreSQL 18 para implementação da Arquitetura Multi-Tenant...');
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      await client.query(schemaSQL);
      
      // Inserir um Tenant Administrador e Usuário padrão para testes imediatos
      const insertAdminSQL = `
        INSERT INTO tenants (nome, documento, plano) 
        VALUES ('LHSolucao SaaS Admin', '00000000000100', 'enterprise') 
        RETURNING id;
      `;
      const tenantRes = await client.query(insertAdminSQL);
      const tenantId = tenantRes.rows[0].id;

      const insertUserSQL = `
        INSERT INTO users (tenant_id, nome, email, senha_hash, role)
        VALUES ($1, 'Luiz Carelo', 'admin@lhsolucao.com', 'hash_temporario_123', 'admin');
      `;
      await client.query(insertUserSQL, [tenantId]);

      await client.query('COMMIT');
      logger.info('✅ [SaaS] Base de dados reconstruída com sucesso para Multi-Tenant!');
      logger.info('🔑 Utilizador Admin de teste criado: admin@lhsolucao.com');
      
    } catch (sqlError) {
      await client.query('ROLLBACK');
      throw sqlError;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error(`❌ Erro Fatal no Setup SaaS: ${error.message}`);
  } finally {
    await pool.end();
    process.exit();
  }
}

runSaaSDatabaseSetup();