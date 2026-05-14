const express = require("express");
const router = express.Router();
const chatbotController = require("../controllers/chatbotController");

// POST /api/chatbot/ask - Enviar una pregunta al asistente inteligente
router.post("/ask", chatbotController.ask);

module.exports = router;
