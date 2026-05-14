const https = require("https");

// Simple In-Memory Cache Object
const cache = {
  bna: { data: null, timestamp: null },
  sii: { data: null, timestamp: null }
};

// Configurable cache duration: 12 hours
const CACHE_DURATION = 12 * 60 * 60 * 1000;

/**
 * Helper native fetch logic over standard HTTPS
 * @param {string} url - Target URL
 * @returns {Promise<any>}
 */
const fetchHttps = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TrackerVentasBackend/1.0" } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            console.error(`[Exchange API] Error statusCode: ${res.statusCode} for ${url}`);
            resolve(null); // Return null instead of rejecting to fallback
          }
        } catch (e) {
          console.error(`[Exchange API] Parsing error for ${url}:`, e.message);
          resolve(null);
        }
      });
    }).on('error', (err) => {
      console.error(`[Exchange API] Network error for ${url}:`, err.message);
      resolve(null);
    });
  });
};

/**
 * Obtener cotización Dólar Oficial BNA (Argentina)
 */
const getDolarBNA = async (req, res) => {
  try {
    const now = Date.now();
    
    // Check Cache
    if (cache.bna.data && cache.bna.timestamp && (now - cache.bna.timestamp < CACHE_DURATION)) {
      console.log("[Cache] Retornando cotización BNA desde caché");
      return res.json(cache.bna.data);
    }

    // Call API
    console.log("[Exchange API] Peticionando BNA a dolarapi.com...");
    const data = await fetchHttps("https://dolarapi.com/v1/dolares/oficial");
    
    if (data && data.venta) {
      cache.bna = { data, timestamp: now };
      return res.json(data);
    } else {
      throw new Error("Respuesta inválida de la API de Dolar");
    }

  } catch (error) {
    console.error("Error GetDolarBNA:", error.message);
    // Respuesta fallback estructurada como la API original
    res.json({ venta: 1000, fallback: true, message: error.message });
  }
};

/**
 * Obtener cotización Dólar SII Observado (Chile)
 */
const getDolarSII = async (req, res) => {
  try {
    const now = Date.now();
    
    // Check Cache
    if (cache.sii.data && cache.sii.timestamp && (now - cache.sii.timestamp < CACHE_DURATION)) {
      console.log("[Cache] Retornando cotización SII desde caché");
      return res.json(cache.sii.data);
    }

    // Call API
    console.log("[Exchange API] Peticionando SII a mindicador.cl...");
    const data = await fetchHttps("https://mindicador.cl/api/dolar");
    
    if (data && data.serie && data.serie.length > 0) {
      cache.sii = { data, timestamp: now };
      return res.json(data);
    } else {
      throw new Error("Respuesta inválida de la API de Chile");
    }

  } catch (error) {
    console.error("Error GetDolarSII:", error.message);
    // Respuesta fallback estructurada como la API original
    res.json({ serie: [{ valor: 950 }], fallback: true, message: error.message });
  }
};

module.exports = {
  getDolarBNA,
  getDolarSII
};
