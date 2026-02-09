import React, { useState, useEffect } from 'react';
import SearchFilters from './components/SearchFilters';
import ResultsTable from './components/ResultsTable';
import { seguimientoAPI } from './services/api';
import { FaTruck, FaChartLine, FaExclamationTriangle, FaSun, FaMoon, FaFileInvoice, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState('enCarga'); // Default: 'enCarga' (No Facturados)
  const [stats, setStats] = useState({
    total: 0,
    facturados: 0,
    enCarga: 0,
    presupuestos: 0
  });

  // Sidebar Collapse State (inicia colapsado)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Theme State
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const handleSearch = async (filtros) => {
    setLoading(true);
    setError(null);
    setActiveFilter('all');

    try {
      const response = await seguimientoAPI.buscarSeguimiento(filtros);

      if (response.success) {
        setData(response.data);
        setHasSearched(true);

        // Agrupar por presupuestos únicos para contar correctamente
        const presupuestosUnicos = {};
        response.data.forEach(item => {
          const nroPR = item.NroPR || `SOL-${item.NroSolicitud}`;
          const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
          const pk = `${empresa}-${nroPR}`;
          
          if (!presupuestosUnicos[pk]) {
            presupuestosUnicos[pk] = {
              tieneCarga: false,
              tieneFactura: false,
              tienePendiente: false,
              sinCarga: true
            };
          }

          // Determinar si el ITEM individual está pendiente
          const isPending = item.CodigoCarga && 
              (!item.FacturaAsociadaOP || 
               item.FacturaAsociadaOP.includes('Pendiente') ||
               item.FacturaAsociadaOP.includes('CARGA NO FACTURADA'));
          
          const isFacturado = item.CodigoCarga && 
              item.FacturaAsociadaOP && 
              !item.FacturaAsociadaOP.includes('Pendiente') &&
              !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA');

          if (item.CodigoCarga) {
            presupuestosUnicos[pk].tieneCarga = true;
            presupuestosUnicos[pk].sinCarga = false;
          }

          if (isPending) {
            presupuestosUnicos[pk].tienePendiente = true;
          }
          
          if (isFacturado) {
            presupuestosUnicos[pk].tieneFactura = true;
          }
        });

        // Contar presupuestos en cada categoría (un presupuesto puede estar en varias)
        const stats = {
          total: Object.keys(presupuestosUnicos).length,
          facturados: 0,
          enCarga: 0,
          presupuestos: 0
        };

        Object.values(presupuestosUnicos).forEach(p => {
          if (p.tienePendiente) stats.enCarga++;
          if (p.tieneFactura) stats.facturados++;
          if (p.sinCarga) stats.presupuestos++;
          
          // Nota: Si un presupuesto no tiene carga ni está en factura, 
          // cae en 'sinCarga' por defecto en la lógica anterior del loop.
        });
        setStats(stats);
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

  const getFilteredData = () => {
    switch (activeFilter) {
      case 'facturados':
        // Solo facturados: tiene carga Y factura válida (no "Pendiente")
        return data.filter(item =>
          item.CodigoCarga && 
          item.FacturaAsociadaOP && 
          !item.FacturaAsociadaOP.includes('Pendiente') &&
          !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA')
        );
      case 'enCarga':
        // En carga: tiene carga pero NO factura válida
        return data.filter(item =>
          item.CodigoCarga && 
          (!item.FacturaAsociadaOP || 
           item.FacturaAsociadaOP.includes('Pendiente') ||
           item.FacturaAsociadaOP.includes('CARGA NO FACTURADA'))
        );
      case 'sinCarga':
        // Sin carga: no tiene carga asignada
        return data.filter(item => !item.CodigoCarga);
      case 'all':
      default:
        return data;
    }
  };

  const handleStatCardClick = (filterType) => {
    setActiveFilter(filterType);
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="container">
          <div className="header-content">
            <div className="header-logo">
              <img src="/favicon.png" alt="Dibiagi Logo" className="logo-branding" />
              <div>
                <h1 className="header-title">DIBIAGI - Tracking de Ventas</h1>
                <p className="header-subtitle">Sistema de Seguimiento de Documentación</p>
              </div>
            </div>

            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle Dark Mode"
              title={theme === 'light' ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
            >
              {theme === 'light' ? <FaMoon size={18} /> : <FaSun size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {/* Sidebar fijo con botón de flecha */}
        <aside className={`sidebar-fixed ${isSidebarCollapsed ? 'collapsed' : 'expanded'}`}>
          {/* Contenido del sidebar */}
          <div className="sidebar-content">
            <SearchFilters 
              onSearch={handleSearch} 
              loading={loading}
              isCollapsed={isSidebarCollapsed}
            />
          </div>

          {/* Botón de toggle moderno */}
          <button
            className="sidebar-toggle-arrow"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Expandir filtros" : "Contraer filtros"}
          >
            {isSidebarCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
          </button>
        </aside>

        <div className="container main-container">
          <div className="content-area">
            {/* Estadísticas */}
            {hasSearched && !loading && (
              <div className="stats-grid fade-in">
                {/* Card: No Facturados (Prioridad 1) */}
                <div
                  className={`stat-card ${activeFilter === 'enCarga' ? 'stat-card-active' : ''}`}
                  onClick={() => handleStatCardClick('enCarga')}
                  title="Filtrar en carga"
                >
                  <div className="stat-top">
                    <span className="stat-label">No Facturados</span>
                    <div className="stat-icon" style={{ color: 'var(--warning)' }}>
                      <FaTruck />
                    </div>
                  </div>
                  <div className="stat-value">{stats.enCarga}</div>
                </div>

                {/* Card: Sin Carga (Prioridad 2) */}
                <div
                  className={`stat-card ${activeFilter === 'sinCarga' ? 'stat-card-active' : ''}`}
                  onClick={() => handleStatCardClick('sinCarga')}
                  title="Filtrar sin carga"
                >
                  <div className="stat-top">
                    <span className="stat-label">Sin Carga</span>
                    <div className="stat-icon" style={{ color: 'var(--error)' }}>
                      <FaExclamationTriangle />
                    </div>
                  </div>
                  <div className="stat-value">{stats.presupuestos}</div>
                </div>

                {/* Card: Facturados (Prioridad 3) */}
                <div
                  className={`stat-card ${activeFilter === 'facturados' ? 'stat-card-active' : ''}`}
                  onClick={() => handleStatCardClick('facturados')}
                  title="Filtrar facturados"
                >
                  <div className="stat-top">
                    <span className="stat-label">Facturados</span>
                    <div className="stat-icon" style={{ color: 'var(--success)' }}>
                      <FaFileInvoice />
                    </div>
                  </div>
                  <div className="stat-value">{stats.facturados}</div>
                </div>

                {/* Card: Total (Referencia) */}
                <div
                  className={`stat-card ${activeFilter === 'all' ? 'stat-card-active' : ''}`}
                  onClick={() => handleStatCardClick('all')}
                  title="Ver todos los presupuestos"
                >
                  <div className="stat-top">
                    <span className="stat-label">Total Presupuestos</span>
                    <div className="stat-icon">
                      <FaChartLine />
                    </div>
                  </div>
                  <div className="stat-value">{stats.total}</div>
                </div>
              </div>
            )}

            {/* Mensajes de error */}
            {error && (
              <div className="error-message fade-in" style={{
                background: 'var(--error-light)',
                color: 'var(--error)',
                padding: '1rem',
                borderRadius: 'var(--radius)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '2rem'
              }}>
                <FaExclamationTriangle />
                <span>{error}</span>
              </div>
            )}

            {/* Tabla de resultados */}
            {hasSearched && (
              <ResultsTable 
                data={getFilteredData()} 
                allData={data}
                loading={loading} 
                activeFilter={activeFilter}
              />
            )}

            {/* Mensaje inicial */}
            {!hasSearched && !loading && (
              <div className="welcome-message fade-in">
                <FaChartLine className="welcome-icon" />
                <h2>Bienvenido al Sistema de Seguimiento</h2>
                <p>Utiliza los filtros de la izquierda para comenzar la búsqueda</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="container">
          <p>&copy; {new Date().getFullYear()} Transporte Internacional DIBIAGI S.A.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
