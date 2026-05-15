// Para instalar a dependência de parser: npm install fast-xml-parser pg
import { XMLParser } from 'fast-xml-parser';
import pg from 'pg';

const { Pool } = pg;

/**
 * Serviço responsável por fazer o parse do XML recebido da SEFAZ
 * e persistir os dados no PostgreSQL garantindo o cumprimento
 * das regras de conformidade fiscal e auditoria.
 */
export class NFeParserService {
    constructor(dbConfig) {
        this.pool = new Pool(dbConfig);
        
        // Configuração do Parser para nunca descartar arrays, mesmo que exista apenas 1 item
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "_",
            parseTagValue: true,
            isArray: (name) => {
                const arrayTags = ['det', 'dup', 'vol', 'reboque', 'pag', 'obsCont', 'obsFisco'];
                return arrayTags.includes(name);
            }
        });
    }

    /**
     * Processa a resposta da API (XML Bruto) e extrai os dados estruturados.
     * @param {string} xmlString - O XML integral retornado pela API
     * @param {string} nsu - Número Sequencial Único
     */
    async processarNfe(xmlString, nsu) {
        try {
            // 1. Extração sem perda de dados
            const xmlObj = this.parser.parse(xmlString);
            
            // O XML da SEFAZ pode vir como nfeProc (processada) ou apenas NFe
            const nfe = xmlObj.nfeProc ? xmlObj.nfeProc.NFe.infNFe : xmlObj.NFe.infNFe;
            const prot = xmlObj.nfeProc ? xmlObj.nfeProc.protNFe.infProt : null;
            
            const chaveAcesso = nfe._Id.replace('NFe', '');

            // 2. Iniciar Transação de Base de Dados (Tudo ou Nada)
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');

                // 2.1 Inserir Cabeçalho e XML Bruto (Regra de Imutabilidade)
                const notaQuery = `
                    INSERT INTO nfe_notas (
                        nsu, chave_acesso, protocolo_autorizacao, xml_bruto,
                        ide_cuf, ide_cnf, ide_natop, ide_dhemi,
                        emit_cnpj_cpf, emit_xnome,
                        dest_cnpj_cpf, dest_xnome,
                        tot_vbc, tot_vicms, tot_vprod, tot_vnf,
                        transporte, cobranca, inf_adic
                    ) VALUES (
                        $1, $2, $3, $4,
                        $5, $6, $7, $8,
                        $9, $10,
                        $11, $12,
                        $13, $14, $15, $16,
                        $17, $18, $19
                    ) RETURNING id;
                `;
                
                const emitDocumento = nfe.emit.CNPJ || nfe.emit.CPF;
                const destDocumento = nfe.dest?.CNPJ || nfe.dest?.CPF || nfe.dest?.idEstrangeiro;

                const notaValues = [
                    nsu, chaveAcesso, prot?.nProt || null, xmlString,
                    nfe.ide.cUF, nfe.ide.cNF, nfe.ide.natOp, nfe.ide.dhEmi,
                    emitDocumento, nfe.emit.xNome,
                    destDocumento, nfe.dest?.xNome,
                    nfe.total.ICMSTot.vBC, nfe.total.ICMSTot.vICMS, nfe.total.ICMSTot.vProd, nfe.total.ICMSTot.vNF,
                    nfe.transp ? JSON.stringify(nfe.transp) : null,
                    nfe.cobr ? JSON.stringify(nfe.cobr) : null,
                    nfe.infAdic ? JSON.stringify(nfe.infAdic) : null
                ];

                const notaResult = await client.query(notaQuery, notaValues);
                const nfeId = notaResult.rows[0].id;

                // 2.2 Processar Itens (Produtos/Serviços) e Escrituração
                if (nfe.det && Array.isArray(nfe.det)) {
                    for (const item of nfe.det) {
                        const itemQuery = `
                            INSERT INTO nfe_itens (
                                nfe_id, source_api_id, nitem, cprod, xprod, ncm, 
                                cfop, ucom, qcom, vuncom, vprod
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id;
                        `;
                        
                        const itemValues = [
                            nfeId, nsu, item._nItem, item.prod.cProd, item.prod.xProd, item.prod.NCM,
                            item.prod.CFOP, item.prod.uCom, item.prod.qCom, item.prod.vUnCom, item.prod.vProd
                        ];

                        const itemResult = await client.query(itemQuery, itemValues);
                        const itemId = itemResult.rows[0].id;

                        // 2.3 Processar Impostos (Extração para Apuração)
                        await this._processarImpostos(client, itemId, item.imposto, nsu);
                    }
                }

                await client.query('COMMIT');
                console.log(`[Sucesso] NF-e ${chaveAcesso} escriturada corretamente.`);
                return { success: true, nfeId, chaveAcesso };

            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`[Erro Transacional] Falha ao gravar NF-e ${chaveAcesso}:`, err);
                throw err;
            } finally {
                client.release();
            }

        } catch (error) {
            console.error('[Erro de Parse] Falha ao interpretar o XML:', error);
            throw error;
        }
    }

    /**
     * Mapeia os diferentes grupos tributários da SEFAZ (ICMS00, ICMS10, etc)
     * e guarda os valores exatos para as memórias de cálculo.
     */
    async _processarImpostos(client, itemId, impostosObj, nsu) {
        if (!impostosObj) return;

        // Função auxiliar de inserção
        const insertImposto = async (tipo, dados) => {
            if (!dados) return;
            
            // O nó da SEFAZ pode ter chaves variadas como ICMS00, ICMSSN101, etc.
            // Precisamos extrair o objeto interno que contém os valores (vBC, pICMS, etc)
            const chaveTributaria = Object.keys(dados)[0]; 
            const valores = dados[chaveTributaria];

            const cstOuCson = valores.CST || valores.CSOSN || null;
            const vbc = valores.vBC || null;
            const paliquota = valores.pICMS || valores.pIPI || valores.pPIS || valores.pCOFINS || null;
            const vimposto = valores.vICMS || valores.vIPI || valores.vPIS || valores.vCOFINS || null;

            const query = `
                INSERT INTO nfe_impostos (
                    nfe_item_id, source_api_id, tipo_imposto, cst, cson, 
                    vbc, paliquota, vimposto, dados_integrais
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
            `;
            
            await client.query(query, [
                itemId, nsu, tipo, valores.CST, valores.CSOSN, 
                vbc, paliquota, vimposto, JSON.stringify(valores)
            ]);
        };

        // Regra Absoluta: Nunca descartar campos, sempre importar os dados disponíveis
        if (impostosObj.ICMS) await insertImposto('ICMS', impostosObj.ICMS);
        if (impostosObj.IPI) await insertImposto('IPI', impostosObj.IPI);
        if (impostosObj.PIS) await insertImposto('PIS', impostosObj.PIS);
        if (impostosObj.COFINS) await insertImposto('COFINS', impostosObj.COFINS);
        if (impostosObj.ISSQN) await insertImposto('ISSQN', impostosObj.ISSQN);
    }
}