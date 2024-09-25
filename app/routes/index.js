const express = require("express");
const router = express.Router();
const langController = require('../controllers/lang-controller');

router.use("/", require("./home"));
router.use("/article", require("./article"));
router.use("/api", require("./rest-api"))

// Language switch route
router.get('/lang/:locale', langController.lang);

// 404 route
router.use((req, res) => {
    res.status(404).render("404");
});

module.exports = router;