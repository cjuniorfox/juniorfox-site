const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const calculateReadingTime = require('./calculate-reading-time')

function getArticlesList(lang) {
  const articlesDir = path.join(__dirname, '..', 'articles');
  return fs.readdirSync(articlesDir)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const filePath = path.join(articlesDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const { data: metadata, content } = matter(fileContent);
      const articleName = file.replace('.md', '');
      const readingTime = calculateReadingTime(content);
      return { name: articleName, ...metadata, readingTime: readingTime };
    })
    .filter(article => article.lang === lang);
}

module.exports = getArticlesList;