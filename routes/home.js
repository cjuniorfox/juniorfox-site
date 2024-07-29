const express = require("express")
const getArticlesList = require("../utils/get-articles-list")

const router = express.Router()

app.get('/lang/:locale', (req, res) => {
    res.cookie('locale', req.params.locale);
    res.setLocale(req.params.locale);
    res.redirect('back');
});

router.get("/", async (req, res) => {
    res.render("home/")
})

router.get("/404", async (req, res) => {
    res.render("404")
})

module.exports = router