# Juniorfox.net Node.js Website

This project is a Node.js-based website that uses Markdown files as articles. It also includes a MongoDB container for storing data, such as user information, articles, and more.

## Table of Contents

- [About](#about)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [MongoDB Container](#mongodb-container)
- [MongoDB Schema, User, and Password](#mongodb-schema-user-and-password)
- [Usage](#usage)
- [GCP App Engine](#gcp-app-engine)
- [Contributing](#contributing)
- [License](#license)

## About

This project is a personal website built using Node.js. It allows you to create and manage articles using Markdown files. The website also integrates with MongoDB for storing additional data, such as user information and article metadata.

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

- [Docker](https://www.docker.com/get-started) for running the MongoDB container
- [Node.js](https://nodejs.org/) (for running the website)
- [MongoDB](https://www.mongodb.com/) (optional, if you want to run MongoDB locally without Docker)

## Setup

### MongoDB Container

To set up a MongoDB container using Docker, follow these steps:

#### 1. Pull the MongoDB Docker image

```sh
docker pull mongo
```

#### 2. Run the MongoDB container

```sh
docker run --name my-mongo -d -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=secret mongo
```

This command will:

- Create a MongoDB container named `my-mongo`.
- Expose MongoDB on port `27017`.
- Set the root username to `admin` and the password to `secret`.

### MongoDB Schema, User, and Password

Once the MongoDB container is running, you can create a database schema, user, and password by following these steps:

#### 1. Access the MongoDB shell inside the container

```sh
docker exec -it my-mongo mongo -u admin -p secret
```

#### 2. Create a new database and user

```js
use myDatabase;
db.createUser({
  user: "myUser",
  pwd: "myPassword",
  roles: [{ role: "readWrite", db: "myDatabase" }]
});
```

#### 3. Create a collection (schema) for storing articles

```js
db.createCollection("articles");
```

Now, you have a MongoDB database named `myDatabase` with a user `myUser` and a collection `articles`.

## Usage

To run the website locally, follow these steps:

### 1. Clone the repository

```sh
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

### 2. Install the dependencies

```sh
npm install
```

### 3. Create a `.env` file in the root directory and add the following environment variables

```js
MONGO_URI=mongodb://myUser:myPassword@localhost:27017/myDatabase
```

### 4. Start the development server

```sh
npm run dev
```

### 5. Open your browser and navigate to `http://localhost:3000` to view the website

## GCP App Engine

### Instructions for Deploying Your Node.js Application to GCP

#### 1. Create a Google Cloud Project

1. Open the Google **Cloud Console**.
2. Click on the project dropdown and select **New Project**.
3. Enter a name for your project (e.g., `juniorfox-net`) and click **Create**.
4. Make a note of your `project ID`, as you will need it later.

#### 2. Set Up Workload Identity Federation

##### 1. Enable the IAM API

```bash

gcloud services enable iam.googleapis.com --project=[YOUR_PROJECT_ID]
```

##### 2. Create a Workload Identity Pool

```bash
gcloud iam workload-identity-pools create "my-pool" \
    --project="[YOUR_PROJECT_ID]" \
    --location="global" \
    --display-name="GitHub Workload Identity Pool"
```

##### 3. Create a Workload Identity Provider

```bash
gcloud iam workload-identity-pools providers create-oidc "my-provider" \
    --project="[YOUR_PROJECT_ID]" \
    --location="global" \
    --workload-identity-pool="my-pool" \
    --display-name="GitHub Provider" \
    --attribute-mapping="google.subject=assertion.sub" \
    --issuer-uri="https://token.actions.githubusercontent.com"
```

##### 4. Create a Service Account

```bash
gcloud iam service-accounts create "github-deployer" \
    --project="[YOUR_PROJECT_ID]" \
    --display-name="GitHub Deployer Service Account"
```

##### 5. Grant the Service Account Permissions

```bash
for roles in 'owner' 'storage.objectViewer' 'storage.objectCreator' 'secretmanager.secretAccessor'; do
  gcloud projects add-iam-policy-binding [YOUR_PROJECT_ID] \
    --member="serviceAccount:github-deployer@[YOUR_PROJECT_ID].iam.gserviceaccount.com" \
    --role="roles/${roles}"
done;
```

##### 6. Allow the Workload Identity Provider to Impersonate the Service Account

```bash
    gcloud iam service-accounts add-iam-policy-binding "github-deployer@[YOUR_PROJECT_ID].iam.gserviceaccount.com" \
        --role="roles/iam.workloadIdentityUser" \
        --member="principalSet://iam.googleapis.com/projects/[YOUR_PROJECT_ID]/locations/global/workloadIdentityPools/my-pool/attribute.repository/[YOUR_GITHUB_REPO]"
```

#### 3. Create Secrets in Secret Manager

##### 1. Enable the Secret Manager API

```bash
gcloud services enable secretmanager.googleapis.com --project=[YOUR_PROJECT_ID]
```

##### 2 Store your sensitive credentials in Secret Manager

```bash
gcloud secrets create MONGO_USER --data-file=<(echo -n "juniorfox-site")
gcloud secrets create MONGO_PASS --data-file=<(echo -n "[password]")
gcloud secrets create MONGO_DBNAME --data-file=<(echo -n "[dbname]")
gcloud secrets create MONGO_HOST --data-file=<(echo -n "[host]")
```

##### 3. Grant the Service Account access to these secrets

```bash
    gcloud secrets add-iam-policy-binding MONGO_USER \
        --member="serviceAccount:github-deployer@[YOUR_PROJECT_ID].iam.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor"
```

- Repeat for each secret (MONGO_PASS, MONGO_DBNAME, MONGO_HOST).

#### 4. Configure GitHub Actions for Deployment

Add the following GitHub Actions workflow to your repository as .github/workflows/deploy.yml:

```yaml
name: Deploy Application to App Engine

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: 'google-github-actions/auth@v2'
        with:
          workload_identity_provider: 'projects/[YOUR_PROJECT_ID]/locations/global/workloadIdentityPools/my-pool/providers/my-provider'
          service_account: 'github-deployer@[YOUR_PROJECT_ID].iam.gserviceaccount.com'
          project_id: '[YOUR_PROJECT_ID]'

      - name: Deploy to App Engine
        uses: google-github-actions/deploy-appengine@v2
        with:
          promote: true
          project_id: '[YOUR_PROJECT_ID]'
          source: './app'
```

Important Notes:

- Replace [YOUR_PROJECT_ID] with your actual Google Cloud project ID.
- Replace [YOUR_GITHUB_REPO] with the repository path in the format owner/repo.
- Make sure to manage your secrets securely and avoid exposing them in your repository.

## Contributing

If you'd like to contribute to this project, please fork the repository and submit a pull request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
