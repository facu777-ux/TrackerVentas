import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SearchFilters from './components/SearchFilters';
import ResultsTable from './components/ResultsTable';
import LogisticsCharts from './components/LogisticsCharts';
import MainTrendChart from './components/MainTrendChart';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import LogisticsView from './components/LogisticsView';
import BottleneckFloatingButton from './components/BottleneckFloatingButton';
import AppSidebar from './components/AppSidebar';
import RightFiltersSidebar from './components/RightFiltersSidebar';
import ChatbotAssistant from './components/ChatbotAssistant';
import { seguimientoAPI } from './services/api';
import { FaTruck, FaChartLine, FaExclamationTriangle, FaSun, FaMoon, FaFileInvoice, FaSearch, FaBars, FaTimes, FaFilter, FaFileAlt, FaCheckCircle } from 'react-icons/fa';
import { AlertCircle, HelpCircle } from 'lucide-react';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState('enCarga'); // Default: 'enCarga' (No Facturados)
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    pagados: 0,
    facturados: 0,
    enCarga: 0,
    presupuestos: 0
  });
  const [searchCriteria, setSearchCriteria] = useState(() => {
    const sesentaDiasAtras = new Date();
    sesentaDiasAtras.setDate(sesentaDiasAtras.getDate() - 60);
    
    const mañana = new Date();
    mañana.setDate(mañana.getDate() + 1);
    
    return {
      empresa: 'DIBIAG',
      fechaDesde: sesentaDiasAtras.toISOString().split('T')[0],
      fechaHasta: mañana.toISOString().split('T')[0],
      cliente: '',
      nroPR: '',
      limit: 100
    };
  });

  // Sidebar States
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' o 'analitica'
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [analyticsSubView, setAnalyticsSubView] = useState('overview'); // 'overview' o 'detailed'
  const [empresaAnalitica, setEmpresaAnalitica] = useState(null); // null = ambas, 'DIBIAG' o 'MULTIM'
  const [displayCurrency, setDisplayCurrency] = useState('ARS');
  const [exchangeRate, setExchangeRate] = useState(1000); // BNA
  const [chileExchangeRate, setChileExchangeRate] = useState(0); // SII Chile
  const [highlightedItem, setHighlightedItem] = useState(null);
  const highlightTimeoutRef = useRef(null);
  const [filterConNC, setFilterConNC] = useState(false);
  const [filterConND, setFilterConND] = useState(false);

  const scheduleHighlightCleanup = (ms = 10000) => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedItem(null);
      highlightTimeoutRef.current = null;
    }, ms);
  };

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // 1. Fetch de Cotización Real (BNA)
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const response = await fetch('/api/exchange/bna');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        if (data && data.venta) {
          setExchangeRate(data.venta);
          console.log('Cotización BNA actualizada:', data.venta);
        }
      } catch (err) {
        console.error('Error al obtener cotización:', err);
        // Si falla, el valor inicial '1000' se mantiene
      }
    };
    fetchRate();
  }, []);

  // 1.1 Fetch de Cotización SII Chile (Dólar Observado)
  useEffect(() => {
    const fetchChileRate = async () => {
      try {
        const response = await fetch('/api/exchange/sii');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        if (data && data.serie && data.serie.length > 0) {
          setChileExchangeRate(data.serie[0].valor);
          console.log('Cotización SII Chile actualizada:', data.serie[0].valor);
        }
      } catch (err) {
        // Fallback de cotización por si la API chilena falla o el proxy de Vite retorna 500
        console.warn('SII Chile no responde. Usando cotización de respaldo ($950).');
        setChileExchangeRate(950);
      }
    };
    fetchChileRate();
  }, []);

  // 2. Función de Exportación "Solo Presupuesto"
  const exportSoloPresupuesto = () => {
    const presupuestos = data.filter(item => !item.CodigoCarga);
    
    if (presupuestos.length === 0) {
      alert("No hay presupuestos para exportar.");
      return;
    }

    // Encabezados del CSV
    const headers = [
      'Empresa', 'Nro Presupuesto', 'Cliente', 'Fecha', 'Producto', 
      'Monto (Original)', 'Moneda', 'Motivo de Estado'
    ];

    // Mapeo de datos
    const rows = presupuestos.map(item => [
      item.FCRMVH_CODEMP || 'N/A',
      item.NroPR || item.NroSolicitud || 'S/N',
      `"${item.NomCliente || 'Sin Cliente'}"`,
      item.FchMovimiento || item.FchAltaRegistro || 'S/F',
      `"${item.DescrpProd || 'Sin Detalle'}"`,
      item.TotalItem || 0,
      item.Moneda || 'ARS',
      'Sin Código de Carga asociado (No iniciado en Logística)'
    ]);

    // Construcción del CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Descarga del archivo
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Analisis_Solo_Presupuesto_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. Función de Auditoría de Analítica (Trazabilidad Total)
  const exportAnalyticsAudit = () => {
    const dataForAudit = searchedData;
    
    if (searchedData.length === 0) {
      alert("No hay datos cargados para auditar.");
      return;
    }

    const headers = [
      'Empresa', 'Presupuesto', 'Cliente', 'Fecha', 'Producto', 
      'Moneda Original', 'Monto Original', 'Cotización BNA Aplicada', 
      'Moneda Visualización', 'Monto Normalizado', 'Código de Carga'
    ];

    const rows = searchedData.map(item => {
      const originalAmount = parseFloat(item.TotalItem) || 0;
      const originalCurrency = item.CodMoneda === '2' || item.Moneda?.includes('USD') ? 'USD' : 'ARS';
      
      // Determinar qué tasa usar según la selección actual
      let rate = 1;
      let targetCurrencyLabel = displayCurrency;
      
      if (displayCurrency === 'USD_BNA') {
          rate = parseFloat(exchangeRate) || 1000;
          targetCurrencyLabel = 'USD (BNA)';
      } else if (displayCurrency === 'USD_SII') {
          rate = parseFloat(chileExchangeRate) || 900;
          targetCurrencyLabel = 'USD (SII)';
      } else {
          rate = parseFloat(exchangeRate) || 1000; // Por defecto ARS usa BNA como ref si hace falta
      }
      
      let normalizedAmount = originalAmount;
      if (displayCurrency !== 'ARS' && originalCurrency === 'ARS') {
          normalizedAmount = originalAmount / rate;
      } else if (displayCurrency === 'ARS' && originalCurrency === 'USD') {
          normalizedAmount = originalAmount * rate;
      }

      return [
        item.FCRMVH_CODEMP || '-',
        item.NroPR || item.NroSolicitud || '-',
        `"${item.NomCliente || 'S/N'}"`,
        item.FchMovimiento || '-',
        `"${item.DescrpProd || '-'}"`,
        originalCurrency,
        originalAmount.toFixed(2),
        rate,
        targetCurrencyLabel,
        normalizedAmount.toFixed(2),
        item.CodigoCarga || 'No Iniciado'
      ];
    });

    const csvContent = "\uFEFF" + [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Auditoria_Analitica_${displayCurrency}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Theme State
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'light';
    }
    return 'light';
  });

  // Mobile Detection
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Command Palette Shortcut
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') setIsCommandPaletteOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleBotAction = (action) => {
    if (!action || !action.type) return;
    console.log('Bot Action Received:', action);

    if (action.type === 'NAVIGATE_VIEW') {
      const allowedViews = ['dashboard', 'analitica', 'logistica'];
      if (allowedViews.includes(action.view)) {
        setActiveView(action.view);
      }
      return;
    }
    
    if (action.type === 'NAVIGATE') {
      setActiveView(action.view);
    } else if (action.type === 'HIGHLIGHT') {
      setActiveView('dashboard');
      setHighlightedItem(action.highlight);
      scheduleHighlightCleanup(8000);
    } else if (action.type === 'NAVIGATE_TO') {
      // Acción proactiva del bot para encontrar un registro específico
      setActiveView('dashboard');
      
      // El asistente nos da kind (PR/CARGA/FACTURA) e id
      setHighlightedItem({ 
        type: (action.kind || 'PR').toUpperCase(), 
        value: action.id 
      });
      
      // Limpiar resaltado después de un tiempo prudencial
      scheduleHighlightCleanup(10000);
    }
  };

  const handleBotSearch = async ({ kind, id, targetView = 'dashboard', facturaTipo = null, puntoVenta = null }) => {
    if (!kind || !id) return { success: false };

    const botTraceEnabled = typeof window !== 'undefined' && window.localStorage?.getItem('tv_bot_trace') === '1';
    const traceBotSearch = (stage, detail = {}) => {
      if (!botTraceEnabled) return;
      console.info('[BOT_SEARCH_TRACE]', stage, detail);
    };

    const normalizedKind = kind.toUpperCase();

    const extractPrimaryNumericId = (rawValue, entityKind) => {
      const tokens = String(rawValue || '').match(/\d+/g) || [];
      if (!tokens.length) return null;

      // Para FACTURA/RECIBO elegimos el último token numérico por formatos compuestos (p.ej. 0001-00006843)
      const preferredToken = (entityKind === 'FACTURA' || entityKind === 'RECIBO')
        ? tokens[tokens.length - 1]
        : tokens[0];

      const parsed = parseInt(preferredToken, 10);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const numericId = extractPrimaryNumericId(id, normalizedKind);
    if (numericId === null || Number.isNaN(numericId)) return { success: false };

    traceBotSearch('START', {
      kind: normalizedKind,
      id: String(id),
      targetView,
      facturaTipo,
      puntoVenta
    });

    const mañana = new Date();
    mañana.setDate(mañana.getDate() + 1);

    const parseDateValue = (value) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const toISODate = (date) => date.toISOString().split('T')[0];

    const normalizeNumericString = (value) => {
      const normalized = String(value || '').trim().replace(/^0+/, '');
      return normalized === '' ? '0' : normalized;
    };

    const extractNormalizedTokens = (value) => {
      return (String(value || '').match(/\d+/g) || []).map(token => normalizeNumericString(token));
    };

    const pickStrongestToken = (tokens = []) => {
      if (!tokens.length) return null;
      return tokens.reduce((best, token) => {
        if (!best) return token;
        if (token.length > best.length) return token;
        if (token.length === best.length) return token; // ante empate, priorizamos el más reciente
        return best;
      }, null);
    };

    const fieldContainsExactId = (value, targetId) => {
      if (value === null || value === undefined) return false;
      const valueText = String(value).trim();
      const normalizedTarget = normalizeNumericString(targetId);

      // Coincidencia exacta directa
      if (normalizeNumericString(valueText) === normalizedTarget) return true;

      // Coincidencia exacta por token numérico, evita colisiones de sufijos (6843 != 36843)
      const tokens = valueText.match(/\d+/g) || [];
      return tokens.some(token => normalizeNumericString(token) === normalizedTarget);
    };

    const fieldMatchesByKind = (value, targetId, entityKind) => {
      if (value === null || value === undefined) return false;

      const normalizedTarget = normalizeNumericString(targetId);
      if (!normalizedTarget) return false;

      const upperKind = String(entityKind || '').toUpperCase();
      if (upperKind === 'FACTURA' || upperKind === 'RECIBO') {
        const sourceTokens = extractNormalizedTokens(value);
        const sourcePrimaryToken = pickStrongestToken(sourceTokens);

        // Regla estricta por tipo documental para evitar colisiones por token de prefijo.
        return sourcePrimaryToken === normalizedTarget;
      }

      return fieldContainsExactId(value, normalizedTarget);
    };

    const matchByKind = (item) => {
      const target = String(numericId);
      if (normalizedKind === 'PR') return fieldMatchesByKind(item.NroPR, target, 'PR');
      if (normalizedKind === 'CARGA') return fieldMatchesByKind(item.CodigoCarga, target, 'CARGA');
      if (normalizedKind === 'FACTURA') return fieldMatchesByKind(item.FacturaAsociadaOP, target, 'FACTURA');
      if (normalizedKind === 'RECIBO') return fieldMatchesByKind(item.ReciboCobranza, target, 'RECIBO');
      return false;
    };

    const buildDateWindow = (rows) => {
      const dates = rows
        .map(row => parseDateValue(row.FchMovimiento || row.FchAltaRegistro))
        .filter(Boolean);

      if (!dates.length) return null;

      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      minDate.setDate(minDate.getDate() - 15);
      maxDate.setDate(maxDate.getDate() + 2);

      return {
        fechaDesde: toISODate(minDate),
        fechaHasta: toISODate(maxDate)
      };
    };

    const baseProbeFilters = {
      ...searchCriteria,
      fechaDesde: '2010-01-01',
      fechaHasta: toISODate(mañana),
      nroPR: normalizedKind === 'PR' ? numericId : null,
      nroCarga: normalizedKind === 'CARGA' ? numericId : null,
      nroFactura: normalizedKind === 'FACTURA' ? numericId : null,
      nroRC: normalizedKind === 'RECIBO' ? numericId : null,
      facturaTipo: normalizedKind === 'FACTURA' ? (facturaTipo || null) : null,
      puntoVenta: normalizedKind === 'FACTURA' ? (puntoVenta || null) : null,
      limit: 250
    };

    let probeRows = [];
    let probeFailed = false;
    try {
      const probeResponse = await seguimientoAPI.buscarSeguimiento(baseProbeFilters);
      if (probeResponse?.success && Array.isArray(probeResponse.data)) {
        probeRows = probeResponse.data.filter(matchByKind);
        traceBotSearch('PROBE_OK', {
          probeCount: probeResponse.data.length,
          exactMatches: probeRows.length
        });
      }
    } catch (probeError) {
      probeFailed = true;
      console.warn('Búsqueda de sondeo del bot falló, se usará estrategia amplia.', probeError);
      traceBotSearch('PROBE_ERROR', {
        message: probeError?.message || 'error-desconocido'
      });
    }

    const exactMatchFound = probeRows.length > 0;
    const relatedPR = probeRows.find(row => row.NroPR)?.NroPR;
    const dateWindow = buildDateWindow(probeRows);
    const usedWideFallback = !dateWindow;

    const finalFilters = {
      ...searchCriteria,
      fechaDesde: dateWindow?.fechaDesde || '2010-01-01',
      fechaHasta: dateWindow?.fechaHasta || toISODate(mañana),
      nroPR: (normalizedKind === 'PR' || (normalizedKind === 'CARGA' && relatedPR)) ? (relatedPR || numericId) : null,
      nroCarga: (normalizedKind === 'CARGA' && !relatedPR) ? numericId : null,
      nroFactura: (normalizedKind === 'FACTURA' && !relatedPR) ? numericId : null,
      nroRC: (normalizedKind === 'RECIBO' && !relatedPR) ? numericId : null,
      facturaTipo: normalizedKind === 'FACTURA' ? (facturaTipo || null) : null,
      puntoVenta: normalizedKind === 'FACTURA' ? (puntoVenta || null) : null,
      limit: 500
    };

    traceBotSearch('FINAL_FILTERS', {
      finalFilters,
      exactMatchFound,
      relatedPR,
      usedWideFallback,
      probeFailed
    });

    let searchResult = { success: false, count: 0 };
    try {
      setShowRightSidebar(true);
      searchResult = await handleSearch(finalFilters);
    } finally {
      setShowRightSidebar(false);
    }

    // Filtro local para mejorar foco visual en la tabla tras la búsqueda.
    if (normalizedKind === 'PR' || normalizedKind === 'CARGA') {
      setSearchTerm(String(id));
    } else {
      // Evita ambigüedad por matching local parcial (ej: RECIBO 6843 vs FACTURA 36843)
      setSearchTerm('');
    }

    setActiveView(targetView === 'logistica' ? 'logistica' : 'dashboard');
    traceBotSearch('END', {
      success: !!searchResult?.success,
      count: searchResult?.count || 0,
      targetView: targetView === 'logistica' ? 'logistica' : 'dashboard',
      criterion: exactMatchFound ? 'exact_by_type_token' : 'fallback_broad'
    });
    return {
      success: !!searchResult?.success,
      count: searchResult?.count || 0,
      targetView: targetView === 'logistica' ? 'logistica' : 'dashboard',
      exactMatchFound,
      usedWideFallback,
      probeFailed
    };
  };

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const handleSearch = async (filtros) => {
    setLoading(true);
    setSearchCriteria(filtros);
    setError(null);
    setActiveFilter('all');
    setSearchTerm('');

    try {
      const response = await seguimientoAPI.buscarSeguimiento(filtros);

      if (response.success) {
        setData(response.data);
        setHasSearched(true);
        return { success: true, count: Array.isArray(response.data) ? response.data.length : 0 };
      } else {
        setError('Error al obtener los datos');
        setData([]);
        return { success: false, count: 0 };
      }
    } catch (error) {
      console.error('Error en la búsqueda:', error);
      setError(error.response?.data?.message || 'Error de conexión con el servidor');
      setData([]);
      return { success: false, count: 0 };
    } finally {
      setLoading(false);
    }
  };

  // 4. Lógica de Procesamiento de Datos (Memorizada)
  const searchedData = React.useMemo(() => {
    if (!searchTerm) return data;
    const searchLower = searchTerm.toLowerCase();
    return data.filter(item =>
      item.NroPR?.toString().includes(searchLower) ||
      item.NomCliente?.toLowerCase().includes(searchLower) ||
      item.DescrpProd?.toLowerCase().includes(searchLower) ||
      item.CodigoCarga?.toString().includes(searchLower) ||
      item.FacturaAsociadaOP?.toLowerCase().includes(searchLower)
    );
  }, [data, searchTerm]);

  const filteredData = React.useMemo(() => {
    let result;
    switch (activeFilter) {
      case 'pagados':
        result = searchedData.filter(item =>
          item.ReciboCobranza && !item.ReciboCobranza.includes('Pendiente')
        );
        break;
      case 'facturados':
        result = searchedData.filter(item =>
          item.CodigoCarga &&
          (item.FacturaAsociadaOP && !item.FacturaAsociadaOP.includes('Pendiente') && !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA')) &&
          (!item.ReciboCobranza || item.ReciboCobranza.includes('Pendiente'))
        );
        break;
      case 'enCarga':
        result = searchedData.filter(item =>
          item.CodigoCarga &&
          (!item.FacturaAsociadaOP ||
           item.FacturaAsociadaOP.includes('Pendiente') ||
           item.FacturaAsociadaOP.includes('CARGA NO FACTURADA'))
        );
        break;
      case 'presupuestos':
        result = searchedData.filter(item => !item.CodigoCarga);
        break;
      default:
        result = searchedData;
    }

    if (filterConNC || filterConND) {
      result = result.filter(item => {
        if (filterConNC && filterConND) return !!item.TieneNC || !!item.TieneND;
        if (filterConNC) return !!item.TieneNC;
        return !!item.TieneND;
      });
    }

    return result;
  }, [searchedData, activeFilter, filterConNC, filterConND]);

  // Efecto para actualizar estadísticas cuando cambian los datos o filtros locales
  useEffect(() => {
    if (!data.length) return;

    let baseForStats = data;
    if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        baseForStats = data.filter(item =>
            item.NroPR?.toString().includes(searchLower) ||
            item.NomCliente?.toLowerCase().includes(searchLower) ||
            item.DescrpProd?.toLowerCase().includes(searchLower) ||
            item.CodigoCarga?.toString().includes(searchLower) ||
            item.FacturaAsociadaOP?.toLowerCase().includes(searchLower)
        );
    }

    // Count unique presupuesto groups per filter, mirroring the table's filteredData logic.
    // A presupuesto can appear in multiple categories if it has items in different states.
    const totalPks = new Set();
    const pkSets = { presupuestos: new Set(), enCarga: new Set(), facturados: new Set(), pagados: new Set() };

    baseForStats.forEach(item => {
        const nroPR = item.NroPR || item.NroSolicitud;
        const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
        const pk = `${empresa}-${nroPR}`;
        totalPks.add(pk);

        const hasInvoice = item.FacturaAsociadaOP &&
                          !item.FacturaAsociadaOP.includes('Pendiente') &&
                          !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA');
        const hasPago = item.ReciboCobranza &&
                       !item.ReciboCobranza.includes('Pendiente');

        if (!item.CodigoCarga) pkSets.presupuestos.add(pk);
        if (item.CodigoCarga && (!item.FacturaAsociadaOP || item.FacturaAsociadaOP.includes('Pendiente') || item.FacturaAsociadaOP.includes('CARGA NO FACTURADA'))) pkSets.enCarga.add(pk);
        if (item.CodigoCarga && hasInvoice && !hasPago) pkSets.facturados.add(pk);
        if (hasPago) pkSets.pagados.add(pk);
    });

    setStats({
        total: totalPks.size,
        presupuestos: pkSets.presupuestos.size,
        enCarga: pkSets.enCarga.size,
        facturados: pkSets.facturados.size,
        pagados: pkSets.pagados.size,
    });
  }, [data, searchTerm]);

  const handleStatCardClick = (filterType) => {
    setActiveFilter(filterType);
  };

  return (
    <div className="app-layout">
      {/* Fondo oscuro para cerrar en móvil */}
      {isMobile && showMobileSidebar && (
        <div className="sidebar-overlay" onClick={() => setShowMobileSidebar(false)}></div>
      )}
      {/* Sidebar */}
        <AppSidebar 
          activeView={activeView}
          setActiveView={setActiveView}
          isCollapsed={isSidebarCollapsed} 
          onCollapse={setIsSidebarCollapsed}
          isMobile={isMobile}
          showMobile={showMobileSidebar}
          setShowMobile={setShowMobileSidebar}
        >
          {isMobile && (
            <div className="mobile-sidebar-header">
              <h3>Navegación</h3>
              <button className="close-sidebar-btn" onClick={() => setShowMobileSidebar(false)}>
                <FaTimes />
              </button>
            </div>
          )}
          {/* Navegación del sidebar aquí si es necesario */}
        </AppSidebar>

        <RightFiltersSidebar 
          isOpen={showRightSidebar} 
          onClose={() => setShowRightSidebar(false)}
        >
          <SearchFilters 
            onSearch={(filtros) => {
              handleSearch(filtros);
              setShowRightSidebar(false);
            }} 
            loading={loading}
            hideTitle={true}
            isInSidebar={true}
          />
        </RightFiltersSidebar>

      <div className={`app-content-wrapper ${isSidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        {/* Header */}
        <header className="app-header">
          <div className="container">
            <div className="header-content">
              <div className="header-logo">
                {isMobile && (
                  <button className="mobile-menu-btn" onClick={() => setShowMobileSidebar(true)}>
                    <FaBars size={20} />
                  </button>
                )}
                <div>
                  <h1 className="header-title">{isMobile ? 'Tracking Ventas' : 'DIBIAGI - Tracking de Ventas'}</h1>
                  <p className="header-subtitle">Sistema de Seguimiento de Documentación</p>
                </div>
              </div>

              <div className="header-actions">
                <button
                  className="theme-toggle"
                  onClick={toggleTheme}
                  aria-label="Toggle Dark Mode"
                >
                  {theme === 'light' ? <FaMoon size={18} /> : <FaSun size={18} />}
                </button>
                <button
                  className={`theme-toggle ${showRightSidebar ? 'active' : ''}`}
                  onClick={() => setShowRightSidebar(!showRightSidebar)}
                  aria-label="Filtros de Búsqueda"
                  title="Filtros de Búsqueda"
                >
                  <FaFilter size={18} color={showRightSidebar ? 'var(--primary-color)' : 'inherit'} />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="app-main">
          <div className="container main-container">
            <div className="content-area">
              {/* Loader Global */}
              {loading && (
                <div className="global-loader-container">
                  <div className="loader-box">
                    <div className="premium-spinner"></div>
                    <h3>Sincronizando con Softland</h3>
                    <p>Consultando trazabilidad y procesando resultados...</p>
                  </div>
                </div>
              )}

              {/* Manejo de Errores */}
              {error && !loading && (
                <div className="error-display fade-in">
                  <div className="error-card">
                    <AlertCircle size={40} className="error-icon" />
                    <h3>Ocurrió un Problema</h3>
                    <p>{error}</p>
                    <button className="primary-btn" onClick={() => handleSearch(searchCriteria)}>
                      Reintentar Búsqueda
                    </button>
                  </div>
                </div>
              )}

              {/* Stats Cards - Solo en Dashboard */}
              {activeView === 'dashboard' && hasSearched && !loading && !error && (
                <div className={`stats-grid ${isMobile ? 'mobile-stats' : ''}`}>
                  <div
                    className={`stat-card ${activeFilter === 'presupuestos' ? 'stat-card-active' : ''}`}
                    onClick={() => handleStatCardClick('presupuestos')}
                     onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                        e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                    }}
                  >
                    <div className="stat-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="stat-label">Solo Presupuesto</span>
                        <div className="help-icon-wrapper">
                          <HelpCircle size={14} />
                          <div className="help-tooltip">
                            Presupuestos creados que aún no tienen una carga logística asociada.
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="stat-value">{stats.presupuestos}</div>
                    <FaFileAlt className="stat-icon" style={{ color: 'var(--text-tertiary)' }} />
                  </div>

                  <div
                    className={`stat-card ${activeFilter === 'enCarga' ? 'stat-card-active' : ''}`}
                    onClick={() => handleStatCardClick('enCarga')}
                    onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                        e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                    }}
                  >
                    <div className="stat-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="stat-label">Pendientes de Facturar (Carga/OP)</span>
                        <div className="help-icon-wrapper">
                          <HelpCircle size={14} />
                          <div className="help-tooltip">
                            Operaciones con carga asignada pero sin factura emitida.
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="stat-value">{stats.enCarga}</div>
                    <FaTruck className="stat-icon" style={{ color: 'var(--warning)' }} />
                  </div>

                  <div
                    className={`stat-card ${activeFilter === 'facturados' ? 'stat-card-active' : ''}`}
                    onClick={() => handleStatCardClick('facturados')}
                     onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                        e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                    }}
                  >
                    <div className="stat-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="stat-label">Pendientes de Cobrar (Factura)</span>
                        <div className="help-icon-wrapper">
                          <HelpCircle size={14} />
                          <div className="help-tooltip">
                            Facturas emitidas que aún no tienen registrado el recibo de cobro.
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="stat-value">{stats.facturados}</div>
                    <FaFileInvoice className="stat-icon" style={{ color: 'var(--primary)' }} />
                  </div>

                  <div
                    className={`stat-card ${activeFilter === 'pagados' ? 'stat-card-active' : ''}`}
                    onClick={() => handleStatCardClick('pagados')}
                     onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                        e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                    }}
                  >
                    <div className="stat-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="stat-label">Cobrados (Recibo de Cobranza)</span>
                        <div className="help-icon-wrapper">
                          <HelpCircle size={14} />
                          <div className="help-tooltip">
                            Operaciones que han completado el ciclo administrativo con la emisión del recibo.
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="stat-value">{stats.pagados}</div>
                    <FaCheckCircle className="stat-icon" style={{ color: 'var(--success)' }} />
                  </div>

                  <div
                    className={`stat-card ${activeFilter === 'all' ? 'stat-card-active' : ''}`}
                    onClick={() => handleStatCardClick('all')}
                     onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                        e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
                    }}
                  >
                    <div className="stat-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="stat-label">Total</span>
                        <div className="help-icon-wrapper">
                          <HelpCircle size={14} />
                          <div className="help-tooltip">
                            Volumen total de presupuestos y operaciones procesadas en este periodo.
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="stat-value">{stats.total}</div>
                    <FaChartLine className="stat-icon" style={{ color: 'var(--text-secondary)' }} />
                  </div>
                </div>
              )}

              {/* View: ANALITICA - Dashboard y Gráficos Detallados Divididos */}
              {activeView === 'analitica' && hasSearched && !loading && !error && (
                <div className="analytics-view-container animate-fade-in">
                  {/* Selector de Sub-Vistas estilo Premium con Controles de Moneda */}
                  <div className="analytics-nav-bar">
                    <div className="analytics-view-switcher">
                      <button 
                        className={`switcher-btn ${analyticsSubView === 'overview' ? 'active' : ''}`}
                        onClick={() => setAnalyticsSubView('overview')}
                      >
                        <FaChartLine size={14} /> Resumen Ejecutivo
                      </button>
                      <button 
                        className={`switcher-btn ${analyticsSubView === 'detailed' ? 'active' : ''}`}
                        onClick={() => setAnalyticsSubView('detailed')}
                      >
                        <FaTruck size={14} /> Análisis Detallado
                      </button>
                    </div>

                    <div className="analytics-nav-actions">
                      <select
                        className="empresa-select"
                        value={empresaAnalitica ?? ''}
                        onChange={e => setEmpresaAnalitica(e.target.value || null)}
                      >
                        <option value="">Ambas empresas</option>
                        <option value="DIBIAG">Dibiagi</option>
                        <option value="MULTIM">Multimodal</option>
                      </select>

                      <div className="header-rates-group">
                        <button className="header-bna">
                            <AlertCircle size={14} />
                            USD BNA: ${exchangeRate.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            <span className="info-tooltip">Actualización Automática: Cada vez que abras la aplicación, se obtendrá el valor de venta del dólar oficial.</span>
                        </button>

                        <button className="header-bna header-sii">
                            <FaChartLine size={14} />
                            USD SII: ${chileExchangeRate.toLocaleString('es-CL', { minimumFractionDigits: 2 })}
                            <span className="info-tooltip">Dólar Observado (Chile): Valor oficial publicado por el SII para transacciones internacionales.</span>
                        </button>
                      </div>
                      
                      <div className="header-switcher">
                          <button 
                              className={`switcher-tab ${displayCurrency === 'ARS' ? 'active' : ''}`}
                              onClick={() => setDisplayCurrency('ARS')}
                          >
                              ARS
                          </button>
                          <button 
                              className={`switcher-tab ${displayCurrency === 'USD_BNA' ? 'active' : ''}`}
                              onClick={() => setDisplayCurrency('USD_BNA')}
                          >
                              USD BNA
                          </button>
                          <button 
                              className={`switcher-tab ${displayCurrency === 'USD_SII' ? 'active' : ''}`}
                              onClick={() => setDisplayCurrency('USD_SII')}
                          >
                              USD SII
                          </button>
                      </div>
                    </div>
                  </div>

                  <div className="analytics-content-transitions" style={{ position: 'relative', overflow: 'visible' }}>
                    <AnimatePresence mode="wait">
                      {analyticsSubView === 'overview' ? (
                        <motion.div 
                          key="overview"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                        >
                          <AnalyticsDashboard
                            data={searchedData}
                            empresaFiltro={empresaAnalitica}
                            displayCurrency={displayCurrency}
                            setDisplayCurrency={setDisplayCurrency}
                            exchangeRate={exchangeRate}
                            chileExchangeRate={chileExchangeRate}
                            onExportSoloPresupuesto={exportSoloPresupuesto}
                            onExportAudit={exportAnalyticsAudit}
                            searchCriteria={searchCriteria}
                          />
                        </motion.div>
                      ) : (
                        <motion.div 
                          key="detailed"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="analytics-detailed-charts"
                        >
                          <MainTrendChart 
                            data={searchedData} 
                            displayCurrency={displayCurrency} 
                            exchangeRate={exchangeRate} 
                            chileExchangeRate={chileExchangeRate}
                          />
                          <LogisticsCharts 
                            data={searchedData} 
                            displayCurrency={displayCurrency} 
                            exchangeRate={exchangeRate}
                            chileExchangeRate={chileExchangeRate}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* View: ANALITICA - Empty State */}
              {activeView === 'analitica' && !hasSearched && !loading && (
                 <div className="welcome-message fade-in">
                 <FaChartLine className="welcome-icon" />
                 <h2>Módulo de Analítica</h2>
                 <p>Realiza una búsqueda para visualizar las tendencias y métricas operativas.</p>
               </div>
              )}

              {/* View: LOGISTICA - Control Operativo */}
              {activeView === 'logistica' && (
                <LogisticsView 
                  data={data} 
                  loading={loading} 
                  searchCriteria={searchCriteria}
                />
              )}

              {/* Mensaje inicial Dashboard */}
              {activeView === 'dashboard' && !hasSearched && !loading && !error && (
                <div className="welcome-message fade-in">
                  <FaChartLine className="welcome-icon" />
                  <h2>Bienvenido al Sistema de Seguimiento</h2>
                  <p>Utiliza los filtros de la derecha para comenzar la búsqueda</p>
                </div>
              )}

              {/* Dashboard Table */}
              {activeView === 'dashboard' && hasSearched && !loading && !error && (
                <ResultsTable 
                  data={filteredData} 
                  allData={data}
                  loading={loading} 
                  activeFilter={activeFilter}
                  isMobile={isMobile}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  displayCurrency={displayCurrency}
                  setDisplayCurrency={setDisplayCurrency}
                  exchangeRate={exchangeRate}
                  chileExchangeRate={chileExchangeRate}
                  searchCriteria={searchCriteria}
                  highlightItem={highlightedItem}
                  filterConNC={filterConNC}
                  setFilterConNC={setFilterConNC}
                  filterConND={filterConND}
                  setFilterConND={setFilterConND}
                />
              )}
            </div>
          </div>
        </main>

        <footer className="app-footer">
          <div className="container">
            <p>&copy; {new Date().getFullYear()} Transporte Internacional DIBIAGI S.A. | <span style={{opacity: 0.7, fontSize: '0.8em'}}>Asistente Virtual Activo</span></p>
          </div>
        </footer>

        {/* <ChatbotAssistant
          currentData={data}
          onBotAction={handleBotAction}
          onBotSearch={handleBotSearch}
        /> */}
      </div>

      {/* Command Palette Overlay */}
      {isCommandPaletteOpen && (
        <div className="command-palette-overlay" onClick={() => setIsCommandPaletteOpen(false)}>
          <div className="command-palette-box glass" onClick={e => e.stopPropagation()}>
            <div className="command-input-area">
              <FaSearch size={20} className="text-tertiary" />
              <input 
                type="text" 
                placeholder="Busca presupuestos, clientes o comandos..." 
                autoFocus 
                className="command-input"
              />
              <div className="command-kbd">ESC</div>
            </div>
            <div className="command-results">
              <div className="command-group">
                <span className="command-group-label">Acciones Rápidas</span>
                <div className="command-item"><FaTruck size={14} /> Nueva Búsqueda</div>
                <div className="command-item"><FaFileInvoice size={14} /> Exportar Reporte Semanal</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottleneck Analysis Floating Button - Solo en Dashboard */}
      {activeView === 'dashboard' && hasSearched && !loading && (
        <BottleneckFloatingButton
          data={data}
          onClienteSelect={(clienteNombre) => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            handleSearch({
              ...searchCriteria,
              fechaDesde: '2020-01-01',
              fechaHasta: tomorrow.toISOString().split('T')[0],
              cliente: clienteNombre,
              limit: 500,
            });
          }}
          onCargoNavigate={(cargoId) => {
            setActiveFilter('all');
            setHighlightedItem({ type: 'CARGA', value: String(cargoId) });
            scheduleHighlightCleanup(10000);
          }}
        />
      )}
    </div>
  );
}

export default App;
