const express = require("express")
const router = express("router")

router.use( async (req, res, next) =>{
    console.log(req.headers['sec-ch-ua'])
    const prefersDarkMode = req.headers['sec-ch-ua'] && req.headers['sec-ch-ua'].includes('Dart');
    res.locals.darkMode = prefersDarkMode ? 'dark-mode' : '';
    next()
})

router.use("/",require("./home"))
router.use("/article/",require("./article"))

router.use((req, res) => {
    res.redirect("/404")
})

module.exports = router