import React, { useState, useEffect, useRef } from 'react';
import { FaSearch, FaCalendarAlt, FaBuilding, FaUser, FaFileAlt, FaTimes, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { seguimientoAPI } from '../services/api';
import './SearchFilters.css';

const SearchFilters = ({ onSearch, loading, isCollapsed, hideTitle, isInSidebar }) => {
  // Calcular fecha de hace 60 días para el valor por defecto
  const sesentaDiasAtras = new Date();
  sesentaDiasAtras.setDate(sesentaDiasAtras.getDate() - 60);
  const fechaDefecto = sesentaDiasAtras.toISOString().split('T')[0];

  // Calcular fecha de mañana para el límite superior
  const mañana = new Date();
  mañana.setDate(mañana.getDate() + 1);
  const fechaHastaDefecto = mañana.toISOString().split('T')[0];

  const [filters, setFilters] = useState({
    empresa: 'DIBIAG',
    fechaDesde: fechaDefecto,
    fechaHasta: fechaHastaDefecto,
    cliente: '',
    nroPR: '',
    nroFactura: '',
    facturaTipo: '',
    puntoVenta: '',
    nroCarga: '',
    nroRC: '',
    limit: 100
  });

  const [empresas, setEmpresas] = useState([]);
  const [puntosVenta, setPuntosVenta] = useState([]);
  const [loadingPuntosVenta, setLoadingPuntosVenta] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Estados para autocompletado de clientes
  const [sugerenciasClientes, setSugerenciasClientes] = useState([]);
  const [showSugerencias, setShowSugerencias] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const searchTimeoutRef = useRef(null);
  const wrapperRef = useRef(null);
  const pointsWarningLoggedRef = useRef(false);

  useEffect(() => {
    cargarEmpresas();
    cargarPuntosVenta();

    // Click outside handler para cerrar sugerencias
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSugerencias(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const cargarEmpresas = async () => {
    try {
      const response = await seguimientoAPI.obtenerEmpresas();
      if (response.success) {
        // Ordenar para que DIBIAG aparezca primero
        const ordenadas = response.data.sort((a, b) => {
          if (a.Codigo === 'DIBIAG') return -1;
          if (b.Codigo === 'DIBIAG') return 1;
          return a.Nombre.localeCompare(b.Nombre);
        });
        setEmpresas(ordenadas);
      }
    } catch (error) {
      console.error('Error al cargar empresas:', error);
    }
  };

  const cargarPuntosVenta = async () => {
    try {
      setLoadingPuntosVenta(true);
      const response = await seguimientoAPI.obtenerPuntosVenta();
      if (Array.isArray(response?.data)) {
        // Precarga completa para que el selector siempre tenga el catálogo recibido por API.
        const ordered = [...response.data].sort((a, b) =>
          String(a?.sucursalId || '').localeCompare(String(b?.sucursalId || ''), undefined, { numeric: true })
        );
        setPuntosVenta(ordered);
      }

      if (!response?.success) {
        if (!pointsWarningLoggedRef.current) {
          console.warn('Puntos de venta cargados con advertencia:', response?.warning || 'sin detalle');
          pointsWarningLoggedRef.current = true;
        }
      }
    } catch (error) {
      if (!pointsWarningLoggedRef.current) {
        console.error('Error al cargar puntos de venta:', error);
        pointsWarningLoggedRef.current = true;
      }
    } finally {
      setLoadingPuntosVenta(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'facturaTipo') {
      const normalizedType = String(value || '').toUpperCase();
      setFilters(prev => ({
        ...prev,
        facturaTipo: normalizedType,
        puntoVenta: normalizedType === 'E' ? '9996' : prev.puntoVenta
      }));
    } else if (name === 'puntoVenta') {
      setFilters(prev => ({
        ...prev,
        puntoVenta: prev.facturaTipo === 'E' ? '9996' : value
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        [name]: value
      }));
    }

    // Lógica específica para búsqueda de clientes
    if (name === 'cliente') {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (value.length >= 2) {
        setLoadingClientes(true);
        searchTimeoutRef.current = setTimeout(async () => {
          try {
            const response = await seguimientoAPI.buscarClientes(value);
            if (response.success) {
              setSugerenciasClientes(response.data);
              setShowSugerencias(true);
            }
          } catch (error) {
            console.error('Error buscando clientes:', error);
          } finally {
            setLoadingClientes(false);
          }
        }, 300); // Debounce de 300ms
      } else {
        setSugerenciasClientes([]);
        setShowSugerencias(false);
      }
    }
  };

  const seleccionarCliente = (cliente) => {
    setFilters(prev => ({
      ...prev,
      cliente: cliente.Nombre // O cliente.Codigo si prefieres buscar por código
    }));
    setShowSugerencias(false);
  };

  const applyQuickFilter = (type) => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    
    let desde = new Date();
    let hasta = tomorrow;

    // Resetear horas para comparaciones limpias
    today.setHours(0, 0, 0, 0);
    desde.setHours(0, 0, 0, 0);

    switch (type) {
      case 'hoy':
        desde = today;
        break;
      case 'semana':
        const day = today.getDay() || 7;
        desde.setDate(today.getDate() - day + 1);
        break;
      case 'mes':
        desde = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'mes-anterior':
        desde = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        hasta = new Date(today.getFullYear(), today.getMonth(), 0);
        hasta.setDate(hasta.getDate() + 1); // Para incluir el último día
        break;
      case '3-meses':
        desde = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
        break;
      case 'año':
        desde = new Date(today.getFullYear(), 0, 1);
        break;
      case 'todo':
        desde = new Date(2010, 0, 1);
        break;
      default:
        return;
    }

    setFilters(prev => ({
      ...prev,
      fechaDesde: desde.toISOString().split('T')[0],
      fechaHasta: hasta.toISOString().split('T')[0]
    }));
  };

  const isQuickActive = (type) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    let desde = new Date();
    let hasta = tomorrow;

    switch (type) {
      case 'hoy': desde = today; break;
      case 'semana':
        const day = today.getDay() || 7;
        desde.setDate(today.getDate() - day + 1);
        desde.setHours(0,0,0,0);
        break;
      case 'mes':
        desde = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'mes-anterior':
        desde = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        hasta = new Date(today.getFullYear(), today.getMonth(), 0);
        hasta.setDate(hasta.getDate() + 1);
        break;
      case '3-meses':
        desde = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
        desde.setHours(0,0,0,0);
        break;
      case 'año':
        desde = new Date(today.getFullYear(), 0, 1);
        break;
      case 'todo':
        desde = new Date(2010, 0, 1);
        break;
      default: return false;
    }

    return filters.fechaDesde === desde.toISOString().split('T')[0] && 
           filters.fechaHasta === hasta.toISOString().split('T')[0];
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const filtrosLimpios = {
      ...filters,
      empresa: filters.empresa || null,
      cliente: filters.cliente || null,
      nroPR: filters.nroPR ? parseInt(filters.nroPR) : null,
      nroFactura: filters.nroFactura ? parseInt(filters.nroFactura) : null,
      facturaTipo: filters.facturaTipo || null,
      puntoVenta: filters.facturaTipo === 'E'
        ? '9996'
        : (filters.puntoVenta ? String(filters.puntoVenta).replace(/\D/g, '') : null),
      nroCarga: filters.nroCarga ? parseInt(filters.nroCarga) : null,
      nroRC: filters.nroRC ? parseInt(filters.nroRC) : null
    };
    onSearch(filtrosLimpios);
  };

  const handleReset = () => {
    const sesentaDiasAtras = new Date();
    sesentaDiasAtras.setDate(sesentaDiasAtras.getDate() - 60);
    const fechaDefecto = sesentaDiasAtras.toISOString().split('T')[0];
    
    const mañana = new Date();
    mañana.setDate(mañana.getDate() + 1);
    const fechaHastaDefecto = mañana.toISOString().split('T')[0];

    const resetFilters = {
      empresa: 'DIBIAG',
      fechaDesde: fechaDefecto,
      fechaHasta: fechaHastaDefecto,
      cliente: '',
      nroPR: '',
      nroFactura: '',
      facturaTipo: '',
      puntoVenta: '',
      nroCarga: '',
      nroRC: '',
      limit: 100
    };
    setFilters(resetFilters);
    setSugerenciasClientes([]);
  };

  const renderFacturaExtras = () => (
    <>
      <div className="filter-group">
        <label htmlFor="facturaTipo">
          <FaFileAlt className="label-icon" />
          Tipo de Factura
        </label>
        <select
          id="facturaTipo"
          name="facturaTipo"
          value={filters.facturaTipo}
          onChange={handleChange}
          className="filter-input"
        >
          <option value="">Todos los tipos</option>
          <option value="A">Factura A</option>
          <option value="B">Factura B</option>
          <option value="E">Factura E</option>
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="puntoVenta">
          <FaFileAlt className="label-icon" />
          Punto de Venta
        </label>
        <select
          id="puntoVenta"
          name="puntoVenta"
          value={filters.puntoVenta}
          onChange={handleChange}
          className="filter-input"
          disabled={loadingPuntosVenta || filters.facturaTipo === 'E'}
        >
          <option value="">Todos los puntos</option>
          {puntosVenta.map((pv) => (
            <option key={`${pv.empresaId}-${pv.sucursalId}`} value={pv.sucursalId || ''}>
              {pv.label || pv.descripcion || pv.sucursalId}
            </option>
          ))}
        </select>
        <small className="filter-helper-text">
          {loadingPuntosVenta
            ? 'Cargando puntos de venta...'
            : (puntosVenta.length > 0
              ? `${puntosVenta.length} puntos de venta precargados`
              : 'Sin puntos de venta disponibles')}
        </small>
      </div>
    </>
  );

  return (
    <div className="search-filters-container">
      {!hideTitle && (
        <div className="filters-header">
          <h1 className="filters-title">
            <FaSearch className="icon" />
            Explorar Seguimiento
          </h1>
          <button
            type="button"
            className="toggle-advanced-btn"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Filtros Simples' : 'Filtros Avanzados'}
            {showAdvanced ? <FaChevronUp style={{ marginLeft: '8px' }} /> : <FaChevronDown style={{ marginLeft: '8px' }} />}
          </button>
        </div>
      )}


      <form onSubmit={handleSubmit} className="filters-form">
        {/* Botón toggle para modo sidebar — aparece al tope del form */}
        {hideTitle && (
          <div style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className={`toggle-advanced-btn ${showAdvanced ? 'is-open' : ''}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Ocultar Avanzados' : 'Mostrar Avanzados'}
              <FaChevronDown style={{ marginLeft: '8px' }} />
            </button>
          </div>
        )}

        {/* Filtros Avanzados — en sidebar aparecen justo bajo el botón */}
        {hideTitle && showAdvanced && (
          <div className={`filters-row advanced-filters slide-in ${isInSidebar ? 'sidebar-filters-row' : ''}`}>
            <div className="filter-group" ref={wrapperRef} style={{ position: 'relative' }}>
              <label htmlFor="cliente">
                <FaUser className="label-icon" />
                Cliente
              </label>
              <div className="input-with-icon">
                <input
                  type="text"
                  id="cliente"
                  name="cliente"
                  value={filters.cliente}
                  onChange={handleChange}
                  className="filter-input"
                  placeholder="Buscar cliente..."
                  autoComplete="off"
                />
                <FaSearch className="input-icon-right" />
              </div>

              {/* Dropdown de Sugerencias */}
              {showSugerencias && sugerenciasClientes.length > 0 && (
                <ul className="suggestions-list">
                  {sugerenciasClientes.map((cliente) => (
                    <li
                      key={cliente.Codigo}
                      onClick={() => seleccionarCliente(cliente)}
                      className="suggestion-item"
                    >
                      <span className="suggestion-name">{cliente.Nombre}</span>
                      <span className="suggestion-code">{cliente.Codigo}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="filter-group">
              <label htmlFor="nroPR">
                <FaFileAlt className="label-icon" />
                Número de PR
              </label>
              <input
                type="number"
                id="nroPR"
                name="nroPR"
                value={filters.nroPR}
                onChange={handleChange}
                className="filter-input"
                placeholder="Número de presupuesto"
              />
            </div>

            {renderFacturaExtras()}

            <div className="filter-group">
              <label htmlFor="nroFactura">
                <FaFileAlt className="label-icon" />
                Número de Factura
              </label>
              <input
                type="number"
                id="nroFactura"
                name="nroFactura"
                value={filters.nroFactura}
                onChange={handleChange}
                className="filter-input"
                placeholder="Número de factura"
              />
            </div>

            <div className="filter-group">
              <label htmlFor="nroCarga">
                <FaFileAlt className="label-icon" />
                Número de Carga
              </label>
              <input
                type="number"
                id="nroCarga"
                name="nroCarga"
                value={filters.nroCarga}
                onChange={handleChange}
                className="filter-input"
                placeholder="Número de carga"
              />
            </div>

            <div className="filter-group">
              <label htmlFor="nroRC">
                <FaFileAlt className="label-icon" />
                Nº Recibo de Cobranza
              </label>
              <input
                type="number"
                id="nroRC"
                name="nroRC"
                value={filters.nroRC}
                onChange={handleChange}
                className="filter-input"
                placeholder="Número de recibo"
              />
            </div>

            <div className="filter-group">
              <label htmlFor="limit">
                <FaFileAlt className="label-icon" />
                Límite de resultados
              </label>
              <select
                id="limit"
                name="limit"
                value={filters.limit}
                onChange={handleChange}
                className="filter-input"
              >
                <option value="50">50 registros</option>
                <option value="100">100 registros</option>
                <option value="250">250 registros</option>
                <option value="500">500 registros</option>
                <option value="1000">1000 registros</option>
              </select>
            </div>
          </div>
        )}

        {/* Filtros Principales */}
        <div className={`filters-row ${isInSidebar ? 'sidebar-filters-row' : ''}`}>
          <div className="filter-group">
            <label htmlFor="fechaDesde">
              <FaCalendarAlt className="label-icon" />
              Fecha Desde
            </label>
            <input
              type="date"
              id="fechaDesde"
              name="fechaDesde"
              value={filters.fechaDesde}
              onChange={handleChange}
              className="filter-input"
              required
            />
          </div>

          <div className="filter-group">
            <label htmlFor="fechaHasta">
              <FaCalendarAlt className="label-icon" />
              Fecha Hasta
            </label>
            <input
              type="date"
              id="fechaHasta"
              name="fechaHasta"
              value={filters.fechaHasta}
              onChange={handleChange}
              className="filter-input"
              required
            />
          </div>

          <div className="filter-group">
            <label htmlFor="empresa">
              <FaBuilding className="label-icon" />
              Empresa
            </label>
            <select
              id="empresa"
              name="empresa"
              value={filters.empresa}
              onChange={handleChange}
              className="filter-input"
            >
              <option value="">Todas las empresas</option>
              {empresas.map((emp) => (
                <option key={emp.Codigo} value={emp.Codigo}>
                  {emp.Nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Acceso rápido a fechas */}
        <div className={`quick-filters-container ${isInSidebar ? 'sidebar-quick-filters' : ''}`}>
          <span className="quick-filters-label">Acceso rápido:</span>
          <div className="quick-filters-btns">
            <button type="button" onClick={() => applyQuickFilter('hoy')} className={`quick-btn ${isQuickActive('hoy') ? 'active' : ''}`}>Hoy</button>
            <button type="button" onClick={() => applyQuickFilter('semana')} className={`quick-btn ${isQuickActive('semana') ? 'active' : ''}`}>Esta semana</button>
            <button type="button" onClick={() => applyQuickFilter('mes')} className={`quick-btn ${isQuickActive('mes') ? 'active' : ''}`}>Este mes</button>
            <button type="button" onClick={() => applyQuickFilter('mes-anterior')} className={`quick-btn ${isQuickActive('mes-anterior') ? 'active' : ''}`}>Mes anterior</button>
            <button type="button" onClick={() => applyQuickFilter('3-meses')} className={`quick-btn ${isQuickActive('3-meses') ? 'active' : ''}`}>Últimos 3 meses</button>
            <button type="button" onClick={() => applyQuickFilter('año')} className={`quick-btn ${isQuickActive('año') ? 'active' : ''}`}>Este año</button>
            <button type="button" onClick={() => applyQuickFilter('todo')} className={`quick-btn ${isQuickActive('todo') ? 'active' : ''}`}>Todo el historial</button>
          </div>
        </div>

        {/* Filtros Avanzados — en modo no-sidebar aparecen tras el acceso rápido */}
        {!hideTitle && showAdvanced && (
          <div className={`filters-row advanced-filters slide-in ${isInSidebar ? 'sidebar-filters-row' : ''}`}>
            <div className="filter-group" ref={wrapperRef} style={{ position: 'relative' }}>
              <label htmlFor="cliente">
                <FaUser className="label-icon" />
                Cliente
              </label>
              <div className="input-with-icon">
                <input
                  type="text"
                  id="cliente"
                  name="cliente"
                  value={filters.cliente}
                  onChange={handleChange}
                  className="filter-input"
                  placeholder="Buscar cliente..."
                  autoComplete="off"
                />
                <FaSearch className="input-icon-right" />
              </div>

              {/* Dropdown de Sugerencias */}
              {showSugerencias && sugerenciasClientes.length > 0 && (
                <ul className="suggestions-list">
                  {sugerenciasClientes.map((cliente) => (
                    <li
                      key={cliente.Codigo}
                      onClick={() => seleccionarCliente(cliente)}
                      className="suggestion-item"
                    >
                      <span className="suggestion-name">{cliente.Nombre}</span>
                      <span className="suggestion-code">{cliente.Codigo}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="filter-group">
              <label htmlFor="nroPR">
                <FaFileAlt className="label-icon" />
                Número de PR
              </label>
              <input
                type="number"
                id="nroPR"
                name="nroPR"
                value={filters.nroPR}
                onChange={handleChange}
                className="filter-input"
                placeholder="Número de presupuesto"
              />
            </div>

            {renderFacturaExtras()}

            <div className="filter-group">
              <label htmlFor="nroFactura">
                <FaFileAlt className="label-icon" />
                Número de Factura
              </label>
              <input
                type="number"
                id="nroFactura"
                name="nroFactura"
                value={filters.nroFactura}
                onChange={handleChange}
                className="filter-input"
                placeholder="Número de factura"
              />
            </div>

            <div className="filter-group">
              <label htmlFor="nroCarga">
                <FaFileAlt className="label-icon" />
                Número de Carga
              </label>
              <input
                type="number"
                id="nroCarga"
                name="nroCarga"
                value={filters.nroCarga}
                onChange={handleChange}
                className="filter-input"
                placeholder="Número de carga"
              />
            </div>

            <div className="filter-group">
              <label htmlFor="nroRC">
                <FaFileAlt className="label-icon" />
                Nº Recibo de Cobranza
              </label>
              <input
                type="number"
                id="nroRC"
                name="nroRC"
                value={filters.nroRC}
                onChange={handleChange}
                className="filter-input"
                placeholder="Número de recibo"
              />
            </div>

            <div className="filter-group">
              <label htmlFor="limit">
                <FaFileAlt className="label-icon" />
                Límite de resultados
              </label>
              <select
                id="limit"
                name="limit"
                value={filters.limit}
                onChange={handleChange}
                className="filter-input"
              >
                <option value="50">50 registros</option>
                <option value="100">100 registros</option>
                <option value="250">250 registros</option>
                <option value="500">500 registros</option>
                <option value="1000">1000 registros</option>
              </select>
            </div>
          </div>
        )}

        {/* Botones de Acción */}
        <div className={`filters-actions ${isInSidebar ? 'sidebar-filters-actions' : ''}`}>
          <button
            type="button"
            onClick={handleReset}
            className="btn btn-secondary"
            disabled={loading}
          >
            <FaTimes className="btn-icon" />
            Limpiar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            <FaSearch className="btn-icon" />
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SearchFilters;
