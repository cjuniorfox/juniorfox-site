const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    title: String,
    articleId: String,
    date: Date,
    author: String,
    category: String,
    brief: String,
    image: String,
    keywords: [String],
    lang: String,
    otherLangs: [{ lang: String, article: String }],
    readingTime: String,
    metadataHash: String,
    removed: { type: Boolean, default: false }, // Flag for removed articles
    updatedAt: { type: Date, default: Date.now }
});

const Article = mongoose.model('Article', articleSchema);

module.exports = Article;