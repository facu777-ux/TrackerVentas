import React from 'react';
import ReactDOM from 'react-dom';
import * as XLSX from 'xlsx';
import { FaTimes, FaFileExcel, FaChartBar } from 'react-icons/fa';
import './DetailModal.css';
import './MonthlyReporteModal.css';

const ESTADOS = ['Pagado', 'Facturado', 'No Facturado', 'Solo Presupuesto'];

// Reporte de detalle de la card "Evolución Mensual". Todo frontend: recibe los
// buckets mensuales ya agregados (todos los meses del período, con desglose por
// estado, total y delta%) y los muestra en tabla + exporta a Excel.
const MonthlyReporteModal = ({ data = [], displayCurrency, empresaFiltro, onClose }) => {
    const monedaLabel = displayCurrency === 'USD_BNA' ? 'USD (BNA)' : (displayCurrency === 'USD_SII' ? 'USD (SII)' : 'ARS');
    const sym = displayCurrency === 'ARS' ? '$' : 'US$';

    // Importe compacto para la tabla (mantiene las columnas angostas): millones / miles.
    const fmtCompact = (v) => {
        if (!v) return '—';
        const abs = Math.abs(v);
        if (abs >= 1e6) return `${sym} ${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
        if (abs >= 1e3) return `${sym} ${Math.round(v / 1e3).toLocaleString('es-AR')} k`;
        return `${sym} ${Math.round(v).toLocaleString('es-AR')}`;
    };
    // Importe exacto (sin decimales) para el tooltip al pasar el mouse.
    const fmtExact = (v) => `${sym} ${Math.round(v || 0).toLocaleString('es-AR')}`;

    // Totales de la fila de cierre
    const totales = data.reduce((acc, m) => {
        ESTADOS.forEach(e => { acc[e] += m[e] || 0; });
        acc.total += m.total || 0;
        acc.count += m.count || 0;
        return acc;
    }, { Pagado: 0, Facturado: 0, 'No Facturado': 0, 'Solo Presupuesto': 0, total: 0, count: 0 });

    const deltaText = (d) => d == null ? '—' : `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}%`;
    const deltaColor = (d) => d == null ? 'var(--text-muted)' : (d >= 0 ? '#10b981' : '#ef4444');

    const handleExportExcel = () => {
        const header = ['Mes', 'Operaciones', ...ESTADOS, `Total (${monedaLabel})`, 'Δ% vs mes anterior'];
        const rows = data.map(m => ([
            m.name,
            m.count || 0,
            ...ESTADOS.map(e => Number(m[e]) || 0),
            Number(m.total) || 0,
            m.deltaPct == null ? '' : Number(m.deltaPct.toFixed(1)),
        ]));
        const totalRow = [
            'TOTAL', totales.count,
            ...ESTADOS.map(e => Number(totales[e]) || 0),
            Number(totales.total) || 0,
            '',
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalRow]);
        ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
        Object.keys(ws).forEach(addr => {
            if (addr[0] === '!' || !ws[addr]) return;
            if (ws[addr].t === 'n') ws[addr].z = '#,##0';
        });
        XLSX.utils.book_append_sheet(wb, ws, 'Evolución Mensual');

        const fechaHoy = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Evolucion_Mensual_${empresaFiltro || 'Todas'}_${fechaHoy}.xlsx`);
    };

    const content = (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="ux-modal-container"
                style={{ maxWidth: '960px', width: '92vw', height: 'auto', maxHeight: '86vh' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="ux-modal-header">
                    <div className="title-area">
                        <span className="breadcrumb">Analítica / Evolución Mensual</span>
                        <h1 className="main-title" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <FaChartBar style={{ color: '#3B6D11', fontSize: '1.1rem' }} />
                            Detalle mensual del período
                        </h1>
                    </div>
                    <button className="ux-close-btn" onClick={onClose}><FaTimes /></button>
                </div>

                <div className="ux-modal-body mensual-body">
                    <div className="mensual-toolbar">
                        <span className="mensual-result-count">
                            {data.length} {data.length === 1 ? 'mes' : 'meses'} · valores en {monedaLabel}
                        </span>
                        <button className="btn-excel" onClick={handleExportExcel} title="Exportar a Excel" disabled={data.length === 0}>
                            <FaFileExcel /> Exportar
                        </button>
                    </div>

                    {data.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            No hay datos mensuales para el período consultado.
                        </div>
                    ) : (
                        <div className="items-table-container" style={{ overflowX: 'auto' }}>
                            <table className="mensual-table">
                                <thead>
                                    <tr>
                                        <th>Mes</th>
                                        <th className="num ops">OP's</th>
                                        {ESTADOS.map(e => <th key={e} className="num">{e}</th>)}
                                        <th className="num">Total</th>
                                        <th className="num">Δ% mensual</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map(m => (
                                        <tr key={m.sortKey}>
                                            <td style={{ fontWeight: 700 }}>{m.name}</td>
                                            <td className="num ops">{m.count}</td>
                                            {ESTADOS.map(e => (
                                                <td key={e} className="num" title={m[e] ? fmtExact(m[e]) : undefined}>{fmtCompact(m[e])}</td>
                                            ))}
                                            <td className="num" style={{ fontWeight: 700 }} title={fmtExact(m.total)}>{fmtCompact(m.total)}</td>
                                            <td className="num" style={{ color: deltaColor(m.deltaPct), fontWeight: 600 }}>
                                                {deltaText(m.deltaPct)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="mensual-total-row">
                                        <td style={{ fontWeight: 800 }}>TOTAL</td>
                                        <td className="num ops">{totales.count}</td>
                                        {ESTADOS.map(e => (
                                            <td key={e} className="num" title={fmtExact(totales[e])}>{fmtCompact(totales[e])}</td>
                                        ))}
                                        <td className="num" style={{ fontWeight: 800 }} title={fmtExact(totales.total)}>{fmtCompact(totales.total)}</td>
                                        <td className="num">—</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
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

export default MonthlyReporteModal;
