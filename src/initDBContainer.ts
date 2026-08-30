const MONGO_IMAGE = 'mongo:8.3.8';
const REPLICA_SET = 'rs0';
const POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 1_000;

const mongoImage = 'mongo:8.3.8';
const replicaSet = 'rs0';
const pollAttempts = 60;
const pollIntervalMs = 1_000;

const createDBContainer = async (dbCredentials: DBCredentials, port: number) => {
  const { dbName, username, password } = dbCredentials;

  const result = await execContainer(
    [
      'run',
      '--detach',
      '--name',
      dbName,
      '--entrypoint',
      'sh',
      '--env',
      'MONGO_INITDB_ROOT_USERNAME',
      '--env',
      'MONGO_INITDB_ROOT_PASSWORD',
      '--publish',
      `${port}:27017`,
      mongoImage,
      '-c',
      `umask 077
openssl rand -base64 756 > /tmp/mongo-replica-set-key
chown mongodb:mongodb /tmp/mongo-replica-set-key
exec /usr/local/bin/docker-entrypoint.sh mongod --replSet ${replicaSet} --keyFile /tmp/mongo-replica-set-key --bind_ip_all`,
    ],
    {
      ...Bun.env,
      MONGO_INITDB_ROOT_USERNAME: username,
      MONGO_INITDB_ROOT_PASSWORD: password,
    },
  );

  if (result.exitCode !== 0) {
    const output = result.stderr.trim() || result.stdout.trim();

    throw new Error(
      `Creating Apple container '${dbName}' failed with exit code ${result.exitCode}${output ? `: ${output}` : ''}`,
    );
  }

  return true;
};


