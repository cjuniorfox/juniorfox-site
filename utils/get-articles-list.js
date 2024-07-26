const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

function getArticlesList() {
  const articlesDir = path.join(__dirname, '..', 'articles');
  return fs.readdirSync(articlesDir)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const filePath = path.join(articlesDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const { data: metadata, content } = matter(fileContent);
      const articleName = file.replace('.md', '');
      return { name: articleName, ...metadata };
    });
}

module.exports = getArticlesList;