/**
 * Utility to prevent Render from spinning down due to inactivity.
 * Render free tier spins down after 15 minutes of inactivity.
 * This script pings the service itself every 14 minutes.
 */
const https = require('https');

const keepAlive = () => {
  // Solo activar en producción o si se fuerza vía ENV
  if (process.env.NODE_ENV === 'development' && !process.env.FORCE_KEEP_ALIVE) {
    return;
  }

  let url = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  
  if (!url) {
    return;
  }

  // Asegurar que la URL tenga el protocolo
  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  const healthUrl = `${url}/api/health`;
  console.log(`⏱️ Keep-Alive: Initialized. Pinging ${healthUrl} every 10 minutes.`);

  // Ping cada 10 minutos (Render suspende a los 15)
  setInterval(() => {
    https.get(healthUrl, (res) => {
      if (res.statusCode === 200) {
        console.log(`[${new Date().toISOString()}] Keep-Alive: Ping exitoso.`);
      } else {
        console.warn(`[${new Date().toISOString()}] Keep-Alive: Status ${res.statusCode}`);
      }
    }).on('error', (err) => {
      console.error('Keep-Alive Error:', err.message);
    });
  }, 10 * 60 * 1000); 
};

module.exports = keepAlive;
