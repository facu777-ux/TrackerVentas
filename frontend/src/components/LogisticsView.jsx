import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Truck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Box, 
  TrendingUp, 
  FileText,
  MapPin,
  PieChart as PieChartIcon,
  BarChart3,
  HelpCircle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ReChartsTooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { format, isBefore, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { seguimientoAPI } from '../services/api';
import './LogisticsView.css';

/**
 * LogisticsView — Panel de Gestión Operativa
 * Visualiza KPIs logísticos, Gráficos de rendimiento y tabla de cargas con alertas.
 */
const LogisticsView = ({ data = [], loading = false, searchCriteria = {} }) => {
  const [showHelp, setShowHelp] = useState({ distribution: false, status: false });
  const [comparativeData, setComparativeData] = useState([]);
  const [loadingComparative, setLoadingComparative] = useState(false);
  const [activeStatusIndex, setActiveStatusIndex] = useState(null);
  const [activeBarIndex, setActiveBarIndex] = useState(null);

  // 1. Fetch de datos comparativos (Todas las empresas del grupo)
  useEffect(() => {
    const fetchComparative = async () => {
      // Si no hay filtro de empresa, la data ya es el grupo completo o lo que devolvió la búsqueda
      if (!searchCriteria?.empresa) {
          setComparativeData(data);
          return;
      }

      try {
        setLoadingComparative(true);
        // Petición global para el mismo periodo pero sin filtro de empresa
        // Aumentamos el límite para asegurar que vemos datos de otras empresas
        const globalCriteria = { ...searchCriteria, empresa: null, limit: 1000 };
        const result = await seguimientoAPI.buscarSeguimiento(globalCriteria);
        if (result && result.success) {
            setComparativeData(result.data);
        } else {
            setComparativeData(data);
        }
      } catch (err) {
        console.error("Error fetching comparative logistics data:", err);
        setComparativeData(data);
      } finally {
        setLoadingComparative(false);
      }
    };

    if (data && data.length > 0) {
        fetchComparative();
    } else {
        setComparativeData([]);
    }
  }, [searchCriteria, data?.length]);

  // 2. Procesar métricas y tabla
  const processed = useMemo(() => {
    if (!data || !data.length) return { sortedData: [], metrics: {}, statusData: [] };
    
    const hoy = new Date();
    const uniqueCargas = {};
    // Pre-procesar para evitar cálculos repetitivos
    data.forEach(item => {
      const cargaId = item.IdCarga || item.CodigoCarga;
      if (!cargaId || uniqueCargas[cargaId]) return;
      
      const fechaCargaRaw = item.FechaCarga || item.FecAltCarga;
      const fechaEntregaRaw = item.FechaEntrega;
      
      let isOverdue = false;
      if (fechaEntregaRaw) {
        const dateEntrega = parseISO(fechaEntregaRaw);
        if (isValid(dateEntrega) && isBefore(dateEntrega, hoy)) isOverdue = true;
      } else if (fechaCargaRaw) {
        const dateCarga = parseISO(fechaCargaRaw);
        if (isValid(dateCarga)) {
          const diffDays = Math.ceil(Math.abs(hoy - dateCarga) / (1000 * 60 * 60 * 24));
          if (diffDays > 5 && (!item.FacturaAsociadaOP || item.FacturaAsociadaOP.includes('Pendiente'))) {
            isOverdue = true;
          }
        }
      }

      uniqueCargas[cargaId] = {
        ...item,
        isOverdue,
        statusLabel: isOverdue ? 'Vencido' : (item.FechaEntrega ? 'Entregado' : 'Pendiente')
      };
    });

    const sortedData = Object.values(uniqueCargas).sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return new Date(b.FechaCarga || b.FecAltCarga) - new Date(a.FechaCarga || a.FecAltCarga);
    });

    const total = sortedData.length;
    const overdue = sortedData.filter(i => i.isOverdue).length;
    const delivered = sortedData.filter(i => i.FechaEntrega).length;
    const pending = total - delivered;
    const efficiency = total > 0 ? Math.round(((total - overdue) / total) * 100) : 0;

    const statusData = [
        { name: 'Entregado', value: delivered, color: '#10b981' },
        { name: 'Vencido', value: overdue, color: '#ef4444' },
        { name: 'Pendiente', value: Math.max(0, pending - overdue), color: '#f59e0b' }
    ].filter(s => s.value > 0);

    return { sortedData, metrics: { total, overdue, delivered, pending, efficiency }, statusData };
  }, [data]);

  // 3. Procesar Gráfico de Distribución (Global)
  const chartData = useMemo(() => {
    const targetData = comparativeData.length > 0 ? comparativeData : data;
    // Iniciamos con las principales pero permitimos que crezca dinámicamente
    const companyMap = { 'DIBIAG': 0, 'FP': 0, 'MULTIM': 0, 'LAR': 0, 'ROSANA': 0 };

    targetData.forEach(item => {
        // Usar los alias definidos en el backend (seguimiento.js)
        const emp = item.EmpresaCarga || item.EmpOri || item.EmpresaSolicitud || item.FCRMVH_CODEMP;
        if (emp) {
            companyMap[emp] = (companyMap[emp] || 0) + 1;
        }
    });

    // Filtramos para mostrar solo las que tienen datos o las 3 principales
    return Object.entries(companyMap)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0 || ['DIBIAG', 'FP', 'MULTIM'].includes(item.name));
  }, [comparativeData, data]);

  const selectedCompany = searchCriteria?.empresa || null;

  if (loading) return <div className="logistics-empty"><div className="premium-spinner"></div><p>Sincronizando flujos...</p></div>;
  if (!processed.sortedData.length) return <div className="logistics-empty"><Box size={64} strokeWidth={1}/><p>Inicia una búsqueda para ver el panel de Logística.</p></div>;

  return (
    <motion.div className="logistics-view" initial={{opacity:0}} animate={{opacity:1}}>
      <div className="logistics-header">
        <div className="logistics-title-group">
          <h2>Logística Operativa</h2>
          <p>Control de trazabilidad de cargas y auditoría de cumplimiento.</p>
        </div>
      </div>

      <div className="logistics-kpi-grid">
        <div className="logistics-kpi-card">
          <div className="kpi-icon-wrapper blue"><Truck size={20} /></div>
          <span className="kpi-label">Cargas Activas</span>
          <div className="kpi-value">{processed.metrics.total}</div>
        </div>
        <div className="logistics-kpi-card">
          <div className="kpi-icon-wrapper red"><AlertTriangle size={20} /></div>
          <span className="kpi-label">Vencidas</span>
          <div className="kpi-value">{processed.metrics.overdue}</div>
        </div>
        <div className="logistics-kpi-card">
          <div className="kpi-icon-wrapper orange"><Clock size={20} /></div>
          <span className="kpi-label">Pendientes</span>
          <div className="kpi-value">{processed.metrics.pending}</div>
        </div>
        <div className="logistics-kpi-card">
          <div className="kpi-icon-wrapper green"><TrendingUp size={20} /></div>
          <span className="kpi-label">Cumplimiento</span>
          <div className="kpi-value">{processed.metrics.efficiency}%</div>
        </div>
      </div>

      <div className="logistics-charts-row">
        <div className="logistics-chart-card">
          <div className="chart-header-premium">
            <span className="chart-title"><BarChart3 size={16}/> Distribución por Empresa</span>
            <div className="help-icon-wrapper" onMouseEnter={() => setShowHelp(p => ({...p, distribution: true}))} onMouseLeave={() => setShowHelp(p => ({...p, distribution: false}))}>
               <HelpCircle size={16} />
               <AnimatePresence>
                 {showHelp.distribution && (
                   <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} exit={{opacity:0}} className="help-tooltip-bubble">
                      Compara el volumen operativo entre empresas. 
                      La barra <strong>Azul</strong> resalta la empresa de tu búsqueda actual.
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>
          </div>
          <div className="chart-container-height">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="barGradSelected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={1} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="barGradOther" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e2e8f0" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.3} />
                  </linearGradient>
                  <filter id="barShadow" height="150%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
                    <feOffset in="blur" dx="2" dy="2" result="offsetBlur" />
                    <feComponentTransfer in="offsetBlur" result="shadowAlpha">
                      <feFuncA type="linear" slope="0.3" />
                    </feComponentTransfer>
                    <feComposite in="SourceGraphic" in2="shadowAlpha" operator="over" />
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-primary)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--text-secondary)'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--text-secondary)'}} />
                <ReChartsTooltip 
                    cursor={{fill: 'var(--bg-card)', fillOpacity: 0.1}}
                    contentStyle={{
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--border-primary)', 
                        borderRadius: '8px',
                        backdropFilter: 'blur(10px)'
                    }} 
                />
                <Bar 
                    dataKey="value" 
                    barSize={32}
                    onMouseEnter={(_, index) => setActiveBarIndex(index)}
                    onMouseLeave={() => setActiveBarIndex(null)}
                    shape={(props) => {
                        const { x, y, width, height, index, name } = props;
                        const isSelected = name === selectedCompany;
                        const isHovered = activeBarIndex === index;
                        
                        // Efecto de elevación al hacer hover
                        const hoverLift = isHovered ? 5 : 0;
                        const finalY = y - hoverLift;
                        const finalHeight = height + hoverLift;
                        
                        const fill = isSelected ? 'url(#barGradSelected)' : 'url(#barGradOther)';
                        const depth = 6;
                        
                        return (
                            <g filter="url(#barShadow)" style={{ transition: 'all 0.3s ease' }}>
                                {/* Cara Lateral - Profundidad */}
                                <path 
                                    d={`M ${x + width},${finalY} L ${x + width + depth},${finalY - depth} L ${x + width + depth},${finalY + finalHeight - depth} L ${x + width},${finalY + finalHeight} Z`} 
                                    fill={isSelected ? '#1d4ed8' : '#94a3b8'} 
                                    fillOpacity={isHovered ? 1 : 0.8}
                                    style={{ transition: 'all 0.3s ease' }}
                                />
                                {/* Cara Superior - Tapa */}
                                <path 
                                    d={`M ${x},${finalY} L ${x + depth},${finalY - depth} L ${x + width + depth},${finalY - depth} L ${x + width},${finalY} Z`} 
                                    fill={isHovered ? '#fff' : (isSelected ? '#93c5fd' : '#f1f5f9')}
                                    fillOpacity={0.9}
                                    style={{ transition: 'all 0.3s ease' }}
                                />
                                {/* Cara Frontal Principal */}
                                <rect 
                                    x={x} 
                                    y={finalY} 
                                    width={width} 
                                    height={finalHeight} 
                                    fill={fill} 
                                    rx={2}
                                    style={{ 
                                        transition: 'all 0.3s ease',
                                        filter: isHovered ? 'brightness(1.1)' : 'none'
                                    }}
                                />
                            </g>
                        );
                    }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="logistics-chart-card">
          <div className="chart-header-premium">
            <span className="chart-title"><PieChartIcon size={16}/> Estado de Entregas</span>
            <div className="help-icon-wrapper" onMouseEnter={() => setShowHelp(p => ({...p, status: true}))} onMouseLeave={() => setShowHelp(p => ({...p, status: false}))}>
               <HelpCircle size={16} />
               <AnimatePresence>
                 {showHelp.status && (
                   <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} exit={{opacity:0}} className="help-tooltip-bubble">
                      Muestra el avance del ciclo logístico. 
                      <strong>Vencido:</strong> Cargas sin registro de entrega factible (Alertas de auditoría).
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>
          </div>
          <div className="chart-container-height">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                   <filter id="shadow3d" height="200%">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
                      <feOffset in="blur" dx="0" dy="5" result="offsetBlur" />
                      <feComponentTransfer in="offsetBlur" result="shadowAlpha">
                         <feFuncA type="linear" slope="0.3" />
                      </feComponentTransfer>
                      <feComposite in="SourceGraphic" in2="shadowAlpha" operator="over" />
                   </filter>
                   {processed.statusData.map((entry, idx) => (
                      <linearGradient id={`grad-${idx}`} key={idx} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                        <stop offset="100%" stopColor={entry.color} stopOpacity={0.7} />
                      </linearGradient>
                   ))}
                </defs>
                {/* Capa de profundidad (Sombra y grosor) */}
                <Pie 
                  data={processed.statusData} 
                  innerRadius={58} 
                  outerRadius={78} 
                  paddingAngle={5} 
                  dataKey="value"
                  cy="54%"
                  stroke="none"
                  isAnimationActive={false}
                >
                  {processed.statusData.map((entry, index) => (
                    <Cell key={`depth-${index}`} fill="#000" fillOpacity={0.2} />
                  ))}
                </Pie>
                {/* Pie Principal con Efectos e Interacción */}
                <Pie 
                  data={processed.statusData} 
                  innerRadius={60} 
                  outerRadius={80} 
                  paddingAngle={5} 
                  dataKey="value"
                  cy="50%"
                  stroke="var(--bg-card)"
                  strokeWidth={1}
                  filter="url(#shadow3d)"
                  onMouseEnter={(_, index) => setActiveStatusIndex(index)}
                  onMouseLeave={() => setActiveStatusIndex(null)}
                  animationDuration={500}
                >
                  {processed.statusData.map((entry, index) => (
                    <Cell 
                        key={`cell-${index}`} 
                        fill={`url(#grad-${index})`} 
                        style={{ 
                            outline: 'none', 
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            filter: activeStatusIndex === index ? 'brightness(1.1) saturate(1.2)' : 'none'
                        }}
                        scale={activeStatusIndex === index ? 1.05 : 1}
                        stroke={activeStatusIndex === index ? entry.color : 'var(--bg-card)'}
                        strokeWidth={activeStatusIndex === index ? 2 : 1}
                    />
                  ))}
                </Pie>
                <ReChartsTooltip 
                  contentStyle={{
                    background: 'var(--bg-card)', 
                    border: '1px solid var(--border-primary)', 
                    borderRadius: '8px',
                    backdropFilter: 'blur(10px)'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="logistics-table-container">
        <div className="table-header-actions"><span className="table-title">Despachos Pendientes de Entrega</span></div>
        <table className="logistics-premium-table">
          <thead>
            <tr><th>Carga</th><th>Cliente</th><th>Carga</th><th>Ruta</th><th>Estado</th><th>Entrega</th></tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {processed.sortedData.slice(0, 50).map((item, idx) => (
                <motion.tr 
                  key={item.CodigoCarga || idx} 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <td><div className="carga-cell"><span className="carga-id">#{item.CodigoCarga}</span><span className="pr-id-sub">PR:{item.NroPR || item.NroSolicitud}</span></div></td>
                  <td><div className="cliente-cell"><span className="cliente-name">{item.NomCliente}</span><span className="cliente-code">ID:{item.CodCliente}</span></div></td>
                  <td className="date-cell">{item.FechaCarga ? format(parseISO(item.FechaCarga), 'dd/MM/yy') : 'S/F'}</td>
                  <td style={{fontSize:'0.75rem', color:'var(--text-secondary)'}}><MapPin size={10} style={{verticalAlign:'middle'}}/> {item.LocalizacionEntregaOP || 'S/D'}</td>
                  <td><span className={`status-badge ${item.isOverdue ? 'vencido' : (item.FechaEntrega ? 'al-dia' : 'pendiente')}`}>{item.statusLabel}</span></td>
                  <td className={`date-cell ${item.isOverdue ? 'vencido-text' : ''}`}>{item.FechaEntrega ? format(parseISO(item.FechaEntrega), 'dd/MM/yy') : (item.isOverdue ? 'VENCIDO' : 'Pendiente')}</td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

export default LogisticsView;
