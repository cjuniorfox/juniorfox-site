const mongoose = require('mongoose');
const mongoUnit = require('mongo-unit');
const Vote = require('../../schemas/vote-schema');
const User = require('../../schemas/user-schema');
const voteController = require('../../rest-controllers/vote-controller');

beforeAll(async () => {
    const uri = await mongoUnit.start();
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoUnit.stop();
});

describe('voteController', () => {
    describe('vote', () => {
        it('should return 400 if user does not exist', async () => {
            const req = { body: { userId: 'nonexistentUserId', articleId: 'articleId', vote: 1 } };
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };

            await voteController.vote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({ message: 'The referred userId: nonexistentUserId does not exist.' });
        });

        it('should return 400 for invalid vote value', async () => {
            const req = { body: { userId: 'userId', articleId: 'articleId', vote: 5 } };
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };

            await voteController.vote(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({ message: 'Invalid vote value' });
        });

        it('should return 201 vote created successfully', async () => {
            const req = { body: { articleId: 'articleId', vote: 1 } };
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };

            await voteController.vote(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.send).toHaveBeenCalledWith({ message: 'Vote added' });
        });
    });

    describe('allVotes', () => {
        it('should return 400 if articleId is not provided', async () => {
            const req = { params: {} };
            const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };

            await voteController.allVotes(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({ message: 'There was no article queried.' });
        });
    });
});