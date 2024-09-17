const getArticlesFromFilesystem = require("../utils/get-articles-from-filesystem");

const homeController =  {
    index : async (req, res) => {
        res.render("home", { articles: getArticlesFromFilesystem(res.locals.locale) });
    }
}

module.exports = homeController;