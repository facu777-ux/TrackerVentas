import React, { useState, useEffect } from 'react';
import SearchFilters from './components/SearchFilters';
import ResultsTable from './components/ResultsTable';
import LogisticsCharts from './components/LogisticsCharts';
import MainTrendChart from './components/MainTrendChart';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import BottleneckFloatingButton from './components/BottleneckFloatingButton';
import AppSidebar from './components/AppSidebar';
import RightFiltersSidebar from './components/RightFiltersSidebar';
import { seguimientoAPI } from './services/api';
import { FaTruck, FaChartLine, FaExclamationTriangle, FaSun, FaMoon, FaFileInvoice, FaSearch, FaBars, FaTimes, FaFilter } from 'react-icons/fa';
import { AlertCircle, HelpCircle } from 'lucide-react';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState('enCarga'); // Default: 'enCarga' (No Facturados)
  const [searchTerm, setSearchTerm] = useState(''); 
  const [searchCarga, setSearchCarga] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    facturados: 0,
    enCarga: 0,
    presupuestos: 0
  });
  const [searchCriteria, setSearchCriteria] = useState(null);

  // Sidebar States
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' o 'analitica'
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [analyticsSubView, setAnalyticsSubView] = useState('overview'); // 'overview' o 'detailed'
  const [displayCurrency, setDisplayCurrency] = useState('ARS');
  const [exchangeRate, setExchangeRate] = useState(1000); // BNA
  const [chileExchangeRate, setChileExchangeRate] = useState(0); // SII Chile

  // 1. Fetch de Cotización Real (BNA)
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        if (data && data.venta) {
          setExchangeRate(data.venta);
          console.log('Cotización BNA actualizada:', data.venta);
        }
      } catch (err) {
        console.error('Error al obtener cotización:', err);
      }
    };
    fetchRate();
  }, []);

  // 1.1 Fetch de Cotización SII Chile (Dólar Observado)
  useEffect(() => {
    const fetchChileRate = async () => {
      try {
        const response = await fetch('https://mindicador.cl/api/dolar');
        const data = await response.json();
        if (data && data.serie && data.serie.length > 0) {
          setChileExchangeRate(data.serie[0].valor);
          console.log('Cotización SII Chile actualizada:', data.serie[0].valor);
        }
      } catch (err) {
        console.error('Error al obtener cotización SII Chile:', err);
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
    const searchedData = getSearchedData();
    
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

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const handleSearch = async (filtros) => {
    setLoading(true);
    setSearchCriteria(filtros);
    setError(null);
    setActiveFilter('all');

    try {
      const response = await seguimientoAPI.buscarSeguimiento(filtros);

      if (response.success) {
        setData(response.data);
        setHasSearched(true);
      } else {
        setError('Error al obtener los datos');
        setData([]);
      }
    } catch (error) {
      console.error('Error en la búsqueda:', error);
      setError(error.response?.data?.message || 'Error de conexión con el servidor');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const getSearchedData = () => {
    let base = data;
    if (searchTerm || searchCarga) {
      base = base.filter(item => {
        const searchLower = searchTerm.toLowerCase();
        const cargaLower = searchCarga.toLowerCase();
        const matchesGlobal = !searchTerm || (
          item.NroPR?.toString().includes(searchLower) ||
          item.NomCliente?.toLowerCase().includes(searchLower) ||
          item.DescrpProd?.toLowerCase().includes(searchLower) ||
          item.CodigoCarga?.toString().includes(searchLower) ||
          item.FacturaAsociadaOP?.toLowerCase().includes(searchLower)
        );
        const matchesCarga = !searchCarga || (
          item.CodigoCarga?.toString().toLowerCase().includes(cargaLower)
        );
        return matchesGlobal && matchesCarga;
      });
    }
    return base;
  };

  const getFilteredData = () => {
    const base = getSearchedData();
    
    // Aplicar filtros de categoría (tabs)
    switch (activeFilter) {
      case 'facturados':
        return base.filter(item =>
          item.CodigoCarga && 
          item.FacturaAsociadaOP && 
          !item.FacturaAsociadaOP.includes('Pendiente') &&
          !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA')
        );
      case 'enCarga':
        return base.filter(item =>
          item.CodigoCarga && 
          (!item.FacturaAsociadaOP || 
           item.FacturaAsociadaOP.includes('Pendiente') ||
           item.FacturaAsociadaOP.includes('CARGA NO FACTURADA'))
        );
      case 'presupuestos':
        return base.filter(item => !item.CodigoCarga);
      default:
        return base;
    }
  };

  // Efecto para actualizar estadísticas cuando cambian los datos o filtros locales
  useEffect(() => {
    if (!data.length) return;

    // Solo aplicamos el filtrado por searchTerm/searchCarga para las cards de stats
    let baseForStats = data;
    if (searchTerm || searchCarga) {
        baseForStats = data.filter(item => {
            const searchLower = searchTerm.toLowerCase();
            const cargaLower = searchCarga.toLowerCase();
            const matchesGlobal = !searchTerm || (
                item.NroPR?.toString().includes(searchLower) ||
                item.NomCliente?.toLowerCase().includes(searchLower) ||
                item.DescrpProd?.toLowerCase().includes(searchLower) ||
                item.CodigoCarga?.toString().includes(searchLower) ||
                item.FacturaAsociadaOP?.toLowerCase().includes(searchLower)
            );
            const matchesCarga = !searchCarga || (
                item.CodigoCarga?.toString().toLowerCase().includes(cargaLower)
            );
            return matchesGlobal && matchesCarga;
        });
    }

    const presupuestosUnicos = {};
    baseForStats.forEach(item => {
        const nroPR = item.NroPR || `SOL-${item.NroSolicitud}`;
        const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
        const pk = `${empresa}-${nroPR}`;
        
        if (!presupuestosUnicos[pk]) {
            presupuestosUnicos[pk] = { tieneCarga: false, tieneFactura: false, tienePendiente: false, sinCarga: true };
        }

        const isFacturado = (item.ReciboCobranza && !item.ReciboCobranza.includes('Pendiente')) || 
                          (item.FacturaAsociadaOP && !item.FacturaAsociadaOP.includes('Pendiente') && !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA'));
        
        if (item.CodigoCarga) {
            presupuestosUnicos[pk].tieneCarga = true;
            presupuestosUnicos[pk].sinCarga = false;
        }
        if (isFacturado) presupuestosUnicos[pk].tieneFactura = true;
        else if (item.CodigoCarga) presupuestosUnicos[pk].tienePendiente = true;
    });

    const statsCount = { total: Object.keys(presupuestosUnicos).length, facturados: 0, enCarga: 0, presupuestos: 0 };
    Object.values(presupuestosUnicos).forEach(p => {
        if (p.tienePendiente) statsCount.enCarga++;
        else if (p.tieneFactura) statsCount.facturados++;
        if (p.sinCarga) statsCount.presupuestos++;
    });
    setStats(statsCount);
  }, [data, searchTerm, searchCarga]);

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
              {/* Stats Cards - Solo en Dashboard */}
              {activeView === 'dashboard' && hasSearched && !loading && (
                <div className={`stats-grid ${isMobile ? 'mobile-stats' : ''}`}>
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
                        <span className="stat-label">No Facturados</span>
                        <div className="help-icon-wrapper">
                          <HelpCircle size={14} />
                          <div className="help-tooltip">
                            Operaciones que ya tienen una carga asignada pero aún no han sido facturadas en el sistema.
                          </div>
                        </div>
                      </div>
                      <FaExclamationTriangle className="stat-icon" style={{ color: 'var(--warning)' }} />
                    </div>
                    <div className="stat-value">{stats.enCarga}</div>
                  </div>

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
                            Presupuestos que han sido creados pero que aún no tienen una carga logística asociada para su ejecución.
                          </div>
                        </div>
                      </div>
                      <FaSun className="stat-icon" style={{ color: 'var(--primary)' }} />
                    </div>
                    <div className="stat-value">{stats.presupuestos}</div>
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
                        <span className="stat-label">Facturados</span>
                        <div className="help-icon-wrapper">
                          <HelpCircle size={14} />
                          <div className="help-tooltip">
                            Comprobantes que ya han completado el proceso de facturación y están listos para el seguimiento de cobro.
                          </div>
                        </div>
                      </div>
                      <FaFileInvoice className="stat-icon" style={{ color: 'var(--success)' }} />
                    </div>
                    <div className="stat-value">{stats.facturados}</div>
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
                            Volumen total de operaciones registradas bajo los parámetros de búsqueda actuales.
                          </div>
                        </div>
                      </div>
                      <FaChartLine className="stat-icon" />
                    </div>
                    <div className="stat-value">{stats.total}</div>
                  </div>
                </div>
              )}

              {/* View: ANALITICA - Dashboard y Gráficos Detallados Divididos */}
              {activeView === 'analitica' && hasSearched && !loading && (
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

                  {analyticsSubView === 'overview' ? (
                    <div className="fade-in">
                      <AnalyticsDashboard 
                        data={getSearchedData()} 
                        displayCurrency={displayCurrency}
                        setDisplayCurrency={setDisplayCurrency}
                        exchangeRate={exchangeRate}
                        chileExchangeRate={chileExchangeRate}
                        onExportSoloPresupuesto={exportSoloPresupuesto}
                        onExportAudit={exportAnalyticsAudit}
                        searchCriteria={searchCriteria}
                      />
                    </div>
                  ) : (
                    <div className="analytics-detailed-charts fade-in">
                      <MainTrendChart 
                        data={getSearchedData()} 
                        displayCurrency={displayCurrency} 
                        exchangeRate={exchangeRate} 
                        chileExchangeRate={chileExchangeRate}
                      />
                      <LogisticsCharts 
                        data={getSearchedData()} 
                        displayCurrency={displayCurrency} 
                        exchangeRate={exchangeRate}
                        chileExchangeRate={chileExchangeRate}
                      />
                    </div>
                  )}
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

              {/* Mensaje inicial Dashboard */}
              {activeView === 'dashboard' && !hasSearched && !loading && (
                <div className="welcome-message fade-in">
                  <FaChartLine className="welcome-icon" />
                  <h2>Bienvenido al Sistema de Seguimiento</h2>
                  <p>Utiliza los filtros de la derecha para comenzar la búsqueda</p>
                </div>
              )}

              {/* Dashboard Table */}
              {activeView === 'dashboard' && hasSearched && !loading && (
                <ResultsTable 
                  data={getFilteredData()} 
                  allData={data}
                  loading={loading} 
                  activeFilter={activeFilter}
                  isMobile={isMobile}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  searchCarga={searchCarga}
                  setSearchCarga={setSearchCarga}
                  displayCurrency={displayCurrency}
                  setDisplayCurrency={setDisplayCurrency}
                  exchangeRate={exchangeRate}
                  chileExchangeRate={chileExchangeRate}
                />
              )}
            </div>
          </div>
        </main>

        <footer className="app-footer">
          <div className="container">
            <p>&copy; {new Date().getFullYear()} Transporte Internacional DIBIAGI S.A.</p>
          </div>
        </footer>
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
        <BottleneckFloatingButton data={data} />
      )}
    </div>
  );
}

export default App;
