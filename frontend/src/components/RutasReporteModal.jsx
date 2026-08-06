import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import * as XLSX from 'xlsx';
import {
    FaTimes, FaRoute, FaCalendarAlt, FaSearch, FaFileExcel, FaExchangeAlt, FaExternalLinkAlt,
    FaSortUp, FaSortDown, FaSort, FaCheckCircle, FaExclamationTriangle, FaTimesCircle, FaQuestionCircle,
} from 'react-icons/fa';
import { format } from 'date-fns';
import { seguimientoAPI } from '../services/api';
import './DetailModal.css';
import './RutasReporteModal.css';

// Orden de criticidad para agrupar (de más a menos relevante)
const CLASIFICACION_RANK = {
    'RUTA CRÍTICA': 0,
    'RUTA IMPORTANTE': 1,
    'RUTA ACTIVA': 2,
    'RUTA HISTÓRICA (sin operación reciente)': 3,
};

const clasificacionColor = (clasificacion) => {
    if (clasificacion === 'RUTA CRÍTICA') return { bg: 'rgba(220,80,80,0.15)', color: '#e05252' };
    if (clasificacion === 'RUTA IMPORTANTE') return { bg: 'rgba(217,119,6,0.15)', color: '#d97706' };
    if (clasificacion === 'RUTA ACTIVA') return { bg: 'rgba(59,109,17,0.15)', color: '#5a9e1f' };
    return { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' };
};

const disponibilidadLabel = (grupo) => {
    if (grupo === 'Ruta activa') return '● Con historial de km';
    if (grupo === 'Ruta nueva') return '● Sin historial de km';
    return '● Sin actividad en el período';
};

// El backend antepone un emoji al texto (✅/⚠️/❌) que a veces no viaja bien por la
// conexión; se ignora y se clasifica únicamente por el contenido textual.
const calidadDatoInfo = (texto) => {
    if (!texto) return null;
    if (texto.includes('Completo')) return { icon: FaCheckCircle, color: '#5a9e1f', label: texto.replace(/^\W+/, '') };
    if (texto.includes('Incompleto')) return { icon: FaExclamationTriangle, color: '#d97706', label: texto.replace(/^\W+/, '') };
    return { icon: FaTimesCircle, color: '#e05252', label: texto.replace(/^\W+/, '') };
};

const COLUMNS = [
    { key: 'TramoCompleto', label: 'Ruta' },
    { key: 'Clasificacion', label: 'Clasificación' },
    { key: 'OperacionesEnPeriodo', label: 'OP/Cargas en período' },
    { key: 'ImporteEnPeriodo', label: 'Importe período' },
    { key: 'KmsPromedio', label: 'Km prom.' },
    { key: 'CalidadDato', label: 'Calidad de dato' },
    { key: 'UltimoViaje', label: 'Último viaje' },
];

const RutasReporteModal = ({ searchCriteria, empresaFiltro, onClose, standalone = false }) => {
    const [rutas, setRutas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchOrigen, setSearchOrigen] = useState('');
    const [searchDestino, setSearchDestino] = useState('');
    const [sortKey, setSortKey] = useState('ImporteEnPeriodo');
    const [sortDir, setSortDir] = useState('desc');
    const [showCalidadHelp, setShowCalidadHelp] = useState(false);
    const calidadHelpRef = useRef(null);

    useEffect(() => {
        if (standalone) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [standalone]);

    useEffect(() => {
        if (!showCalidadHelp) return;
        const handleClickOutside = (e) => {
            if (calidadHelpRef.current && !calidadHelpRef.current.contains(e.target)) {
                setShowCalidadHelp(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showCalidadHelp]);

    useEffect(() => {
        if (!searchCriteria?.fechaDesde || !searchCriteria?.fechaHasta) return;
        setLoading(true);
        setError(null);
        seguimientoAPI.getRutasReporte(searchCriteria.fechaDesde, searchCriteria.fechaHasta, empresaFiltro)
            .then(res => { setRutas(res.data || []); })
            .catch(err => { setError(err.message || 'Error al cargar el reporte de rutas'); })
            .finally(() => setLoading(false));
    }, [searchCriteria?.fechaDesde, searchCriteria?.fechaHasta, empresaFiltro]);

    const formatFecha = (fecha) => {
        if (!fecha) return '-';
        try { return format(new Date(fecha), 'dd/MM/yyyy'); }
        catch { return '-'; }
    };

    const formatNum = (v, decimals = 0) => {
        if (v == null) return '-';
        return Number(v).toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    // Origen/destino de cada fila (con fallback al TramoCompleto "A -> B" si faltan los campos)
    const origenDe = (r) => (r.Origen || (r.TramoCompleto || '').split(' -> ')[0] || '').trim();
    const destinoDe = (r) => (r.Destino || (r.TramoCompleto || '').split(' -> ')[1] || '').trim();

    // Sugerencias de autocompletado: cada lista se acota según lo tipeado en el otro campo
    const { origenOptions, destinoOptions } = useMemo(() => {
        const termO = searchOrigen.trim().toLowerCase();
        const termD = searchDestino.trim().toLowerCase();
        const origenes = new Set();
        const destinos = new Set();
        rutas.forEach(r => {
            const o = origenDe(r);
            const d = destinoDe(r);
            if (o && (!termD || d.toLowerCase().includes(termD))) origenes.add(o);
            if (d && (!termO || o.toLowerCase().includes(termO))) destinos.add(d);
        });
        const sorted = (s) => Array.from(s).sort((a, b) => a.localeCompare(b));
        return { origenOptions: sorted(origenes), destinoOptions: sorted(destinos) };
    }, [rutas, searchOrigen, searchDestino]);

    const grupos = useMemo(() => {
        const termO = searchOrigen.trim().toLowerCase();
        const termD = searchDestino.trim().toLowerCase();
        const filtered = (termO || termD)
            ? rutas.filter(r =>
                (!termO || origenDe(r).toLowerCase().includes(termO)) &&
                (!termD || destinoDe(r).toLowerCase().includes(termD)))
            : rutas;

        const byGroup = new Map();
        filtered.forEach(r => {
            const key = r.Clasificacion || 'Sin clasificar';
            if (!byGroup.has(key)) byGroup.set(key, []);
            byGroup.get(key).push(r);
        });

        const sortRows = (rows) => {
            const sorted = [...rows].sort((a, b) => {
                let av = a[sortKey];
                let bv = b[sortKey];
                if (sortKey === 'TramoCompleto') {
                    av = (av || '').toLowerCase();
                    bv = (bv || '').toLowerCase();
                    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
                }
                if (sortKey === 'UltimoViaje') {
                    av = av ? new Date(av).getTime() : 0;
                    bv = bv ? new Date(bv).getTime() : 0;
                } else {
                    av = av == null ? -Infinity : Number(av);
                    bv = bv == null ? -Infinity : Number(bv);
                }
                return sortDir === 'asc' ? av - bv : bv - av;
            });
            return sorted;
        };

        // Un grupo puede mezclar monedas (US$ y ARS): se totaliza por separado por moneda
        const totalesPorMoneda = (rows) => {
            const totales = new Map();
            rows.forEach(r => {
                const importe = Number(r.ImporteEnPeriodo) || 0;
                if (!importe) return;
                const sim = r.SimboloMoneda || 'ARS';
                totales.set(sim, (totales.get(sim) || 0) + importe);
            });
            return Array.from(totales.entries())
                .sort(([, a], [, b]) => b - a)
                .map(([moneda, total]) => ({ moneda, total }));
        };

        return Array.from(byGroup.entries())
            .sort(([a], [b]) => (CLASIFICACION_RANK[a] ?? 99) - (CLASIFICACION_RANK[b] ?? 99))
            .map(([nombre, rows]) => ({
                nombre,
                rows: sortRows(rows),
                count: rows.length,
                totales: totalesPorMoneda(rows),
            }));
    }, [rutas, searchOrigen, searchDestino, sortKey, sortDir]);

    const totalFiltradas = grupos.reduce((s, g) => s + g.count, 0);

    const handleExportExcel = () => {
        const rowsFlat = grupos.flatMap(g => g.rows);
        if (!rowsFlat.length) return;

        const header = [
            'Ruta', 'Clasificación', 'Disponibilidad de datos', 'OP/Cargas en período',
            'Moneda', 'Importe período', 'Km prom.', 'Calidad de dato', 'Último viaje',
        ];
        const rows = rowsFlat.map(r => ([
            r.TramoCompleto,
            r.Clasificacion,
            r.GrupoDisponibilidad,
            r.OperacionesEnPeriodo ?? 0,
            r.SimboloMoneda || (Number(r.ImporteEnPeriodo) ? 'ARS' : ''),
            Number(r.ImporteEnPeriodo) || 0,
            r.KmsPromedio ?? '',
            (r.CalidadDato || '').replace(/^\W+/, ''),
            formatFecha(r.UltimoViaje),
        ]));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        ws['!cols'] = [
            { wch: 34 }, { wch: 20 }, { wch: 24 }, { wch: 14 },
            { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 30 }, { wch: 14 },
        ];
        Object.keys(ws).forEach(addr => {
            if (addr[0] === '!' || !ws[addr]) return;
            if (ws[addr].t === 'n') ws[addr].z = '#,##0';
        });
        XLSX.utils.book_append_sheet(wb, ws, 'Historial de Rutas');

        const fechaHoy = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Rutas_${empresaFiltro || 'Todas'}_${fechaHoy}.xlsx`);
    };

    const sortIconFor = (key) => {
        if (sortKey !== key) return <FaSort className="sort-icon" />;
        return sortDir === 'asc'
            ? <FaSortUp className="sort-icon active" />
            : <FaSortDown className="sort-icon active" />;
    };

    const handleOpenNewTab = () => {
        const params = new URLSearchParams({
            reporte: 'rutas',
            fechaDesde: searchCriteria.fechaDesde,
            fechaHasta: searchCriteria.fechaHasta,
        });
        if (empresaFiltro) params.set('empresa', empresaFiltro);
        window.open(`${window.location.pathname}?${params.toString()}`, '_blank');
    };

    const periodoLabel = searchCriteria?.fechaDesde && searchCriteria?.fechaHasta
        ? `${formatFecha(searchCriteria.fechaDesde)} — ${formatFecha(searchCriteria.fechaHasta)}${empresaFiltro ? ` · ${empresaFiltro}` : ''}`
        : null;

    const reporteBody = (
        <div className="ux-tab-content" style={{ padding: standalone ? '0' : '0.5rem 2rem 2rem' }}>
                        {loading && (
                            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                Cargando reporte de rutas...
                            </div>
                        )}
                        {error && !loading && (
                            <div style={{ color: 'var(--error)', padding: '1rem', fontSize: '0.9rem' }}>
                                Error: {error}
                            </div>
                        )}
                        {!loading && !error && rutas.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                No se encontraron rutas para el período consultado.
                            </div>
                        )}
                        {!loading && !error && rutas.length > 0 && (
                            <>
                                <div className="rutas-toolbar">
                                    <div className="rutas-search-group">
                                        <div className="rutas-search">
                                            <FaSearch />
                                            <input
                                                type="text"
                                                list="rutas-origen-options"
                                                placeholder="Origen..."
                                                value={searchOrigen}
                                                onChange={e => setSearchOrigen(e.target.value)}
                                            />
                                            <datalist id="rutas-origen-options">
                                                {origenOptions.map(o => <option key={o} value={o} />)}
                                            </datalist>
                                        </div>
                                        <button
                                            className="rutas-swap-btn"
                                            title="Intercambiar origen y destino"
                                            onClick={() => { setSearchOrigen(searchDestino); setSearchDestino(searchOrigen); }}
                                        >
                                            <FaExchangeAlt />
                                        </button>
                                        <div className="rutas-search">
                                            <FaSearch />
                                            <input
                                                type="text"
                                                list="rutas-destino-options"
                                                placeholder="Destino..."
                                                value={searchDestino}
                                                onChange={e => setSearchDestino(e.target.value)}
                                            />
                                            <datalist id="rutas-destino-options">
                                                {destinoOptions.map(d => <option key={d} value={d} />)}
                                            </datalist>
                                        </div>
                                        {(searchOrigen || searchDestino) && (
                                            <button
                                                className="rutas-clear-btn"
                                                title="Limpiar búsqueda"
                                                onClick={() => { setSearchOrigen(''); setSearchDestino(''); }}
                                            >
                                                <FaTimes /> Limpiar
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <span className="rutas-result-count">
                                            {totalFiltradas} de {rutas.length} rutas
                                        </span>
                                        <button className="btn-excel" onClick={handleExportExcel} title="Exportar a Excel">
                                            <FaFileExcel /> Exportar
                                        </button>
                                    </div>
                                </div>

                                {totalFiltradas === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                        Ninguna ruta coincide con {[searchOrigen && `origen "${searchOrigen}"`, searchDestino && `destino "${searchDestino}"`].filter(Boolean).join(' y ')}.
                                    </div>
                                ) : (
                                    <div className="items-table-container" style={{ overflowX: 'auto' }}>
                                        <table className="mini-table">
                                            <thead>
                                                <tr>
                                                    {COLUMNS.map(col => (
                                                        <th
                                                            key={col.key}
                                                            className="sortable"
                                                            onClick={() => handleSort(col.key)}
                                                            style={col.key === 'CalidadDato' ? { position: 'relative' } : undefined}
                                                        >
                                                            <span className="th-inner">
                                                                {col.label}
                                                                {sortIconFor(col.key)}
                                                                {col.key === 'CalidadDato' && (
                                                                    <span
                                                                        className="th-help"
                                                                        ref={calidadHelpRef}
                                                                        onClick={(e) => { e.stopPropagation(); setShowCalidadHelp(v => !v); }}
                                                                    >
                                                                        <FaQuestionCircle />
                                                                        {showCalidadHelp && (
                                                                            <div className="th-help-popover" onClick={e => e.stopPropagation()}>
                                                                                <p>
                                                                                    Indica qué porcentaje de las operaciones (OP/cargas) del tramo, en el
                                                                                    período consultado, tienen <strong>kilómetros reales registrados</strong> (a
                                                                                    diferencia de un tramo sin datos de km cargados).
                                                                                </p>
                                                                                <ul>
                                                                                    <li>
                                                                                        <FaCheckCircle style={{ color: '#5a9e1f' }} /> <strong>Completo (100% con kms reales):</strong> todas
                                                                                        las OP del período tienen km real cargado. Los promedios de km del tramo son confiables.
                                                                                    </li>
                                                                                    <li>
                                                                                        <FaExclamationTriangle style={{ color: '#d97706' }} /> <strong>Incompleto (faltan N OP):</strong> N
                                                                                        operaciones del período no tienen km cargado; el promedio se calcula solo con las que sí lo tienen,
                                                                                        por lo que puede no representar el 100% del volumen.
                                                                                    </li>
                                                                                    <li>
                                                                                        <FaTimesCircle style={{ color: '#e05252' }} /> <strong>Sin datos de kms:</strong> ninguna
                                                                                        operación del período tiene km real cargado; el km promedio (si existe) proviene solo del historial.
                                                                                    </li>
                                                                                </ul>
                                                                            </div>
                                                                        )}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {grupos.map(grupo => (
                                                    <React.Fragment key={grupo.nombre}>
                                                        <tr className="rutas-group-header">
                                                            <td colSpan={COLUMNS.length}>
                                                                {grupo.nombre}
                                                                <span className="group-stats">
                                                                    {grupo.count} ruta{grupo.count !== 1 ? 's' : ''}
                                                                    {grupo.totales.length > 0 && (
                                                                        <> · Total importe del período: {grupo.totales.map(t => `${formatNum(t.total, 2)} ${t.moneda}`).join(' · ')}</>
                                                                    )}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                        {grupo.rows.map((r, idx) => {
                                                            const c = clasificacionColor(r.Clasificacion);
                                                            const cd = calidadDatoInfo(r.CalidadDato);
                                                            return (
                                                                <tr key={idx}>
                                                                    <td style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                                                                        {r.TramoCompleto}
                                                                    </td>
                                                                    <td>
                                                                        <span className="clasificacion-badge" style={{ background: c.bg, color: c.color }}>
                                                                            {r.Clasificacion}
                                                                        </span>
                                                                        <span className="disponibilidad-sub">
                                                                            {disponibilidadLabel(r.GrupoDisponibilidad)}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ fontSize: '0.85rem' }}>{formatNum(r.OperacionesEnPeriodo)}</td>
                                                                    <td style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                                                                        {formatNum(r.ImporteEnPeriodo, 2)}{Number(r.ImporteEnPeriodo) ? ` ${r.SimboloMoneda || 'ARS'}` : ''}
                                                                    </td>
                                                                    <td style={{ fontSize: '0.85rem' }}>{formatNum(r.KmsPromedio)}</td>
                                                                    <td>
                                                                        {cd ? (
                                                                            <span className="calidad-dato" title={cd.label} style={{ color: cd.color }}>
                                                                                <cd.icon />
                                                                                {cd.label}
                                                                            </span>
                                                                        ) : '-'}
                                                                    </td>
                                                                    <td>
                                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                                                                            <FaCalendarAlt style={{ opacity: 0.4, fontSize: '0.75rem' }} />
                                                                            {formatFecha(r.UltimoViaje)}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
        </div>
    );

    if (standalone) {
        return (
            <div className="rutas-page">
                <header className="rutas-page-header">
                    <div className="title-area">
                        <span className="breadcrumb">Analítica / Reporte de Rutas</span>
                        <h1 className="main-title" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                            <FaRoute style={{ color: '#3B6D11', fontSize: '1.2rem' }} />
                            Historial completo de rutas
                        </h1>
                        {periodoLabel && <span className="rutas-page-periodo">Período: {periodoLabel}</span>}
                    </div>
                </header>
                <main className="rutas-page-body">
                    {reporteBody}
                </main>
            </div>
        );
    }

    const content = (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="ux-modal-container"
                style={{ maxWidth: '1200px', width: '95vw', height: 'auto', maxHeight: '86vh' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="ux-modal-header">
                    <div className="title-area">
                        <span className="breadcrumb">Analítica / Reporte de Rutas</span>
                        <h1 className="main-title" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <FaRoute style={{ color: '#3B6D11', fontSize: '1.1rem' }} />
                            Historial completo de rutas
                        </h1>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button className="rutas-newtab-btn" onClick={handleOpenNewTab} title="Abrir el reporte en una pestaña nueva">
                            <FaExternalLinkAlt /> Abrir en pestaña nueva
                        </button>
                        <button className="ux-close-btn" onClick={onClose}><FaTimes /></button>
                    </div>
                </div>

                <div className="ux-modal-body">
                    {reporteBody}
                </div>

                <div className="ux-modal-footer">
                    <div />
                    <div className="main-actions">
                        <button className="btn-primary" onClick={onClose}>Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(content, document.body);
};

export default RutasReporteModal;
