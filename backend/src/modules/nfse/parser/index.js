// Ficheiro: backend/src/modules/nfse/parser/index.js
/**
 * Parser para o Padrão Nacional de NFS-e
 * Lida com a normalização dos dados vindos do ADN para o nosso motor fiscal.
 */
class NfseParser {
  /**
   * Normaliza o retorno da API ADN (JSON/XML) para o formato interno
   */
  parseFromADN(data) {
    // O ADN retorna um objeto complexo com a NFS-e e eventos
    const nfse = data.nfse || data;
    
    return {
      header: {
        chave: nfse.chaveAcesso,
        numero: nfse.nNFSe,
        serie: nfse.sNFSe,
        data_emissao: nfse.dhEmi,
        valor_total: nfse.vServ?.vServPrest || 0
      },
      tributos: {
        iss: {
          base: nfse.vServ?.vBCISS || 0,
          aliq: nfse.vServ?.pAliqISS || 0,
          valor: nfse.vServ?.vISS || 0
        },
        // Mapeamento para Reforma Tributária (IBS/CBS) caso já disponível no ADN
        ibs: { valor: nfse.vServ?.vIBS || 0 },
        cbs: { valor: nfse.vServ?.vCBS || 0 }
      },
      bruto: data
    };
  }
}

module.exports = new NfseParser();