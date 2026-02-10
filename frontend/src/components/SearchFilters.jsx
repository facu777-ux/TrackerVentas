import React, { useState, useEffect, useRef } from 'react';
import { FaSearch, FaCalendarAlt, FaBuilding, FaUser, FaFileAlt, FaTimes, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { seguimientoAPI } from '../services/api';
import './SearchFilters.css';

const SearchFilters = ({ onSearch, loading, isCollapsed, hideTitle }) => {
  const [filters, setFilters] = useState({
    empresa: '',
    fechaDesde: '2024-01-01',
    fechaHasta: new Date().toISOString().split('T')[0],
    cliente: '',
    nroPR: '',
    limit: 100
  });

  const [empresas, setEmpresas] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Estados para autocompletado de clientes
  const [sugerenciasClientes, setSugerenciasClientes] = useState([]);
  const [showSugerencias, setShowSugerencias] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const searchTimeoutRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    cargarEmpresas();

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
        setEmpresas(response.data);
      }
    } catch (error) {
      console.error('Error al cargar empresas:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));

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

  const handleSubmit = (e) => {
    e.preventDefault();
    const filtrosLimpios = {
      ...filters,
      empresa: filters.empresa || null,
      cliente: filters.cliente || null,
      nroPR: filters.nroPR ? parseInt(filters.nroPR) : null
    };
    onSearch(filtrosLimpios);
  };

  const handleReset = () => {
    const resetFilters = {
      empresa: '',
      fechaDesde: '2024-01-01',
      fechaHasta: new Date().toISOString().split('T')[0],
      cliente: '',
      nroPR: '',
      limit: 100
    };
    setFilters(resetFilters);
    setSugerenciasClientes([]);
  };

  return (
    <div className="search-filters-container fade-in">
      {!hideTitle && (
        <div className="filters-header">
          <h2 className="filters-title">
            <FaSearch className="icon" />
            Filtros de Búsqueda
          </h2>
          <button
            type="button"
            className="toggle-advanced-btn"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Ocultar Avanzados' : 'Mostrar Avanzados'}
            {showAdvanced ? <FaChevronUp style={{ marginLeft: '8px' }} /> : <FaChevronDown style={{ marginLeft: '8px' }} />}
          </button>
        </div>
      )}

      {hideTitle && (
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            className="toggle-advanced-btn"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Ocultar Avanzados' : 'Mostrar Avanzados'}
            {showAdvanced ? <FaChevronUp style={{ marginLeft: '8px' }} /> : <FaChevronDown style={{ marginLeft: '8px' }} />}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="filters-form">
        {/* Filtros Principales */}
        <div className="filters-row">
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

        {/* Filtros Avanzados */}
        {showAdvanced && (
          <div className="filters-row advanced-filters slide-in">
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
        <div className="filters-actions">
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
