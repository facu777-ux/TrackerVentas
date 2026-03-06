import React from 'react';
import { 
    PieChart, Pie, Cell, ResponsiveContainer, 
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid 
} from 'recharts';
import { TrendingUp, PieChart as PieIcon, BarChart3, Info, HelpCircle } from 'lucide-react';
import './LogisticsCharts.css';

const LogisticsCharts = ({ data, searchTerm = '', searchCarga = '', displayCurrency = 'ARS', exchangeRate = 1000, chileExchangeRate = 900 }) => {
    // 1. Aplicar filtros globales de búsqueda a los datos antes de procesar
    const processedData = React.useMemo(() => {
        if (!searchTerm && !searchCarga) return data;
        
        const searchLower = searchTerm.toLowerCase();
        const cargaLower = searchCarga.toLowerCase();

        return data.filter(item => {
            const matchesGlobal = !searchTerm || (
                item.NroPR?.toString().includes(searchLower) ||
                item.NomCliente?.toLowerCase().includes(searchLower) ||
                item.DescrpProd?.toLowerCase().includes(searchLower) ||
                item.CodigoCarga?.toString().includes(searchLower) ||
                item.FacturaAsociadaOP?.toLowerCase().includes(searchLower)
            );

            const matchesCarga = !searchCarga || (
                item.CodigoCarga?.toString().toLowerCase().includes(cargaLower)
            );

            return matchesGlobal && matchesCarga;
        });
    }, [data, searchTerm, searchCarga]);

    // 2. Data Processing for Status Pie Chart - Grouped by Budget
    const statusData = React.useMemo(() => {
        const counts = {
            'FACTURADOS': 0,
            'NO FACTURADOS': 0,
            'PRESUPUESTO': 0
        };

        const budgetsMap = {};

        processedData.forEach(item => {
            const nroPR = item.NroPR || `SOL-${item.NroSolicitud}`;
            const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
            const key = `${empresa}-${nroPR}`;

            if (!budgetsMap[key]) {
                budgetsMap[key] = { hasCarga: false, hasFactura: false, hasPending: false };
            }

            const factura = item.FacturaAsociadaOP;
            const isFacturado = (item.ReciboCobranza && !item.ReciboCobranza.includes('Pendiente')) || 
                              (factura && !factura.includes('CARGA NO FACTURADA') && !factura.includes('Pendiente'));
            const isPending = item.CodigoCarga && !isFacturado;

            if (item.CodigoCarga) budgetsMap[key].hasCarga = true;
            if (isFacturado) budgetsMap[key].hasFactura = true;
            if (isPending) budgetsMap[key].hasPending = true;
        });

        Object.values(budgetsMap).forEach(b => {
            if (b.hasPending) counts['NO FACTURADOS']++;
            else if (b.hasFactura) counts['FACTURADOS']++; 
            else if (!b.hasCarga) counts['PRESUPUESTO']++;
            else counts['NO FACTURADOS']++; 
        });

        return Object.keys(counts).map(key => ({
            name: key,
            value: counts[key]
        })).filter(d => d.value > 0);
    }, [processedData]);

    // 3. Data Processing for Currency Bar Chart
    const currencyData = React.useMemo(() => {
        const totals = {};
        const budgetsMap = {}; // Para asegurar que sumamos el total del PR solo una vez

        processedData.forEach(item => {
            const nroPR = item.NroPR || `SOL-${item.NroSolicitud}`;
            const empresa = item.FCRMVH_CODEMP || item.EmpresaSolicitud || 'SE-';
            const key = `${empresa}-${nroPR}`;

            // Mapeo robusto de divisas
            let currency = 'ARS';
            const raw = String(item.Moneda || item.CodMoneda || '').toUpperCase().trim();
            if (raw === 'USD' || raw === '2' || raw === 'U$S' || raw === 'DOLARES' || raw === 'DÓLAR') {
                currency = 'USD';
            }

            if (!budgetsMap[key]) {
                budgetsMap[key] = {
                    total: 0,
                    moneda: currency,
                    processedItems: new Set()
                };
            }
            
            let amount = (item.TotalItem || 0);
            
            if (displayCurrency === 'ARS' && currency === 'ARS') {
                // Ya está en ARS
            } else if ((displayCurrency === 'USD_BNA' || displayCurrency === 'USD_SII') && currency === 'USD') {
                // Ya está en USD
            } else {
                let rate = 1;
                if (displayCurrency === 'USD_BNA') rate = parseFloat(exchangeRate) || 1000;
                else if (displayCurrency === 'USD_SII') rate = parseFloat(chileExchangeRate) || 900;
                else if (displayCurrency === 'ARS') rate = parseFloat(exchangeRate) || 1000;

                if (displayCurrency === 'ARS' && currency === 'USD') amount *= rate;
                else if ((displayCurrency === 'USD_BNA' || displayCurrency === 'USD_SII') && currency === 'ARS') amount /= rate;
            }

            budgetsMap[key].total += amount;
        });

        Object.values(budgetsMap).forEach(b => {
            if (!totals[b.moneda]) totals[b.moneda] = 0;
            totals[b.moneda] += b.total;
        });

        return Object.keys(totals).map(key => ({
            moneda: key,
            monto: totals[key]
        }));
    }, [processedData, displayCurrency, exchangeRate, chileExchangeRate]);

    const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#64748b'];

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const isPie = !!data.name; 
            const isBar = !!data.moneda;
            
            return (
                <div className="chart-tooltip">
                    <p className="label">{isPie ? data.name : data.moneda}</p>
                    <p className="intro">
                        {isPie 
                            ? `Cantidad: ${payload[0].value}` 
                            : `Total: ${new Intl.NumberFormat('es-AR', { 
                                style: 'currency', 
                                currency: displayCurrency === 'ARS' ? 'ARS' : 'USD',
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              }).format(payload[0].value).replace('USD', displayCurrency === 'USD_BNA' ? 'USD (BNA)' : (displayCurrency === 'USD_SII' ? 'USD (SII)' : 'ARS'))}`
                        }
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="logistics-charts-wrapper fade-in">
            <div className="chart-card glass">
                <div className="chart-header">
                    <div className="chart-title-area">
                        <PieIcon size={18} className="chart-icon-blue" />
                        <h3>Distribución de Estados</h3>
                    </div>
                    <div className="help-icon-wrapper">
                        <HelpCircle size={16} />
                        <div className="help-tooltip">
                            Proporción de comprobantes según su etapa: Pagados, Facturados o Pendientes de Procesamiento.
                        </div>
                    </div>
                </div>
                <div className="chart-body">
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={statusData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                            >
                                {statusData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="chart-card glass">
                <div className="chart-header">
                    <div className="chart-title-area">
                        <BarChart3 size={18} className="chart-icon-green" />
                        <h3>Totales por Moneda</h3>
                    </div>
                    <div className="help-icon-wrapper">
                        <HelpCircle size={16} />
                        <div className="help-tooltip">
                            Comparativa del volumen operado total agrupado por divisa original (ARS vs USD).
                        </div>
                    </div>
                </div>
                <div className="chart-body">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={currencyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-primary)" />
                            <XAxis 
                                dataKey="moneda" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                                hide
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(var(--primary-rgb), 0.05)' }} />
                            <Bar 
                                dataKey="monto" 
                                fill="var(--accent-blue)" 
                                radius={[4, 4, 0, 0]}
                                barSize={40}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default LogisticsCharts;
