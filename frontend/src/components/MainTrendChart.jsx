import React, { useState, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { AreaChart as AreaChartIcon, HelpCircle } from 'lucide-react';
import './MainTrendChart.css';



const MainTrendChart = ({ data, displayCurrency = 'ARS', exchangeRate = 1000, chileExchangeRate = 900 }) => {
  const [timeRange, setTimeRange] = useState('30d');
  const [visibleStates, setVisibleStates] = useState(['Pagado', 'Facturado', 'No Facturado', 'Solo Presupuesto']);

  const handleToggleState = (stateName) => {
    setVisibleStates(prev => {
        if (prev.includes(stateName)) {
            // Si solo queda uno, no permitimos vaciar el gráfico para evitar confusión
            if (prev.length === 1) return prev;
            return prev.filter(s => s !== stateName);
        } else {
            return [...prev, stateName];
        }
    });
  };

  const normalizeAmount = (amount, itemCurrency) => {
    const currency = (itemCurrency || '').toString().toUpperCase().trim();
    const isUSDItem = currency === 'USD' || currency === '2' || currency === 'U$S' || currency === 'DOLARES';
    const isARSItem = !isUSDItem;

    if (displayCurrency === 'ARS' && isARSItem) return amount;
    if ((displayCurrency === 'USD_BNA' || displayCurrency === 'USD_SII') && isUSDItem) return amount;
    
    let rate = 1;
    if (displayCurrency === 'USD_BNA') rate = parseFloat(exchangeRate) || 1000;
    else if (displayCurrency === 'USD_SII') rate = parseFloat(chileExchangeRate) || 900;
    else if (displayCurrency === 'ARS') rate = parseFloat(exchangeRate) || 1000;

    if (displayCurrency === 'ARS' && isUSDItem) return amount * rate;
    if ((displayCurrency === 'USD_BNA' || displayCurrency === 'USD_SII') && isARSItem) return amount / rate;
    
    return amount;
  };

  // Helper para determinar el estado de un item idéntico al Dashboard
  const getEstadoKey = (item) => {
    const factura = item.FacturaAsociadaOP;
    const recibo = item.ReciboCobranza;

    if (recibo && !recibo.includes('Pendiente')) {
        return 'Pagado';
    } else if (factura && !factura.includes('CARGA NO FACTURADA') && !factura.includes('Pendiente')) {
        return 'Facturado';
    } else if (item.CodigoCarga) {
        return 'No Facturado';
    } else {
        return 'Solo Presupuesto';
    }
  };

  // Procesar datos para el gráfico de tendencia (Evolución de montos por día y estado)
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const dailyStats = {};
    
    // Determinamos la fecha de referencia: la última disponible en los datos o "hoy"
    const dates = data.map(i => new Date(i.FchMovimiento || i.FchAltaRegistro)).filter(d => !isNaN(d));
    const anchorDate = dates.length > 0 ? new Date(Math.max(...dates)) : new Date();

    const rangeInDays = timeRange === '7d' ? 7 : (timeRange === '30d' ? 30 : 90);
    const startDate = new Date(anchorDate);
    startDate.setDate(anchorDate.getDate() - rangeInDays);

    data.forEach(item => {
      const dateStr = item.FchMovimiento || item.FchAltaRegistro;
      if (!dateStr) return;
      
      const date = new Date(dateStr);
      if (date < startDate) return;

      const dateKey = date.toISOString().split('T')[0];
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { 
          date: dateKey, 
          'Pagado': 0, 'countPagado': 0,
          'Facturado': 0, 'countFacturado': 0,
          'No Facturado': 0, 'countNo Facturado': 0,
          'Solo Presupuesto': 0, 'countSolo Presupuesto': 0,
          total: 0, 
          count: 0 
        };
      }
      
      const state = getEstadoKey(item);
      const amount = normalizeAmount(item.TotalItem || 0, item.Moneda || item.CodMoneda);
      
      dailyStats[dateKey][state] += amount;
      dailyStats[dateKey][`count${state}`] += 1;
      dailyStats[dateKey].total += amount;
      dailyStats[dateKey].count += 1;
    });

    return Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, timeRange, displayCurrency, exchangeRate, chileExchangeRate]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const sortedPayload = [...payload].sort((a, b) => b.value - a.value);
        return (
            <div className="trend-chart-tooltip glass-card">
                <p className="tooltip-date">{new Date(label).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}</p>
                <div className="tooltip-divider"></div>
                {sortedPayload.map((entry, index) => (
                    <div key={index} className="tooltip-detail">
                        <div className="tooltip-label-group">
                            <span className="dot" style={{ background: entry.color }}></span>
                            <span className="label text-xs">{entry.name} ({entry.payload[`count${entry.name}`]}):</span>
                        </div>
                        <span className="value text-xs">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: displayCurrency }).format(entry.value)}</span>
                    </div>
                ))}
                <div className="tooltip-divider"></div>
                <div className="tooltip-detail total">
                    <span className="label">Total Día ({payload[0].payload.count}):</span>
                    <span className="value">
                        {new Intl.NumberFormat('es-AR', { 
                            style: 'currency', 
                            currency: displayCurrency === 'ARS' ? 'ARS' : 'USD' 
                        }).format(payload.reduce((acc, curr) => acc + curr.value, 0))
                          .replace('USD', displayCurrency === 'USD_BNA' ? 'USD (BNA)' : (displayCurrency === 'USD_SII' ? 'USD (SII)' : 'ARS'))}
                    </span>
                </div>
            </div>
        );
    }
    return null;
  };

  const series = [
    { name: 'Pagado', color: '#10b981', stackId: '1' },
    { name: 'Facturado', color: '#3b82f6', stackId: '1' },
    { name: 'No Facturado', color: '#f59e0b', stackId: '1' },
    { name: 'Solo Presupuesto', color: '#64748b', stackId: '1' }
  ];

  const renderLegend = (props) => {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '24px', 
        marginBottom: '20px',
        padding: '0 10px',
        flexWrap: 'wrap'
      }}>
        {series.map((entry, index) => {
          const isVisible = visibleStates.includes(entry.name);
          return (
            <div 
              key={`item-${index}`}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                opacity: isVisible ? 1 : 0.3,
                filter: isVisible ? 'none' : 'grayscale(1)'
              }}
              onClick={() => handleToggleState(entry.name)}
            >
              <div style={{ 
                width: '10px', 
                height: '10px', 
                borderRadius: '50%', 
                backgroundColor: entry.color,
                marginRight: '8px',
                boxShadow: isVisible ? `0 0 8px ${entry.color}44` : 'none'
              }}></div>
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: '600', 
                color: 'var(--text-primary)',
                letterSpacing: '0.02em'
              }}>
                {entry.name}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="main-trend-chart glass-card fade-in">
      <div className="trend-header">
        <div className="trend-info">
          <div className="trend-title">
            <AreaChartIcon size={20} className="text-primary" />
            <h3>Análisis Temporal de Operaciones</h3>
            <div className="help-icon-wrapper" style={{ marginLeft: '8px' }}>
              <HelpCircle size={14} />
              <div className="help-tooltip">
                Muestra la evolución del volumen acumulado por estado. Útil para detectar cuellos de botella en la facturación o picos de ventas en periodos específicos.
              </div>
            </div>
          </div>
          <p className="trend-subtitle">Desglose de estados financieros en el tiempo</p>
        </div>
        
        <div className="trend-actions">
          <div className="time-range-toggle">
            <button className={timeRange === '7d' ? 'active' : ''} onClick={() => setTimeRange('7d')}>7d</button>
            <button className={timeRange === '30d' ? 'active' : ''} onClick={() => setTimeRange('30d')}>30d</button>
            <button className={timeRange === '90d' ? 'active' : ''} onClick={() => setTimeRange('90d')}>90d</button>
          </div>
        </div>
      </div>

      <div className="trend-body">
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {series.map(s => (
                <linearGradient key={s.name} id={`color${s.name.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.color} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={s.color} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) => new Date(val).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
              tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
              minTickGap={30}
            />
            <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                tickFormatter={(val) => val >= 1000 ? `$${(val/1000).toFixed(0)}k` : `$${val}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} verticalAlign="top" height={40} />
            {series.map(s => (
                <Area 
                    key={s.name}
                    type="monotone" 
                    dataKey={s.name} 
                    stackId={s.stackId}
                    stroke={s.color} 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill={`url(#color${s.name.replace(/\s/g, '')})`} 
                    animationDuration={1500}
                    hide={!visibleStates.includes(s.name)}
                />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MainTrendChart;
