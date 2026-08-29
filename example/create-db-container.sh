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
  --entrypoint sh \
  -e MONGO_INITDB_ROOT_USERNAME="$MONGO_USER" \
  -e MONGO_INITDB_ROOT_PASSWORD="$MONGO_PASSWORD" \
  -p "$MONGO_PORT:27017" \
  mongo:latest \
  -c 'umask 077
openssl rand -base64 756 > /tmp/mongo-replica-set-key
chown mongodb:mongodb /tmp/mongo-replica-set-key
exec /usr/local/bin/docker-entrypoint.sh mongod --replSet rs0 --keyFile /tmp/mongo-replica-set-key --bind_ip_all' \
  >/dev/null

attempt=0
until "$RUNTIME" exec "$CONTAINER_NAME" mongosh \
  --quiet \
  --username "$MONGO_USER" \
  --password "$MONGO_PASSWORD" \
  --authenticationDatabase admin \
  --eval 'db.adminCommand({ ping: 1 }).ok' >/dev/null 2>&1; do
  attempt=$((attempt + 1))

  if [ "$attempt" -ge 60 ]; then
    echo "Error: MongoDB did not become ready within 60 seconds" >&2
    exit 1
  fi

  sleep 1
done

"$RUNTIME" exec "$CONTAINER_NAME" mongosh \
  --quiet \
  --username "$MONGO_USER" \
  --password "$MONGO_PASSWORD" \
  --authenticationDatabase admin \
  --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })' \
  >/dev/null

attempt=0
until "$RUNTIME" exec "$CONTAINER_NAME" mongosh \
  --quiet \
  --username "$MONGO_USER" \
  --password "$MONGO_PASSWORD" \
  --authenticationDatabase admin \
  --eval 'if (!db.hello().isWritablePrimary) quit(1)' >/dev/null 2>&1; do
  attempt=$((attempt + 1))

  if [ "$attempt" -ge 60 ]; then
    echo "Error: MongoDB replica set did not elect a primary within 60 seconds" >&2
    exit 1
  fi

  sleep 1
done

echo "mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/?authSource=admin&replicaSet=rs0&directConnection=true"
