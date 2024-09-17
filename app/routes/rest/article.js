const express = require('express');
const router = express.Router();
const articleController = require('../../rest-controllers/article-controller');

router.get('/sync-database',articleController.syncDatabase);

module.exports = router;