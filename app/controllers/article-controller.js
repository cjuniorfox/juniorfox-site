const marked = require('marked');
const calculateReadingTime = require('../utils/calculate-reading-time');
const articleService = require('../services/article-service');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

marked.setOptions({
  gfm: true,
  breaks: true,
  sanitize: true, // Disable raw HTML
});

const renderer = new marked.Renderer();
renderer.heading = function (text, level) {
  const escapedText = text.toLowerCase().replace(/[^\w]+/g, '-');
  return `<h${level} id="${escapedText}">${text}</h${level}>`;
};

marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  }
}));

const articleController = {
  article: async (req, res) => {
    const articleName = req.params.articleName

    try {
      const article = await articleService.article(articleName, res.locals.locale);

      if (article.redirect) {
        return res.redirect(article.redirect);
      }

      const htmlContent = purify.sanitize( marked.parse(article.content) );
      const readingTime = calculateReadingTime(article.content);

      return res.render('article/article', {
        articleName: articleName,
        articleId: article.articleId,
        title: article.title,
        author: article.author,
        date: article.date,
        category: article.category,
        brief: article.brief,
        keywords: article.keywords,
        image: article.image,
        content: htmlContent,
        readingTime: readingTime
      });
    } catch (err) {
      return res.status(404).send('Article not found')
    }


  }
}

module.exports = articleController