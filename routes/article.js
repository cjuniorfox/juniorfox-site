const express = require("express")
const fs = require('fs')
const router = express.Router()
const path = require("path")
const { marked } = require('marked')



router.get("/:articleName", (req, res) => {
  const articleName = req.params.articleName;
  const filePath = path.join(__dirname, '..', 'articles', `${articleName}.md`)

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).send('Article not found')
    }

    const htmlContent = marked(data);
    res.render('article', { content: htmlContent, darkModeClass: res.locals.darkMode })
  });
})

module.exports = router;