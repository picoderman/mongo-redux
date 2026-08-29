import {
  Tuple,
  configureStore,
  type ConfigureStoreOptions,
  type EnhancedStore,
} from '@reduxjs/toolkit';
import {
  combineReducers,
  type Action,
  type Middleware,
  type Reducer,
  type ReducersMapObject,
} from 'redux';

import type { Enhancers, Middlewares, MongoReduxStoreOptions } from './types';

const REMOTE_STATE_ACTION = '@@mongo-redux/remote-state/replace';
const INITIAL_STATE_ACTION = '@@mongo-redux/initial-state';

export const normalizeReducer = <State, StoreAction extends Action>(
  configuredReducer:
    | Reducer<State, StoreAction, State>
    | ReducersMapObject<State, StoreAction, State>,
) =>
  (typeof configuredReducer === 'function'
    ? configuredReducer
    : combineReducers(configuredReducer)) as Reducer<State, StoreAction, State>;

export const getReducerInitialState = <State, StoreAction extends Action>(
  reducer: Reducer<State, StoreAction, State>,
) =>
  reducer(undefined, {
    type: INITIAL_STATE_ACTION,
  } as StoreAction);

export const createRemoteStateAction = <State>(state: State) => ({
  payload: state,
  type: REMOTE_STATE_ACTION,
});

export const isRemoteStateAction = (action: unknown) =>
  typeof action === 'object' &&
  action !== null &&
  'type' in action &&
  action.type === REMOTE_STATE_ACTION;

export const createReduxStore = <
  State,
  StoreAction extends Action,
  MiddlewareTuple extends Tuple<Middlewares<State>>,
  EnhancerTuple extends Tuple<Enhancers>,
>(
  options: MongoReduxStoreOptions<
    State,
    StoreAction,
    MiddlewareTuple,
    EnhancerTuple
  >['redux'],
  rootReducer: Reducer<State, StoreAction, State>,
  initialState: State,
  syncMiddleware: Middleware<{}, State>,
) => {
  const wrappedReducer: Reducer<State, StoreAction, State> = (state, action) => {
    if (action.type === REMOTE_STATE_ACTION) {
      return (action as StoreAction & { payload: State }).payload;
    }

    return rootReducer(state, action);
  };

  const {
    reducer: _reducer,
    middleware: configuredMiddleware,
    ...configureStoreOptions
  } = options;
  return configureStore({
    ...configureStoreOptions,
    middleware: (getDefaultMiddleware) => {
      const middleware = (configuredMiddleware?.(getDefaultMiddleware) ??
        getDefaultMiddleware()) as Tuple<Middlewares<State>>;

      return middleware.concat(syncMiddleware);
    },
    preloadedState: initialState,
    reducer: wrappedReducer,
  } as ConfigureStoreOptions<State, StoreAction>) as EnhancedStore<
    State,
    StoreAction,
    EnhancerTuple
  >;
};
