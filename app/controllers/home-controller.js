const articleService = require('../services/article-service')

const homeController =  {
    index : async (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        const { articles, totalArticles, currentPage, totalPages } = await articleService.getArticlesList(res.locals.locale, page, limit);

        res.render("home", {
            articles,
            currentPage,
            totalPages
        });
    }
}

module.exports = homeController;