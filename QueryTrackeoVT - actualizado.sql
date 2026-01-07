/*==============================================================================
    TABLA TEMPORAL CON ÍNDICES
    Si la anterior sigue lenta, usamos tabla temporal
==============================================================================*/

DECLARE @FechaDesde DATE = '2020-01-01';
DECLARE @FechaHasta DATE = '2025-12-31';

-- Paso 1: Crear tabla temporal con PRs base
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
    h.FCRMVH_COFDEU
INTO #PRBase
FROM FCRMVH h WITH (NOLOCK)
WHERE 
    h.FCRMVH_MODFOR = 'FC'
    AND h.FCRMVH_CODFOR = 'PR'
    AND h.FCRMVH_FCHMOV BETWEEN @FechaDesde AND @FechaHasta
    AND (h.FCRMVH_CODEMP IS NOT NULL OR h.FCRMVH_CODEMP in ('DIBIAG','MULTIM'))
    AND h.FCRMVH_ESTAUT = 1 and h.FCRMVH_ESTAUT is not null;

-- Crear índice en la tabla temporal
CREATE CLUSTERED INDEX IX_PRBase ON #PRBase (FCRMVH_CODEMP,FCRMVH_CODFOR, FCRMVH_NROFOR);

-- Paso 2: Cargas asociadas y Facturas asociadas a la carga
IF OBJECT_ID('tempdb..#Cargas') IS NOT NULL DROP TABLE #Cargas;

SELECT DISTINCT
    gt.USR_GTMVIH_CODEMP AS EmpreCarga,
    gt.USR_GTMVIH_CODIGO AS CodCar,
    gt.USR_GTMVIH_NROFOR AS NroPR,
    i.USR_GTMVII_CODEMP AS EmpreI,
    i.USR_GTMVII_CODFAC AS CodFac,
    i.USR_GTMVII_NROFAC AS NroFac,
    i.USR_GT_FECALT AS FecAltOPItems
INTO #Cargas
FROM USR_GTMVIH gt WITH (NOLOCK)
    INNER JOIN #PRBase pr
        ON gt.USR_GTMVIH_CODFOR = pr.FCRMVH_CODFOR
        AND gt.USR_GTMVIH_NROFOR = pr.FCRMVH_NROFOR
        AND gt.USR_GTMVIH_CODEMP = pr.FCRMVH_CODEMP
    INNER JOIN USR_GTMVII i
        ON gt.USR_GTMVIH_CODIGO = i.USR_GTMVII_CODIGO
        AND gt.USR_GTMVIH_CODEMP = i.USR_GTMVII_CODEMP
WHERE gt.USR_GTMVIH_CODFOR = 'PR';

CREATE CLUSTERED INDEX IX_Cargas ON #Cargas (NroPR);
CREATE NONCLUSTERED INDEX IX_Cargas_Cod ON #Cargas (CodCar);

-- por ahora el paso 3 lo puedo saltear, ya que puedo obtener la factura asociada a una carga a través de la carga misma con los campos: USR_GTMVII_CODFAC y USR_GTMVII_NROFAC, 
-- además de el cliente al que se le facturará por el campo: USR_GTMVII_CLIENT
---- Paso 3: Facturas
--IF OBJECT_ID('tempdb..#Facturas') IS NOT NULL DROP TABLE #Facturas;

--SELECT 
--    fch.FCRMVH_CODFOR,
--    fch.FCRMVH_NROFOR,
--    fch.USR_FCRMVH_NROCAR AS NroOP
--INTO #Facturas
--FROM FCRMVH fch WITH (NOLOCK)
--    INNER JOIN #Cargas c
--        ON fch.USR_FCRMVH_NROCAR = c.CodCar
--WHERE fch.USR_FCRMVH_NROCAR IS NOT NULL;

--CREATE CLUSTERED INDEX IX_Facturas ON #Facturas (NroOP);

-- Paso 4: Recibos de Cobranza
IF OBJECT_ID('tempdb..#Recibos') IS NOT NULL DROP TABLE #Recibos;

SELECT VTRMVC_CODEMP AS EmpRC, VTRMVC_CODFOR AS CodRC, VTRMVC_NROFOR AS NroRC,
    vc.VTRMVC_CODAPL AS CodFact, vc.VTRMVC_NROAPL AS NroFact
INTO #Recibos
FROM VTRMVC vc
inner join #Cargas gt
    ON vc.VTRMVC_CODAPL = gt.CodFac
    AND vc.VTRMVC_NROAPL = gt.NroFac
    AND vc.VTRMVC_CODEMP = gt.EmpreI
WHERE VTRMVC_MODFOR = 'VT' 
and VTRMVC_MODAPL = 'VT'  
--and VTRMVC_CODAPL LIKE 'F%'
and VTRMVC_CODFOR = 'RC' 

-- Paso 5: Query final SIMPLE y RÁPIDA
SELECT
    -- DATOS DE PRESUPUESTO
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
    usd.STTLPR_DESCRP AS ListaPrecio,
    CnPag.VTTCPH_DESCRP AS CondicionPago,
    i.FCRMVI_NROITM AS NroItm,
    i.FCRMVI_TIPPRO AS TipPro,
    i.FCRMVI_ARTCOD AS ArtCod,
    sth.STMPDH_DESCRP AS DescrpProd,
    i.FCRMVI_CANTID AS Cantidad,
    sth.STMPDH_UNIMED AS UnidadMedida,
    i.FCRMVI_PRECIO AS Precio,
    i.FCRMVI_TOTLIN AS TotalItem,
    CASE WHEN Isnull(i.FCRMVI_TEXTOS,'') like '' THEN 'Sin ninguna observacion'
    ELSE i.FCRMVI_TEXTOS
    END AS ObservacionesItem,
    -- DATOS DE CARGA
    gt.EmpreCarga AS EmpresaCarga,
    gt.CodCar AS CodigoCarga,
    CASE WHEN isNull(gt.CodFac,'')='' and isNull(gt.NroFac,0)=0 THEN 'CARGA NO FACTURADA'
    ELSE Concat('Tipo Factura: ',gt.CodFac, ', Nro. Factura: ', gt.NroFac)
    END AS [FacturaAsociadaOP],
    gt.FecAltOPItems AS FecAltCarga,
    -- DATOS DE RC
    CASE WHEN isNull(rc.CodRC,'')='' and isNull(rc.NroRC,0)=0 THEN 'Sin Recibo de Cobranza'
    ELSE Concat('Recibo: ',rc.CodRC, ' ',rc.NroRC)
    END AS [ReciboCobranza]
    
FROM #PRBase pr
    INNER JOIN FCRMVI i WITH (NOLOCK)
        ON pr.FCRMVH_CODFOR = i.FCRMVI_CODFOR 
        AND pr.FCRMVH_NROFOR = i.FCRMVI_NROFOR
        AND pr.FCRMVH_CODEMP = i.FCRMVI_CODEMP
    INNER JOIN VTMCLH cl WITH (NOLOCK)
        ON pr.FCRMVH_NROCTA = cl.VTMCLH_NROCTA
    INNER JOIN STTLPR usd WITH (NOLOCK)
        ON pr.FCRMVH_CODLIS = usd.STTLPR_CODLIS
    INNER JOIN STMPDH sth WITH (NOLOCK)
        ON i.FCRMVI_TIPPRO = sth.STMPDH_TIPPRO 
        AND i.FCRMVI_ARTCOD = sth.STMPDH_ARTCOD
    INNER JOIN VTTCPH CnPag WITH (NOLOCK)
        ON pr.FCRMVH_CNDPAG = CnPag.VTTCPH_CNDPAG
    INNER JOIN #Cargas gt
        ON pr.FCRMVH_NROFOR = gt.NroPR
        AND pr.FCRMVH_CODEMP = gt.EmpreCarga
    LEFT JOIN #Recibos rc
        ON gt.EmpreI = rc.EmpRC
        AND gt.CodFac = rc.CodFact
        AND gt.NroFac = rc.NroFact
ORDER BY 
    --pr.FCRMVH_FCHMOV DESC,
    --pr.FCRMVH_NROFOR,
    --i.FCRMVI_NROITM;
    gt.FecAltOPItems desc

-- Limpiar
DROP TABLE #PRBase;
DROP TABLE #Cargas;
DROP TABLE #Recibos;
--DROP TABLE #Facturas;

GO
