const express = require("express");
const router = express.Router();

router.use('/vote', require('./rest/vote'))
router.use('/article', require('./rest/article'))

module.exports = router;