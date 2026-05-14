---
description: "Explica un incidente funcional del chatbot con contexto, evidencia, hipotesis y plan de validacion para resolverlo rapido"
name: "Explicar incidente de navegacion"
argument-hint: "Describe la situacion, pasos, resultado esperado y resultado real"
agent: "agent"
---
Quiero que transformes la situacion que te paso en un reporte tecnico claro, breve y accionable para resolver el problema de forma efectiva.

Entrada del usuario:

{{input}}

Objetivo:
- Explicar el incidente sin ambiguedades
- Separar hechos observados de suposiciones
- Proponer hipotesis tecnicas priorizadas
- Definir validaciones concretas para confirmar o descartar cada hipotesis
- Dejar un plan de correccion incremental con bajo riesgo

Salida requerida (usa exactamente este formato de ticket Jira):

1) Tipo
- Bug

2) Titulo
- Una sola linea, concreta y accionable.
- Debe incluir el identificador principal (PR/CARGA/FACTURA/RECIBO) si existe.

3) Resumen
- 3 a 6 lineas.
- Que funcion se intento usar.
- Que se esperaba.
- Que ocurrio realmente.
- Impacto para el usuario/negocio.

4) Contexto
- Modulo/vista involucrada.
- Filtros y rango de fechas relevantes.
- Datos clave usados (IDs, empresa, etc.).

5) Pasos para reproducir
- Paso 1, Paso 2, Paso 3... en orden temporal.
- En cada paso incluir accion, vista y filtro activo.

6) Resultado actual
- Describir el comportamiento observado de forma verificable.

7) Resultado esperado
- Describir el comportamiento correcto esperado.

8) Evidencia
- Evidencia fuerte: logs, capturas, IDs concretos.
- Evidencia debil: sospechas/inferencias.

9) Hipotesis tecnicas (priorizadas)
- H1 (mas probable):
  - Motivo
  - Componente(s) probable(s)
  - Senal observable para validarla
- H2
- H3

10) Plan de validacion
- Prueba A, Prueba B, Prueba C.
- Para cada prueba: cambio, metrica/observacion, criterio de exito.

11) Propuesta de solucion
- Fase 1: correccion minima segura
- Fase 2: hardening / prevencion de regresiones
- Fase 3: mejoras UX/observabilidad

12) Riesgos
- Riesgo 1, Riesgo 2, ...

13) Criterios de aceptacion
- [ ] El caso se reproduce de forma controlada
- [ ] La causa raiz queda confirmada
- [ ] El fix corrige el escenario reportado
- [ ] No rompe navegacion por PR/CARGA/FACTURA/RECIBO
- [ ] Queda evidencia de validacion final

14) Definicion de listo
- [ ] Issue listo para desarrollo
- [ ] Validado por QA/usuario
- [ ] Documentado el aprendizaje

Reglas de redaccion:
- Escribe en espanol rioplatense profesional.
- No inventes datos. Si falta informacion, agrega una subseccion "Datos faltantes" con preguntas puntuales.
- Si hay ids (PR, CARGA, FACTURA, RECIBO), citarlos explicitamente.
- Prioriza claridad, trazabilidad y accion.

Si la entrada incluye capturas o consola, incorporalas en "Evidencia disponible" y menciona exactamente que sugieren y que NO prueban por si solas.
