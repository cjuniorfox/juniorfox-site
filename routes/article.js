const express = require("express")
const fs = require('fs')
const path = require("path")
const { marked } = require('marked')
const router = express.Router()
const getArticlesList = require('../lib/get-articles-list')


router.get("/", (req, res) => {
  const articles = getArticlesList();
  res.render("index", { title: "Home", articles });
});


router.get("/:articleName", (req, res) => {
  const articleName = req.params.articleName;
  const filePath = path.join(__dirname, '..', 'articles', `${articleName}.md`);

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).send('Article not found')
    }

    const htmlContent = marked(data);
    res.render('article', { articles:getArticlesList(), content: htmlContent, darkModeClass: res.locals.darkMode })
  });
})

module.exports = router;