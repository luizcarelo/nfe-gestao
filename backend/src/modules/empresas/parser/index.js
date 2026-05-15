// Ficheiro: backend/src/modules/empresas/parser/index.js
/**
 * Normalizador de Dados Cadastrais e Tributários
 * Consolida as respostas de múltiplas fontes (RFB + SEFAZ) num objeto Dossiê único.
 */
class EmpresaLookupParser {
  parse(rfbData, sefazData) {
    const rfb = rfbData?.raw || {};
    let sefaz = sefazData?.raw?.retConsCad?.infCons?.infCad || {};
    
    // O CCC pode devolver um array se a empresa tiver múltiplas inscrições ativas no estado
    if (Array.isArray(sefaz)) sefaz = sefaz[0];

    return {
      identificacao: {
        cnpj: rfb.cnpj || '',
        razao_social: rfb.razao_social || '',
        nome_fantasia: rfb.nome_fantasia || '',
        natureza_juridica: rfb.natureza_juridica || '',
        data_abertura: rfb.data_inicio_atividade || '',
        situacao_rfb: rfb.descricao_situacao_cadastral || '',
        porte: rfb.porte || 'NÃO INFORMADO',
        tipo: rfb.identificador_matriz_filial === 1 ? 'MATRIZ' : 'FILIAL',
        capital_social: rfb.capital_social || 0,
        _meta: { source: rfbData?.source, at: rfbData?.timestamp }
      },
      endereco: {
        logradouro: rfb.logradouro || '',
        numero: rfb.numero || '',
        complemento: rfb.complemento || '',
        bairro: rfb.bairro || '',
        municipio: rfb.municipio || '',
        uf: rfb.uf || '',
        cep: rfb.cep || '',
        municipio_ibge: rfb.codigo_municipio ? String(rfb.codigo_municipio) : '3550308',
      },
      fiscal: {
        // Se a SEFAZ devolver a IE, utilizamos. Caso contrário, inferimos ISENTO.
        inscricao_estadual: sefaz.IE || 'ISENTO',
        situacao_sefaz: sefaz.cSit || (rfb.situacao_cadastral === 2 ? '1' : '0'),
        uf_autorizadora: sefaz.UF || rfb.uf,
        _meta: { source: sefazData?.source, at: sefazData?.timestamp }
      },
      regime: this._inferirRegime(rfb),
      dados_brutos: rfb
    };
  }

  /**
   * Lógica de inferência baseada em regras fiscais
   */
  _inferirRegime(rfb) {
    const isSimples = rfb.opcao_pelo_simples === true;
    const isMei = rfb.opcao_pelo_mei === true;

    let sugestao = 'LUCRO_PRESUMIDO';
    
    if (isSimples) sugestao = 'SIMPLES_NACIONAL';
    if (isMei) sugestao = 'MEI';
    
    // Regra Básica de Prevenção: Capitais Sociais muito elevados sugerem Lucro Real
    if (!isSimples && rfb.capital_social > 78000000) {
      sugestao = 'LUCRO_REAL';
    }

    return {
      status: isSimples ? 'SIMPLES_NACIONAL' : 'REGIME_NORMAL',
      optante_simples: isSimples,
      mei: isMei,
      sugestao_regime: sugestao,
      _meta: { source: 'Engine/Inference', at: new Date().toISOString() }
    };
  }
}

module.exports = new EmpresaLookupParser();