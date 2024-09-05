const getArticlesList = require("../utils/get-articles-list");

module.exports = {
    index : async (req, res) => {
        res.render("home", { articles: getArticlesList(res.locals.locale) });
    }
}