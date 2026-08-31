import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { Middleware, UnknownAction } from 'redux';

import { createMongoReduxStore } from '../src/createMongoReduxStore';
import { containerTestTimeout } from './consts';
import { destroyMongo, initMongo, mongo } from "./utils";

beforeAll(initMongo, containerTestTimeout);

afterAll(destroyMongo, containerTestTimeout);

test('creates a missing document from a reducer map', async () => {
  const collection = mongo.db.collection('reducer-map');

  const { store, sync } = await createMongoReduxStore({
    mongo: { collection, documentId: 'main' },
    redux: {
      reducer: {
        count: (state = 3, action: UnknownAction) => action.type === 'increment' ? state + 1 : state,
        enabled: (state = false) => state,
      },
    },
  });

  try {
    expect(store.getState()).toEqual({ count: 3, enabled: false });
    expect((await collection.findOne())?.state).toEqual({ count: 3, enabled: false });
  } finally {
    await sync.stop();
  }
});

test('loads an existing document instead of reducer initial state', async () => {
  const collection = mongo.db.collection('existing-state');
  const first = await createMongoReduxStore({
    mongo: { collection, documentId: 'main' },
    redux: { reducer: (state = { value: 1 }) => state },
  });
  await first.sync.stop();
  await collection.updateOne({}, { $set: { state: { value: 9 } } });
  const second = await createMongoReduxStore({
    mongo: { collection, documentId: 'main' },
    redux: { reducer: (state = { value: 1 }) => state },
  });

  try {
    expect(second.store.getState()).toEqual({ value: 9 });
  } finally {
    await second.sync.stop();
  }
});

test('preserves falsey and nested initial state', async () => {
  const collection = mongo.db.collection('falsey-state');
  const initialState = {
    zero: 0,
    empty: '',
    disabled: false,
    nullable: null,
    nested: { values: [0, false, '', null] },
  };
  const { store, sync } = await createMongoReduxStore({
    mongo: { collection, documentId: 'main' },
    redux: { reducer: (state = initialState) => state },
  });

  try {
    expect(store.getState()).toEqual(initialState);
    expect((await collection.findOne())?.state).toEqual(initialState);
  } finally {
    await sync.stop();
  }
});

test('keeps configured middleware active', async () => {
  const collection = mongo.db.collection('middleware');
  const actions: string[] = [];
  const middleware: Middleware = () => (next) => (action) => {
    if (typeof action === 'object' && action !== null && 'type' in action) actions.push(String(action.type));
    return next(action);
  };
  const { store, sync } = await createMongoReduxStore({
    mongo: { collection, documentId: 'main' },
    redux: {
      reducer: (state = 0, action: UnknownAction) => action.type === 'increment' ? state + 1 : state,
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(middleware),
    },
  });

  try {
    store.dispatch({ type: 'increment' });
    await sync.flush();
    expect(actions).toContain('increment');
    expect((await collection.findOne())?.state).toBe(1);
  } finally {
    await sync.stop();
  }
});

test('atomically handles two simultaneous first opens', async () => {
  const collection = mongo.db.collection('simultaneous-open');
  const reducer = (state = { value: 4 }) => state;
  const [first, second] = await Promise.all([
    createMongoReduxStore({ mongo: { collection, documentId: 'main' }, redux: { reducer } }),
    createMongoReduxStore({ mongo: { collection, documentId: 'main' }, redux: { reducer } }),
  ]);

  try {
    expect(await collection.countDocuments()).toBe(1);
    expect(first.store.getState()).toEqual({ value: 4 });
    expect(second.store.getState()).toEqual({ value: 4 });
  } finally {
    await Promise.all([first.sync.stop(), second.sync.stop()]);
  }
});

test('rejects an existing document without state', async () => {
  const collection = mongo.db.collection('missing-state');
  const first = await createMongoReduxStore({
    mongo: { collection, documentId: 'main' },
    redux: { reducer: (state = { value: 1 }) => state },
  });
  await first.sync.stop();
  await collection.updateOne({}, { $unset: { state: '' } });

  await expect(createMongoReduxStore({
    mongo: { collection, documentId: 'main' },
    redux: { reducer: (state = { value: 1 }) => state },
  })).rejects.toThrow('The MongoDB state document is missing its `state` field.');
});
