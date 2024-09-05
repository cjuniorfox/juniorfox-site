const fs = require('fs');
const path = require("path");
const marked = require('marked');
const matter = require('gray-matter');
const calculateReadingTime = require('../utils/calculate-reading-time');

const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');

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

module.exports = {
    article: (req, res) => {
        const articleName = req.params.articleName
        const filePath = path.join(__dirname, '..', 'articles', `${articleName}.md`)
      
        fs.readFile(filePath, 'utf8', (err, data) => {
          if (err) {
            return res.status(404).send('Article not found')
          }
          const { data: metadata, content } = matter(data);
          const htmlContent = marked.parse(content);
          const readingTime = calculateReadingTime(content);
          if (metadata.lang && metadata.lang != res.locals.locale && metadata['other-langs']) {
            const otherLangs = metadata['other-langs'];
            const matchingLang = otherLangs.find(langObj => langObj.lang === res.locals.locale);
            if (matchingLang) {
              return res.redirect(`/article/${matchingLang.article}`);
            }
          }
          res.render('article/article', {
            title: metadata.title,
            author: metadata.author,
            date: metadata.date,
            category: metadata.category,
            brief: metadata.brief,
            keywords: metadata.keywords,
            image: metadata.image,
            content: htmlContent,
            readingTime: readingTime
          })
        });
    }
}