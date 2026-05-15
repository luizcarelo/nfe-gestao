// Ficheiro: /home/engeradios/nfe-gestao/backend/src/infra/crypto/xml-signer.js

const { SignedXml } = require('xml-crypto');

/**
 * Provedor de Informação de Chave Customizado
 * Necessário para injetar o certificado limpo no nó <KeyInfo> do XML, exigência da SEFAZ.
 */
class KeyInfoProvider {
  constructor(certPem) {
    this.certPem = certPem;
  }
  
  getKeyInfo(key, prefix) {
    const cert = this.certPem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
    return `<X509Data><X509Certificate>${cert}</X509Certificate></X509Data>`;
  }
  
  getKey() { 
    return null; 
  }
}

class XmlSigner {
  /**
   * Assina digitalmente uma string XML conforme o padrão ICP-Brasil / SEFAZ
   * @param {string} xml - O XML minificado (sem quebras de linha)
   * @param {string} tagToSign - O nome da tag que receberá a assinatura (ex: 'infEvento')
   * @param {string} privateKeyPem - Chave privada em formato PEM
   * @param {string} certPem - Certificado público em formato PEM
   */
  sign(xml, tagToSign, privateKeyPem, certPem) {
    const sig = new SignedXml();
    
    // Padrões de canonização e assinatura exigidos pela SEFAZ Nacional
    sig.addReference(
      `//*[local-name(.)='${tagToSign}']`,
      [
        "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
        "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
      ],
      "http://www.w3.org/2000/09/xmldsig#sha1",
      "", "", "", true
    );

    sig.signingKey = privateKeyPem;
    sig.keyInfoProvider = new KeyInfoProvider(certPem);
    
    sig.computeSignature(xml);
    return sig.getSignedXml();
  }
}

module.exports = new XmlSigner();