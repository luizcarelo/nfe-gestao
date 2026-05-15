/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/database/setup-db.js
 * Script de inicialização do Banco de Dados PostgreSQL 18
 * Responsável por criar as tabelas, índices e regras de integridade.
 */

const path = require('path');

// Força o carregamento do .env localizando-o pelo caminho absoluto do script
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Importações utilizando caminhos relativos ao arquivo de setup
const { pool } = require('../src/config/database');
const { logger } = require('../src/infra/logger');

const schemaSQL = `
-- 1. TABELA DE EMPRESAS (Emitentes e Destinatários)
CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    cnpj VARCHAR(14) UNIQUE NOT NULL,
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
    certificado_a1_path TEXT,
    config_sefaz JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABELA DE NOTAS FISCAIS ELETRÓNICAS (NFe - Produtos)
CREATE TABLE IF NOT EXISTS nfe (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
    chave_acesso VARCHAR(44) UNIQUE NOT NULL,
    numero_nota VARCHAR(20) NOT NULL,
    serie VARCHAR(5) NOT NULL,
    data_emissao TIMESTAMP WITH TIME ZONE NOT NULL,
    tipo_operacao INTEGER, -- 0-Entrada, 1-Saída
    valor_total DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'autorizada',
    xml_original TEXT NOT NULL,
    pdf_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABELA DE NOTAS FISCAIS DE SERVIÇO (NFSe)
CREATE TABLE IF NOT EXISTS nfse (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
    numero_nota VARCHAR(20) NOT NULL,
    codigo_verificacao VARCHAR(50),
    data_emissao TIMESTAMP WITH TIME ZONE NOT NULL,
    valor_servicos DECIMAL(15,2) NOT NULL,
    iss_retido BOOLEAN DEFAULT FALSE,
    item_lista_servico VARCHAR(20),
    status VARCHAR(20) DEFAULT 'emitida',
    xml_original TEXT NOT NULL,
    pdf_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABELA DE JOBS (Processamento em Segundo Plano)
CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    nome_processo VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente',
    payload JSONB,
    resultado JSONB,
    erro_mensagem TEXT,
    tentativas INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABELA DE AUDITORIA (Logs de Sistema)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER,
    tabela_afetada VARCHAR(50),
    registro_id INTEGER,
    acao VARCHAR(20),
    dados_anteriores JSONB,
    dados_novos JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABELA DE PARCEIROS (Integração BrasilAPI)
CREATE TABLE IF NOT EXISTS parceiros (
    id SERIAL PRIMARY KEY,
    cnpj_cpf VARCHAR(14) UNIQUE NOT NULL,
    nome VARCHAR(255) NOT NULL,
    tipo_parceiro VARCHAR(50),
    situacao_cadastral VARCHAR(50),
    data_consulta_api TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ÍNDICES PARA ALTA PERFORMANCE (PostgreSQL 18)
CREATE INDEX IF NOT EXISTS idx_nfe_chave ON nfe(chave_acesso);
CREATE INDEX IF NOT EXISTS idx_nfse_empresa ON nfse(empresa_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas(cnpj);
`;

/**
 * Executa o script de migração e criação de tabelas
 */
async function runSetup() {
  try {
    // Validação preventiva antes de abrir conexão com o pool
    if (!process.env.DB_PASS || typeof process.env.DB_PASS !== 'string') {
      throw new Error('A variável de ambiente DB_PASS não está definida ou não é uma string válida no ficheiro .env');
    }

    logger.info('🐘 Conectando ao PostgreSQL 18 para execução do Setup...');
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      await client.query(schemaSQL);
      await client.query('COMMIT');
      logger.info('✅ Estrutura do Banco de Dados e Regras criadas com sucesso!');
    } catch (sqlError) {
      await client.query('ROLLBACK');
      throw sqlError;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error(`❌ Erro Fatal no Setup do Banco de Dados: ${error.message}`);
  } finally {
    // Encerra o pool de conexões graciosamente
    await pool.end();
    process.exit();
  }
}

runSetup();