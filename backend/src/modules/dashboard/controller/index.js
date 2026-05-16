/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/dashboard/controller/index.js
 * Controlador do Dashboard - Arquitetura SaaS Profissional
 * Responsável por consolidar métricas, gráficos e resumos fiscais para o Tenant.
 */
const dashboardService = require('../service');
const AppError = require('../../../shared/errors/AppError');

class DashboardController {
  
  /**
   * Equivalente ao seu método "index" antigo.
   * Retorna o resumo consolidado: Receita Bruta, Impostos Detalhados (ICMS, IPI, PIS, COFINS, ISS),
   * Notas Canceladas e Atividades Recentes (Jobs), respeitando o isolamento do Tenant.
   */
  async index(req, res) {
    const { tenant_id } = req.user;
    const { periodo_inicio, periodo_fim, empresa_id } = req.query;

    // O serviço executará de forma otimizada as somas de impostos (NFe e NFSe) 
    // e buscará os últimos Jobs, substituindo os antigos SELECTs diretos e 
    // evitando o parse de XML em tempo real no controlador.
    const metricas = await dashboardService.obterMetricasCompletas(tenant_id, {
        periodo_inicio,
        periodo_fim,
        empresa_id
    });

    /**
     * O objeto 'metricas' retornado pelo serviço manterá a estrutura original:
     * {
     * receitaBruta: 0,
     * impostosDetalhados: { icms, ipi, pis, cofins, iss, retencoesFederais },
     * impostosApurados: 0,
     * notasCanceladas: 0,
     * totalDocs: 0,
     * atividades: [ { id, tipo, desc, tempo, status } ]
     * }
     */
    return res.status(200).json({
      success: true,
      data: metricas
    });
  }

  /**
   * Retorna dados formatados para os gráficos de faturamento e despesas ao longo do tempo.
   * (Nova funcionalidade SaaS)
   */
  async obterEvolucaoFinanceira(req, res) {
      const { tenant_id } = req.user;
      const { ano, empresa_id } = req.query;

      if (!ano) {
          throw new AppError('O parâmetro "ano" é obrigatório para o gráfico de evolução.', 400);
      }

      const evolucao = await dashboardService.gerarEvolucaoFinanceira(tenant_id, parseInt(ano), empresa_id);

      return res.status(200).json({
          success: true,
          data: evolucao
      });
  }

  /**
   * Retorna os alertas da auditoria fiscal inteligente para exibir na página inicial.
   * Ex: "Fornecedor Inapto", "Divergência de ICMS", etc.
   * (Nova funcionalidade SaaS Oceano Azul)
   */
  async obterAlertasFiscais(req, res) {
      const { tenant_id } = req.user;
      const { empresa_id, limite = 10 } = req.query;

      const alertas = await dashboardService.obterUltimosAlertasFiscais(tenant_id, empresa_id, parseInt(limite));

      return res.status(200).json({
          success: true,
          data: alertas
      });
  }
}

module.exports = new DashboardController();