const moment = require('moment');

const social =  [
    { "name": "Github", "link": "https://github.com/cjuniorfox/" },
    { "name": "LinkedIn", "link": "https://www.linkedin.com/in/carlos-anselmo-mendes-junior-35543031/" },
    { "name": "Bluesky", "link": "https://bsky.app/profile/juniorfox.net" },
    { "name": "Mastodon", "link": "https://mastodon.social/@juniorfox" }
];

const layout = (req, res, next) => {
    res.locals.title = res.__('title');
    res.locals.social = social;
    res.locals.darkModeClass = res.locals.darkModeClass || '';
    res.locals.__ = res.__;
    res.locals.moment = moment;
    res.locals.locale = req.getLocale();
    next();
};

module.exports = layout;