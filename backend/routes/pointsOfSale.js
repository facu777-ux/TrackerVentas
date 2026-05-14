const express = require("express");
const router = express.Router();
const { getPointsOfSale } = require("../controllers/pointsOfSaleController");

router.get("/", getPointsOfSale);

module.exports = router;
