# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

**Backend** (port 4000):
```bash
cd backend
npm run dev        # nodemon (hot reload)
npm start          # node server.js
```

**Frontend** (port 4001):
```bash
cd frontend
npm run dev        # vite dev server
npm run build      # production build
```

> The `npm run dev` scripts use explicit `node ./node_modules/...` paths as a legacy workaround from when the parent directory was named `I&D Proyectos` (the `&` broke npm on Windows). The folder is now `ID Proyectos`, so this is no longer strictly necessary, but the scripts haven't been reverted.

All frontend HTTP goes through the single axios instance in `frontend/src/services/api.js`, whose `baseURL` is `VITE_API_URL` or `http://localhost:4000/api` by default. Add new endpoints as methods on `seguimientoAPI` / `agingAPI` there rather than calling axios from components.

Backend env vars (`backend/.env`, not committed): `DB_SERVER`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`, `TAILSCALE_AUTHKEY`, `PORT`.

There are no tests or linters configured in either package. Verification is manual (run both dev servers and exercise the UI). The closest thing to a check is the production build — `node ./node_modules/vite/bin/vite.js build` from `frontend/` — which compiles cleanly apart from a pre-existing "chunk > 500 kB" warning; treat any *new* warning as a regression.

> **Note**: `README.md` is outdated — it references ports 3001/3002 and `.bat` launcher scripts that no longer exist. This file is the authoritative reference.

### Debugging

- **API trace**: `localStorage.setItem("tv_api_trace", "1")` — logs request/response for the main `/seguimiento` endpoint.
- **Bot search trace**: `localStorage.setItem("tv_bot_trace", "1")` — logs chatbot entity-matching logic.

### Session history

Past working sessions are summarized in Spanish under `.claude/history/` (`YYYY-MM-DD-<tema>.md`), written by the `/cerrar-sesion` skill. Useful for recovering the reasoning behind recent in-progress work (e.g. the rutas modal, the planned login/email-verification feature).

---

## Architecture

### Stack
- **Backend**: Node.js + Express + `mssql` (tedious driver) connecting to SQL Server 2022
- **Frontend**: React 18 + Vite, no state management library — all state lives in `App.jsx`
- **Deployment**: Backend as Docker on Render (`render.yaml`); frontend is a static build. `backend/utils/keepAlive.js` pings `/api/health` every 10 min to prevent Render's free tier from spinning down.

### Database connection
Single connection pool in `backend/config/database.js`. `getConnection()` is a lazy singleton — it creates the pool on first call and reuses it. All routes import `{ getConnection, sql }` from there.

SQL Server is on-premise and reached via Tailscale in production (socks5 proxy at `127.0.0.1:1055`), controlled by the `TAILSCALE_AUTHKEY` env var.

### Backend routes (`backend/routes/`)

| File | Purpose |
|---|---|
| `seguimiento.js` | Core route. `POST /` runs the main multi-step query. Additional GETs: `/empresas`, `/clientes`, `/notas` (NC/ND detail), `/kpi-comparison`, `/rutas-reporte` (route history report) |
| `aging.js` | Aging report |
| `dashboard.js` | Analytics/KPI aggregations + comparison period (`GET /api/dashboard/kpis`) |
| `exchange.js` | Proxy for BNA (Argentina) and SII Chile USD rates |
| `pointsOfSale.js` | AFIP points-of-sale lookup |
| `chatbot.js` | AI assistant backend — **currently WIP, hidden from UI** |

Mounted in `server.js` at `/api/seguimiento`, `/api/dashboard`, `/api/chatbot`, `/api/exchange`, `/api/points-of-sale`, `/api/aging`.

**Layering is inconsistent by design/history**: `seguimiento.js`, `aging.js` and `dashboard.js` hold their SQL inline in the route file; `chatbot.js`, `exchange.js` and `pointsOfSale.js` are thin and delegate to `backend/controllers/` (+ `backend/services/aiService.js`). Follow whichever pattern the file you're editing already uses.

### Large files to be aware of

`ResultsTable.jsx` (~2.3k lines), `seguimiento.js` (~1.1k), `App.jsx` (~1.1k) and `AnalyticsDashboard.jsx` (~850) are the hot spots. Read the relevant region rather than the whole file, and prefer targeted edits — these are the files where a careless full rewrite does the most damage.

### Main query (`seguimiento.js` — `POST /api/seguimiento`)

The query is a long sequential SQL script that builds temp tables step by step, then produces a UNION ALL result:

1. `#Solicitudes` — budget requests (`USR_BOTPRE`)
2. `#Presupuestos` — quotes (`FCRMVH`)
3. `#Cargas` — shipment orders (`GTTRMVH`)
4. `#Facturas` — invoices (`SAR_VTRMVA` applied to cargas)
5. `#Recibos` — payment receipts (`COBTRMVH`)
6. `#NotasAjuste` — credit/debit notes flags (`SAR_VTRMVA` — `TieneNC`/`TieneND` per invoice)

Final SELECT is a **UNION ALL** of two parts (rows where there IS a carga vs. rows that only have a presupuesto/solicitud). Both parts must have identical column count and order; only the first part uses aliases.

**UNION ALL pitfall**: when adding columns, they must be added to **both** SELECT parts. The second part must not repeat aliases.

### Frontend data flow

`App.jsx` is the single source of truth. Data flows through two sequential memos:

1. `searchedData` — `data` filtered by `searchTerm` (text search across PR, client, product, carga, factura fields)
2. `filteredData` — `searchedData` filtered by `activeFilter` + `filterConNC`/`filterConND`

`filteredData` is passed to `ResultsTable` and analytics components. `searchedData` is passed to `AnalyticsDashboard` (the analytics view computes its own empresa sub-filter internally).

### App views (`activeView`)

| Value | Description |
|---|---|
| `'dashboard'` | Main table + charts — default view |
| `'analitica'` | Analytics dashboard (`AnalyticsDashboard.jsx`) |
| `'logistica'` | Logistics view (`LogisticsView.jsx`) |

`empresaAnalitica` (null / `'DIBIAG'` / `'MULTIM'`) is a sub-filter only active in the `'analitica'` view. `AnalyticsDashboard` receives `searchedData` (not `filteredData`) and applies `empresaAnalitica` internally via its own `filteredData` useMemo.

### Currency normalization

`displayCurrency` can be `'ARS'`, `'USD_BNA'`, or `'USD_SII'`. `CodMoneda === '2'` means the row is in USD. Conversion: divide ARS→USD by `exchangeRate` (BNA) or `chileExchangeRate` (SII); multiply USD→ARS by `exchangeRate`. Defaults: BNA=1000, SII=950.

### ResultsTable data model

The API returns flat rows. `ResultsTable.jsx` groups them into a two-level hierarchy:
- **Carga** (shipment order) as the parent row
- **Facturas** as children within each carga

Each carga's `info` object aggregates flags from its child invoices (e.g., `TieneNC`, `TieneND`).

The timeline ("pipeline bubbles") has 5 steps: 0=Solicitud, 1=Presupuesto, 2=Carga, 3=Factura, 4=Recibo. Step 3 renders NC/ND overlay badges when `TieneNC`/`TieneND` are truthy — use `!!value` (not `value`) in JSX conditionals to avoid integer `0` rendering as text.

### AnalyticsDashboard (`AnalyticsDashboard.jsx`)

`kpis` useMemo is the core aggregation. It iterates `filteredData` and builds `budgetsMap` keyed by `${empresa}-${nroPR}` — one entry per unique presupuesto. This is the atomic unit for all stats cards and the Embudo funnel.

Per-presupuesto flags in `budgetsMap` entries: `hasCarga`, `hasFactura`, `hasCobro`. After the forEach, these are counted into:
- `counts.uniquePresupuestos` — total presupuestos
- `counts.presupuestosConCarga` — presupuestos that have at least one carga
- `counts.presupuestosConFactura` — presupuestos with at least one invoice
- `counts.presupuestosConCobro` — presupuestos with at least one receipt

All four Embudo funnel steps use these counts (same unit = presupuesto), making the funnel consistent with the stats cards.

**State-determination helpers** (defined in `kpis` useMemo):
- `isFacturado`: `item.FacturaAsociadaOP` exists AND does not include `'Pendiente'` or `'CARGA NO FACTURADA'`
- `isCobrado`: `item.ReciboCobranza` exists AND does not include `'Pendiente'`

**Row state bucketing**: `getEstadoKey(item)` maps a row to one of `Pagado` / `Facturado` / `No Facturado` / `Solo Presupuesto`. The same logic is duplicated in `MainTrendChart.jsx` — if you change one, change both or the chart and the monthly report will disagree.

**Comparison period**: `compMode` (`'auto'` | `'year-ago'` | `'custom'`) drives a separate fetch to `GET /api/dashboard/kpis` for the comparison KPIs stored in `kpiComparison`. The "TASAS MONETARIAS VS PERIODO ANTERIOR" section uses these.

### Report modals (shared conventions)

`RutasReporteModal` and `MonthlyReporteModal` are the two "Ver Reporte" modals opened from analytics cards. Both follow the same pattern, so copy from them when adding a third:

- Rendered through `ReactDOM.createPortal`, reusing the modal chrome classes from `DetailModal.css` (`modal-overlay`, `ux-modal-*`, `ux-close-btn`, `btn-primary`) plus a component-local `.css` for its own classes. `.ux-modal-body` ships **without** padding — each modal adds its own body padding class.
- Excel export via `xlsx` (`XLSX.utils.aoa_to_sheet` → `book_new` → filename `<Reporte>_<empresa>_<fecha>.xlsx`). On-screen amounts may be compact (`$1.2M` / `$450k`) with the exact value in `title`, but the exported cells always carry full numbers with a `#,##0` format.

`MonthlyReporteModal` is **pure frontend** — no backend call. `AnalyticsDashboard` computes a `monthlyReportData` memo (every month of the period, broken down by the four `getEstadoKey` states + total + `count` + `deltaPct` vs. previous month) and passes it in; `trendData` for the chart is just `monthlyReportData.slice(-6)`. Because `deltaPct` is computed over the full series before the slice, the first visible month still shows a real delta.

### Standalone report page (`main.jsx`)

`main.jsx` is not a plain app mount. If the URL carries `?reporte=rutas&fechaDesde=…&fechaHasta=…` (opened in a new tab from the rutas modal), it renders `RutasReporteModal` with `standalone` **instead of** `<App />`. In `standalone` mode the component skips its escape/overlay behaviour and drops its padding. Since `App.jsx` never mounts on that path, `main.jsx` must apply `data-theme` from `localStorage` itself for the CSS variables to resolve.

### Rutas report (`RutasReporteModal.jsx` + `GET /api/seguimiento/rutas-reporte`)

A route-history report opened from the analytics view. The endpoint takes `fechaDesde`/`fechaHasta` (required) + optional `empresa`, and combines historical route stats from `USR_GTREVI` (imputed km per origin→destination tramo, joined to `USR_GTTLOH` for location descriptions) with period volume. The modal (fetched via `seguimientoAPI.getRutasReporte`) classifies each tramo by `GrupoDisponibilidad` ("Ruta activa" / "Ruta nueva" / other) and shows km averages, data-quality, and historical imputation counts.

### NC/ND modal (`NotaAjusteModal.jsx`)

Opened by clicking a badge on the Factura bubble. Fetches from `GET /api/seguimiento/notas` on mount.

The `/notas` endpoint joins:
- `SAR_VTRMVA` — identifies which NC/ND exist for the invoice
- `VTRMVH` — header data (date, branch, CAE, `VTRMVH_TEXTOS` description, currency)
- `VTRMVC` — amounts (`VTRMVC_IMPEXT` for foreign currency, `VTRMVC_IMPNAC` for ARS) using self-application filter (`MODAPL = MODFOR AND CODAPL = CODFOR AND NROAPL = NROFOR`)
- `GRTCOF` — currency symbol/description

`VTRMVH_IMPTCN` stores a payment-method code (e.g. `"CC"`) — **not** the monetary total. Totals come from `VTRMVC`.

### Key Softland ERP table conventions

- `SAR_VTRMVA` — cross-document application table (links invoices to their NC/ND, receipts, etc.)
- `VTRMVH` / `VTRMVI` — VT module movement header / items
- `VTRMVC` — VT module comprobante totals (self-application rows = face value)
- `FCRMVH` — FC (budget/quote) module movement header
- `GTTRMVH` — GT (shipment/carga) module movement header
- `COBTRMVH` — COB (collections) movement header
- Column naming: `{TABLE}_{FIELDNAME}`, e.g. `VTRMVH_CODFOR`

### Exchange rates

`App.jsx` fetches BNA (Argentina official) and SII Chile rates on mount. Both are stored in state and passed to components for ARS↔USD conversion. Default fallback: BNA=1000, SII=950.
