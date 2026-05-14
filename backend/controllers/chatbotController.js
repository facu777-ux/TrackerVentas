const { procesarPreguntaConIA } = require("../services/aiService");

const chatbotController = {
  ask: async (req, res) => {
    try {
      const { pregunta, historial = [], datosContexto = [] } = req.body;

      if (!pregunta) {
        return res.status(400).json({ error: "No se proporcionó ninguna pregunta." });
      }

      // Llamar al servicio de inteligencia artificial
      const resultado = await procesarPreguntaConIA(pregunta, historial, datosContexto);

      return res.json({
        success: true,
        respuesta: resultado.respuesta,
        action: resultado.action,
        seccion: resultado.seccion,
        highlight: resultado.highlight,
        trackingData: resultado.trackingData, // Nuevo campo para tarjetas innovadoras
        error: resultado.error
      });

    } catch (error) {
      console.error("Error en chatbotController:", error);
      return res.status(500).json({
        success: false,
        error: "Error al procesar la consulta con el asistente."
      });
    }
  }
};

module.exports = chatbotController;
