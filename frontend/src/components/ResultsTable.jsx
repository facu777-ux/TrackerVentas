import React, { useState } from 'react';
import {
    FaFileInvoice,
    FaTruck,
    FaCheckCircle,
    FaTimesCircle,
    FaExclamationCircle,
    FaSort,
    FaSortUp,
    FaSortDown,
    FaSearch,
    FaDownload,
    FaChevronLeft,
    FaChevronRight,
    FaEye,
    FaChevronDown,
    FaChevronUp
} from 'react-icons/fa';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import DetailModal from './DetailModal';
import './ResultsTable.css';

const ResultsTable = ({ data, loading, activeFilter }) => {
    // Helpers (Definidos antes de ser usados en useMemo para evitar TDZ)
    const getEstadoInfo = (item) => {
        const factura = item.FacturaAsociadaOP;
        const recibo = item.ReciboCobranza;

        if (recibo && !recibo.includes('Pendiente')) {
            return { class: 'badge-pagado', text: 'PAGADO' };
        } else if (factura && !factura.includes('CARGA NO FACTURADA') && !factura.includes('Pendiente')) {
            return { class: 'badge-facturado', text: 'FACTURADO' };
        } else if (item.CodigoCarga) {
            return { class: 'badge-asignado', text: 'No Facturado' };
        } else {
            return { class: 'badge-presupuesto', text: 'PRESUPUESTO' };
        }
    };

    const formatFecha = (fecha) => {
        if (!fecha) return '-';
        try {
            return format(new Date(fecha), 'dd/MM/yyyy');
        } catch {
            return '-';
        }
    };

    const formatMonto = (valor) => {
        if (valor === null || valor === undefined) return '-';
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS'
        }).format(valor);
    };

    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [selectedItem, setSelectedItem] = useState(null);
    const [modalMode, setModalMode] = useState(null); // 'presupuesto', 'carga', 'factura', 'recibo', 'all'
    const [estadoSubFilter, setEstadoSubFilter] = useState('all'); // 'all', 'facturado', 'pagado'
    const [showEstadoModal, setShowEstadoModal] = useState(false);

    // Estados para controlar qué elementos están expandidos
    const [expandedPresupuestos, setExpandedPresupuestos] = useState(new Set());

    // Filtrado
    const filteredData = React.useMemo(() => {
        let base = data.filter(item => {
            const searchLower = searchTerm.toLowerCase();
            return (
                item.NroPR?.toString().includes(searchLower) ||
                item.NomCliente?.toLowerCase().includes(searchLower) ||
                item.DescrpProd?.toLowerCase().includes(searchLower) ||
                item.CodigoCarga?.toString().includes(searchLower) ||
                item.FacturaAsociadaOP?.toLowerCase().includes(searchLower)
            );
        });

        // Aplicar sub-filtro de estado si corresponde (independiente de activeFilter para mayor robustez)
        if (estadoSubFilter !== 'all') {
            base = base.filter(item => {
                const info = getEstadoInfo(item);
                if (estadoSubFilter === 'facturado') return info.text === 'FACTURADO';
                if (estadoSubFilter === 'pagado') return info.text === 'PAGADO';
                if (estadoSubFilter === 'noFacturado') return info.text === 'No Facturado';
                return true;
            });
        }
        return base;
    }, [data, searchTerm, activeFilter, estadoSubFilter]);

    // Agrupar datos por Presupuesto -> Carga -> Factura
    const groupedData = React.useMemo(() => {
        const groups = {};

        filteredData.forEach(item => {
            // Clave única: Preferir NroPR, sino NroSolicitud
            const presupuestoKey = item.NroPR || `SOL-${item.NroSolicitud}` || `ITEM-${item.ArtCod}`;

            if (!groups[presupuestoKey]) {
                groups[presupuestoKey] = {
                    presupuesto: item.NroPR || item.NroSolicitud,
                    key: presupuestoKey,
                    info: item, // Guardamos la info del presupuesto
                    cargas: {},
                    maxFecha: item.FchMovimiento || item.FchAltaRegistro, // Para ordenar presupuestos
                    budgetTotal: 0 // Nuevo campo para el total administrativo
                };
            }

            // Sumar al total del presupuesto
            groups[presupuestoKey].budgetTotal += (item.TotalItem || 0);

            // Si tiene carga, agrupar por carga
            if (item.CodigoCarga) {
                const carga = item.CodigoCarga;

                if (!groups[presupuestoKey].cargas[carga]) {
                    groups[presupuestoKey].cargas[carga] = {
                        carga,
                        info: item, // Info de la carga
                        facturas: [],
                        maxFecha: item.FecAltCarga || item.FchMovimiento // Para ordenar cargas
                    };
                }

                // Actualizar la fecha más reciente de la carga
                const cargaFecha = item.FecAltCarga || item.FchMovimiento;
                if (cargaFecha > groups[presupuestoKey].cargas[carga].maxFecha) {
                    groups[presupuestoKey].cargas[carga].maxFecha = cargaFecha;
                }

                // Agregar factura o item a la carga
                groups[presupuestoKey].cargas[carga].facturas.push(item);
            } else {
                // Si no tiene carga, agregar directamente al presupuesto
                if (!groups[presupuestoKey].cargas['sin-carga']) {
                    groups[presupuestoKey].cargas['sin-carga'] = {
                        carga: null,
                        info: item,
                        facturas: [],
                        maxFecha: item.FchMovimiento || item.FchAltaRegistro
                    };
                }
                groups[presupuestoKey].cargas['sin-carga'].facturas.push(item);
            }
        });

        // Convertir a array y aplicar ordenamiento principal
        const presupuestosArray = Object.values(groups).sort((a, b) => {
            if (sortConfig.key === 'presupuesto') {
                const valA = a.presupuesto || 0;
                const valB = b.presupuesto || 0;
                if (sortConfig.direction === 'asc') return valA - valB;
                return valB - valA;
            }
            if (sortConfig.key === 'cliente_monto') {
                const valA = a.budgetTotal || 0;
                const valB = b.budgetTotal || 0;
                // Siempre mayor monto primero si se selecciona por defecto, o togglable?
                // El usuario dijo "que se ordene por el Cliente con el mayor monto", 
                // asumimos toggle si ya está seleccionado o forzar desc. 
                // Usaremos toggle para consistencia.
                if (sortConfig.direction === 'asc') return valA - valB;
                return valB - valA;
            }

            // Orden por defecto: maxFecha descendente
            const fechaA = new Date(a.maxFecha);
            const fechaB = new Date(b.maxFecha);
            return fechaB - fechaA;
        });

        // Ordenar cargas y facturas dentro de cada presupuesto
        presupuestosArray.forEach(presupuesto => {
            // Convertir cargas a array y ordenar por fecha descendente
            const cargasArray = Object.values(presupuesto.cargas).sort((a, b) => {
                const fechaA = new Date(a.maxFecha);
                const fechaB = new Date(b.maxFecha);
                return fechaB - fechaA; // Descendente
            });

            // Ordenar facturas dentro de cada carga por fecha descendente
            cargasArray.forEach(carga => {
                carga.facturas.sort((a, b) => {
                    const fechaA = new Date(a.FchMovimiento || a.FchAltaRegistro);
                    const fechaB = new Date(b.FchMovimiento || b.FchAltaRegistro);
                    return fechaB - fechaA; // Descendente
                });
            });

            // Reemplazar el objeto de cargas con el array ordenado
            presupuesto.cargasArray = cargasArray;
        });

        return presupuestosArray;
    }, [filteredData, sortConfig]);

    // Paginación sobre presupuestos agrupados
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentGroups = groupedData.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(groupedData.length / itemsPerPage);

    // Lista de etapas navegables restringida al contexto actual
    const navigableItems = React.useMemo(() => {
        if (!selectedItem) return [];
        
        const currentGroup = groupedData.find(g => g.presupuesto === (selectedItem.NroPR || selectedItem.NroSolicitud));
        if (!currentGroup) return [];

        const items = [];
        const currentMode = modalMode || 'all';

        if (currentMode !== 'all') {
            // MODO ETAPAS: Navegar entre los círculos (etapas) del MISMO item
            // 1. Presupuesto
            if (selectedItem.NroPR) {
                items.push({ data: selectedItem, mode: 'presupuesto' });
            }
            // 2. Carga
            if (selectedItem.CodigoCarga) {
                items.push({ data: selectedItem, mode: 'carga' });
            }
            // 3. Factura
            const factura = selectedItem.FacturaAsociadaOP;
            if (factura && !factura.includes('CARGA NO FACTURADA') && !factura.includes('Pendiente')) {
                items.push({ data: selectedItem, mode: 'factura' });
            }
            // 4. Recibo
            const recibo = selectedItem.ReciboCobranza;
            if (recibo && !recibo.includes('Pendiente')) {
                items.push({ data: selectedItem, mode: 'recibo' });
            }
        } else {
            // MODO ITEMS: Navegar entre vistas generales ('all') de todos los items del presupuesto
            currentGroup.cargasArray.forEach(cargaGroup => {
                cargaGroup.facturas.forEach(record => {
                    items.push({ data: record, mode: 'all' });
                });
            });
        }
        return items;
    }, [groupedData, selectedItem, modalMode]);

    const currentIndex = navigableItems.findIndex(ni => 
        ni.data === selectedItem && (ni.mode === (modalMode || 'all'))
    );

    const handleNext = () => {
        if (currentIndex < navigableItems.length - 1) {
            const next = navigableItems[currentIndex + 1];
            setSelectedItem(next.data);
            setModalMode(next.mode);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            const prev = navigableItems[currentIndex - 1];
            setSelectedItem(prev.data);
            setModalMode(prev.mode);
        }
    };

    const togglePresupuesto = (key) => {
        const newExpanded = new Set(expandedPresupuestos);
        if (newExpanded.has(key)) {
            newExpanded.delete(key);
        } else {
            newExpanded.add(key);
        }
        setExpandedPresupuestos(newExpanded);
    };



    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const clearLocalFilters = () => {
        setSortConfig({ key: null, direction: 'asc' });
        setEstadoSubFilter('all');
        setShowEstadoModal(false);
    };

    const getSortIcon = (columnKey) => {
        if (sortConfig.key !== columnKey) {
            return <FaSort className="sort-icon" />;
        }
        return sortConfig.direction === 'asc'
            ? <FaSortUp className="sort-icon active" />
            : <FaSortDown className="sort-icon active" />;
    };



    const exportToExcel = () => {
        // Preparar los datos para Excel
        const excelData = filteredData.map(item => ({
            'Estado Flujo': item.EstadoFlujo || '-',
            'Empresa': item.EmpOri || '-',
            'Nro PR': item.NroPR || '-',
            'Fecha Movimiento': formatFecha(item.FchMovimiento),
            'Fecha Alta': formatFecha(item.FchAltaRegistro),
            'Cliente': item.NomCliente || '-',
            'Código Cliente': item.CodCliente || '-',
            'Contacto': item.ContactoDeCliente || '-',
            'Producto': item.DescrpProd || '-',
            'Código Producto': `${item.TipPro || ''}-${item.ArtCod || ''}`,
            'Cantidad': item.Cantidad || 0,
            'Unidad': item.UnidadMedida || '-',
            'Precio Unitario': item.Precio || 0,
            'Total Item': item.TotalItem || 0,
            'Código Carga': item.CodigoCarga || '-',
            'Nro CRT': item.NroCRT || '-',
            'Fecha Alta Carga': formatFecha(item.FecAltCarga),
            'Factura': item.FacturaAsociadaOP || '-',
            'Recibo Cobranza': item.ReciboCobranza || '-',
            'Lista Precio': item.ListaPrecio || '-',
            'Condición Pago': item.CondicionPago || '-',
            'Observaciones PR': item.ObservacionesPR || '-',
            'Observaciones Item': item.ObservacionesItem || '-',
            'Descripción Viaje': item.DescrpViaj || '-',
            'Nro Solicitud': item.NroSolicitud || '-',
            'Estado Solicitud': item.EstadoSolicitud || '-'
        }));

        // Crear el libro de trabajo
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Ajustar el ancho de las columnas automáticamente
        const colWidths = [];
        const headers = Object.keys(excelData[0] || {});
        
        headers.forEach((header, i) => {
            const maxLength = Math.max(
                header.length,
                ...excelData.map(row => String(row[header] || '').length)
            );
            colWidths.push({ wch: Math.min(maxLength + 2, 50) }); // Max 50 caracteres
        });
        
        ws['!cols'] = colWidths;

        // Agregar la hoja al libro
        XLSX.utils.book_append_sheet(wb, ws, 'Seguimiento Comprobantes');

        // Generar el archivo y descargarlo
        const fileName = `Seguimiento_Comprobantes_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    const handleRowClick = (item, e) => {
        e.stopPropagation();
        setSelectedItem(item);
    };

    const handleCloseModal = () => {
        setSelectedItem(null);
        setModalMode(null);
    };

    const renderCompactTimeline = (item) => {
        const factura = item.FacturaAsociadaOP;
        const isFacturado = factura && !factura.includes('CARGA NO FACTURADA') && !factura.includes('Pendiente');
        const hasCarga = !!item.CodigoCarga;
        const hasPR = !!item.NroPR;
        const hasRecibo = item.ReciboCobranza && !item.ReciboCobranza.includes('Pendiente');

        const formatFechaHora = (fecha) => {
            if (!fecha) return '';
            try {
                return format(new Date(fecha), 'dd/MM/yyyy HH:mm');
            } catch {
                return '';
            }
        };

        const steps = [
            { id: 1, label: 'Presupuesto', sublabel: `PR Nº ${item.NroPR}`, date: formatFechaHora(item.FchMovimiento), completed: hasPR, mode: 'presupuesto' },
            { id: 2, label: 'Carga', sublabel: `Carga Nº ${item.CodigoCarga}`, date: formatFechaHora(item.FecAltCarga), completed: hasCarga, mode: 'carga' },
            { id: 3, label: 'Factura', sublabel: factura || 'Pendiente Facturación', date: '', completed: isFacturado, mode: 'factura' },
            { id: 4, label: 'Recibo de Cobranza', sublabel: item.ReciboCobranza || 'Sin recibo de cobranza', date: '', completed: hasRecibo, mode: 'recibo' }
        ];

        return (
            <div className="table-process-timeline" onClick={(e) => e.stopPropagation()}>
                {steps.map((step) => (
                    <div 
                        key={step.id} 
                        className={`table-timeline-item ${step.completed ? 'completed' : ''}`}
                        onClick={() => {
                            setSelectedItem(item);
                            setModalMode(step.mode);
                        }}
                    >
                        <div className="table-timeline-marker">{step.id}</div>
                        <div className="table-timeline-content">
                            <h4>{step.label}</h4>
                            <p title={step.sublabel}>{step.sublabel}</p>
                            {step.date && <small>{step.date}</small>}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Cargando datos...</p>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="no-data-container">
                <FaExclamationCircle className="no-data-icon" />
                <h3>No se encontraron resultados</h3>
                <p>Intenta ajustar los filtros de búsqueda</p>
            </div>
        );
    }

    return (
        <div className="results-table-container fade-in">
            {/* Header con búsqueda y exportación */}
            <div className="table-header">
                <div className="table-info">
                    <h3 className="table-title">
                        Resultados de Búsqueda
                        {groupedData.length > 0 && (
                            <span className="empresa-badge" style={{ marginLeft: '1rem', verticalAlign: 'middle' }}>
                                {groupedData[0].info.EmpOri}
                            </span>
                        )}
                    </h3>
                    <span className="results-count">
                        {groupedData.length} presupuesto{groupedData.length !== 1 ? 's' : ''} encontrado{groupedData.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="table-actions">
                    <div className="search-box">
                        <FaSearch className="search-icon" />
                        <input
                            type="text"
                            placeholder="Buscar en resultados..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="search-input"
                        />
                    </div>
                    {/* Botón Limpiar Filtros */}
                    {(sortConfig.key || estadoSubFilter !== 'all') && (
                        <button onClick={clearLocalFilters} className="btn-clear-filters" title="Limpiar orden y sub-filtros">
                            <FaTimesCircle /> Limpiar Filtros
                        </button>
                    )}
                    <button onClick={exportToExcel} className="btn-export">
                        <FaDownload /> Exportar a Excel
                    </button>
                </div>
            </div>

            {/* Ayuda visual */}
            <div className="table-help">
                <FaEye className="help-icon" />
                <span>Haz clic en los presupuestos para expandir/contraer. Haz clic en las cargas o en el icono del ojo para ver detalles.</span>
            </div>

            {/* Tabla jerárquica */}
            <div className="table-wrapper">
                <table className="results-table hierarchical-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <colgroup>
                        <col style={{ width: '30%' }} />
                        <col style={{ width: '40%' }} />
                        <col style={{ width: '30%' }} />
                    </colgroup>
                    <thead>
                        <tr className="bg-slate-950 text-slate-400 text-sm uppercase tracking-wider border-b border-slate-800">
                            <th 
                                className="py-4 font-medium clickable-header" 
                                style={{ textAlign: 'left', paddingLeft: '2.5rem', cursor: 'pointer' }}
                                onClick={() => handleSort('presupuesto')}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    N° Presupuesto / Fecha {getSortIcon('presupuesto')}
                                </div>
                            </th>
                            <th 
                                className="py-4 font-medium relative clickable-header" 
                                style={{ textAlign: 'center' }}
                            >
                                <div 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        gap: '0.5rem',
                                        cursor: 'pointer' 
                                    }}
                                    onClick={() => setShowEstadoModal(!showEstadoModal)}
                                >
                                    Estado <FaChevronDown style={{ fontSize: '0.8rem', opacity: (activeFilter === 'facturados' || activeFilter === 'enCarga') ? 1 : 0.4 }} />
                                </div>

                                {/* Mini Modal / Dropdown para Estado */}
                                {showEstadoModal && (
                                    <div className="status-dropdown fade-in">
                                        <div 
                                            className={`dropdown-item ${estadoSubFilter === 'all' ? 'active' : ''}`}
                                            onClick={() => { setEstadoSubFilter('all'); setShowEstadoModal(false); }}
                                        >
                                            Todos
                                        </div>
                                        <div 
                                            className={`dropdown-item ${estadoSubFilter === 'facturado' ? 'active' : ''}`}
                                            onClick={() => { setEstadoSubFilter('facturado'); setShowEstadoModal(false); }}
                                        >
                                            Facturado
                                        </div>
                                        <div 
                                            className={`dropdown-item ${estadoSubFilter === 'noFacturado' ? 'active' : ''}`}
                                            onClick={() => { setEstadoSubFilter('noFacturado'); setShowEstadoModal(false); }}
                                        >
                                            No Facturado
                                        </div>
                                        <div 
                                            className={`dropdown-item ${estadoSubFilter === 'pagado' ? 'active' : ''}`}
                                            onClick={() => { setEstadoSubFilter('pagado'); setShowEstadoModal(false); }}
                                        >
                                            Pagado
                                        </div>
                                    </div>
                                )}
                            </th>
                            <th 
                                className="py-4 font-medium clickable-header" 
                                style={{ textAlign: 'right', paddingRight: '2.5rem', cursor: 'pointer' }}
                                onClick={() => handleSort('cliente_monto')}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                    {getSortIcon('cliente_monto')} Cliente / Monto
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentGroups.map((group) => {
                            const isPresupuestoExpanded = expandedPresupuestos.has(group.key);
                            const cargasArray = group.cargasArray; // Ya viene ordenado

                            return (
                                <React.Fragment key={group.key}>
                                    {/* Fila del Presupuesto */}
                                    <tr
                                        className={`presupuesto-row ${isPresupuestoExpanded ? 'expanded' : ''}`}
                                        onClick={() => togglePresupuesto(group.key)}
                                        style={{ position: 'relative' }}
                                    >
                                        {/* Columna 1: Info Básica */}
                                        <td className="py-5" style={{ textAlign: 'left', paddingLeft: '2.5rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                                <span className="font-bold text-white" style={{ fontSize: '1rem' }}>
                                                    {<span style={{ color: 'var(--primary-color)', marginRight: '2px', fontSize: '1.2rem' }}>{group.presupuesto}</span>}
                                                </span>
                                                <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
                                                    {formatFecha(group.info.FchMovimiento)}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Columna 2: Estado y Botón Flotante */}
                                        <td className="py-5 relative" style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                {(() => {
                                                    const status = getEstadoInfo(group.info);
                                                    return <span className={`badge ${status.class}`} style={{ margin: '0 auto' }}>{status.text}</span>;
                                                })()}
                                            </div>

                                            {/* Botón de Expansión Flotante Centrado en la Fila */}
                                            <div className="presupuesto-expansion-toggle">
                                                <FaChevronDown className={`toggle-icon ${isPresupuestoExpanded ? 'expanded' : ''}`} />
                                            </div>
                                        </td>

                                        {/* Columna 3: Cliente / Monto */}
                                        <td className="py-5" style={{ textAlign: 'right', paddingRight: '2.5rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <strong className="text-white" style={{ display: 'block' }}>{group.info.NomCliente}</strong>
                                                <span className="text-secondary font-bold" style={{ fontSize: '0.75rem' }}>
                                                    {formatMonto(group.info.TotalItem || group.info.ImporteTotal)}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Cargas del Presupuesto */}
                                    {isPresupuestoExpanded && cargasArray.map((cargaGroup) => {
                                        const cargaKey = `${group.presupuesto}-${cargaGroup.carga || 'sin-carga'}`;

                                        return (
                                            <React.Fragment key={cargaKey}>
                                                {/* Fila de la Carga */}
                                                <tr
                                                    className="carga-row clickable-row"
                                                    onClick={(e) => handleRowClick(cargaGroup.info, e)}
                                                    title="Haz clic para ver detalles del item"
                                                >
                                                    <td colSpan="3">
                                                        <div className="carga-row-container" style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                                                            <div className="carga-header" style={{ position: 'absolute', left: '1rem' }}>
                                                                {!cargaGroup.carga && (
                                                                    <strong>Items sin carga</strong>
                                                                )}
                                                            </div>
                                                            <div className="timeline-wrapper" style={{ flex: 1, padding: '0 5rem' }}>
                                                                {cargaGroup.carga && renderCompactTimeline(cargaGroup.info)}
                                                                {!cargaGroup.carga && (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                                                                        {(() => {
                                                                            const status = getEstadoInfo(cargaGroup.info);
                                                                            return <span className={`badge ${status.class}`}>{status.text}</span>;
                                                                        })()}
                                                                        <FaEye 
                                                                            style={{ color: 'var(--primary-color)', fontSize: '1rem', opacity: 0.7, flexShrink: 0, cursor: 'pointer' }} 
                                                                            title="Clic para ver detalles" 
                                                                            onClick={(e) => handleRowClick(cargaGroup.info, e)}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Paginación Avanzada */}
            {totalPages > 1 && (
                <div className="pagination-container">
                    <div className="pagination-info-text">
                        Mostrando {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, groupedData.length)} de {groupedData.length} resultados
                    </div>

                    <div className="pagination-controls">
                        <div className="items-per-page">
                            <span>Filas por página:</span>
                            <select
                                value={itemsPerPage}
                                onChange={(e) => {
                                    setItemsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="items-per-page-select"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>

                        <div className="pagination-pages">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="pagination-btn icon-btn"
                                title="Anterior"
                            >
                                <FaChevronLeft />
                            </button>

                            {/* Lógica para mostrar números de página con elipsis */}
                            {(() => {
                                const pages = [];
                                const maxVisiblePages = 5; // Número máximo de botones de página visibles

                                if (totalPages <= maxVisiblePages) {
                                    // Si hay pocas páginas, mostrar todas
                                    for (let i = 1; i <= totalPages; i++) {
                                        pages.push(i);
                                    }
                                } else {
                                    // Siempre mostrar primera página
                                    pages.push(1);

                                    // Calcular rango alrededor de la página actual
                                    let startPage = Math.max(2, currentPage - 1);
                                    let endPage = Math.min(totalPages - 1, currentPage + 1);

                                    // Ajustar si estamos cerca del inicio
                                    if (currentPage <= 3) {
                                        endPage = Math.min(totalPages - 1, 4);
                                    }

                                    // Ajustar si estamos cerca del final
                                    if (currentPage >= totalPages - 2) {
                                        startPage = Math.max(2, totalPages - 3);
                                    }

                                    // Elipsis inicial
                                    if (startPage > 2) {
                                        pages.push('...');
                                    }

                                    // Páginas del rango
                                    for (let i = startPage; i <= endPage; i++) {
                                        pages.push(i);
                                    }

                                    // Elipsis final
                                    if (endPage < totalPages - 1) {
                                        pages.push('...');
                                    }

                                    // Siempre mostrar última página
                                    pages.push(totalPages);
                                }

                                return pages.map((page, index) => (
                                    <button
                                        key={index}
                                        onClick={() => typeof page === 'number' && setCurrentPage(page)}
                                        className={`pagination-number ${currentPage === page ? 'active' : ''} ${typeof page !== 'number' ? 'ellipsis' : ''}`}
                                        disabled={typeof page !== 'number'}
                                    >
                                        {page}
                                    </button>
                                ));
                            })()}

                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="pagination-btn icon-btn"
                                title="Siguiente"
                            >
                                <FaChevronRight />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedItem && (() => {
                const group = groupedData.find(g => g.presupuesto === (selectedItem.NroPR || selectedItem.NroSolicitud));
                const allItems = group ? group.cargasArray.flatMap(c => c.facturas) : [];
                return (
                    <DetailModal 
                        item={selectedItem} 
                        onClose={handleCloseModal} 
                        mode={modalMode}
                        onNext={currentIndex >= 0 && currentIndex < navigableItems.length - 1 ? handleNext : null}
                        onPrev={currentIndex > 0 ? handlePrev : null}
                        totalItems={navigableItems.length}
                        currentIndex={currentIndex}
                        budgetTotal={group?.budgetTotal || 0}
                        relatedItems={allItems}
                    />
                );
            })()}
        </div>
    );
};

export default ResultsTable;
