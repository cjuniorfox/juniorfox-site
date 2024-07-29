const express = require("express")
const router = express.Router()

router.use( async (req, res, next) =>{
    next()
})

router.use("/",require("./home"))
router.use("/article/",require("./article"))


router.use((req, res) => {
    res.redirect("/404")
})

module.exports = router