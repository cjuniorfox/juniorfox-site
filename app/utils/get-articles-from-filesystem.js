const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const calculateReadingTime = require('./calculate-reading-time')

function getArticlesFromFilesystem(lang) {
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
    //If lang is not passed by. return all articles
    .filter(article => lang ? (article.lang === lang) : true )
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

module.exports = getArticlesFromFilesystem;