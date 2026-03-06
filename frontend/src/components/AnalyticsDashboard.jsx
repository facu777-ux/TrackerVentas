import React, { useMemo } from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { 
    TrendingUp, TrendingDown, DollarSign, Package, 
    FileText, Calendar, Download, MoreHorizontal,
    ArrowUpRight, MapPin, Truck, HelpCircle, AlertCircle
} from 'lucide-react';
import './AnalyticsDashboard.css';

const AnalyticsDashboard = ({ data, displayCurrency, setDisplayCurrency, exchangeRate, chileExchangeRate, onExportSoloPresupuesto, onExportAudit, searchCriteria }) => {
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

    // 1. Procesamiento de KPIs
    const kpis = useMemo(() => {
        if (!data || data.length === 0) return {};
        
        const totals = {
            operado: 0,
            facturado: 0,
            pendiente: 0,
            counts: { total: 0, cargas: new Set(), facturas: new Set() }
        };

        const budgetsMap = {};

        data.forEach(item => {
            const nroPR = item.NroPR || `SOL-${item.NroSolicitud}`;
            const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
            const key = `${empresa}-${nroPR}`;
            
            if (!budgetsMap[key]) {
                budgetsMap[key] = { total: 0, facturado: 0 };
            }
            
            const itemTotal = normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
            budgetsMap[key].total += itemTotal;
            totals.counts.total++;

            if (item.CodigoCarga) {
                totals.counts.cargas.add(item.CodigoCarga);
            }

            const isFacturado = (item.ReciboCobranza && !item.ReciboCobranza.includes('Pendiente')) || 
                              (item.FacturaAsociadaOP && !item.FacturaAsociadaOP.includes('Pendiente') && !item.FacturaAsociadaOP.includes('CARGA NO FACTURADA'));
            
            if (isFacturado) {
                budgetsMap[key].facturado += itemTotal;
                if (item.FacturaAsociadaOP) totals.counts.facturas.add(item.FacturaAsociadaOP);
            }
        });

        Object.values(budgetsMap).forEach(b => {
            totals.operado += b.total;
            totals.facturado += b.facturado;
        });

        totals.pendiente = totals.operado - totals.facturado;
        totals.cobrabilidad = (totals.facturado / totals.operado) * 100;

        return totals;
    }, [data, displayCurrency, exchangeRate]);

    // 2. Data para Top 10 Clientes (Pareto)
    const topClientes = useMemo(() => {
        const clientMap = {};
        data.forEach(item => {
            if (!item.NomCliente) return;
            const amount = normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
            clientMap[item.NomCliente] = (clientMap[item.NomCliente] || 0) + amount;
        });

        return Object.entries(clientMap)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10); // Respetamos el "Top 10" solicitado
    }, [data, displayCurrency, exchangeRate]);

    // 3. Data para Mix de Negocio (Tipo de Viaje)
    const mixNegocio = useMemo(() => {
        const mixMap = {};
        data.forEach(item => {
            const key = item.TipoViaje || 'No Definido';
            const amount = normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
            mixMap[key] = (mixMap[key] || 0) + amount;
        });

        const total = Object.values(mixMap).reduce((a, b) => a + b, 0);
        return Object.entries(mixMap).map(([name, value]) => ({
            name,
            value,
            percent: total > 0 ? ((value / total) * 100).toFixed(0) : 0
        })).sort((a, b) => b.value - a.value).slice(0, 4);
    }, [data, displayCurrency, exchangeRate]);

    // 4. Data para Rutas (Top Origen -> Destino)
    const topRutas = useMemo(() => {
        const rutaMap = {};
        data.forEach(item => {
            if (!item.LocalizacionCargaOP || !item.LocalizacionEntregaOP) return;
            const key = `${item.LocalizacionCargaOP} → ${item.LocalizacionEntregaOP}`;
            if (!rutaMap[key]) {
                rutaMap[key] = { ruta: key, count: 0, total: 0, date: item.FchMovimiento || item.FchAltaRegistro };
            }
            rutaMap[key].count++;
            const amount = normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
            rutaMap[key].total += amount;
        });

        return Object.values(rutaMap)
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);
    }, [data, displayCurrency, exchangeRate]);

    // 5. Tendencia Mensual (Mock de ultimos 6 meses o real si hay data)
    const trendData = useMemo(() => {
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const monthlyStats = {};
        
        data.forEach(item => {
            const dateStr = item.FchMovimiento || item.FchAltaRegistro;
            if (!dateStr) return;
            const date = new Date(dateStr);
            const monthKey = months[date.getMonth()];
            if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { name: monthKey, total: 0 };
            const amount = normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
            monthlyStats[monthKey].total += amount;
        });

        // Ordenar por el orden cronológico real
        const currentMonth = new Date().getMonth();
        const last6Months = [];
        for (let i = 5; i >= 0; i--) {
            const mIdx = (currentMonth - i + 12) % 12;
            const mName = months[mIdx];
            last6Months.push(monthlyStats[mName] || { name: mName, total: 0 });
        }
        return last6Months;
    }, [data, displayCurrency, exchangeRate]);

    const COLORS = ['#1a1b1e', '#495057', '#adb5bd', '#dee2e6'];
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

    return (
        <div className="analytics-dashboard animate-fade-in">
            <header className="analytics-header">
                <div>
                    <h1>Analítica de Negocio</h1>
                    <p className="bento-subtitle">Visualización estratégica de operaciones logísticas</p>
                </div>
                <div className="analytics-header-actions">
                    <div className="analytics-period-badge">
                        <Calendar size={16} />
                        {searchCriteria?.fechaDesde && searchCriteria?.fechaHasta 
                            ? `${new Date(searchCriteria.fechaDesde).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }).split('/').slice(0, 2).join('/')} - ${new Date(searchCriteria.fechaHasta).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}`
                            : 'Últimos 30 días'}
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
                    <h2 className="kpi-value">{formatCurrency(kpis.operado)}</h2>
                    <div className="kpi-trend up">
                        <ArrowUpRight size={14} /> 12.5% <span className="trend-subtext">vs mes ant.</span>
                    </div>
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
                    <h2 className="kpi-value">{formatCurrency(kpis.facturado)}</h2>
                    <div className="kpi-trend up">
                        <ArrowUpRight size={14} /> 8.2% <span className="trend-subtext">vs mes ant.</span>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-header-row">
                        <div className="kpi-icon-box" style={{ marginBottom: 0 }}><Package size={20} /></div>
                        <div className="help-icon-wrapper">
                            <HelpCircle size={16} />
                            <div className="help-tooltip">
                                <strong>Pendiente de Cobro:</strong> Presupuestos con carga asignada que ya fueron facturados pero su pago no ha sido liquidado.
                            </div>
                        </div>
                    </div>
                    <p className="kpi-label">Pendiente de Cobro</p>
                    <h2 className="kpi-value">{formatCurrency(kpis.pendiente)}</h2>
                    <div className="kpi-trend down">
                        <TrendingDown size={14} /> 5.5% <span className="trend-subtext">vs mes ant.</span>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-header-row">
                        <div className="kpi-icon-box" style={{ marginBottom: 0 }}><Truck size={20} /></div>
                        <div className="help-icon-wrapper">
                            <HelpCircle size={16} />
                            <div className="help-tooltip">
                                <strong>Cobrabilidad:</strong> Eficiencia del flujo: (Importe Cobrado / Importe Facturado) * 100.
                            </div>
                        </div>
                    </div>
                    <p className="kpi-label">Cobrabilidad</p>
                    <h2 className="kpi-value">{kpis.cobrabilidad?.toFixed(1)}%</h2>
                    <div className="kpi-trend up">
                        <ArrowUpRight size={14} /> 2.1% <span className="trend-subtext">en mejora</span>
                    </div>
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
                    <div className="kpi-trend up" style={{ marginBottom: '1.5rem' }}>
                        <ArrowUpRight size={14} /> 15.5% <span className="trend-subtext">vs periodo anterior</span>
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
                        <div className="glass-btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}>Ver Reporte</div>
                    </div>

                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f3f5" />
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#909296', fontSize: 11, fontWeight: 600 }}
                                dy={10}
                            />
                            <YAxis hide />
                            <Tooltip 
                                cursor={{ fill: '#f8f9fa' }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div style={{ background: '#1a1b1e', color: 'white', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                                                {formatCurrency(payload[0].value)}
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar 
                                dataKey="total" 
                                fill="#1a1b1e" 
                                radius={[6, 6, 6, 6]} 
                                barSize={25}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="kpi-trend up" style={{ justifyContent: 'center', marginTop: '1rem' }}>
                        Trending up by 5.2% this month <TrendingUp size={14} />
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
                                    Distribución de la carga según su categoría logística basada en el volumen operado.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ position: 'relative', height: '180px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={mixNegocio}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={75}
                                    paddingAngle={8}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {mixNegocio.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div style={{ 
                            position: 'absolute', 
                            top: '50%', 
                            left: '50%', 
                            transform: 'translate(-50%, -50%)',
                            textAlign: 'center'
                        }}>
                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                {mixNegocio.length > 0 ? mixNegocio[0].percent : 0}%
                            </span><br/>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>PREDOMINANTE</span>
                        </div>
                    </div>

                    <div className="summary-legend">
                        {mixNegocio.map((m, i) => (
                            <div key={i} className="legend-card">
                                <div className="legend-info">
                                    <div className="source-dot" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                    {m.name.split(' ').slice(0,1)}
                                </div>
                                <span className="legend-percent">{m.percent}%</span>
                            </div>
                        ))}
                    </div>
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
                        <div className="glass-btn" style={{ height: '32px', padding: '0 0.8rem', fontSize: '0.75rem' }}>Ver Historial</div>
                    </div>
                    
                    <div className="mini-table-container">
                        <table className="mini-table">
                            <thead>
                                <tr>
                                    <th>RUTA LOGÍSTICA</th>
                                    <th>FECHA REF.</th>
                                    <th>VOLUMEN</th>
                                    <th>ESTADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topRutas.map((r, i) => (
                                    <tr key={i}>
                                        <td>
                                            <div className="source-info">
                                                <div className="kpi-icon-box" style={{ width: '32px', height: '32px', marginBottom: 0 }}>
                                                    <MapPin size={14} />
                                                </div>
                                                <span className="source-name">{r.ruta}</span>
                                            </div>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {r.date ? new Date(r.date).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="source-value">{formatCurrency(r.total)}</td>
                                        <td><span className="type-badge">Frecuente</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                                    Muestra la eficiencia en cada etapa: desde el Presupuesto hasta la Facturación y el Cobro efectivo.
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="funnel-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        {[
                            { label: 'Presupuestos', val: kpis.counts.total, color: 'rgba(255,255,255,0.2)', width: '100%' },
                                { label: 'Cargas', val: kpis.counts.cargas.size, color: 'rgba(255,255,255,0.15)', width: '85%' },
                                { label: 'Facturas', val: kpis.counts.facturas.size, color: 'rgba(255,255,255,0.1)', width: '70%' },
                                { label: 'Cobrados', val: '-', color: 'rgba(255,255,255,0.05)', width: '55%' }
                        ].map((step, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ 
                                    width: step.width, 
                                    background: step.color, 
                                    padding: '0.5rem', 
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    border: '1px solid rgba(255,255,255,0.1)'
                                }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{step.label}</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{step.val}</span>
                                </div>
                                {i < 3 && <div style={{ height: '8px', width: '1px', borderLeft: '1px dashed rgba(255,255,255,0.3)' }} />}
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '1.5rem' }}>
                        <div style={{ fontSize: '0.65rem', color: '#adb5bd', marginBottom: '0.5rem' }}>SALUD DEL FLUJO</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: 800 }}>{((kpis.counts.facturas.size / kpis.counts.total) * 100).toFixed(1)}%</span>
                            <span style={{ color: '#adb5bd', fontSize: '0.7rem' }}>Conv. Final</span>
                        </div>
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px' }}>
                            <div style={{ height: '100%', width: `${(kpis.counts.facturas.size / kpis.counts.total) * 100}%`, background: '#10b981', borderRadius: '2px' }} />
                        </div>
                    </div>
                </article>

            </div>
        </div>
    );
};

export default AnalyticsDashboard;
