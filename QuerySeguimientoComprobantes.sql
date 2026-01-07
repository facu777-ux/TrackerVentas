/*==============================================================================
  CONSULTA OPTIMIZADA: Trazabilidad PR -> CARGA -> Factura
  Objetivo: Seguimiento histórico desde Presupuesto hasta Factura aplicada
  Optimizaciones aplicadas:
  - Eliminación de JOINs innecesarios
  - Filtros tempranos y específicos
  - Reducción de redundancias
  - Mejor organización de CTEs
==============================================================================*/

-- PARÁMETROS DE FILTRO (Declarar al inicio para facilitar cambios)
DECLARE @EmpresaFiltro VARCHAR(10) = 'DIBIAG';  -- 'DIBIAG' o 'MULTIM' o NULL para todas
DECLARE @FechaDesde DATE = '2024-01-01';
DECLARE @FechaHasta DATE = '2025-12-31';

;WITH PR AS (
    /*--------------------------------------------------------------------------
      CTE 1: PRESUPUESTOS
      Se obtienen los presupuestos base con información del cliente y productos
    --------------------------------------------------------------------------*/
    SELECT
        h.FCRMVH_CODEMP AS EmpOri,
        h.FCRMVH_CODFOR AS PR,
        h.FCRMVH_NROFOR AS NroPR,
        h.FCRMVH_FCHMOV AS FchMovimiento,
        h.FCRMVH_FECALT AS FchAltaRegistro,
        h.FCRMVH_NROCTA AS CodCliente,
        cl.VTMCLH_NOMBRE AS NomCliente,
        h.USR_FCRMVH_CONTAC AS ContactoDeCliente,
        h.USR_FCRMVH_DESVIAJ AS DescrpViaj,
        h.FCRMVH_COFDEU AS CoefRegistracion,
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
        i.FCRMVI_TEXTOS AS ObservacionesItem
    FROM FCRMVH h WITH (NOLOCK)  -- NOLOCK para consultas de solo lectura
        INNER JOIN FCRMVI i WITH (NOLOCK)
            ON h.FCRMVH_CODFOR = i.FCRMVI_CODFOR 
            AND h.FCRMVH_NROFOR = i.FCRMVI_NROFOR
        INNER JOIN VTMCLH cl WITH (NOLOCK)
            ON h.FCRMVH_NROCTA = cl.VTMCLH_NROCTA
        INNER JOIN STTLPR usd WITH (NOLOCK)
            ON h.FCRMVH_CODLIS = usd.STTLPR_CODLIS
        INNER JOIN STMPDH sth WITH (NOLOCK)
            ON i.FCRMVI_TIPPRO = sth.STMPDH_TIPPRO 
            AND i.FCRMVI_ARTCOD = sth.STMPDH_ARTCOD
        INNER JOIN VTTCPH CnPag WITH (NOLOCK)
            ON h.FCRMVH_CNDPAG = CnPag.VTTCPH_CNDPAG
    WHERE 
        h.FCRMVH_MODFOR = 'FC'
        AND h.FCRMVH_CODFOR = 'PR'
        AND h.FCRMVH_FCHMOV BETWEEN @FechaDesde AND @FechaHasta
        AND (@EmpresaFiltro IS NULL OR h.FCRMVH_CODEMP = @EmpresaFiltro)
),
CARGA AS (
    /*--------------------------------------------------------------------------
      CTE 2: CARGAS asociadas a Presupuestos
      Se vinculan las cargas con los presupuestos encontrados
    --------------------------------------------------------------------------*/
    SELECT DISTINCT  -- DISTINCT para evitar duplicados si hay datos repetidos
        gtH.USR_GTMVIH_CODIGO AS CodCar,
        gtH.USR_GTMVIH_NROFOR AS NroPR
    FROM USR_GTMVIH gtH WITH (NOLOCK)
        INNER JOIN PR pr
            ON gtH.USR_GTMVIH_CODFOR = pr.PR 
            AND gtH.USR_GTMVIH_NROFOR = pr.NroPR
    WHERE 
        gtH.USR_GTMVIH_CODFOR = 'PR'
),
FACTURAS AS (
    /*--------------------------------------------------------------------------
      CTE 3: FACTURAS asociadas a Cargas
      Se obtienen las facturas que referencian a las cargas
      OPTIMIZACIÓN: Eliminado JOIN innecesario con FCRMVI
    --------------------------------------------------------------------------*/
    SELECT DISTINCT
        fch.FCRMVH_CODFOR,
        fch.FCRMVH_NROFOR,
        fch.USR_FCRMVH_NROCAR AS NroOP
    FROM FCRMVH fch WITH (NOLOCK)
        INNER JOIN CARGA
            ON fch.USR_FCRMVH_NROCAR = CARGA.CodCar
    WHERE 
        fch.USR_FCRMVH_NROCAR IS NOT NULL  -- Asegurar que tenga carga asociada
)
/*==============================================================================
  CONSULTA FINAL: Combinación de todos los CTEs
==============================================================================*/
SELECT top 25
    pr.EmpOri,
    pr.PR,
    pr.NroPR,
    pr.FchMovimiento,
    pr.FchAltaRegistro,
    pr.CodCliente,
    pr.NomCliente,
    pr.ContactoDeCliente,
    pr.DescrpViaj,
    pr.CoefRegistracion,
    pr.ListaPrecio,
    pr.CondicionPago,
    pr.NroItm,
    pr.TipPro,
    pr.ArtCod,
    pr.DescrpProd,
    pr.Cantidad,
    pr.UnidadMedida,
    pr.Precio,
    pr.TotalItem,
    pr.ObservacionesItem,
    gt.CodCar,
    fc.FCRMVH_CODFOR AS TipoFactura,
    fc.FCRMVH_NROFOR AS NroFactura
FROM PR pr
    INNER JOIN CARGA gt
        ON pr.NroPR = gt.NroPR
    LEFT JOIN FACTURAS fc  -- LEFT JOIN por si hay cargas sin factura aún
        ON gt.CodCar = fc.NroOP

ORDER BY 
    pr.FchMovimiento DESC,
    pr.NroPR,
    pr.NroItm;

