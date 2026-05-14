const BASE_URL = process.env.DIBIAGI_SALES_API_BASE_URL || "https://apirest-dibiagi.onrender.com/sales/v1";
const API_KEY = process.env.DIBIAGI_SALES_API_KEY || process.env.API_KEY;

const CACHE_TTL_MS = 10 * 60 * 1000;
let pointsCache = {
  data: null,
  timestamp: 0,
};

const normalizePoint = (row = {}) => ({
  empresaId: row.EmpresaId || null,
  sucursalId: row.SucursalId || null,
  descripcion: row.Descripcion || "Sin descripcion",
  jurisdiccion: row.Jurisdiccion || null,
  estadoBaja: row.EstadoBaja || null,
  fechaAlta: row.FechaAlta || null,
  label: row.SucursalId
    ? `${row.SucursalId} - ${row.Descripcion || "Sucursal"}`
    : (row.Descripcion || "Sucursal"),
});

const fallbackResponse = (res, warning, status = 200) => {
  return res.status(status).json({
    success: false,
    data: [],
    count: 0,
    warning,
  });
};

const getPointsOfSale = async (req, res) => {
  try {
    if (!API_KEY) {
      return fallbackResponse(res, "Falta configurar DIBIAGI_SALES_API_KEY (o API_KEY) en el backend.");
    }

    const now = Date.now();
    if (pointsCache.data && now - pointsCache.timestamp < CACHE_TTL_MS) {
      return res.json({
        success: true,
        data: pointsCache.data,
        count: pointsCache.data.length,
        cached: true,
      });
    }

    const response = await fetch(`${BASE_URL}/points-of-sale`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      return fallbackResponse(res, "No autorizado: API Key invalida o ausente.", 200);
    }

    if (response.status === 429) {
      if (pointsCache.data) {
        return res.json({
          success: true,
          data: pointsCache.data,
          count: pointsCache.data.length,
          cached: true,
          warning: "Rate limit alcanzado en servicio externo. Se usa cache local.",
        });
      }
      return fallbackResponse(res, "Limite de peticiones excedido al servicio de Puntos de Venta.", 200);
    }

    if (!response.ok) {
      const body = await response.text();
      console.warn("Servicio externo points-of-sale devolvio error:", body?.slice(0, 200));
      return fallbackResponse(res, "Error del servicio externo de Puntos de Venta.", 200);
    }

    const payload = await response.json();
    const mapped = Array.isArray(payload?.data) ? payload.data.map(normalizePoint) : [];

    pointsCache = {
      data: mapped,
      timestamp: now,
    };

    return res.json({
      success: true,
      data: mapped,
      count: mapped.length,
      cached: false,
    });
  } catch (error) {
    console.error("Error obteniendo puntos de venta:", error);
    return fallbackResponse(res, "Error al conectar con el servicio de Puntos de Venta.", 200);
  }
};

module.exports = { getPointsOfSale };
