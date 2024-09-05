const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
    userUUID: String,
    articleId: String,
    vote: Number, // 1 for upvote, -1 for downvote
    timestamp: { type: Date, default: Date.now }
});

const Vote = mongoose.model('Vote', voteSchema);

module.exports = Vote;
