# nfe-gestao
# nfe-gestao
Com os testes E2E a passar com sucesso total e o Motor de Captura SEFAZ (Workers) integrado na arquitetura de background, a documentação do sistema precisa de ser atualizada para refletir o estado atual de produção.

Abaixo está o Blueprint Arquitetural e o Manual de Infraestrutura atualizados da plataforma SaaS.

📑 Documentação Técnica: ERP Fiscal SaaS (NFe/NFSe Gestão)
1. Visão Geral da Arquitetura (Multi-Tenant)
O sistema utiliza uma abordagem de isolamento lógico baseado em chaves (Shared Database, Separate Schemas via Tenant ID). Cada tabela do sistema possui uma chave estrangeira obrigatória para a tabela tenants, e todas as consultas SQL na camada de serviços aplicam obrigatoriamente este filtro através do contexto injetado pelo authMiddleware.

2. Diagrama de Fluxo e Componentes em Background
O sistema opera em duas frentes complementares: requisições síncronas via API REST e processos assíncronos agendados via CronManager.

API Gateway (Express): Recebe uploads de XMLs, gerencia cadastros de parceiros/empresas e expõe dados analíticos.

Cron Manager (node-cron): Acorda periodicamente (configuração padrão: de hora em hora) no fuso America/Sao_Paulo para orquestrar os Workers de captura.

SEFAZ Sync Worker: Consome os certificados binários A1 (BYTEA) armazenados criptografadamente na tabela empresas, gerencia a autenticação mútua (mTLS) e realiza o download de DFe (Documentos Fiscais Eletrônicos) destinados.

3. Estrutura de Tabelas Atualizada (PostgreSQL 18)
Abaixo estão descritas as principais modificações estruturais realizadas para garantir a flexibilidade com APIs externas (BrasilAPI e Cosmos Bluesoft):

+-----------------------------------------------------------------+
|                            tenants                              |
+-----------------------------------------------------------------+
| id (PK) | uuid | nome | documento (CNPJ) | plano | status | ... |
+-----------------------------------------------------------------+
         |
         +---------------------------------------+
         | (1:N)                                 | (1:N)
+----------------------------------+   +----------------------------------+
|            parceiros             |   |             produtos             |
+----------------------------------+   +----------------------------------+
| id (PK)                          |   | id (PK)                          |
| tenant_id (FK)                   |   | tenant_id (FK)                   |
| cnpj_cpf (Unique por Tenant)     |   | gtin (Unique por Tenant)         |
| nome                             |   | descricao                        |
| situacao_cadastral               |   | ncm                              |
| dados_completos (JSONB) <======+ |   | dados_completos (JSONB) <======+ |
+----------------------------------+   +----------------------------------+
                                 |                                      |
                                 +--- Armazenam respostas das APIs -----+
                                      externas sem perda de metadados.
Principais Colunas Fail-Safe e de Integração:
parceiros.dados_completos (JSONB): Armazena a resposta integral e tipada retornada pela BrasilAPI (incluindo QSA e CNAEs secundários).

produtos.dados_completos (JSONB): Armazena a árvore completa de dados mercadológicos obtida através da Cosmos Bluesoft API (incluindo URLs de fotos de gôndola e marcas).

4. Matriz de Endpoints da API (v1)
Módulo de Autenticação
POST /v1/auth/login - Gera o JWT estável injetando tenant_id, user_id e role no payload.

Módulo de Empresas & Certificados
POST /v1/empresas - Cadastra um novo CNPJ sob a tutela do Tenant (Gera erro 409 se duplicado).

POST /v1/empresas/:id/certificado - Realiza o upload e armazenamento binário seguro do arquivo .pfx (Base64) e senha do certificado A1.

Módulo de Documentos Fiscais (NFe / NFSe)
POST /v1/nfe/upload - Processa o XML de mercadorias, extrai os dados via NFeParser e alimenta o Dashboard.

POST /v1/nfe/:id/auditar - Roda o motor fiscal preventivo procurando discrepâncias de alíquotas ou CFOPs inválidos.

POST /v1/nfe/:id/manifestar - Registra eventos de Manifestação do Destinatário (Ciência, Confirmação) na SEFAZ.

POST /v1/nfse/upload - Parser e ingestão do padrão nacional de notas de serviço.

Módulo Analytics & Logs
GET /v1/dashboard - Consolidação de receita bruta, impostos retidos e volumetria.

GET /v1/dashboard/evolucao - Agrupamento financeiro mensal para gráficos de linha/barra.

GET /v1/audit - Trilha de auditoria imutável registrando ações críticas de usuários por IP.

5. Padrões de Resiliência e Robustez Aplicados
Fail-Safe de Enriquecimento Automático: Se as rotas de POST /v1/parceiros ou POST /v1/produtos receberem apenas a chave identificadora (cnpj ou gtin), os serviços disparam chamadas HTTP assíncronas para os providers externos para mapear os nomes comerciais. Se os webservices externos estiverem fora do ar, o sistema gera dinamicamente um placeholder (PARCEIRO CNPJ ...), garantindo que o banco de dados nunca viole restrições de integridade (NOT NULL).

Encapsulamento de Erros Assíncronos no Express: Todos os controladores utilizam arrow functions vinculadas com o bloco try/catch(error) { next(error) }. Isso elimina completamente as falhas ocultas de Unhandled Rejections no ecossistema do Node.js, fazendo com que erros de banco (como duplicidade de notas) sejam devolvidos estritamente com o código HTTP correto (409 Conflict).

6. Procedimento de Execução do Ambiente
Instalação de Dependências de Background:
Bash
npm install node-cron fast-xml-parser cors axios dotenv express pg
Inicialização da Infraestrutura:
Bash
# 1. Configurar as variáveis no .env (DB_PASS, COSMOS_TOKEN, etc)
# 2. Executar o script de criação do Banco Multi-Tenant
node database/setup-saas-db.js

# 3. Inicializar o ecossistema com monitoramento
npx nodemon src/server.js
Validação do Pipeline E2E:
Bash
node scripts/test-api.js
A documentação reflete o marco atual de engenharia do projeto. O backend está coberto, blindado e performático. Com o ambiente de testes estável, estamos prontos para a inicialização da aplicação cliente em React.