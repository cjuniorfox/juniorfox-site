const express = require('express');
const router = express.Router();

const Vote = require('../schemas/vote-schema');

router.post('/', async (req, res) => {
    const { ip, articleId, vote } = req.body;

    if (![1, -1].includes(vote)) {
        return res.status(400).send('Invalid vote value');
    }

    const existingVote = await Vote.findOne({ ip, articleId });

    if (existingVote) {
        if (existingVote.vote === vote) {
            await Vote.deleteOne({ _id: existingVote._id });
            return res.send('Vote removed');
        } else {
            existingVote.vote = vote;
            existingVote.timestamp = new Date();
            await existingVote.save();
            return res.send('Vote updated');
        }
    } else {
        const newVote = new Vote({ ip, articleId, vote });
        await newVote.save();
        return res.send('Vote added');
    }

})

module.exports = router;