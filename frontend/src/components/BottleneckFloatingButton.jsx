import React, { useState, useMemo, useEffect } from 'react';
import { AlertCircle, Clock, ChevronRight, X, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import './BottleneckFloatingButton.css';

const BottleneckFloatingButton = ({ data }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Cerrar al hacer click afuera
    React.useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e) => {
            if (!e.target.closest('.bottleneck-container')) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const agingData = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Filtrar cargas no facturadas
        const stuckCargas = data.filter(item => 
            item.CodigoCarga && 
            (!item.FacturaAsociadaOP || 
             item.FacturaAsociadaOP.includes('Pendiente') || 
             item.FacturaAsociadaOP.includes('CARGA NO FACTURADA'))
        );

        // Agrupar por carga (para no repetir items de la misma carga)
        const uniqueCargas = {};
        stuckCargas.forEach(item => {
            if (!uniqueCargas[item.CodigoCarga]) {
                const fch = item.FecAltCarga || item.FchMovimiento || item.FchAltaRegistro;
                const days = fch ? Math.floor((new Date() - new Date(fch)) / (1000 * 60 * 60 * 24)) : 0;
                
                uniqueCargas[item.CodigoCarga] = {
                    id: item.CodigoCarga,
                    cliente: item.NomCliente,
                    monto: item.TotalItem || 0,
                    fecha: fch,
                    dias: days,
                    pr: item.NroPR
                };
            } else {
                uniqueCargas[item.CodigoCarga].monto += (item.TotalItem || 0);
            }
        });

        return Object.values(uniqueCargas)
            .sort((a, b) => b.dias - a.dias)
            .slice(0, 10); // Top 10 mas demorados
    }, [data]);

    const totalStuckAmount = useMemo(() => 
        agingData.reduce((acc, curr) => acc + curr.monto, 0), 
    [agingData]);

    if (agingData.length === 0) return null;

    return (
        <div className="bottleneck-container">
            {!isOpen ? (
                <button className="bottleneck-trigger" onClick={() => setIsOpen(true)}>
                    <div className="trigger-icon pulse">
                        <AlertCircle size={20} />
                        <span className="badge">{agingData.length}</span>
                    </div>
                    <span className="trigger-text">Ver Cuello de Botella</span>
                </button>
            ) : (
                <div className="bottleneck-panel animate-slide-up">
                    <div className="panel-header">
                        <div className="header-title">
                            <AlertCircle className="text-red" size={20} />
                            <h3>Análisis de Cuello de Botella</h3>
                        </div>
                        <button 
                            className="close-panel" 
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsOpen(false);
                            }}
                            title="Cerrar análisis"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="panel-summary">
                        <div className="summary-item">
                            <span className="label">Cargas Retenidas</span>
                            <span className="value">{agingData.length}</span>
                        </div>
                        <div className="summary-item">
                            <span className="label">Monto en Riesgo</span>
                            <span className="value red">
                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(totalStuckAmount)}
                            </span>
                        </div>
                    </div>

                    <div className="aging-list">
                        <p className="list-title">CARGAS CON MAYOR DEMORA</p>
                        {agingData.map((item, idx) => (
                            <div key={idx} className="aging-item">
                                <div className="item-icon">
                                    <Clock size={14} className={item.dias > 15 ? 'text-red' : 'text-orange'} />
                                </div>
                                <div className="item-content">
                                    <div className="item-top">
                                        <span className="item-id">Carga: {item.id}</span>
                                        <span className={`item-days ${item.dias > 15 ? 'critical' : ''}`}>
                                            Hace {item.dias} días
                                        </span>
                                    </div>
                                    <p className="item-client">{item.cliente}</p>
                                    <div className="item-bottom">
                                        <span className="item-pr">PR: {item.pr}</span>
                                        <span className="item-amount">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.monto)}</span>
                                    </div>
                                </div>
                                <ChevronRight size={14} className="text-muted" />
                            </div>
                        ))}
                    </div>

                    <div className="panel-footer">
                        <button className="btn-full-report">Generar Reporte de Aging</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BottleneckFloatingButton;
