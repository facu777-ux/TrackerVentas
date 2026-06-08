const express = require("express");
const router = express.Router();
const { getConnection, sql } = require("../config/database");

// POST /api/seguimiento - Consulta de seguimiento con filtros
router.post("/", async (req, res) => {
    try {
        const {
            empresa = null,
            fechaDesde = "2024-01-01",
            fechaHasta = "2100-12-31",
            cliente = null,
            nroPR = null,
            nroFactura = null,
            nroCarga = null,
            nroRC = null,
            facturaTipo = null,
            puntoVenta = null,
            limit = 100,
        } = req.body;

        const normalizedFacturaTipo = facturaTipo ? String(facturaTipo).trim().toUpperCase() : null;
        const requestedPuntoVenta = puntoVenta ? String(puntoVenta).replace(/\D/g, "") : null;
        const normalizedPuntoVenta = normalizedFacturaTipo === "E" ? "9996" : requestedPuntoVenta;
        const facturaTipoLike = normalizedFacturaTipo ? `%${normalizedFacturaTipo}%` : null;
        const puntoVentaLike = normalizedPuntoVenta ? `%${normalizedPuntoVenta}%` : null;

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
            WHERE (
                @NroCargaFiltro IS NOT NULL
                OR @NroFacturaFiltro IS NOT NULL
                OR @NroRCFiltro IS NOT NULL
                OR b.USR_BO_FECALT BETWEEN @FechaDesde AND @FechaHasta
            )
            AND (@NroPRFiltro IS NULL OR CAST(b.USR_BOTPRE_NROSOL AS VARCHAR) = @NroPRFiltro);

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
                AND (
                    @NroCargaFiltro IS NOT NULL
                    OR @NroFacturaFiltro IS NOT NULL
                    OR @NroRCFiltro IS NOT NULL
                    OR h.FCRMVH_FCHMOV BETWEEN @FechaDesde AND @FechaHasta
                )
                AND h.FCRMVH_CODEMP IN ('FP', 'DIBIAG', 'MULTIM')
                AND (@EmpresaFiltro IS NULL OR h.FCRMVH_CODEMP = @EmpresaFiltro)
                AND (@NroPRFiltro IS NULL OR h.FCRMVH_NROFOR = @NroPRFiltro);

            CREATE CLUSTERED INDEX IX_PRBase ON #PRBase (FCRMVH_NROFOR, FCRMVH_CODEMP);
            CREATE NONCLUSTERED INDEX IX_PRBase_Solicitud ON #PRBase (SolicitudAplica, FCRMVH_CODEMP);
            CREATE NONCLUSTERED INDEX IX_PRBase_Cliente ON #PRBase (FCRMVH_NROCTA);

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
                vta.VTMCLH_DIRECC AS DireccionRemitente,
                vtb.VTMCLH_NOMBRE AS DestinatarioOP,
                vtb.VTMCLH_DIRECC AS DireccionDestinatario,
                gt.USR_GTMVIH_FCHCAR AS FechaCarga,
                gt.USR_GTMVIH_FCHENT AS FechaEntrega,
                locA.USR_GTTLOH_DESCRP AS LocalizacionCargaOP,
                locB.USR_GTTLOH_DESCRP AS LocalizacionEntregaOP,
                gt.USR_GTMVIH_DOMREM AS DomicilioCarga,
                gt.USR_GTMVIH_DOMDES AS DomicilioDescarga,

                i.USR_GTMVII_CODEMP AS EmpreI,
                i.USR_GTMVII_CLIENT AS [Codigo Cliente a Facturar],
                vtc.VTMCLH_NOMBRE AS NomClientFacturar,
                i.USR_GTMVII_CODFAC AS CodFac,
                i.USR_GTMVII_NROFAC AS NroFac,
                f.FCRMVH_FCHMOV AS FecFactura,
                i.USR_GT_FECALT AS FecAltOPItems,
                i.USR_GTMVII_NROITM AS NroItmCarga,
                i.USR_VIRT_TOTLIN AS TotalItemCarga,
                i.USR_GTMVII_TIPPRO AS TipProI,
                i.USR_GTMVII_ARTCOD AS ArtCodI,
                i.USR_GTMVII_CANTID AS CantI,
                i.USR_GTMVII_PRECIO AS PrecI,
                i.USR_GTMVII_OBSERV AS ObservI
            INTO #Cargas
            FROM USR_GTMVIH gt WITH (NOLOCK)
                INNER JOIN USR_GTMVII i WITH (NOLOCK)
                    ON gt.USR_GTMVIH_CODIGO = i.USR_GTMVII_CODIGO
                    AND gt.USR_GTMVIH_CODEMP = i.USR_GTMVII_CODEMP
                -- JOIN para obtener fecha de factura
                LEFT JOIN FCRMVH f WITH (NOLOCK)
                    ON i.USR_GTMVII_CODEMP = f.FCRMVH_CODEMP
                    AND i.USR_GTMVII_CODFAC = f.FCRMVH_CODFOR
                    AND i.USR_GTMVII_NROFAC = f.FCRMVH_NROFOR
                -- JOINs para nombres y localizaciones con LEFT JOIN para seguridad
                LEFT JOIN VTMCLH vta WITH (NOLOCK) ON gt.USR_GTMVIH_REMITE = vta.VTMCLH_NROCTA
                LEFT JOIN VTMCLH vtb WITH (NOLOCK) ON gt.USR_GTMVIH_DESTIN = vtb.VTMCLH_NROCTA
                LEFT JOIN VTMCLH vtc WITH (NOLOCK) ON i.USR_GTMVII_CLIENT = vtc.VTMCLH_NROCTA
                LEFT JOIN USR_GTTLOH locA WITH (NOLOCK) ON gt.USR_GTMVIH_LOCINI = locA.USR_GTTLOH_CODIGO
                LEFT JOIN USR_GTTLOH locB WITH (NOLOCK) ON gt.USR_GTMVIH_LOCENT = locB.USR_GTTLOH_CODIGO
            WHERE 
                gt.USR_GTMVIH_CODFOR = 'PR'
                AND EXISTS (
                    SELECT 1 FROM #PRBase pr 
                    WHERE gt.USR_GTMVIH_CODFOR = pr.FCRMVH_CODFOR
                    AND gt.USR_GTMVIH_NROFOR = pr.FCRMVH_NROFOR
                    AND gt.USR_GTMVIH_CODEMP = pr.FCRMVH_CODEMP
                )
                -- Excluir cargas anuladas
                AND ISNULL(gt.USR_GTMVIH_ANULAR, 'N') <> 'S'
                AND (gt.USR_GTMVIH_MOTBAJ IS NULL OR gt.USR_GTMVIH_MOTBAJ = '')
                AND (@NroFacturaFiltro IS NULL OR i.USR_GTMVII_NROFAC = @NroFacturaFiltro)
                AND (@NroCargaFiltro IS NULL OR gt.USR_GTMVIH_CODIGO = @NroCargaFiltro)
                AND (@FacturaTipoFiltro IS NULL OR UPPER(COALESCE(i.USR_GTMVII_CODFAC, '')) LIKE @FacturaTipoLike)
                AND (@PuntoVentaFiltro IS NULL OR UPPER(COALESCE(i.USR_GTMVII_CODFAC, '')) LIKE @PuntoVentaLike)
                AND (
                    -- Si se busca por carga: filtrar por fecha de alta de la carga
                    (@NroCargaFiltro IS NOT NULL AND CAST(i.USR_GT_FECALT AS DATE) BETWEEN @FechaDesde AND @FechaHasta)
                    -- Si se busca por factura: filtrar por fecha de la factura
                    OR (@NroFacturaFiltro IS NOT NULL AND CAST(f.FCRMVH_FCHMOV AS DATE) BETWEEN @FechaDesde AND @FechaHasta)
                    -- Si no se busca por entidad específica: sin filtro adicional (ya filtrado por PR en #PRBase)
                    OR (@NroCargaFiltro IS NULL AND @NroFacturaFiltro IS NULL)
                );

            CREATE CLUSTERED INDEX IX_Cargas ON #Cargas (NroPR, EmpreCarga);
            CREATE NONCLUSTERED INDEX IX_Cargas_Cod ON #Cargas (CodCar, EmpreCarga);
            CREATE NONCLUSTERED INDEX IX_Cargas_Factura ON #Cargas (NroFac, CodFac, EmpreI);

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
                )
                AND (@NroRCFiltro IS NULL OR vc.VTRMVC_NROFOR = @NroRCFiltro);

            CREATE CLUSTERED INDEX IX_Recibos ON #Recibos (EmpRC, CodFact, NroFact);

            -- =============================================================================
            -- PASO 3b: Notas de Crédito/Débito asociadas a facturas en #Cargas
            -- =============================================================================
            IF OBJECT_ID('tempdb..#NotasAjuste') IS NOT NULL DROP TABLE #NotasAjuste;

            SELECT
                n.SAR_VTRMVA_CODEMP AS EmpNA,
                n.SAR_VTRMVA_CODAPL AS CodFacNA,
                n.SAR_VTRMVA_NROAPL AS NroFacNA,
                MAX(CASE WHEN n.SAR_VTRMVA_CODFOR LIKE 'C%' THEN 1 ELSE 0 END) AS TieneNC,
                MAX(CASE WHEN n.SAR_VTRMVA_CODFOR LIKE 'D%' THEN 1 ELSE 0 END) AS TieneND
            INTO #NotasAjuste
            FROM SAR_VTRMVA n WITH (NOLOCK)
            WHERE
                n.SAR_VTRMVA_MODFOR = 'VT'
                AND (n.SAR_VTRMVA_CODFOR LIKE 'C%' OR n.SAR_VTRMVA_CODFOR LIKE 'D%')
                AND n.SAR_VTRMVA_MODAPL = 'VT'
                AND EXISTS (
                    SELECT 1 FROM #Cargas c
                    WHERE c.EmpreI = n.SAR_VTRMVA_CODEMP
                      AND c.CodFac = n.SAR_VTRMVA_CODAPL
                      AND c.NroFac = n.SAR_VTRMVA_NROAPL
                      AND c.NroFac > 0
                      AND c.CodFac IS NOT NULL
                )
            GROUP BY n.SAR_VTRMVA_CODEMP, n.SAR_VTRMVA_CODAPL, n.SAR_VTRMVA_NROAPL;

            CREATE CLUSTERED INDEX IX_NotasAjuste ON #NotasAjuste (EmpNA, CodFacNA, NroFacNA);

            -- =============================================================================
            -- PASO 3c: Saldo ajustado por factura (ImporteFac - SumNC + SumND - SumRC)
            -- =============================================================================
            IF OBJECT_ID('tempdb..#MontosFac') IS NOT NULL DROP TABLE #MontosFac;

            SELECT
                base.EmpFac,
                base.CodFac,
                base.NroFac,
                base.ImporteFac,
                base.SumNC,
                base.SumND,
                base.SumRC,
                ISNULL(base.ImporteFac, 0) + ISNULL(base.SumNC, 0) + ISNULL(base.SumND, 0) - ISNULL(base.SumRC, 0) AS SaldoAjustado,
                base.CodMonedaFac,
                base.SimboloMonedaFac
            INTO #MontosFac
            FROM (
                SELECT
                    c.EmpreI AS EmpFac,
                    c.CodFac,
                    c.NroFac,
                    (SELECT SUM(CASE WHEN vc.VTRMVC_IMPEXT = 0 THEN vc.VTRMVC_IMPNAC ELSE vc.VTRMVC_IMPEXT END)
                     FROM VTRMVC vc WITH (NOLOCK)
                     WHERE vc.VTRMVC_CODEMP = c.EmpreI
                       AND vc.VTRMVC_MODFOR = 'VT'
                       AND vc.VTRMVC_CODFOR = c.CodFac
                       AND vc.VTRMVC_NROFOR = c.NroFac
                       AND vc.VTRMVC_MODAPL = vc.VTRMVC_MODFOR
                       AND vc.VTRMVC_CODAPL = vc.VTRMVC_CODFOR
                       AND vc.VTRMVC_NROAPL = vc.VTRMVC_NROFOR) AS ImporteFac,
                    (SELECT SUM(CASE WHEN vc.VTRMVC_IMPEXT = 0 THEN vc.VTRMVC_IMPNAC ELSE vc.VTRMVC_IMPEXT END)
                     FROM SAR_VTRMVA n WITH (NOLOCK)
                     INNER JOIN VTRMVC vc WITH (NOLOCK)
                       ON vc.VTRMVC_CODEMP = n.SAR_VTRMVA_CODEMP
                       AND vc.VTRMVC_MODFOR = n.SAR_VTRMVA_MODFOR
                       AND vc.VTRMVC_CODFOR = n.SAR_VTRMVA_CODFOR
                       AND vc.VTRMVC_NROFOR = n.SAR_VTRMVA_NROFOR
                       AND vc.VTRMVC_MODAPL = vc.VTRMVC_MODFOR
                       AND vc.VTRMVC_CODAPL = vc.VTRMVC_CODFOR
                       AND vc.VTRMVC_NROAPL = vc.VTRMVC_NROFOR
                     WHERE n.SAR_VTRMVA_CODEMP = c.EmpreI
                       AND n.SAR_VTRMVA_MODFOR = 'VT'
                       AND n.SAR_VTRMVA_CODFOR LIKE 'C%'
                       AND n.SAR_VTRMVA_MODAPL = 'VT'
                       AND n.SAR_VTRMVA_CODAPL = c.CodFac
                       AND n.SAR_VTRMVA_NROAPL = c.NroFac) AS SumNC,
                    (SELECT SUM(CASE WHEN vc.VTRMVC_IMPEXT = 0 THEN vc.VTRMVC_IMPNAC ELSE vc.VTRMVC_IMPEXT END)
                     FROM SAR_VTRMVA n WITH (NOLOCK)
                     INNER JOIN VTRMVC vc WITH (NOLOCK)
                       ON vc.VTRMVC_CODEMP = n.SAR_VTRMVA_CODEMP
                       AND vc.VTRMVC_MODFOR = n.SAR_VTRMVA_MODFOR
                       AND vc.VTRMVC_CODFOR = n.SAR_VTRMVA_CODFOR
                       AND vc.VTRMVC_NROFOR = n.SAR_VTRMVA_NROFOR
                       AND vc.VTRMVC_MODAPL = vc.VTRMVC_MODFOR
                       AND vc.VTRMVC_CODAPL = vc.VTRMVC_CODFOR
                       AND vc.VTRMVC_NROAPL = vc.VTRMVC_NROFOR
                     WHERE n.SAR_VTRMVA_CODEMP = c.EmpreI
                       AND n.SAR_VTRMVA_MODFOR = 'VT'
                       AND n.SAR_VTRMVA_CODFOR LIKE 'D%'
                       AND n.SAR_VTRMVA_MODAPL = 'VT'
                       AND n.SAR_VTRMVA_CODAPL = c.CodFac
                       AND n.SAR_VTRMVA_NROAPL = c.NroFac) AS SumND,
                    (SELECT SUM(CASE WHEN vc.VTRMVC_IMPEXT = 0 THEN vc.VTRMVC_IMPNAC ELSE vc.VTRMVC_IMPEXT END)
                     FROM VTRMVC vc WITH (NOLOCK)
                     WHERE vc.VTRMVC_CODEMP = c.EmpreI
                       AND vc.VTRMVC_MODFOR = 'VT'
                       AND vc.VTRMVC_CODFOR = 'RC'
                       AND vc.VTRMVC_MODAPL = 'VT'
                       AND vc.VTRMVC_CODAPL = c.CodFac
                       AND vc.VTRMVC_NROAPL = c.NroFac) AS SumRC,
                    h.VTRMVH_COFFAC AS CodMonedaFac,
                    gc.GRTCOF_SIMBOL AS SimboloMonedaFac
                FROM (SELECT DISTINCT EmpreI, CodFac, NroFac FROM #Cargas WHERE CodFac IS NOT NULL AND NroFac > 0) c
                LEFT JOIN VTRMVH h WITH (NOLOCK)
                    ON h.VTRMVH_CODEMP = c.EmpreI
                    AND h.VTRMVH_MODFOR = 'VT'
                    AND h.VTRMVH_CODFOR = c.CodFac
                    AND h.VTRMVH_NROFOR = c.NroFac
                LEFT JOIN GRTCOF gc WITH (NOLOCK)
                    ON gc.GRTCOF_CODCOF = h.VTRMVH_COFFAC
            ) base;

            CREATE CLUSTERED INDEX IX_MontosFac ON #MontosFac (EmpFac, CodFac, NroFac);

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
                cl.VTMCLH_NROCTA AS CodCliente,
                ISNULL(gt.NomClientFacturar, cl.VTMCLH_NOMBRE) AS NomCliente,
                cl.VTMCLH_CNDPAG as [CndPagCliente],
                
                pr.USR_FCRMVH_CONTAC AS ContactoDeCliente,
                pr.FCRMVH_TEXTOS AS ObservacionesPR,
                pr.USR_FCRMVH_DESVIAJ AS DescrpViaj,
                pr.FCRMVH_COFDEU AS CoefRegistracion,
                pr.SolicitudAplica AS VinculoSolicitud,
                usd.STTLPR_DESCRP AS ListaPrecio,
                CnPag.VTTCPH_DESCRP AS CondicionPago,
                usd.STTLPR_CODCOF AS Moneda,
                
                -- DATOS DE ITEMS (unión de PR y Carga)
                itms.NroItm,
                COALESCE(gt.TipProI, i.FCRMVI_TIPPRO) AS TipPro,
                COALESCE(gt.ArtCodI, i.FCRMVI_ARTCOD) AS ArtCod,
                COALESCE(sth2.STMPDH_DESCRP, sth.STMPDH_DESCRP, '(Item Adicional en Carga)') AS DescrpProd,
                
                -- Datos Específicos de PR
                i.FCRMVI_CANTID AS CantidadPR,
                i.FCRMVI_PRECIO AS PrecioPR,
                i.FCRMVI_TOTLIN AS TotalItemPR,
                
                -- Datos Específicos de Carga
                gt.CantI AS CantidadCarga,
                gt.PrecI AS PrecioCarga,
                gt.TotalItemCarga AS TotalItemCarga,

                -- Mantenemos COALESCE para compatibilidad y vista general (priorizando ejecución)
                COALESCE(gt.CantI, i.FCRMVI_CANTID, 0) AS Cantidad,
                COALESCE(sth2.STMPDH_UNIMED, sth.STMPDH_UNIMED) AS UnidadMedida,
                COALESCE(gt.PrecI, i.FCRMVI_PRECIO, 0) AS Precio,
                COALESCE(gt.TotalItemCarga, i.FCRMVI_TOTLIN, 0) AS TotalItem,
                COALESCE(gt.ObservI, i.FCRMVI_TEXTOS) AS ObservacionesItem,
                
                -- DATOS DE CARGA (puede ser NULL si PR sin carga)
                gt.EmpreCarga AS EmpresaCarga,
                gt.CodCar AS CodigoCarga,
                gt.NroCRT,
                gt.NomClientFacturar AS ClienteAFacturar,
                gt.FecAltOPItems AS FecAltCarga,
                gt.RemitenteOP,
                gt.DestinatarioOP,
                gt.TipoViaje, 
                gt.TipoOperacion,
                gt.LocalizacionCargaOP,
                gt.LocalizacionEntregaOP,
                gt.DomicilioCarga,
                gt.DomicilioDescarga,
                gt.DireccionRemitente,
                gt.DireccionDestinatario,
                
                -- DATOS DE FACTURA (puede ser NULL si carga sin factura)
                CASE 
                    WHEN gt.CodFac IS NULL OR gt.NroFac = 0 THEN 'Pendiente Facturación'
                    ELSE CONCAT(gt.CodFac, '-', gt.NroFac)
                END AS FacturaAsociadaOP,
                gt.FecFactura,
                
                -- DATOS DE RECIBO COBRANZA (puede ser NULL si factura sin RC)
                CASE
                    WHEN rc.NroRC IS NULL AND gt.NroFac IS NOT NULL AND gt.NroFac > 0 THEN 'Pendiente Cobranza'
                    WHEN rc.NroRC IS NOT NULL THEN CONCAT(rc.CodRC, '-', rc.NroRC)
                    ELSE NULL
                END AS ReciboCobranza,

                -- NOTAS DE CRÉDITO/DÉBITO asociadas a la factura
                ISNULL(na.TieneNC, 0) AS TieneNC,
                ISNULL(na.TieneND, 0) AS TieneND,

                -- MONTOS AJUSTADOS POR FACTURA
                mf.ImporteFac,
                mf.SumNC,
                mf.SumND,
                mf.SumRC,
                mf.SaldoAjustado,
                mf.CodMonedaFac,
                mf.SimboloMonedaFac

            FROM #Solicitudes sol
                -- LEFT JOIN para ver solicitudes sin PR
                LEFT JOIN #PRBase pr
                    ON sol.EmpresaSolicitud = pr.FCRMVH_CODEMP
                    AND sol.NroSolicitud = pr.SolicitudAplica
                
                -- LÓGICA DE ITEMS: UNION FCRMVI + #Cargas (OUTER APPLY para no perder cabeceras)
                OUTER APPLY (
                    SELECT FCRMVI_NROITM AS NroItm FROM FCRMVI i2 WITH (NOLOCK)
                    WHERE pr.FCRMVH_CODFOR = i2.FCRMVI_CODFOR AND pr.FCRMVH_NROFOR = i2.FCRMVI_NROFOR AND pr.FCRMVH_CODEMP = i2.FCRMVI_CODEMP
                    UNION
                    SELECT NroItmCarga FROM #Cargas gt2 
                    WHERE pr.FCRMVH_CODFOR = gt2.CodPR AND pr.FCRMVH_NROFOR = gt2.NroPR AND pr.FCRMVH_CODEMP = gt2.EmpreCarga
                ) itms
                
                LEFT JOIN FCRMVI i WITH (NOLOCK)
                    ON pr.FCRMVH_CODFOR = i.FCRMVI_CODFOR 
                    AND pr.FCRMVH_NROFOR = i.FCRMVI_NROFOR
                    AND pr.FCRMVH_CODEMP = i.FCRMVI_CODEMP
                    AND itms.NroItm = i.FCRMVI_NROITM
                    
                LEFT JOIN #Cargas gt
                    ON pr.FCRMVH_CODFOR = gt.CodPR
                    AND pr.FCRMVH_NROFOR = gt.NroPR
                    AND pr.FCRMVH_CODEMP = gt.EmpreCarga
                    AND itms.NroItm = gt.NroItmCarga
                
                LEFT JOIN VTMCLH cl WITH (NOLOCK)
                    ON pr.FCRMVH_NROCTA = cl.VTMCLH_NROCTA
                LEFT JOIN STTLPR usd WITH (NOLOCK)
                    ON pr.FCRMVH_CODLIS = usd.STTLPR_CODLIS
                LEFT JOIN STMPDH sth WITH (NOLOCK)
                    ON i.FCRMVI_TIPPRO = sth.STMPDH_TIPPRO 
                    AND i.FCRMVI_ARTCOD = sth.STMPDH_ARTCOD
                LEFT JOIN STMPDH sth2 WITH (NOLOCK)
                    ON gt.TipProI = sth2.STMPDH_TIPPRO 
                    AND gt.ArtCodI = sth2.STMPDH_ARTCOD
                LEFT JOIN VTTCPH CnPag WITH (NOLOCK)
                    ON pr.FCRMVH_CNDPAG = CnPag.VTTCPH_CNDPAG
                
                LEFT JOIN #Recibos rc
                    ON gt.EmpreI = rc.EmpRC
                    AND gt.CodFac = rc.CodFact
                    AND gt.NroFac = rc.NroFact
                LEFT JOIN #NotasAjuste na
                    ON gt.EmpreI = na.EmpNA
                    AND gt.CodFac = na.CodFacNA
                    AND gt.NroFac = na.NroFacNA
                LEFT JOIN #MontosFac mf
                    ON gt.EmpreI = mf.EmpFac
                    AND gt.CodFac = mf.CodFac
                    AND gt.NroFac = mf.NroFac
            WHERE (@ClienteFiltro IS NULL
                   OR pr.FCRMVH_NROCTA LIKE '%' + @ClienteFiltro + '%'
                   OR cl.VTMCLH_NOMBRE LIKE '%' + @ClienteFiltro + '%'
                   OR gt.NomClientFacturar LIKE '%' + @ClienteFiltro + '%'
                   -- Búsqueda robusta por si el join a cl falló o hay espacios
                   OR EXISTS (SELECT 1 FROM VTMCLH cl2 WHERE cl2.VTMCLH_NROCTA = pr.FCRMVH_NROCTA AND cl2.VTMCLH_NOMBRE LIKE '%' + @ClienteFiltro + '%')
                )
                AND (@NroFacturaFiltro IS NULL OR gt.NroFac = @NroFacturaFiltro)
                AND (@NroCargaFiltro IS NULL OR gt.CodCar = @NroCargaFiltro)
                AND (@NroRCFiltro IS NULL OR rc.NroRC = @NroRCFiltro)
                AND (@FacturaTipoFiltro IS NULL OR UPPER(COALESCE(gt.CodFac, '')) LIKE @FacturaTipoLike)
                AND (@PuntoVentaFiltro IS NULL OR UPPER(COALESCE(gt.CodFac, '')) LIKE @PuntoVentaLike)

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
                ISNULL(gt.NomClientFacturar, cl.VTMCLH_NOMBRE) AS NomCliente,
                cl.VTMCLH_CNDPAG AS [CndPagCliente],
                pr.USR_FCRMVH_CONTAC,
                pr.FCRMVH_TEXTOS,
                pr.USR_FCRMVH_DESVIAJ,
                pr.FCRMVH_COFDEU,
                pr.SolicitudAplica,
                usd.STTLPR_DESCRP,
                CnPag.VTTCPH_DESCRP,
                usd.STTLPR_CODCOF,
                
                -- DATOS DE ITEMS
                itms.NroItm,
                COALESCE(gt.TipProI, i.FCRMVI_TIPPRO),
                COALESCE(gt.ArtCodI, i.FCRMVI_ARTCOD),
                COALESCE(sth2.STMPDH_DESCRP, sth.STMPDH_DESCRP, '(Item Adicional en Carga)'),
                
                -- Específicos PR
                i.FCRMVI_CANTID,
                i.FCRMVI_PRECIO,
                i.FCRMVI_TOTLIN,
                
                -- Específicos Carga
                gt.CantI,
                gt.PrecI,
                gt.TotalItemCarga,

                COALESCE(gt.CantI, i.FCRMVI_CANTID, 0),
                COALESCE(sth2.STMPDH_UNIMED, sth.STMPDH_UNIMED),
                COALESCE(gt.PrecI, i.FCRMVI_PRECIO, 0),
                COALESCE(gt.TotalItemCarga, i.FCRMVI_TOTLIN, 0),
                COALESCE(gt.ObservI, i.FCRMVI_TEXTOS),
                
                -- DATOS DE CARGA
                gt.EmpreCarga,
                gt.CodCar,
                gt.NroCRT,
                gt.NomClientFacturar AS ClienteAFacturar,
                gt.FecAltOPItems,
                gt.RemitenteOP,
                gt.DestinatarioOP,
                gt.TipoViaje, 
                gt.TipoOperacion,
                gt.LocalizacionCargaOP,
                gt.LocalizacionEntregaOP,
                gt.DomicilioCarga,
                gt.DomicilioDescarga,
                gt.DireccionRemitente,
                gt.DireccionDestinatario,
                
                -- DATOS DE FACTURA
                CASE 
                    WHEN gt.CodFac IS NULL OR gt.NroFac = 0 THEN 'Pendiente Facturación'
                    ELSE CONCAT(gt.CodFac, '-', gt.NroFac)
                END,
                gt.FecFactura,
                
                -- DATOS DE RECIBO
                CASE
                    WHEN rc.NroRC IS NULL AND gt.NroFac IS NOT NULL AND gt.NroFac > 0 THEN 'Pendiente Cobranza'
                    WHEN rc.NroRC IS NOT NULL THEN CONCAT(rc.CodRC, '-', rc.NroRC)
                    ELSE NULL
                END,

                -- NOTAS DE CRÉDITO/DÉBITO
                ISNULL(na.TieneNC, 0),
                ISNULL(na.TieneND, 0),

                -- MONTOS AJUSTADOS POR FACTURA
                mf.ImporteFac,
                mf.SumNC,
                mf.SumND,
                mf.SumRC,
                mf.SaldoAjustado,
                mf.CodMonedaFac,
                mf.SimboloMonedaFac

            FROM #PRBase pr
                -- Solo PRs sin solicitud
                LEFT JOIN #Solicitudes sol
                    ON pr.FCRMVH_CODEMP = sol.EmpresaSolicitud
                    AND pr.SolicitudAplica = sol.NroSolicitud
                
                -- LÓGICA DE ITEMS: UNION FCRMVI + #Cargas (OUTER APPLY para no perder cabeceras)
                OUTER APPLY (
                    SELECT FCRMVI_NROITM AS NroItm FROM FCRMVI i2 WITH (NOLOCK)
                    WHERE pr.FCRMVH_CODFOR = i2.FCRMVI_CODFOR AND pr.FCRMVH_NROFOR = i2.FCRMVI_NROFOR AND pr.FCRMVH_CODEMP = i2.FCRMVI_CODEMP
                    UNION
                    SELECT NroItmCarga FROM #Cargas gt2 
                    WHERE pr.FCRMVH_CODFOR = gt2.CodPR AND pr.FCRMVH_NROFOR = gt2.NroPR AND pr.FCRMVH_CODEMP = gt2.EmpreCarga
                ) itms
                
                LEFT JOIN FCRMVI i WITH (NOLOCK)
                    ON pr.FCRMVH_CODFOR = i.FCRMVI_CODFOR 
                    AND pr.FCRMVH_NROFOR = i.FCRMVI_NROFOR
                    AND pr.FCRMVH_CODEMP = i.FCRMVI_CODEMP
                    AND itms.NroItm = i.FCRMVI_NROITM
                    
                LEFT JOIN #Cargas gt
                    ON pr.FCRMVH_CODFOR = gt.CodPR
                    AND pr.FCRMVH_NROFOR = gt.NroPR
                    AND pr.FCRMVH_CODEMP = gt.EmpreCarga
                    AND itms.NroItm = gt.NroItmCarga
                    
                LEFT JOIN VTMCLH cl WITH (NOLOCK)
                    ON pr.FCRMVH_NROCTA = cl.VTMCLH_NROCTA
                LEFT JOIN STTLPR usd WITH (NOLOCK)
                    ON pr.FCRMVH_CODLIS = usd.STTLPR_CODLIS
                LEFT JOIN STMPDH sth WITH (NOLOCK)
                    ON i.FCRMVI_TIPPRO = sth.STMPDH_TIPPRO 
                    AND i.FCRMVI_ARTCOD = sth.STMPDH_ARTCOD
                LEFT JOIN STMPDH sth2 WITH (NOLOCK)
                    ON gt.TipProI = sth2.STMPDH_TIPPRO 
                    AND gt.ArtCodI = sth2.STMPDH_ARTCOD
                LEFT JOIN VTTCPH CnPag WITH (NOLOCK)
                    ON pr.FCRMVH_CNDPAG = CnPag.VTTCPH_CNDPAG
                
                LEFT JOIN #Recibos rc
                    ON gt.EmpreI = rc.EmpRC
                    AND gt.CodFac = rc.CodFact
                    AND gt.NroFac = rc.NroFact
                LEFT JOIN #NotasAjuste na
                    ON gt.EmpreI = na.EmpNA
                    AND gt.CodFac = na.CodFacNA
                    AND gt.NroFac = na.NroFacNA
                LEFT JOIN #MontosFac mf
                    ON gt.EmpreI = mf.EmpFac
                    AND gt.CodFac = mf.CodFac
                    AND gt.NroFac = mf.NroFac

            WHERE sol.NroSolicitud IS NULL
                AND (@ClienteFiltro IS NULL 
                     OR pr.FCRMVH_NROCTA LIKE '%' + @ClienteFiltro + '%' 
                     OR cl.VTMCLH_NOMBRE LIKE '%' + @ClienteFiltro + '%' 
                     OR gt.NomClientFacturar LIKE '%' + @ClienteFiltro + '%'
                     -- Búsqueda robusta por si el join a cl falló o hay espacios
                     OR EXISTS (SELECT 1 FROM VTMCLH cl2 WHERE cl2.VTMCLH_NROCTA = pr.FCRMVH_NROCTA AND cl2.VTMCLH_NOMBRE LIKE '%' + @ClienteFiltro + '%')
                    )
                AND (@NroFacturaFiltro IS NULL OR gt.NroFac = @NroFacturaFiltro)
                AND (@NroCargaFiltro IS NULL OR gt.CodCar = @NroCargaFiltro)
                AND (@NroRCFiltro IS NULL OR rc.NroRC = @NroRCFiltro)
                AND (@FacturaTipoFiltro IS NULL OR UPPER(COALESCE(gt.CodFac, '')) LIKE @FacturaTipoLike)
                AND (@PuntoVentaFiltro IS NULL OR UPPER(COALESCE(gt.CodFac, '')) LIKE @PuntoVentaLike)

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
            DROP TABLE #NotasAjuste;
            DROP TABLE #MontosFac;
        `;

        const result = await pool
            .request()
            .input("EmpresaFiltro", sql.VarChar(10), empresa)
            .input("FechaDesde", sql.Date, fechaDesde)
            .input("FechaHasta", sql.Date, fechaHasta)
            .input("ClienteFiltro", sql.VarChar(100), cliente)
            .input("NroPRFiltro", sql.BigInt, nroPR)
            .input("NroFacturaFiltro", sql.BigInt, nroFactura)
            .input("NroCargaFiltro", sql.BigInt, nroCarga)
            .input("NroRCFiltro", sql.BigInt, nroRC)
            .input("FacturaTipoFiltro", sql.VarChar(5), normalizedFacturaTipo)
            .input("FacturaTipoLike", sql.VarChar(10), facturaTipoLike)
            .input("PuntoVentaFiltro", sql.VarChar(10), normalizedPuntoVenta)
            .input("PuntoVentaLike", sql.VarChar(20), puntoVentaLike)
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
                nroFactura,
                nroCarga,
                nroRC,
                facturaTipo: normalizedFacturaTipo,
                puntoVenta: normalizedPuntoVenta,
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

// GET /api/seguimiento/notas - Notas de Crédito/Débito de una o varias facturas
router.get("/notas", async (req, res) => {
    try {
        const { empresa, facturas } = req.query;
        if (!empresa || !facturas) {
            return res.status(400).json({ success: false, error: 'Parámetros requeridos: empresa, facturas' });
        }

        const pool = await getConnection();

        // facturas puede ser "FE9996-38305" o "FE9996-38305,FA0012-20338"
        const facturaList = String(facturas).split(',').map(f => {
            const parts = f.trim().split('-');
            const nroFac = parseInt(parts[parts.length - 1], 10);
            const codFac = parts.slice(0, -1).join('-');
            return { codFac, nroFac };
        }).filter(f => f.codFac && !isNaN(f.nroFac));

        if (facturaList.length === 0) {
            return res.status(400).json({ success: false, error: 'No se pudo parsear ninguna factura válida' });
        }

        // Construir condición IN para múltiples facturas
        const conditions = facturaList.map((_, i) =>
            `(SAR_VTRMVA_CODAPL = @CodFac${i} AND SAR_VTRMVA_NROAPL = @NroFac${i})`
        ).join(' OR ');

        const request = pool.request().input('Empresa', sql.VarChar(10), empresa);
        facturaList.forEach((f, i) => {
            request.input(`CodFac${i}`, sql.VarChar(20), f.codFac);
            request.input(`NroFac${i}`, sql.BigInt, f.nroFac);
        });

        const result = await request.query(`
            SELECT
                n.SAR_VTRMVA_CODFOR AS CodigoNota,
                n.SAR_VTRMVA_NROFOR AS NumeroNota,
                CASE
                    WHEN n.SAR_VTRMVA_CODFOR LIKE 'C%' THEN 'Nota de Crédito'
                    WHEN n.SAR_VTRMVA_CODFOR LIKE 'D%' THEN 'Nota de Débito'
                    ELSE 'Otro'
                END AS TipoNota,
                n.SAR_VTRMVA_CODAPL AS CodigoFactura,
                n.SAR_VTRMVA_NROAPL AS NumeroFactura,
                n.SAR_VT_USERID AS Usuario,
                n.SAR_VT_FECALT AS FechaAlta,
                -- Datos del encabezado de la nota (VTRMVH)
                h.VTRMVH_FCHMOV AS FechaMovimiento,
                h.VTRMVH_SUCURS AS Sucursal,
                h.VTRMVH_TEXTOS AS Descripcion,
                h.VTRMVH_COFFAC AS CodMoneda,
                h.VTRMVH_CAMBIO AS TipoCambio,
                h.VTRMVH_CAMUSS AS TipoCambioUSS,
                h.VTRMVH_NROCAE AS NroCAE,
                -- Descripción de moneda (GRTCOF)
                c.GRTCOF_DESCRP AS DescripcionMoneda,
                c.GRTCOF_SIMBOL AS SimboloMoneda,
                -- Totales desde VTRMVC (mismo origen que usa Softland internamente)
                (SELECT SUM(vc.VTRMVC_IMPEXT) FROM VTRMVC vc WITH (NOLOCK)
                 WHERE vc.VTRMVC_CODEMP = @Empresa
                   AND vc.VTRMVC_MODFOR = n.SAR_VTRMVA_MODFOR
                   AND vc.VTRMVC_CODFOR = n.SAR_VTRMVA_CODFOR
                   AND vc.VTRMVC_NROFOR = n.SAR_VTRMVA_NROFOR
                   AND vc.VTRMVC_MODAPL = vc.VTRMVC_MODFOR
                   AND vc.VTRMVC_CODAPL = vc.VTRMVC_CODFOR
                   AND vc.VTRMVC_NROAPL = vc.VTRMVC_NROFOR) AS ImporteExt,
                (SELECT SUM(vc.VTRMVC_IMPNAC) FROM VTRMVC vc WITH (NOLOCK)
                 WHERE vc.VTRMVC_CODEMP = @Empresa
                   AND vc.VTRMVC_MODFOR = n.SAR_VTRMVA_MODFOR
                   AND vc.VTRMVC_CODFOR = n.SAR_VTRMVA_CODFOR
                   AND vc.VTRMVC_NROFOR = n.SAR_VTRMVA_NROFOR
                   AND vc.VTRMVC_MODAPL = vc.VTRMVC_MODFOR
                   AND vc.VTRMVC_CODAPL = vc.VTRMVC_CODFOR
                   AND vc.VTRMVC_NROAPL = vc.VTRMVC_NROFOR) AS ImporteNac
            FROM SAR_VTRMVA n WITH (NOLOCK)
            LEFT JOIN VTRMVH h WITH (NOLOCK)
                ON h.VTRMVH_CODEMP = @Empresa
                AND h.VTRMVH_MODFOR = n.SAR_VTRMVA_MODFOR
                AND h.VTRMVH_CODFOR = n.SAR_VTRMVA_CODFOR
                AND h.VTRMVH_NROFOR = n.SAR_VTRMVA_NROFOR
            LEFT JOIN GRTCOF c WITH (NOLOCK)
                ON c.GRTCOF_CODCOF = h.VTRMVH_COFFAC
            WHERE n.SAR_VTRMVA_CODEMP = @Empresa
                AND n.SAR_VTRMVA_MODFOR = 'VT'
                AND (n.SAR_VTRMVA_CODFOR LIKE 'C%' OR n.SAR_VTRMVA_CODFOR LIKE 'D%')
                AND n.SAR_VTRMVA_MODAPL = 'VT'
                AND (${conditions})
            ORDER BY n.SAR_VT_FECALT DESC
        `);

        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error("Error al obtener notas de ajuste:", error);
        res.status(500).json({ success: false, error: error.message });
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
