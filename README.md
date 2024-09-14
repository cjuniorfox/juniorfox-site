# Juniorfox.net Node.js Website

This project is a Node.js-based website that uses Markdown files as articles. It also includes a MongoDB container for storing data, such as user information, articles, and more.

## Table of Contents
- [About](#about)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [MongoDB Container](#mongodb-container)
- [MongoDB Schema, User, and Password](#mongodb-schema-user-and-password)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## About
This project is a personal website built using Node.js. It allows you to create and manage articles using Markdown files. The website also integrates with MongoDB for storing additional data, such as user information and article metadata.

## Prerequisites
Before you begin, ensure you have the following installed on your machine:
- [Docker](https://www.docker.com/get-started) (for running the MongoDB container)
- [Node.js](https://nodejs.org/) (for running the website)
- [MongoDB](https://www.mongodb.com/) (optional, if you want to run MongoDB locally without Docker)

## Setup

### MongoDB Container
To set up a MongoDB container using Docker, follow these steps:

1. Pull the MongoDB Docker image:
```sh
docker pull mongo
```

2. Run the MongoDB container:
```sh
docker run --name my-mongo -d -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=secret mongo
```

This command will:
- Create a MongoDB container named `my-mongo`.
- Expose MongoDB on port `27017`.
- Set the root username to `admin` and the password to `secret`.

### MongoDB Schema, User, and Password
Once the MongoDB container is running, you can create a database schema, user, and password by following these steps:

1. Access the MongoDB shell inside the container:
```sh
docker exec -it my-mongo mongo -u admin -p secret
```

2. Create a new database and user:
```js
use myDatabase;
db.createUser({
  user: "myUser",
  pwd: "myPassword",
  roles: [{ role: "readWrite", db: "myDatabase" }]
});
```

3. Create a collection (schema) for storing articles:
```js
db.createCollection("articles");
```

Now, you have a MongoDB database named `myDatabase` with a user `myUser` and a collection `articles`.

## Usage
To run the website locally, follow these steps:

1. Clone the repository:
```sh
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

2. Install the dependencies:
```sh
npm install
```

3. Create a `.env` file in the root directory and add the following environment variables:
```js
MONGO_URI=mongodb://myUser:myPassword@localhost:27017/myDatabase
```

4. Start the development server:
```sh
npm run dev
```

5. Open your browser and navigate to `http://localhost:3000` to view the website.

## Contributing
If you'd like to contribute to this project, please fork the repository and submit a pull request. For major changes, please open an issue first to discuss what you would like to change.

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.