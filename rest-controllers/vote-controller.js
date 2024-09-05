const Vote = require('../schemas/vote-schema');

module.exports = {
    vote: async (req, res) => {
        try {
            const { userUUID, articleId, vote } = req.body;
            if (![1, -1].includes(vote)) {
                return res.status(400).send('Invalid vote value');
            }

            const existingVote = await Vote.findOne({ userUUID, articleId });

            if (existingVote) {
                if (existingVote.vote !== vote) {
                    await Vote.deleteOne({ _id: existingVote._id });
                    return res.status(200).send('Vote removed');
                } else {
                    return res.status(400).send('Vote already added');
                }
            } else {
                const newVote = new Vote({ userUUID, articleId, vote });
                await newVote.save();
                return res.status(201).send('Vote added');
            }
        } catch (err) {
            console.error('Error processing vote:', err);
            return res.status(500).send('An error occurred while processing your vote.');
        }
    },
    allVotes: async (req, res) => {
        try {
            const articleId = req.params.articleId;
            if (!articleId) {
                return res.status(400).send('There was no article queried.');
            }

            const result = await Vote.aggregate([
                { $match: { articleId: articleId } },
                { $group: { _id: "$articleId", totalVotes: { $sum: "$vote" } } }
            ]);

            if (result.length === 0) {
                return res.status(200).send({ _id: articleId, totalVotes: 0 });
            } else {
                return res.status(200).send(result[0]);
            }
        } catch (err) {
            console.error('Error querying votes:', err);
            return res.status(500).send('There was an error querying the votes: ' + err);
        }
    }
};