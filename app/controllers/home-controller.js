const getArticlesList = require("../utils/get-articles-list");

const homeController =  {
    index : async (req, res) => {
        res.render("home", { articles: getArticlesList(res.locals.locale) });
    }
}

module.exports = homeController;