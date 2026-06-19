import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Download,
  RefreshCw,
  Calendar,
  DollarSign,
  Copy,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Globe,
  Coins,
  Settings,
  AlertCircle,
  Home,
  List,
  Calculator,
  Info,
  Database,
  Upload,
  Save,
  PieChart
} from 'lucide-react';
import { Transaction, Rates, CurrencyMode, RateKey } from './types';

export default function App() {
  // --- CORE STATE ---
  const [db, setDb] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('patrimonio_final_v10');
    return saved ? JSON.parse(saved) : [
      { id: 1, date: '09/06/2026', desc: 'Saldo Inicial Trabajo', amt: 500, type: 'in', curr: 'USD', cat: 'Salario' },
      { id: 2, date: '08/06/2026', desc: 'Suscripción Software', amt: 15, type: 'out', curr: 'USD', cat: 'Servicios' },
      { id: 3, date: '07/06/2026', desc: 'Honorarios Consulta Bs', amt: 12000, type: 'in', curr: 'BS', cat: 'Salario' }
    ];
  });

  const [rates, setRates] = useState<Rates>(() => {
    const saved = localStorage.getItem('patrimonio_rates');
    return saved ? JSON.parse(saved) : { usd: 57.5, eur: 62.15, bin: 58.2, par: 59.0 };
  });

  // Navigation tab state: 'resumen' | 'movimientos' | 'analista' | 'conversor'
  const [activeTab, setActiveTab] = useState<'resumen' | 'movimientos' | 'analista' | 'conversor'>('resumen');
  const [mode, setMode] = useState<CurrencyMode>('USD');
  const [activeKey, setActiveKey] = useState<RateKey>('usd');
  const [currMonth, setCurrMonth] = useState<number>(new Date().getMonth());
  const [currYear, setCurrYear] = useState<number>(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState('');
  
  // Synced status: 'syncing' | 'current' | 'offline'
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'current' | 'offline'>('syncing');
  const [isSyncing, setIsSyncing] = useState(false);

  // Active Account Wallet filter: 'all' | 'main' | 'ticket'
  const [activeWallet, setActiveWallet] = useState<'all' | 'main' | 'ticket'>('all');

  // Quick Converter fields
  const [qUsd, setQUsd] = useState('');
  const [qBs, setQBs] = useState('');
  const [copiedField, setCopiedField] = useState<'usd' | 'bs' | null>(null);

  // Backup & Restore states
  const [backupString, setBackupString] = useState('');
  const [isBackupCopied, setIsBackupCopied] = useState(false);
  const [importError, setImportError] = useState('');
  const [isImportSuccess, setIsImportSuccess] = useState(false);
  const [rawImportText, setRawImportText] = useState('');

  // Transaction form bottom-sheet modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formDesc, setFormDesc] = useState('');
  const [formAmt, setFormAmt] = useState('');
  const [formType, setFormType] = useState<'in' | 'out'>('in');
  const [formCurr, setFormCurr] = useState<'USD' | 'BS'>('USD');
  const [formCat, setFormCat] = useState('Otros');
  const [formDate, setFormDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // Account/wallet form fields
  const [formWallet, setFormWallet] = useState<'main' | 'ticket'>('main');
  const [formBank, setFormBank] = useState<string>('Venezuela');
  const [formMethod, setFormMethod] = useState<string>('Pago Móvil');
  const [formIsInterbank, setFormIsInterbank] = useState<boolean>(true);

  // Force BS currency for Ticket de Alimentación
  useEffect(() => {
    if (formWallet === 'ticket') {
      setFormCurr('BS');
    }
  }, [formWallet]);

  // Manual exchange rates editor overlay
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempRates, setTempRates] = useState<Rates>({ ...rates });

  // --- API RATE FETCHING SERVICE ---
  const loadRates = async (forceSilently = false) => {
    if (!forceSilently) setIsSyncing(true);
    setSyncStatus('syncing');
    
    try {
      // 1. Fetch official & parallel rates in Venezuela (DolarAPI)
      const resVal = await fetch('https://ve.dolarapi.com/v1/dolares');
      if (!resVal.ok) {
        throw new Error(`Error en el servidor de DolarAPI: ${resVal.status}`);
      }
      const dataVal = await resVal.json();

      // 2. Fetch official Euro rate in Venezuela (DolarAPI)
      let eurRate: number | null = null;
      try {
        const resEur = await fetch('https://ve.dolarapi.com/v1/euros');
        if (resEur.ok) {
          const dataEur = await resEur.json();
          const bcvEurObj = dataEur.find((d: any) => d.fuente === 'oficial' || d.nombre === 'Euro');
          if (bcvEurObj) {
            eurRate = Number(bcvEurObj.promedio);
          }
        }
      } catch (errEur) {
        console.warn('Error al obtener tasa BCV Euro directa. Usando estimación de contingencia.', errEur);
      }

      // 3. Fetch global cross-currency conversion factors as backup
      let eurFactor = 0.92;
      try {
        const resGlob = await fetch('https://open.er-api.com/v6/latest/USD');
        if (resGlob.ok) {
          const dataGlob = await resGlob.json();
          if (dataGlob?.rates?.EUR) {
            eurFactor = dataGlob.rates.EUR;
          }
        }
      } catch (errGlob) {
        console.warn('Error al obtener factor global de euro de respaldo.', errGlob);
      }

      // Map API payload safely with multi-attribute compatibility
      const bcvRateObj = dataVal.find((d: any) => d.fuente === 'oficial' || d.nombre === 'Dólar');
      const bcvRate = bcvRateObj ? bcvRateObj.promedio : null;

      const parRateObj = dataVal.find((d: any) => d.fuente === 'paralelo' || d.nombre === 'Paralelo');
      const parRate = parRateObj ? parRateObj.promedio : null;

      const updatedRates = { ...rates };

      if (bcvRate) {
        updatedRates.usd = Number(bcvRate);
      }
      
      if (parRate) {
        updatedRates.par = Number(parRate);
      }

      // Apply real euro rate if retrieved, otherwise fallback
      if (eurRate) {
        updatedRates.eur = eurRate;
      } else if (bcvRate) {
        updatedRates.eur = bcvRate / eurFactor;
      } else {
        updatedRates.eur = updatedRates.usd / eurFactor;
      }

      // Estimate Binance (standard P2P discount in VE: par - ~0.25 Bs)
      if (updatedRates.par) {
        updatedRates.bin = updatedRates.par - 0.25;
      }

      // Precision round
      updatedRates.usd = Number(updatedRates.usd.toFixed(4));
      updatedRates.par = Number(updatedRates.par.toFixed(4));
      updatedRates.eur = Number(updatedRates.eur.toFixed(4));
      updatedRates.bin = Number(updatedRates.bin.toFixed(4));

      setRates(updatedRates);
      setTempRates(updatedRates);
      localStorage.setItem('patrimonio_rates', JSON.stringify(updatedRates));
      setSyncStatus('current');
    } catch (e) {
      console.warn('Fallas en la API externa. Usando bases de contingencia:', e);
      setSyncStatus('offline');
    } finally {
      setIsSyncing(false);
    }
  };

  // On Mount
  useEffect(() => {
    loadRates();

    const handleOnline = () => {
      loadRates(true);
    };
    const handleOffline = () => {
      setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save database to localStorage on modifications
  useEffect(() => {
    localStorage.setItem('patrimonio_final_v10', JSON.stringify(db));
  }, [db]);

  // --- BACKUP & RESTORE HELPERS ---
  const handleExportBackupText = () => {
    const backupObj = {
      version: 'patrimonio_pro_v10',
      timestamp: new Date().toISOString(),
      transactions: db,
      rates: rates
    };
    const dataStr = JSON.stringify(backupObj, null, 2);
    setBackupString(dataStr);
    
    // Copy to clipboard
    navigator.clipboard.writeText(dataStr).then(() => {
      setIsBackupCopied(true);
      setTimeout(() => setIsBackupCopied(false), 2000);
    });
  };

  const handleDownloadBackupFile = () => {
    const backupObj = {
      version: 'patrimonio_pro_v10',
      timestamp: new Date().toISOString(),
      transactions: db,
      rates: rates
    };
    const dataStr = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PatrimonioPro_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportBackupText = (rawJson: string) => {
    try {
      setImportError('');
      setIsImportSuccess(false);
      
      const parsed = JSON.parse(rawJson);
      
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('El formato no es un objeto JSON válido');
      }
      
      if (parsed.version !== 'patrimonio_pro_v10' && !parsed.transactions) {
        throw new Error('Formato incompatible: no se detecta la firma del software Patrimonio Pro');
      }
      
      const importedTx = parsed.transactions;
      if (!Array.isArray(importedTx)) {
        throw new Error('La lista de movimientos cargada tiene un esquema inválido');
      }
      
      setDb(importedTx);
      
      if (parsed.rates) {
        setRates(parsed.rates);
        setTempRates(parsed.rates);
      }
      
      setIsImportSuccess(true);
      setRawImportText('');
      setTimeout(() => {
        setIsImportSuccess(false);
        setIsSettingsOpen(false);
      }, 1500);
    } catch (e: any) {
      setImportError(e.message || 'Error desconocido al validar el respaldo');
    }
  };

  // --- CATEGORY BRANDING STYLES ---
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Alimentación': return 'bg-emerald-500';
      case 'Servicios': return 'bg-sky-500';
      case 'Gustos / Ocio': return 'bg-fuchsia-500';
      case 'Transporte': return 'bg-amber-500';
      case 'Salud': return 'bg-rose-500';
      case 'Salario': return 'bg-indigo-500';
      default: return 'bg-slate-500';
    }
  };

  const getCategoryTextColor = (cat: string) => {
    switch (cat) {
      case 'Alimentación': return 'text-emerald-400';
      case 'Servicios': return 'text-sky-400';
      case 'Gustos / Ocio': return 'text-fuchsia-400';
      case 'Transporte': return 'text-amber-400';
      case 'Salud': return 'text-rose-400';
      case 'Salario': return 'text-indigo-400';
      default: return 'text-slate-400';
    }
  };

  const currentExchangeRate = rates[activeKey];

  // Instantly recalculate converter when USD field updates
  const handleQUsdChange = (val: string) => {
    setQUsd(val);
    const numeric = parseInputAmt(val);
    if (val !== '' && !isNaN(numeric)) {
      setQBs((numeric * currentExchangeRate).toFixed(2));
    } else {
      setQBs('');
    }
  };

  // Instantly recalculate converter when BS field updates
  const handleQBsChange = (val: string) => {
    setQBs(val);
    const numeric = parseInputAmt(val);
    if (val !== '' && !isNaN(numeric)) {
      setQUsd((numeric / currentExchangeRate).toFixed(2));
    } else {
      setQUsd('');
    }
  };

  // Recount converter when rate card selection shifts
  useEffect(() => {
    if (qUsd !== '') {
      const numeric = parseInputAmt(qUsd);
      setQBs((numeric * currentExchangeRate).toFixed(2));
    }
  }, [activeKey, rates]);

  // Clean and parse text inputs into correct float numbers
  const parseInputAmt = (valStr: string): number => {
    if (!valStr) return 0;
    const clean = String(valStr).replace(/[^\d,.]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  };

  // Copy with micro-interaction trigger
  const copyToClipboard = (val: string, field: 'usd' | 'bs') => {
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1000);
    });
  };

  // Parse transaction date string "DD/MM/YYYY" safely
  const parseItemDate = (dateStr: string) => {
    try {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return {
          day: parseInt(parts[0]),
          month: parseInt(parts[1]) - 1,
          year: parseInt(parts[2])
        };
      }
    } catch (e) {
      // safe fallback
    }
    return { day: 1, month: new Date().getMonth(), year: new Date().getFullYear() };
  };

  // Change active statistics month
  const changeMonth = (direction: number) => {
    let nextMonth = currMonth + direction;
    let nextYear = currYear;

    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear++;
    } else if (nextMonth < 0) {
      nextMonth = 11;
      nextYear--;
    }

    setCurrMonth(nextMonth);
    setCurrYear(nextYear);
  };

  // Add Transaction Form submit
  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseInputAmt(formAmt);
    if (!formDesc.trim() || isNaN(amountNum) || amountNum <= 0) {
      alert('Por favor ingrese una descripción válida y un monto mayor a 0');
      return;
    }

    // Convert YYYY-MM-DD to DD/MM/YYYY
    const dateParts = formDate.split('-');
    if (dateParts.length !== 3) {
      alert('Por favor seleccione una fecha válida');
      return;
    }
    const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

    // commission calculation
    const calcCommission = (formType === 'in' && formWallet === 'main' && formBank !== 'Otros' && formIsInterbank)
      ? Number((amountNum * 0.003).toFixed(4))
      : 0;

    const nextId = db.length > 0 ? Math.max(...db.map((t) => t.id)) + 1 : 1;
    const newTx: Transaction = {
      id: nextId,
      date: formattedDate,
      desc: formDesc,
      amt: amountNum,
      type: formType,
      curr: formCurr,
      cat: formCat,
      wallet: formWallet,
      bank: (formType === 'in' && formWallet === 'main') ? formBank : undefined,
      method: (formType === 'in' && formWallet === 'main') ? formMethod : undefined,
      commission: calcCommission > 0 ? calcCommission : undefined
    };

    setDb([newTx, ...db]);
    
    // Reset Form fields
    setFormDesc('');
    setFormAmt('');
    setFormWallet('main');
    setFormBank('Venezuela');
    setFormMethod('Pago Móvil');
    setFormIsInterbank(true);
    setIsModalOpen(false);
  };

  const handleDeleteTransaction = (id: number) => {
    if (confirm('¿Desea eliminar este registro definitivamente?')) {
      setDb(db.filter((t) => t.id !== id));
    }
  };

  const handleSaveManualRates = (e: React.FormEvent) => {
    e.preventDefault();
    setRates(tempRates);
    localStorage.setItem('patrimonio_rates', JSON.stringify(tempRates));
    setIsSettingsOpen(false);
    setSyncStatus('offline');
  };

  const exportCSV = () => {
    if (db.length === 0) {
      alert('No hay registros para exportar');
      return;
    }

    let csv = '\ufeff'; // UTF-8 BOM representation
    csv += 'ID,Fecha,Concepto,Categoria,Tipo,Billetera,Banco,MetodoPago,Comision,MontoOriginal,MonedaOriginal,EquivalenteVisual,MonedaVisual\n';
    
    db.forEach((t) => {
      const visualVal = t.curr === mode 
        ? t.amt 
        : (mode === 'USD' ? t.amt / currentExchangeRate : t.amt * currentExchangeRate);

      const walletLabel = t.wallet === 'ticket' ? 'TICKET_ALIMENTACION' : 'CUENTA_PRINCIPAL';
      const bankLabel = t.bank || '';
      const methodLabel = t.method || '';
      const commLabel = t.commission ? t.commission.toString() : '0';

      csv += `${t.id},"${t.date}","${t.desc.replace(/"/g, '""')}","${t.cat}",${t.type === 'in' ? 'INGRESO' : 'GASTO'},"${walletLabel}","${bankLabel}","${methodLabel}",${commLabel},${t.amt},${t.curr},${visualVal.toFixed(2)},${mode}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PatrimonioPro_Movimientos_${currYear}_${currMonth + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- FINANCIAL CALCULATION MATH ---
  // We track both wallets separately: main account and ticket de alimentación (food ticket)
  let mainUSD = 0;
  let mainBS = 0;
  let ticketUSD = 0; // ticket wallet is typically BS, but track USD just in case
  let ticketBS = 0;

  let currentMonthIncome = 0;
  let currentMonthExpense = 0;

  db.forEach((t) => {
    const isIncome = t.type === 'in';
    const sign = isIncome ? 1 : -1;
    const isTicket = t.wallet === 'ticket';

    // Bank commission subtraction (deduct commission from received income)
    const effectiveAmt = (isIncome && t.commission) ? (t.amt - t.commission) : t.amt;

    if (isTicket) {
      if (t.curr === 'USD') {
        ticketUSD += effectiveAmt * sign;
      } else {
        ticketBS += effectiveAmt * sign;
      }
    } else {
      if (t.curr === 'USD') {
        mainUSD += effectiveAmt * sign;
      } else {
        mainBS += effectiveAmt * sign;
      }
    }

    // Monthly evaluation stats based on date, filtered by activeWallet selection
    const matchesWallet = 
      activeWallet === 'all' || 
      (activeWallet === 'main' && !isTicket) || 
      (activeWallet === 'ticket' && isTicket);

    if (matchesWallet) {
      const itemDate = parseItemDate(t.date);
      if (itemDate.month === currMonth && itemDate.year === currYear) {
        let compValue = effectiveAmt;
        if (t.curr !== mode) {
          compValue = mode === 'USD' ? effectiveAmt / currentExchangeRate : effectiveAmt * currentExchangeRate;
        }

        if (isIncome) {
          currentMonthIncome += compValue;
        } else {
          currentMonthExpense += compValue;
        }
      }
    }
  });

  const currentMonthNet = currentMonthIncome - currentMonthExpense;

  const activeUSD = activeWallet === 'all' ? (mainUSD + ticketUSD) : (activeWallet === 'main' ? mainUSD : ticketUSD);
  const activeBS = activeWallet === 'all' ? (mainBS + ticketBS) : (activeWallet === 'main' ? mainBS : ticketBS);

  // Filter list with month boundary, active wallet & user keyword search query
  const filteredTransactions = db.filter((t) => {
    const itemDate = parseItemDate(t.date);
    const matchesMonth = itemDate.month === currMonth && itemDate.year === currYear;
    
    const isTicket = t.wallet === 'ticket';
    const matchesWallet = 
      activeWallet === 'all' || 
      (activeWallet === 'main' && !isTicket) || 
      (activeWallet === 'ticket' && isTicket);
      
    const term = searchQuery.toLowerCase();
    const matchesSearch = t.desc.toLowerCase().includes(term) || 
                          t.cat.toLowerCase().includes(term) ||
                          t.date.includes(term) ||
                          t.amt.toString().includes(term);

    return matchesMonth && matchesWallet && matchesSearch;
  });

  const spanishMonths = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 flex items-center justify-center p-0 md:p-6 antialiased">
      
      {/* 
        CENTRAL APP FRAME CONTAINER: 
        Renders as a sleek smartphone/app device enclosure on desktop 
        and full-screen immersive on mobile with standard device borders.
      */}
      <div className="w-full max-w-[480px] h-[100vh] md:h-[860px] bg-[#0c1220] border-0 md:border-8 md:border-[#1e293b] md:rounded-[42px] shadow-2xl relative flex flex-col overflow-hidden">
        
        {/* --- APP STICKY STATUS BAR & HEADER BAR --- */}
        <header className="bg-[#090d16] border-b border-slate-800/80 px-4 py-3 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                <span>PATRIMONIO PRO</span>
                <span className="text-[10px] bg-blue-600/20 text-blue-400 border border-blue-500/20 px-1 py-0.2 rounded font-bold font-mono">V10</span>
              </h1>
              <p className="text-[9px] text-slate-400 leading-none mt-0.5">Control Financiero Integrado</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sync status pills */}
            {syncStatus === 'syncing' ? (
              <span className="text-[9px] text-slate-400 font-bold bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse"></span>
                SYNC...
              </span>
            ) : syncStatus === 'current' ? (
              <span className="text-[9px] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot"></span>
                TASAS AL DÍA
              </span>
            ) : (
              <span className="text-[9px] text-cyan-400 font-bold bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse-dot"></span>
                REESTABLECIDO
              </span>
            )}

            {/* Quick Actions */}
            <button
              onClick={() => loadRates()}
              disabled={isSyncing}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition active:scale-95 disabled:opacity-50"
              title="Actualizar tasas"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* --- VIEW CONTENT CONTAINER AREA With Scrollbar auto-scrolling --- */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
          
          {/* --- TAB VIEW 1: RESUMEN / INICIO --- */}
          {activeTab === 'resumen' && (
            <div className="space-y-4 animate-fadeIn text-xs">
              
              {/* TECHNICAL ACCOUNT WALLET SWITCHER */}
              <div className="bg-[#090d16] border border-slate-800 rounded-xl p-2 flex flex-col gap-1.5">
                <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500 uppercase px-1">
                  SYS.WALLETS // SELECCIÓN DE CUENTA
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { key: 'all', label: 'TODAS', desc: 'Suma Total' },
                    { key: 'main', label: 'PRINCIPAL', desc: 'Bancos / Efectivo' },
                    { key: 'ticket', label: 'CESTATICKET', desc: 'Alimentación' }
                  ].map((w) => (
                    <button
                      key={w.key}
                      onClick={() => setActiveWallet(w.key as 'all' | 'main' | 'ticket')}
                      className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-150 ${
                        activeWallet === w.key
                          ? 'bg-blue-600/10 border-blue-500 text-blue-400 font-extrabold shadow-[0_0_10px_rgba(59,130,246,0.15)]'
                          : 'bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-350 hover:bg-slate-900/60'
                      }`}
                    >
                      <span className="text-[10px] font-mono tracking-tight">{w.label}</span>
                      <span className="text-[8px] font-mono text-slate-500 leading-none mt-0.5">{w.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* NATIVE BALANCES DISPLAY PANEL */}
              <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 py-1 px-2.5 bg-blue-500/10 border-l border-b border-blue-500/20 text-[8px] font-mono font-black text-blue-400 rounded-bl uppercase">
                  SALDO DE BILLETERA
                </div>
                
                <h4 className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {activeWallet === 'all' 
                    ? 'BALANCE GENERAL COMBINADO' 
                    : activeWallet === 'main' 
                    ? 'BALANCE CUENTA PRINCIPAL' 
                    : 'BALANCE TICKET DE ALIMENTACIÓN'}
                </h4>

                {/* Primary Mode Balance */}
                <div className="text-3xl font-black font-mono tracking-tight text-white mt-1">
                  {mode === 'USD' ? (
                    <span className="flex items-center gap-1">
                      <span className="text-blue-500 font-sans text-xl font-bold">$</span>
                      {activeUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span>
                      {activeBS.toLocaleString('es-VE', { minimumFractionDigits: 2 })}{' '}
                      <span className="text-sm text-blue-400 font-sans font-bold font-mono">Bs</span>
                    </span>
                  )}
                </div>

                {/* Secondary/Counter Balance */}
                <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-800/80 pt-2.5 mt-3">
                  <span>Equivalente en moneda alterna:</span>
                  <span className="font-mono text-slate-300 font-bold">
                    {mode === 'USD' 
                      ? `${activeBS.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`
                      : `$ ${activeUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </span>
                </div>

                {/* Separate details for Main vs Ticket if showing 'all' */}
                {activeWallet === 'all' && (
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-900 border-dashed text-[9px] text-slate-500 font-mono">
                    <div>
                      <span className="block text-slate-655">PRINCIPAL:</span>
                      <span className="block text-slate-300 font-bold mt-0.5">
                        ${mainUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} / {mainBS.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-655">CESTATICKET:</span>
                      <span className="block text-slate-300 font-bold mt-0.5">
                        ${ticketUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} / {ticketBS.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* DYNAMIC CONVERSION REFERENCE CARD */}
              <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden">
                <span className="absolute top-0 right-0 py-1 px-2.5 bg-emerald-500/10 border-b border-l border-emerald-500/20 text-[8px] font-mono font-black text-emerald-400 rounded-bl uppercase">
                  VALOR DE CAMBIO
                </span>
                
                <div className="flex justify-between items-center pr-24">
                  <div>
                    <h4 className="text-[9px] font-mono font-bold text-slate-550 uppercase tracking-wider leading-none">
                      TASA REF APLICADA
                    </h4>
                    <span className="text-[10px] text-slate-350 font-bold mt-1 inline-block uppercase font-mono">
                      1 {activeKey.toUpperCase()} = {currentExchangeRate.toFixed(2)} Bs
                    </span>
                  </div>
                  <div className="h-6 w-px bg-slate-800"></div>
                  <div>
                    <h4 className="text-[9px] font-mono font-bold text-slate-550 uppercase tracking-wider leading-none">
                      EQUIVALENCIA ESTIMADA
                    </h4>
                    <span className="text-[10px] text-emerald-400 font-bold mt-1 inline-block font-mono">
                      {mode === 'USD' ? (
                        <span>{(activeUSD * currentExchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</span>
                      ) : (
                        <span>$ {(activeBS / currentExchangeRate).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mode Visual Switcher inside App View */}
              <div className="bg-slate-900/60 p-2 border border-slate-800 rounded-xl flex items-center justify-between gap-2.5">
                <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wide pl-2">VISTA PRINCIPAL:</span>
                <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setMode('USD')}
                    className={`text-[9px] font-bold py-1 px-2.5 rounded-md transition font-mono ${
                      mode === 'USD' ? 'bg-blue-600 text-white font-extrabold shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    USD
                  </button>
                  <button
                    onClick={() => setMode('BS')}
                    className={`text-[9px] font-bold py-1 px-2.5 rounded-md transition font-mono ${
                      mode === 'BS' ? 'bg-blue-600 text-white font-extrabold shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    VES
                  </button>
                </div>
                 {/* Dynamic Rates Grid selection cards */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">TASA REFERENCIA AL DÍA</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'usd', label: '🇺🇸 BCV DÓLAR', val: rates.usd },
                    { key: 'eur', label: '🇪🇺 BCV EURO', val: rates.eur },
                    { key: 'bin', label: '🪙 BINANCE USDT', val: rates.bin },
                    { key: 'par', label: '💸 PARALELO', val: rates.par }
                  ].map((rateItem) => (
                    <button
                      key={rateItem.key}
                      onClick={() => setActiveKey(rateItem.key as RateKey)}
                      className={`flex flex-col text-left p-3 rounded-xl border transition duration-150 ${
                        activeKey === rateItem.key
                          ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                          : 'bg-slate-950/70 border-slate-850 text-slate-300 hover:bg-slate-900/50'
                      }`}
                    >
                      <span className="text-[8px] font-bold uppercase text-slate-500 tracking-wider">{rateItem.label}</span>
                      <span className="text-base font-extrabold font-mono mt-1 text-slate-100">{rateItem.val.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* --- TAB VIEW: ANALISTA --- */}
          {activeTab === 'analista' && (
            <div className="space-y-4 animate-fadeIn text-xs">
              
              {/* TECHNICAL ACCOUNT WALLET SWITCHER */}
              <div className="bg-[#090d16] border border-slate-800 rounded-xl p-2 flex flex-col gap-1.5">
                <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500 uppercase px-1">
                  SYS.ANALYST.WALLETS // FILTRO DE BILLETERA
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { key: 'all', label: 'TODAS', desc: 'Suma Total' },
                    { key: 'main', label: 'PRINCIPAL', desc: 'Bancos / Efectivo' },
                    { key: 'ticket', label: 'CESTATICKET', desc: 'Alimentación' }
                  ].map((w) => (
                    <button
                      key={w.key}
                      onClick={() => setActiveWallet(w.key as 'all' | 'main' | 'ticket')}
                      className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-150 ${
                        activeWallet === w.key
                          ? 'bg-blue-600/10 border-blue-500 text-blue-400 font-extrabold shadow-[0_0_10px_rgba(59,130,246,0.15)]'
                          : 'bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-350 hover:bg-slate-900/60'
                      }`}
                    >
                      <span className="text-[10px] font-mono tracking-tight">{w.label}</span>
                      <span className="text-[8px] font-mono text-slate-550 leading-none mt-0.5">{w.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode Visual Switcher inside App View */}
              <div className="bg-slate-900/60 p-2 border border-slate-800 rounded-xl flex items-center justify-between gap-2.5">
                <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wide pl-2">VISTA PRINCIPAL:</span>
                <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setMode('USD')}
                    className={`text-[9px] font-bold py-1 px-2.5 rounded-md transition font-mono ${
                      mode === 'USD' ? 'bg-blue-600 text-white font-extrabold shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    USD
                  </button>
                  <button
                    onClick={() => setMode('BS')}
                    className={`text-[9px] font-bold py-1 px-2.5 rounded-md transition font-mono ${
                      mode === 'BS' ? 'bg-blue-600 text-white font-extrabold shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    VES
                  </button>
                </div>
              </div>

              {/* TECHNICAL STATS CARD WITH INTEGRATED SVG CIRCULAR DONUT CHART */}
              {(() => {
                const savingsRate = currentMonthIncome > 0 
                  ? ((currentMonthIncome - currentMonthExpense) / currentMonthIncome) * 100 
                  : 0;

                const expenseRatio = currentMonthIncome > 0
                  ? (currentMonthExpense / currentMonthIncome) * 100
                  : 0;

                // SVG calculations: circumference of r=36 is 2*pi*36 = 226.2
                const circOuter = 226.2;
                const offsetInner = circOuter - (Math.min(expenseRatio, 100) / 100) * circOuter;

                return (
                  <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
                    
                    {/* SVG DONUT CHART RING */}
                    <div className="relative flex items-center justify-center shrink-0 w-28 h-28 bg-slate-950/40 rounded-full border border-slate-850">
                      <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 84 84">
                        {/* Outer BG ring */}
                        <circle cx="42" cy="42" r="36" fill="transparent" stroke="#101827" strokeWidth="6" />
                        
                        {/* Income Outer Ring (Emerald Glow) */}
                        <circle
                          cx="42"
                          cy="42"
                          r="36"
                          fill="transparent"
                          stroke="url(#techIncomeGradAnalyst)"
                          strokeWidth="6"
                          strokeDasharray="226.2"
                          strokeDashoffset="0"
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out"
                        />

                        {/* Expense Inner Ring (Crimson Overlay) */}
                        <circle
                          cx="42"
                          cy="42"
                          r="36"
                          fill="transparent"
                          stroke="url(#techExpenseGradAnalyst)"
                          strokeWidth="6"
                          strokeDasharray="226.2"
                          strokeDashoffset={offsetInner}
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out"
                        />

                        <defs>
                          <linearGradient id="techIncomeGradAnalyst" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#047857" />
                          </linearGradient>
                          <linearGradient id="techExpenseGradAnalyst" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f43f5e" />
                            <stop offset="100%" stopColor="#be123c" />
                          </linearGradient>
                        </defs>
                      </svg>

                      {/* Text indicator inside the ring */}
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        <span className="text-[7px] font-mono tracking-widest text-slate-500 uppercase leading-none">AHORRO</span>
                        <span className={`text-[13px] font-extrabold font-mono leading-tight mt-0.5 ${savingsRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {savingsRate >= 0 ? '+' : ''}{savingsRate.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* STATS BREAKDOWN */}
                    <div className="flex-1 space-y-2">
                      {/* Months navigator */}
                      <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                        <button
                          onClick={() => changeMonth(-1)}
                          className="p-0.5 px-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded text-slate-400 transition active:scale-95 text-[9px]"
                        >
                          ❮
                        </button>
                        <span className="text-[9px] font-mono font-bold tracking-widest text-blue-400">
                          {spanishMonths[currMonth]} {currYear}
                        </span>
                        <button
                          onClick={() => changeMonth(1)}
                          className="p-0.5 px-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded text-slate-400 transition active:scale-95 text-[9px]"
                        >
                          ❯
                        </button>
                      </div>

                      {/* Metrics columns */}
                      <div className="space-y-1 text-[9px] font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            INGRESOS:
                          </span>
                          <span className="text-emerald-400 font-bold">
                            {mode === 'USD' ? '$' : ''}{currentMonthIncome.toLocaleString('es-VE', { maximumFractionDigits: 0 })}{mode === 'BS' ? ' Bs' : ''}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                            GASTOS:
                          </span>
                          <span className="text-red-400 font-bold">
                            {mode === 'USD' ? '$' : ''}{currentMonthExpense.toLocaleString('es-VE', { maximumFractionDigits: 0 })}{mode === 'BS' ? ' Bs' : ''}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-slate-900 border-dashed">
                          <span className="text-slate-400">NETO:</span>
                          <span className={`font-bold ${currentMonthNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {currentMonthNet >= 0 ? '+' : ''}{mode === 'USD' ? '$' : ''}{currentMonthNet.toLocaleString('es-VE', { maximumFractionDigits: 0 })}{mode === 'BS' ? ' Bs' : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })()}

              {/* Categorized distribution progress bars */}
              {(() => {
                const categoryTotals: { [key: string]: number } = {};
                let totalExpensesThisMonth = 0;

                db.forEach((t) => {
                  const itemDate = parseItemDate(t.date);
                  const isTicket = t.wallet === 'ticket';
                  const matchesWallet = 
                    activeWallet === 'all' || 
                    (activeWallet === 'main' && !isTicket) || 
                    (activeWallet === 'ticket' && isTicket);

                  if (itemDate.month === currMonth && itemDate.year === currYear && t.type === 'out' && matchesWallet) {
                    let compValue = t.amt;
                    if (t.curr !== mode) {
                      compValue = mode === 'USD' ? t.amt / currentExchangeRate : t.amt * currentExchangeRate;
                    }
                    categoryTotals[t.cat] = (categoryTotals[t.cat] || 0) + compValue;
                    totalExpensesThisMonth += compValue;
                  }
                });

                const categoryData = Object.keys(categoryTotals).map((catName) => {
                  const amount = categoryTotals[catName];
                  const percent = totalExpensesThisMonth > 0 ? (amount / totalExpensesThisMonth) * 100 : 0;
                  return { name: catName, value: amount, percentage: percent };
                }).sort((a, b) => b.value - a.value);

                return (
                  <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                        <span>Distribución del Gasto (Este Mes)</span>
                      </h4>
                      {totalExpensesThisMonth > 0 && (
                        <span className="text-[10px] font-mono font-bold text-red-400">
                          Total: {mode === 'USD' ? '$' : 'Bs'}{totalExpensesThisMonth.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>

                    {categoryData.length === 0 ? (
                      <p className="text-[10px] text-slate-500 italic text-center py-2">No se registran egresos durante {spanishMonths[currMonth].toLowerCase()}.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {categoryData.map((cat) => (
                          <div key={cat.name} className="space-y-1">
                            <div className="flex justify-between text-[10px] font-semibold text-slate-350">
                              <span className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${getCategoryColor(cat.name)}`}></span>
                                <span className="capitalize">{cat.name}</span>
                              </span>
                              <span className="font-mono text-slate-400">
                                {mode === 'USD' ? '$' : ''}{cat.value.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                                <span className="text-slate-550 font-normal text-[9px] ml-1">({cat.percentage.toFixed(0)}%)</span>
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${getCategoryColor(cat.name)} transition-all duration-500`}
                                style={{ width: `${cat.percentage}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          )}

          {/* --- TAB VIEW 2: MOVIMIENTOS / HISTORIAL --- */}
          {activeTab === 'movimientos' && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Header with Search and Export CSV */}
              <div className="flex items-center gap-2 justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por concepto o categoría..."
                    className="w-full bg-[#090d16] border border-slate-800 rounded-lg pl-8.5 pr-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                <button
                  onClick={exportCSV}
                  className="p-2.5 bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-300 hover:text-white rounded-lg transition"
                  title="Exportar registros a CSV"
                >
                  <Download className="h-3.5 w-3.5 text-blue-500" />
                </button>
              </div>

              {/* Transactions filtered view month information */}
              <div className="flex justify-between items-center bg-slate-900/50 p-2.5 border border-slate-850 rounded-xl text-xs font-mono">
                <button
                  onClick={() => changeMonth(-1)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  ❮
                </button>
                <span className="font-bold text-blue-400">{spanishMonths[currMonth]} {currYear}</span>
                <button
                  onClick={() => changeMonth(1)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  ❯
                </button>
              </div>

              {/* Log representation */}
              <div className="space-y-2.5">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-12 bg-[#090d16] border border-slate-800 rounded-2xl p-4">
                    <Calendar className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-400">Sin movimientos registrados</p>
                    <p className="text-[10px] text-slate-500 mt-1">No hay transacciones guardadas para este mes.</p>
                  </div>
                ) : (
                  filteredTransactions.map((t) => {
                    const isIncome = t.type === 'in';
                    
                    let dynamicText = '';
                    if (mode === 'USD') {
                      if (t.curr === 'USD') {
                        dynamicText = `${(t.amt * currentExchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 0 })} Bs`;
                      } else {
                        dynamicText = `$ ${(t.amt / currentExchangeRate).toFixed(2)}`;
                      }
                    } else {
                      if (t.curr === 'BS') {
                        dynamicText = `$ ${(t.amt / currentExchangeRate).toFixed(2)}`;
                      } else {
                        dynamicText = `${(t.amt * currentExchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 0 })} Bs`;
                      }
                    }

                    return (
                      <div key={t.id} className="bg-[#090d16] border border-slate-850 rounded-xl p-3 flex flex-col gap-2 relative group hover:border-slate-800 transition">
                        <div className="flex justify-between items-center text-[9px] text-slate-500 border-b border-slate-850/60 pb-1 font-mono">
                          <span className="flex items-center gap-1.5">
                            <span>{t.date}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-700"></span>
                            <span className={`px-1 rounded-[3px] text-[8px] font-bold ${
                              t.wallet === 'ticket' 
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10' 
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/10'
                            }`}>
                              {t.wallet === 'ticket' ? 'CESTATICKET' : 'PRINCIPAL'}
                            </span>
                          </span>
                          <span className="uppercase tracking-wider font-semibold text-slate-400">{t.cat}</span>
                        </div>

                        <div className="flex justify-between items-start">
                          <div>
                            <h5 className="text-xs font-bold text-slate-200">{t.desc}</h5>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                isIncome ? 'bg-emerald-950/50 text-emerald-400' : 'bg-red-950/50 text-red-400'
                              }`}>
                                {isIncome ? 'INGRESO' : 'GASTO'}
                              </span>
                              {t.bank && (
                                <span className="text-[8px] font-mono text-slate-500">
                                  // {t.bank} ({t.method})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className={`block font-mono font-bold text-xs ${
                              isIncome ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {isIncome ? '+' : '-'}{t.amt.toLocaleString('es-VE', { minimumFractionDigits: 2 })} <span className="text-[9px] text-slate-400">{t.curr}</span>
                            </span>
                            <span className="block font-mono text-[9px] text-slate-500 mt-0.5 font-semibold">
                              {dynamicText}
                            </span>
                            {t.commission && (
                              <span className="block font-mono text-[8px] text-red-450 mt-0.5 font-bold">
                                Comisión: -{t.commission.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {t.curr}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Direct deletion handle for native app look */}
                        <div className="flex justify-end pt-1 border-t border-slate-850/30 mt-1">
                          <button
                            onClick={() => handleDeleteTransaction(t.id)}
                            className="text-[9px] text-red-400/70 hover:text-red-400 flex items-center gap-1 hover:bg-red-950/20 px-2 py-0.5 rounded border border-transparent hover:border-red-500/15 font-mono"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                            <span>ELIMINAR</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          )}

          {/* --- TAB VIEW 3: CONVERSOR --- */}
          {activeTab === 'conversor' && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Full interactive quick convert field */}
              <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Coins className="h-4 w-4 text-blue-500" />
                  <h3 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
                    Conversor Multifrecuencia ({activeKey.toUpperCase()})
                  </h3>
                </div>

                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Dólares Estadounidenses (USD)</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-slate-500 text-xs font-bold">$</span>
                      <input
                        type="text"
                        value={qUsd}
                        onChange={(e) => handleQUsdChange(e.target.value)}
                        placeholder="0.00"
                        inputMode="decimal"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-10 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500 transition"
                      />
                      <button
                        onClick={() => copyToClipboard(qUsd, 'usd')}
                        className="absolute right-3 p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                        title="CopiarUSD"
                      >
                        {copiedField === 'usd' ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-center text-[10px] text-slate-600 font-bold select-none my-0.5">
                    ⇆ CAMBIO FLUIDO ⇆
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bolívares Digitales (VES)</label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-slate-500 text-xs font-bold">Bs</span>
                      <input
                        type="text"
                        value={qBs}
                        onChange={(e) => handleQBsChange(e.target.value)}
                        placeholder="0.00"
                        inputMode="decimal"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-10 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500 transition"
                      />
                      <button
                        onClick={() => copyToClipboard(qBs, 'bs')}
                        className="absolute right-3 p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                        title="CopiarVES"
                      >
                        {copiedField === 'bs' ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 bg-slate-950/60 p-2.5 rounded-lg border border-slate-850/80 text-center text-[10px] text-slate-400">
                  Calculado aplicando la tasa activa: <strong className="text-white">1 {activeKey.toUpperCase()} = {currentExchangeRate.toFixed(2)} Bs</strong>
                </div>
              </div>

              {/* Settings Trigger inside Conversor Tab */}
              <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">Reestablecer Tasas Manualmente</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Forzar un tipo de cambio personalizado.</p>
                  </div>
                  <button
                    onClick={() => {
                      setTempRates({ ...rates });
                      setIsSettingsOpen(true);
                    }}
                    className="p-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-300 flex items-center justify-center gap-1.5 text-xs transition"
                  >
                    <Settings className="h-3 w-3 text-blue-500" />
                    <span>Configurar</span>
                  </button>
                </div>
              </div>

              {/* Educational brief explaining the API change fix */}
              <div className="bg-blue-650/5 border border-blue-500/15 rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-blue-500" />
                  <span>Soporte Técnico API</span>
                </h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Las solicitudes ahora utilizan búsquedas dinámicas para <code className="bg-slate-950 text-slate-300 p-0.5 px-1 rounded font-mono">fuente == "oficial"</code> además de etiquetas de nombre de tasa alternativas, garantizando inmunidad a cambios accidentales en la API pública <code className="text-slate-300">ve.dolarapi.com</code>.
                </p>
              </div>

            </div>
          )}

        </div>

        {/* --- SMARTPHONE FLOATING ACTION BUTTON --- */}
        {activeTab === 'movimientos' && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="absolute bottom-20 right-6 z-30 h-12 w-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 active:scale-95 transition"
            title="Registrar nuevo movimiento"
          >
            <Plus className="h-6 w-6 font-bold" />
          </button>
        )}

        {/* --- SMARTPHONE BOTTOM TAB NAVIGATION BAR --- */}
        <nav className="absolute bottom-0 inset-x-0 bg-[#090d16] border-t border-slate-800/80 px-4 py-2 flex items-center justify-around z-30 shrink-0 select-none">
          
          {/* Tab Button 1 */}
          <button
            onClick={() => setActiveTab('resumen')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'resumen' ? 'text-blue-500' : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            <Home className="h-5 w-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Resumen</span>
          </button>

          {/* Tab Button 2 */}
          <button
            onClick={() => setActiveTab('movimientos')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'movimientos' ? 'text-blue-500' : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            <List className="h-5 w-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Movimientos</span>
          </button>

          {/* Tab Button 3 */}
          <button
            onClick={() => setActiveTab('analista')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'analista' ? 'text-blue-500' : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            <PieChart className="h-5 w-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Analista</span>
          </button>

          {/* Tab Button 4 */}
          <button
            onClick={() => setActiveTab('conversor')}
            className={`flex flex-col items-center gap-1 transition ${
              activeTab === 'conversor' ? 'text-blue-500' : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            <Calculator className="h-5 w-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Conversor</span>
          </button>

        </nav>

      </div>

      {/* --- BOTTON SHEET MODAL (REGISTER NEW TRANSACTION) --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 transition-opacity">
          
          <div
            className="absolute inset-0 cursor-default"
            onClick={() => setIsModalOpen(false)}
          ></div>

          {/* Bottom sheet visual box */}
          <div className="w-full max-w-[480px] bg-[#0c1220] border-t border-slate-800 rounded-t-[28px] relative z-10 overflow-hidden transform transition-all max-h-[85vh] flex flex-col shadow-2xl">
            
            {/* Slide handle mimic line */}
            <div className="flex justify-center py-2.5">
              <span className="w-12 h-1 bg-slate-705 rounded-full"></span>
            </div>

            <div className="p-4 border-b border-slate-800/80 flex justify-between items-center bg-[#090d16]">
              <h3 className="text-xs font-black text-white flex items-center gap-1.5 uppercase">
                <Plus className="h-4 w-4 text-blue-500" />
                <span>NUEVO REGISTRO</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[9px] font-bold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-2 py-0.5 rounded transition"
              >
                CERRAR
              </button>
            </div>

            {/* Scrollable form internal section */}
            <form onSubmit={handleAddTransaction} className="p-4 flex flex-col gap-3.5 overflow-y-auto pb-8 text-xs">
              
              {/* Account/Wallet selector */}
              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest font-mono">Billetera de Registro</label>
                <select
                  value={formWallet}
                  onChange={(e) => setFormWallet(e.target.value as 'main' | 'ticket')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition font-bold font-mono"
                >
                  <option value="main">CUENTA PRINCIPAL</option>
                  <option value="ticket">TICKET DE ALIMENTACIÓN (CESTATICKET)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Concepto / Descripción</label>
                <input
                  type="text"
                  placeholder="ej. Cobro Honorarios, Compra Víveres, Cestaticket Mensual"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  maxLength={50}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Monto</label>
                  <input
                    type="text"
                    placeholder="0.00"
                    value={formAmt}
                    onChange={(e) => setFormAmt(e.target.value)}
                    inputMode="decimal"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500 transition"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Moneda del Monto</label>
                  <select
                    value={formCurr}
                    onChange={(e) => setFormCurr(e.target.value as 'USD' | 'BS')}
                    disabled={formWallet === 'ticket'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition font-bold disabled:opacity-55"
                  >
                    <option value="BS">BOLÍVARES (Bs)</option>
                    <option value="USD">DÓLARES ($)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Tipo Movimiento</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as 'in' | 'out')}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-205 focus:outline-none focus:border-blue-500 transition font-bold"
                  >
                    <option value="in" className="text-emerald-400">INGRESO (+)</option>
                    <option value="out" className="text-red-400">GASTO (-)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Categoría</label>
                  <select
                    value={formCat}
                    onChange={(e) => setFormCat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-205 focus:outline-none"
                  >
                    <option value="Otros">Otros</option>
                    <option value="Alimentación">Alimentación</option>
                    <option value="Servicios">Servicios</option>
                    <option value="Gustos / Ocio">Gustos / Ocio</option>
                    <option value="Transporte">Transporte</option>
                    <option value="Salud">Salud</option>
                    <option value="Salario">Salario / Trabajo</option>
                  </select>
                </div>
              </div>

              {/* Conditional Bank Details for Incomes to Main Account */}
              {formType === 'in' && formWallet === 'main' && (
                <div className="border border-slate-800 bg-slate-950/40 rounded-xl p-3 space-y-3 animate-fadeIn">
                  <span className="text-[8px] font-mono font-bold tracking-widest text-slate-500 uppercase block mb-1">
                    SYS.RECEPTER // DETALLE BANCARIO
                  </span>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest font-mono">Banco Destino</label>
                      <select
                        value={formBank}
                        onChange={(e) => setFormBank(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition font-mono"
                      >
                        <option value="Venezuela">Venezuela (BDV)</option>
                        <option value="Mercantil">Mercantil</option>
                        <option value="Banesco">Banesco</option>
                        <option value="Provincial">Provincial</option>
                        <option value="Otros">Otros / Sin Comisión</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest font-mono">Método</label>
                      <select
                        value={formMethod}
                        onChange={(e) => setFormMethod(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition font-mono"
                      >
                        <option value="Pago Móvil">Pago Móvil</option>
                        <option value="Transferencia">Transferencia</option>
                      </select>
                    </div>
                  </div>

                  {formBank !== 'Otros' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest font-mono">Canal de Transferencia</label>
                      <select
                        value={formIsInterbank ? 'inter' : 'same'}
                        onChange={(e) => setFormIsInterbank(e.target.value === 'inter')}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition font-mono"
                      >
                        <option value="inter">Interbancario (Comisión 0.30%)</option>
                        <option value="same">Mismo Banco (Comisión 0.00%)</option>
                      </select>
                    </div>
                  )}

                  {/* Commission Calculation Preview */}
                  {formAmt && parseInputAmt(formAmt) > 0 && (
                    <div className="bg-slate-950/80 border border-slate-850 rounded-lg p-2.5 text-[10px] font-mono space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Monto Bruto:</span>
                        <span className="text-slate-300 font-bold">{parseInputAmt(formAmt).toFixed(2)} {formCurr}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Comisión ({formBank !== 'Otros' && formIsInterbank ? '0.3%' : '0%'}):</span>
                        <span className="text-red-400 font-bold">
                          -{(formBank !== 'Otros' && formIsInterbank ? parseInputAmt(formAmt) * 0.003 : 0).toFixed(2)} {formCurr}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t border-slate-900 font-bold">
                        <span className="text-slate-400">Monto Neto:</span>
                        <span className="text-emerald-400 font-bold">
                          {(parseInputAmt(formAmt) - (formBank !== 'Otros' && formIsInterbank ? parseInputAmt(formAmt) * 0.003 : 0)).toFixed(2)} {formCurr}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1 animate-fadeIn">
                <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Fecha del Movimiento</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500 transition"
                  style={{ colorScheme: 'dark' }}
                  required
                />
              </div>

              <button
                type="submit"
                className="mt-3 w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl text-xs tracking-wider uppercase transition active:scale-95 shadow-lg shadow-blue-500/10"
              >
                REGISTRAR MOVIMIENTO
              </button>

            </form>

          </div>
        </div>
      )}

      {/* --- DIALOG MODAL (MANUAL OVERRIDE RATES SETTINGS & LOCAL BACKUP) --- */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85">
          <div
            className="absolute inset-0 cursor-default"
            onClick={() => setIsSettingsOpen(false)}
          ></div>

          <div className="w-full max-w-sm bg-[#0c1220] border border-slate-800 rounded-2xl shadow-2xl relative z-10 overflow-hidden transform transition-all text-xs font-mono max-h-[92vh] flex flex-col">
            
            <div className="p-4 border-b border-slate-800/85 flex justify-between items-center bg-[#090d16] shrink-0">
              <h3 className="text-xs font-black text-white flex items-center gap-1.5 uppercase">
                <Settings className="h-4 w-4 text-slate-400" />
                <span>TASAS Y COPIAS</span>
              </h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-lg"
              >
                ×
              </button>
            </div>

            {/* Inner scroll wrapper */}
            <div className="overflow-y-auto flex-1 p-4 pb-6 space-y-5">
              
              <form onSubmit={handleSaveManualRates} className="flex flex-col gap-3">
                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                  <Coins className="h-3.5 w-3.5" />
                  <span>Tipos de Cambio Referenciales</span>
                </h4>
                
                <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                  Reestablezca los valores oficiales para trabajar de manera segura fuera de línea o ante fallas del servidor de consulta.
                </p>

                {/* USD Override */}
                <div className="grid grid-cols-2 items-center gap-2 pt-1">
                  <label className="text-[10px] text-slate-400 uppercase font-sans font-bold">🇺🇸 BCV DÓLAR</label>
                  <input
                    type="number"
                    step="any"
                    value={tempRates.usd}
                    onChange={(e) => setTempRates({ ...tempRates, usd: Number(e.target.value) })}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-blue-400 focus:outline-none text-right font-bold focus:border-blue-500"
                  />
                </div>

                {/* EUR Override */}
                <div className="grid grid-cols-2 items-center gap-2">
                  <label className="text-[10px] text-slate-400 uppercase font-sans font-bold">🇪🇺 BCV EURO</label>
                  <input
                    type="number"
                    step="any"
                    value={tempRates.eur}
                    onChange={(e) => setTempRates({ ...tempRates, eur: Number(e.target.value) })}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-blue-400 focus:outline-none text-right font-bold focus:border-blue-500"
                  />
                </div>

                {/* Binance Override */}
                <div className="grid grid-cols-2 items-center gap-2">
                  <label className="text-[10px] text-slate-400 uppercase font-sans font-bold">🪙 BINANCE USDT</label>
                  <input
                    type="number"
                    step="any"
                    value={tempRates.bin}
                    onChange={(e) => setTempRates({ ...tempRates, bin: Number(e.target.value) })}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-blue-400 focus:outline-none text-right font-bold focus:border-blue-500"
                  />
                </div>

                {/* Paralelo Override */}
                <div className="grid grid-cols-2 items-center gap-2">
                  <label className="text-[10px] text-slate-400 uppercase font-sans font-bold">💸 PARALELO</label>
                  <input
                    type="number"
                    step="any"
                    value={tempRates.par}
                    onChange={(e) => setTempRates({ ...tempRates, par: Number(e.target.value) })}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-blue-400 focus:outline-none text-right font-bold focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-2 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 font-sans font-bold px-3 py-1.5 rounded-lg text-[10px]"
                  >
                    Salir
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-500 text-white font-sans font-bold px-4 py-1.5 rounded-lg text-[10px] flex items-center gap-1"
                  >
                    <Save className="h-3 w-3" />
                    <span>Guardar Tasas</span>
                  </button>
                </div>
              </form>

              {/* TAB SECTOR COPIA DE SEGURIDAD / RESPALDO */}
              <div className="border-t border-slate-800/80 pt-4 space-y-3">
                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5" />
                  <span>Copia de Seguridad (Backup)</span>
                </h4>

                <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                  Respalde la base de datos de movimientos para exportar o restaurar con facilidad en cualquier dispositivo o navegador.
                </p>

                <div className="grid grid-cols-2 gap-2 pb-1">
                  <button
                    type="button"
                    onClick={handleExportBackupText}
                    className="px-2 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-bold text-blue-400 transition flex items-center justify-center gap-1 truncate"
                  >
                    {isBackupCopied ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copiar Copia</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadBackupFile}
                    className="px-2 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-bold text-slate-200 transition flex items-center justify-center gap-1 truncate"
                  >
                    <Download className="h-3 w-3 text-blue-500" />
                    <span>Bajar Archivo</span>
                  </button>
                </div>

                {backupString && (
                  <div className="animate-fadeIn">
                    <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block mb-1">JSON Copiado Exitosamente</label>
                    <textarea
                      readOnly
                      value={backupString}
                      className="w-full h-16 bg-slate-950 border border-slate-800 rounded p-1.5 text-[8px] font-mono text-slate-400 focus:outline-none"
                    />
                  </div>
                )}

                {/* Import partition */}
                <div className="border-t border-slate-800/60 pt-3.5 mt-3.5 space-y-2">
                  <span className="text-[10px] font-bold text-slate-250 block flex items-center gap-1.5">
                    <Upload className="h-3.5 w-3.5 text-blue-450" />
                    <span>Restaurar Datos</span>
                  </span>
                  
                  <textarea
                    placeholder="Pegue aquí la cadena JSON de su respaldo para recuperar sus movimientos..."
                    value={rawImportText}
                    onChange={(e) => setRawImportText(e.target.value)}
                    className="w-full h-14 bg-slate-950 border border-slate-800 rounded p-1.5 text-[9px] font-mono text-slate-300 focus:outline-none focus:border-blue-500 transition"
                  />

                  {importError && (
                    <div className="text-[9px] text-red-400 bg-red-950/20 border border-red-900/40 p-2 rounded">
                      {importError}
                    </div>
                  )}

                  {isImportSuccess && (
                    <div className="text-[9px] text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 p-2 rounded flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      <span>¡Respaldo importado correctamente!</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleImportBackupText(rawImportText)}
                    disabled={!rawImportText.trim()}
                    className="w-full py-1.5 bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-30 disabled:hover:bg-blue-600/20 border border-blue-500/35 text-blue-400 font-bold text-[10px] uppercase rounded-lg transition"
                  >
                    Confirmar Importación
                  </button>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
