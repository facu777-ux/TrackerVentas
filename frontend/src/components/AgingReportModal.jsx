import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, ChevronDown, AlertTriangle, Clock, Users, TrendingUp, AlertCircle, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RcTooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';
import { agingAPI } from '../services/api';
import logoMultimodal from '../assets/Fondo sistema MULTIMODAL.jpg';
import logoFlota      from '../assets/Fondo sistema FLOTA.jpg';
import logoDibiagi    from '../assets/Fondo sistema DTI.jpg';
import './AgingReportModal.css';

const EMPRESAS = [
    { value: null,      label: 'Todas las empresas' },
    { value: 'MULTIM',  label: 'Multimodal S.A.C.I.A.' },
    { value: 'DIBIAG',  label: 'DIBIAGI Transporte Internacional S.A.' },
];

const VISTAS = [
    { value: 'todas',    label: 'Todas las secciones' },
    { value: 'top10',    label: 'Top 10 Clientes Deudores' },
    { value: 'cargas',   label: 'Cargas sin Facturar' },
    { value: 'facturas', label: 'Facturas sin Cobrar' },
];

const LOGOS = {
    MULTIM: logoMultimodal,
    FP:     logoFlota,
    DIBIAG: logoDibiagi,
};

const BRACKETS = [
    { key: 'd0_30',   label: '0–30 días'   },
    { key: 'd31_60',  label: '31–60 días'  },
    { key: 'd61_90',  label: '61–90 días'  },
    { key: 'd91_120', label: '91–120 días' },
    { key: 'dMas120', label: '+120 días'   },
];

const fmt = (n) =>
    n === 0 ? '—' :
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const fmtFull = (n) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const estadoBadge = (estado) => {
    const map = {
        CRITICO:  { label: 'Crítico',   cls: 'badge-critico'  },
        ALERTA:   { label: 'Alerta',    cls: 'badge-alerta'   },
        ATENCION: { label: 'Atención',  cls: 'badge-atencion' },
        NORMAL:   { label: 'Normal',    cls: 'badge-normal'   },
    };
    const e = map[estado] || map.NORMAL;
    return <span className={`aging-badge ${e.cls}`}>{e.label}</span>;
};

const bracketClass = (key) => {
    const map = { d0_30: '', d31_60: 'col-amarillo', d61_90: 'col-naranja', d91_120: 'col-rojo', dMas120: 'col-critico' };
    return map[key] || '';
};

const InfoTooltip = ({ text }) => {
    const [visible, setVisible] = useState(false);
    return (
        <span className="info-tooltip-wrap">
            <button
                className="info-tooltip-btn"
                onMouseEnter={() => setVisible(true)}
                onMouseLeave={() => setVisible(false)}
                onFocus={() => setVisible(true)}
                onBlur={() => setVisible(false)}
                tabIndex={0}
                type="button"
            >
                ?
            </button>
            {visible && <div className="info-tooltip-box">{text}</div>}
        </span>
    );
};

const AginTable = ({ titulo, tooltip, seccion, formatAmt = fmt, formatAmtFull = fmtFull, currencyLabel = 'ARS' }) => {
    if (!seccion || seccion.clientes.length === 0) return (
        <div className="aging-section">
            <h3 className="section-title">
                {titulo}
                {tooltip && <InfoTooltip text={tooltip} />}
            </h3>
            <p className="section-empty">Sin registros pendientes.</p>
        </div>
    );

    return (
        <div className="aging-section">
            <h3 className="section-title">
                {titulo}
                {tooltip && <InfoTooltip text={tooltip} />}
            </h3>
            <div className="aging-table-wrap">
                <table className="aging-table">
                    <thead>
                        <tr>
                            <th className="col-cliente">Cliente</th>
                            {BRACKETS.map(b => (
                                <th key={b.key} className={`col-bracket ${bracketClass(b.key)}`}>{b.label}</th>
                            ))}
                            <th className="col-total">Total <span className="col-currency-tag">{currencyLabel}</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {seccion.clientes.map((c, i) => (
                            <tr key={i} className={c.diasMax > 90 ? 'row-critica' : ''}>
                                <td className="col-cliente">
                                    <span className="cliente-nombre">{c.nombre}</span>
                                    {c.empresa && <span className="cliente-emp">{c.empresa}</span>}
                                </td>
                                {BRACKETS.map(b => (
                                    <td key={b.key} className={`col-bracket ${bracketClass(b.key)} ${c[b.key] > 0 ? 'has-value' : ''}`}>
                                        {formatAmt(c[b.key])}
                                    </td>
                                ))}
                                <td className="col-total bold">{formatAmtFull(c.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="row-totales">
                            <td className="col-cliente">SUBTOTAL</td>
                            {BRACKETS.map(b => (
                                <td key={b.key} className={`col-bracket ${bracketClass(b.key)}`}>
                                    {formatAmt(seccion.totalesColumna[b.key])}
                                </td>
                            ))}
                            <td className="col-total bold">{formatAmtFull(seccion.totalGeneral)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

const AgingReportModal = ({ onClose, onClienteSelect }) => {
    const [empresa, setEmpresa]         = useState(null);
    const [vista, setVista]             = useState('todas');
    const [data, setData]               = useState(null);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState(null);
    const [dropOpen, setDropOpen]       = useState(false);
    const [vistaDropOpen, setVistaDrop] = useState(false);
    const [currency, setCurrency]       = useState('ARS');
    const [rates, setRates]             = useState({ bna: 1415, sii: 950 });
    const printRef                      = useRef(null);

    const fetchData = useCallback(async (emp) => {
        setLoading(true);
        setError(null);
        try {
            const result = await agingAPI.obtenerAging(emp);
            if (result.success) setData(result);
            else setError('Error al cargar los datos');
        } catch {
            setError('No se pudo conectar con el servidor');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(empresa); }, [empresa, fetchData]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => {
        const fetchRates = async () => {
            const [bnaRes, siiRes] = await Promise.allSettled([
                fetch('/api/exchange/bna').then(r => r.json()),
                fetch('/api/exchange/sii').then(r => r.json()),
            ]);
            setRates({
                bna: bnaRes.status === 'fulfilled' && bnaRes.value?.venta
                    ? bnaRes.value.venta : 1415,
                sii: siiRes.status === 'fulfilled' && siiRes.value?.serie?.[0]?.valor
                    ? siiRes.value.serie[0].valor : 950,
            });
        };
        fetchRates();
    }, []);

    const convert = (n) => {
        if (currency === 'USD_BNA') return (n || 0) / rates.bna;
        if (currency === 'USD_SII') return (n || 0) / rates.sii;
        return n || 0;
    };

    const fmtAmt = (n) => {
        if ((n || 0) === 0) return '—';
        const val = convert(n);
        if (currency === 'ARS') return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
        return 'USD ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(val));
    };

    const fmtAmtFull = (n) => {
        const val = convert(n);
        if (currency === 'ARS') return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
        return 'USD ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(val));
    };

    const currencyLabel = currency === 'ARS' ? 'ARS' : 'USD';
    const rateHint = currency === 'USD_BNA'
        ? `T/C: $${rates.bna.toLocaleString('es-AR')}`
        : currency === 'USD_SII'
        ? `T/C: $${rates.sii.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null;

    const agingChartFmt = (n) => {
        if (!n) return currency === 'ARS' ? '$ 0' : 'USD 0';
        if (currency === 'ARS') return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
        return 'USD ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n));
    };

    const yAxisFmt = (n) => {
        if (n === 0) return '0';
        if (currency === 'ARS') {
            if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
            if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
            return `$${n}`;
        }
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
        return String(n);
    };

    const chartData = data ? BRACKETS.map(b => ({
        name: b.label,
        cargas:   Math.round(convert(data.cargasSinFacturar?.totalesColumna[b.key]  || 0)),
        facturas: Math.round(convert(data.facturasSinCobrar?.totalesColumna[b.key]  || 0)),
    })) : [];

    const handlePrint = () => window.print();

    const handleExportExcel = () => {
        if (!data) return;

        // Aplica formato numérico con separador de miles a todas las celdas numéricas de la hoja
        const applyNumFmt = (ws, fmt = '#,##0') => {
            Object.keys(ws).forEach(addr => {
                if (addr[0] === '!' || !ws[addr]) return;
                if (ws[addr].t === 'n') ws[addr].z = fmt;
            });
        };

        const wb = XLSX.utils.book_new();
        const currencyNote = currency === 'ARS'
            ? 'ARS (Pesos Argentinos)'
            : currency === 'USD_BNA'
            ? `USD — Tipo de cambio BNA: $${rates.bna.toLocaleString('es-AR')}`
            : `USD — Tipo de cambio SII: $${rates.sii.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

        const cv = (n) => Math.round(convert(n || 0));

        // ── Hoja 1: Resumen KPIs ──
        const wsKpisData = [
            ['REPORTE DE AGING — DIBIAGI / MULTIMODAL'],
            ['Generado:', new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })],
            ['Empresa:', empresaLabel],
            ['Moneda:', currencyNote],
            [],
            ['Indicador', 'Valor', 'Unidad'],
            ['Exposición Total',       cv(kpis.exposicionTotal),  currencyLabel],
            ['Clientes Afectados',     kpis.clientesAfectados,    'clientes'],
            ['Antigüedad Máxima',      kpis.antigüedadMaxima,     'días'],
            ['Monto Crítico (+90 días)', cv(kpis.montoCritico),   currencyLabel],
            ['% Crítico',              kpis.porcentajeCritico,    '%'],
        ];
        const wsKpis = XLSX.utils.aoa_to_sheet(wsKpisData);
        wsKpis['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 14 }];
        applyNumFmt(wsKpis);
        XLSX.utils.book_append_sheet(wb, wsKpis, 'KPIs');

        // ── Hoja 2: Top 10 Deudores ──
        const top10Rows = top10.map((d, i) => [
            i + 1, d.nombre, d.empresa, cv(d.total), d.diasMax, d.estado,
        ]);
        const wsTop10 = XLSX.utils.aoa_to_sheet([
            ['#', 'Cliente', 'Empresa', `Deuda Total (${currencyLabel})`, 'Antigüedad (días)', 'Estado'],
            ...top10Rows,
        ]);
        wsTop10['!cols'] = [{ wch: 4 }, { wch: 42 }, { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 10 }];
        applyNumFmt(wsTop10);
        XLSX.utils.book_append_sheet(wb, wsTop10, 'Top 10 Deudores');

        // helper para hojas de aging
        const buildAgingSheet = (seccion) => {
            if (!seccion?.clientes?.length) return null;
            const hdr = [
                'Cliente', 'Empresa',
                `0–30 días (${currencyLabel})`, `31–60 días (${currencyLabel})`,
                `61–90 días (${currencyLabel})`, `91–120 días (${currencyLabel})`,
                `+120 días (${currencyLabel})`,  `Total (${currencyLabel})`,
            ];
            const rows = seccion.clientes.map(c => [
                c.nombre, c.empresa,
                cv(c.d0_30), cv(c.d31_60), cv(c.d61_90), cv(c.d91_120), cv(c.dMas120), cv(c.total),
            ]);
            const tot = seccion.totalesColumna;
            rows.push([
                'SUBTOTAL', '',
                cv(tot.d0_30), cv(tot.d31_60), cv(tot.d61_90), cv(tot.d91_120), cv(tot.dMas120),
                cv(seccion.totalGeneral),
            ]);
            const ws = XLSX.utils.aoa_to_sheet([hdr, ...rows]);
            ws['!cols'] = [{ wch: 42 }, { wch: 10 }, ...Array(6).fill({ wch: 18 })];
            applyNumFmt(ws);
            return ws;
        };

        // ── Hoja 3: Cargas sin Facturar ──
        const wsCargasData = buildAgingSheet(data.cargasSinFacturar);
        if (wsCargasData) XLSX.utils.book_append_sheet(wb, wsCargasData, 'Cargas sin Facturar');

        // ── Hoja 4: Facturas sin Cobrar ──
        const wsFacturasData = buildAgingSheet(data.facturasSinCobrar);
        if (wsFacturasData) XLSX.utils.book_append_sheet(wb, wsFacturasData, 'Facturas sin Cobrar');

        const fechaHoy = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Aging_${empresa || 'Todas'}_${fechaHoy}.xlsx`);
    };

    const empresaLabel = EMPRESAS.find(e => e.value === empresa)?.label ?? 'Todas las empresas';
    const vistaLabel   = VISTAS.find(v => v.value === vista)?.label ?? 'Todas las secciones';
    const logoSrc = empresa ? LOGOS[empresa] : null;

    const fechaStr = new Date().toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    });

    const kpis = data?.kpis;
    const top10 = data?.top10Deudores ?? [];

    return createPortal(
        <div className="aging-overlay" onClick={onClose}>
            <div className="aging-modal" onClick={e => e.stopPropagation()} ref={printRef}>

                {/* ── CABECERA ── */}
                <div className="aging-header no-print-hide">
                    <div className="header-left">
                        <h2 className="modal-title">Reporte de Aging</h2>
                        <span className="modal-subtitle">Generado: {fechaStr}</span>
                    </div>
                    <div className="header-controls">
                        {/* Selector de vista */}
                        <div className="empresa-selector">
                            <button className="empresa-btn" onClick={() => { setVistaDrop(o => !o); setDropOpen(false); }}>
                                <span className="empresa-btn-text">{vistaLabel}</span>
                                <ChevronDown size={14} className={vistaDropOpen ? 'rotated' : ''} />
                            </button>
                            {vistaDropOpen && (
                                <ul className="empresa-dropdown">
                                    {VISTAS.map(v => (
                                        <li
                                            key={v.value}
                                            className={vista === v.value ? 'active' : ''}
                                            onClick={() => { setVista(v.value); setVistaDrop(false); }}
                                        >
                                            {v.label}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        {/* Selector empresa */}
                        <div className="empresa-selector">
                            <button className="empresa-btn" onClick={() => { setDropOpen(o => !o); setVistaDrop(false); }}>
                                <span className="empresa-btn-text">{empresaLabel}</span>
                                <ChevronDown size={14} className={dropOpen ? 'rotated' : ''} />
                            </button>
                            {dropOpen && (
                                <ul className="empresa-dropdown">
                                    {EMPRESAS.map(e => (
                                        <li
                                            key={String(e.value)}
                                            className={empresa === e.value ? 'active' : ''}
                                            onClick={() => { setEmpresa(e.value); setDropOpen(false); }}
                                        >
                                            {e.label}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="aging-currency-switcher">
                            <button className={`acs-tab ${currency === 'ARS' ? 'active' : ''}`} onClick={() => setCurrency('ARS')}>ARS</button>
                            <button className={`acs-tab ${currency === 'USD_BNA' ? 'active' : ''}`} onClick={() => setCurrency('USD_BNA')}>USD BNA</button>
                            <button className={`acs-tab ${currency === 'USD_SII' ? 'active' : ''}`} onClick={() => setCurrency('USD_SII')}>USD SII</button>
                        </div>
                        {rateHint && <span className="aging-rate-hint">{rateHint}</span>}
                        <button className="btn-excel" onClick={handleExportExcel} title="Exportar a Excel" disabled={!data}>
                            <Download size={16} />
                            <span>Excel</span>
                        </button>
                        <button className="btn-print" onClick={handlePrint} title="Imprimir / Exportar PDF">
                            <Printer size={16} />
                            <span>PDF</span>
                        </button>
                        <button className="btn-close-aging" onClick={onClose}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* ── CABECERA SOLO IMPRESIÓN ── */}
                <div className="print-header print-only">
                    <div className="print-logo-text">{empresaLabel}</div>
                    <div className="print-meta">
                        <h1>Reporte de Aging</h1>
                        <p>{empresaLabel} — {fechaStr}</p>
                    </div>
                </div>

                {/* ── CONTENIDO ── */}
                <div className="aging-body">
                    {loading && (
                        <div className="aging-loader">
                            <div className="spinner" />
                            <p>Calculando aging…</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="aging-error">
                            <AlertCircle size={32} />
                            <p>{error}</p>
                        </div>
                    )}

                    {!loading && !error && data && (
                        <>
                            {/* KPIs */}
                            <div className="kpi-grid">
                                <div className="kpi-card">
                                    <TrendingUp size={18} className="kpi-icon" />
                                    <span className="kpi-label">Exposición Total <span className="kpi-currency">{currencyLabel}</span></span>
                                    <span className="kpi-value">{fmtAmtFull(kpis.exposicionTotal)}</span>
                                </div>
                                <div className="kpi-card">
                                    <Users size={18} className="kpi-icon" />
                                    <span className="kpi-label">Clientes Afectados</span>
                                    <span className="kpi-value">{kpis.clientesAfectados}</span>
                                </div>
                                <div className="kpi-card">
                                    <Clock size={18} className="kpi-icon" />
                                    <span className="kpi-label">Antigüedad Máxima</span>
                                    <span className="kpi-value">{kpis.antigüedadMaxima} días</span>
                                </div>
                                <div className="kpi-card kpi-critico">
                                    <AlertTriangle size={18} className="kpi-icon" />
                                    <span className="kpi-label">Crítico (+90 días) <span className="kpi-currency">{currencyLabel}</span></span>
                                    <span className="kpi-value">{fmtAmtFull(kpis.montoCritico)}</span>
                                    <div className="kpi-bar-wrap">
                                        <div className="kpi-bar" style={{ width: `${kpis.porcentajeCritico}%` }} />
                                        <span className="kpi-pct">{kpis.porcentajeCritico}%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Gráfico de distribución */}
                            {(vista === 'todas' || vista === 'cargas' || vista === 'facturas') && (
                                <div className="aging-chart-section">
                                    <h3 className="section-title">
                                        Distribución por Antigüedad
                                        <InfoTooltip text="Monto total pendiente distribuido en los cinco rangos de antigüedad. Las barras apiladas muestran la composición entre cargas sin facturar (naranja) y facturas sin cobrar (índigo) para cada tramo." />
                                    </h3>
                                    <ResponsiveContainer width="100%" height={210}>
                                        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }} barCategoryGap="32%">
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                                                axisLine={false}
                                                tickLine={false}
                                                tickFormatter={yAxisFmt}
                                                width={62}
                                            />
                                            <RcTooltip
                                                contentStyle={{ background: '#1e293b', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', fontSize: '0.75rem' }}
                                                labelStyle={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '4px' }}
                                                itemStyle={{ color: '#cbd5e1' }}
                                                formatter={(value, name) => [agingChartFmt(value), name]}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px', color: 'var(--text-secondary)' }} />
                                            {(vista === 'todas' || vista === 'cargas') && (
                                                <Bar dataKey="cargas" name="Sin Facturar" stackId="a" fill="#f59e0b" />
                                            )}
                                            {(vista === 'todas' || vista === 'facturas') && (
                                                <Bar dataKey="facturas" name="Sin Cobrar" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                            )}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Top 10 deudores */}
                            {top10.length > 0 && (vista === 'todas' || vista === 'top10') && (
                                <div className="aging-section top10-section">
                                    <h3 className="section-title danger">
                                        Top {top10.length} Clientes Deudores
                                        <InfoTooltip text="Clientes con mayor deuda total acumulada entre cargas sin facturar y facturas sin cobrar. El estado refleja la antigüedad máxima de sus pendientes. Hacé clic en cualquier fila para ver todos sus registros en el dashboard." />
                                    </h3>
                                    <div className="aging-table-wrap">
                                        <table className="aging-table">
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>Cliente</th>
                                                    <th>Empresa</th>
                                                    <th>Deuda Total <span className="col-currency-tag">{currencyLabel}</span></th>
                                                    <th>Antigüedad</th>
                                                    <th>Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {top10.map((d, i) => (
                                                    <tr
                                                        key={i}
                                                        className={`${d.estado === 'CRITICO' ? 'row-critica' : ''} ${onClienteSelect ? 'row-clickable' : ''}`}
                                                        onClick={() => onClienteSelect && (onClienteSelect(d.nombre), onClose())}
                                                        title={onClienteSelect ? `Buscar registros de ${d.nombre}` : undefined}
                                                    >
                                                        <td className="rank">{i + 1}</td>
                                                        <td className="col-cliente"><span className="cliente-nombre">{d.nombre}</span></td>
                                                        <td>{d.empresa}</td>
                                                        <td className="bold">{fmtAmtFull(d.total)}</td>
                                                        <td>{d.diasMax} días</td>
                                                        <td>{estadoBadge(d.estado)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Tablas de aging */}
                            {(vista === 'todas' || vista === 'cargas') &&
                                <AginTable
                                    titulo="Cargas sin Facturar"
                                    tooltip="Servicios de transporte realizados que aún no tienen factura emitida. La antigüedad se calcula desde la fecha de alta de cada carga. Cada columna agrupa el monto total según cuántos días llevan sin facturar. Representa riesgo de ingreso no capturado."
                                    seccion={data.cargasSinFacturar}
                                    formatAmt={fmtAmt}
                                    formatAmtFull={fmtAmtFull}
                                    currencyLabel={currencyLabel}
                                />}
                            {(vista === 'todas' || vista === 'facturas') &&
                                <AginTable
                                    titulo="Facturas sin Cobrar"
                                    tooltip="Facturas emitidas que no registran un recibo de cobranza. La antigüedad se calcula desde la fecha de emisión de la factura. Cada columna agrupa el monto total según cuántos días llevan sin cobrar. Representa deuda pendiente de clientes."
                                    seccion={data.facturasSinCobrar}
                                    formatAmt={fmtAmt}
                                    formatAmtFull={fmtAmtFull}
                                    currencyLabel={currencyLabel}
                                />}

                            {/* Total general — solo en vista completa */}
                            {vista === 'todas' && (
                                <div className="total-general-row">
                                    <span>TOTAL GENERAL <span className="col-currency-tag">{currencyLabel}</span></span>
                                    <span>{fmtAmtFull((data.cargasSinFacturar?.totalGeneral ?? 0) + (data.facturasSinCobrar?.totalGeneral ?? 0))}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default AgingReportModal;
