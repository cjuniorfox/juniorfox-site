const fs = require('fs')
const path = require('path')

module.exports = getArticlesList


function getArticlesList() {
  const articlesDir = path.join(__dirname, '..', 'articles')
  return fs.readdirSync(articlesDir)
    .filter(file => file.endsWith('.md'))
    .map(file => file.replace('.md', ''))
}