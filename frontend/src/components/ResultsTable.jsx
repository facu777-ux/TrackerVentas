import React, { useState } from 'react';
import ReactDOM from 'react-dom';
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
    FaClock,
    FaFileAlt,
    FaUser,
    FaInfoCircle,
    FaTimes,
    FaCashRegister,
    FaExpandArrowsAlt,
    FaCompressArrowsAlt
} from 'react-icons/fa';
import { format, differenceInDays } from 'date-fns';
import * as XLSX from 'xlsx';
import DetailModal from './DetailModal';
import './ResultsTable.css';

const ResultsTable = ({ 
    data, 
    allData, 
    loading, 
    activeFilter, 
    isMobile,
    searchTerm,
    setSearchTerm,
    searchCarga,
    setSearchCarga,
    displayCurrency = 'ARS',
    setDisplayCurrency,
    exchangeRate = 1000,
    chileExchangeRate = 900,
    searchCriteria = null
}) => {
    // Memoize budget contexts to avoid O(N^2) complexity on every render
    const budgetContexts = React.useMemo(() => {
        if (!allData || !allData.length) return {};
        
        // Group allData by budget first (O(N))
        const budgets = {};
        allData.forEach(item => {
            const nroPR = item.NroPR || item.NroSolicitud;
            const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
            const key = `${empresa}-${nroPR}`;
            if (!budgets[key]) budgets[key] = [];
            budgets[key].push(item);
        });

        // Calculate context for each budget (O(B * C) where B=budgets, C=avg items per budget)
        const contexts = {};
        Object.keys(budgets).forEach(key => {
            const allItems = budgets[key];
            const uniqueCargas = [...new Set(allItems.map(i => i.CodigoCarga).filter(Boolean))];
            const totalCargas = uniqueCargas.length;
            const itemsSinCarga = allItems.filter(i => !i.CodigoCarga).length;
            
            // Optimization: group items by carga once for this budget
            const cargasMap = {};
            allItems.forEach(i => {
                if (i.CodigoCarga) {
                    if (!cargasMap[i.CodigoCarga]) cargasMap[i.CodigoCarga] = [];
                    cargasMap[i.CodigoCarga].push(i);
                }
            });

            const noFacturadas = uniqueCargas.filter(id => {
                const items = cargasMap[id];
                return items.some(i => !i.FacturaAsociadaOP || i.FacturaAsociadaOP.includes('Pendiente') || i.FacturaAsociadaOP.includes('CARGA NO FACTURADA'));
            }).length;

            const facturadas = uniqueCargas.filter(id => {
                const items = cargasMap[id];
                return items.some(i => i.FacturaAsociadaOP && !i.FacturaAsociadaOP.includes('Pendiente') && !i.FacturaAsociadaOP.includes('CARGA NO FACTURADA'));
            }).length;

            const pendientesRecibo = uniqueCargas.filter(id => {
                const items = cargasMap[id];
                const hasFactura = items.some(i => i.FacturaAsociadaOP && !i.FacturaAsociadaOP.includes('Pendiente') && !i.FacturaAsociadaOP.includes('CARGA NO FACTURADA'));
                const hasRecibo = items.some(i => i.ReciboCobranza && !i.ReciboCobranza.includes('Pendiente'));
                return hasFactura && !hasRecibo;
            }).length;

            contexts[key] = { totalCargas, noFacturadas, facturadas, pendientesRecibo, itemsSinCarga };
        });
        
        return contexts;
    }, [allData]);

    const renderLeyenda = (item) => {
        const nroPR = item.NroPR || item.NroSolicitud;
        const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
        const key = `${empresa}-${nroPR}`;
        const context = budgetContexts[key];
        
        if (!context) return null;
        
        const { totalCargas, noFacturadas, facturadas, pendientesRecibo, itemsSinCarga } = context;
        
        if (activeFilter === 'presupuestos') {
            return `Tiene 0 cargas asociadas al mismo presupuesto y ${itemsSinCarga} está/están pendiente de realizar una Carga.`;
        }
        
        if (activeFilter === 'enCarga') {
            return `Tiene ${totalCargas} cargas asociadas al mismo presupuesto, ${noFacturadas} están pendientes de realizar una Factura, y ${facturadas} ya están facturadas.`;
        }
        
        if (activeFilter === 'facturados') {
            return `Tiene ${totalCargas} cargas asociadas al mismo presupuesto, ${noFacturadas} no están facturadas, ${facturadas} están facturadas, y de ellas hay ${pendientesRecibo} pendientes de cobro (sin recibo).`;
        }
        
        if (activeFilter === 'pagados') {
            return `Tiene ${totalCargas} cargas asociadas. El ciclo administrativo (Presupuesto > Carga > Factura > Recibo) está completo para los items seleccionados.`;
        }
        
        return null;
    };
    // Helpers (Definidos antes de ser usados en useMemo para evitar TDZ)
    const getEstadoInfo = (item) => {
        const factura = item.FacturaAsociadaOP;
        const recibo = item.ReciboCobranza;

        if (recibo && !recibo.includes('Pendiente')) {
            return { class: 'badge-pagado', text: 'COBRADO', dot: 'bg-emerald-500' };
        } else if (factura && !factura.includes('CARGA NO FACTURADA') && !factura.includes('Pendiente')) {
            return { class: 'badge-facturado', text: 'FACTURADO', dot: 'bg-blue-500' };
        } else if (item.CodigoCarga) {
            return { class: 'badge-asignado', text: 'NO FACTURADO', dot: 'bg-amber-500' };
        } else {
            return { class: 'badge-presupuesto', text: 'PRESUPUESTO', dot: 'bg-slate-400' };
        }
    };

    const filterInputRef = React.useRef(null);
    
    // Filtros estilo Excel (Declarados antes de su uso en useEffect)
    const [showPRFilter, setShowPRFilter] = useState(false);
    const [showClienteFilter, setShowClienteFilter] = useState(false);
    const [selectedPresupuestos, setSelectedPresupuestos] = useState(null); // null = todos
    const [selectedClientes, setSelectedClientes] = useState(null); // null = todos
    const [selectedMonedas, setSelectedMonedas] = useState(null); // null = todas
    const [filterSearchTerm, setFilterSearchTerm] = useState('');
    const [tempSelected, setTempSelected] = useState(new Set()); 
    const [tempSelectedMonedas, setTempSelectedMonedas] = useState(new Set()); 
    
    // Filtros de fecha locales para la columna Presupuesto/Fecha
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [tempStartDate, setTempStartDate] = useState('');
    const [tempEndDate, setTempEndDate] = useState('');
    const [activePopover, setActivePopover] = useState(null); 
    const [selectedDocRef, setSelectedDocRef] = useState(null); 

    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [selectedItem, setSelectedItem] = useState(null);
    const [modalMode, setModalMode] = useState(null); // 'presupuesto', 'carga', 'factura', 'recibo', 'all'
    const [estadoSubFilter, setEstadoSubFilter] = useState('all'); // 'all', 'facturado', 'pagado'
    const [showEstadoModal, setShowEstadoModal] = useState(false);

    React.useEffect(() => {
        if (showPRFilter || showClienteFilter) {
            setTimeout(() => {
                filterInputRef.current?.focus({ preventScroll: true });
            }, 50);
        }
    }, [showPRFilter, showClienteFilter]);

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

    // Efecto para ordenar por fecha ascendente (más antiguo primero) cuando se enfoca en procesos pendientes
    React.useEffect(() => {
        if (activeFilter === 'enCarga' || activeFilter === 'presupuestos' || activeFilter === 'facturados' || estadoSubFilter === 'noFacturado') {
            setSortConfig({ key: 'date', direction: 'asc' });
        } else {
            // Default normal (más nuevo primero)
            setSortConfig({ key: null, direction: 'asc' });
        }
    }, [activeFilter, estadoSubFilter]);

    // EFECTO: Validar estadoSubFilter cuando cambia activeFilter
    React.useEffect(() => {
        if (activeFilter === 'enCarga' && !['all', 'noFacturado'].includes(estadoSubFilter)) {
            setEstadoSubFilter('all');
        } else if (activeFilter === 'presupuestos' && estadoSubFilter !== 'all') {
            setEstadoSubFilter('all');
        } else if (activeFilter === 'facturados' && !['all', 'facturado'].includes(estadoSubFilter)) {
            setEstadoSubFilter('all');
        } else if (activeFilter === 'pagados' && !['all', 'pagado'].includes(estadoSubFilter)) {
            setEstadoSubFilter('all');
        }
        // Nota: En 'all' permitimos cualquier estadoSubFilter y no reseteamos
    }, [activeFilter, estadoSubFilter]);

    // EFECTO: Resetear paginación al cambiar filtros
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, searchCarga, activeFilter, estadoSubFilter, selectedPresupuestos, selectedClientes, selectedMonedas, filterStartDate, filterEndDate]);

    const [expandedPresupuestos, setExpandedPresupuestos] = useState(new Set());

    // Cierre de modales al hacer click afuera
    React.useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest('.relative') && !e.target.closest('.excel-filter-dropdown') && !e.target.closest('.document-popover')) {
                setShowPRFilter(false);
                setShowClienteFilter(false);
                setShowEstadoModal(false);
                setActivePopover(null);
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

            // Filtros Multi-Select estilo Excel con coincidencia exacta
            const matchesPR = !selectedPresupuestos || selectedPresupuestos.has((item.NroPR || item.NroSolicitud)?.toString());
            const matchesCliente = !selectedClientes || selectedClientes.has(item.NomCliente);
            const matchesMoneda = !selectedMonedas || selectedMonedas.has(item.Moneda);

            // Filtro de Fecha Local (Columna PR)
            const getDateStr = (d) => {
                if (!d) return null;
                const dt = new Date(d);
                if (isNaN(dt.getTime())) return null;
                // Usar componentes locales para evitar el desplazamiento de zona horaria (UTC)
                const y = dt.getFullYear();
                const m = String(dt.getMonth() + 1).padStart(2, '0');
                const day = String(dt.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            };

            const itemDateStr = getDateStr(item.FchMovimiento || item.FchAltaRegistro);
            const startStr = filterStartDate || null;
            const endStr = filterEndDate || null;

            const matchesDateLocal = (!startStr || (itemDateStr && itemDateStr >= startStr)) && 
                                   (!endStr || (itemDateStr && itemDateStr <= endStr));
            
            return matchesGlobal && matchesCarga && matchesPR && matchesCliente && matchesMoneda && matchesDateLocal;
        });

        // Aplicar sub-filtro de estado si corresponde
        if (estadoSubFilter !== 'all') {
            base = base.filter(item => {
                const info = getEstadoInfo(item);
                if (estadoSubFilter === 'facturado') return info.text === 'FACTURADO';
                if (estadoSubFilter === 'pagado') return info.text === 'PAGADO';
                if (estadoSubFilter === 'noFacturado') return info.text === 'NO FACTURADO';
                return true;
            });
        }
        return base;
    }, [data, searchTerm, searchCarga, activeFilter, estadoSubFilter, selectedPresupuestos, selectedClientes, selectedMonedas, filterStartDate, filterEndDate]);

    // Obtener valores únicos para los filtros de Excel
    const uniquePresupuestos = React.useMemo(() => {
        const values = [...new Set(data.map(item => (item.NroPR || item.NroSolicitud)?.toString()))].filter(Boolean);
        return values.sort((a, b) => b - a);
    }, [data]);

    const uniqueClientes = React.useMemo(() => {
        const values = [...new Set(data.map(item => item.NomCliente))].filter(Boolean);
        return values.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
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

            // LOGICA MULTI-CLIENTE, MULTI-FACTURA Y MULTI-RECIBO:
            if (!groups[presupuestoKey].clientSet) groups[presupuestoKey].clientSet = new Set();
            if (!groups[presupuestoKey].invoiceSet) groups[presupuestoKey].invoiceSet = new Set();
            if (!groups[presupuestoKey].receiptSet) groups[presupuestoKey].receiptSet = new Set();
            
            if (item.NomCliente) groups[presupuestoKey].clientSet.add(item.NomCliente);
            if (item.FacturaAsociadaOP && 
                !item.FacturaAsociadaOP.includes('Pendiente') && 
                !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA') &&
                item.FacturaAsociadaOP !== 'Varios Comprobantes') {
                groups[presupuestoKey].invoiceSet.add(item.FacturaAsociadaOP);
            }
            if (item.ReciboCobranza && !item.ReciboCobranza.includes('Pendiente') && 
                item.ReciboCobranza !== 'Varios Recibos') {
                groups[presupuestoKey].receiptSet.add(item.ReciboCobranza);
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
                        info: { ...item }, // Copia para evitar mutar el item original
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
                        info: { ...item }, // Copia
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

            // APLANA RECIBOS
            if (presupuesto.receiptSet && presupuesto.receiptSet.size > 0) {
                const uniqueReceipts = Array.from(presupuesto.receiptSet);
                if (uniqueReceipts.length > 1) {
                    presupuesto.info.ReciboCobranza = 'Varios Recibos';
                    presupuesto.info.isMultiReceipt = true;
                    presupuesto.info.individualReceipts = uniqueReceipts;
                } else {
                    presupuesto.info.ReciboCobranza = uniqueReceipts[0];
                }
            }

            // Convertir cargas a array y ordenar por fecha descendente
            const cargasArray = Object.values(presupuesto.cargas).sort((a, b) => {
                const fechaA = new Date(a.maxFecha);
                const fechaB = new Date(b.maxFecha);
                return fechaB - fechaA; // Descendente
            });

            // Ordenar facturas dentro de cada carga y detectar multi-doc
            cargasArray.forEach(carga => {
                const invoiceSet = new Set();
                const receiptSet = new Set();

                carga.facturas.forEach(f => {
                    if (f.FacturaAsociadaOP && 
                        !f.FacturaAsociadaOP.includes('CARGA NO FACTURADA') && 
                        !f.FacturaAsociadaOP.includes('Pendiente') &&
                        f.FacturaAsociadaOP !== 'Varios Comprobantes') {
                        invoiceSet.add(f.FacturaAsociadaOP);
                    }
                    if (f.ReciboCobranza && !f.ReciboCobranza.includes('Pendiente') &&
                        f.ReciboCobranza !== 'Varios Recibos') {
                        receiptSet.add(f.ReciboCobranza);
                    }
                });

                // Actualizar info de la carga con banderas multi-doc (sobre la copia de info)
                if (invoiceSet.size > 1) {
                    carga.info = { ...carga.info, isMultiInvoice: true, individualInvoices: Array.from(invoiceSet), FacturaAsociadaOP: 'Varios Comprobantes' };
                }
                if (receiptSet.size > 1) {
                    carga.info = { ...carga.info, isMultiReceipt: true, individualReceipts: Array.from(receiptSet), ReciboCobranza: 'Varios Recibos' };
                }

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
    
    // Calcular subtotales por moneda de TODOS los resultados filtrados
    const subtotals = React.useMemo(() => {
        const result = { ARS: 0, USD: 0, totalConsolidated: 0 };
        
        // Función local de normalización para el total consolidado
        const normalize = (amount, currencyRaw) => {
            const raw = String(currencyRaw || 'ARS').toUpperCase().trim();
            let isUSD = (raw === 'USD' || raw === '2' || raw === 'U$S' || raw === 'DOLARES' || raw === 'DÓLAR');
            
            if (displayCurrency === 'ARS') {
                if (!isUSD) return amount;
                return amount * (parseFloat(exchangeRate) || 1000);
            } else {
                // Entendemos que displayCurrency es USD_BNA o USD_SII
                if (isUSD) return amount;
                const rate = displayCurrency === 'USD_SII' ? (parseFloat(chileExchangeRate) || 900) : (parseFloat(exchangeRate) || 1000);
                return amount / rate;
            }
        };

        // Usamos groupedData que contiene todos los presupuestos antes de paginar
        groupedData.forEach(group => {
            const moneda = group.info.Moneda || 'ARS';
            const total = group.budgetTotal || 0;
            if (moneda === 'ARS' || moneda === '1') result.ARS += total;
            else if (moneda === 'USD' || moneda === '2') result.USD += total;
            
            result.totalConsolidated += normalize(total, moneda);
        });
        return result;
    }, [groupedData, displayCurrency, exchangeRate, chileExchangeRate]);

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

    // Lógica para Expandir/Contraer Todo
    const allExpanded = groupedData.length > 0 && groupedData.every(g => expandedPresupuestos.has(g.key));
    
    const toggleAllVisible = () => {
        if (allExpanded) {
            // Si todo está abierto, cerramos todo lo que pertenezca a la vista actual
            const next = new Set(expandedPresupuestos);
            groupedData.forEach(g => next.delete(g.key));
            setExpandedPresupuestos(next);
        } else {
            // Si hay algo cerrado (o todo), abrimos todo lo de la vista actual
            const next = new Set(expandedPresupuestos);
            groupedData.forEach(g => next.add(g.key));
            setExpandedPresupuestos(next);
        }
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
        setFilterStartDate('');
        setFilterEndDate('');
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
    const renderEstadoModal = () => {
        if (!isMobile) return null;

        return (
            <div className="excel-filter-dropdown mobile-full" onClick={e => e.stopPropagation()}>
                <div className="excel-filter-mobile-header">
                    <h3>Filtrar por Estado</h3>
                    <button className="close-filter-btn" onClick={() => setShowEstadoModal(false)}>
                        <FaTimes />
                    </button>
                </div>
                <div className="excel-filter-list mobile-styled" style={{ flex: 1 }}>
                    <div 
                        className={`filter-list-item ${estadoSubFilter === 'all' ? 'active-mobile' : ''}`}
                        onClick={() => { setEstadoSubFilter('all'); setShowEstadoModal(false); }}
                    >
                        <strong>Todos los estados</strong>
                    </div>

                    {(activeFilter === 'all' || activeFilter === 'facturados') && (
                        <div 
                            className={`filter-list-item ${estadoSubFilter === 'facturado' ? 'active-mobile' : ''}`}
                            onClick={() => { setEstadoSubFilter('facturado'); setShowEstadoModal(false); }}
                        >
                            Facturado
                        </div>
                    )}

                    {(activeFilter === 'all' || activeFilter === 'enCarga') && (
                        <div 
                            className={`filter-list-item ${estadoSubFilter === 'noFacturado' ? 'active-mobile' : ''}`}
                            onClick={() => { setEstadoSubFilter('noFacturado'); setShowEstadoModal(false); }}
                        >
                            No Facturado
                        </div>
                    )}

                    {(activeFilter === 'all' || activeFilter === 'pagados') && (
                        <div 
                            className={`filter-list-item ${estadoSubFilter === 'pagado' ? 'active-mobile' : ''}`}
                            onClick={() => { setEstadoSubFilter('pagado'); setShowEstadoModal(false); }}
                        >
                            Cobrado
                        </div>
                    )}
                </div>
                <div className="excel-filter-footer">
                    <button className="btn-filter-cancel" style={{ width: '100%' }} onClick={() => setShowEstadoModal(false)}>CERRAR</button>
                </div>
            </div>
        );
    };

    const renderExcelFilter = (type, align = 'left') => {
        const isPR = type === 'pr';
        const options = isPR ? uniquePresupuestos : uniqueClientes;
        const currentSelected = isPR ? selectedPresupuestos : selectedClientes;
        
        // Filtrar opciones según el buscador interno
        const filteredOptions = options.filter(opt => 
            opt.toString().toLowerCase().includes(filterSearchTerm.toLowerCase())
        );

        const handleSelectAll = (checked) => {
            const next = new Set(tempSelected);
            if (checked) {
                filteredOptions.forEach(opt => next.add(opt));
            } else {
                filteredOptions.forEach(opt => next.delete(opt));
            }
            setTempSelected(next);
        };

        const handleToggleOption = (opt) => {
            const next = new Set(tempSelected);
            if (next.has(opt)) next.delete(opt);
            else next.add(opt);
            setTempSelected(next);
        };

        const handleAccept = () => {
            // Usar siempre los elementos seleccionados manualmente por el usuario
            let selectionToApply = new Set(tempSelected);

            // Manejo de Clientes/Presupuestos
            if (selectionToApply.size === options.length) {
                isPR ? setSelectedPresupuestos(null) : setSelectedClientes(null);
            } else {
                isPR ? setSelectedPresupuestos(selectionToApply) : setSelectedClientes(selectionToApply);
            }
            
            if (isPR) {
                setFilterStartDate(tempStartDate);
                setFilterEndDate(tempEndDate);
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
            setFilterSearchTerm('');
            setCurrentPage(1);
        };

        const handleToggleMoneda = (mon) => {
            const next = new Set(tempSelectedMonedas);
            if (next.has(mon)) next.delete(mon);
            else next.add(mon);
            setTempSelectedMonedas(next);
        };

        return (
            <div className={`excel-filter-dropdown align-${align} ${isMobile ? 'mobile-full' : ''}`} onClick={e => e.stopPropagation()}>
                {isMobile && (
                    <div className="excel-filter-mobile-header">
                        <h3>Filtrar por {isPR ? 'N° Presupuesto' : 'Cliente'}</h3>
                        <button className="close-filter-btn" onClick={() => isPR ? setShowPRFilter(false) : setShowClienteFilter(false)}>
                            <FaTimes />
                        </button>
                    </div>
                )}
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
                        setFilterStartDate('');
                        setFilterEndDate('');
                        setTempStartDate('');
                        setTempEndDate('');
                    } else {
                        setSelectedClientes(null);
                        setSelectedMonedas(null);
                    }
                    isPR ? setShowPRFilter(false) : setShowClienteFilter(false);
                }}>
                    <FaTimesCircle /> Borrar filtro de "{isPR ? 'Prespuesto' : 'Cliente'}"
                </div>

                <div className="excel-filter-moneda-list">
                    <div className="filter-actions-row">
                        <button className="filter-action-btn" onClick={() => setTempSelected(new Set(options))}>Seleccionar Todo</button>
                        <button className="filter-action-btn" onClick={() => setTempSelected(new Set())}>Limpiar Todo</button>
                    </div>

                    <div className="selection-stats">
                        {tempSelected.size === options.length ? (
                            'Todos seleccionados'
                        ) : (
                            `${tempSelected.size} de ${options.length} seleccionados`
                        )}
                    </div>
                </div>

                {!isPR && (
                    <>
                        <div className="excel-filter-divider" style={{ margin: '0.25rem 0' }} />
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

                {isPR && (
                    <div className="excel-filter-date-section">
                        <div className="excel-filter-section-title">Filtrar por Fecha:</div>
                        <div className="date-picker-grid">
                            <div className="date-input-group">
                                <label>Desde:</label>
                                <input 
                                    type="date" 
                                    value={tempStartDate} 
                                    onChange={(e) => setTempStartDate(e.target.value)}
                                    className="filter-date-input"
                                />
                            </div>
                            <div className="date-input-group">
                                <label>Hasta:</label>
                                <input 
                                    type="date" 
                                    value={tempEndDate} 
                                    onChange={(e) => setTempEndDate(e.target.value)}
                                    className="filter-date-input"
                                />
                            </div>
                        </div>
                        <div className="excel-filter-divider" />
                    </div>
                )}

                <div className={`excel-filter-search ${isMobile ? 'mobile-search-styled' : ''}`}>
                    <input 
                        type="text" 
                        placeholder="Buscar..." 
                        value={filterSearchTerm}
                        onChange={(e) => setFilterSearchTerm(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAccept();
                        }}
                        ref={filterInputRef}
                    />
                    <FaSearch className="filter-search-icon" />
                </div>

                <div className="excel-filter-list">
                    <label className="filter-list-item">
                        <input 
                            type="checkbox" 
                            checked={filteredOptions.length > 0 && filteredOptions.every(opt => tempSelected.has(opt))}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                        />
                        <span>{filterSearchTerm ? '(Seleccionar todos los resultados)' : '(Seleccionar todo)'}</span>
                    </label>
                    {filteredOptions.length === 0 ? (
                        <div className="filter-no-results">No se encontraron resultados</div>
                    ) : (
                        filteredOptions.map(opt => (
                            <label key={opt} className="filter-list-item">
                                <input 
                                    type="checkbox" 
                                    checked={tempSelected.has(opt)}
                                    onChange={() => handleToggleOption(opt)}
                                />
                                <span>{opt}</span>
                            </label>
                        ))
                    )}
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
        if (!dateString) return null;
        // Solo mostramos para No Facturado y Facturado (pendiente de cobro)
        if (status !== 'No Facturado' && status !== 'Facturado') return null;
        const days = Math.abs(differenceInDays(new Date(), new Date(dateString)));
        // A partir de 3 días mostramos el indicador de demora
        if (days >= 3) return { urgent: true, days };
        return null;
    };

    const renderDocumentPopover = () => {
        if (!activePopover) return null;
        const { type, documents, anchorEl, item } = activePopover;
        const rect = anchorEl.getBoundingClientRect();
        
        // Usar fixed position basada en el rect de la ventana
        const style = {
            position: 'fixed',
            top: `${rect.bottom + 8}px`,
            left: `${rect.left - 100}px`, // Intentar centrar un poco
            zIndex: 9999
        };

        const popover = (
            <div className="document-popover" style={style} onClick={(e) => e.stopPropagation()}>
                <div className="popover-header">
                    Seleccionar {type === 'factura' ? 'Comprobante' : 'Recibo'}
                </div>
                {documents.map((doc, idx) => (
                    <div 
                        key={idx} 
                        className="popover-item"
                        onClick={() => {
                            setSelectedItem(item);
                            setModalMode(type);
                            setSelectedDocRef(doc); 
                            setActivePopover(null);
                        }}
                    >
                        {type === 'factura' ? <FaFileInvoice /> : <FaCashRegister />}
                        <div className="popover-item-text">
                            <span>{doc}</span>
                        </div>
                    </div>
                ))}
            </div>
        );

        return ReactDOM.createPortal(popover, document.body);
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
            { 
                id: 1, label: 'Presupuesto', sublabel: `PR Nº ${item.NroPR}`, 
                date: formatFechaHora(item.FchMovimiento), completed: hasPR, mode: 'presupuesto' 
            },
            { 
                id: 2, label: 'Carga', sublabel: `Carga Nº ${item.CodigoCarga}`, 
                date: formatFechaHora(item.FecAltCarga), completed: hasCarga, mode: 'carga' 
            },
            { 
                id: 3, label: 'Factura', 
                sublabel: item.isMultiInvoice ? `Varios (${item.individualInvoices.length})` : (factura || 'Pendiente Facturación'), 
                date: '', completed: isFacturado, mode: 'factura', 
                isMulti: item.isMultiInvoice, docs: item.individualInvoices 
            },
            { 
                id: 4, label: 'Recibo', 
                sublabel: item.isMultiReceipt ? `Varios (${item.individualReceipts.length})` : (item.ReciboCobranza || 'Sin recibo'), 
                date: '', completed: hasRecibo, mode: 'recibo', 
                isMulti: item.isMultiReceipt, docs: item.individualReceipts 
            }
        ];

        const urgencyFactura = getUrgencyInfo(item.FecAltCarga, (hasCarga && !isFacturado) ? 'No Facturado' : '');
        const urgencyRecibo = getUrgencyInfo(item.FecFactura, (isFacturado && !hasRecibo) ? 'Facturado' : '');

        return (
            <div className="table-process-timeline" onClick={(e) => e.stopPropagation()}>
                {steps.map((step) => (
                    <div 
                        key={step.id} 
                        className={`table-timeline-item ${step.completed ? 'completed' : ''}`}
                        onClick={(e) => {
                            if (step.isMulti && step.completed) {
                                setActivePopover({
                                    type: step.mode,
                                    item: item,
                                    documents: step.docs,
                                    anchorEl: e.currentTarget.querySelector('.table-timeline-marker')
                                });
                            } else {
                                setSelectedItem(item);
                                setModalMode(step.mode);
                                setSelectedDocRef(null); // Reset
                            }
                        }}
                    >
                        <div className={`table-timeline-marker ${step.isMulti ? 'stacked' : ''}`}>{step.id}</div>
                        <div className="table-timeline-content">
                            <h4 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                {step.label}
                                {step.id === 3 && !step.completed && urgencyFactura && (
                                    <span title={`Pendiente hace ${urgencyFactura.days} días`} style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
                                        <FaClock /> <span style={{ marginLeft: '1px', fontSize: '0.75rem' }}>{urgencyFactura.days}d</span>
                                    </span>
                                )}
                                {step.id === 4 && !step.completed && urgencyRecibo && (
                                    <span title={`Pendiente de cobro hace ${urgencyRecibo.days} días`} style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>
                                        <FaClock /> <span style={{ marginLeft: '1px', fontSize: '0.75rem' }}>{urgencyRecibo.days}d</span>
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

    const renderMobileCards = () => {
        if (!currentGroups || currentGroups.length === 0) {
            return (
                <div className="no-data-container">
                    <FaExclamationCircle className="no-data-icon" />
                    <h3>No se encontraron resultados</h3>
                    <p>Intenta ajustar los filtros de búsqueda</p>
                </div>
            );
        }

        return (
            <div className="mobile-cards-container fade-in">
                {currentGroups.map((group) => {
                    const status = getEstadoInfo(group.info);
                    const isExpanded = expandedPresupuestos.has(group.key);
                    
                    return (
                        <div key={group.key} className={`mobile-card ${isExpanded ? 'expanded' : ''}`}>
                            <div className="mobile-card-header" onClick={() => togglePresupuesto(group.key)}>
                                <div className="mobile-card-pr">
                                    <span className="pr-number">PR {group.presupuesto}</span>
                                    <span className="pr-date">{formatFecha(group.info.FchMovimiento)}</span>
                                </div>
                                <div className="mobile-card-status">
                                    <span className={`badge ${status.class}`}>{status.text}</span>
                                    <FaChevronDown className={`expand-icon ${isExpanded ? 'rotated' : ''}`} />
                                </div>
                            </div>
                            
                            <div className="mobile-card-body" onClick={() => togglePresupuesto(group.key)}>
                                <div className="mobile-card-client">
                                    <strong>{group.info.NomCliente}</strong>
                                </div>
                                <div className="mobile-card-amount">
                                    {formatMonto(group.budgetTotal, group.info.Moneda)}
                                </div>
                            </div>

                            {activeFilter !== 'all' && (
                                <div className="mobile-card-leyenda">
                                    {renderLeyenda(group.info)}
                                </div>
                            )}

                            {isExpanded && (
                                <div className="mobile-card-details">
                                    {group.cargasArray.map((cargaGroup, idx) => {
                                        const isFacturado = cargaGroup.info.FacturaAsociadaOP && 
                                            !cargaGroup.info.FacturaAsociadaOP.includes('CARGA NO FACTURADA') && 
                                            !cargaGroup.info.FacturaAsociadaOP.includes('Pendiente');
                                        const hasRecibo = cargaGroup.info.ReciboCobranza && !cargaGroup.info.ReciboCobranza.includes('Pendiente');
                                        
                                        const urgencyStatus = (cargaGroup.carga && !isFacturado) ? 'No Facturado' : (isFacturado && !hasRecibo ? 'Facturado' : '');
                                        const urgencyDate = urgencyStatus === 'No Facturado' ? (cargaGroup.info.FecAltCarga || cargaGroup.info.FchMovimiento) : (urgencyStatus === 'Facturado' ? cargaGroup.info.FecFactura : null);
                                        const urgency = getUrgencyInfo(urgencyDate, urgencyStatus);

                                        return (
                                            <div key={idx} className="mobile-carga-item" onClick={(e) => handleRowClick(cargaGroup.info, e)}>
                                                <div className="mobile-carga-title">
                                                    {cargaGroup.carga ? (
                                                        <>
                                                            <FaTruck /> Carga № {cargaGroup.carga}
                                                            {urgency && (
                                                                <span className="urgency-badge">
                                                                    <FaClock /> {urgency.days}d
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <strong>Items sin carga</strong>
                                                    )}
                                                    <FaEye className="view-icon" />
                                                </div>
                                                
                                                {cargaGroup.carga && (
                                                    <div className="mobile-vertical-timeline">
                                                        {[
                                                            { label: 'PR', sub: `Nº ${group.presupuesto}`, completed: true, mode: 'presupuesto' },
                                                            { label: 'Carga', sub: `Nº ${cargaGroup.carga}`, completed: true, mode: 'carga' },
                                                            { 
                                                                label: 'Factura', 
                                                                sub: cargaGroup.info.isMultiInvoice ? `Varios (${cargaGroup.info.individualInvoices.length})` : (cargaGroup.info.FacturaAsociadaOP || 'Pendiente'), 
                                                                completed: isFacturado, mode: 'factura',
                                                                isMulti: cargaGroup.info.isMultiInvoice, docs: cargaGroup.info.individualInvoices
                                                            },
                                                            { 
                                                                label: 'Recibo', 
                                                                sub: cargaGroup.info.isMultiReceipt ? `Varios (${cargaGroup.info.individualReceipts.length})` : (cargaGroup.info.ReciboCobranza || 'Pendiente'), 
                                                                completed: cargaGroup.info.ReciboCobranza && !cargaGroup.info.ReciboCobranza.includes('Pendiente'), mode: 'recibo',
                                                                isMulti: cargaGroup.info.isMultiReceipt, docs: cargaGroup.info.individualReceipts
                                                            }
                                                        ].map((step, sIdx) => (
                                                            <div 
                                                                key={sIdx} 
                                                                className={`timeline-step ${step.completed ? 'completed' : ''}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (step.isMulti && step.completed) {
                                                                        setActivePopover({
                                                                            type: step.mode,
                                                                            item: cargaGroup.info,
                                                                            documents: step.docs,
                                                                            anchorEl: e.currentTarget.querySelector('.step-marker')
                                                                        });
                                                                    } else {
                                                                        setSelectedItem(cargaGroup.info);
                                                                        setModalMode(step.mode);
                                                                        setSelectedDocRef(null);
                                                                    }
                                                                }}
                                                            >
                                                                <div className={`step-marker ${step.isMulti ? 'stacked' : ''}`}>{sIdx + 1}</div>
                                                                <div className="step-info">
                                                                    <span className="step-label">{step.label}</span>
                                                                    <span className="step-sub">{step.sub}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {!cargaGroup.carga && (
                                                    <div className="mobile-no-carga-status">
                                                        <span className={`badge ${getEstadoInfo(cargaGroup.info).class}`}>
                                                            {getEstadoInfo(cargaGroup.info).text}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
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
        <div className="results-table-container">
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
                        {searchCriteria && searchCriteria.fechaDesde && searchCriteria.fechaHasta && (
                            <span className="date-range-info" style={{ marginLeft: '8px', opacity: 0.8, fontWeight: '500' }}>
                                ({new Date(searchCriteria.fechaDesde + 'T00:00:00').toLocaleDateString('es-AR')} - {new Date(searchCriteria.fechaHasta + 'T00:00:00').toLocaleDateString('es-AR')})
                            </span>
                        )}
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
                    
                    {/* Botón Expandir/Contraer Todo */}
                    <button 
                        onClick={toggleAllVisible} 
                        className={`btn-toggle-all ${allExpanded ? 'active' : ''}`}
                        title={allExpanded ? 'Contraer todos los registros' : 'Expandir todos los registros'}
                    >
                        {allExpanded ? (
                            <><FaCompressArrowsAlt /> Contraer todo</>
                        ) : (
                            <><FaExpandArrowsAlt /> Expandir todo</>
                        )}
                    </button>

                    {/* Botón Limpiar Filtros */}
                    {(sortConfig.key || estadoSubFilter !== 'all' || selectedPresupuestos || selectedClientes || selectedMonedas || filterStartDate || filterEndDate) && (
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

            {/* Subtotales y Totales al Principio */}
            {(subtotals.ARS > 0 || subtotals.USD > 0) && (
                <div className="top-totals-container animate-fade-in">
                    <div className="top-totals-grid">
                        <div className="top-total-item subtotals-by-currency">
                            <span className="top-total-label">SUBTOTAL POR MONEDA</span>
                            <div className="top-total-values">
                                {subtotals.ARS > 0 && (
                                    <div className="top-total-value">
                                        {formatMonto(subtotals.ARS, 'ARS')}
                                    </div>
                                )}
                                {subtotals.USD > 0 && (
                                    <div className="top-total-value">
                                        {formatMonto(subtotals.USD, 'USD')}
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="top-total-item consolidated-total">
                            <div className="total-label-with-selector">
                                <span className="top-total-label">TOTAL CONSOLIDADO</span>
                                <div className="currency-selector-mini glass">
                                    <button 
                                        className={`currency-btn-mini ${displayCurrency === 'ARS' ? 'active' : ''}`}
                                        onClick={() => setDisplayCurrency('ARS')}
                                    >
                                        ARS
                                    </button>
                                    <button 
                                        className={`currency-btn-mini ${displayCurrency === 'USD_BNA' ? 'active' : ''}`}
                                        onClick={() => setDisplayCurrency('USD_BNA')}
                                    >
                                        USD BNA
                                    </button>
                                    <button 
                                        className={`currency-btn-mini ${displayCurrency === 'USD_SII' ? 'active' : ''}`}
                                        onClick={() => setDisplayCurrency('USD_SII')}
                                    >
                                        USD SII
                                    </button>
                                </div>
                            </div>
                            <div className="top-total-value-main">
                                {displayCurrency === 'ARS' 
                                    ? formatMonto(subtotals.totalConsolidated, 'ARS') 
                                    : formatMonto(subtotals.totalConsolidated, displayCurrency === 'USD_BNA' ? 'USD (BNA)' : 'USD (SII)')
                                }
                                {displayCurrency !== 'ARS' && (
                                    <span className="top-total-rate">
                                        (T/C: ${displayCurrency === 'USD_BNA' ? exchangeRate : chileExchangeRate})
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabla jerárquica / Vista de Tarjetas Móvil */}
            {isMobile && (
                <div className="mobile-filter-bar sticky-top fade-in">
                    <button 
                        className={`mobile-filter-pill ${selectedPresupuestos ? 'active' : ''}`}
                        onClick={() => {
                            setFilterSearchTerm('');
                            setTempSelected(selectedPresupuestos ? new Set(selectedPresupuestos) : new Set(uniquePresupuestos));
                            setShowPRFilter(true);
                        }}
                    >
                        <FaFileAlt /> PR {selectedPresupuestos && <span className="pill-count">{selectedPresupuestos.size}</span>}
                        <FaChevronDown className="pill-arrow" />
                    </button>
                    <button 
                        className={`mobile-filter-pill ${selectedClientes || selectedMonedas ? 'active' : ''}`}
                        onClick={() => {
                            setFilterSearchTerm('');
                            setTempSelected(selectedClientes ? new Set(selectedClientes) : new Set(uniqueClientes));
                            setTempSelectedMonedas(selectedMonedas ? new Set(selectedMonedas) : new Set(uniqueMonedas));
                            setShowClienteFilter(true);
                        }}
                    >
                        <FaUser /> Cliente {(selectedClientes || selectedMonedas) && <span className="pill-count">{(selectedClientes?.size || 0) + (selectedMonedas?.size || 0)}</span>}
                        <FaChevronDown className="pill-arrow" />
                    </button>
                    {activeFilter === 'all' && (
                        <button 
                            className={`mobile-filter-pill ${estadoSubFilter !== 'all' ? 'active' : ''}`}
                            onClick={() => setShowEstadoModal(true)}
                        >
                            <FaInfoCircle /> Estado
                            <FaChevronDown className="pill-arrow" />
                        </button>
                    )}
                </div>
            )}

            {isMobile ? (
                renderMobileCards()
            ) : (
                <div className={`table-wrapper ${(showPRFilter || showClienteFilter || showEstadoModal) ? 'filter-open' : ''}`}>
                    <table className="results-table hierarchical-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                        <colgroup>
                            <col style={{ width: '30%' }} />
                            <col style={{ width: '40%' }} />
                            <col style={{ width: '30%' }} />
                        </colgroup>
                        <thead>
                            <tr className="table-header-row">
                                <th 
                                    className="py-4 font-medium clickable-header relative" 
                                    style={{ textAlign: 'left', paddingLeft: '2.5rem' }}
                                >
                                    <div 
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setFilterSearchTerm('');
                                            setTempSelected(selectedPresupuestos ? new Set(selectedPresupuestos) : new Set(uniquePresupuestos));
                                            setTempStartDate(filterStartDate);
                                            setTempEndDate(filterEndDate);
                                            setShowPRFilter(!showPRFilter);
                                            setShowClienteFilter(false);
                                            setShowEstadoModal(false);
                                        }}
                                    >
                                        N° Presupuesto / Fecha 
                                        <FaChevronDown style={{ fontSize: '0.7rem', opacity: selectedPresupuestos ? 1 : 0.5, color: selectedPresupuestos ? 'var(--primary-color)' : 'inherit' }} />
                                    </div>
                                    {!isMobile && showPRFilter && renderExcelFilter('pr')}
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
                                            cursor: activeFilter === 'all' ? 'pointer' : 'default' 
                                        }}
                                        onClick={() => {
                                            if (activeFilter === 'all') {
                                                setShowEstadoModal(!showEstadoModal);
                                            }
                                        }}
                                    >
                                        Estado <FaChevronDown style={{ 
                                            fontSize: '0.8rem', 
                                            opacity: activeFilter === 'all' ? 1 : 0.2,
                                            display: activeFilter === 'all' ? 'block' : 'none'
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
                                                    Cobrado
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
                                            e.preventDefault();
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
                                    {!isMobile && showClienteFilter && renderExcelFilter('cliente', 'right')}
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

                                            {/* Columna 2: Estado y Indicador de Progreso */}
                                            <td className="py-5 relative" style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                    {(() => {
                                                        const status = getEstadoInfo(group.info);
                                                        const progressMap = { 'PAGADO': 100, 'FACTURADO': 75, 'CARGA ASIGNADA': 50, 'PRESUPUESTO': 25 };
                                                        const progress = progressMap[status.text.toUpperCase()] || 0;
                                                        
                                                        return (
                                                            <>
                                                                <span className={`badge ${status.class}`} style={{ margin: '0 auto' }}>
                                                                    <span className={`badge-dot ${status.dot}`}></span>
                                                                    {status.text}
                                                                </span>
                                                                <div className="mini-progress-track">
                                                                    <div 
                                                                        className={`mini-progress-fill ${status.dot}`} 
                                                                        style={{ width: `${progress}%` }}
                                                                    ></div>
                                                                </div>
                                                            </>
                                                        );
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
            )}

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

            {isMobile && showPRFilter && renderExcelFilter('pr')}
            {isMobile && showClienteFilter && renderExcelFilter('cliente')}
            {isMobile && showEstadoModal && renderEstadoModal()}

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
                        isMobile={isMobile}
                        selectedDocRef={selectedDocRef}
                    />
                );
            })()}

            {/* Popover de Selección de Documentos */}
            {activePopover && renderDocumentPopover()}
        </div>
    );
};

export default ResultsTable;
