const sql = require("mssql");
require("dotenv").config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  connectionTimeout: 30000,
  requestTimeout: 30000,
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
    enableArithAbort: true,
    // Configuración para Tailscale en modo Userspace (Render)
    proxy: process.env.TAILSCALE_AUTHKEY
      ? {
          host: "127.0.0.1",
          port: 1055,
          type: "socks5",
        }
      : undefined,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

const getConnection = async () => {
  try {
    if (pool) {
      return pool;
    }
    pool = await sql.connect(config);
    console.log("✅ Conexión exitosa a SQL Server");
    return pool;
  } catch (error) {
    console.error("❌ Error al conectar con SQL Server:", error);
    throw error;
  }
};

module.exports = {
  getConnection,
  sql,
};
