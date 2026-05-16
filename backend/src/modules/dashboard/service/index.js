/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/dashboard/service/index.js
 * Serviço do Dashboard - Lógica de Agregação e Inteligência SaaS
 */
const { pool } = require('../../../config/database');
const { logger } = require('../../../infra/logger');

class DashboardService {
  
  /**
   * Agrega os totais financeiros e de documentos diretamente na base de dados.
   * Evita o parse de XMLs em tempo real para garantir alta performance.
   */
  async obterMetricasCompletas(tenant_id, filtros) {
    const { periodo_inicio, periodo_fim, empresa_id } = filtros;
    
    // Parâmetros base da query
    const params = [tenant_id];
    let queryFiltro = ` tenant_id = $1 `;
    let paramIndex = 2;

    if (empresa_id) {
        queryFiltro += ` AND empresa_id = $${paramIndex} `;
        params.push(empresa_id);
        paramIndex++;
    }
    
    if (periodo_inicio && periodo_fim) {
        queryFiltro += ` AND data_emissao BETWEEN $${paramIndex} AND $${paramIndex + 1} `;
        params.push(periodo_inicio, periodo_fim);
        paramIndex += 2;
    }

    try {
        // 1. Agregação NFe (Produtos)
        const nfeQuery = `
            SELECT 
                COUNT(*) as qtd_nfe,
                COALESCE(SUM(valor_total), 0) as total_nfe,
                COUNT(*) FILTER (WHERE status = 'cancelada') as canceladas_nfe
            FROM nfe 
            WHERE ${queryFiltro} AND tipo_operacao = 1 -- Assumindo 1 para Saídas/Faturamento
        `;
        const nfeResult = await pool.query(nfeQuery, params);
        const statsNfe = nfeResult.rows[0];

        // 2. Agregação NFSe (Serviços)
        const nfseQuery = `
            SELECT 
                COUNT(*) as qtd_nfse,
                COALESCE(SUM(valor_servicos), 0) as total_nfse,
                COUNT(*) FILTER (WHERE status = 'cancelada') as canceladas_nfse
            FROM nfse 
            WHERE ${queryFiltro}
        `;
        const nfseResult = await pool.query(nfseQuery, params);
        const statsNfse = nfseResult.rows[0];

        // 3. Busca das Últimas Atividades (Jobs em Background)
        const jobsQuery = `
            SELECT id, nome_processo as tipo, status, created_at as tempo 
            FROM jobs 
            WHERE tenant_id = $1 
            ORDER BY created_at DESC 
            LIMIT 5
        `;
        const jobsResult = await pool.query(jobsQuery, [tenant_id]);

        // Nota Arquitetural: Para impostos detalhados exatos (ICMS, PIS), o ideal é que na fase
        // de importação do XML (NFeService), esses valores sejam extraídos e salvos em colunas 
        // ou num campo JSONB. Por agora, usamos estimativas/totais baseados nas somas reais.
        const totalReceita = parseFloat(statsNfe.total_nfe) + parseFloat(statsNfse.total_nfse);

        return {
            receitaBruta: totalReceita,
            impostosDetalhados: {
                icms: totalReceita * 0.18, // Placeholder: Deverá vir da extração profunda no upload
                iss: parseFloat(statsNfse.total_nfse) * 0.05, // Exemplo: 5% de ISS retido
                ipi: 0,
                pis: 0,
                cofins: 0,
                retencoesFederais: 0
            },
            impostosApurados: (totalReceita * 0.18) + (parseFloat(statsNfse.total_nfse) * 0.05),
            notasCanceladas: parseInt(statsNfe.canceladas_nfe) + parseInt(statsNfse.canceladas_nfse),
            totalDocs: parseInt(statsNfe.qtd_nfe) + parseInt(statsNfse.qtd_nfse),
            atividades: jobsResult.rows.map(job => ({
                id: job.id,
                tipo: job.tipo,
                desc: `Processamento: ${job.tipo}`,
                tempo: job.tempo,
                status: job.status
            }))
        };
    } catch (error) {
        logger.error(`Erro ao gerar métricas do Dashboard (Tenant: ${tenant_id}): ${error.message}`);
        throw error;
    }
  }

  /**
   * Gera dados agrupados por mês para os gráficos do Frontend.
   */
  async gerarEvolucaoFinanceira(tenant_id, ano, empresa_id) {
      let queryFiltroNfe = ` tenant_id = $1 AND EXTRACT(YEAR FROM data_emissao) = $2 AND tipo_operacao = 1 `;
      let queryFiltroNfse = ` tenant_id = $1 AND EXTRACT(YEAR FROM data_emissao) = $2 `;
      const params = [tenant_id, ano];

      if (empresa_id) {
          queryFiltroNfe += ` AND empresa_id = $3 `;
          queryFiltroNfse += ` AND empresa_id = $3 `;
          params.push(empresa_id);
      }

      // Consulta avançada: Agrupa faturamento por mês combinando NFe e NFSe
      const query = `
          WITH faturamento_mensal AS (
              SELECT EXTRACT(MONTH FROM data_emissao) as mes, COALESCE(SUM(valor_total), 0) as valor
              FROM nfe WHERE ${queryFiltroNfe} GROUP BY mes
              UNION ALL
              SELECT EXTRACT(MONTH FROM data_emissao) as mes, COALESCE(SUM(valor_servicos), 0) as valor
              FROM nfse WHERE ${queryFiltroNfse} GROUP BY mes
          )
          SELECT mes, SUM(valor) as total_faturado
          FROM faturamento_mensal
          GROUP BY mes
          ORDER BY mes ASC;
      `;

      const result = await pool.query(query, params);
      
      // Formata a resposta para garantir que todos os 12 meses existem no array (mesmo os zerados)
      const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, total_faturado: 0 }));
      result.rows.forEach(row => {
          const index = parseInt(row.mes) - 1;
          meses[index].total_faturado = parseFloat(row.total_faturado);
      });

      return meses;
  }

  /**
   * Busca alertas gerados pela auditoria.
   */
  async obterUltimosAlertasFiscais(tenant_id, empresa_id, limite) {
      // Como o módulo de auditoria com IA/Regras ainda será implementado nos próximos passos,
      // retornamos um mockup da estrutura que o Frontend irá consumir para a "Visão Oceano Azul".
      return [
          {
              id: 1,
              tipo: 'CRITICO',
              mensagem: 'Atenção: 2 Notas Fiscais de Entrada possuem fornecedores com CNPJ Inapto.',
              data: new Date()
          },
          {
              id: 2,
              tipo: 'AVISO',
              mensagem: 'Divergência detetada no cálculo de ICMS da Nota Série 1 / Nº 4509.',
              data: new Date()
          }
      ];
  }
}

module.exports = new DashboardService();