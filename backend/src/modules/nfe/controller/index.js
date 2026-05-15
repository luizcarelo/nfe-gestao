// Caminho completo do ficheiro: backend/src/modules/nfe/controller/index.js

import { NFeParserService } from '../parser/nfeParserService.js';
import { NacionalClient } from '../../../infra/rest/nacional-client.js';
// Assumindo que a configuração da base de dados está exportada aqui
import dbConfig from '../../../config/database.js'; 

export class NfeController {
    constructor() {
        // Inicializa o serviço de parsing com as credenciais da base de dados
        this.nfeParserService = new NFeParserService(dbConfig);
        // Inicializa o cliente REST/SOAP da SEFAZ Nacional
        this.nacionalClient = new NacionalClient();
    }

    /**
     * Objetivo Fiscal: Sincronizar e escriturar automaticamente as Notas Fiscais Eletrónicas (NF-e)
     * emitidas contra o CNPJ da empresa, garantindo que não há interrupção no fluxo de auditoria.
     * * Rota de Exemplo: POST /api/nfe/sincronizar
     */
    async sincronizarNotasSefaz(req, res, next) {
        try {
            const { cnpj_empresa, ultimo_nsu } = req.body;

            if (!cnpj_empresa) {
                return res.status(400).json({ 
                    erro: 'O CNPJ da empresa é obrigatório para consultar a SEFAZ.' 
                });
            }

            console.log(`[Fiscal] A iniciar sincronização de NF-e para o CNPJ: ${cnpj_empresa} a partir do NSU: ${ultimo_nsu || '0'}`);

            // 1. Obter dados da API externa oficial (SEFAZ)
            // A função consultarDistDFe deve comunicar com o WebService nfeDistDFeInteresse
            const respostaSefaz = await this.nacionalClient.consultarDistDFe({
                cnpj: cnpj_empresa,
                ultNSU: ultimo_nsu || '0'
            });

            if (!respostaSefaz.sucesso) {
                return res.status(502).json({
                    erro: 'Falha na comunicação com o Web Service da SEFAZ.',
                    detalhes: respostaSefaz.motivo
                });
            }

            const relatorioSincronizacao = {
                notas_processadas: 0,
                erros: [],
                maior_nsu_retornado: respostaSefaz.maxNSU
            };

            // 2. Iterar sobre os documentos devolvidos pela SEFAZ
            // NUNCA descartar documentos retornados
            if (respostaSefaz.documentos && respostaSefaz.documentos.length > 0) {
                for (const doc of respostaSefaz.documentos) {
                    try {
                        // A SEFAZ pode devolver resNFe (resumo) ou procNFe (XML completo).
                        // O nosso sistema deve apenas escriturar o XML completo (procNFe) para manter a integridade fiscal.
                        if (doc.schema === 'procNFe') {
                            // doc.xmlString deve conter o XML bruto descodificado (ex: descompactado de base64/gzip se aplicável)
                            const resultado = await this.nfeParserService.processarNfe(doc.xmlString, doc.nsu);
                            
                            if (resultado.success) {
                                relatorioSincronizacao.notas_processadas++;
                            }
                        } else if (doc.schema === 'resNFe') {
                            // Registo temporário apenas para posterior Manifestação do Destinatário
                            // (Obrigatório para obter o XML completo em operações não realizadas)
                            console.log(`[Aviso Fiscal] Recebido apenas o resumo (resNFe) para o NSU ${doc.nsu}. É necessária a Manifestação do Destinatário para obter o XML completo.`);
                            // TODO: Inserir numa tabela de "Notas Pendentes de Manifestação"
                        }
                    } catch (erroParse) {
                        console.error(`[Erro de Escrituração] Falha ao gravar documento NSU ${doc.nsu}:`, erroParse);
                        relatorioSincronizacao.erros.push({
                            nsu: doc.nsu,
                            motivo: erroParse.message
                        });
                        // Continua a processar os próximos ficheiros mesmo se um falhar
                    }
                }
            }

            // 3. Devolver o relatório da operação de auditoria e sincronização
            return res.status(200).json({
                mensagem: 'Sincronização com a SEFAZ concluída.',
                dados: relatorioSincronizacao
            });

        } catch (error) {
            console.error('[Erro Crítico] Falha no controlador de sincronização de NF-e:', error);
            next(error); // Passa para o middleware global de erros do Express
        }
    }

    /**
     * Objetivo Fiscal: Obter uma NF-e específica já armazenada no nosso PostgreSQL,
     * incluindo o seu XML bruto original para fins de auditoria (sped/fiscalização).
     * * Rota de Exemplo: GET /api/nfe/:chave_acesso
     */
    async obterNotaPorChave(req, res, next) {
        try {
            const { chave_acesso } = req.params;
            
            const client = await this.nfeParserService.pool.connect();
            try {
                // Consulta estruturada para devolver cabeçalho e itens
                const query = `
                    SELECT 
                        n.*,
                        json_agg(i.*) as itens
                    FROM nfe_notas n
                    LEFT JOIN nfe_itens i ON i.nfe_id = n.id
                    WHERE n.chave_acesso = $1
                    GROUP BY n.id;
                `;
                
                const resultado = await client.query(query, [chave_acesso]);
                
                if (resultado.rows.length === 0) {
                    return res.status(404).json({ erro: 'Nota Fiscal não encontrada no repositório local.' });
                }

                return res.status(200).json(resultado.rows[0]);
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('[Erro de Leitura] Falha ao consultar a base de dados:', error);
            next(error);
        }
    }
}