import React, { useMemo, useState, useRef, useEffect } from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, CartesianGrid, LabelList
} from 'recharts';
import {
    TrendingUp, TrendingDown, DollarSign, Package,
    FileText, Calendar, Download, MoreHorizontal,
    ArrowUpRight, MapPin, Truck, HelpCircle, AlertCircle,
    ChevronDown, ArrowLeftRight, ArrowRight
} from 'lucide-react';
import RutasReporteModal from './RutasReporteModal';
import MonthlyReporteModal from './MonthlyReporteModal';
import './AnalyticsDashboard.css';

// Dimensiones disponibles para el donut "Mix de Negocio".
// Las tres llegan ya normalizadas por CASE desde el backend (#Cargas) y son
// NULL en filas sin carga, por lo que comparten el mismo filtro.
const MIX_DIMENSIONS = {
    viaje:     { label: 'Tipo de Viaje',     field: 'TipoViaje' },
    operacion: { label: 'Tipo de Operación', field: 'TipoOperacion' },
    empresa:   { label: 'Empresa',           field: 'EmpresaCarga' },
};

const SIN_CLASIFICAR = 'Sin clasificar';

const AnalyticsDashboard = ({ data, empresaFiltro, displayCurrency, setDisplayCurrency, exchangeRate, chileExchangeRate, onExportSoloPresupuesto, onExportAudit, searchCriteria }) => {
    const filteredData = useMemo(
        () => empresaFiltro ? data.filter(item => item.EmpOri === empresaFiltro) : data,
        [data, empresaFiltro]
    );

    // Estado del selector de periodo de comparación
    const [compMode, setCompMode]         = useState('auto');   // 'auto' | 'year-ago' | 'custom'
    const [compDesde, setCompDesde]       = useState('');
    const [compHasta, setCompHasta]       = useState('');
    const [kpiComparison, setKpiComparison] = useState(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const compDropdownRef = useRef(null);
    const [showRutasReporte, setShowRutasReporte] = useState(false);
    const [showMonthlyReporte, setShowMonthlyReporte] = useState(false);

    // Estado del selector de dimensión del Mix de Negocio
    const [mixDimension, setMixDimension] = useState('viaje');
    const [mixDropdownOpen, setMixDropdownOpen] = useState(false);
    const mixDropdownRef = useRef(null);

    // Cerrar dropdowns al hacer click fuera
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (compDropdownRef.current && !compDropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
            if (mixDropdownRef.current && !mixDropdownRef.current.contains(e.target)) {
                setMixDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch de comparación de KPIs según el modo elegido
    useEffect(() => {
        if (!searchCriteria?.fechaDesde || !searchCriteria?.fechaHasta) return;
        if (compMode === 'custom' && (!compDesde || !compHasta)) return;

        const params = new URLSearchParams({
            fechaDesde: searchCriteria.fechaDesde,
            fechaHasta: searchCriteria.fechaHasta,
        });
        if (empresaFiltro) params.append('empresa', empresaFiltro);

        if (compMode === 'year-ago') {
            const from = new Date(searchCriteria.fechaDesde + 'T00:00:00');
            const to   = new Date(searchCriteria.fechaHasta  + 'T00:00:00');
            from.setFullYear(from.getFullYear() - 1);
            to.setFullYear(to.getFullYear() - 1);
            params.append('compDesde', from.toISOString().split('T')[0]);
            params.append('compHasta', to.toISOString().split('T')[0]);
        } else if (compMode === 'custom') {
            params.append('compDesde', compDesde);
            params.append('compHasta', compHasta);
        }

        fetch(`/api/seguimiento/kpi-comparison?${params}`)
            .then(r => r.json())
            .then(result => { if (result.success) setKpiComparison(result); })
            .catch(err => console.error('Error kpi-comparison:', err));
    }, [searchCriteria?.fechaDesde, searchCriteria?.fechaHasta, empresaFiltro, compMode, compDesde, compHasta]);
    // Función auxiliar para normalizar montos según la moneda seleccionada con mayor robustez
    const normalizeAmount = (amount, itemCurrency) => {
        let currency = 'ARS';
        const raw = String(itemCurrency || '').toUpperCase().trim();
        
        // Mapeo robusto de divisas (soporta códigos numéricos y siglas comunes)
        if (raw === 'USD' || raw === '2' || raw === 'U$S' || raw === 'DOLARES' || raw === 'DÓLAR' || raw === 'DOL') {
            currency = 'USD';
        } else if (raw === 'ARS' || raw === '1' || raw === 'PESOS' || raw === '$' || raw === 'AR$' || raw === 'PES') {
            currency = 'ARS';
        }

        if (displayCurrency === 'ARS' && currency === 'ARS') return amount;
        if ((displayCurrency === 'USD_BNA' || displayCurrency === 'USD_SII') && currency === 'USD') return amount;
        
        let rate = 1;
        if (displayCurrency === 'USD_BNA') rate = parseFloat(exchangeRate) || 1000;
        else if (displayCurrency === 'USD_SII') rate = parseFloat(chileExchangeRate) || 900;
        else if (displayCurrency === 'ARS') rate = parseFloat(exchangeRate) || 1000;

        if (displayCurrency === 'ARS' && currency === 'USD') {
            return amount * rate;
        }
        
        if ((displayCurrency === 'USD_BNA' || displayCurrency === 'USD_SII') && currency === 'ARS') {
            return amount / rate;
        }
        
        return amount;
    };

    // Determina el estado financiero de un item (misma lógica que MainTrendChart)
    const getEstadoKey = (item) => {
        const factura = item.FacturaAsociadaOP;
        const recibo = item.ReciboCobranza;
        if (recibo && !recibo.includes('Pendiente')) return 'Pagado';
        if (factura && !factura.includes('CARGA NO FACTURADA') && !factura.includes('Pendiente')) return 'Facturado';
        if (item.CodigoCarga) return 'No Facturado';
        return 'Solo Presupuesto';
    };

    // 1. Procesamiento de KPIs
    const kpis = useMemo(() => {
        if (!filteredData || filteredData.length === 0) return {};

        const totals = {
            operado: 0,
            facturado: 0,
            cobrado: 0,
            pendiente: 0,
            counts: { total: 0, cargas: new Set(), facturas: new Set(), cobrados: new Set() }
        };

        const budgetsMap = {};

        filteredData.forEach(item => {
            const nroPR = item.NroPR || `SOL-${item.NroSolicitud}`;
            const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
            const key = `${empresa}-${nroPR}`;

            if (!budgetsMap[key]) {
                budgetsMap[key] = { total: 0, facturado: 0, cobrado: 0, hasCarga: false, hasFactura: false, hasCobro: false };
            }

            const itemTotal = normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
            budgetsMap[key].total += itemTotal;
            totals.counts.total++;

            if (item.CodigoCarga) {
                totals.counts.cargas.add(item.CodigoCarga);
                budgetsMap[key].hasCarga = true;
            }

            const isFacturado = item.FacturaAsociadaOP &&
                                !item.FacturaAsociadaOP.includes('Pendiente') &&
                                !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA');

            const isCobrado = item.ReciboCobranza && !item.ReciboCobranza.includes('Pendiente');

            if (isFacturado) {
                budgetsMap[key].facturado += itemTotal;
                totals.counts.facturas.add(item.FacturaAsociadaOP);
                budgetsMap[key].hasFactura = true;
            }

            if (isCobrado) {
                budgetsMap[key].cobrado += itemTotal;
                totals.counts.cobrados.add(item.ReciboCobranza);
                budgetsMap[key].hasCobro = true;
            }
        });

        const presupuestosArr = Object.values(budgetsMap);
        totals.counts.uniquePresupuestos      = presupuestosArr.length;
        totals.counts.presupuestosConCarga    = presupuestosArr.filter(b => b.hasCarga).length;
        totals.counts.presupuestosConFactura  = presupuestosArr.filter(b => b.hasFactura).length;
        totals.counts.presupuestosConCobro    = presupuestosArr.filter(b => b.hasCobro).length;

        presupuestosArr.forEach(b => {
            totals.operado += b.total;
            totals.facturado += b.facturado;
            totals.cobrado += b.cobrado;
        });

        totals.pendiente = totals.facturado - totals.cobrado;
        totals.cobrabilidad = totals.facturado > 0 ? (totals.cobrado / totals.facturado) * 100 : 0;

        return totals;
    }, [filteredData, displayCurrency, exchangeRate]);

    // 2. Data para Top 5 Clientes
    const topClientes = useMemo(() => {
        const clientMap = {};
        filteredData.forEach(item => {
            if (!item.NomCliente) return;
            const amount = normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
            clientMap[item.NomCliente] = (clientMap[item.NomCliente] || 0) + amount;
        });

        return Object.entries(clientMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [filteredData, displayCurrency, exchangeRate]);

    // 3. Data para Mix de Negocio — cuenta CARGAS ÚNICAS, no filas.
    // La API devuelve filas planas (una por factura), así que una carga con N
    // facturas aparece N veces. Se deduplica por CodigoCarga antes de contar.
    // Las filas sin carga se excluyen del donut: no son "tipo desconocido",
    // son ausencia de viaje. Se informan aparte como nota al pie.
    const mixNegocio = useMemo(() => {
        const field = MIX_DIMENSIONS[mixDimension].field;
        const cargaMap = {};
        const prSinCarga = new Set();

        filteredData.forEach(item => {
            if (!item.CodigoCarga) {
                const nroPR = item.NroPR || `SOL-${item.NroSolicitud}`;
                const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
                prSinCarga.add(`${empresa}-${nroPR}`);
                return;
            }

            const raw = item[field];
            // 'No especificado' (carga con código vacío) y NULL son el mismo caso
            const categoria = !raw || raw === 'No especificado' ? SIN_CLASIFICAR : raw;

            if (!cargaMap[item.CodigoCarga]) {
                cargaMap[item.CodigoCarga] = { categoria, importe: 0 };
            }
            cargaMap[item.CodigoCarga].importe += normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
        });

        const porCategoria = {};
        Object.values(cargaMap).forEach(({ categoria, importe }) => {
            if (!porCategoria[categoria]) porCategoria[categoria] = { name: categoria, value: 0, importe: 0 };
            porCategoria[categoria].value += 1;
            porCategoria[categoria].importe += importe;
        });

        const ordenadas = Object.values(porCategoria).sort((a, b) => b.value - a.value);

        // Las categorías sobrantes se agrupan en "Otros" en vez de descartarse,
        // para que los porcentajes siempre cierren en 100%.
        let slices = ordenadas;
        if (ordenadas.length > 4) {
            const resto = ordenadas.slice(3);
            slices = [
                ...ordenadas.slice(0, 3),
                {
                    name: 'Otros',
                    value: resto.reduce((a, s) => a + s.value, 0),
                    importe: resto.reduce((a, s) => a + s.importe, 0),
                    categorias: resto.length,
                },
            ];
        }

        const totalCargas = slices.reduce((a, s) => a + s.value, 0);
        slices = slices.map(s => ({
            ...s,
            percent: totalCargas > 0 ? Math.round((s.value / totalCargas) * 100) : 0,
        }));

        return { slices, totalCargas, sinCarga: prSinCarga.size };
    }, [filteredData, mixDimension, displayCurrency, exchangeRate]);

    // 4. Data para Rutas (Top Origen -> Destino)
    const topRutas = useMemo(() => {
        const rutaMap = {};
        filteredData.forEach(item => {
            if (!item.LocalizacionCargaOP || !item.LocalizacionEntregaOP) return;
            const key = `${item.LocalizacionCargaOP} → ${item.LocalizacionEntregaOP}`;
            if (!rutaMap[key]) {
                rutaMap[key] = { ruta: key, count: 0, total: 0, date: null };
            }
            rutaMap[key].count++;
            const amount = normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
            rutaMap[key].total += amount;

            const itemDate = item.FechaCargaOP || item.FchMovimiento || item.FchAltaRegistro;
            if (itemDate && (!rutaMap[key].date || new Date(itemDate) > new Date(rutaMap[key].date))) {
                rutaMap[key].date = itemDate;
            }
        });

        return Object.values(rutaMap)
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);
    }, [filteredData, displayCurrency, exchangeRate]);

    // 5. Tendencia Mensual agrupada por año+mes para evitar mezcla entre años
    // Agregación mensual completa: desglose por estado + total + conteo.
    // `monthlyReportData` incluye TODOS los meses del período (para el modal);
    // `trendData` es el subconjunto de los últimos 6 meses con delta (para el gráfico).
    const monthlyReportData = useMemo(() => {
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const monthlyStats = {};

        filteredData.forEach(item => {
            const dateStr = item.FchMovimiento || item.FchAltaRegistro;
            if (!dateStr) return;
            const date = new Date(dateStr);
            if (isNaN(date)) return;
            const sortKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
            const label = `${months[date.getMonth()]} ${date.getFullYear().toString().slice(2)}`;
            if (!monthlyStats[sortKey]) {
                monthlyStats[sortKey] = {
                    name: label, sortKey, total: 0, count: 0,
                    'Pagado': 0, 'Facturado': 0, 'No Facturado': 0, 'Solo Presupuesto': 0,
                };
            }
            const amount = normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
            const estado = getEstadoKey(item);
            monthlyStats[sortKey][estado] += amount;
            monthlyStats[sortKey].total += amount;
            monthlyStats[sortKey].count += 1;
        });

        const ordered = Object.values(monthlyStats).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        // Delta % respecto al mes anterior
        return ordered.map((m, i) => ({
            ...m,
            deltaPct: i > 0 && ordered[i - 1].total !== 0
                ? ((m.total - ordered[i - 1].total) / Math.abs(ordered[i - 1].total)) * 100
                : null,
        }));
    }, [filteredData, displayCurrency, exchangeRate, chileExchangeRate]);

    const trendData = useMemo(() => monthlyReportData.slice(-6), [monthlyReportData]);

    const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    const formatCurrency = (val) => {
        const currencyCode = displayCurrency === 'ARS' ? 'ARS' : 'USD';
        const label = displayCurrency === 'USD_BNA' ? 'USD (BNA)' : (displayCurrency === 'USD_SII' ? 'USD (SII)' : 'ARS');
        
        return new Intl.NumberFormat('es-AR', { 
            style: 'currency', 
            currency: currencyCode,
            minimumFractionDigits: 0 
        }).format(val).replace('USD', label);
    };

    // Formato compacto para etiquetas sobre barras (ej. $1.2M, $450k)
    const formatCompact = (val) => {
        const sym = displayCurrency === 'ARS' ? '$' : 'US$';
        const abs = Math.abs(val);
        if (abs >= 1e6) return `${sym}${(val / 1e6).toFixed(1)}M`;
        if (abs >= 1e3) return `${sym}${Math.round(val / 1e3)}k`;
        return `${sym}${Math.round(val)}`;
    };

    // Tendencias vs periodo anterior (calculadas en backend y normalizadas aquí)
    const cmpCurr = kpiComparison?.current;
    const cmpPrev = kpiComparison?.previous;
    const calcPct = (curr, prev) =>
        prev != null && prev !== 0 && curr != null
            ? ((curr - prev) / Math.abs(prev)) * 100
            : null;
    const trendOperado   = calcPct(cmpCurr?.Operado, cmpPrev?.Operado);
    const trendFacturado = calcPct(cmpCurr?.Facturado, cmpPrev?.Facturado);
    const currPend = (cmpCurr?.Facturado ?? 0) - (cmpCurr?.Cobrado ?? 0);
    const prevPend = (cmpPrev?.Facturado ?? 0) - (cmpPrev?.Cobrado ?? 0);
    const trendPendiente = calcPct(currPend, prevPend);
    const currCobPct = cmpCurr?.Facturado > 0 ? (cmpCurr.Cobrado / cmpCurr.Facturado) * 100 : null;
    const prevCobPct = cmpPrev?.Facturado > 0 ? (cmpPrev.Cobrado / cmpPrev.Facturado) * 100 : null;
    const trendCobrabilidad = currCobPct != null && prevCobPct != null ? currCobPct - prevCobPct : null;

    // Stats del embudo (basadas en conteos de filteredData)
    const fTotal    = kpis.counts?.uniquePresupuestos       ?? 0;
    const fCargas   = kpis.counts?.presupuestosConCarga     ?? 0;
    const fFacturas = kpis.counts?.presupuestosConFactura   ?? 0;
    const fCobrados = kpis.counts?.presupuestosConCobro     ?? 0;
    const fRate1      = fTotal    > 0 ? (fCargas   / fTotal)    * 100 : 0; // PR → Carga
    const fRate2      = fCargas   > 0 ? (fFacturas / fCargas)   * 100 : 0; // Carga → Factura
    const fRate3      = fFacturas > 0 ? (fCobrados / fFacturas) * 100 : 0; // Factura → Cobro
    const fRateGlobal = fTotal    > 0 ? (fFacturas / fTotal)    * 100 : 0;
    const fColor      = (r) => r >= 70 ? '#10b981' : r >= 40 ? '#f59e0b' : '#ef4444';

    // Tasas monetarias del embudo para comparación con periodo anterior
    const fCurrFact  = cmpCurr?.Operado > 0 ? (cmpCurr.Facturado / cmpCurr.Operado) * 100 : null;
    const fPrevFact  = cmpPrev?.Operado > 0 ? (cmpPrev.Facturado / cmpPrev.Operado) * 100 : null;
    const fDeltaFact = fCurrFact != null && fPrevFact != null ? fCurrFact - fPrevFact : null;

    const TrendBadge = ({ pct, invertColors = false, isPp = false }) => {
        if (pct == null) return (
            <div className="kpi-trend neutral">
                <span className="trend-subtext">Periodo consultado</span>
            </div>
        );
        const positive = pct >= 0;
        const colorClass = invertColors ? (positive ? 'down' : 'up') : (positive ? 'up' : 'down');
        return (
            <div className={`kpi-trend ${colorClass}`}>
                {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>{positive ? '+' : ''}{pct.toFixed(1)}{isPp ? ' pp' : '%'}</span>
                <span className="trend-subtext">vs periodo anterior</span>
            </div>
        );
    };

    const compModeLabel = compMode === 'auto'     ? 'Periodo anterior'
        : compMode === 'year-ago' ? 'Año anterior'
        : (compDesde && compHasta)
            ? `${new Date(compDesde + 'T00:00:00').toLocaleDateString('es-AR')} — ${new Date(compHasta + 'T00:00:00').toLocaleDateString('es-AR')}`
            : 'Personalizado';

    return (
        <div className="analytics-dashboard animate-fade-in">
            <header className="analytics-header">
                <div>
                    <h1>Analítica de Negocio</h1>
                    <p className="bento-subtitle">Visualización estratégica de operaciones logísticas</p>
                </div>
                <div className="analytics-header-actions">

                    {/* Selector de Periodo de Comparación */}
                    <div className="comp-period-selector" ref={compDropdownRef}>
                        <button
                            className="comp-period-btn"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            title="Elegir periodo de comparación"
                        >
                            <span className="comp-btn-label">Comparar con</span>
                            <div className="comp-btn-main">
                                <ArrowLeftRight size={13} />
                                <span>{compModeLabel}</span>
                                <ChevronDown size={12} style={{ transition: 'transform 0.2s', transform: dropdownOpen ? 'rotate(180deg)' : 'none' }} />
                            </div>
                        </button>

                        {dropdownOpen && (
                            <div className="comp-period-dropdown">
                                <p className="comp-dropdown-title">Periodo de comparación</p>

                                <label className="comp-option">
                                    <input type="radio" name="compMode" value="auto"
                                        checked={compMode === 'auto'}
                                        onChange={() => { setCompMode('auto'); setDropdownOpen(false); }} />
                                    <div className="help-icon-wrapper comp-help-icon">
                                        <HelpCircle size={13} />
                                        <div className="help-tooltip comp-tooltip">
                                            Compara contra el bloque de días inmediatamente anterior al periodo consultado, de igual duración. Ej: si consultás Ene–Jun (6 meses), toma automáticamente los 6 meses previos a ese periodo.
                                        </div>
                                    </div>
                                    <span>Periodo anterior</span>
                                </label>

                                <label className="comp-option">
                                    <input type="radio" name="compMode" value="year-ago"
                                        checked={compMode === 'year-ago'}
                                        onChange={() => { setCompMode('year-ago'); setDropdownOpen(false); }} />
                                    <div className="help-icon-wrapper comp-help-icon">
                                        <HelpCircle size={13} />
                                        <div className="help-tooltip comp-tooltip">
                                            Compara contra exactamente las mismas fechas pero del año pasado. Ideal para detectar si el negocio creció o cayó respecto a la misma época anterior.
                                        </div>
                                    </div>
                                    <span>Mismo periodo año anterior</span>
                                </label>

                                <label className="comp-option">
                                    <input type="radio" name="compMode" value="custom"
                                        checked={compMode === 'custom'}
                                        onChange={() => setCompMode('custom')} />
                                    <div className="help-icon-wrapper comp-help-icon">
                                        <HelpCircle size={13} />
                                        <div className="help-tooltip comp-tooltip">
                                            Elegí vos las fechas contra las que querés comparar. Útil para analizar periodos específicos como campañas, trimestres fiscales o cualquier rango a medida.
                                        </div>
                                    </div>
                                    <span>Personalizado</span>
                                </label>

                                {compMode === 'custom' && (
                                    <div className="comp-custom-dates">
                                        <div className="comp-date-field">
                                            <label>Desde</label>
                                            <input type="date" value={compDesde}
                                                onChange={e => setCompDesde(e.target.value)} />
                                        </div>
                                        <div className="comp-date-field">
                                            <label>Hasta</label>
                                            <input type="date" value={compHasta}
                                                onChange={e => setCompHasta(e.target.value)} />
                                        </div>
                                        {compDesde && compHasta && (
                                            <button className="comp-apply-btn"
                                                onClick={() => setDropdownOpen(false)}>
                                                Aplicar
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="analytics-period-badge">
                        <span className="comp-btn-label">Período consultado</span>
                        <div className="comp-btn-main">
                            <Calendar size={13} />
                            <span>
                                {searchCriteria?.fechaDesde && searchCriteria?.fechaHasta
                                    ? `${new Date(searchCriteria.fechaDesde + 'T00:00:00').toLocaleDateString('es-AR')} - ${new Date(searchCriteria.fechaHasta + 'T00:00:00').toLocaleDateString('es-AR')}`
                                    : 'Últimos 60 días'}
                            </span>
                        </div>
                    </div>
                    {onExportAudit && (
                        <button 
                            className="glass-btn" 
                            title="Auditar Datos (Trazabilidad Total)"
                            onClick={onExportAudit}
                            style={{ marginRight: '0.5rem' }}
                        >
                            <FileText size={18} /> Auditoría
                        </button>
                    )}
                    {onExportSoloPresupuesto && (
                        <button 
                            className="dark-btn" 
                            title="Descargar Auditoría de Solo Presupuesto"
                            onClick={onExportSoloPresupuesto}
                        >
                            <Download size={18} />
                        </button>
                    )}
                </div>
            </header>

            {/* KPI Cards Row */}
            <section className="kpi-grid">
                <div className="kpi-card">
                    <div className="kpi-header-row">
                        <div className="kpi-icon-box" style={{ marginBottom: 0 }}><DollarSign size={20} /></div>
                        <div className="help-icon-wrapper">
                            <HelpCircle size={16} />
                            <div className="help-tooltip">
                                <strong>Volumen Operado:</strong> Suma total de todos los presupuestos registrados. Refleja el potencial total negociado sin filtrar estados.
                            </div>
                        </div>
                    </div>
                    <p className="kpi-label">Volumen Operado</p>
                    <h2 className="kpi-value">{formatCurrency(kpis.operado ?? 0)}</h2>
                    <TrendBadge pct={trendOperado} />
                </div>

                <div className="kpi-card">
                    <div className="kpi-header-row">
                        <div className="kpi-icon-box" style={{ marginBottom: 0 }}><FileText size={20} /></div>
                        <div className="help-icon-wrapper">
                            <HelpCircle size={16} />
                            <div className="help-tooltip">
                                <strong>Total Facturado:</strong> Monto de presupuestos con factura oficial asociada y validada en sistema.
                            </div>
                        </div>
                    </div>
                    <p className="kpi-label">Total Facturado</p>
                    <h2 className="kpi-value">{formatCurrency(kpis.facturado ?? 0)}</h2>
                    <TrendBadge pct={trendFacturado} />
                </div>

                <div className="kpi-card">
                    <div className="kpi-header-row">
                        <div className="kpi-icon-box" style={{ marginBottom: 0 }}><Package size={20} /></div>
                        <div className="help-icon-wrapper">
                            <HelpCircle size={16} />
                            <div className="help-tooltip">
                                <strong>Pendiente de Cobro:</strong> Facturado sin cobro liquidado aún (Facturado − Cobrado).
                            </div>
                        </div>
                    </div>
                    <p className="kpi-label">Pendiente de Cobro</p>
                    <h2 className="kpi-value">{formatCurrency(kpis.pendiente ?? 0)}</h2>
                    <TrendBadge pct={trendPendiente} invertColors />
                </div>

                <div className="kpi-card">
                    <div className="kpi-header-row">
                        <div className="kpi-icon-box" style={{ marginBottom: 0 }}><Truck size={20} /></div>
                        <div className="help-icon-wrapper">
                            <HelpCircle size={16} />
                            <div className="help-tooltip">
                                <strong>Cobrabilidad:</strong> Eficiencia del flujo: (Importe Cobrado / Importe Facturado) × 100.
                            </div>
                        </div>
                    </div>
                    <p className="kpi-label">Cobrabilidad</p>
                    <h2 className="kpi-value">{(kpis.cobrabilidad ?? 0).toFixed(1)}%</h2>
                    <TrendBadge pct={trendCobrabilidad} isPp />
                </div>
            </section>

            {/* Main Content Grid */}
            <div className="bento-grid">
                
                {/* Top Clientes (Income Sources Style) */}
                <article className="bento-card">
                    <div className="bento-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="bento-title">Top 5 Clientes</h3>
                            <div className="help-icon-wrapper">
                                <HelpCircle size={14} />
                                <div className="help-tooltip">
                                    Clientes con mayor volumen acumulado en el periodo. Permite identificar socios comerciales críticos.
                                </div>
                            </div>
                        </div>
                        <ArrowUpRight size={18} className="text-muted" />
                    </div>
                    
                    <div className="kpi-value" style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                        {formatCurrency(topClientes.reduce((a,b)=>a+b.value, 0))}
                    </div>
                    <div className="kpi-trend neutral" style={{ marginBottom: '1.5rem' }}>
                        <span className="trend-subtext">Periodo consultado</span>
                    </div>

                    <div className="progress-stack">
                        {topClientes.map((c, i) => (
                            <div 
                                key={i} 
                                style={{ 
                                    width: `${(c.value / topClientes.reduce((a,b)=>a+b.value, 0)) * 100}%`,
                                    backgroundColor: CHART_COLORS[i % CHART_COLORS.length]
                                }} 
                            />
                        ))}
                    </div>

                    <div className="source-list">
                        {topClientes.map((c, i) => (
                            <div key={i} className="source-item">
                                <div className="source-info">
                                    <div className="source-dot" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                    <span className="source-name">{c.name}</span>
                                </div>
                                <span className="source-value">{formatCurrency(c.value)}</span>
                            </div>
                        ))}
                    </div>
                </article>

                {/* Monthly Evolution (Monthly Expenses Style) */}
                <article className="bento-card" style={{ gridColumn: 'span 1' }}>
                    <div className="bento-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="bento-title">Evolución Mensual</h3>
                            <div className="help-icon-wrapper">
                                <HelpCircle size={14} />
                                <div className="help-tooltip">
                                    Muestra el crecimiento bruto mes a mes. Ayuda a visualizar estacionalidad y picos de demanda.
                                </div>
                            </div>
                        </div>
                        <div
                            className="glass-btn"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                            onClick={() => setShowMonthlyReporte(true)}
                        >
                            Ver Reporte
                        </div>
                    </div>

                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={trendData} margin={{ top: 28, right: 10, left: 10, bottom: 0 }} barCategoryGap="28%">
                            <defs>
                                <linearGradient id="barEvolucionUp" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#60a5fa" />
                                    <stop offset="100%" stopColor="#2563eb" />
                                </linearGradient>
                                <linearGradient id="barEvolucionDown" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#fca5a5" />
                                    <stop offset="100%" stopColor="#e11d48" />
                                </linearGradient>
                                <linearGradient id="barEvolucionFlat" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#94a3b8" />
                                    <stop offset="100%" stopColor="#475569" />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border-color, #eef1f4)" />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'var(--text-muted, #909296)', fontSize: 11, fontWeight: 600 }}
                                dy={10}
                            />
                            <YAxis hide domain={[0, dataMax => dataMax * 1.15]} />
                            <Tooltip
                                cursor={{ fill: 'rgba(148,163,184,0.1)' }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const p = payload[0].payload;
                                        const estados = ['Pagado', 'Facturado', 'No Facturado', 'Solo Presupuesto'];
                                        const estadoColor = { 'Pagado': '#10b981', 'Facturado': '#3b82f6', 'No Facturado': '#f59e0b', 'Solo Presupuesto': '#64748b' };
                                        const deltaColor = p.deltaPct == null ? '#94a3b8' : (p.deltaPct >= 0 ? '#10b981' : '#ef4444');
                                        return (
                                            <div style={{ background: '#1a1b1e', color: 'white', padding: '12px', borderRadius: '10px', fontSize: '12px', minWidth: '190px' }}>
                                                <div style={{ fontWeight: 700, marginBottom: '8px' }}>{p.name} · {p.count} ops</div>
                                                {estados.filter(e => p[e] > 0).map(e => (
                                                    <div key={e} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '3px' }}>
                                                        <span style={{ opacity: 0.85 }}>
                                                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: estadoColor[e], marginRight: 6 }} />
                                                            {e}
                                                        </span>
                                                        <span>{formatCurrency(p[e])}</span>
                                                    </div>
                                                ))}
                                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', margin: '8px 0 6px', paddingTop: 6, display: 'flex', justifyContent: 'space-between', gap: '16px', fontWeight: 700 }}>
                                                    <span>Total</span>
                                                    <span>{formatCurrency(p.total)}</span>
                                                </div>
                                                <div style={{ color: deltaColor, fontWeight: 600 }}>
                                                    {p.deltaPct == null ? 'Sin mes previo' : `${p.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(p.deltaPct).toFixed(1)}% vs mes anterior`}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar
                                dataKey="total"
                                radius={[8, 8, 2, 2]}
                                maxBarSize={56}
                                animationDuration={900}
                                background={{ fill: 'var(--bg-accents-1, rgba(148,163,184,0.08))', radius: 8 }}
                            >
                                {trendData.map((m, i) => {
                                    const grad = m.deltaPct == null
                                        ? 'url(#barEvolucionFlat)'
                                        : (m.deltaPct >= 0 ? 'url(#barEvolucionUp)' : 'url(#barEvolucionDown)');
                                    return <Cell key={i} fill={grad} />;
                                })}
                                <LabelList
                                    dataKey="total"
                                    position="top"
                                    formatter={formatCompact}
                                    style={{ fill: 'var(--text-secondary, #495057)', fontSize: 11.5, fontWeight: 800 }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="kpi-trend neutral" style={{ justifyContent: 'center', marginTop: '1rem' }}>
                        <span className="trend-subtext">
                            {trendData.length === 0
                                ? 'Sin datos en el periodo'
                                : trendData.length >= 6
                                    ? 'Últimos 6 meses del periodo'
                                    : `${trendData.length} ${trendData.length === 1 ? 'mes' : 'meses'} del periodo`}
                        </span>
                    </div>
                </article>

                {/* Business Mix (Summary Style) */}
                <article className="bento-card">
                    <div className="bento-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="bento-title">Mix de Negocio</h3>
                            <div className="help-icon-wrapper">
                                <HelpCircle size={14} />
                                <div className="help-tooltip">
                                    Distribución de las cargas del período según la dimensión elegida. Cuenta cargas únicas, no facturas: una carga con varias facturas cuenta una sola vez. Los PR que todavía no tienen carga quedan fuera del gráfico y se informan al pie.
                                </div>
                            </div>
                        </div>

                        {/* Selector de dimensión */}
                        <div className="mix-dim-selector" ref={mixDropdownRef}>
                            <button
                                className="mix-dim-btn"
                                onClick={() => setMixDropdownOpen(!mixDropdownOpen)}
                                title="Elegir dimensión del mix"
                            >
                                <span>{MIX_DIMENSIONS[mixDimension].label}</span>
                                <ChevronDown size={12} style={{ transition: 'transform 0.2s', transform: mixDropdownOpen ? 'rotate(180deg)' : 'none' }} />
                            </button>

                            {mixDropdownOpen && (
                                <div className="mix-dim-dropdown">
                                    {Object.entries(MIX_DIMENSIONS).map(([key, cfg]) => (
                                        <label key={key} className="comp-option">
                                            <input type="radio" name="mixDimension" value={key}
                                                checked={mixDimension === key}
                                                onChange={() => { setMixDimension(key); setMixDropdownOpen(false); }} />
                                            <span>{cfg.label}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {mixNegocio.totalCargas === 0 ? (
                        <div className="mix-empty">
                            <Package size={28} />
                            <span>Sin cargas en el período consultado</span>
                        </div>
                    ) : (
                    <div style={{ position: 'relative', height: '180px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={mixNegocio.slices}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={75}
                                    paddingAngle={8}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {mixNegocio.slices.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload || !payload.length) return null;
                                        const d = payload[0].payload;
                                        return (
                                            <div className="mix-tooltip">
                                                <strong>{d.name}</strong>
                                                <span>{d.value} {d.value === 1 ? 'carga' : 'cargas'} ({d.percent}%)</span>
                                                <span className="mix-tooltip-amount">{formatCurrency(d.importe)}</span>
                                                {d.categorias && <span className="mix-tooltip-note">Agrupa {d.categorias} categorías</span>}
                                            </div>
                                        );
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            textAlign: 'center',
                            pointerEvents: 'none'
                        }}>
                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                {mixNegocio.totalCargas}
                            </span><br/>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                                {mixNegocio.totalCargas === 1 ? 'CARGA' : 'CARGAS'}
                            </span>
                        </div>
                    </div>
                    )}

                    <div className="summary-legend">
                        {mixNegocio.slices.map((m, i) => (
                            <div key={i} className="legend-card">
                                <div className="legend-info" title={m.name}>
                                    <div className="source-dot" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                    <span className="legend-label">{m.name}</span>
                                </div>
                                <span className="legend-percent">{m.percent}%</span>
                            </div>
                        ))}
                    </div>

                    {mixNegocio.sinCarga > 0 && (
                        <div className="kpi-trend neutral" style={{ justifyContent: 'center', marginTop: '0.75rem' }}>
                            <span className="trend-subtext">
                                {mixNegocio.sinCarga} PR sin carga, no incluidos
                            </span>
                        </div>
                    )}
                </article>

                {/* Top Rutas (Transactions Style) */}
                <article className="bento-card" style={{ gridColumn: 'span 2' }}>
                    <div className="bento-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="bento-title">Rutas de Mayor Tráfico</h3>
                            <div className="help-icon-wrapper">
                                <HelpCircle size={14} />
                                <div className="help-tooltip">
                                    Ranking de trayectos más frecuentes y su participación en el volumen total.
                                </div>
                            </div>
                        </div>
                        <div
                            className="glass-btn"
                            style={{ height: '32px', padding: '0 0.8rem', fontSize: '0.75rem' }}
                            onClick={() => setShowRutasReporte(true)}
                        >
                            Ver Historial
                        </div>
                    </div>
                    
                    <div className="rutas-list">
                        {(() => {
                            const maxTotal = Math.max(...topRutas.map(r => r.total), 1);
                            return topRutas.map((r, i) => {
                                const [origen, destino] = r.ruta.split(' → ');
                                const pct = Math.max((r.total / maxTotal) * 100, 4);
                                const isTop = i === 0;
                                return (
                                    <div className={`ruta-row${isTop ? ' ruta-row--top' : ''}`} key={i}>
                                        <div className="ruta-rank">{i + 1}</div>
                                        <div className="ruta-icon">
                                            <MapPin size={14} />
                                        </div>
                                        <div className="ruta-info">
                                            <div className="ruta-name">
                                                <span>{origen}</span>
                                                <ArrowRight size={12} className="ruta-arrow" />
                                                <span>{destino}</span>
                                            </div>
                                            <div className="ruta-bar-track">
                                                <div className="ruta-bar-fill" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                        <div className="ruta-meta">
                                            <span className="ruta-value">{formatCurrency(r.total)}</span>
                                            <span className="ruta-date">
                                                {r.date ? new Date(r.date).toLocaleDateString() : '-'}
                                            </span>
                                        </div>
                                        <span className={`type-badge${isTop ? ' type-badge--top' : ''}`}>
                                            {r.count >= 3 ? 'Frecuente' : 'Ocasional'}
                                        </span>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </article>

                {/* Conversion Funnel (Embudo de Conversión) */}
                <article className="bento-card" style={{ background: 'linear-gradient(135deg, #1a1b1e 0%, #2c2e33 100%)', color: 'white' }}>
                    <div className="bento-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="bento-title" style={{ color: 'white' }}>Embudo de Conversión</h3>
                            <div className="help-icon-wrapper">
                                <HelpCircle size={14} />
                                <div className="help-tooltip" style={{ background: '#111', color: 'white' }}>
                                    Muestra cuántos registros avanzan en cada etapa del pipeline (conteos) y qué porcentaje del volumen monetario se factura y cobra (tasas). Los colores indican salud: verde ≥70%, ámbar 40–69%, rojo &lt;40%.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pasos del funnel con anchos dinámicos y tasas intermedias */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, marginTop: '0.5rem' }}>
                        {[
                            { label: 'Presupuestos', val: fTotal,    barPct: 100,                                              rate: fRate1, rateLabel: 'PR → Carga' },
                            { label: 'Cargas',       val: fCargas,   barPct: fRate1,                                           rate: fRate2, rateLabel: 'Carga → Factura' },
                            { label: 'Facturas',     val: fFacturas, barPct: fTotal > 0 ? (fFacturas / fTotal) * 100 : 0,     rate: fRate3, rateLabel: 'Factura → Cobro' },
                            { label: 'Cobrados',     val: fCobrados, barPct: fTotal > 0 ? (fCobrados / fTotal) * 100 : 0,     rate: null,   rateLabel: null },
                        ].map((step, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{
                                    width: `${Math.max(step.barPct, 45)}%`,
                                    background: `rgba(255,255,255,${0.17 - i * 0.03})`,
                                    padding: '0.45rem 0.65rem',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    transition: 'width 0.5s ease',
                                }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{step.label}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
                                        {i > 0 && fTotal > 0 && (
                                            <span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.45)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                                {((step.val / fTotal) * 100).toFixed(0)}% del total
                                            </span>
                                        )}
                                        <span style={{ fontSize: '0.78rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{step.val}</span>
                                    </div>
                                </div>
                                {step.rate != null && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '22px', width: '175px' }}>
                                        <div style={{ width: '1px', flexShrink: 0, height: '100%', background: 'rgba(255,255,255,0.15)' }} />
                                        <span style={{ fontSize: '0.67rem', fontWeight: 700, color: fColor(step.rate), width: '28px', textAlign: 'right', flexShrink: 0 }}>
                                            {step.rate.toFixed(0)}%
                                        </span>
                                        <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)' }}>
                                            {step.rateLabel}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Conversión global */}
                    <div style={{ marginTop: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <span style={{ fontSize: '0.58rem', color: '#adb5bd', letterSpacing: '0.07em', fontWeight: 700 }}>CONVERSIÓN GLOBAL (PR → FACTURA)</span>
                            <span style={{ fontWeight: 800, color: fColor(fRateGlobal) }}>{fRateGlobal.toFixed(1)}%</span>
                        </div>
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px' }}>
                            <div style={{ height: '100%', width: `${fRateGlobal}%`, background: fColor(fRateGlobal), borderRadius: '2px', transition: 'width 0.6s ease' }} />
                        </div>
                    </div>

                    {/* Tasas monetarias vs periodo anterior */}
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.58rem', color: '#adb5bd', letterSpacing: '0.07em', fontWeight: 700 }}>
                                TASAS MONETARIAS VS PERIODO ANTERIOR
                            </span>
                            <div className="help-icon-wrapper" style={{ color: 'rgba(255,255,255,0.35)', lineHeight: 0 }}>
                                <HelpCircle size={11} />
                                <div className="help-tooltip" style={{ background: '#111', color: 'white', width: '230px', whiteSpace: 'normal' }}>
                                    <strong>Facturación %:</strong> del total operado en el período, cuánto fue convertido a factura.<br/><br/>
                                    <strong>Cobranza %:</strong> del total facturado, cuánto fue efectivamente cobrado.<br/><br/>
                                    Los <strong>pp</strong> (puntos porcentuales) indican la diferencia vs el período de comparación seleccionado arriba.
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {[
                                { label: 'Facturación', curr: fCurrFact,  delta: fDeltaFact },
                                { label: 'Cobranza',    curr: currCobPct, delta: trendCobrabilidad },
                            ].map(({ label, curr, delta }) => (
                                <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.5rem 0.6rem' }}>
                                    <div style={{ fontSize: '0.6rem', color: '#adb5bd', marginBottom: '0.2rem' }}>{label}</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                        <span style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                                            {curr != null ? `${curr.toFixed(1)}%` : '—'}
                                        </span>
                                        {delta != null ? (
                                            <span style={{ fontSize: '0.63rem', fontWeight: 700, color: delta >= 0 ? '#10b981' : '#ef4444' }}>
                                                {delta >= 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(1)} pp
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)' }}>sin comp.</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </article>

            </div>

            {showRutasReporte && (
                <RutasReporteModal
                    searchCriteria={searchCriteria}
                    empresaFiltro={empresaFiltro}
                    onClose={() => setShowRutasReporte(false)}
                />
            )}

            {showMonthlyReporte && (
                <MonthlyReporteModal
                    data={monthlyReportData}
                    displayCurrency={displayCurrency}
                    empresaFiltro={empresaFiltro}
                    onClose={() => setShowMonthlyReporte(false)}
                />
            )}
        </div>
    );
};

export default AnalyticsDashboard;
