# MongoDB Setup with Node.js

This guide will help you set up a MongoDB container using Podman, create a database schema, create a `votingUser`, and configure a username and password for your Node.js application.

## Prerequisites

- [Podman](https://podman.io/getting-started/installation) installed on your machine
- [Node.js](https://nodejs.org/) installed on your machine
- [npm](https://www.npmjs.com/get-npm) installed on your machine

## Step 1: Create a MongoDB Container

1. **Pull the MongoDB image:**
    ```bash
    podman pull mongo
    ```

2. **Run the MongoDB container:**
    ```bash
    podman run --name mongodb -d -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=secret mongo
    ```

3. **Create the `voting` database and `votingUser`:**
    Connect to the MongoDB container and create the database and user.
    ```bash
    podman exec -it mongodb mongo -u admin -p secret --authenticationDatabase admin
    ```

    Inside the MongoDB shell:
    ```js
    use voting
    db.createUser({
        user: "votingUser",
        pwd: "votingPassword",
        roles: [{ role: "readWrite", db: "voting" }]
    })
    db.createCollection("votes")
    ```

## Step 2: Set Up Your Node.js Application

1. **Install necessary dependencies:**
    ```bash
    npm install express mongoose body-parser
    ```

2. **Create the `vote-schema.js` file:**
    ```javascript
    const mongoose = require('mongoose');

    const voteSchema = new mongoose.Schema({
        ip: String,
        articleId: String,
        vote: Number, // 1 for upvote, -1 for downvote
        timestamp: { type: Date, default: Date.now }
    });

    const Vote = mongoose.model('Vote', voteSchema);

    module.exports = Vote;
    ```

3. **Create the `vote.js` router file:**
    ```javascript
    const express = require('express');
    const router = express.Router();
    const Vote = require('../models/vote-schema');

    router.post('/', async (req, res) => {
        const { ip, articleId, vote } = req.body;
        const newVote = new Vote({ ip, articleId, vote });

        try {
            await newVote.save();
            res.status(201).send(newVote);
        } catch (error) {
            res.status(400).send(error);
        }
    });

    module.exports = router;
    ```

4. **Create the `app.js` file:**
    ```javascript
    require('dotenv').config();
    const express = require('express');
    const mongoose = require('mongoose');
    const bodyParser = require('body-parser');
    const voteRouter = require('./routes/vote'); // Adjust the path as necessary

    const app = express();
    app.use(bodyParser.json()); // Middleware to parse JSON request bodies

    // MongoDB connection
    const mongoURI = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DB}`;
    mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
        .then(() => console.log('MongoDB connected...'))
        .catch(err => console.log('MongoDB connection error:', err));

    app.use('/vote', voteRouter); // Use the vote router

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
    ```

5. **Create a `.env` file:**
    ```env
    MONGO_USERNAME=votingUser
    MONGO_PASSWORD=votingPassword
    MONGO_HOST=localhost
    MONGO_PORT=27017
    MONGO_DB=voting
    ```

## Step 3: Test Your Setup

1. **Start your Node.js application:**
    ```bash
    node app.js
    ```

2. **Test the API using curl or Postman:**
    ```bash
    curl -X POST http://localhost:3000/vote -H "Content-Type: application/json" -d '{"ip": "192.168.1.1", "articleId": "123", "vote": 1}'
    ```

By following these steps, you should be able to set up your environment from scratch and connect your Node.js application to the MongoDB instance running in a Podman container.

## License

This project is licensed under the MIT License.