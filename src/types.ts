import {
  Tuple,
  type ConfigureStoreOptions,
  type EnhancedStore,
  type ThunkMiddleware,
  type TSHelpersExtractDispatchExtensions,
} from '@reduxjs/toolkit';
import type { Collection } from 'mongodb';
import type { Action, Middleware, StoreEnhancer, UnknownAction } from 'redux';

export type Middlewares<State> = ReadonlyArray<Middleware<{}, State>>;
export type Enhancers = ReadonlyArray<StoreEnhancer>;

export type DefaultMiddlewareTuple<State> = Tuple<[ThunkMiddleware<State, UnknownAction>]>;

export type DefaultEnhancers<MiddlewareTuple extends Tuple<Middlewares<any>>> = Tuple<[
  StoreEnhancer<{
    dispatch: TSHelpersExtractDispatchExtensions<MiddlewareTuple>;
  }>,
  StoreEnhancer,
]>;

export type MongoReduxDocument<State> = {
  _id: string;
  state: State;
  _sync?: {
    writeId: string;
  };
};

export type SyncStatus = 'active' | 'error' | 'stopped';

export type MongoReduxSync = {
  readonly status: SyncStatus;
  readonly error: unknown;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
};

export type MongoReduxStoreOptions<
  State,
  StoreAction extends Action,
  MiddlewareTuple extends Tuple<Middlewares<State>>,
  EnhancerTuple extends Tuple<Enhancers>,
> = {
  mongo: {
    collection: Collection;
    documentId: string;
  };
  redux: Omit<
    ConfigureStoreOptions<State, StoreAction, MiddlewareTuple, EnhancerTuple, State>,
    'preloadedState'
  >;
  sync?: {
    onError?: (error: unknown) => void;
  };
};

export type MongoReduxStoreResult<
  State,
  StoreAction extends Action,
  EnhancerTuple extends Tuple<Enhancers>,
> = {
  store: EnhancedStore<State, StoreAction, EnhancerTuple>;
  sync: MongoReduxSync;
};
