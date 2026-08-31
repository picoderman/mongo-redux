import { expect, test } from 'bun:test';
import { MongoClient } from 'mongodb';

import { execContainer } from '../src/container-utils';
import { initDBContainer } from '../src/initDBContainer';
import { createTestDBContainer } from './utils';
import { containerTestTimeout } from "./consts";

test('creates a MongoDB Apple container with a writable replica set', async () => {
  const mongo = await createTestDBContainer('create');

  try {
    expect((await mongo.db.admin().command({ hello: 1 })).isWritablePrimary).toBe(true);
    expect((await mongo.db.admin().command({ replSetGetStatus: 1 })).set).toBe('rs0');
    expect(mongo.uri).toContain(`localhost:${mongo.config.port}`);
  } finally {
    await mongo.destroy();
  }
}, containerTestTimeout);

test('reuses a running container and preserves its data', async () => {
  // Random:
  const value = crypto.randomUUID();
  const mongo = await createTestDBContainer('running');

  try {
    await mongo.db.collection('data').insertOne({ value: 'preserved' });
    const uri = await initDBContainer(mongo.config);
    const client = new MongoClient(uri);
    await client.connect();

    try {
      expect(
        await client.db(mongo.config.dbName)
          .collection('data')
          .findOne()
      )
        .toMatchObject({ value: 'preserved' });
    } finally {
      await client.close();
    }
  } finally {
    await mongo.destroy();
  }
}, containerTestTimeout);

test('starts a stopped container and preserves its data', async () => {
  const mongo = await createTestDBContainer('stopped');

  await mongo.db.collection('data').insertOne({ value: 'preserved' });
  await mongo.client.close();
  await execContainer(['stop', mongo.config.dbName]);

  try {
    const uri = await initDBContainer(mongo.config);
    const client = new MongoClient(uri);
    await client.connect();

    try {
      expect(await client.db(mongo.config.dbName).collection('data').findOne()).toMatchObject({ value: 'preserved' });
    } finally {
      await client.close();
    }
  } finally {
    await execContainer(['delete', '--force', mongo.config.dbName]);
  }
}, containerTestTimeout);

test('encodes credentials in the returned MongoDB URI', async () => {
  const mongo = await createTestDBContainer('credentials', {
    username: 'root+user@example.com',
    password: 'p@ss:/?#[]%',
  });

  try {
    expect(mongo.uri).toContain(encodeURIComponent(mongo.config.username));
    expect(mongo.uri).toContain(encodeURIComponent(mongo.config.password));
    expect((await mongo.db.admin().command({ ping: 1 })).ok).toBe(1);
  } finally {
    await mongo.destroy();
  }
}, containerTestTimeout);
