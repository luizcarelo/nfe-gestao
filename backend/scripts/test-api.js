/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/scripts/test-api.js
 * Script de Testes Integrados (E2E) Completo para a API SaaS NFe/NFSe Gestão
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3333/v1';

// Dados de teste
const ADMIN_CREDENTIALS = {
  email: 'admin@lhsolucao.com',
  senha: 'hash_temporario_123'
};
const TEST_CNPJ = '19131243000197'; 
const TEST_GTIN = '7891000315507'; 

// Variáveis de estado mantidas entre os testes
let authToken = '';
let empresaId = null;
let nfeId = null;
let nfseId = null;

async function runTests() {
  console.log('🚀 A iniciar Testes Integrados COMPLETOS da API SaaS...\n');

  try {
    // ==========================================
    // 1. TESTE DE AUTENTICAÇÃO (LOGIN)
    // ==========================================
    console.log('🔄 1. Testando Autenticação...');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, ADMIN_CREDENTIALS);
    authToken = loginRes.data.token;
    console.log(`   ✅ Login efetuado com sucesso! Tenant ID: ${loginRes.data.user.tenant_id}`);
    
    const authConfig = { headers: { Authorization: `Bearer ${authToken}` } };

    // ==========================================
    // 2. TESTE MÓDULO PARCEIROS E PRODUTOS
    // ==========================================
    console.log('\n🔄 2. Testando Cadastros Inteligentes (BrasilAPI e Cosmos)...');
    await axios.post(`${BASE_URL}/parceiros`, { cnpj: TEST_CNPJ }, authConfig);
    console.log(`   ✅ Parceiro Upsert efetuado!`);
    await axios.post(`${BASE_URL}/produtos`, { gtin: TEST_GTIN, descricao: 'TESTE SCRIPT' }, authConfig);
    console.log(`   ✅ Produto Upsert efetuado!`);

    // ==========================================
    // 3. TESTE MÓDULO EMPRESAS E CERTIFICADO
    // ==========================================
    console.log('\n🔄 3. Testando Empresas e Segurança (Certificado A1)...');
    try {
      const empresaRes = await axios.post(`${BASE_URL}/empresas`, { cnpj: TEST_CNPJ }, authConfig);
      empresaId = empresaRes.data.data.id;
    } catch (e) {
      if (e.response?.status === 409) {
         const listaEmpresas = await axios.get(`${BASE_URL}/empresas`, authConfig);
         empresaId = listaEmpresas.data.data.find(emp => emp.cnpj === TEST_CNPJ).id;
      } else throw e;
    }
    console.log(`   ✅ Empresa pronta (ID: ${empresaId})`);

    // Testa Upload de Certificado Mockado
    const certRes = await axios.post(`${BASE_URL}/empresas/${empresaId}/certificado`, {
        arquivo_pfx_base64: Buffer.from('MOCK_CERTIFICADO').toString('base64'),
        senha: 'senha_super_secreta'
    }, authConfig);
    console.log(`   ✅ Certificado A1 guardado com segurança no cofre!`);

    // ==========================================
    // 4. TESTE MÓDULO NFE E AUDITORIA
    // ==========================================
    console.log('\n🔄 4. Testando Motor de NFe e Auditoria Fiscal...');
    const mockXmlNfe = `<?xml version="1.0" encoding="UTF-8"?>
    <nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
      <NFe>
        <infNFe Id="NFe35231019131243000197550010000001231000001234" versao="4.00">
          <ide><nNF>123</nNF><serie>1</serie><dhEmi>2023-10-01T12:00:00-03:00</dhEmi><tpNF>1</tpNF></ide>
          <emit><CNPJ>${TEST_CNPJ}</CNPJ><xNome>Empresa Teste</xNome></emit>
          <dest><CNPJ>00000000000000</CNPJ><xNome>Cliente Teste</xNome></dest>
          <det nItem="1">
            <prod><cProd>1</cProd><xProd>Produto Teste</xProd><CFOP>5102</CFOP><vProd>100.00</vProd></prod>
            <imposto><ICMS><ICMS00><vICMS>18.00</vICMS></ICMS00></ICMS></imposto>
          </det>
          <total><ICMSTot><vProd>100.00</vProd><vNF>100.00</vNF><vICMS>18.00</vICMS></ICMSTot></total>
        </infNFe>
      </NFe>
    </nfeProc>`;

    try {
        const nfeRes = await axios.post(`${BASE_URL}/nfe/upload`, { empresa_id: empresaId, xml: mockXmlNfe }, authConfig);
        nfeId = nfeRes.data.data.id;
        console.log(`   ✅ NFe importada (ID: ${nfeId})`);
    } catch (e) {
        if (e.response?.status === 409) {
            const listaNfe = await axios.get(`${BASE_URL}/nfe?empresa_id=${empresaId}`, authConfig);
            nfeId = listaNfe.data.data[0].id;
            console.log(`   ℹ️ NFe já importada, a usar ID: ${nfeId}`);
        } else throw e;
    }

    // 4.1 Testar Auditoria Fiscal Inteligente (Oceano Azul)
    const auditoriaRes = await axios.post(`${BASE_URL}/nfe/${nfeId}/auditar`, {}, authConfig);
    console.log(`   ✅ Auditoria Executada! Alertas encontrados: ${auditoriaRes.data.data.total_alertas}`);

    // 4.2 Testar Manifestação SEFAZ
    const manifestacaoRes = await axios.post(`${BASE_URL}/nfe/${nfeId}/manifestar`, {
        tipo_manifestacao: 'ciencia'
    }, authConfig);
    console.log(`   ✅ Manifestação registada: ${manifestacaoRes.data.data.status_manifestacao}`);

    // ==========================================
    // 5. TESTE MÓDULO NFSE (Padrão Nacional)
    // ==========================================
    console.log('\n🔄 5. Testando Motor de NFSe (Serviços)...');
    const mockXmlNfse = `<?xml version="1.0" encoding="UTF-8"?>
    <NFSe>
      <infNFSe>
        <nNF>999</nNF>
        <cVerif>ABC123XYZ</cVerif>
        <dhEmi>2023-10-02T15:00:00</dhEmi>
        <emit><CNPJ>${TEST_CNPJ}</CNPJ><xNome>Empresa Prestadora</xNome></emit>
        <dest><CNPJ>00000000000000</CNPJ><xNome>Tomador Teste</xNome></dest>
        <serv><vServ>500.00</vServ><vISS>25.00</vISS><xDescServ>Desenvolvimento SaaS</xDescServ></serv>
      </infNFSe>
    </NFSe>`;

    try {
        const nfseRes = await axios.post(`${BASE_URL}/nfse/upload`, { empresa_id: empresaId, xml: mockXmlNfse }, authConfig);
        nfseId = nfseRes.data.data.id;
        console.log(`   ✅ NFSe Nacional importada com sucesso (ID: ${nfseId})!`);
    } catch (e) {
        if (e.response?.status === 409) {
            console.log('   ℹ️ NFSe já importada anteriormente.');
        } else throw e;
    }

    // ==========================================
    // 6. TESTE MÓDULO DASHBOARD AVANÇADO
    // ==========================================
    console.log('\n🔄 6. Testando Dashboard Avançado...');
    const dashRes = await axios.get(`${BASE_URL}/dashboard`, authConfig);
    console.log(`   ✅ Métricas Principais carregadas.`);
    
    const evolucaoRes = await axios.get(`${BASE_URL}/dashboard/evolucao?ano=2023`, authConfig);
    console.log(`   ✅ Gráfico de Evolução Financeira gerado com sucesso.`);

    const alertasRes = await axios.get(`${BASE_URL}/dashboard/alertas`, authConfig);
    console.log(`   ✅ Alertas Fiscais carregados.`);

    // ==========================================
    // 7. TESTE MONITOR DE TAREFAS (JOBS)
    // ==========================================
    console.log('\n🔄 7. Testando Jobs e Sincronização...');
    const jobRes = await axios.post(`${BASE_URL}/jobs/sync`, { tipo: 'sync_nfse', empresa_id: empresaId }, authConfig);
    const jobId = jobRes.data.data.id;
    console.log(`   ✅ Job de NFSe criado (ID: ${jobId}).`);
    
    const statsRes = await axios.get(`${BASE_URL}/jobs/stats`, authConfig);
    console.log(`   ✅ Estatísticas de processamento lidas.`);

    console.log('\n🎉 TESTE E2E COMPLETADO! NFe, NFSe, Auditoria, Certificados e Dashboards funcionam em harmonia.');

  } catch (error) {
    console.error('\n❌ FALHA NOS TESTES DE INTEGRAÇÃO!');
    if (error.response) {
      console.error(`Status HTTP: ${error.response.status}`);
      console.error(`Detalhes: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(error.message);
    }
  }
}

runTests();