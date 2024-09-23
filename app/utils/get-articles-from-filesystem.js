const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const crypto = require('crypto');

const calculateReadingTime = require('./calculate-reading-time')

function calculateHash(object) {
  const jsonString = JSON.stringify(object); // Convert the object to a JSON string
  return crypto.createHash('sha256').update(jsonString).digest('hex'); // Create a SHA-256 hash
}

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
      const metadataHash = calculateHash(metadata);
      return {
        name: articleName,
        ...metadata,
        readingTime: readingTime,
        metadataHash: metadataHash
      };
    })
    //If lang is not passed by. return all articles
    .filter(article => lang ? (article.lang === lang) : true)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

module.exports = getArticlesFromFilesystem;