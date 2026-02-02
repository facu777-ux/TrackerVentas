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
          const nroPR = item.NroPR;
          if (!presupuestosUnicos[nroPR]) {
            presupuestosUnicos[nroPR] = {
              tieneCarga: false,
              tieneFactura: false,
              sinCarga: true
            };
          }

          // Determinar el estado del presupuesto con lógica correcta
          // Solo tiene carga si CodigoCarga existe
          if (item.CodigoCarga) {
            presupuestosUnicos[nroPR].tieneCarga = true;
            presupuestosUnicos[nroPR].sinCarga = false;
          }

          // Solo tiene factura si tiene carga Y la factura no es "Pendiente"
          if (item.CodigoCarga && 
              item.FacturaAsociadaOP && 
              !item.FacturaAsociadaOP.includes('Pendiente') &&
              !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA')) {
            presupuestosUnicos[nroPR].tieneFactura = true;
          }
        });

        // Clasificar cada presupuesto en UNA SOLA categoría
        // Lógica: Solo es "facturado" si tiene carga Y factura válida
        Object.keys(presupuestosUnicos).forEach(nroPR => {
          const p = presupuestosUnicos[nroPR];
          
          if (p.tieneFactura && p.tieneCarga) {
            // Tiene carga Y factura válida = Facturado
            p.categoria = 'facturado';
          } else if (p.tieneCarga && !p.tieneFactura) {
            // Tiene carga pero NO factura = En Carga
            p.categoria = 'enCarga';
          } else {
            // No tiene carga = Sin Carga (solo presupuesto)
            p.categoria = 'sinCarga';
          }
        });

        const presupuestosArray = Object.values(presupuestosUnicos);

        const stats = {
          total: presupuestosArray.length,
          facturados: presupuestosArray.filter(p => p.categoria === 'facturado').length,
          enCarga: presupuestosArray.filter(p => p.categoria === 'enCarga').length,
          presupuestos: presupuestosArray.filter(p => p.categoria === 'sinCarga').length
        };
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
              <FaTruck className="logo-icon" />
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
