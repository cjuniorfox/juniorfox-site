const express = require("express")
const hljs = require('highlight.js/lib/core');
hljs.registerLanguage('javascript', require('highlight.js/lib/languages/javascript'));

const router = express.Router()

router.get("/", async (req, res) => {
    const highlightedCode = hljs.highlight(
        'hljs.registerLanguage(\'javascript\', javascript);',
        { language: 'javascript' }
      ).value
    res.render("home/",{code:highlightedCode,darkModeClass: res.locals.darkMode})
})

module.exports = router;