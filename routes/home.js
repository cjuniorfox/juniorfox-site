const express = require("express")
const getArticlesList = require("../lib/get-articles-list")

const router = express.Router()

router.get("/", async (req, res) => {
    
    res.render("home/",{articles:getArticlesList(),darkModeClass: res.locals.darkMode})
})

module.exports = router;