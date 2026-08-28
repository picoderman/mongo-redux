#!/usr/bin/env sh
set -e

if command -v container >/dev/null 2>&1; then
  RUNTIME="container"
elif command -v docker >/dev/null 2>&1; then
  RUNTIME="docker"
else
  echo "Error: neither 'container' nor 'docker' is available" >&2
  exit 1
fi

MONGO_USER="root"
MONGO_PASSWORD="example"
MONGO_PORT="57757"
MONGO_HOST="localhost"
CONTAINER_NAME="mongo-redux"

"$RUNTIME" run -d \
  --name "$CONTAINER_NAME" \
  -e MONGO_INITDB_ROOT_USERNAME="$MONGO_USER" \
  -e MONGO_INITDB_ROOT_PASSWORD="$MONGO_PASSWORD" \
  -p "$MONGO_PORT:27017" \
  mongo:latest >/dev/null

echo "mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/?authSource=admin"
