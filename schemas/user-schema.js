const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
    data: {
        name: String,
        nacionality: String,
        email: String
    },
    activated: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
})

const User = mongoose.model('User', userSchema);
module.exports = User;
