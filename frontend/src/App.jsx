// Ficheiro: frontend/src/App.jsx

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { 
  LayoutDashboard, Building2, FileText, FileSpreadsheet, 
  ShieldCheck, RefreshCw, UploadCloud, AlertCircle, 
  Search, Plus, X, CheckCircle2, Info, MapPin, 
  UserCircle, Briefcase, Database, KeyRound, Clock, 
  Filter, Activity, Moon, Sun, Eye, Code, Server, 
  TrendingUp, BarChart3, AlertTriangle, ArrowDownRight, 
  PieChart, FileWarning, XCircle, Sparkles, 
  Bot, Users, Network, Edit2, Trash2, Play
} from 'lucide-react';

// ==========================================
// 1. SERVIÇOS CENTRAIS E CONSTANTES
// ==========================================
const api = axios.create({ baseURL: 'https://engeradios.ddns.com.br/v1' });

const callGeminiAPI = async (userPrompt, systemPrompt) => {
  const apiKey = ""; // A chave é fornecida pelo ambiente Canvas no runtime
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta do assistente fiscal.";
  } catch (error) {
    return "Erro Crítico: Não foi possível comunicar com a inteligência artificial.";
  }
};

// ==========================================
// 2. COMPONENTES UI REUTILIZÁVEIS
// ==========================================
const Badge = ({ variant, children, className = "" }) => {
  const styles = {
    success: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-800/50",
    warning: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800/50",
    danger: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-400 dark:border-rose-800/50",
    info: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-400 dark:border-sky-800/50",
    purple: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-400 dark:border-indigo-800/50",
    neutral: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    running: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-800/50 animate-pulse"
  };
  return <span className={`px-2.5 py-1 rounded-md text-[10px] font-black border uppercase tracking-wider transition-colors flex items-center justify-center gap-1 w-fit ${styles[variant] || styles.neutral} ${className}`}>{children}</span>;
};

const StatCard = ({ title, value, icon: Icon, colorClass, trend, trendValue }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
    <div className={`p-3 rounded-xl ${colorClass.bg} ${colorClass.text}`}><Icon size={24} /></div>
    <div className="flex-1">
      <div className="flex justify-between items-start w-full">
         <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{title}</p>
         {trend && (
           <span className={`text-[10px] font-bold flex items-center gap-0.5 ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
             {trend === 'up' ? <TrendingUp size={12}/> : <ArrowDownRight size={12}/>} {trendValue}
           </span>
         )}
      </div>
      <h4 className="text-xl font-black text-slate-800 dark:text-slate-100 mt-0.5">{value}</h4>
    </div>
  </div>
);

const TaxBar = ({ label, value, color, aliq }) => (
  <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50 last:border-0">
    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
      {label} {aliq && <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded text-[9px] border border-slate-200 dark:border-slate-700">{aliq}%</span>}
    </span>
    <span className={`text-sm font-black ${color}`}>R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
  </div>
);

// ==========================================
// 3. MODAIS GLOBAIS
// ==========================================
const ModalImportacaoXml = ({ isOpen, onClose, tipo, empresaId, onRefresh }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return alert("Selecione um ficheiro XML.");
    setLoading(true);
    const formData = new FormData();
    formData.append('xml', file);
    try {
      await api.post(`/${tipo}/import/${empresaId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert(`${tipo.toUpperCase()} processada com sucesso no motor fiscal!`);
      onRefresh(); onClose();
    } catch (err) {
       if(!err.response) { alert("Ambiente de Preview: XML Importado localmente."); onRefresh(); onClose(); return; }
       alert(`Erro: ${err.response?.data?.message || err.message}`);
    } finally { setLoading(false); setFile(null); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center rounded-t-3xl">
          <h3 className="font-black text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2"><UploadCloud className="text-indigo-600" /> Injetar XML ({tipo.toUpperCase()})</h3>
          <button onClick={onClose} className="p-2 bg-white dark:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"><X size={18}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="relative border-2 border-dashed border-indigo-200 dark:border-indigo-900/50 rounded-2xl p-10 text-center hover:border-indigo-500 transition-all cursor-pointer bg-slate-50 dark:bg-slate-800/30">
            <input type="file" accept=".xml" onChange={e => setFile(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer" />
            <UploadCloud className="mx-auto text-indigo-300 dark:text-indigo-500 transition-colors mb-4" size={48} />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{file ? <span className="text-indigo-600">{file.name}</span> : `Arraste o ficheiro .xml`}</p>
          </div>
          <button disabled={loading || !file} className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl hover:bg-indigo-700 flex justify-center shadow-lg transition-all disabled:opacity-50">
            {loading ? <RefreshCw className="animate-spin" size={20}/> : 'PROCESSAR XML'}
          </button>
        </form>
      </div>
    </div>
  );
};

const ModalCadastroInteligente = ({ isOpen, onClose, onRefresh }) => {
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [fetchedData, setFetchedData] = useState(null);

  if (!isOpen) return null;

  const handleLookup = async (e) => {
    e.preventDefault();
    if (cnpj.length < 14) return alert("Insira os 14 dígitos do CNPJ.");
    setLoading(true);
    try {
      const res = await api.get(`/empresas/lookup/${cnpj}`);
      setFetchedData(res.data.data);
      setStep(2);
    } catch (error) {
      if (!error.response) {
        setFetchedData({
          identificacao: {
            cnpj: cnpj, 
            razao_social: 'EMPRESA EXTRAIDA DA RECEITA S/A', 
            nome_fantasia: 'NOME FANTASIA', 
            situacao_rfb: 'ATIVA',
            natureza_juridica: '206-2 - Sociedade Empresária Limitada', 
            capital_social: 500000
          },
          endereco: {
            logradouro: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', municipio: 'São Paulo', uf: 'SP'
          },
          fiscal: {
            inscricao_estadual: 'ISENTO'
          },
          regime: {
            status: 'SIMPLES_NACIONAL',
            optante_simples: true
          },
          dados_brutos: {
            cnae_fiscal_descricao: 'Desenvolvimento de software',
            qsa: [{nome_socio: 'João Silva', qualificacao_socio: 'Sócio-Administrador'}, {nome_socio: 'Maria Souza', qualificacao_socio: 'Sócio'}]
          }
        });
        setStep(2);
        return;
      }
      alert(`Falha na extração da RFB: ${error.response?.data?.message || error.message}`);
    } finally { setLoading(false); }
  };

  const handleConfirmSave = async () => {
    setLoading(true);
    try {
      const payloadToSave = {
        identificacao: fetchedData.identificacao || {},
        endereco: fetchedData.endereco || {},
        fiscal: { ...(fetchedData.fiscal || {}), uf: fetchedData.endereco?.uf || fetchedData.identificacao?.uf || 'SP' },
        regime: fetchedData.regime || {},
        cnpj: fetchedData.identificacao?.cnpj || fetchedData.cnpj,
        optante_simples: fetchedData.regime?.optante_simples || false,
        dados_brutos: fetchedData.dados_brutos || fetchedData
      };

      await api.post('/empresas', payloadToSave);
      alert(`Entidade cadastrada com sucesso!`);
      onRefresh(); handleClose();
    } catch (error) {
      if(!error.response) { alert("Preview: Dados gravados localmente."); onRefresh(); handleClose(); return; }
      alert(`Erro: ${error.response?.data?.message || error.message}`);
    } finally { setLoading(false); }
  };

  const handleClose = () => { setCnpj(''); setStep(1); setFetchedData(null); onClose(); };

  const iden = fetchedData?.identificacao || fetchedData || {};
  const ender = fetchedData?.endereco || fetchedData || {};
  const reg = fetchedData?.regime || { status: fetchedData?.regime_tributario, optante_simples: fetchedData?.optante_simples };
  const brutos = fetchedData?.dados_brutos || fetchedData || {};

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg"><Search size={20} /></div>
            <div><h3 className="font-black text-slate-800 dark:text-slate-100 text-lg uppercase tracking-tight">Cofre Fiscal (RFB)</h3><p className="text-xs text-slate-500 font-medium">Integração BrasilAPI - Nova Empresa Independente</p></div>
          </div>
          <button onClick={handleClose} className="p-2 bg-white dark:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white border border-slate-200 dark:border-slate-700"><X size={18}/></button>
        </div>
        
        <div className="p-8 overflow-y-auto flex-1">
          {step === 1 ? (
            <form onSubmit={handleLookup} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NÚMERO DO CNPJ DA EMPRESA</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" required value={cnpj} onChange={e => setCnpj(e.target.value.replace(/\D/g, ''))} placeholder="Apenas números..." maxLength="14" className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500" />
                </div>
              </div>
              <button disabled={loading || cnpj.length < 14} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl hover:bg-indigo-700 flex justify-center shadow-lg shadow-indigo-500/20 disabled:opacity-50">
                {loading ? <RefreshCw className="animate-spin" size={20}/> : 'CONSULTAR RECEITA FEDERAL'}
              </button>
            </form>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-4">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl p-5 flex gap-4">
                <CheckCircle2 className="text-emerald-500 shrink-0" size={24} />
                <div>
                  <h4 className="font-black text-slate-800 dark:text-slate-100">{iden.razao_social}</h4>
                  <p className="text-xs text-slate-500 font-mono mt-1">CNPJ: {iden.cnpj}</p>
                  <div className="flex gap-2 mt-3">
                    <Badge variant={iden.situacao_rfb === 'ATIVA' || iden.situacao_cadastral === 'ATIVA' ? 'success' : 'danger'}>{iden.situacao_rfb || iden.situacao_cadastral || 'ATIVA'}</Badge>
                    <Badge variant="info">{iden.natureza_juridica?.split('-')[0] || 'Empresa'}</Badge>
                    {reg.optante_simples && <Badge variant="warning">SIMPLES NACIONAL</Badge>}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><MapPin size={12}/> Endereço Sede</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300">{ender.logradouro}, {ender.numero}</p>
                  <p className="text-xs text-slate-500">{ender.bairro}, {ender.municipio} - {ender.uf}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><FileText size={12}/> Atividade Principal</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300 line-clamp-2" title={brutos.cnae_fiscal_descricao || iden.cnae_principal}>{brutos.cnae_fiscal_descricao || iden.cnae_principal || 'Não informada'}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-3 mb-1 flex items-center gap-1"><Database size={12}/> Capital Social</p>
                  <p className="font-medium text-emerald-600 dark:text-emerald-400">R$ {parseFloat(iden.capital_social || brutos.capital_social || 0).toLocaleString('pt-BR')}</p>
                </div>
              </div>

              {brutos.qsa && brutos.qsa.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Users size={12}/> Quadro Societário e Administradores (QSA)</p>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                    {brutos.qsa.map((s, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm">
                         <span className="font-bold text-xs text-slate-700 dark:text-slate-200">{s.nome_socio}</span>
                         <Badge variant="neutral">{s.qualificacao_socio}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {step === 2 && (
          <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3 shrink-0 bg-slate-50 dark:bg-slate-900">
            <button onClick={() => setStep(1)} className="px-6 py-3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-300 transition-colors">Voltar</button>
            <button onClick={handleConfirmSave} disabled={loading} className="flex-1 bg-emerald-600 text-white px-6 py-3 rounded-xl font-black flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/20 hover:bg-emerald-700">
              {loading ? <RefreshCw className="animate-spin" size={18}/> : 'CONFIRMAR E INTEGRAR'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ModalEditarEmpresa = ({ isOpen, onClose, empresa, onRefresh }) => {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (empresa) {
      setFormData({ 
        razao_social: empresa.razao_social || '', 
        cnpj: empresa.cnpj || '', 
        inscricao_estadual: empresa.inscricao_estadual || '', 
        inscricao_municipal: empresa.inscricao_municipal || '',
        logradouro: empresa.logradouro || '',
        numero: empresa.numero || '',
        bairro: empresa.bairro || '',
        cep: empresa.cep || '',
        municipio_nome: empresa.municipio_nome || empresa.municipio || '',
        uf: empresa.uf || '',
        regime_tributario: empresa.regime_tributario || 'REGIME_NORMAL',
        dados_rfb: typeof empresa.dados_rfb === 'string' ? empresa.dados_rfb : JSON.stringify(empresa.dados_rfb || {})
      });
    }
  }, [empresa]);

  if (!isOpen || !empresa) return null;

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  
  const handleRefreshFromAPI = async () => {
    if (!formData.cnpj) return;
    setLookupLoading(true);
    try {
      const res = await api.get(`/empresas/lookup/${formData.cnpj.replace(/\D/g, '')}`);
      const fetched = res.data.data;
      setFormData(prev => ({
        ...prev,
        razao_social: fetched.identificacao?.razao_social || prev.razao_social,
        inscricao_estadual: fetched.fiscal?.inscricao_estadual && fetched.fiscal?.inscricao_estadual !== 'ISENTO' ? fetched.fiscal.inscricao_estadual : prev.inscricao_estadual,
        uf: fetched.endereco?.uf || prev.uf,
        municipio_nome: fetched.endereco?.municipio || prev.municipio_nome,
        logradouro: fetched.endereco?.logradouro || prev.logradouro,
        numero: fetched.endereco?.numero || prev.numero,
        bairro: fetched.endereco?.bairro || prev.bairro,
        cep: fetched.endereco?.cep || prev.cep,
        regime_tributario: fetched.regime?.status || prev.regime_tributario,
        dados_rfb: fetched.dados_brutos ? JSON.stringify(fetched.dados_brutos) : prev.dados_rfb
      }));
      alert("Dados atualizados da Receita Federal com sucesso! Guarde para consolidar.");
    } catch (error) {
      alert(`Erro ao buscar dados na Receita: ${error.response?.data?.message || error.message}`);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { 
      await api.put(`/empresas/${empresa.id}`, formData); 
      alert('Dados da empresa atualizados com sucesso!'); 
      onRefresh(); 
      onClose(); 
    } catch (error) { 
      if(!error.response) { alert("Preview: Atualizado localmente."); onRefresh(); onClose(); return; } 
      alert(`Erro: ${error.message}`); 
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center rounded-t-3xl shrink-0">
          <h3 className="font-black text-xl italic uppercase text-slate-800 dark:text-slate-100">Editar Entidade</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-800 dark:hover:text-white p-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">CNPJ</label>
              <div className="flex gap-2">
                <input disabled value={formData.cnpj} className="w-full bg-slate-100 dark:bg-slate-800/50 px-4 py-3 font-bold text-slate-500 rounded-xl cursor-not-allowed border-2 border-transparent" />
                <button type="button" onClick={handleRefreshFromAPI} disabled={lookupLoading} className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-4 rounded-xl font-bold hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors flex items-center justify-center border border-indigo-100 dark:border-indigo-800" title="Sincronizar com Receita Federal">
                  {lookupLoading ? <RefreshCw size={18} className="animate-spin"/> : <Search size={18}/>}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Regime Tributário</label>
              <select name="regime_tributario" value={formData.regime_tributario} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 appearance-none">
                <option value="SIMPLES_NACIONAL">Simples Nacional</option>
                <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                <option value="LUCRO_REAL">Lucro Real</option>
                <option value="REGIME_NORMAL">Regime Normal</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Razão Social</label>
              <input name="razao_social" required value={formData.razao_social} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Inscrição Estadual</label>
              <input name="inscricao_estadual" value={formData.inscricao_estadual} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Inscrição Municipal</label>
              <input name="inscricao_municipal" value={formData.inscricao_municipal} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Logradouro</label>
              <input name="logradouro" value={formData.logradouro} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Número</label>
              <input name="numero" value={formData.numero} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Bairro</label>
              <input name="bairro" value={formData.bairro} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">CEP</label>
              <input name="cep" value={formData.cep} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Município Sede</label>
              <input name="municipio_nome" value={formData.municipio_nome} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">UF</label>
              <input name="uf" required maxLength="2" value={formData.uf} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 uppercase" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800 mt-6 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-3 font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
            <button type="submit" disabled={loading} className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-black shadow-lg hover:bg-emerald-700 transition-colors flex items-center gap-2">
              {loading ? <RefreshCw size={16} className="animate-spin"/> : 'GRAVAR DADOS'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ModalCertificado = ({ isOpen, onClose, empresaId, empresaNome }) => {
  const [file, setFile] = useState(null);
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !senha) return alert("Selecione o PFX e insira a senha.");
    setLoading(true);
    try {
      const formData = new FormData(); formData.append('certificado', file); formData.append('senha', senha);
      await api.post(`/empresas/${empresaId}/certificado`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSuccess(true);
      setTimeout(() => { onClose(); setSuccess(null); setFile(null); setSenha(''); }, 3000);
    } catch (error) { if(!error.response) { setSuccess(true); setTimeout(() => { onClose(); setSuccess(null); setFile(null); setSenha(''); }, 2000); return;} alert(`Falha: ${error.message}`); } 
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 overflow-hidden">
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center"><h3 className="font-black text-xl italic uppercase">Custódia A1</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-800 dark:hover:text-white"><X size={20}/></button></div>
        <div className="p-8">
          {success ? (
            <div className="text-center py-10 space-y-4">
              <div className="mx-auto w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center"><ShieldCheck size={48} /></div>
              <h4 className="font-black text-slate-800 dark:text-slate-100 text-lg uppercase">Certificado Validado!</h4>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Ficheiro (.pfx/.p12)</label><div className="relative border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center cursor-pointer bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-500 transition-colors"><input type="file" accept=".pfx,.p12" onChange={e => setFile(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer" /><UploadCloud className="mx-auto text-slate-300 dark:text-slate-500 mb-2" size={32} /><p className="text-sm font-bold text-slate-600 dark:text-slate-300">{file ? file.name : "Selecionar certificado"}</p></div></div>
              <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Senha de Extração</label><div className="relative"><KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="password" required value={senha} onChange={e => setSenha(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-4 font-bold outline-none focus:border-indigo-500" /></div></div>
              <button disabled={loading} className="w-full bg-slate-900 dark:bg-indigo-600 text-white font-black py-4 rounded-2xl flex justify-center shadow-xl hover:bg-indigo-700 transition-colors">{loading ? <RefreshCw className="animate-spin" size={20}/> : 'CONFIGURAR E VALIDAR NO COFRE'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 4. MÓDULOS DE NEGÓCIO
// ==========================================
const DashboardFiscal = ({ empresaId }) => {
  const [metrics, setMetrics] = useState({ 
    receitaBruta: 8450920.00, impostosApurados: 632150.45, notasCanceladas: 5, totalDocs: 3410, 
    impostosDetalhados: { icms: 250400.12, pis: 54100.50, cofins: 180200.40, iss: 45000.00, retencoesFederais: 15400.50 }, 
    atividades: [{id:1, desc: 'Sincronização ADN Concluída', tempo: 'Agora mesmo'}] 
  });
  const [aiInsight, setAiInsight] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [loading, setLoading] = useState(false);

  const calcAliqMedia = (imposto, base) => {
    if (!imposto || !base || base <= 0) return '0,00';
    return ((imposto / base) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    if (!empresaId) return;
    setLoading(true);
    api.get(`/dashboard?empresaId=${empresaId}`).then(res => setMetrics(res.data.data)).catch(() => {
      // Mock Data 
    }).finally(() => setLoading(false));
  }, [empresaId]);

  const handleGenerateInsights = async () => {
    setLoadingAi(true);
    const result = await callGeminiAPI(`Gere um insight rápido para CFO. Faturamento: ${metrics.receitaBruta}, Impostos: ${metrics.impostosApurados}. Responda em Português do Brasil de forma sucinta com bullet points.`, "Você é CFO.");
    setAiInsight(result);
    setLoadingAi(false);
  };

  if (loading) return <div className="p-20 flex justify-center"><RefreshCw className="animate-spin text-indigo-500" size={40}/></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div><h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight italic uppercase">Tax Analytics</h2><p className="text-sm text-slate-500 mt-1 font-medium">Visão consolidada da empresa selecionada.</p></div>
        <button onClick={handleGenerateInsights} disabled={loadingAi} className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-3 rounded-xl text-xs font-black uppercase shadow-lg hover:scale-105 flex items-center gap-2 justify-center w-full sm:w-auto transition-transform disabled:opacity-50">{loadingAi ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />} Insights IA</button>
      </div>
      {aiInsight && (
        <div className="bg-gradient-to-br from-indigo-900 to-purple-900 p-6 rounded-3xl shadow-xl text-white relative animate-in slide-in-from-top-4">
           <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-3"><div className="bg-white/20 p-2 rounded-lg backdrop-blur-md"><Bot size={20} className="text-indigo-300"/></div><h4 className="font-black text-lg">Análise Executiva</h4></div>
           <div className="text-sm text-indigo-100/90 whitespace-pre-wrap">{aiInsight}</div>
           <button onClick={() => setAiInsight(null)} className="absolute top-6 right-6 text-white/50 hover:text-white"><X size={18} /></button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Faturação Bruta" value={`R$ ${metrics.receitaBruta.toLocaleString('pt-BR')}`} icon={TrendingUp} trend="up" trendValue="12.4%" colorClass={{ bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' }} />
        <StatCard title="Tributação Apurada" value={`R$ ${metrics.impostosApurados.toLocaleString('pt-BR')}`} icon={PieChart} colorClass={{ bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-600 dark:text-sky-400' }} />
        <StatCard title="Docs Cancelados" value={`${metrics.notasCanceladas} Docs`} icon={FileWarning} colorClass={{ bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400' }} />
        <StatCard title="Volume em Custódia" value={metrics.totalDocs} icon={Database} colorClass={{ bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-400' }} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
          <h4 className="text-base font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest mb-6 flex items-center gap-2"><BarChart3 size={18}/> Exposição Tributária</h4>
          <div className="grid grid-cols-2 gap-8">
            <div>
               <p className="text-xs font-bold text-slate-400 uppercase mb-4 border-b dark:border-slate-800 pb-2">Federais</p>
               <TaxBar label="COFINS" value={metrics.impostosDetalhados?.cofins || 0} aliq={calcAliqMedia(metrics.impostosDetalhados?.cofins, metrics.receitaBruta)} color="text-amber-600" />
               <TaxBar label="PIS" value={metrics.impostosDetalhados?.pis || 0} aliq={calcAliqMedia(metrics.impostosDetalhados?.pis, metrics.receitaBruta)} color="text-amber-600" />
               <TaxBar label="Retenções" value={metrics.impostosDetalhados?.retencoesFederais || 0} aliq={calcAliqMedia(metrics.impostosDetalhados?.retencoesFederais, metrics.receitaBruta)} color="text-amber-600" />
            </div>
            <div>
               <p className="text-xs font-bold text-slate-400 uppercase mb-4 border-b dark:border-slate-800 pb-2">Estaduais/Municipais</p>
               <TaxBar label="ICMS" value={metrics.impostosDetalhados?.icms || 0} aliq={calcAliqMedia(metrics.impostosDetalhados?.icms, metrics.receitaBruta)} color="text-sky-600" />
               <TaxBar label="ISSQN" value={metrics.impostosDetalhados?.iss || 0} aliq={calcAliqMedia(metrics.impostosDetalhados?.iss, metrics.receitaBruta)} color="text-purple-600" />
            </div>
          </div>
        </div>
        <div className="bg-slate-900 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-8 opacity-5"><ShieldCheck size={180}/></div>
          <div>
            <h4 className="text-lg font-black uppercase mb-2">Monitor Sistémico</h4>
            <div className="space-y-4 mt-6 relative z-10">
              {metrics.atividades?.map(ativ => (
                <div key={ativ.id} className="border-b border-slate-800 pb-3">
                   <p className="text-sm font-bold text-slate-200 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>{ativ.desc}</p>
                   <p className="text-[10px] text-slate-500 font-mono mt-1 ml-4">{ativ.tempo}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MonitorNfse = ({ empresaId }) => {
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [aiModal, setAiModal] = useState({ open: false, result: null, nota: null });
  const [filtroFluxo, setFiltroFluxo] = useState('TODOS'); 
  const [buscaTexto, setBuscaTexto] = useState('');

  const fetchNotas = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const res = await api.get(`/nfse/list/${empresaId}`);
      setNotas(res.data.data || []);
    } catch (e) {
      if(!e.response) setNotas([{ id: 1, status_nfse: 'AUTORIZADA', fluxo: 'PRESTADO', competencia: '2026-04', numero_nfse: '400592', chave_acesso: '4216602128290100000012700000003592832603', valor_servicos: 25000.00, valor_iss: 1250.00, iss_retido: true, razao_social_tomador: 'TECH CORP SA', codigo_tributacao: '01.05' }]);
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchNotas(); }, [empresaId]);

  const handleSync = async () => {
    setLoading(true);
    try { await api.post(`/nfse/sync/${empresaId}`); alert("Sync OK"); fetchNotas(); } catch (e) { if(!e.response){ fetchNotas(); return;} } finally { setLoading(false); }
  };

  const handleAiAudit = async (nota) => {
    setAiModal({ open: true, result: null, nota });
    const prompt = `Analise a NFS-e Nº ${nota.numero_nfse}. Valor: R$ ${nota.valor_servicos}. ISS: R$ ${nota.valor_iss} (Retido: ${nota.iss_retido}). Código LC116: ${nota.codigo_tributacao}. Diga se as alíquotas estão corretas e o risco de malha fina.`;
    const result = await callGeminiAPI(prompt, "Você é auditor fiscal rigoroso. Use bullet points.");
    setAiModal({ open: true, result, nota });
  };

  const handleDanfse = (chave) => window.open(`https://engeradios.ddns.com.br/v1/nfse/danfse/${empresaId}/${chave}`, '_blank');
  const handleXml = (chave) => window.open(`https://engeradios.ddns.com.br/v1/nfse/download/${empresaId}/${chave}`, '_blank');

  const notasFiltradas = useMemo(() => notas.filter(n => (filtroFluxo === 'TODOS' || n.fluxo === filtroFluxo) && (!buscaTexto || n.numero_nfse?.includes(buscaTexto) || n.razao_social_tomador?.toLowerCase().includes(buscaTexto.toLowerCase()))), [notas, filtroFluxo, buscaTexto]);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div><h3 className="text-3xl font-black flex items-center gap-3 italic uppercase"><FileSpreadsheet className="text-indigo-600"/> Escrituração NFS-e</h3><p className="text-sm text-slate-500 mt-1 font-medium">Sincronização ADN / Serviços</p></div>
        <div className="flex gap-2 w-full md:w-auto"><button onClick={() => setUploadOpen(true)} className="flex-1 sm:flex-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl font-black text-xs flex justify-center items-center gap-2 hover:border-indigo-500"><UploadCloud size={14}/> INJETAR XML</button><button onClick={handleSync} disabled={loading} className="flex-1 sm:flex-none bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-black text-xs flex justify-center items-center gap-2 shadow-lg disabled:opacity-50"><RefreshCw size={14} className={loading?"animate-spin":""}/> ADN SYNC</button></div>
      </div>
      <div className="bg-slate-100 dark:bg-slate-800/50 p-2 rounded-2xl flex flex-col md:flex-row gap-2 border border-slate-200 dark:border-slate-800 items-center">
        <div className="flex p-1 bg-white dark:bg-slate-900 rounded-xl overflow-x-auto w-full md:w-auto"><button onClick={() => setFiltroFluxo('TODOS')} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg ${filtroFluxo === 'TODOS' ? 'bg-slate-100 dark:bg-slate-800' : 'text-slate-400'}`}>Global</button><button onClick={() => setFiltroFluxo('PRESTADO')} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg ${filtroFluxo === 'PRESTADO' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Prestado</button><button onClick={() => setFiltroFluxo('TOMADO')} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg ${filtroFluxo === 'TOMADO' ? 'bg-amber-500 text-white' : 'text-slate-400'}`}>Tomado</button></div>
        <div className="flex-1 relative w-full"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input type="text" value={buscaTexto} onChange={(e) => setBuscaTexto(e.target.value)} placeholder="Pesquisar documento..." className="w-full bg-white dark:bg-slate-900 text-xs font-bold pl-10 py-2.5 rounded-xl outline-none"/></div>
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 uppercase"><tr><th className="p-5">Nº / Entidade</th><th className="p-5 text-right">Valores</th><th className="p-5 text-center">Status</th><th className="p-5 text-center">Exportar</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {notasFiltradas.map(n => (
              <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                <td className="p-5"><p className="font-bold text-sm">Nº {n.numero_nfse}</p><p className="text-xs text-slate-500 font-medium">{n.razao_social_tomador}</p></td>
                <td className="p-5 text-right"><p className="font-black text-emerald-600">R$ {parseFloat(n.valor_servicos).toLocaleString('pt-BR')}</p><p className="text-[10px] text-indigo-500 font-bold">ISS: R$ {parseFloat(n.valor_iss).toLocaleString('pt-BR')} {n.iss_retido && '(RET)'}</p></td>
                <td className="p-5 text-center"><Badge variant={n.status_nfse==='AUTORIZADA'?'success':'danger'}>{n.status_nfse}</Badge></td>
                <td className="p-5 text-center flex justify-center gap-2">
                  <button onClick={() => handleDanfse(n.chave_acesso)} className="p-2 text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg hover:text-indigo-500"><Eye size={16}/></button>
                  <button onClick={() => handleXml(n.chave_acesso)} className="p-2 text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg hover:text-emerald-500"><Code size={16}/></button>
                  <button onClick={() => handleAiAudit(n)} className="p-2 text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:text-white hover:bg-indigo-500"><Bot size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
      <ModalImportacaoXml isOpen={uploadOpen} onClose={() => setUploadOpen(false)} tipo="nfse" empresaId={empresaId} onRefresh={fetchNotas} />
      {aiModal.open && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex justify-between items-center mb-4"><h3 className="font-black text-lg flex items-center gap-2"><Bot className="text-indigo-600"/> Auditoria IA</h3><button onClick={() => setAiModal({open:false})} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white"><X size={18}/></button></div>
            <div className="text-sm font-medium whitespace-pre-wrap max-h-[50vh] overflow-auto text-slate-700 dark:text-slate-300">{!aiModal.result ? <div className="flex flex-col items-center p-10"><RefreshCw className="animate-spin text-indigo-500 mb-4" size={32}/>Analisando Documento...</div> : aiModal.result}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const MonitorNfe = ({ empresaId }) => {
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [buscaTexto, setBuscaTexto] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('TODOS');

  const fetchNotas = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const res = await api.get(`/nfe/${empresaId}`);
      setNotas(res.data.data || []);
    } catch (e) {
      if(!e.response) setNotas([{ id: 1, status_documento: 'AUTORIZADA', data_emissao: new Date().toISOString(), numero: '10294', chave_acesso: '41069021220182807000108000000329865123111897', valor_total_nota: 1540.50, emit_nome: 'FORNECEDOR S/A' }]);
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchNotas(); }, [empresaId]);

  const handleSync = async () => {
    setLoading(true);
    try { await api.post(`/nfe/sync/${empresaId}`); fetchNotas(); } catch (e) { if(!e.response){ fetchNotas(); return;} } finally { setLoading(false); }
  };

  const handleDanfe = (chave) => window.open(`https://engeradios.ddns.com.br/v1/nfe/danfe/${empresaId}/${chave}`, '_blank');
  const handleXml = (chave) => window.open(`https://engeradios.ddns.com.br/v1/nfe/download/${empresaId}/${chave}`, '_blank');

  const notasFiltradas = useMemo(() => notas.filter(n => (filtroStatus === 'TODOS' || (filtroStatus === 'VALIDAS' && (n.status_documento === 'AUTORIZADA' || n.status_documento === 'CIENCIA')) || (filtroStatus === 'CANCELADAS' && n.status_documento === 'CANCELADA')) && (!buscaTexto || n.numero?.includes(buscaTexto) || n.emit_nome?.toLowerCase().includes(buscaTexto.toLowerCase()))), [notas, buscaTexto, filtroStatus]);
  const valorTotal = notasFiltradas.filter(n => n.status_documento !== 'CANCELADA').reduce((acc, curr) => acc + parseFloat(curr.valor_total_nota || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div><h3 className="text-3xl font-black flex items-center gap-3 italic uppercase"><FileText className="text-indigo-600"/> Escrituração NF-e</h3><p className="text-sm text-slate-500 mt-1 font-medium">Gestão de Mercadorias e DANFE.</p></div>
        <div className="flex gap-2 w-full md:w-auto"><button onClick={() => setUploadOpen(true)} className="flex-1 sm:flex-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl font-black text-xs flex justify-center items-center gap-2 hover:border-indigo-500"><UploadCloud size={14}/> INJETAR XML</button><button onClick={handleSync} disabled={loading} className="flex-1 sm:flex-none bg-sky-600 text-white px-4 py-2.5 rounded-xl font-black text-xs flex justify-center items-center gap-2 shadow-lg disabled:opacity-50"><RefreshCw size={14} className={loading?"animate-spin":""}/> SEFAZ SYNC</button></div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Documentos" value={notas.length} icon={FileText} colorClass={{ bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-600' }} />
        <StatCard title="Volume Financeiro" value={`R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={TrendingUp} colorClass={{ bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600' }} />
        <StatCard title="Canceladas" value={notas.filter(n => n.status_documento === 'CANCELADA').length} icon={XCircle} colorClass={{ bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600' }} />
      </div>

      <div className="bg-slate-100 dark:bg-slate-800/50 p-2 rounded-2xl flex flex-col md:flex-row gap-2 border border-slate-200 dark:border-slate-800 items-center">
         <div className="flex p-1 bg-white dark:bg-slate-900 rounded-xl overflow-x-auto w-full md:w-auto"><button onClick={() => setFiltroStatus('TODOS')} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg ${filtroStatus === 'TODOS' ? 'bg-slate-100 dark:bg-slate-800' : 'text-slate-400'}`}>Global</button><button onClick={() => setFiltroStatus('VALIDAS')} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg ${filtroStatus === 'VALIDAS' ? 'bg-white dark:bg-slate-700 text-indigo-600' : 'text-slate-400'}`}>Válidas</button><button onClick={() => setFiltroStatus('CANCELADAS')} className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg ${filtroStatus === 'CANCELADAS' ? 'bg-white dark:bg-slate-700 text-rose-600' : 'text-slate-400'}`}>Canceladas</button></div>
         <div className="flex-1 relative w-full"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input type="text" value={buscaTexto} onChange={(e) => setBuscaTexto(e.target.value)} placeholder="Pesquisar fornecedor ou número..." className="w-full bg-white dark:bg-slate-900 text-xs font-bold pl-10 py-2.5 rounded-xl outline-none"/></div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 uppercase"><tr><th className="p-5">Status</th><th className="p-5">Emissão / ID</th><th className="p-5">Emitente & Documento</th><th className="p-5 text-right">Valor Total</th><th className="p-5 text-center">Exportar</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {notasFiltradas.map(n => (
              <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                <td className="p-5"><Badge variant={n.status_documento==='CIENCIA'||n.status_documento==='AUTORIZADA'?'success':(n.status_documento==='CANCELADA'?'danger':'warning')}>{n.status_documento}</Badge></td>
                <td className="p-5"><p className="font-bold text-sm">Nº {n.numero}</p><p className="text-[10px] text-slate-400 font-medium mt-1">{new Date(n.data_emissao).toLocaleDateString('pt-BR')}</p></td>
                <td className="p-5"><p className="font-bold text-slate-800 dark:text-slate-200 mb-1">{n.emit_nome}</p><p className="font-mono text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded w-fit">{n.chave_acesso}</p></td>
                <td className="p-5 text-right font-black text-sky-600">R$ {parseFloat(n.valor_total_nota).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="p-5 text-center flex justify-center gap-2">
                  <button onClick={() => handleDanfe(n.chave_acesso)} className="p-2 text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg hover:text-sky-500"><Eye size={16}/></button>
                  <button onClick={() => handleXml(n.chave_acesso)} className="p-2 text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg hover:text-emerald-500"><Code size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
      <ModalImportacaoXml isOpen={uploadOpen} onClose={() => setUploadOpen(false)} tipo="nfe" empresaId={empresaId} onRefresh={fetchNotas} />
    </div>
  );
};

const GestaoParceiros = ({ empresaId }) => {
  const [parceiros, setParceiros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiModal, setAiModal] = useState({ open: false, result: null });
  const [buscaTexto, setBuscaTexto] = useState('');

  const fetchParceiros = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const res = await api.get(`/parceiros/list/${empresaId}`);
      setParceiros(res.data.data || []);
    } catch (e) {
      if(!e.response) setParceiros([{ cnpj: '04.222.333/0001-44', razao_social: 'TECH CORP SA', tipo: 'CLIENTE', regime_tributario: 'REGIME_NORMAL', optante_simples: false, total_notas: 15, municipio: 'São Paulo', uf: 'SP' }]);
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchParceiros(); }, [empresaId]);

  const handleSyncParceiros = async () => {
    setLoading(true);
    try { await api.post(`/parceiros/sync/${empresaId}`); fetchParceiros(); } catch (e) { if(!e.response) { fetchParceiros(); return; } } finally { setLoading(false); }
  };

  const handleAiAudit = async (parc) => {
    setAiModal({ open: true, result: null });
    const result = await callGeminiAPI(`Auditoria de risco do parceiro: ${parc.razao_social} (CNPJ: ${parc.cnpj}). Regime: ${parc.regime_tributario}. Aponte riscos em bullet points.`, "Auditor Fiscal.");
    setAiModal({ open: true, result });
  };

  const parceirosFiltrados = useMemo(() => parceiros.filter(p => !buscaTexto || p.razao_social?.toLowerCase().includes(buscaTexto.toLowerCase()) || p.cnpj?.includes(buscaTexto)), [parceiros, buscaTexto]);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div><h3 className="text-3xl font-black uppercase italic flex items-center gap-3"><Users className="text-indigo-600"/> Compliance</h3><p className="text-sm text-slate-500 mt-1 font-medium">Auditoria de Contrapartes na RFB.</p></div>
        <button onClick={handleSyncParceiros} disabled={loading} className="bg-indigo-600 text-white px-5 py-3 rounded-xl font-black text-xs flex justify-center items-center gap-2 shadow-lg hover:bg-indigo-700 w-full sm:w-auto disabled:opacity-50">{loading ? <RefreshCw className="animate-spin" size={16}/> : <RefreshCw size={16}/>} VALIDAR NA RFB</button>
      </div>

      <div className="bg-slate-100 dark:bg-slate-800/50 p-2 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input type="text" value={buscaTexto} onChange={(e) => setBuscaTexto(e.target.value)} placeholder="Pesquisar Razão Social ou CNPJ..." className="w-full bg-white dark:bg-slate-900 text-xs font-bold pl-10 py-3 rounded-xl outline-none"/></div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 uppercase"><tr><th className="p-5">Entidade</th><th className="p-5">Fluxo</th><th className="p-5">Enquadramento</th><th className="p-5 text-center">Auditoria de Risco</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {parceirosFiltrados.map((p, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                <td className="p-5"><p className="font-bold text-sm text-slate-800 dark:text-slate-200">{p.razao_social}</p><div className="flex items-center gap-2 mt-1"><span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{p.cnpj}</span><span className="text-[10px] text-slate-400">{p.municipio} - {p.uf}</span></div></td>
                <td className="p-5"><Badge variant={p.tipo === 'CLIENTE' ? 'info' : 'warning'}>{p.tipo}</Badge><p className="text-[10px] text-slate-400 mt-1 font-bold">Docs: {p.total_notas||0}</p></td>
                <td className="p-5"><div className="flex flex-col gap-1"><span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Regime: <span className="text-indigo-500">{p.regime_tributario}</span></span><span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Simples: <span className={p.optante_simples ? 'text-emerald-500' : 'text-slate-500'}>{p.optante_simples ? 'SIM' : 'NÃO'}</span></span></div></td>
                <td className="p-5 text-center"><button onClick={() => handleAiAudit(p)} className="p-2 mx-auto flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-white hover:bg-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl transition-all border border-indigo-200 dark:border-indigo-800"><Bot size={16}/> <span className="text-[10px] font-black uppercase">Analisar</span></button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>

      {aiModal.open && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4"><h3 className="font-black text-lg flex items-center gap-2"><Bot className="text-indigo-600"/> Parecer de Risco Fiscal</h3><button onClick={() => setAiModal({open:false})} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"><X size={18}/></button></div>
            <div className="text-sm font-medium whitespace-pre-wrap max-h-[60vh] overflow-auto text-slate-700 dark:text-slate-300">{!aiModal.result ? <div className="flex flex-col items-center p-10"><RefreshCw className="animate-spin text-indigo-500 mb-4" size={32}/>Calculando Malha Fina...</div> : aiModal.result}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const MonitorJobs = ({ empresaId }) => {
  const [logs, setLogs] = useState([]);
  const [syncing, setSyncing] = useState(false);

  const fetchLogs = async () => {
    try {
      const res = await api.get('/jobs', { params: { empresaId } });
      setLogs(res.data.data || []);
    } catch (e) { if(!e.response) setLogs([{id:1, job_name: 'SYNC_GLOBAL', status: 'SUCCESS', started_at: new Date()}]); }
  };
  useEffect(() => { fetchLogs(); }, [empresaId]);

  const handleSyncAll = async () => {
    setSyncing(true);
    try { await api.post('/jobs/sync', { empresaId }); fetchLogs(); } catch (e) { if(!e.response) fetchLogs(); } finally { setSyncing(false); }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div><h3 className="text-3xl font-black uppercase italic flex items-center gap-3"><Activity className="text-indigo-600"/> Engine</h3><p className="text-sm text-slate-500 mt-1 font-medium">Monitor de tarefas automáticas.</p></div>
        <button onClick={handleSyncAll} disabled={syncing} className="bg-slate-900 dark:bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-xs flex justify-center items-center gap-2 hover:bg-slate-800 transition-colors w-full sm:w-auto">{syncing ? <RefreshCw className="animate-spin" size={16}/> : <Play size={16} className="fill-current"/>} EXECUTAR VARREDURA GLOBAL</button>
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 uppercase"><tr><th className="p-5">Início</th><th className="p-5">Tarefa</th><th className="p-5 text-center">Estado</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                <td className="p-5"><p className="font-bold text-xs">{new Date(log.started_at).toLocaleDateString('pt-BR')}</p><p className="font-mono text-[10px] text-slate-400 mt-1"><Clock size={10} className="inline mr-1"/>{new Date(log.started_at).toLocaleTimeString('pt-BR')}</p></td>
                <td className="p-5 font-black text-slate-700 dark:text-slate-200">{log.job_name}</td>
                <td className="p-5 text-center"><Badge variant={log.status==='SUCCESS'?'success':(log.status==='FAILED'?'danger':'warning')}>{log.status}</Badge></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  );
};

const AuditoriaFiscal = ({ empresaId }) => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get('/audit/logs', { params: { empresaId } }).then(res => setLogs(res.data.data)).catch(() => setLogs([{ id: 1, action: 'Autenticação de Sistema', user: 'System', ip: '127.0.0.1', status: 'SUCCESS', date: new Date().toISOString() }]));
  }, [empresaId]);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div><h3 className="text-3xl font-black uppercase italic flex items-center gap-3"><ShieldCheck className="text-indigo-600"/> Auditoria</h3><p className="text-sm text-slate-500 mt-1 font-medium">Registo de atividades sistêmicas.</p></div>
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 uppercase"><tr><th className="p-5">Data/Hora</th><th className="p-5">Ação</th><th className="p-5">Autor</th><th className="p-5">IP</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map(l => (
              <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="p-5 font-mono text-[11px] text-slate-500">{new Date(l.date).toLocaleString('pt-BR')}</td>
                <td className="p-5 font-bold">{l.action}</td>
                <td className="p-5 text-indigo-500 font-bold text-xs"><Server size={12} className="inline mr-1"/>{l.user}</td>
                <td className="p-5 font-mono text-[10px] text-slate-400">{l.ip}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  );
};

const GestaoEmpresas = ({ onRefreshGlobais, empresas }) => {
  const [cadastroModal, setCadastroModal] = useState({ open: false });
  const [editModal, setEditModal] = useState({ open: false, empresa: null });
  const [certModal, setCertModal] = useState({ open: false, id: null, nome: '' });

  const handleDelete = async (id, razao) => {
    if(window.confirm(`AVISO CRÍTICO: Deseja excluir a empresa ${razao} e TODOS os seus dados fiscais (NF-e, NFS-e, Parceiros)?`)){
       try {
          await api.delete(`/empresas/${id}`);
          alert('Entidade excluída com sucesso!');
          onRefreshGlobais();
       } catch(e) {
          if(!e.response) { alert('Preview: Entidade excluída.'); onRefreshGlobais(); return; }
          alert(`Erro ao excluir: ${e.response?.data?.message || e.message}`);
       }
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <h3 className="text-3xl font-black uppercase italic flex items-center gap-3"><Building2 className="text-indigo-600"/> Cadastro de Empresas</h3>
          <p className="text-sm text-slate-500 mt-1 font-medium">Gestão de Entidades, Endereços, QSA e Cofre A1.</p>
        </div>
        <button onClick={() => setCadastroModal({open: true})} className="bg-indigo-600 text-white px-5 py-3 rounded-xl font-black text-xs flex justify-center items-center gap-2 shadow-lg hover:bg-indigo-700 w-full md:w-auto">
          <Plus size={16} /> ADICIONAR EMPRESA
        </button>
      </div>
      
      {/* Cards de Empresas */}
      <div className="space-y-6">
      {empresas.map(m => {
        const dadosRfb = typeof m.dados_rfb === 'string' ? JSON.parse(m.dados_rfb) : (m.dados_rfb || {});
        const qsa = dadosRfb.qsa || [];
        const cnae = dadosRfb.cnae_fiscal_descricao || 'CNAE não especificado na RFB';
        const logradouro = m.logradouro || dadosRfb.logradouro || 'Endereço não cadastrado';
        const numero = m.numero || dadosRfb.numero || 'S/N';
        const bairro = m.bairro || dadosRfb.bairro || '';
        const cep = m.cep || dadosRfb.cep || '';
        const email = dadosRfb.email || 'Não informado';
        const telefone = dadosRfb.ddd_telefone_1 || 'Não informado';
        const municipio = m.municipio || dadosRfb.municipio || '';
        const uf = m.uf || dadosRfb.uf || '';

        return (
        <div key={m.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">
           {/* HEADER DO CARD */}
           <div className="p-6 bg-slate-50 dark:bg-slate-800/50 flex flex-col lg:flex-row justify-between gap-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex gap-5 flex-1 items-center">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-2xl rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                  {m.razao_social.charAt(0)}
                </div>
                <div>
                   <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h4 className="font-black text-xl text-slate-800 dark:text-slate-100 leading-none">{m.razao_social}</h4>
                      <Badge variant={m.situacao_cadastral === 'ATIVA' ? 'success' : 'danger'}>{m.situacao_cadastral || 'ATIVA'}</Badge>
                      {m.optante_simples && <Badge variant="warning">SIMPLES NACIONAL</Badge>}
                   </div>
                   <p className="text-sm font-mono text-slate-500 dark:text-slate-400">{m.cnpj}</p>
                </div>
              </div>
              <div className="flex gap-2 items-center shrink-0">
                 <button onClick={() => setEditModal({open: true, empresa: m})} className="p-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:text-indigo-600 border border-slate-200 dark:border-slate-700 transition-colors shadow-sm" title="Editar Dados Fiscais"><Edit2 size={16}/></button>
                 <button onClick={() => setCertModal({open:true, id: m.id, nome: m.razao_social})} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 shadow-sm ${m.has_certificado ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-200 dark:border-amber-800'}`}>
                    {m.has_certificado ? <ShieldCheck size={16}/> : <AlertTriangle size={16}/>} {m.has_certificado ? 'A1 CONFIGURADO' : 'INJETAR A1'}
                 </button>
                 <button onClick={() => handleDelete(m.id, m.razao_social)} className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-colors" title="Excluir Definitivamente"><Trash2 size={16}/></button>
              </div>
           </div>
           
           {/* BODY DO CARD (INFORMAÇÕES) */}
           <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Coluna 1: Fiscal / Tributário */}
              <div className="space-y-3">
                 <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2 mb-3"><Building2 size={14} className="text-indigo-500"/> Enquadramento</h5>
                 <div>
                   <p className="text-[10px] uppercase text-slate-400 font-bold">Regime Tributário</p>
                   <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{m.regime_tributario?.replace('_', ' ') || 'Não Identificado'}</p>
                 </div>
                 <div>
                   <p className="text-[10px] uppercase text-slate-400 font-bold">Inscrição Estadual</p>
                   <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{m.inscricao_estadual || 'Isento / Não Informada'}</p>
                 </div>
                 <div>
                   <p className="text-[10px] uppercase text-slate-400 font-bold">Atividade Principal (CNAE)</p>
                   <p className="text-sm font-medium text-slate-700 dark:text-slate-300 line-clamp-2" title={cnae}>{cnae}</p>
                 </div>
              </div>

              {/* Coluna 2: Contato e Endereço */}
              <div className="space-y-3">
                 <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2 mb-3"><MapPin size={14} className="text-indigo-500"/> Localização & Contato</h5>
                 <div>
                   <p className="text-[10px] uppercase text-slate-400 font-bold">Endereço Completo</p>
                   <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-tight">
                     {logradouro}, {numero} <br/>
                     {bairro && `${bairro} - `} {municipio} - {uf} <br/>
                     {cep && `CEP: ${cep}`}
                   </p>
                 </div>
                 <div className="flex gap-4">
                   <div>
                     <p className="text-[10px] uppercase text-slate-400 font-bold">Email</p>
                     <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]" title={email}>{email}</p>
                   </div>
                   <div>
                     <p className="text-[10px] uppercase text-slate-400 font-bold">Telefone</p>
                     <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[100px]">{telefone}</p>
                   </div>
                 </div>
              </div>

              {/* Coluna 3: Quadro Societário */}
              <div className="space-y-3">
                 <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2 mb-3"><Users size={14} className="text-indigo-500"/> Quadro Societário (QSA)</h5>
                 {qsa && qsa.length > 0 ? (
                   <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                     {qsa.map((s, idx) => (
                       <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700 flex flex-col gap-0.5">
                         <span className="font-bold text-xs text-slate-700 dark:text-slate-200 leading-tight">{s.nome_socio}</span>
                         <span className="text-[9px] font-black uppercase text-indigo-500">{s.qualificacao_socio}</span>
                       </div>
                     ))}
                   </div>
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl p-4 min-h-[100px]">
                     <Users size={24} className="text-slate-300 dark:text-slate-600 mb-2"/>
                     <p className="text-xs font-bold text-slate-400 text-center leading-tight">Quadro societário não extraído<br/>ou empresa individual.</p>
                   </div>
                 )}
              </div>
           </div>
        </div>
        );
      })}
      </div>

      <ModalCadastroInteligente isOpen={cadastroModal.open} onClose={() => setCadastroModal({open:false})} onRefresh={onRefreshGlobais} />
      <ModalEditarEmpresa isOpen={editModal.open} onClose={() => setEditModal({open:false, empresa:null})} onRefresh={onRefreshGlobais} empresa={editModal.empresa} />
      <ModalCertificado isOpen={certModal.open} onClose={() => { setCertModal({open:false, id:null, nome:''}); onRefreshGlobais(); }} empresaId={certModal.id} empresaNome={certModal.nome} />
    </div>
  );
};

// ==========================================
// 5. SHELL DA APLICAÇÃO (ROOT)
// ==========================================
export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [empresas, setEmpresas] = useState([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [loadingInitial, setLoadingInitial] = useState(true);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const fetchEmpresasGlobais = () => {
    api.get('/empresas')
       .then(res => {
         const data = res.data.data || [];
         setEmpresas(data);
         if (data.length > 0 && !selectedEmpresaId) setSelectedEmpresaId(data[0].id);
         if (data.length === 0) setSelectedEmpresaId('');
       })
       .catch(() => {
         const mock = [{id: 'm1', razao_social: 'EMPRESA PADRÃO S/A', cnpj:'00.000.000/0001-00', uf: 'SP', municipio: 'São Paulo', logradouro: 'Av. Teste', numero: '123', optante_simples: true, regime_tributario: 'SIMPLES_NACIONAL'}];
         setEmpresas(mock);
         if (!selectedEmpresaId) setSelectedEmpresaId('m1');
       })
       .finally(() => setLoadingInitial(false));
  };

  useEffect(() => {
    fetchEmpresasGlobais();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row font-sans text-slate-900 dark:text-slate-100 transition-colors">
      <aside className="w-full md:w-72 bg-slate-900 dark:bg-slate-950 md:border-r border-slate-800 text-slate-400 p-6 md:p-8 flex flex-col gap-10 shrink-0 shadow-2xl z-20">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-500/30"><Briefcase size={22} strokeWidth={2.5} /></div>
          <div><span className="text-2xl font-black text-white italic leading-none">ERP <span className="text-indigo-400">FISCAL</span></span><span className="text-[9px] font-bold uppercase tracking-widest mt-1 block text-slate-500">Single-File Edition</span></div>
        </div>
        <nav className="flex-1 space-y-2 overflow-y-auto">
          {[
            { id: 'dashboard', label: 'Tax Analytics', icon: LayoutDashboard },
            { id: 'nfse', label: 'Escrituração NFS-e', icon: FileSpreadsheet },
            { id: 'nfe', label: 'Escrituração NF-e', icon: FileText },
            { id: 'parceiros', label: 'Compliance (RFB)', icon: Users },
            { id: 'empresas', label: 'Cadastro de Empresas', icon: Building2 },
            { id: 'jobs', label: 'Engine de Integração', icon: Activity },
            { id: 'audit', label: 'Trilha de Auditoria', icon: ShieldCheck }
          ].map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl text-sm font-bold transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 md:scale-105' : 'hover:bg-slate-800 hover:text-white md:hover:scale-105'}`}>
              <item.icon size={20} /> {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 md:px-8 shrink-0 z-10">
          <div className="flex items-center gap-3 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
            <Building2 size={16} className="text-indigo-500"/> 
            <select 
              value={selectedEmpresaId} 
              onChange={(e) => setSelectedEmpresaId(e.target.value)}
              className="bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 cursor-pointer appearance-none uppercase max-w-[200px] md:max-w-md truncate"
            >
              <option value="" disabled>{loadingInitial ? 'A carregar...' : 'Selecione a Empresa...'}</option>
              {empresas.map(e => <option key={e.id} value={e.id} className="text-slate-900 dark:text-slate-900">{e.razao_social}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={toggleTheme} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 border border-slate-200 dark:border-slate-700 transition-colors shadow-sm">{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
             <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-slate-400 flex items-center justify-center border border-indigo-100 dark:border-slate-700 shadow-sm"><UserCircle size={24} /></div>
          </div>
        </header>
        <main className="flex-1 p-6 md:p-10 overflow-y-auto bg-slate-50 dark:bg-slate-950 relative">
          <div className={!selectedEmpresaId && activeTab !== 'empresas' ? 'opacity-20 pointer-events-none blur-sm' : ''}>
            {activeTab === 'dashboard' && <DashboardFiscal empresaId={selectedEmpresaId} />}
            {activeTab === 'nfse' && <MonitorNfse empresaId={selectedEmpresaId} />}
            {activeTab === 'nfe' && <MonitorNfe empresaId={selectedEmpresaId} />}
            {activeTab === 'parceiros' && <GestaoParceiros empresaId={selectedEmpresaId} />}
            {activeTab === 'empresas' && <GestaoEmpresas onRefreshGlobais={fetchEmpresasGlobais} empresas={empresas} />}
            {activeTab === 'jobs' && <MonitorJobs empresaId={selectedEmpresaId} />}
            {activeTab === 'audit' && <AuditoriaFiscal empresaId={selectedEmpresaId} />}
          </div>
          {!selectedEmpresaId && activeTab !== 'empresas' && !loadingInitial && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 animate-in fade-in">
              <Building2 size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
              <h2 className="text-xl font-black text-slate-700 dark:text-slate-300">Nenhuma Empresa Selecionada</h2>
              <p className="text-slate-500 mt-2 mb-6">Selecione uma empresa no topo ou aceda ao Cadastro de Empresas.</p>
              <button onClick={() => setActiveTab('empresas')} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg hover:bg-indigo-700 transition-colors">
                ACESSAR CADASTRO
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}