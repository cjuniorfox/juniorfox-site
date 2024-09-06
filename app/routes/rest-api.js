const express = require("express");
const router = express.Router();

router.use("/vote", require("./rest/vote"))

module.exports = router;