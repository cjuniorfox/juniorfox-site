const express = require("express");
const getArticlesList = require("../utils/get-articles-list");
const router = express.Router();

router.get("/", async (req, res) => {
    res.render("home", { articles: getArticlesList() });
});

module.exports = router;