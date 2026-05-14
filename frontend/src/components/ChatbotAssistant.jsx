import React, { useState, useRef, useEffect } from 'react';
import { FaPaperPlane, FaChevronDown } from 'react-icons/fa';
import BotLogo from '../assets/bot-logo.svg';
import { seguimientoAPI } from '../services/api';
import './ChatbotAssistant.css';

/**
 * Formatea el texto de la IA (negritas, saltos de línea)
 * @param {string} text - Contenido del mensaje
 * @returns {JSX.Element[]}
 */
const formatMessage = (text) => {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const parsedLine = parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    return <p key={i} style={{ margin: '4px 0' }}>{parsedLine}</p>;
  });
};

/**
 * Componente de Tarjeta de Seguimiento (Tracker Innovador)
 * @param {Object} props - Datos de la unidad/PR
 */
const TrackingCard = ({ data }) => {
  if (!data) return null;
  const statusClass = data.criticidad === 'alta' ? 'status-critico' : (data.criticidad === 'media' ? 'status-alerta' : 'status-ok');
  
  return (
    <div className="tracking-card">
      <div className="tracking-card-header">
        <span>{data.tipo || 'Seguimiento'}</span>
        <span className={`status-indicator ${statusClass}`}>{data.estado || 'OK'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <div className="tracking-card-label">Identificador</div>
          <div className="tracking-card-value">{data.valor || '-'}</div>
        </div>
        <div>
          <div className="tracking-card-label">Actualización</div>
          <div className="tracking-card-value">{data.fecha || 'Hoy'}</div>
        </div>
      </div>
    </div>
  );
};

const VIEW_LABELS = {
  dashboard: 'Dashboard',
  analitica: 'Analítica',
  logistica: 'Logística'
};

const QUICK_ACTIONS = [
  { key: 'dashboard', label: 'Ver Dashboard', prompt: 'Quiero ver el dashboard' },
  { key: 'analitica', label: 'Ver Analítica', prompt: 'Quiero ver la analítica' },
  { key: 'logistica', label: 'Ver Logística', prompt: 'Quiero ver la logística' },
  { key: 'buscar-pr', label: 'Buscar PR...' },
  { key: 'buscar-carga', label: 'Buscar Carga...' },
  { key: 'buscar-factura', label: 'Buscar Factura...' },
  { key: 'buscar-recibo', label: 'Buscar Recibo...' }
];

const CARGA_LOOKUP_OPTIONS = [
  {
    key: 'commercial',
    label: 'Gestión de Ctas.Ctes. / Ventas',
    targetView: 'dashboard',
    description: 'ideal para ventas y foco administrativo'
  },
  {
    key: 'operational',
    label: 'Gestión Logística (Tráfico)',
    targetView: 'logistica',
    description: 'ideal para análisis logístico'
  }
];

const FACTURA_TYPE_OPTIONS = ['A', 'B', 'E'];
const FACTURA_E_PUNTO_VENTA = '9996';

const parseActionFromText = (text = '') => {
  const navViewMatch = text.match(/ACTION:NAVIGATE\|VIEW:(dashboard|analitica|logistica)/i);
  if (navViewMatch) {
    return {
      type: 'NAVIGATE_VIEW',
      view: navViewMatch[1].toLowerCase()
    };
  }

  const navEntityMatch = text.match(/ACTION:NAVIGATE\|(PR|CARGA|FACTURA|RECIBO):([A-Za-z0-9-]+)/i);
  if (navEntityMatch) {
    return {
      type: 'NAVIGATE_TO',
      kind: navEntityMatch[1].toUpperCase(),
      id: navEntityMatch[2]
    };
  }

  // Compatibilidad legacy
  const legacyMatch = text.match(/ACTION:NAVIGATE\|([A-Za-z]+)\|([A-Za-z0-9-]+)/i);
  if (legacyMatch) {
    return {
      type: 'NAVIGATE_TO',
      kind: legacyMatch[1].toUpperCase(),
      id: legacyMatch[2]
    };
  }

  return null;
};

const limpiarComandos = (text = '') => {
  return text
    .replace(/ACTION:NAVIGATE\|VIEW:(dashboard|analitica|logistica)/gi, '')
    .replace(/ACTION:NAVIGATE\|(PR|CARGA|FACTURA|RECIBO):([A-Za-z0-9-]+)/gi, '')
    .replace(/ACTION:NAVIGATE\|([A-Za-z]+)\|([A-Za-z0-9-]+)/gi, '')
    .trim();
};

const ChatbotAssistant = ({ currentData, onBotAction, onBotSearch }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: '¡Hola! 👋 Soy **DIBIAGI AI**. ¿Qué unidad o PR deseas trackear hoy?',
    timestamp: new Date()
  }]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchIntent, setSearchIntent] = useState(null);
  const [isChoosingCargaMode, setIsChoosingCargaMode] = useState(false);
  const [pointsOfSale, setPointsOfSale] = useState([]);
  const messagesEndRef = useRef(null);
  const pointsWarningLoggedRef = useRef(false);

  const lastRole = messages[messages.length - 1]?.role;
  const showQuickActions = isOpen && !isLoading && !searchIntent && !isChoosingCargaMode && (
    (messages.length === 1 && messages[0].role === 'assistant') ||
    lastRole === 'assistant' ||
    lastRole === 'system'
  );
  const showCargaModeOptions = isOpen && !isLoading && isChoosingCargaMode;
  const showFacturaTypeOptions = isOpen && !isLoading && searchIntent?.kind === 'FACTURA' && searchIntent?.step === 'tipo';
  const showFacturaPointOptions = isOpen && !isLoading && searchIntent?.kind === 'FACTURA' && searchIntent?.step === 'puntoVenta';

  const normalizePointOfSale = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return null;
    return digits.padStart(4, '0');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    const loadPointsOfSale = async () => {
      if (!isOpen || pointsOfSale.length > 0) return;
      try {
        const response = await seguimientoAPI.obtenerPuntosVenta();
        if (response?.success && Array.isArray(response.data)) {
          setPointsOfSale(response.data);
        } else if (!pointsWarningLoggedRef.current) {
          console.warn('Puntos de venta no disponibles para búsqueda guiada:', response?.warning || 'sin detalle');
          pointsWarningLoggedRef.current = true;
        }
      } catch (error) {
        if (!pointsWarningLoggedRef.current) {
          console.warn('No se pudieron cargar puntos de venta para búsqueda guiada.', error);
          pointsWarningLoggedRef.current = true;
        }
      }
    };

    loadPointsOfSale();
  }, [isOpen, pointsOfSale.length]);

  const appendSystemMessage = (content) => {
    setMessages(prev => [...prev, {
      role: 'system',
      content,
      timestamp: new Date()
    }]);
  };

  const notifyNavigation = (action) => {
    if (!action) return;
    if (action.type === 'NAVIGATE_VIEW') {
      const viewName = VIEW_LABELS[action.view] || action.view;
      appendSystemMessage(`Navegando a ${viewName}...`);
      return;
    }
    if (action.type === 'NAVIGATE_TO') {
      appendSystemMessage(`Navegando al ${action.kind} ${action.id}...`);
    }
  };

  const executeActionIfAny = async (action) => {
    if (!action) return;

    if (action.type === 'NAVIGATE_TO' && typeof onBotSearch === 'function') {
      appendSystemMessage(`Buscando ${action.kind} ${action.id} en los resultados...`);
      const searchMeta = await onBotSearch({ kind: action.kind, id: action.id });

      if (!searchMeta?.success) {
        appendSystemMessage(`No pude completar la búsqueda de ${action.kind} ${action.id}. Probá nuevamente en unos segundos.`);
        return;
      }

      if ((searchMeta?.count || 0) === 0) {
        appendSystemMessage(`No encontré resultados para ${action.kind} ${action.id}. Probá con otro número o ampliá el rango de fechas/filtros.`);
        return;
      }

      if (searchMeta?.success && (searchMeta.usedWideFallback || !searchMeta.exactMatchFound)) {
        appendSystemMessage('No encontré coincidencia exacta en el sondeo inicial; amplié el rango de fechas para ubicarla.');
      }

      if (searchMeta?.probeFailed) {
        appendSystemMessage('El sondeo rápido no respondió. Continué con una búsqueda amplia para no frenarte.');
      }
    }

    onBotAction(action);
    notifyNavigation(action);
  };

  const extraerIdentificador = (text = '', kind = 'PR') => {
    const tokens = String(text || '').match(/\d+/g) || [];
    if (!tokens.length) return null;

    const normalizedKind = String(kind || 'PR').toUpperCase();

    const pickStrongestToken = (numericTokens = []) => {
      if (!numericTokens.length) return null;

      return numericTokens.reduce((best, token) => {
        if (!best) return token;
        if (token.length > best.length) return token;
        if (token.length === best.length) return token; // ante empate, priorizamos el más reciente
        return best;
      }, null);
    };

    // Para FACTURA/RECIBO priorizamos el token más significativo (evita tomar punto de venta).
    if (normalizedKind === 'FACTURA' || normalizedKind === 'RECIBO') {
      return pickStrongestToken(tokens);
    }

    return tokens[0];
  };

  const ejecutarBusquedaGuiada = async (lookupId, intent) => {
    if (typeof onBotSearch !== 'function') return;

    const criteriaLabel = intent.kind === 'FACTURA'
      ? ` (Tipo ${intent.facturaTipo || 'N/D'} · PV ${intent.puntoVenta || 'N/D'})`
      : '';

    appendSystemMessage(`Buscando ${intent.kind} ${lookupId}${criteriaLabel} en ${intent.label}...`);
    const result = await onBotSearch({
      kind: intent.kind,
      id: lookupId,
      targetView: intent.targetView,
      facturaTipo: intent.kind === 'FACTURA' ? intent.facturaTipo : null,
      puntoVenta: intent.kind === 'FACTURA' ? intent.puntoVenta : null,
    });

    if (!result?.success) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `No pude completar la búsqueda de ${intent.kind} ${lookupId}. Probá nuevamente en unos segundos.`,
        timestamp: new Date()
      }]);
      return;
    }

    if ((result?.count || 0) === 0) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `No encontré resultados para ${intent.kind} ${lookupId}. Probá con otro número o ajustá el rango de fechas/filtros.`,
        timestamp: new Date()
      }]);
      return;
    }

    if (result.exactMatchFound) {
      appendSystemMessage('Criterio aplicado: matching exacto por tipo y token numérico.');
    } else if (result.usedWideFallback) {
      appendSystemMessage('Criterio aplicado: fallback amplio por ventana extendida (sin match exacto en sondeo inicial).');
    }

    const followAction = intent.targetView === 'dashboard'
      ? { type: 'NAVIGATE_TO', kind: intent.kind, id: lookupId }
      : { type: 'NAVIGATE_VIEW', view: 'logistica' };

    onBotAction(followAction);
    notifyNavigation(followAction);

    const summaryText = intent.targetView === 'dashboard'
      ? `Listo, ya te llevé al contexto de ${intent.kind} ${lookupId}${criteriaLabel} en Dashboard.`
      : `Listo, ya te llevé al contexto operativo de la Carga ${lookupId} en Logística.`;

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: summaryText,
      timestamp: new Date()
    }]);
  };

  const handleSendMessage = async (forcedMessage = null) => {
    const candidate =
      typeof forcedMessage === 'string'
        ? forcedMessage
        : (forcedMessage && typeof forcedMessage?.target?.value === 'string'
          ? forcedMessage.target.value
          : inputValue);

    const rawText = String(candidate || '').trim();
    if (!rawText || isLoading) return;

    const intent = searchIntent;
    const userMsg = { role: 'user', content: rawText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    if (intent) {
      try {
        if (intent.kind === 'FACTURA' && intent.step === 'tipo') {
          const selectedType = String(rawText || '').trim().toUpperCase();
          if (!FACTURA_TYPE_OPTIONS.includes(selectedType)) {
            appendSystemMessage('Tipo inválido. Elegí Factura A, B o E.');
            return;
          }

          if (selectedType === 'E') {
            setSearchIntent(prev => ({
              ...prev,
              facturaTipo: selectedType,
              puntoVenta: FACTURA_E_PUNTO_VENTA,
              step: 'numero'
            }));
            appendSystemMessage(`Tipo E seleccionado. Para Factura E el punto de venta es ${FACTURA_E_PUNTO_VENTA} (obligatorio). Ahora indicame el número de factura.`);
            return;
          }

          setSearchIntent(prev => ({ ...prev, facturaTipo: selectedType, step: 'puntoVenta' }));
          appendSystemMessage('Perfecto. Ahora indicame el punto de venta (ej: 0001).');
          return;
        }

        if (intent.kind === 'FACTURA' && intent.step === 'puntoVenta') {
          const normalizedPV = normalizePointOfSale(rawText);
          if (!normalizedPV) {
            appendSystemMessage('Necesito un punto de venta válido para continuar (ej: 0001).');
            return;
          }

          const knownPV = pointsOfSale.some(pv => normalizePointOfSale(pv.sucursalId) === normalizedPV);
          if (pointsOfSale.length > 0 && !knownPV) {
            appendSystemMessage(`No encontré el punto de venta ${normalizedPV} en la lista actual. Si estás seguro, enviá nuevamente para continuar.`);
            setSearchIntent(prev => ({ ...prev, puntoVenta: normalizedPV, step: 'puntoVenta-confirm' }));
            return;
          }

          setSearchIntent(prev => ({ ...prev, puntoVenta: normalizedPV, step: 'numero' }));
          appendSystemMessage(`Bien, buscaré Factura ${intent.facturaTipo} en punto de venta ${normalizedPV}. Ahora indicame el número de factura.`);
          return;
        }

        if (intent.kind === 'FACTURA' && intent.step === 'puntoVenta-confirm') {
          setSearchIntent(prev => ({ ...prev, step: 'numero' }));
          appendSystemMessage(`Perfecto, continuo con punto de venta ${intent.puntoVenta}. Ahora indicame el número de factura.`);
          return;
        }

        setSearchIntent(null);
        const lookupId = extraerIdentificador(rawText, intent.kind);
        if (!lookupId) {
          appendSystemMessage(`Necesito un número válido para continuar con ${intent.kind}.`);
          return;
        }

        await ejecutarBusquedaGuiada(lookupId, intent);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const response = await fetch('/api/chatbot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pregunta: rawText,
          historial: messages.slice(-10),
          datosContexto: currentData
        })
      });

      const data = await response.json();
      if (data.success) {
        const navData = data.action || parseActionFromText(data.respuesta);
        const cleanText = limpiarComandos(data.respuesta);
        await executeActionIfAny(navData);

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: cleanText,
          timestamp: new Date(),
          trackingData: data.trackingData
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error de conexión.', timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (quickAction) => {
    if (quickAction.key === 'buscar-pr') {
      setIsChoosingCargaMode(false);
      setSearchIntent({ kind: 'PR', targetView: 'dashboard', label: 'Gestión de Ctas.Ctes. / Ventas' });
      appendSystemMessage('Indicame el número de PR que querés buscar.');
      return;
    }

    if (quickAction.key === 'buscar-carga') {
      setSearchIntent(null);
      setIsChoosingCargaMode(true);
      appendSystemMessage('¿Cómo querés buscar la carga? Elegí una modalidad para continuar.');
      return;
    }

    if (quickAction.key === 'buscar-factura') {
      setIsChoosingCargaMode(false);
      setSearchIntent({ kind: 'FACTURA', targetView: 'dashboard', label: 'Gestión de Ctas.Ctes. / Ventas', step: 'tipo', facturaTipo: null, puntoVenta: null });
      appendSystemMessage('Elegí el tipo de factura que querés buscar: A, B o E.');
      return;
    }

    if (quickAction.key === 'buscar-recibo') {
      setIsChoosingCargaMode(false);
      setSearchIntent({ kind: 'RECIBO', targetView: 'dashboard', label: 'Gestión de Ctas.Ctes. / Ventas' });
      appendSystemMessage('Indicame el número de Recibo que querés buscar.');
      return;
    }

    handleSendMessage(quickAction.prompt);
  };

  const handleCargaModeSelection = (option) => {
    setIsChoosingCargaMode(false);
    setSearchIntent({ kind: 'CARGA', targetView: option.targetView, label: option.label });
    appendSystemMessage(`Perfecto, vamos con ${option.label} (${option.description}). Ahora indicame el número de Carga.`);
  };

  const handleCancelGuidedSearch = () => {
    setIsChoosingCargaMode(false);
    setSearchIntent(null);
    setInputValue('');
    appendSystemMessage('Búsqueda guiada cancelada. Cuando quieras, elegí una acción rápida de nuevo.');
  };

  const handleFacturaTypeSelection = (tipo) => {
    if (!searchIntent || searchIntent.kind !== 'FACTURA') return;

    if (tipo === 'E') {
      setSearchIntent(prev => ({
        ...prev,
        facturaTipo: tipo,
        puntoVenta: FACTURA_E_PUNTO_VENTA,
        step: 'numero'
      }));
      appendSystemMessage(`Tipo E seleccionado. Para Factura E el punto de venta es ${FACTURA_E_PUNTO_VENTA} (obligatorio). Ahora indicame el número de factura.`);
      return;
    }

    setSearchIntent(prev => ({ ...prev, facturaTipo: tipo, step: 'puntoVenta' }));
    appendSystemMessage(`Tipo de factura ${tipo} seleccionado. Ahora elegí o escribí el punto de venta.`);
  };

  const handleFacturaPointSelection = (sucursalId) => {
    if (!searchIntent || searchIntent.kind !== 'FACTURA') return;
    const normalizedPV = normalizePointOfSale(sucursalId);
    if (!normalizedPV) return;
    setSearchIntent(prev => ({ ...prev, puntoVenta: normalizedPV, step: 'numero' }));
    appendSystemMessage(`Punto de venta ${normalizedPV} seleccionado. Ahora indicame el número de factura.`);
  };

  return (
    <div className="chatbot-container">
      {!isOpen ? (
        <button className="chatbot-fab" onClick={() => setIsOpen(true)}>
          <img src={BotLogo} alt="AI Bot" />
        </button>
      ) : (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <div className="header-info">
              <div className="bot-avatar"><img src={BotLogo} alt="Avatar" width="20" /></div>
              <div>
                <h3>DIBIAGI AI</h3>
                <span className="status-online">Operativo</span>
              </div>
            </div>
            <button className="close-btn" onClick={() => setIsOpen(false)}><FaChevronDown /></button>
          </div>

          <div className="chatbot-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message-bubble ${msg.role}`}>
                <div className="bubble-content">
                  {msg.role === 'assistant' ? formatMessage(msg.content) : msg.content}
                  {msg.trackingData && <TrackingCard data={msg.trackingData} />}
                </div>
                <div className="bubble-time">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}

            {showQuickActions && (
              <div className="quick-actions-row">
                {QUICK_ACTIONS.map((quickAction) => (
                  <button
                    key={quickAction.key}
                    className="quick-action-chip"
                    onClick={() => handleQuickAction(quickAction)}
                    disabled={isLoading}
                    type="button"
                  >
                    {quickAction.label}
                  </button>
                ))}
              </div>
            )}

            {showCargaModeOptions && (
              <div className="quick-actions-row">
                {CARGA_LOOKUP_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    className="quick-action-chip"
                    onClick={() => handleCargaModeSelection(option)}
                    disabled={isLoading}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  className="quick-action-chip quick-action-chip-cancel"
                  onClick={handleCancelGuidedSearch}
                  disabled={isLoading}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            )}

            {showFacturaTypeOptions && (
              <div className="quick-actions-row">
                {FACTURA_TYPE_OPTIONS.map((tipo) => (
                  <button
                    key={tipo}
                    className="quick-action-chip"
                    onClick={() => handleFacturaTypeSelection(tipo)}
                    type="button"
                  >
                    Factura {tipo}
                  </button>
                ))}
              </div>
            )}

            {showFacturaPointOptions && pointsOfSale.length > 0 && (
              <div className="quick-actions-row">
                {pointsOfSale.slice(0, 8).map((pv) => (
                  <button
                    key={`${pv.empresaId}-${pv.sucursalId}`}
                    className="quick-action-chip"
                    onClick={() => handleFacturaPointSelection(pv.sucursalId)}
                    type="button"
                  >
                    {pv.sucursalId}
                  </button>
                ))}
              </div>
            )}

            {searchIntent && !isLoading && (
              <div className="quick-actions-row">
                <button
                  className="quick-action-chip quick-action-chip-cancel"
                  onClick={handleCancelGuidedSearch}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            )}

            {isLoading && <div className="message-bubble assistant"><div className="typing-indicator"><span></span><span></span><span></span></div></div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="chatbot-input-area">
            <input
              type="text"
              placeholder={
                searchIntent?.kind === 'FACTURA' && searchIntent?.step === 'tipo'
                  ? 'Ingresá tipo de factura (A/B/E)...'
                  : searchIntent?.kind === 'FACTURA' && (searchIntent?.step === 'puntoVenta' || searchIntent?.step === 'puntoVenta-confirm')
                    ? 'Ingresá punto de venta (ej: 0001)...'
                    : searchIntent
                      ? `Ingresá el número de ${searchIntent.kind}...`
                      : 'Escribe tu consulta...'
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isLoading}
            />
            <button className="send-btn" onClick={() => handleSendMessage()} disabled={!inputValue.trim() || isLoading}><FaPaperPlane /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatbotAssistant;
