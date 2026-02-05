import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import {
    FaTimes,
    FaFileInvoice,
    FaTruck,
    FaUser,
    FaCalendarAlt,
    FaBuilding,
    FaBoxes,
    FaDollarSign,
    FaClipboardList,
    FaInfoCircle,
    FaChevronLeft,
    FaChevronRight,
    FaListUl,
    FaCashRegister
} from 'react-icons/fa';
import { format } from 'date-fns';
import './DetailModal.css';
import './EstadoFlujo.css';

const DetailModal = ({ item, onClose, mode = 'all', onNext, onPrev, currentIndex, totalItems, budgetTotal, relatedItems }) => {
    const [activeTab, setActiveTab] = useState('general');

    // Mapear el modo a la pestaña correspondiente al abrir
    React.useEffect(() => {
        if (mode === 'carga') setActiveTab('logistica');
        else if (mode === 'factura' || mode === 'recibo') setActiveTab('admin');
        else if (mode === 'presupuesto') setActiveTab('general');
        else if (mode === 'all') setActiveTab('general');
    }, [mode]);

    if (!item) return null;

    const formatFecha = (fecha) => {
        if (!fecha) return '-';
        try {
            return format(new Date(fecha), 'dd/MM/yyyy HH:mm');
        } catch {
            return '-';
        }
    };

    const formatMonto = (valor) => {
        if (valor === null || valor === undefined) return '-';
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2
        }).format(valor);
    };

    const getEstado = () => {
        const factura = item.FacturaAsociadaOP;
        if (item.ReciboCobranza && !item.ReciboCobranza.includes('Pendiente')) {
            return { text: 'Pagado', color: 'success', icon: <FaCashRegister /> };
        } else if (factura && !factura.includes('CARGA NO FACTURADA') && !factura.includes('Pendiente')) {
            return { text: 'Facturado', color: 'success', icon: <FaFileInvoice /> };
        } else if (item.CodigoCarga) {
            return { 
                text: factura?.includes('Pendiente') ? 'Carga Asignada' : 'En Proceso', 
                color: 'warning', 
                icon: <FaTruck /> 
            };
        } else {
            return { text: 'Presupuesto', color: 'info', icon: <FaFileInvoice /> };
        }
    };

    const estado = getEstado();
    const isFacturado = item.FacturaAsociadaOP && !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA') && !item.FacturaAsociadaOP.includes('Pendiente');
    const hasRecibo = item.ReciboCobranza && !item.ReciboCobranza.includes('Pendiente');

    // Prevenir scroll del body
    React.useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = originalOverflow; };
    }, []);

    const renderMetricCards = () => {
        const totalCantidad = relatedItems?.reduce((acc, ri) => acc + (ri.Cantidad || 0), 0) || 0;

        // Métricas según el contexto (Modo)
        if (mode === 'carga') {
            return (
                <div className="metric-cards-container">
                    <div className="metric-card highlight">
                        <span className="metric-label">CÓDIGO DE CARGA</span>
                        <h2 className="metric-value">{item.CodigoCarga || 'PENDIENTE'}</h2>
                    </div>
                    <div className="metric-card">
                        <span className="metric-label">FECHA Y HORA CARGA</span>
                        <h2 className="metric-value" style={{ fontSize: '1.2rem' }}>
                            {item.FecAltCarga ? (
                                <>
                                    {format(new Date(item.FecAltCarga), 'dd/MM/yyyy')}
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginLeft: '6px' }}>
                                        {format(new Date(item.FecAltCarga), 'HH:mm')} hs
                                    </span>
                                </>
                            ) : '-'}
                        </h2>
                    </div>
                    <div className="metric-card">
                        <span className="metric-label">ITEMS TOTALES</span>
                        <h2 className="metric-value">{totalCantidad}</h2>
                    </div>
                    <div className="metric-card">
                        <span className="metric-label">ESTADO LOGÍSTICO</span>
                        <div className={`metric-status ${estado.color}`}>
                            {estado.icon} {estado.text.toUpperCase()}
                        </div>
                    </div>
                </div>
            );
        }

        if (mode === 'factura' || mode === 'recibo') {
            const isRecibo = mode === 'recibo';
            return (
                <div className="metric-cards-container">
                    <div className="metric-card highlight">
                        <span className="metric-label">{isRecibo ? 'RECIBO DE COBRANZA' : 'COMPROBANTE'}</span>
                        <h2 className="metric-value" style={{ fontSize: '1.1rem' }}>{isRecibo ? item.ReciboCobranza : item.FacturaAsociadaOP}</h2>
                    </div>
                    <div className="metric-card">
                        <span className="metric-label">IMPORTE ITEM</span>
                        <h2 className="metric-value">{formatMonto(item.TotalItem)}</h2>
                    </div>
                    <div className="metric-card">
                        <span className="metric-label">CLIENTE</span>
                        <h2 className="metric-value" style={{ fontSize: '1rem' }}>{item.NomCliente}</h2>
                    </div>
                    <div className="metric-card">
                        <span className="metric-label">ESTADO FINANCIERO</span>
                        <div className={`metric-status ${estado.color}`}>
                            {estado.icon} {estado.text.toUpperCase()}
                        </div>
                    </div>
                </div>
            );
        }

        // Default / Presupuesto
        return (
            <div className="metric-cards-container">
                <div className="metric-card highlight">
                    <span className="metric-label">TOTAL PRESUPUESTO</span>
                    <h2 className="metric-value">{formatMonto(budgetTotal)}</h2>
                </div>
                <div className="metric-card">
                    <span className="metric-label">FECHA Y HORA ALTA</span>
                    <h2 className="metric-value" style={{ fontSize: '1.2rem' }}>
                        {item.FchAltaRegistro ? (
                            <>
                                {format(new Date(item.FchAltaRegistro), 'dd/MM/yyyy')}
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginLeft: '6px' }}>
                                    {format(new Date(item.FchAltaRegistro), 'HH:mm')} hs
                                </span>
                            </>
                        ) : '-'}
                    </h2>
                </div>
                <div className="metric-card">
                    <span className="metric-label">ESTADO ACTUAL</span>
                    <div className={`metric-status ${estado.color}`}>
                        {estado.icon} {estado.text.toUpperCase()}
                    </div>
                </div>
                <div className="metric-card">
                    <span className="metric-label">ÍTEMS</span>
                    <h2 className="metric-value">{relatedItems?.length || 1}</h2>
                </div>
            </div>
        );
    };

    const renderGeneralTab = () => (
        <div className="tab-pane fade-in">
            <div className="info-grid-simple">
                <div className="info-block">
                    <h4 className="block-title"><FaUser /> Datos del Cliente</h4>
                    <p><strong>Nombre:</strong> {item.NomCliente}</p>
                    <p><strong>Contacto:</strong> {item.ContactoDeCliente || '-'}</p>
                </div>
                <div className="info-block">
                    <h4 className="block-title"><FaClipboardList /> Estado de Gestión</h4>
                    <p><strong>Flujo:</strong> {item.EstadoFlujo || 'N/A'}</p>
                    <p><strong>Empresa:</strong> {item.EmpOri}</p>
                </div>
            </div>

            <div className="process-timeline-v2">
                <h4 className="block-title"><FaListUl /> Línea de Tiempo del Proceso</h4>
                <div className="timeline-horizontal">
                    {[
                        { label: 'PR', val: item.NroPR, done: !!item.NroPR },
                        { label: 'Carga', val: item.CodigoCarga, done: !!item.CodigoCarga },
                        { label: 'Factura', val: isFacturado, done: isFacturado },
                        { label: 'Recibo', val: hasRecibo, done: hasRecibo }
                    ].map((step, idx) => (
                        <div key={idx} className={`step ${step.done ? 'active' : ''}`}>
                            <div className="step-circle">{idx + 1}</div>
                            <span className="step-label">{step.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderLogisticaTab = () => (
        <div className="tab-pane fade-in">
            <div className="details-card">
                <div className="info-grid-simple" style={{ marginBottom: '1.5rem' }}>
                    <div className="info-block">
                        <h4 className="block-title"><FaTruck /> Operación</h4>
                        <p><strong>Código de Carga:</strong> <span className="highlight-text">{item.CodigoCarga || 'Pendiente'}</span></p>
                        <p><strong>Tipo de Viaje:</strong> {item.TipoViaje || '-'}</p>
                        <p><strong>Tipo de Operación:</strong> {item.TipoOperacion || '-'}</p>
                        <p><strong>Fecha Carga:</strong> {formatFecha(item.FecAltCarga)}</p>
                    </div>
                </div>

                <div className="info-grid-simple">
                    <div className="info-block">
                        <h4 className="block-title"><FaBuilding /> Origen / Remitente</h4>
                        <p><strong>Remitente:</strong> {item.RemitenteOP || '-'}</p>
                        <p><strong>Localización:</strong> {item.LocalizacionCargaOP || '-'}</p>
                        <p><strong>Domicilio:</strong> {item.DomicilioCarga || '-'}</p>
                    </div>
                    <div className="info-block">
                        <h4 className="block-title"><FaBuilding /> Destino / Entrega</h4>
                        <p><strong>Destinatario:</strong> {item.DestinatarioOP || '-'}</p>
                        <p><strong>Localización:</strong> {item.LocalizacionEntregaOP || '-'}</p>
                        <p><strong>Domicilio:</strong> {item.DomicilioDescarga || '-'}</p>
                    </div>
                </div>

                <div className="detail-row full" style={{ marginTop: '1rem' }}>
                    <label>Descripción del Viaje:</label>
                    <p className="description-text">{item.DescrpViaj || 'Sin descripción'}</p>
                </div>
            </div>
        </div>
    );

    const renderAdminTab = () => (
        <div className="tab-pane fade-in">
            <div className="info-grid-simple">
                <div className="info-block">
                    <h4 className="block-title">Comercial</h4>
                    <p><strong>Lista de Precio:</strong> {item.ListaPrecio || '-'}</p>
                    <p><strong>Condición Pago:</strong> {item.CondicionPago || '-'}</p>
                </div>
                <div className="info-block">
                    <h4 className="block-title">Financiero</h4>
                    <p><strong>Coef. Registración:</strong> {item.CoefRegistracion || '-'}</p>
                    <p><strong>Tipo Formulario:</strong> {item.PR}</p>
                </div>
            </div>
            {(item.NroSolicitud || item.ObservacionesPR) && (
                <div className="details-card" style={{ marginTop: '1.5rem', background: 'var(--bg-accents-1)', padding: '1rem', borderRadius: '8px' }}>
                    <h4 className="block-title">Información Adicional</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <p><strong>Solicitud:</strong> {item.NroSolicitud ? `SOL-${item.NroSolicitud}` : '-'}</p>
                            <p><strong>Estado Solic.:</strong> {item.EstadoSolicitud || '-'}</p>
                        </div>
                        <div>
                            <p><strong>Observaciones PR:</strong></p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                {item.ObservacionesPR || 'Sin observaciones'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderItemsTab = () => (
        <div className="tab-pane fade-in">
            <div className="items-table-container">
                <table className="mini-table">
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th>Cant.</th>
                            <th>Precio</th>
                            <th>Subtotal</th>
                            <th>Comprobante</th>
                            <th>Cliente a Facturar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {relatedItems.map((ri, idx) => (
                            <tr key={idx} className={ri === item ? 'current-item' : ''}>
                                <td>
                                    <div style={{ fontWeight: '600' }}>{ri.DescrpProd}</div>
                                    {ri.ObservacionesItem && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                            {ri.ObservacionesItem}
                                        </div>
                                    )}
                                </td>
                                <td>{ri.Cantidad}</td>
                                <td>{formatMonto(ri.Precio)}</td>
                                <td className="bold">{formatMonto(ri.TotalItem)}</td>
                                <td>{ri.FacturaAsociadaOP || '-'}</td>
                                <td className="client-cell">{ri.NomCliente || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const getContextInfo = () => {
        switch(mode) {
            case 'carga': return { label: 'Carga Logística', title: `Carga Nº ${item.CodigoCarga || 'S/N'}`, crt: item.NroCRT, icon: <FaTruck /> };
            case 'factura': return { label: 'Facturación', title: item.FacturaAsociadaOP, icon: <FaFileInvoice /> };
            case 'recibo': return { label: 'Cobranza', title: item.ReciboCobranza, icon: <FaCashRegister /> };
            default: return { label: 'Presupuesto', title: `PR Nº ${item.NroPR}`, icon: <FaFileInvoice /> };
        }
    };

    const context = getContextInfo();

    const modalContent = (
        <div className="modal-overlay" onClick={onClose}>
            {/* Navegación Lateral (Restore) */}
            {onPrev && (
                <button className="side-nav-btn prev" onClick={(e) => { e.stopPropagation(); onPrev(); }}>
                    <FaChevronLeft />
                </button>
            )}

            <div className="ux-modal-container" onClick={e => e.stopPropagation()}>
                {/* NIVEL 1: Header de Identificación */}
                <div className="ux-modal-header">
                    <div className="title-area">
                        <span className="breadcrumb">{context.label} / {item.EmpOri}</span>
                        <h1 className="main-title">
                            {context.icon} {context.title}
                            {context.crt && (
                                <span style={{ marginLeft: '1.5rem' }}>
                                    CRT Nº {context.crt}
                                </span>
                            )}
                        </h1>
                    </div>
                    <div className="header-right">
                        {totalItems > 1 && (
                            <span className="nav-counter">Item {currentIndex + 1} de {totalItems}</span>
                        )}
                        <button className="ux-close-btn" onClick={onClose}><FaTimes /></button>
                    </div>
                </div>

                <div className="ux-modal-body">
                    {/* NIVEL 2: Primary Summary */}
                    {renderMetricCards()}

                    {/* NIVEL 3: Pestañas de Divulgación Progresiva */}
                    <div className="ux-tabs-navigation">
                        <button className={`ux-tab-btn ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General</button>
                        
                        <button className={`ux-tab-btn ${activeTab === 'logistica' ? 'active' : ''}`} onClick={() => setActiveTab('logistica')}>Logística</button>
                        <button className={`ux-tab-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>Administración</button>

                        <button className={`ux-tab-btn ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>
                            Ítems ({relatedItems?.length || 0})
                        </button>
                    </div>

                    <div className="ux-tab-content">
                        {activeTab === 'general' && renderGeneralTab()}
                        {activeTab === 'logistica' && renderLogisticaTab()}
                        {activeTab === 'admin' && renderAdminTab()}
                        {activeTab === 'items' && renderItemsTab()}
                    </div>
                </div>

                {/* NIVEL 4: Footer de Acciones */}
                <div className="ux-modal-footer">
                    <div className="nav-actions">
                        {onPrev && <button className="btn-nav" onClick={onPrev}><FaChevronLeft /> Anterior</button>}
                        {onNext && <button className="btn-nav" onClick={onNext}>Siguiente <FaChevronRight /></button>}
                    </div>
                    <div className="main-actions">
                        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
                        <button className="btn-primary" onClick={onClose}>Cerrar Detalle</button>
                    </div>
                </div>
            </div>

            {onNext && (
                <button className="side-nav-btn next" onClick={(e) => { e.stopPropagation(); onNext(); }}>
                    <FaChevronRight />
                </button>
            )}
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};

export default DetailModal;
