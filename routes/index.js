const express = require("express");
const router = express.Router();

router.use("/", require("./home"));
router.use("/article", require("./article"));
router.use("/vote", require("./vote"))

// Language switch route
router.get('/lang/:locale', (req, res) => {
    res.cookie('locale', req.params.locale);
    res.setLocale(req.params.locale);
    res.redirect('back');
});

// 404 route
router.use((req, res) => {
    res.status(404).render("404");
});

module.exports = router;