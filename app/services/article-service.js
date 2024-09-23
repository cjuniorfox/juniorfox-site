const Article = require('../schemas/article-schema');
const getArticlesFromFilesystem = require('../utils/get-articles-from-filesystem');
const path = require("path");
const fs = require('fs');
const matter = require('gray-matter');

const __getFilePath = (articleName) => {
    return path.join(__dirname, '..', 'articles', `${articleName}.md`);
}

const articleFileExists = async (articleName) => {
    const filePath = __getFilePath(articleName);
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true
    } catch (err) {
        return false;
    }
}

const article = async (articleName, locale) => {
    const filePath = __getFilePath(articleName);
    const { data: metadata, content } = matter(await fs.promises.readFile(filePath, 'utf8'));

    if (metadata.lang && metadata.lang != locale && metadata['other-langs']) {
        const otherLangs = metadata['other-langs'];
        const matchingLang = otherLangs.find(langObj => langObj.lang === locale);
        if (matchingLang) {
            return { redirect: `/article/${matchingLang.article}` }
        }
    }

    return { articleName, content, ...metadata }
}

const getArticlesList = async (lang, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const articles = await Article.find({ lang: lang, removed: false })
        .sort({ date: -1 }) // Sort by date in descending order
        .skip(skip)
        .limit(limit);
    const totalArticles = await Article.countDocuments({ lang: lang, removed: false });

    return {
        articles,
        totalArticles,
        currentPage: page,
        totalPages: Math.ceil(totalArticles / limit)
    };
}

const syncDatabase = async () => {
    const articlesFromFileSystem = getArticlesFromFilesystem();
    const articlesFromDB = await Article.find();
    const articlesMap = new Map();
    articlesFromDB.forEach(article => {
        articlesMap.set(article.name, article);
    });
    const processedArticles = new Set();

    let statistics = {
        created : 0,
        updated : 0,
        articles : []
    }

    for (const article of articlesFromFileSystem) {
        const existingArticle = articlesMap.get(article.name);

        if (existingArticle) {
            const isUpdated = existingArticle.metadataHash != article.metadataHash;
            if (isUpdated) {
                await Article.updateOne({ name: article.name }, { ...article, removed: false, updatedAt: new Date() });
                statistics.updated = statistics.updated + 1;
                statistics.articles.push({
                    action: 'update',
                    articleId: article.articleId}
                );
            }
        } else {
            await Article.create(article);
            statistics.created = statistics.created + 1;
            statistics.articles.push({
                action: 'create',
                articleId: article.articleId}
            );
        }

        processedArticles.add(article.name);
    }

    for (const article of articlesFromDB) {
        if (!processedArticles.has(article.name)) {
            await Article.updateOne({ name: article.name }, { removed: true });
        }
    }
    return statistics;
}

module.exports = { articleFileExists, article, getArticlesList, syncDatabase };