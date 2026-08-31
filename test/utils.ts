import { createServer } from 'node:net';

import { MongoClient } from 'mongodb';

import { execContainer } from '../src/container-utils';
import { initDBContainer } from '../src/initDBContainer';
import { createMongoReduxStore } from "../src/createMongoReduxStore";
import { slice } from "./consts";

export const getAvailablePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a test port'));
        return;
      }

      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });

export const createTestDBContainer = async (
  label: string,
  credentials: { username: string; password: string } = {
    username: 'root',
    password: 'test-password',
  },
) => {
  const config = {
    dbName: `mongo-redux-test-${label}-${process.pid}-${Date.now()}`,
    ...credentials,
    port: await getAvailablePort(),
  } as const;

  let uri: string;

  try {
    uri = await initDBContainer(config);
  } catch (error) {
    await execContainer(['delete', '--force', config.dbName]);
    throw error;
  }

  const client = new MongoClient(uri);
  await client.connect();

  return {
    client,
    config,
    db: client.db(config.dbName),
    uri,
    destroy: async () => {
      await client.close();
      await execContainer(['delete', '--force', config.dbName]);
    },
  };
};

export const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await Bun.sleep(25);
  }

  throw new Error('Timed out waiting for synchronized state');
};

export const createStore = (
  collectionName: string,
  documentId = 'main',
  onError?: (error: unknown) => void
) =>
  createMongoReduxStore({
    mongo: { collection: mongo.db.collection(collectionName), documentId },
    redux: { reducer: { counter: slice.reducer } },
    sync: { onError },
  });

export let mongo: Awaited<ReturnType<typeof createTestDBContainer>>;

export const initMongo = async () => {
  mongo = await createTestDBContainer('sync');
};

export const destroyMongo = async () => {
  await mongo?.destroy();
};
