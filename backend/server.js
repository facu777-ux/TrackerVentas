const express = require("express");
const cors = require("cors");
const compression = require("compression");
require("dotenv").config();

// Fix para serialización de BigInt (evita crash al enviar JSON con BigInt de SQL)
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const seguimientoRoutes = require("./routes/seguimiento");
const dashboardRoutes = require("./routes/dashboard");
const chatbotRoutes = require("./routes/chatbot");
const exchangeRoutes = require("./routes/exchange");
const pointsOfSaleRoutes = require("./routes/pointsOfSale");
const keepAlive = require("./utils/keepAlive");

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(compression()); // Comprimir todas las respuestas
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Logger middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rutas
app.use("/api/seguimiento", seguimientoRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/exchange", exchangeRoutes);
app.use("/api/points-of-sale", pointsOfSaleRoutes);

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
  
  // Activar Keep-Alive para Render
  keepAlive();
});
