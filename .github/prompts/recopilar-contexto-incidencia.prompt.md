---
description: "Recopila y estructura todo el contexto de una incidencia tratada o en curso para retomar rapido en un chat nuevo"
name: "Recopilar Contexto de Incidencia"
argument-hint: "Tema, ID o resumen corto de la incidencia"
agent: "agent"
---

Objetivo:
- Consolidar en un solo reporte el contexto completo de una incidencia ya tratada o en tratamiento.
- Generar un bloque final listo para pegar en una nueva conversacion y continuar sin perder contexto.

Entrada esperada:
- Tema, ID, modulo o descripcion breve de la incidencia (si no se proporciona, inferir del contexto reciente).

Instrucciones:
1. Revisar el contexto disponible en el workspace y en la conversacion actual.
2. Identificar:
- Problema reportado y alcance funcional
- Componentes/archivos tocados
- Cambios aplicados
- Comportamiento actual vs esperado
- Riesgos y pendientes
3. Si hay ambiguedades o datos faltantes, listarlos explicitamente como preguntas abiertas.
4. No inventar evidencia. Si algo no esta confirmado, marcarlo como hipotesis.
5. Priorizar claridad, trazabilidad y continuidad operativa.

Formato de salida (obligatorio):

1) Tipo
- Bug | Mejora | Investigación

2) Titulo
- Frase concreta con sintoma + impacto

3) Resumen
- 3 a 6 bullets con lo esencial

4) Contexto
- Modulo/vista afectada
- Flujo funcional impactado
- Entidades/IDs clave
- Entorno (si aplica)

5) Pasos para reproducir
- Paso 1...
- Paso 2...
- Paso 3...

6) Resultado actual
- Que ocurre hoy

7) Resultado esperado
- Que deberia ocurrir

8) Evidencia
- Evidencia fuerte
- Evidencia debil

9) Hipotesis tecnicas (priorizadas)
- H1...
- H2...
- H3...

10) Cambios aplicados hasta ahora
- Archivo
- Enlace a archivo/simbolo (ruta + linea/s)
- Cambio
- Motivo

11) Validacion realizada
- Pruebas ejecutadas
- Resultado
- Gaps de validacion

12) Riesgos
- Riesgo 1...
- Riesgo 2...

13) Plan recomendado siguiente
- Paso inmediato
- Paso de hardening
- Paso de observabilidad

14) Criterios de aceptacion
- [ ] Reproduce controladamente
- [ ] Causa raiz confirmada
- [ ] Fix validado
- [ ] Sin regresiones relevantes

15) Bloque para nuevo chat (copiar/pegar)
- Redactar un bloque completo en primera persona (12 a 20 lineas), con:
  - Contexto funcional y tecnico minimo indispensable
  - Lo ya intentado (y que funciono / no funciono)
  - Estado actual observable
  - Hipotesis priorizadas
  - Riesgos activos
  - Lista de pendientes concretos
  - Pedido puntual para continuar en la nueva conversacion

Reglas de calidad:
- Ser especifico con IDs y sintomas.
- Evitar texto generico.
- Cuando menciones cambios de codigo, incluir siempre referencia de archivo y linea si esta disponible.
- Mantener consistencia entre pasos, evidencia e hipotesis.
- Si no hay datos suficientes, cerrar con "Datos faltantes criticos" y preguntas concretas.
