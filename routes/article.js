const express = require("express");
const router = express.Router();
const articleController = require('../controllers/article-controller');

router.get("/:articleName",articleController.article)

module.exports = router;