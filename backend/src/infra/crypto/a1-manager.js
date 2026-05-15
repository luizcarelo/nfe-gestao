// Ficheiro: /home/engeradios/nfe-gestao/backend/src/infra/crypto/a1-manager.js

const forge = require('node-forge');
const crypto = require('crypto');
const { AppError } = require('../../shared/errors/AppError');
const { logger } = require('../logger');

class A1Manager {
  constructor() {
    this.algorithm = 'aes-256-cbc';
    // Chave de 32 bytes (256 bits) para garantir segurança na encriptação da senha
    const key = process.env.CERT_ENCRYPT_KEY || '01234567890123456789012345678901';
    this.secretKey = Buffer.from(key, 'utf8');
  }

  /**
   * Valida se o arquivo PFX abre com a senha fornecida e extrai as informações.
   * Implementação blindada contra erros de codificação de Buffer e Cadeias Certificadoras (CA).
   * @param {Buffer} pfxBuffer - Buffer binário do PFX recebido via upload.
   * @param {string} password - Senha do certificado.
   */
  validateAndExtract(pfxBuffer, password) {
    try {
      const base64Pfx = pfxBuffer.toString('base64');
      const p12Der = forge.util.decode64(base64Pfx);
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      
      if (!forge.pkcs12 || typeof forge.pkcs12.pkcs12FromAsn1 !== 'function') {
        throw new Error('Função pkcs12FromAsn1 indisponível na biblioteca node-forge.');
      }

      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const shroudedKeyBags = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
      const normalKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];
      const allKeyBags = shroudedKeyBags.concat(normalKeyBags);

      let localKeyId = null;
      if (allKeyBags.length > 0 && allKeyBags[0].attributes && allKeyBags[0].attributes.localKeyId) {
        localKeyId = allKeyBags[0].attributes.localKeyId[0];
      }

      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
      let clientCert = null;

      if (localKeyId) {
        for (const bag of certBags) {
          if (bag.attributes && bag.attributes.localKeyId && bag.attributes.localKeyId[0] === localKeyId) {
            clientCert = bag.cert;
            break;
          }
        }
      }

      if (!clientCert) {
        for (const bag of certBags) {
          const isCa = bag.cert.extensions && bag.cert.extensions.some(ext => ext.name === 'basicConstraints' && ext.cA);
          if (!isCa) {
            clientCert = bag.cert;
            break;
          }
        }
      }

      if (!clientCert && certBags.length > 0) {
        clientCert = certBags[0].cert;
      }

      if (!clientCert) {
        throw new Error('Certificado do emitente não encontrado no arquivo PFX.');
      }

      let cnField = '';
      if (clientCert.subject && typeof clientCert.subject.getField === 'function') {
        const field = clientCert.subject.getField('CN');
        if (field) cnField = field.value;
      }

      return {
        subject: cnField || 'Emitente Desconhecido',
        validFrom: clientCert.validity.notBefore,
        validTo: clientCert.validity.notAfter,
        serialNumber: clientCert.serialNumber
      };

    } catch (err) {
      logger.error(`[A1Manager] Erro de validação PFX: ${err.message}`);
      
      if (err.message.includes('MAC') || err.message.includes('password') || err.message.includes('PKCS#12')) {
        throw new AppError('A senha do certificado está incorreta ou o arquivo é inválido.', 400);
      }
      
      throw new AppError('Falha ao processar o certificado. Verifique se é um arquivo PFX/P12 válido.', 400);
    }
  }

  /**
   * Extrai a chave privada e a cadeia de certificados (PEM) para evitar 
   * o erro "Unsupported PKCS12 PFX data" no Node.js 17+ (OpenSSL 3.0).
   * @param {Buffer} pfxBuffer - Buffer binário do PFX.
   * @param {string} password - Senha desencriptada.
   */
  getCredentials(pfxBuffer, password) {
    try {
      const base64Pfx = pfxBuffer.toString('base64');
      const p12Der = forge.util.decode64(base64Pfx);
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

      let keyPem = null;
      let certPem = '';

      // Buscar Chaves Privadas
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const shrouded = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
      const normal = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];
      const allKeys = shrouded.concat(normal);

      let localKeyId = null;
      if (allKeys.length > 0) {
        keyPem = forge.pki.privateKeyToPem(allKeys[0].key);
        if (allKeys[0].attributes && allKeys[0].attributes.localKeyId) {
          localKeyId = allKeys[0].attributes.localKeyId[0];
        }
      }

      if (!keyPem) {
        throw new Error('Chave privada não encontrada no PFX.');
      }

      // Buscar Certificados
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
      let clientCertBag = null;

      if (localKeyId) {
        clientCertBag = certBags.find(bag => 
          bag.attributes && bag.attributes.localKeyId && bag.attributes.localKeyId[0] === localKeyId
        );
      }
      
      if (!clientCertBag && certBags.length > 0) {
        clientCertBag = certBags[0];
      }

      if (clientCertBag) {
        certPem = forge.pki.certificateToPem(clientCertBag.cert);
      } else {
        throw new Error('Certificado cliente não encontrado no PFX.');
      }

      // Adicionar Cadeia de Autoridades Certificadoras (CAs)
      certBags.forEach(bag => {
        if (bag !== clientCertBag) {
          certPem += '\n' + forge.pki.certificateToPem(bag.cert);
        }
      });

      return { key: keyPem, cert: certPem };
    } catch (err) {
      logger.error(`[A1Manager] Erro ao extrair PEM: ${err.message}`);
      throw new AppError(`Falha ao converter certificado para uso em rede: ${err.message}`, 500);
    }
  }

  /**
   * Criptografa a senha com AES-256-CBC e um IV único
   */
  encryptPassword(password) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
      let encrypted = cipher.update(password, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (err) {
      logger.error(`[A1Manager] Erro ao criptografar senha: ${err.message}`);
      throw new AppError('Falha interna de segurança ao proteger a senha do certificado.');
    }
  }

  /**
   * Descriptografa a senha recuperando o IV do texto armazenado
   */
  decryptPassword(encryptedData) {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Formato de criptografia inválido (ausência de IV).');
      }
      
      const ivHex = parts[0];
      const encryptedText = parts[1];
      
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      logger.error(`[A1Manager] Erro ao descriptografar senha: ${err.message}`);
      throw new AppError('Falha de segurança ao recuperar a senha do certificado.');
    }
  }
}

module.exports = new A1Manager();