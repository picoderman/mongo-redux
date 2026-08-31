import { afterAll, beforeAll, expect, test } from 'bun:test';

import { containerTestTimeout, slice } from './consts';
import { destroyMongo, initMongo, mongo, createStore, waitFor } from "./utils";

beforeAll(initMongo, containerTestTimeout);

afterAll(destroyMongo, containerTestTimeout);

test('writes changed Redux state and a write ID to MongoDB', async () => {
  const collection = mongo.db.collection('local-write');
  const { store, sync } = await createStore('local-write');

  try {
    store.dispatch(slice.actions.add(3));
    await sync.flush();
    const document = await collection.findOne();
    expect(document?.state).toEqual({ counter: { value: 3, values: [3] } });
    expect(typeof document?._sync?.writeId).toBe('string');
  } finally {
    await sync.stop();
  }
});

test('does not write when an action preserves state identity', async () => {
  const collection = mongo.db.collection('no-op');
  const { store, sync } = await createStore('no-op');

  try {
    store.dispatch(slice.actions.noop());
    await sync.flush();
    expect((await collection.findOne())?._sync).toBeUndefined();
  } finally {
    await sync.stop();
  }
});

test('flush persists rapid dispatches in order', async () => {
  const collection = mongo.db.collection('ordered-writes');
  const { store, sync } = await createStore('ordered-writes');

  try {
    for (const value of [1, 2, 3, 4, 5]) store.dispatch(slice.actions.add(value));
    await sync.flush();
    expect((await collection.findOne())?.state).toEqual({
      counter: { value: 15, values: [1, 2, 3, 4, 5] },
    });
  } finally {
    await sync.stop();
  }
});

test('applies a remote MongoDB update to Redux', async () => {
  const collection = mongo.db.collection('remote-update');
  const { store, sync } = await createStore('remote-update');

  try {
    await collection.updateOne({}, { $set: { state: { counter: { value: 12, values: [12] } } } });
    await waitFor(() => store.getState().counter.value === 12);
    expect(store.getState()).toEqual({ counter: { value: 12, values: [12] } });
  } finally {
    await sync.stop();
  }
});

test('applies a remote document replacement to Redux', async () => {
  const collection = mongo.db.collection('remote-replace');
  const { store, sync } = await createStore('remote-replace');
  const current = await collection.findOne();

  try {
    await collection.replaceOne({}, { _id: current?._id, state: { counter: { value: 20, values: [20] } } });
    await waitFor(() => store.getState().counter.value === 20);
    expect(store.getState()).toEqual({ counter: { value: 20, values: [20] } });
  } finally {
    await sync.stop();
  }
});

test('ignores changes to another document', async () => {
  const collection = mongo.db.collection('other-document');
  const { store, sync } = await createStore('other-document');

  try {
    await collection.insertOne({ state: { counter: { value: 99, values: [99] } } });
    await Bun.sleep(200);
    expect(store.getState()).toEqual({ counter: { value: 0, values: [] } });
  } finally {
    await sync.stop();
  }
});

test('does not dispatch its own MongoDB write back into Redux', async () => {
  const { store, sync } = await createStore('own-write');
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  try {
    store.dispatch(slice.actions.add(1));
    await sync.flush();
    await Bun.sleep(200);
    expect(notifications).toBe(1);
  } finally {
    unsubscribe();
    await sync.stop();
  }
});

test('stop flushes pending writes and prevents later synchronization', async () => {
  const collection = mongo.db.collection('stop');
  const { store, sync } = await createStore('stop');
  store.dispatch(slice.actions.add(2));
  await sync.stop();
  await sync.stop();
  store.dispatch(slice.actions.add(3));
  await sync.flush();

  expect(sync.status).toBe('stopped');
  expect((await collection.findOne())?.state).toEqual({ counter: { value: 2, values: [2] } });
});

test('enters the error state when the state document is deleted', async () => {
  const collection = mongo.db.collection('delete-error');
  const errors: unknown[] = [];
  const { store, sync } = await createStore('delete-error', 'main', (error) => errors.push(error));
  await collection.deleteOne({});
  store.dispatch(slice.actions.add(1));

  await expect(sync.flush()).rejects.toThrow();
  await waitFor(() => sync.status === 'error');
  expect(errors).toHaveLength(1);
  expect(sync.error).toBe(errors[0]);
  await expect(sync.stop()).rejects.toBe(sync.error);
});

test('enters the error state when a remote update removes state', async () => {
  const collection = mongo.db.collection('missing-state-error');
  const { sync } = await createStore('missing-state-error');

  try {
    await collection.updateOne({}, { $unset: { state: '' } });
    await waitFor(() => sync.status === 'error');
    expect(String(sync.error)).toContain('missing its `state` field');
  } finally {
    await expect(sync.stop()).rejects.toThrow();
  }
});

test('isolates stores using different document IDs', async () => {
  const first = await createStore('isolated-documents', 'first');
  const second = await createStore('isolated-documents', 'second');

  try {
    first.store.dispatch(slice.actions.add(10));
    await first.sync.flush();
    await Bun.sleep(200);
    expect(first.store.getState().counter.value).toBe(10);
    expect(second.store.getState().counter.value).toBe(0);
  } finally {
    await Promise.all([first.sync.stop(), second.sync.stop()]);
  }
});
