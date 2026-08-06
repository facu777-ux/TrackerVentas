# 🚀 Sistema de Seguimiento de Comprobantes Logísticos

## ✅ Configuración Completada

El sistema ha sido actualizado para usar la query `prueba.sql` con **visibilidad total** del flujo completo:

- ✅ Solicitudes de Presupuesto
- ✅ Presupuestos (PR)
- ✅ Cargas/OP
- ✅ Facturas
- ✅ Recibos de Cobranza

---

## 🎯 Inicio Rápido

### Opción 1: Iniciar Todo Automáticamente (RECOMENDADO)

Haz doble clic en:

```
INICIAR-TODO.bat
```

Esto abrirá dos ventanas:

- **Backend** en puerto 3001
- **Frontend** en puerto 3002

### Opción 2: Iniciar Manualmente

#### Backend

Haz doble clic en: `start-backend.bat`
O desde la terminal:

```bash
cd backend
node server.js
```

#### Frontend

Haz doble clic en: `start-frontend.bat`
O desde la terminal:

```bash
cd frontend
node node_modules\vite\bin\vite.js --port 3002
```

---

## 🌐 URLs de Acceso

- **Frontend**: http://localhost:3002
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/health

---

## 📊 Nuevas Características

### 1. **Estado del Flujo Completo**

Cada registro ahora muestra su estado en el flujo:

- 🔴 **Solo Solicitud** - Solicitud sin PR generado
- 🟡 **PR sin Carga** - Presupuesto sin ejecutar
- 🟠 **Carga sin Factura** - Pendiente de facturación
- 🟢 **Facturado sin RC** - Pendiente de cobranza
- ✅ **Flujo Completo** - Proceso completo

### 2. **Información de Solicitudes**

El modal de detalles ahora incluye:

- Código y número de solicitud
- Fecha de alta de la solicitud
- Estado de confirmación
- Vínculo entre solicitud y PR

### 3. **Timeline Mejorado**

El proceso ahora muestra 5 pasos: 0. Solicitud de Presupuesto (si existe)

1. Presupuesto
2. Carga
3. Factura
4. Recibo de Cobranza

---

## 🔧 Solución de Problemas

### Error: "D" no se reconoce como comando

**Causa (histórica)**: El carácter `&` en "I&D Proyectos" causaba problemas con npm scripts. La carpeta ya fue renombrada a "ID Proyectos", por lo que este problema ya no debería ocurrir, pero se deja documentado por si el proyecto se mueve nuevamente a una ruta con caracteres especiales.

**Solución**: Usa los archivos `.bat` proporcionados o ejecuta directamente:

```bash
# Backend
node server.js

# Frontend
node node_modules\vite\bin\vite.js --port 3002
```

### Puerto en uso

Si el puerto 3001 o 3002 está ocupado:

1. Cierra las ventanas de los servidores anteriores
2. O cambia el puerto en:
   - Backend: `backend/server.js` (línea 8)
   - Frontend: scripts `.bat` o comando manual

---

## 📁 Estructura del Proyecto

```
Seguimientos_compronantes_logisticos_1/
├── backend/
│   ├── config/          # Configuración de BD
│   ├── routes/          # Rutas de API (seguimiento.js actualizado)
│   └── server.js        # Servidor Express
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── DetailModal.jsx      # Modal mejorado con solicitudes
│       │   ├── EstadoFlujo.css      # Estilos del banner de estado
│       │   └── ResultsTable.jsx     # Tabla jerárquica
│       └── App.jsx
├── prueba.sql           # Query completa con visibilidad total
├── INICIAR-TODO.bat     # Inicia backend + frontend
├── start-backend.bat    # Solo backend
└── start-frontend.bat   # Solo frontend
```

---

## 🎨 Cambios Implementados

### Backend (`routes/seguimiento.js`)

- ✅ Query completa de `prueba.sql` implementada
- ✅ Nuevos campos en la respuesta API
- ✅ Optimización con tablas temporales e índices

### Frontend

- ✅ Modal actualizado con sección de solicitudes
- ✅ Banner de estado del flujo
- ✅ Timeline con 5 pasos
- ✅ Manejo de campos NULL mejorado

---

## 📞 Soporte

Si encuentras algún problema:

1. Verifica que la base de datos esté accesible
2. Revisa el archivo `.env` en `backend/`
3. Asegúrate de que los puertos 3001 y 3002 estén libres

---

**Última actualización**: 18 de Diciembre de 2025
**Versión**: 2.0 - Visibilidad Total del Flujo
