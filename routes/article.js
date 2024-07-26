const express = require("express");
const fs = require('fs');
const path = require("path");
const marked = require('marked');
const matter = require('gray-matter');
const calculateReadingTime = require('../utils/calculate-reading-time');

const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');
const router = express.Router();
const getArticlesList = require('../utils/get-articles-list');

const renderer = new marked.Renderer();
renderer.heading = function (text, level) {
  const escapedText = text.toLowerCase().replace(/[^\w]+/g, '-');
  return `<h${level} id="${escapedText}">${text}</h${level}>`;
};

const highlight = markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  }
})

marked.use({ renderer }, highlight)


router.get("/", (req, res) => {
  const articles = getArticlesList();
  res.render("index", { title: "Home", articles })
})


router.get("/:articleName", (req, res) => {
  const articleName = req.params.articleName
  const filePath = path.join(__dirname, '..', 'articles', `${articleName}.md`)

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).send('Article not found')
    }
    const { data: metadata, content } = matter(data);
    const htmlContent = marked.parse(content);
    const readingTime = calculateReadingTime(content);
    res.render('article', {
      articles: getArticlesList(), 
      title: metadata.title,
      author: metadata.author,
      date: metadata.date,
      category: metadata.category,
      brief: metadata.brief,
      keywords: metadata.keywords,
      image: metadata.image,
      content: htmlContent, 
      darkModeClass: res.locals.darkMode,
      readingTime: readingTime
    })
  });
})

module.exports = router;