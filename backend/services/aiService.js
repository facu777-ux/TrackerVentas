const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg, err) => console.error(`[ERROR] ${msg}`, err)
};

/**
 * Retorna fecha y hora actual del servidor en formato legible
 */
function obtenerFechaHoraActual() {
    const ahora = new Date();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${dias[ahora.getDay()]} ${String(ahora.getDate()).padStart(2, '0')} de ${meses[ahora.getMonth()]} de ${ahora.getFullYear()}, ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')} hs`;
}

/**
 * Genera el contexto del sistema con instrucciones de experto
 */
function generarContextoSistema(fechaHoraActual) {
    return `Sos el asistente inteligente de DIBIAGI Ventas (DIBIAGI AI). Tu prioridad es el seguimiento (tracking) de PRs, Cargas y Facturas.
        Fecha/hora de referencia del servidor: ${fechaHoraActual}.
        Responde siempre en espanol rioplatense (de Argentina), tecnico pero cercano.
        No inventes datos que no esten en el contexto.
        Si no tenes un identificador concreto, pedi una aclaracion breve.

CONTEXTO DE NEGOCIO:
1. PR (Presupuesto / Solicitud)
2. Carga (Logística)
3. Factura (Venta finalizada)

INNOVACIÓN EN TRACKING:
Si detectás un número específico de PR, Carga o Factura, debés incluir al FINAL de tu respuesta un objeto JSON compacto con la información de seguimiento técnica de la siguiente forma (esto será capturado por el sistema para renderizar una tarjeta visual):

JSON_TRACKER: { "tipo": "PR|CARGA|FACTURA", "valor": "número", "estado": "Pendiente|En Proceso|Finalizado", "criticidad": "baja|media|alta" }

NAVEGACIÓN:
Si queres disparar navegación, usa SOLO uno de estos formatos (maximo 1 por respuesta, siempre al final):
- ACTION:NAVIGATE|VIEW:dashboard
- ACTION:NAVIGATE|VIEW:analitica
- ACTION:NAVIGATE|VIEW:logistica
- ACTION:NAVIGATE|PR:3315
- ACTION:NAVIGATE|CARGA:4915
- ACTION:NAVIGATE|FACTURA:9001
- ACTION:NAVIGATE|RECIBO:1234

No uses formatos legacy como ACTION:NAVIGATE|TYPE|ID ni ACTION:HIGHLIGHT|VALUE:[número].`;
}

/**
 * Formatea los datos de contexto para Claude
 * @param {Array} data - Registros actuales
 */
function formatearDatosContexto(data) {
    if (!data || data.length === 0) return "No hay datos cargados actualmente.";
    const header = "Empresa | PR | Cliente | Producto | Carga | Factura | Estado\n";
    const body = data.slice(0, 50).map(item => {
        return `${item.FCRMVH_CODEMP} | ${item.NroPR || 'S/N'} | ${(item.NomCliente || '').substring(0, 15)} | ${item.DescrpProd?.substring(0, 10)} | ${item.CodigoCarga || '-'} | ${item.FacturaAsociadaOP || '-'} | ${item.EstadoFlujo || 'N/D'}`;
    }).join('\n');
    return `DATOS ACTUALES:\n${header}${body}`;
}

/**
 * Parsea la respuesta de Claude para extraer metadatos de tracking y acciones
 */
function parsearRespuestaIA(texto) {
    let trackingData = null;
    let action = null;
    let highlight = null;
    let seccion = null;

    const trackerMatch = texto.match(/JSON_TRACKER:\s*(\{.*?\})/s);
    if (trackerMatch) {
      try { trackingData = JSON.parse(trackerMatch[1]); } catch (e) { logger.warn("Error parseando JSON_TRACKER"); }
    }

    // Formato unificado de navegación a vista
    const navViewMatch = texto.match(/ACTION:NAVIGATE\|VIEW:(dashboard|analitica|logistica)/i);
    if (navViewMatch) {
        action = {
            type: 'NAVIGATE_VIEW',
            view: navViewMatch[1].toLowerCase()
        };
        seccion = navViewMatch[1].toLowerCase();
    }

    // Formato unificado de navegación a registro
    if (!action) {
        const navEntityMatch = texto.match(/ACTION:NAVIGATE\|(PR|CARGA|FACTURA|RECIBO):([A-Za-z0-9-]+)/i);
        if (navEntityMatch) {
            action = {
                type: 'NAVIGATE_TO',
                kind: navEntityMatch[1].toUpperCase(),
                id: navEntityMatch[2]
            };
        }
    }

    // Compatibilidad legacy: ACTION:NAVIGATE|TYPE|ID
    if (!action) {
        const legacyNavMatch = texto.match(/ACTION:NAVIGATE\|([A-Za-z]+)\|([A-Za-z0-9-]+)/i);
        if (legacyNavMatch) {
            action = {
                type: 'NAVIGATE_TO',
                kind: legacyNavMatch[1].toUpperCase(),
                id: legacyNavMatch[2]
            };
        }
    }

    // Compatibilidad legacy: ACTION:HIGHLIGHT|VALUE
    const highMatch = texto.match(/ACTION:HIGHLIGHT\|VALUE:([A-Za-z0-9-]+)/i);
    if (highMatch) highlight = highMatch[1];

    const respuestaLimpia = texto
        .replace(/JSON_TRACKER:\s*\{.*?\}/gs, "")
        .replace(/ACTION:NAVIGATE\|VIEW:(dashboard|analitica|logistica)/gi, "")
        .replace(/ACTION:NAVIGATE\|(PR|CARGA|FACTURA|RECIBO):([A-Za-z0-9-]+)/gi, "")
        .replace(/ACTION:NAVIGATE\|([A-Za-z]+)\|([A-Za-z0-9-]+)/gi, "")
        .replace(/ACTION:HIGHLIGHT\|VALUE:([A-Za-z0-9-]+)/gi, "")
        .trim();

    return { respuestaLimpia, trackingData, action, highlight, seccion };
}

/**
 * Punto de entrada para procesar consultas con la IA
 */
async function procesarPreguntaConIA(pregunta, historial = [], datosContexto = []) {
    try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return { respuesta: "⚠️ Falta ANTHROPIC_API_KEY en servidor.", error: "No API Key" };

        const messages = historial.slice(-10).map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content }));
        messages.push({ role: 'user', content: `CONTEXTO:\n${formatearDatosContexto(datosContexto)}\n\nPREGUNTA: ${pregunta}` });

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({ model: "claude-3-haiku-20240307", max_tokens: 1024, system: generarContextoSistema(obtenerFechaHoraActual()), messages })
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            logger.error(`Anthropic API Error [${response.status}]:`, errorBody);
            throw new Error(`Anthropic API Error: ${response.status}`);
        }
        const data = await response.json();
        const parsed = parsearRespuestaIA(data.content[0].text);

        return {
            respuesta: parsed.respuestaLimpia,
            trackingData: parsed.trackingData,
            action: parsed.action,
            highlight: parsed.highlight,
            seccion: parsed.seccion
        };
    } catch (error) {
        logger.error("Error en aiService:", error);
        return { respuesta: "Error al procesar consulta." };
    }
}

module.exports = { procesarPreguntaConIA };
