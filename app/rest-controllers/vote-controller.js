const Vote = require('../schemas/vote-schema');
const User = require('../schemas/user-schema');

const declaredUserDoesNotExists = async (userId) => {
    return (userId && !await User.findOne({ _id: userId }));
}

const registerAsNewUser = async () => {
    const newUser = new User();
    await newUser.save();
    return newUser._id;
}

module.exports = {
    vote: async (req, res) => {
        try {
            const { userId, articleId, vote } = req.body;

            if (await declaredUserDoesNotExists(userId)) {
                return res.status(400).send({ message: `The referred userId: ${userId} does not exist.` });
            }

            const refUserId = userId || await registerAsNewUser();

            if (![1, -1].includes(vote)) {
                return res.status(400).send({ message: 'Invalid vote value' });
            }

            const existingVote = await Vote.findOne({ userId: refUserId, articleId });

            if (existingVote) {
                if (existingVote.vote !== vote) {
                    await Vote.deleteOne({ _id: existingVote._id });
                    return res.status(201).send({ message: 'Vote removed' });
                } else {
                    return res.status(400).send({ message: 'Vote already added' });
                }
            } else {
                const newVote = new Vote({ userId: refUserId, articleId, vote });
                await newVote.save();
                return res.status(201).send({ message: 'Vote added', data: newVote });
            }
        } catch (err) {
            console.error('Error processing vote:', err);
            return res.status(500).send({ message: 'An error occurred while processing your vote.' });
        }
    },
    allVotes: async (req, res) => {
        try {
            const articleId = req.params.articleId;
            if (!articleId) {
                return res.status(400).send({ message: 'There was no article queried.' });
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
            return res.status(500).send({ message: 'There was an error querying the votes: ' + err });
        }
    },
    userVote: async (req, res) => {
        try {
            const userId = req.params.userId;
            const articleId = req.params.articleId;
            if (!userId) {
                return res.status(400).send({ message: 'There was no user queried.' });
            }
            if (!articleId) {
                return res.status(400).send({ message: 'There was no article queried.' });
            }
            const result = await Vote.findOne({ userId: userId, articleId });
            if (result){
                return res.status(200).send({vote:result.vote});
            } else {
                return res.status(200).send({vote:0});
            }
            

        } catch (err) {
        console.error('Error querying vote for the user:', err);
        return res.status(500).send({ message: 'An error occurred while processing the vote.' });
    }
    }
};