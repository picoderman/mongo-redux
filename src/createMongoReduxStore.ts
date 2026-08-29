import { Tuple } from '@reduxjs/toolkit';
import type { Collection } from 'mongodb';
import type { Action, UnknownAction } from 'redux';

import { initializeMongoState } from './mongo-state';
import {
  createReduxStore,
  createRemoteStateAction,
  getReducerInitialState,
  isRemoteStateAction,
  normalizeReducer,
} from './redux-store';
import { createSynchronizer } from './synchronizer';
import type {
  DefaultEnhancers,
  DefaultMiddlewareTuple,
  Enhancers,
  Middlewares,
  MongoReduxDocument,
  MongoReduxStoreOptions,
  MongoReduxStoreResult,
} from './types';

export async function createMongoReduxStore<
  State = any,
  StoreAction extends Action = UnknownAction,
  MiddlewareTuple extends Tuple<Middlewares<State>> = DefaultMiddlewareTuple<State>,
  EnhancerTuple extends Tuple<Enhancers> = DefaultEnhancers<MiddlewareTuple>,
>(
  options: MongoReduxStoreOptions<State, StoreAction, MiddlewareTuple, EnhancerTuple>,
): Promise<MongoReduxStoreResult<State, StoreAction, EnhancerTuple>> {
  const collection = options.mongo.collection as unknown as Collection<MongoReduxDocument<State>>;
  const { documentId } = options.mongo;
  const rootReducer = normalizeReducer(options.redux.reducer);
  const reducerInitialState = getReducerInitialState(rootReducer);
  const { startAtOperationTime, state } = await initializeMongoState(
    collection,
    documentId,
    reducerInitialState,
  );
  const synchronizer = createSynchronizer(
    collection,
    documentId,
    isRemoteStateAction,
    options.sync?.onError,
  );
  const store = createReduxStore(
    options.redux,
    rootReducer,
    state,
    synchronizer.middleware,
  );

  await synchronizer.start(startAtOperationTime, (remoteState) => {
    store.dispatch(createRemoteStateAction(remoteState) as unknown as StoreAction);
  });

  return { store, sync: synchronizer.sync };
}
