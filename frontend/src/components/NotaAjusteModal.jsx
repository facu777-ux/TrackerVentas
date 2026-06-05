import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { FaTimes, FaExchangeAlt, FaCalendarAlt } from 'react-icons/fa';
import { format } from 'date-fns';
import { seguimientoAPI } from '../services/api';
import './DetailModal.css';

const NotaAjusteModal = ({ item, facturas, onClose }) => {
    const [notas, setNotas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    useEffect(() => {
        if (!facturas || !item) return;
        const empresa = item.EmpresaCarga || item.EmpOri || 'DIBIAG';
        setLoading(true);
        setError(null);
        seguimientoAPI.getNotasAjuste(empresa, facturas)
            .then(res => { setNotas(res.data || []); })
            .catch(err => { setError(err.message || 'Error al cargar notas'); })
            .finally(() => setLoading(false));
    }, [facturas, item]);

    const formatFecha = (fecha) => {
        if (!fecha) return '-';
        try { return format(new Date(fecha), 'dd/MM/yyyy'); }
        catch { return '-'; }
    };

    const toNum = (v) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? null : n; };

    const resolveImporte = (nota) => {
        const ext = toNum(nota.ImporteExt);
        const nac = toNum(nota.ImporteNac);
        // Si tiene importe en moneda extranjera, lo mostramos con su símbolo
        if (ext != null && ext !== 0) return { valor: ext, simbolo: nota.SimboloMoneda || nota.CodMoneda || '' };
        // Fallback: importe en moneda nacional (ARS)
        if (nac != null && nac !== 0) return { valor: nac, simbolo: '$' };
        return null;
    };

    const formatImporte = (nota) => {
        const imp = resolveImporte(nota);
        if (!imp) return '-';
        return `${imp.simbolo} ${imp.valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const countNC = notas.filter(n => n.TipoNota === 'Nota de Crédito').length;
    const countND = notas.filter(n => n.TipoNota === 'Nota de Débito').length;

    // Importe total sumado, solo si hay notas con monto
    const totalImporte = (() => {
        const resueltos = notas.map(n => resolveImporte(n)).filter(Boolean);
        if (resueltos.length === 0) return null;
        const simbolos = [...new Set(resueltos.map(r => r.simbolo))];
        if (simbolos.length !== 1) return null;
        const suma = resueltos.reduce((acc, r) => acc + r.valor, 0);
        return `${simbolos[0]} ${suma.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    })();

    const facturasLabel = Array.isArray(facturas)
        ? facturas.length > 1 ? `${facturas.length} Facturas` : facturas[0]
        : facturas;

    const content = (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="ux-modal-container"
                style={{ maxWidth: '860px', height: 'auto', maxHeight: '82vh' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="ux-modal-header">
                    <div className="title-area">
                        <span className="breadcrumb">
                            Notas de Ajuste / {item?.EmpresaCarga || item?.EmpOri}
                        </span>
                        <h1 className="main-title" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <FaExchangeAlt style={{ color: '#3B6D11', fontSize: '1.1rem' }} />
                            {facturasLabel}
                        </h1>
                    </div>
                    <button className="ux-close-btn" onClick={onClose}><FaTimes /></button>
                </div>

                <div className="ux-modal-body">
                    <div className="metric-cards-container">
                        <div className="metric-card highlight">
                            <span className="metric-label">FACTURA</span>
                            <h2 className="metric-value" style={{ fontSize: '1rem' }}>{facturasLabel}</h2>
                        </div>
                        <div className="metric-card">
                            <span className="metric-label">NOTAS DE CRÉDITO</span>
                            <h2 className="metric-value" style={{ color: loading ? 'var(--text-tertiary)' : (countNC > 0 ? '#5a9e1f' : 'var(--text-primary)') }}>
                                {loading ? '...' : countNC}
                            </h2>
                        </div>
                        <div className="metric-card">
                            <span className="metric-label">NOTAS DE DÉBITO</span>
                            <h2 className="metric-value" style={{ color: loading ? 'var(--text-tertiary)' : (countND > 0 ? '#e05252' : 'var(--text-primary)') }}>
                                {loading ? '...' : countND}
                            </h2>
                        </div>
                        <div className="metric-card">
                            <span className="metric-label">IMPORTE TOTAL</span>
                            <h2 className="metric-value" style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                {loading ? '...' : (totalImporte ?? '-')}
                            </h2>
                        </div>
                        <div className="metric-card">
                            <span className="metric-label">CLIENTE</span>
                            <h2 className="metric-value" style={{ fontSize: '0.85rem' }}>
                                {item?.NomCliente || '-'}
                            </h2>
                        </div>
                    </div>

                    <div className="ux-tab-content" style={{ padding: '0.5rem 2rem 2rem' }}>
                        {loading && (
                            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                Cargando notas de ajuste...
                            </div>
                        )}
                        {error && !loading && (
                            <div style={{ color: 'var(--error)', padding: '1rem', fontSize: '0.9rem' }}>
                                Error: {error}
                            </div>
                        )}
                        {!loading && !error && notas.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                No se encontraron notas de crédito/débito para esta factura.
                            </div>
                        )}
                        {!loading && !error && notas.length > 0 && (
                            <div className="items-table-container">
                                <table className="mini-table">
                                    <thead>
                                        <tr>
                                            <th>Tipo</th>
                                            <th>Comprobante</th>
                                            <th>Factura Aplica</th>
                                            <th>Fecha Mov.</th>
                                            <th>Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {notas.map((nota, idx) => {
                                            const isNC = nota.TipoNota === 'Nota de Crédito';
                                            return (
                                                <tr key={idx}>
                                                    <td>
                                                        <span style={{
                                                            background: isNC ? 'rgba(59,109,17,0.15)' : 'rgba(220,80,80,0.12)',
                                                            color: isNC ? '#5a9e1f' : '#e05252',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontWeight: '700',
                                                            fontSize: '0.75rem',
                                                            letterSpacing: '0.3px',
                                                        }}>
                                                            {isNC ? 'NC' : 'ND'}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontWeight: '700' }}>
                                                        {nota.CodigoNota}-{nota.NumeroNota}
                                                        {nota.NroCAE && (
                                                            <span title={`CAE: ${nota.NroCAE}`} style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                                                                CAE ✓
                                                            </span>
                                                        )}
                                                        {nota.Descripcion && (
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400, marginTop: '4px', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                                                {nota.Descripcion}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                        {nota.CodigoFactura}-{nota.NumeroFactura}
                                                    </td>
                                                    <td>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                                                            <FaCalendarAlt style={{ opacity: 0.4, fontSize: '0.75rem' }} />
                                                            {formatFecha(nota.FechaMovimiento || nota.FechaAlta)}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontWeight: '600', fontSize: '0.85rem', color: isNC ? '#5a9e1f' : '#e05252' }}>
                                                        {formatImporte(nota)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
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

export default NotaAjusteModal;
