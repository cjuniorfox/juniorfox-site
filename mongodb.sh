#!/usr/bin/bash
podman run -d \
  --name mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=secret \
  -v ./init-mongo.sh:/docker-entrypoint-initdb.d/init-mongo.sh:Z \
  docker.io/mongo:3.7
