const express = require('express');
const router = express.Router();
const exchangeController = require('../controllers/exchangeController');

// Ruta Dólar Oficial BNA (Argentina)
router.get('/bna', exchangeController.getDolarBNA);

// Ruta Dólar Observado SII (Chile)
router.get('/sii', exchangeController.getDolarSII);

module.exports = router;
