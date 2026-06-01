const express = require("express");
const router = express.Router();
const { getConnection, sql } = require("../config/database");

const BRACKETS = [
    { key: "d0_30",    min: 0,   max: 30  },
    { key: "d31_60",   min: 31,  max: 60  },
    { key: "d61_90",   min: 61,  max: 90  },
    { key: "d91_120",  min: 91,  max: 120 },
    { key: "dMas120",  min: 121, max: Infinity },
];

const getBracket = (dias) => {
    const b = BRACKETS.find(b => dias >= b.min && dias <= b.max);
    return b ? b.key : "dMas120";
};

const emptyBrackets = () => ({ d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, dMas120: 0 });

const aggregateSection = (items) => {
    const byClient = {};

    items.forEach(item => {
        const key = item.Cliente;
        if (!byClient[key]) {
            byClient[key] = {
                nombre: key,
                empresa: item.Empresa,
                diasMax: 0,
                total: 0,
                ...emptyBrackets(),
            };
        }
        const bracket = getBracket(item.DiasTranscurridos || 0);
        byClient[key][bracket] += Number(item.Monto) || 0;
        byClient[key].total += Number(item.Monto) || 0;
        byClient[key].diasMax = Math.max(byClient[key].diasMax, item.DiasTranscurridos || 0);
    });

    const clientes = Object.values(byClient).sort((a, b) => b.total - a.total);

    const totalesColumna = emptyBrackets();
    let totalGeneral = 0;
    clientes.forEach(c => {
        BRACKETS.forEach(b => { totalesColumna[b.key] += c[b.key]; });
        totalGeneral += c.total;
    });

    return { clientes, totalesColumna, totalGeneral };
};

// GET /api/aging?empresa=MULTIM
router.get("/", async (req, res) => {
    try {
        const empresa = req.query.empresa || null;
        const pool = await getConnection();
        const request = pool.request();
        request.input("Empresa", sql.NVarChar(10), empresa);

        const result = await request.query(`
            -- Cargas sin facturar (fecha inicio: alta de la carga)
            SELECT
                ISNULL(vtc.VTMCLH_NOMBRE, 'Sin Cliente') AS Cliente,
                gt.USR_GTMVIH_CODIGO                     AS NroCarga,
                gt.USR_GTMVIH_NROFOR                     AS NroPR,
                h.FCRMVH_CODEMP                          AS Empresa,
                ISNULL(i.USR_VIRT_TOTLIN, 0)             AS Monto,
                i.USR_GT_FECALT                          AS FechaReferencia,
                DATEDIFF(day, i.USR_GT_FECALT, GETDATE()) AS DiasTranscurridos,
                'SIN_FACTURA'                            AS TipoItem
            FROM USR_GTMVIH gt WITH (NOLOCK)
            INNER JOIN USR_GTMVII i WITH (NOLOCK)
                ON gt.USR_GTMVIH_CODIGO = i.USR_GTMVII_CODIGO
                AND gt.USR_GTMVIH_CODEMP = i.USR_GTMVII_CODEMP
            INNER JOIN FCRMVH h WITH (NOLOCK)
                ON gt.USR_GTMVIH_NROFOR = h.FCRMVH_NROFOR
                AND gt.USR_GTMVIH_CODEMP = h.FCRMVH_CODEMP
                AND h.FCRMVH_CODFOR = 'PR'
                AND h.FCRMVH_MODFOR = 'FC'
            LEFT JOIN VTMCLH vtc WITH (NOLOCK)
                ON i.USR_GTMVII_CLIENT = vtc.VTMCLH_NROCTA
            WHERE
                gt.USR_GTMVIH_CODFOR = 'PR'
                AND (i.USR_GTMVII_NROFAC IS NULL OR i.USR_GTMVII_NROFAC = 0)
                AND ISNULL(gt.USR_GTMVIH_ANULAR, 'N') <> 'S'
                AND (gt.USR_GTMVIH_MOTBAJ IS NULL OR gt.USR_GTMVIH_MOTBAJ = '')
                AND h.FCRMVH_CODEMP IN ('DIBIAG', 'MULTIM')
                AND (@Empresa IS NULL OR h.FCRMVH_CODEMP = @Empresa)
                AND i.USR_GT_FECALT IS NOT NULL

            UNION ALL

            -- Facturas sin cobrar (fecha inicio: fecha de emisión de la factura)
            SELECT
                ISNULL(vtc.VTMCLH_NOMBRE, 'Sin Cliente') AS Cliente,
                gt.USR_GTMVIH_CODIGO                     AS NroCarga,
                gt.USR_GTMVIH_NROFOR                     AS NroPR,
                i.USR_GTMVII_CODEMP                      AS Empresa,
                ISNULL(i.USR_VIRT_TOTLIN, 0)             AS Monto,
                f.FCRMVH_FCHMOV                          AS FechaReferencia,
                DATEDIFF(day, f.FCRMVH_FCHMOV, GETDATE()) AS DiasTranscurridos,
                'SIN_COBRAR'                             AS TipoItem
            FROM USR_GTMVIH gt WITH (NOLOCK)
            INNER JOIN USR_GTMVII i WITH (NOLOCK)
                ON gt.USR_GTMVIH_CODIGO = i.USR_GTMVII_CODIGO
                AND gt.USR_GTMVIH_CODEMP = i.USR_GTMVII_CODEMP
            INNER JOIN FCRMVH f WITH (NOLOCK)
                ON i.USR_GTMVII_CODEMP = f.FCRMVH_CODEMP
                AND i.USR_GTMVII_CODFAC = f.FCRMVH_CODFOR
                AND i.USR_GTMVII_NROFAC = f.FCRMVH_NROFOR
            INNER JOIN FCRMVH h WITH (NOLOCK)
                ON gt.USR_GTMVIH_NROFOR = h.FCRMVH_NROFOR
                AND gt.USR_GTMVIH_CODEMP = h.FCRMVH_CODEMP
                AND h.FCRMVH_CODFOR = 'PR'
                AND h.FCRMVH_MODFOR = 'FC'
            LEFT JOIN VTMCLH vtc WITH (NOLOCK)
                ON i.USR_GTMVII_CLIENT = vtc.VTMCLH_NROCTA
            WHERE
                gt.USR_GTMVIH_CODFOR = 'PR'
                AND i.USR_GTMVII_NROFAC IS NOT NULL
                AND i.USR_GTMVII_NROFAC > 0
                AND ISNULL(gt.USR_GTMVIH_ANULAR, 'N') <> 'S'
                AND (gt.USR_GTMVIH_MOTBAJ IS NULL OR gt.USR_GTMVIH_MOTBAJ = '')
                AND h.FCRMVH_CODEMP IN ('DIBIAG', 'MULTIM')
                AND (@Empresa IS NULL OR i.USR_GTMVII_CODEMP = @Empresa)
                AND f.FCRMVH_FCHMOV IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM VTRMVC rc WITH (NOLOCK)
                    WHERE rc.VTRMVC_CODEMP = i.USR_GTMVII_CODEMP
                    AND rc.VTRMVC_CODAPL = i.USR_GTMVII_CODFAC
                    AND rc.VTRMVC_NROAPL = i.USR_GTMVII_NROFAC
                    AND rc.VTRMVC_MODFOR = 'VT'
                    AND rc.VTRMVC_MODAPL = 'VT'
                    AND rc.VTRMVC_CODFOR = 'RC'
                )
        `);

        const records = result.recordset;

        const sinFacturar = records.filter(r => r.TipoItem === "SIN_FACTURA");
        const sinCobrar   = records.filter(r => r.TipoItem === "SIN_COBRAR");

        const cargasSinFacturar = aggregateSection(sinFacturar);
        const facturasSinCobrar = aggregateSection(sinCobrar);

        // KPIs globales
        const exposicionTotal   = records.reduce((s, r) => s + (Number(r.Monto) || 0), 0);
        const antigüedadMaxima  = records.reduce((m, r) => Math.max(m, r.DiasTranscurridos || 0), 0);
        const montoCritico      = records
            .filter(r => (r.DiasTranscurridos || 0) > 90)
            .reduce((s, r) => s + (Number(r.Monto) || 0), 0);

        const byClient = {};
        records.forEach(r => {
            const k = r.Cliente;
            if (!byClient[k]) byClient[k] = { nombre: k, total: 0, diasMax: 0, empresa: r.Empresa };
            byClient[k].total  += Number(r.Monto) || 0;
            byClient[k].diasMax = Math.max(byClient[k].diasMax, r.DiasTranscurridos || 0);
        });

        const clientesAfectados = Object.keys(byClient).length;

        const top10Deudores = Object.values(byClient)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .map(d => ({
                ...d,
                estado: d.diasMax > 90 ? "CRITICO" : d.diasMax > 60 ? "ALERTA" : d.diasMax > 30 ? "ATENCION" : "NORMAL",
            }));

        res.json({
            success: true,
            generadoEl: new Date().toISOString(),
            empresa,
            kpis: {
                exposicionTotal,
                clientesAfectados,
                antigüedadMaxima,
                montoCritico,
                porcentajeCritico: exposicionTotal > 0
                    ? Math.round((montoCritico / exposicionTotal) * 100)
                    : 0,
            },
            top10Deudores,
            cargasSinFacturar,
            facturasSinCobrar,
        });

    } catch (error) {
        console.error("Error en aging:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
