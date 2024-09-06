const express = require('express');
const router = express.Router();
const voteController = require('../../rest-controllers/vote-controller')


router.post('/', voteController.vote);
router.get('/:articleId', voteController.allVotes);
router.get('/:userId/:articleId',voteController.userVote);

module.exports = router;