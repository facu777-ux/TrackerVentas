const express = require("express");
const router = express.Router();
const { getConnection, sql } = require("../config/database");

// POST /api/seguimiento - Consulta de seguimiento con filtros
router.post("/", async (req, res) => {
  try {
    const {
      empresa = null,
      fechaDesde = "2024-01-01",
      fechaHasta = "2025-12-31",
      cliente = null,
      nroPR = null,
      limit = 100,
    } = req.body;

    const pool = await getConnection();

    const query = `
            /*==============================================================================
              CONSULTA OPTIMIZADA CON VISIBILIDAD TOTAL
              Trazabilidad Completa: SOLBOT -> PR -> CARGA -> Factura -> Recibo Cobranza
              
              CARACTERÍSTICA PRINCIPAL: Muestra TODOS los registros en cada etapa
              - Solicitudes SIN presupuesto (nunca se convirtieron)
              - Presupuestos SIN carga (nunca se ejecutaron)
              - Cargas SIN factura (pendientes de facturar)
              - Facturas SIN recibo (pendientes de cobro)
            ==============================================================================*/

            -- =============================================================================
            -- PASO 0: Solicitudes de Presupuesto (TODAS - incluso sin PR)
            -- =============================================================================
            IF OBJECT_ID('tempdb..#Solicitudes') IS NOT NULL DROP TABLE #Solicitudes;

            SELECT 
                b.USR_BOTPRE_CODEMP AS EmpresaSolicitud,
                b.USR_BOTPRE_CODSOL AS CodSolicitud,
                b.USR_BOTPRE_NROSOL AS NroSolicitud,
                b.USR_BO_FECALT AS FechaAltaSolicitud,
                b.USR_BOTPRE_FLGTRP AS ConfirmacionSolicitud
            INTO #Solicitudes
            FROM USR_BOTPRE b WITH (NOLOCK)
            WHERE b.USR_BO_FECALT BETWEEN @FechaDesde AND @FechaHasta;

            CREATE CLUSTERED INDEX IX_Solicitudes ON #Solicitudes (EmpresaSolicitud, NroSolicitud);

            -- =============================================================================
            -- PASO 1: Crear tabla temporal con PRs base (TODOS)
            -- =============================================================================
            IF OBJECT_ID('tempdb..#PRBase') IS NOT NULL DROP TABLE #PRBase;

            SELECT
                h.FCRMVH_CODEMP,
                h.FCRMVH_CODFOR,
                h.FCRMVH_NROFOR,
                h.FCRMVH_FCHMOV,
                h.FCRMVH_FECALT,
                h.FCRMVH_NROCTA,
                h.FCRMVH_CODLIS,
                h.FCRMVH_CNDPAG,
                h.USR_FCRMVH_CONTAC,
                h.USR_FCRMVH_DESVIAJ,
                h.FCRMVH_TEXTOS,
                h.FCRMVH_COFDEU,
                h.USR_FCRMVH_SOLBOT AS SolicitudAplica
            INTO #PRBase
            FROM FCRMVH h WITH (NOLOCK)
            WHERE 
                h.FCRMVH_MODFOR = 'FC'
                AND h.FCRMVH_CODFOR = 'PR'
                AND h.FCRMVH_FCHMOV BETWEEN @FechaDesde AND @FechaHasta
                AND h.FCRMVH_CODEMP IN ('FP', 'DIBIAG', 'MULTIM')
                AND (@EmpresaFiltro IS NULL OR h.FCRMVH_CODEMP = @EmpresaFiltro)
                AND (@NroPRFiltro IS NULL OR h.FCRMVH_NROFOR = @NroPRFiltro);

            CREATE CLUSTERED INDEX IX_PRBase ON #PRBase (FCRMVH_CODEMP, FCRMVH_CODFOR, FCRMVH_NROFOR);
            CREATE NONCLUSTERED INDEX IX_PRBase_Solicitud ON #PRBase (FCRMVH_CODEMP, SolicitudAplica);

            -- =============================================================================
            -- PASO 2: Cargas asociadas (TODAS - incluso sin factura)
            -- =============================================================================
            IF OBJECT_ID('tempdb..#Cargas') IS NOT NULL DROP TABLE #Cargas;

            SELECT DISTINCT
                gt.USR_GTMVIH_CODEMP AS EmpreCarga,
                gt.USR_GTMVIH_CODIGO AS CodCar,
                gt.USR_GTMVIH_CODFOR AS CodPR,
                gt.USR_GTMVIH_NROFOR AS NroPR,
                gt.USR_GTMVIH_NROCRT AS NroCRT,
                -- Campos adicionales de carga
                Case 
                    When gt.USR_GTMVIH_TIPVIA = 'E' Then 'Exclusivo'
                    When gt.USR_GTMVIH_TIPVIA = 'C' Then 'Consolidado'
                    Else 'No especificado'
                End as TipoViaje,
                Case 
                    When gt.USR_GTMVIH_TIPOPE = 'P' Then 'Propia'
                    When gt.USR_GTMVIH_TIPOPE = 'T' Then 'De Terceros'
                    Else 'No especificado'
                End as TipoOperacion,
                vta.VTMCLH_NOMBRE AS RemitenteOP,
                vtb.VTMCLH_NOMBRE AS DestinatarioOP,
                gt.USR_GTMVIH_FCHCAR AS FechaCarga,
                gt.USR_GTMVIH_FCHENT AS FechaEntrega,
                locA.USR_GTTLOH_DESCRP AS LocalizacionCargaOP,
                locB.USR_GTTLOH_DESCRP AS LocalizacionEntregaOP,
                gt.USR_GTMVIH_DOMREM AS DomicilioCarga,
                gt.USR_GTMVIH_DOMDES AS DomicilioDescarga,

                i.USR_GTMVII_CODEMP AS EmpreI,
                i.USR_GTMVII_CLIENT AS [Cliente a Facturar],
                i.USR_GTMVII_CODFAC AS CodFac,
                i.USR_GTMVII_NROFAC AS NroFac,
                i.USR_GT_FECALT AS FecAltOPItems
            INTO #Cargas
            FROM USR_GTMVIH gt WITH (NOLOCK)
                INNER JOIN USR_GTMVII i WITH (NOLOCK)
                    ON gt.USR_GTMVIH_CODIGO = i.USR_GTMVII_CODIGO
                    AND gt.USR_GTMVIH_CODEMP = i.USR_GTMVII_CODEMP
                -- JOINs para nombres y localizaciones
                INNER JOIN VTMCLH vta ON gt.USR_GTMVIH_REMITE = vta.VTMCLH_NROCTA
                INNER JOIN VTMCLH vtb ON gt.USR_GTMVIH_DESTIN = vtb.VTMCLH_NROCTA
                INNER JOIN USR_GTTLOH locA ON gt.USR_GTMVIH_LOCINI = locA.USR_GTTLOH_CODIGO
                INNER JOIN USR_GTTLOH locB ON gt.USR_GTMVIH_LOCENT = locB.USR_GTTLOH_CODIGO
            WHERE 
                gt.USR_GTMVIH_CODFOR = 'PR'
                AND EXISTS (
                    SELECT 1 FROM #PRBase pr 
                    WHERE gt.USR_GTMVIH_CODFOR = pr.FCRMVH_CODFOR
                    AND gt.USR_GTMVIH_NROFOR = pr.FCRMVH_NROFOR
                    AND gt.USR_GTMVIH_CODEMP = pr.FCRMVH_CODEMP
                );

            CREATE CLUSTERED INDEX IX_Cargas ON #Cargas (EmpreCarga, CodPR, NroPR);
            CREATE NONCLUSTERED INDEX IX_Cargas_Cod ON #Cargas (CodCar);
            CREATE NONCLUSTERED INDEX IX_Cargas_Factura ON #Cargas (EmpreI, CodFac, NroFac);

            -- =============================================================================
            -- PASO 3: Recibos de Cobranza (TODOS - solo de facturas existentes)
            -- =============================================================================
            IF OBJECT_ID('tempdb..#Recibos') IS NOT NULL DROP TABLE #Recibos;

            SELECT 
                vc.VTRMVC_CODEMP AS EmpRC, 
                vc.VTRMVC_CODFOR AS CodRC, 
                vc.VTRMVC_NROFOR AS NroRC,
                vc.VTRMVC_CODAPL AS CodFact, 
                vc.VTRMVC_NROAPL AS NroFact
            INTO #Recibos
            FROM VTRMVC vc WITH (NOLOCK)
            WHERE 
                vc.VTRMVC_MODFOR = 'VT' 
                AND vc.VTRMVC_MODAPL = 'VT'  
                AND vc.VTRMVC_CODFOR = 'RC'
                AND EXISTS (
                    SELECT 1 FROM #Cargas gt 
                    WHERE vc.VTRMVC_CODAPL = gt.CodFac
                    AND vc.VTRMVC_NROAPL = gt.NroFac
                    AND vc.VTRMVC_CODEMP = gt.EmpreI
                );

            CREATE CLUSTERED INDEX IX_Recibos ON #Recibos (EmpRC, CodFact, NroFact);

            -- =============================================================================
            -- PASO 4: QUERY FINAL - VISIBILIDAD TOTAL CON LEFT JOINs
            -- =============================================================================
            SELECT TOP (@Limit)
                -- INDICADORES DE ESTADO DEL FLUJO
                CASE 
                    WHEN pr.FCRMVH_NROFOR IS NULL THEN '🔴 Solo Solicitud'
                    WHEN gt.CodCar IS NULL THEN '🟡 PR sin Carga'
                    WHEN gt.CodFac IS NULL OR gt.NroFac = 0 THEN '🟠 Carga sin Factura'
                    WHEN rc.NroRC IS NULL THEN '🟢 Facturado sin RC'
                    ELSE '✅ Flujo Completo'
                END AS EstadoFlujo,
                
                -- DATOS DE SOLICITUD (puede ser NULL si no hay solicitud)
                sol.CodSolicitud,
                sol.NroSolicitud,
                sol.FechaAltaSolicitud,
                CASE
                    WHEN sol.ConfirmacionSolicitud = 'S' THEN 'Confirmada'
                    WHEN sol.ConfirmacionSolicitud = 'N' THEN 'No Confirmada'
                    WHEN sol.NroSolicitud IS NOT NULL THEN 'Pendiente'
                    ELSE NULL
                END AS EstadoSolicitud,
                
                -- DATOS DE PRESUPUESTO (puede ser NULL si solo hay solicitud)
                pr.FCRMVH_CODEMP AS EmpOri,
                pr.FCRMVH_CODFOR AS PR,
                pr.FCRMVH_NROFOR AS NroPR,
                pr.FCRMVH_FCHMOV AS FchMovimiento,
                pr.FCRMVH_FECALT AS FchAltaRegistro,
                pr.FCRMVH_NROCTA AS CodCliente,
                cl.VTMCLH_NOMBRE AS NomCliente,
                pr.USR_FCRMVH_CONTAC AS ContactoDeCliente,
                pr.FCRMVH_TEXTOS AS ObservacionesPR,
                pr.USR_FCRMVH_DESVIAJ AS DescrpViaj,
                pr.FCRMVH_COFDEU AS CoefRegistracion,
                pr.SolicitudAplica AS VinculoSolicitud,
                usd.STTLPR_DESCRP AS ListaPrecio,
                CnPag.VTTCPH_DESCRP AS CondicionPago,
                
                -- DATOS DE ITEMS (puede ser NULL si solo hay solicitud)
                i.FCRMVI_NROITM AS NroItm,
                i.FCRMVI_TIPPRO AS TipPro,
                i.FCRMVI_ARTCOD AS ArtCod,
                sth.STMPDH_DESCRP AS DescrpProd,
                i.FCRMVI_CANTID AS Cantidad,
                sth.STMPDH_UNIMED AS UnidadMedida,
                i.FCRMVI_PRECIO AS Precio,
                i.FCRMVI_TOTLIN AS TotalItem,
                i.FCRMVI_TEXTOS AS ObservacionesItem,
                
                -- DATOS DE CARGA (puede ser NULL si PR sin carga)
                gt.EmpreCarga AS EmpresaCarga,
                gt.CodCar AS CodigoCarga,
                gt.NroCRT,
                gt.FecAltOPItems AS FecAltCarga,
                gt.RemitenteOP,
                gt.DestinatarioOP,
                gt.TipoViaje, 
                gt.TipoOperacion,
                gt.LocalizacionCargaOP,
                gt.LocalizacionEntregaOP,
                gt.DomicilioCarga,
                gt.DomicilioDescarga,
                
                -- DATOS DE FACTURA (puede ser NULL si carga sin factura)
                CASE 
                    WHEN gt.CodFac IS NULL OR gt.NroFac = 0 THEN 'Pendiente Facturación'
                    ELSE CONCAT(gt.CodFac, '-', gt.NroFac)
                END AS FacturaAsociadaOP,
                
                -- DATOS DE RECIBO COBRANZA (puede ser NULL si factura sin RC)
                CASE 
                    WHEN rc.NroRC IS NULL AND gt.NroFac IS NOT NULL AND gt.NroFac > 0 THEN 'Pendiente Cobranza'
                    WHEN rc.NroRC IS NOT NULL THEN CONCAT(rc.CodRC, '-', rc.NroRC)
                    ELSE NULL
                END AS ReciboCobranza
                
            FROM #Solicitudes sol
                -- LEFT JOIN para ver solicitudes sin PR
                LEFT JOIN #PRBase pr
                    ON sol.EmpresaSolicitud = pr.FCRMVH_CODEMP
                    AND sol.NroSolicitud = pr.SolicitudAplica
                
                -- LEFT JOIN para datos del presupuesto (solo si existe PR)
                LEFT JOIN FCRMVI i WITH (NOLOCK)
                    ON pr.FCRMVH_CODFOR = i.FCRMVI_CODFOR 
                    AND pr.FCRMVH_NROFOR = i.FCRMVI_NROFOR
                    AND pr.FCRMVH_CODEMP = i.FCRMVI_CODEMP
                LEFT JOIN VTMCLH cl WITH (NOLOCK)
                    ON pr.FCRMVH_NROCTA = cl.VTMCLH_NROCTA
                LEFT JOIN STTLPR usd WITH (NOLOCK)
                    ON pr.FCRMVH_CODLIS = usd.STTLPR_CODLIS
                LEFT JOIN STMPDH sth WITH (NOLOCK)
                    ON i.FCRMVI_TIPPRO = sth.STMPDH_TIPPRO 
                    AND i.FCRMVI_ARTCOD = sth.STMPDH_ARTCOD
                LEFT JOIN VTTCPH CnPag WITH (NOLOCK)
                    ON pr.FCRMVH_CNDPAG = CnPag.VTTCPH_CNDPAG
                
                -- LEFT JOIN para ver PRs sin carga
                LEFT JOIN #Cargas gt
                    ON pr.FCRMVH_CODFOR = gt.CodPR
                    AND pr.FCRMVH_NROFOR = gt.NroPR
                    AND pr.FCRMVH_CODEMP = gt.EmpreCarga
                
                -- LEFT JOIN para ver facturas sin recibo
                LEFT JOIN #Recibos rc
                    ON gt.EmpreI = rc.EmpRC
                    AND gt.CodFac = rc.CodFact
                    AND gt.NroFac = rc.NroFact

            -- Agregar PRs que NO tienen solicitud (creados directamente)
            UNION ALL

            SELECT
                -- INDICADORES DE ESTADO
                CASE 
                    WHEN gt.CodCar IS NULL THEN '🟡 PR sin Carga (Sin Solicitud)'
                    WHEN gt.CodFac IS NULL OR gt.NroFac = 0 THEN '🟠 Carga sin Factura (Sin Solicitud)'
                    WHEN rc.NroRC IS NULL THEN '🟢 Facturado sin RC (Sin Solicitud)'
                    ELSE '✅ Flujo Completo (Sin Solicitud)'
                END AS EstadoFlujo,
                
                -- Sin solicitud
                NULL AS CodSolicitud,
                NULL AS NroSolicitud,
                NULL AS FechaAltaSolicitud,
                NULL AS EstadoSolicitud,
                
                -- DATOS DE PRESUPUESTO
                pr.FCRMVH_CODEMP,
                pr.FCRMVH_CODFOR,
                pr.FCRMVH_NROFOR,
                pr.FCRMVH_FCHMOV,
                pr.FCRMVH_FECALT,
                pr.FCRMVH_NROCTA,
                cl.VTMCLH_NOMBRE,
                pr.USR_FCRMVH_CONTAC,
                pr.FCRMVH_TEXTOS,
                pr.USR_FCRMVH_DESVIAJ,
                pr.FCRMVH_COFDEU,
                pr.SolicitudAplica,
                usd.STTLPR_DESCRP,
                CnPag.VTTCPH_DESCRP,
                
                -- DATOS DE ITEMS
                i.FCRMVI_NROITM,
                i.FCRMVI_TIPPRO,
                i.FCRMVI_ARTCOD,
                sth.STMPDH_DESCRP,
                i.FCRMVI_CANTID,
                sth.STMPDH_UNIMED,
                i.FCRMVI_PRECIO,
                i.FCRMVI_TOTLIN,
                i.FCRMVI_TEXTOS,
                
                -- DATOS DE CARGA
                gt.EmpreCarga,
                gt.CodCar,
                gt.NroCRT,
                gt.FecAltOPItems,
                gt.RemitenteOP,
                gt.DestinatarioOP,
                gt.TipoViaje, 
                gt.TipoOperacion,
                gt.LocalizacionCargaOP,
                gt.LocalizacionEntregaOP,
                gt.DomicilioCarga,
                gt.DomicilioDescarga,
                
                -- DATOS DE FACTURA
                CASE 
                    WHEN gt.CodFac IS NULL OR gt.NroFac = 0 THEN 'Pendiente Facturación'
                    ELSE CONCAT(gt.CodFac, '-', gt.NroFac)
                END,
                
                -- DATOS DE RECIBO
                CASE 
                    WHEN rc.NroRC IS NULL AND gt.NroFac IS NOT NULL AND gt.NroFac > 0 THEN 'Pendiente Cobranza'
                    WHEN rc.NroRC IS NOT NULL THEN CONCAT(rc.CodRC, '-', rc.NroRC)
                    ELSE NULL
                END
                
            FROM #PRBase pr
                -- Solo PRs sin solicitud
                LEFT JOIN #Solicitudes sol
                    ON pr.FCRMVH_CODEMP = sol.EmpresaSolicitud
                    AND pr.SolicitudAplica = sol.NroSolicitud
                
                -- LEFT JOINs con datos del PR
                LEFT JOIN FCRMVI i WITH (NOLOCK)
                    ON pr.FCRMVH_CODFOR = i.FCRMVI_CODFOR 
                    AND pr.FCRMVH_NROFOR = i.FCRMVI_NROFOR
                    AND pr.FCRMVH_CODEMP = i.FCRMVI_CODEMP
                LEFT JOIN VTMCLH cl WITH (NOLOCK)
                    ON pr.FCRMVH_NROCTA = cl.VTMCLH_NROCTA
                LEFT JOIN STTLPR usd WITH (NOLOCK)
                    ON pr.FCRMVH_CODLIS = usd.STTLPR_CODLIS
                LEFT JOIN STMPDH sth WITH (NOLOCK)
                    ON i.FCRMVI_TIPPRO = sth.STMPDH_TIPPRO 
                    AND i.FCRMVI_ARTCOD = sth.STMPDH_ARTCOD
                LEFT JOIN VTTCPH CnPag WITH (NOLOCK)
                    ON pr.FCRMVH_CNDPAG = CnPag.VTTCPH_CNDPAG
                
                -- LEFT JOINs para carga, factura y recibo
                LEFT JOIN #Cargas gt
                    ON pr.FCRMVH_CODFOR = gt.CodPR
                    AND pr.FCRMVH_NROFOR = gt.NroPR
                    AND pr.FCRMVH_CODEMP = gt.EmpreCarga
                LEFT JOIN #Recibos rc
                    ON gt.EmpreI = rc.EmpRC
                    AND gt.CodFac = rc.CodFact
                    AND gt.NroFac = rc.NroFact
                    
            WHERE sol.NroSolicitud IS NULL
                AND (@ClienteFiltro IS NULL OR pr.FCRMVH_NROCTA LIKE '%' + @ClienteFiltro + '%' OR cl.VTMCLH_NOMBRE LIKE '%' + @ClienteFiltro + '%')

            ORDER BY 
                FecAltCarga DESC,
                FchMovimiento DESC,
                NroPR,
                NroItm

            OPTION (MAXDOP 4);

            -- =============================================================================
            -- Limpiar tablas temporales
            -- =============================================================================
            DROP TABLE #Solicitudes;
            DROP TABLE #PRBase;
            DROP TABLE #Cargas;
            DROP TABLE #Recibos;
        `;

    const result = await pool
      .request()
      .input("EmpresaFiltro", sql.VarChar(10), empresa)
      .input("FechaDesde", sql.Date, fechaDesde)
      .input("FechaHasta", sql.Date, fechaHasta)
      .input("ClienteFiltro", sql.VarChar(100), cliente)
      .input("NroPRFiltro", sql.BigInt, nroPR)
      .input("Limit", sql.Int, limit)
      .query(query);

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
      filters: {
        empresa,
        fechaDesde,
        fechaHasta,
        cliente,
        nroPR,
      },
    });
  } catch (error) {
    console.error("Error en consulta de seguimiento:", error);
    res.status(500).json({
      success: false,
      error: "Error al ejecutar la consulta",
      message: error.message,
    });
  }
});

// GET /api/seguimiento/empresas - Obtener lista de empresas
router.get("/empresas", async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
            SELECT DISTINCT FCRMVH_CODEMP AS Codigo, FCRMVH_CODEMP AS Nombre
            FROM FCRMVH WITH (NOLOCK)
            WHERE FCRMVH_CODEMP IS NOT NULL
            ORDER BY FCRMVH_CODEMP
        `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("Error al obtener empresas:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/seguimiento/clientes - Buscar clientes
router.get("/clientes", async (req, res) => {
  try {
    const { search = "" } = req.query;
    const pool = await getConnection();

    const result = await pool
      .request()
      .input("Search", sql.VarChar(100), `%${search}%`).query(`
                SELECT TOP 20 
                    VTMCLH_NROCTA AS Codigo,
                    VTMCLH_NOMBRE AS Nombre
                FROM VTMCLH WITH (NOLOCK)
                WHERE VTMCLH_NOMBRE LIKE @Search 
                   OR VTMCLH_NROCTA LIKE @Search
                ORDER BY VTMCLH_NOMBRE
            `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
