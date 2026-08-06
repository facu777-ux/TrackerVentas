# Plan de login + registración con verificación por email

**Fecha:** 2026-07-20

## Objetivo de la sesión

Diseñar (sin implementar) una sección de logueo para TrackerVentas, con registración
por email y verificación del correo. Se trabajó en modo planificación de punta a punta.

## Trabajo realizado

- **Exploración del código**: se relevó backend y frontend en paralelo. Hallazgo clave:
  **no existe absolutamente nada de auth** — ni sesiones, ni JWT, ni cookies, ni tabla
  de usuarios, ni envío de mail. Es desarrollo greenfield, sin refactors de por medio.
- **Decisiones de diseño tomadas**:
  - *Allowlist por dominio*: solo se registran emails `@dibiagi.com.ar` (validado en backend).
  - *Sesión*: JWT en `localStorage` + interceptor de axios. Se eligió sobre cookies httpOnly
    porque el frontend es estático y el backend está en Render (evita el dolor de cookies cross-origin).
  - *Email*: `nodemailer` contra el SMTP propio de Dibiagi, encapsulado en un único
    `emailService.js` para poder cambiar de casilla/proveedor tocando un solo archivo.
  - *DB*: tabla nueva `USR_APP_USUARIOS` (prefijo `USR_` como el resto de tablas custom del ERP).
- **Datos de SMTP descubiertos** (desde la config de Outlook del usuario):
  - Host `vps-2928017-x.dattaweb.com`, puerto `465`, cifrado SSL/TLS (`secure: true`).
  - Auth con usuario = email completo. El correo NO está en Microsoft 365/Exchange sino en
    un VPS de DattaWeb (probablemente cPanel) → **no hace falta Azure, Graph ni admin de tenant**.
- **Plan escrito** en `C:\Users\Usuario\.claude\plans\espero-est-s-muy-bien-memoized-fox.md`
  con arquitectura, archivos a crear/modificar, orden de implementación y plan de verificación.

## Estado final

- Plan completo y actualizado con los datos reales de SMTP. **No aprobado aún.**
- **Cero código escrito.** El `git status` quedó idéntico al inicio de la sesión.

## Bloqueante abierto

Falta la **contraseña de la casilla remitente** (la que usará el servidor para despachar
los mails de verificación). El usuario no la tiene a mano: Outlook la guarda cifrada con
DPAPI y no la muestra. Caminos propuestos, de más a menos recomendado:

1. Pedir a quien administra el hosting que cree `noreply@dibiagi.com.ar` y pase la contraseña.
2. Resetear la contraseña de la casilla personal desde el panel de cPanel del VPS.
3. Buscarla en el gestor de contraseñas del navegador si alguna vez se entró al webmail
   (`chrome://password-manager/passwords` / `about:logins`).

Se desaconsejaron explícitamente las utilidades de extracción de contraseñas de Outlook
(marcadas como hacktool por los antivirus y poco confiables en versiones nuevas).

## Próximos pasos

1. Conseguir la casilla remitente y su contraseña.
2. Implementar el plan. **No está bloqueado por el punto 1**: se propuso arrancar con un
   modo de desarrollo donde el link de verificación se imprime en la consola del backend
   en vez de enviarse por mail. Al completar las env vars, empieza a enviar de verdad
   sin tocar código.

## Notas / gotchas

- **Dos contraseñas distintas** que se prestaron a confusión en la sesión y conviene tener claras:
  - La que cada usuario **elige al registrarse** → su acceso a TrackerVentas, se guarda hasheada.
  - La de la **casilla remitente** → la usa el servidor para conectarse al SMTP. Va como
    variable de entorno secreta, ningún usuario la ve ni la usa para entrar.
- El frontend **no tiene router**: la navegación es render condicional por `activeView` en
  `App.jsx`. El login se gatea envolviendo el render actual, sin necesidad de agregar `react-router`.
- `main.jsx` ya tiene un precedente de "ruta por query param" (el hack de `?reporte=rutas`);
  la pantalla de verificación puede seguir ese mismo patrón.
- Usar `bcryptjs` (JS puro) en vez de `bcrypt` para evitar compilación nativa en el Docker de Render.
- El handler de errores global de `server.js` filtra `err.message` al cliente; conviene no
  replicar eso en las rutas de auth (`dashboard.js` tiene el patrón seguro a imitar).
