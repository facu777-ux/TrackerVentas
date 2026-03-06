const express = require("express");
const router = express.Router();
const { getConnection, sql } = require("../config/database");

/**
 * Obtiene la facturación agrupada por empresa mediante SPs (Sentencias Preparadas).
 * @param {string} fechaDesde - Fecha de inicio.
 * @param {string} fechaHasta - Fecha de fin.
 * @returns {Promise<Array>}
 */
async function fetchFacturacion(fechaDesde, fechaHasta) {
  const pool = await getConnection();
  const query = `
    SELECT 
      FCRMVH_CODEMP AS Empresa,
      SUM(FCRMVH_COFDEU) AS TotalFacturado
    FROM FCRMVH WITH (NOLOCK)
    WHERE FCRMVH_MODFOR = 'FC'
      AND FCRMVH_FCHMOV BETWEEN @FechaDesde AND @FechaHasta
    GROUP BY FCRMVH_CODEMP
  `;
  const result = await pool
    .request()
    .input("FechaDesde", sql.Date, fechaDesde)
    .input("FechaHasta", sql.Date, fechaHasta)
    .query(query);
  return result.recordset;
}

/**
 * Obtiene métricas de viajes (exitosos vs anulados).
 * @param {string} empresa - Codigo de empresa o null para todas.
 * @returns {Promise<Array>}
 */
async function fetchOperaciones(empresa) {
  const pool = await getConnection();
  const query = `
    SELECT 
      USR_GTMVIH_ANULAR AS EstadoAnulado,
      COUNT(USR_GTMVIH_CODIGO) AS TotalViajes
    FROM USR_GTMVIH WITH (NOLOCK)
    WHERE (@Empresa IS NULL OR USR_GTMVIH_CODEMP = @Empresa)
      AND USR_GTMVIH_FCHCAR >= DATEADD(month, -1, GETDATE())
    GROUP BY USR_GTMVIH_ANULAR
  `;
  const result = await pool
    .request()
    .input("Empresa", sql.VarChar(10), empresa || null)
    .query(query);
  return result.recordset;
}

/**
 * GET /api/dashboard/facturacion
 */
router.get("/facturacion", async (req, res) => {
  try {
    const { from = "2024-01-01", to = "2025-12-31" } = req.query;
    const data = await fetchFacturacion(from, to);
    res.json({ success: true, data, metrics: {} });
  } catch (error) {
    // LOG DE SEGURIDAD. No exponer Stack Trace al cliente.
    console.error("Error Seguridad/BD en /facturacion:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Error procesando facturación." });
  }
});

/**
 * GET /api/dashboard/operaciones
 */
router.get("/operaciones", async (req, res) => {
  try {
    const { empresa = null } = req.query;
    const data = await fetchOperaciones(empresa);
    res.json({ success: true, data, metrics: {} });
  } catch (error) {
    console.error("Error Seguridad/BD en /operaciones:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Error procesando operaciones." });
  }
});

module.exports = router;
