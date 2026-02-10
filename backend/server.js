const express = require("express");
const cors = require("cors");
const compression = require("compression");
require("dotenv").config();

// Fix para serialización de BigInt (evita crash al enviar JSON con BigInt de SQL)
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const seguimientoRoutes = require("./routes/seguimiento");

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(compression()); // Comprimir todas las respuestas
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rutas
app.use("/api/seguimiento", seguimientoRoutes);

// Ruta de salud
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Servidor funcionando correctamente",
    timestamp: new Date().toISOString(),
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Error interno del servidor",
    message: err.message,
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor Backend iniciado`);
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health\n`);
});
