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
    FaChevronUp,
    FaClock
} from 'react-icons/fa';
import { format, differenceInDays } from 'date-fns';
import * as XLSX from 'xlsx';
import DetailModal from './DetailModal';
import './ResultsTable.css';

const ResultsTable = ({ data, allData, loading, activeFilter }) => {
    // Helpers
    const getBudgetContext = (item) => {
        const nroPR = item.NroPR || item.NroSolicitud;
        const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud;
        if (!allData || !nroPR) return { totalCargas: 0, noFacturadas: 0, facturadas: 0, pendientesRecibo: 0, itemsSinCarga: 0 };
        
        const allItems = allData.filter(i => {
            const iPR = i.NroPR || i.NroSolicitud;
            const iEmp = i.FCRMVH_CODEMP || i.EmpresaSolicitud;
            return iPR === nroPR && iEmp === empresa;
        });
        
        // Cargas únicas
        const uniqueCargas = [...new Set(allItems.map(i => i.CodigoCarga).filter(Boolean))];
        const totalCargas = uniqueCargas.length;
        
        // Items sin carga
        const itemsSinCarga = allItems.filter(i => !i.CodigoCarga).length;
        
        // Cargas que tienen al menos un ítem pendiente de factura
        const noFacturadas = uniqueCargas.filter(id => {
            const items = allItems.filter(i => i.CodigoCarga === id);
            return items.some(i => !i.FacturaAsociadaOP || i.FacturaAsociadaOP.includes('Pendiente') || i.FacturaAsociadaOP.includes('CARGA NO FACTURADA'));
        }).length;

        // Cargas que tienen al menos un ítem ya facturado
        const facturadas = uniqueCargas.filter(id => {
            const items = allItems.filter(i => i.CodigoCarga === id);
            return items.some(i => i.FacturaAsociadaOP && !i.FacturaAsociadaOP.includes('Pendiente') && !i.FacturaAsociadaOP.includes('CARGA NO FACTURADA'));
        }).length;

        // Cargas que tienen al menos una factura y están pendientes de recibo
        const pendientesRecibo = uniqueCargas.filter(id => {
            const items = allItems.filter(i => i.CodigoCarga === id);
            const hasFactura = items.some(i => i.FacturaAsociadaOP && !i.FacturaAsociadaOP.includes('Pendiente') && !i.FacturaAsociadaOP.includes('CARGA NO FACTURADA'));
            const hasRecibo = items.some(i => i.ReciboCobranza && !i.ReciboCobranza.includes('Pendiente'));
            return hasFactura && !hasRecibo;
        }).length;

        return { totalCargas, noFacturadas, facturadas, pendientesRecibo, itemsSinCarga };
    };

    const renderLeyenda = (item) => {
        const { totalCargas, noFacturadas, facturadas, pendientesRecibo, itemsSinCarga } = getBudgetContext(item);
        
        if (activeFilter === 'sinCarga') {
            return `Tiene 0 cargas asociadas al mismo presupuesto y ${itemsSinCarga} está/están pendiente de realizar una Carga.`;
        }
        
        if (activeFilter === 'enCarga') {
            return `Tiene ${totalCargas} cargas asociadas al mismo presupuesto, ${noFacturadas} están pendientes de realizar una Factura, y ${facturadas} ya están facturadas.`;
        }
        
        if (activeFilter === 'facturados') {
            return `Tiene ${totalCargas} cargas asociadas al mismo presupuesto, ${noFacturadas} no están facturadas, solo ${facturadas} está/están facturadas, y de la/las que está/están facturadas hay ${pendientesRecibo} pendientes de realizar un Recibo / Cobro.`;
        }
        
        return null;
    };
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

    const formatMonto = (valor, moneda = 'ARS') => {
        if (valor === null || valor === undefined) return '-';
        const formatted = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS' // Mantenemos ARS para el formato de coma y punto
        }).format(valor);
        return `${formatted} ${moneda || 'ARS'}`;
    };

    const [searchTerm, setSearchTerm] = useState('');
    const [searchCarga, setSearchCarga] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [selectedItem, setSelectedItem] = useState(null);
    const [modalMode, setModalMode] = useState(null); // 'presupuesto', 'carga', 'factura', 'recibo', 'all'
    const [estadoSubFilter, setEstadoSubFilter] = useState('all'); // 'all', 'facturado', 'pagado'
    const [showEstadoModal, setShowEstadoModal] = useState(false);

    // Filtros estilo Excel
    const [selectedPresupuestos, setSelectedPresupuestos] = useState(null); // null = todos
    const [selectedClientes, setSelectedClientes] = useState(null); // null = todos
    const [selectedMonedas, setSelectedMonedas] = useState(null); // null = todas
    const [showPRFilter, setShowPRFilter] = useState(false);
    const [showClienteFilter, setShowClienteFilter] = useState(false);
    const [filterSearchTerm, setFilterSearchTerm] = useState('');
    const [tempSelected, setTempSelected] = useState(new Set()); 
    const [tempSelectedMonedas, setTempSelectedMonedas] = useState(new Set()); // Para la selección temporal antes de darle OK

    // Efecto para ordenar por fecha ascendente (más antiguo primero) cuando se enfoca en pendientes
    React.useEffect(() => {
        if (activeFilter === 'enCarga' || estadoSubFilter === 'noFacturado') {
            setSortConfig({ key: 'date', direction: 'asc' });
        } else {
            // Default normal
            setSortConfig({ key: null, direction: 'asc' });
        }
    }, [activeFilter, estadoSubFilter]);

    // EFECTO: Validar estadoSubFilter cuando cambia activeFilter
    React.useEffect(() => {
        if (activeFilter === 'enCarga' && !['all', 'noFacturado'].includes(estadoSubFilter)) {
            setEstadoSubFilter('all');
        } else if (activeFilter === 'sinCarga' && estadoSubFilter !== 'all') {
            setEstadoSubFilter('all');
        } else if (activeFilter === 'facturados' && !['all', 'facturado', 'pagado'].includes(estadoSubFilter)) {
            setEstadoSubFilter('all');
        }
    }, [activeFilter, estadoSubFilter]);

    const [expandedPresupuestos, setExpandedPresupuestos] = useState(new Set());

    // Cierre de modales al hacer click afuera
    React.useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest('.relative') && !e.target.closest('.excel-filter-dropdown')) {
                setShowPRFilter(false);
                setShowClienteFilter(false);
                setShowEstadoModal(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filtrado
    const filteredData = React.useMemo(() => {
        let base = data.filter(item => {
            const searchLower = searchTerm.toLowerCase();
            const cargaLower = searchCarga.toLowerCase();

            // Filtro Global
            const matchesGlobal = !searchTerm || (
                item.NroPR?.toString().includes(searchLower) ||
                item.NomCliente?.toLowerCase().includes(searchLower) ||
                item.DescrpProd?.toLowerCase().includes(searchLower) ||
                item.CodigoCarga?.toString().includes(searchLower) ||
                item.FacturaAsociadaOP?.toLowerCase().includes(searchLower)
            );

            // Filtro específico de Carga
            const matchesCarga = !searchCarga || (
                item.CodigoCarga?.toString().toLowerCase().includes(cargaLower)
            );

            // Filtros Multi-Select estilo Excel
            const matchesPR = !selectedPresupuestos || selectedPresupuestos.has(item.NroPR || item.NroSolicitud);
            const matchesCliente = !selectedClientes || selectedClientes.has(item.NomCliente);
            const matchesMoneda = !selectedMonedas || selectedMonedas.has(item.Moneda);
            
            return matchesGlobal && matchesCarga && matchesPR && matchesCliente && matchesMoneda;
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
    }, [data, searchTerm, searchCarga, activeFilter, estadoSubFilter, selectedPresupuestos, selectedClientes, selectedMonedas]);

    // Obtener valores únicos para los filtros de Excel
    const uniquePresupuestos = React.useMemo(() => {
        const values = [...new Set(data.map(item => item.NroPR || item.NroSolicitud))].filter(Boolean);
        return values.sort((a, b) => b - a);
    }, [data]);

    const uniqueClientes = React.useMemo(() => {
        const values = [...new Set(data.map(item => item.NomCliente))].filter(Boolean);
        return values.sort();
    }, [data]);

    const uniqueMonedas = React.useMemo(() => {
        const values = [...new Set(data.map(item => item.Moneda))].filter(Boolean);
        return values.sort();
    }, [data]);

    // Agrupar datos por Presupuesto -> Carga -> Factura
    const groupedData = React.useMemo(() => {
        const groups = {};

        filteredData.forEach(item => {
            // Clave única: Empresa + NroPR (para evitar mezclar PRs de distintos grupos con mismo número)
            const nroPR = item.NroPR || `SOL-${item.NroSolicitud}`;
            const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
            const presupuestoKey = `${empresa}-${nroPR}`;

            if (!groups[presupuestoKey]) {
                groups[presupuestoKey] = {
                    presupuesto: nroPR,
                    key: presupuestoKey,
                    info: { ...item }, // Copia inicial
                    items: [],      // Array para guardar todos los items crudos del PR
                    cargas: {},
                    budgetTotal: 0,
                    maxFecha: item.FchMovimiento || item.FchAltaRegistro
                };
            }
            // Guardar item crudo para uso posterior (detalle)
            groups[presupuestoKey].items.push(item);

            // LOGICA MULTI-CLIENTE Y MULTI-FACTURA:
            if (!groups[presupuestoKey].clientSet) groups[presupuestoKey].clientSet = new Set();
            if (!groups[presupuestoKey].invoiceSet) groups[presupuestoKey].invoiceSet = new Set();
            
            if (item.NomCliente) groups[presupuestoKey].clientSet.add(item.NomCliente);
            if (item.FacturaAsociadaOP && 
                !item.FacturaAsociadaOP.includes('Pendiente') && 
                !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA')) {
                groups[presupuestoKey].invoiceSet.add(item.FacturaAsociadaOP);
            }

            // Actualizar fecha máxima
            const itemFecha = item.FchMovimiento || item.FchAltaRegistro;
            if (itemFecha && (!groups[presupuestoKey].maxFecha || new Date(itemFecha) > new Date(groups[presupuestoKey].maxFecha))) {
                groups[presupuestoKey].maxFecha = itemFecha;
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
            if (sortConfig.key === 'date') {
                const fechaA = new Date(a.maxFecha);
                const fechaB = new Date(b.maxFecha);
                if (sortConfig.direction === 'asc') return fechaA - fechaB;
                return fechaB - fechaA;
            }

            // Orden por defecto: maxFecha descendente
            const fechaA = new Date(a.maxFecha);
            const fechaB = new Date(b.maxFecha);
            return fechaB - fechaA;
        });

        // Procesamiento final de grupos
        presupuestosArray.forEach(presupuesto => {
            // APLANA NOMBRES DE CLIENTES
            if (presupuesto.clientSet && presupuesto.clientSet.size > 0) {
                const uniqueClients = Array.from(presupuesto.clientSet);
                if (uniqueClients.length > 1) {
                    // Si hay varios, unirlos. Ej: "Cliente A + Cliente B"
                    presupuesto.info.NomCliente = uniqueClients.join(' + ');
                    // Opcional: Agregar flag para mostrar tooltip especial?
                    presupuesto.info.isMultiClient = true; 
                    presupuesto.info.individualClients = uniqueClients;
                } else {
                    presupuesto.info.NomCliente = uniqueClients[0];
                }
            }

            // APLANA FACTURAS
            if (presupuesto.invoiceSet && presupuesto.invoiceSet.size > 0) {
                const uniqueInvoices = Array.from(presupuesto.invoiceSet);
                if (uniqueInvoices.length > 1) {
                    presupuesto.info.FacturaAsociadaOP = 'Varios Comprobantes';
                    presupuesto.info.isMultiInvoice = true;
                    presupuesto.info.individualInvoices = uniqueInvoices;
                } else {
                    presupuesto.info.FacturaAsociadaOP = uniqueInvoices[0];
                }
            }

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
        
        const currentGroup = groupedData.find(g => {
            const nroPR = selectedItem.NroPR || `SOL-${selectedItem.NroSolicitud}`;
            const empresa = selectedItem.FCRMVH_CODEMP || selectedItem.EmpresaSolicitud || 'SE-';
            return g.key === `${empresa}-${nroPR}`;
        });
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
        setSearchTerm('');
        setSearchCarga('');
        setSelectedPresupuestos(null);
        setSelectedClientes(null);
        setSelectedMonedas(null);
        setShowEstadoModal(false);
        setShowPRFilter(false);
        setShowClienteFilter(false);
    };

    const getSortIcon = (columnKey) => {
        if (sortConfig.key !== columnKey) {
            return <FaSort className="sort-icon opa-3" />;
        }
        return sortConfig.direction === 'asc'
            ? <FaSortUp className="sort-icon active" />
            : <FaSortDown className="sort-icon active" />;
    };

    // Renderizar el dropdown estilo Excel
    const renderExcelFilter = (type, align = 'left') => {
        const isPR = type === 'pr';
        const options = isPR ? uniquePresupuestos : uniqueClientes;
        const currentSelected = isPR ? selectedPresupuestos : selectedClientes;
        
        // Filtrar opciones según el buscador interno
        const filteredOptions = options.filter(opt => 
            opt.toString().toLowerCase().includes(filterSearchTerm.toLowerCase())
        );

        const handleSelectAll = (checked) => {
            if (checked) {
                setTempSelected(new Set(options));
            } else {
                setTempSelected(new Set());
            }
        };

        const handleToggleOption = (opt) => {
            const next = new Set(tempSelected);
            if (next.has(opt)) next.delete(opt);
            else next.add(opt);
            setTempSelected(next);
        };

        const handleAccept = () => {
            // Manejo de Clientes/Presupuestos
            if (tempSelected.size === options.length) {
                isPR ? setSelectedPresupuestos(null) : setSelectedClientes(null);
            } else {
                isPR ? setSelectedPresupuestos(new Set(tempSelected)) : setSelectedClientes(new Set(tempSelected));
            }
            
            // Manejo de Monedas (solo para cliente)
            if (!isPR) {
                if (tempSelectedMonedas.size === uniqueMonedas.length) {
                    setSelectedMonedas(null);
                } else {
                    setSelectedMonedas(new Set(tempSelectedMonedas));
                }
            }

            isPR ? setShowPRFilter(false) : setShowClienteFilter(false);
            setCurrentPage(1);
        };

        const handleToggleMoneda = (mon) => {
            const next = new Set(tempSelectedMonedas);
            if (next.has(mon)) next.delete(mon);
            else next.add(mon);
            setTempSelectedMonedas(next);
        };

        return (
            <div className={`excel-filter-dropdown align-${align}`} onClick={e => e.stopPropagation()}>
                <div className="excel-filter-sort">
                    <div className="filter-sort-item" onClick={() => { 
                        setSortConfig({ key: isPR ? 'presupuesto' : 'cliente_monto', direction: 'asc' }); 
                        isPR ? setShowPRFilter(false) : setShowClienteFilter(false); 
                    }}>
                        <FaSortUp /> Ordenar de menor a mayor
                    </div>
                    <div className="filter-sort-item" onClick={() => { 
                        setSortConfig({ key: isPR ? 'presupuesto' : 'cliente_monto', direction: 'desc' }); 
                        isPR ? setShowPRFilter(false) : setShowClienteFilter(false); 
                    }}>
                        <FaSortDown /> Ordenar de mayor a menor
                    </div>
                </div>
                
                <div className="excel-filter-divider" />
                
                <div className="filter-clear-item" onClick={() => {
                    if (isPR) {
                        setSelectedPresupuestos(null);
                    } else {
                        setSelectedClientes(null);
                        setSelectedMonedas(null);
                    }
                    isPR ? setShowPRFilter(false) : setShowClienteFilter(false);
                }}>
                    <FaTimesCircle /> Borrar filtro de "{isPR ? 'Prespuesto' : 'Cliente'}"
                </div>

                {!isPR && (
                    <>
                        <div className="excel-filter-section-title">Filtrar por Moneda:</div>
                        <div className="excel-filter-moneda-list">
                            {uniqueMonedas.map(mon => (
                                <label key={mon} className="filter-list-item-inline">
                                    <input 
                                        type="checkbox" 
                                        checked={tempSelectedMonedas.has(mon)}
                                        onChange={() => handleToggleMoneda(mon)}
                                    />
                                    <span>{mon}</span>
                                </label>
                            ))}
                        </div>
                        <div className="excel-filter-divider" />
                    </>
                )}

                <div className="excel-filter-search">
                    <input 
                        type="text" 
                        placeholder="Buscar..." 
                        value={filterSearchTerm}
                        onChange={(e) => setFilterSearchTerm(e.target.value)}
                        autoFocus
                    />
                    <FaSearch className="filter-search-icon" />
                </div>

                <div className="excel-filter-list">
                    <label className="filter-list-item">
                        <input 
                            type="checkbox" 
                            checked={tempSelected.size === options.length}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                        />
                        <span>(Seleccionar todo)</span>
                    </label>
                    {filteredOptions.map(opt => (
                        <label key={opt} className="filter-list-item">
                            <input 
                                type="checkbox" 
                                checked={tempSelected.has(opt)}
                                onChange={() => handleToggleOption(opt)}
                            />
                            <span>{opt}</span>
                        </label>
                    ))}
                </div>

                <div className="excel-filter-footer">
                    <button className="btn-filter-accept" onClick={handleAccept}>ACEPTAR</button>
                    <button className="btn-filter-cancel" onClick={() => isPR ? setShowPRFilter(false) : setShowClienteFilter(false)}>CANCELAR</button>
                </div>
            </div>
        );
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
            'Moneda': item.Moneda || 'ARS',
            'Código Carga': item.CodigoCarga || '-',
            'Cliente a Facturar': item.ClienteAFacturar || '-',
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

    // Helper para urgencia
    const getUrgencyInfo = (dateString, status) => {
        if (!dateString || status !== 'No Facturado') return null;
        const days = differenceInDays(new Date(), new Date(dateString));
        if (days > 7) return { urgent: true, days };
        return null;
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

        const urgency = getUrgencyInfo(item.FecAltCarga, (hasCarga && !isFacturado) ? 'No Facturado' : '');

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
                            <h4 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                {step.label}
                                {step.id === 3 && !step.completed && urgency && (
                                    <span title={`Pendiente hace ${urgency.days} días`} style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
                                        <FaClock /> <span style={{ marginLeft: '1px', fontSize: '0.75rem' }}>{urgency.days}d</span>
                                    </span>
                                )}
                            </h4>
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
                    <div className="search-bar-container">
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
                    <div className="search-bar-container secondary-search">
                        <FaTruck style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder="Buscar Nº Carga..."
                            value={searchCarga}
                            onChange={(e) => {
                                setSearchCarga(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="search-input"
                            style={{ paddingLeft: '2.5rem' }}
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
            <div className={`table-wrapper ${(showPRFilter || showClienteFilter || showEstadoModal) ? 'filter-open' : ''}`}>
                <table className="results-table hierarchical-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <colgroup>
                        <col style={{ width: '30%' }} />
                        <col style={{ width: '40%' }} />
                        <col style={{ width: '30%' }} />
                    </colgroup>
                    <thead>
                        <tr className="bg-slate-950 text-slate-400 text-sm uppercase tracking-wider border-b border-slate-800">
                            <th 
                                className="py-4 font-medium clickable-header relative" 
                                style={{ textAlign: 'left', paddingLeft: '2.5rem' }}
                            >
                                <div 
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFilterSearchTerm('');
                                        setTempSelected(selectedPresupuestos ? new Set(selectedPresupuestos) : new Set(uniquePresupuestos));
                                        setShowPRFilter(!showPRFilter);
                                        setShowClienteFilter(false);
                                        setShowEstadoModal(false);
                                    }}
                                >
                                    N° Presupuesto / Fecha 
                                    <FaChevronDown style={{ fontSize: '0.7rem', opacity: selectedPresupuestos ? 1 : 0.5, color: selectedPresupuestos ? 'var(--primary-color)' : 'inherit' }} />
                                </div>
                                {showPRFilter && renderExcelFilter('pr')}
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
                                        cursor: activeFilter === 'sinCarga' ? 'default' : 'pointer' 
                                    }}
                                    onClick={() => {
                                        if (activeFilter !== 'sinCarga') {
                                            setShowEstadoModal(!showEstadoModal);
                                        }
                                    }}
                                >
                                    Estado <FaChevronDown style={{ 
                                        fontSize: '0.8rem', 
                                        opacity: activeFilter === 'sinCarga' ? 0.2 : 1,
                                        display: activeFilter === 'sinCarga' ? 'none' : 'block'
                                    }} />
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

                                        {(activeFilter === 'all' || activeFilter === 'facturados') && (
                                            <div 
                                                className={`dropdown-item ${estadoSubFilter === 'facturado' ? 'active' : ''}`}
                                                onClick={() => { setEstadoSubFilter('facturado'); setShowEstadoModal(false); }}
                                            >
                                                Facturado
                                            </div>
                                        )}

                                        {(activeFilter === 'all' || activeFilter === 'enCarga') && (
                                            <div 
                                                className={`dropdown-item ${estadoSubFilter === 'noFacturado' ? 'active' : ''}`}
                                                onClick={() => { setEstadoSubFilter('noFacturado'); setShowEstadoModal(false); }}
                                            >
                                                No Facturado
                                            </div>
                                        )}

                                        {(activeFilter === 'all' || activeFilter === 'facturados') && (
                                            <div 
                                                className={`dropdown-item ${estadoSubFilter === 'pagado' ? 'active' : ''}`}
                                                onClick={() => { setEstadoSubFilter('pagado'); setShowEstadoModal(false); }}
                                            >
                                                Pagado
                                            </div>
                                        )}
                                    </div>
                                )}
                            </th>
                            <th 
                                className="py-4 font-medium relative clickable-header" 
                                style={{ textAlign: 'right', paddingRight: '2.5rem' }}
                            >
                                <div 
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem', cursor: 'pointer' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFilterSearchTerm('');
                                        setTempSelected(selectedClientes ? new Set(selectedClientes) : new Set(uniqueClientes));
                                        setTempSelectedMonedas(selectedMonedas ? new Set(selectedMonedas) : new Set(uniqueMonedas));
                                        setShowClienteFilter(!showClienteFilter);
                                        setShowPRFilter(false);
                                        setShowEstadoModal(false);
                                    }}
                                >
                                    {getSortIcon('cliente_monto')} Cliente / Monto 
                                    <FaChevronDown style={{ fontSize: '0.7rem', opacity: selectedClientes ? 1 : 0.5, color: selectedClientes ? 'var(--primary-color)' : 'inherit' }} />
                                </div>
                                {showClienteFilter && renderExcelFilter('cliente', 'right')}
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
                                                {activeFilter !== 'all' && (
                                                    <span className="presupuesto-leyenda" style={{ 
                                                        fontSize: '0.7rem', 
                                                        color: 'var(--text-secondary)', 
                                                        marginTop: '4px',
                                                        fontStyle: 'italic',
                                                        opacity: 0.8
                                                    }}>
                                                        {renderLeyenda(group.info)}
                                                    </span>
                                                )}
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
                                                    {formatMonto(group.budgetTotal, group.info.Moneda)}
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
                                                                            const urgency = getUrgencyInfo(cargaGroup.info.FecAltCarga || cargaGroup.info.FchMovimiento, status.text);
                                                                            
                                                                            return (
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                    <span className={`badge ${status.class}`}>{status.text}</span>
                                                                                    {urgency && (
                                                                                        <span title={`Pendiente hace ${urgency.days} días`} style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
                                                                                            <FaClock /> <span style={{ marginLeft: '2px', fontSize: '0.7rem', fontWeight: 'bold' }}>{urgency.days}d</span>
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            );
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
                const group = groupedData.find(g => {
                    const nroPR = selectedItem.NroPR || `SOL-${selectedItem.NroSolicitud}`;
                    const empresa = selectedItem.FCRMVH_CODEMP || selectedItem.EmpresaSolicitud || 'SE-';
                    return g.key === `${empresa}-${nroPR}`;
                });
                const allItems = group ? (
                    selectedItem.CodigoCarga 
                    ? group.items.filter(i => i.CodigoCarga === selectedItem.CodigoCarga)
                    : group.items
                ) : [];
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
