import {
  ensureContainerSystemRunning,
  execMongoShellScript,
  execContainer,
  getIsContainerRunning,
  getIsContainerStopped,
  startContainer,
} from './container-utils';
import type { DBConfig } from './container-utils';

const mongoImage = 'mongo:8.3.8';
const replicaSet = 'rs0';
const pollAttempts = 60;
const pollIntervalMs = 1_000;

const pollMongo = async (
  dbConfig: DBConfig,
  script: string,
  description: string,
) => {
  let lastResult: Awaited<ReturnType<typeof execContainer>> | undefined;

  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    lastResult = await execMongoShellScript(dbConfig, script);

    if (lastResult.exitCode === 0) return;

    if (attempt < pollAttempts - 1) await Bun.sleep(pollIntervalMs);
  }

  const output = lastResult?.stderr.trim() || lastResult?.stdout.trim();

  throw new Error(
    `${description} failed after ${pollAttempts} attempts; last attempt exited with code ${lastResult?.exitCode}${output ? `: ${output}` : ''}`,
  );
};

const createDBContainer = async (dbConfig: DBConfig) => {
  const { dbName, username, password, port } = dbConfig;

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

const waitForMongo = async (dbConfig: DBConfig) => {
  const { dbName } = dbConfig;

  return pollMongo(
    dbConfig,
    'if (db.adminCommand({ ping: 1 }).ok !== 1) quit(1)',
    `Waiting for MongoDB in Apple container '${dbName}' to become ready`,
  );
};

const ensureReplicaSetInitialized = async (
  dbConfig: DBConfig,
) => {
  const result = await execMongoShellScript(
    dbConfig,
    `try {
  const status = rs.status();
  if (status.set !== '${replicaSet}') {
    print('Expected replica set ${replicaSet}, found ' + status.set);
    quit(1);
  }
} catch (error) {
  if (error.code === 94 || error.codeName === 'NotYetInitialized') quit(42);
  print(error);
  quit(1);
}`,
  );

  if (result.exitCode === 0) return;

  if (result.exitCode !== 42) {
    const output = result.stderr.trim() || result.stdout.trim();

    throw new Error(
      `Checking MongoDB replica set '${replicaSet}' failed with exit code ${result.exitCode}${output ? `: ${output}` : ''}`,
    );
  }

  const initResult = await execMongoShellScript(
    dbConfig,
    `rs.initiate({ _id: '${replicaSet}', members: [{ _id: 0, host: 'localhost:27017' }] })`,
  );

  if (initResult.exitCode !== 0) {
    const output = initResult.stderr.trim() || initResult.stdout.trim();

    throw new Error(
      `Initializing MongoDB replica set '${replicaSet}' failed with exit code ${initResult.exitCode}${output ? `: ${output}` : ''}`,
    );
  }
};

const ensureExistingReplicaSetInitialized = async (dbConfig: DBConfig) => {
  const result = await execMongoShellScript(
    dbConfig,
    `try {
  const status = rs.status();
  if (status.set !== '${replicaSet}') {
    print('Expected replica set ${replicaSet}, found ' + status.set);
    quit(1);
  }
} catch (error) {
  if (error.code === 94 || error.codeName === 'NotYetInitialized') quit(42);
  print(error);
  quit(1);
}`,
  );

  if (result.exitCode === 0) return;

  if (result.exitCode === 42)
    throw new Error(
      `Existing Apple container '${dbConfig.dbName}' has an uninitialized replica set`,
    );

  const output = result.stderr.trim() || result.stdout.trim();

  throw new Error(
    `Checking MongoDB replica set '${replicaSet}' failed with exit code ${result.exitCode}${output ? `: ${output}` : ''}`,
  );
};

const startOrCreateContainer = async (dbConfig: DBConfig) => {
  const { dbName } = dbConfig;

  if (await getIsContainerRunning(dbName)) {
    await waitForMongo(dbConfig);
    return ensureExistingReplicaSetInitialized(dbConfig);
  }

  if (await getIsContainerStopped(dbName)) {
    await startContainer(dbName);
    await waitForMongo(dbConfig);
    return ensureExistingReplicaSetInitialized(dbConfig);
  }

  await createDBContainer(dbConfig);
  await waitForMongo(dbConfig);
  return ensureReplicaSetInitialized(dbConfig);
};

const waitForWritablePrimary = async (dbConfig: DBConfig) =>
  pollMongo(
    dbConfig,
    'if (!db.hello().isWritablePrimary) quit(1)',
    `Waiting for MongoDB replica set '${replicaSet}' to elect a writable primary`,
  );

export const initDBContainer = async (
  options: DBConfig,
): Promise<string> => {
  await ensureContainerSystemRunning();
  await startOrCreateContainer(options);
  await waitForWritablePrimary(options);

  return `mongodb://${encodeURIComponent(options.username)}:${encodeURIComponent(options.password)}@localhost:${options.port}/${encodeURIComponent(options.dbName)}?authSource=admin&replicaSet=${replicaSet}&directConnection=true`
};
