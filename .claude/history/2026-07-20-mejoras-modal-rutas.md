# Mejoras visuales al modal de Historial de Rutas

**Fecha:** 2026-07-20

## Objetivo
Mejorar la visual y usabilidad del modal "Historial completo de rutas" (`RutasReporteModal.jsx`), a partir de feedback iterativo sobre una captura de pantalla del estado original.

## Trabajo realizado
- Fusión de columnas "Estado" + "Clasificación" en un badge único coloreado por criticidad, con la disponibilidad de datos históricos como subtexto.
- Reemplazo del texto con emojis (que no viajaban bien desde SQL Server) en "Calidad de dato" por íconos (✓/⚠/✗) con color, clasificando por el contenido textual ("Completo"/"Incompleto").
- Agrupación de filas por clasificación (Crítica → Importante → Activa → Histórica), con encabezado de sección mostrando cantidad de rutas y "Total importe del período: X [símbolo moneda]".
- Orden clicable por columna (asc/desc con indicador visual).
- Buscador de texto por ruta con contador "X de Y rutas".
- Botón "Exportar" a `.xlsx` (mismo patrón que `AgingReportModal.jsx`), respetando filtro y orden aplicados.
- Nuevo archivo `frontend/src/components/RutasReporteModal.css` con todos los estilos.
- Backend (`backend/routes/seguimiento.js`, endpoint `GET /api/seguimiento/rutas-reporte`): se agregó JOIN a `GRTCOF` (vía `USR_GTMVII_COFLIS`) dentro de la CTE `VolumenOperado` para traer `SimboloMoneda`, propagado a la proyección final del reporte.
- Renombres de columnas por pedido del usuario: "OP en período" → "OP/Cargas en período"; "Calidad de dato Km" → "Calidad de dato".
- Se quitó la columna "Veces imputado (hist.)" de la tabla y del export.
- Se agregó un botón de ayuda (❓) junto al header "Calidad de dato": popover explicando en español simple qué significan los valores (Completo/Incompleto/Sin datos), cómo se calculan (% de OP con km real cargado) y cómo interpretarlos. Cierra al hacer clic afuera.
- Cada cambio se verificó con `npx vite build --mode development` sin errores.

## Estado final
Todo lo pedido quedó implementado y compilando correctamente. **No se probó visualmente en navegador con datos reales** (no se levantó el dev server durante la sesión) — pendiente de verificación manual en la UI real.

## Próximos pasos
- Ninguno confirmado explícitamente por el usuario.
- Posible mejora futura (no pedida aún): manejar rutas con monedas mixtas dentro de un mismo grupo de clasificación — hoy el subtotal usa la moneda más frecuente del grupo sin conversión ni separación.

## Notas / gotchas
- El emoji que antepone el backend a `CalidadDato` (✅/⚠️/❌) a veces no viaja bien por la conexión a SQL Server y se veía como "?"/"??" en el frontend. Se decidió ignorarlo en el frontend y clasificar solo por el texto, en vez de arreglar el encoding en origen.
- El símbolo de moneda por grupo (`SimboloMoneda`) se calcula en frontend como el más frecuente entre las filas del grupo — es una aproximación, no una regla de negocio verificada contra Softland.
