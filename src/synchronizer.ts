import type {
  ChangeStream,
  ChangeStreamDocument,
  Collection,
  Document,
  OperationTime,
} from 'mongodb';
import type { Middleware } from 'redux';

import { getDocumentState } from './mongo-state';
import type { MongoReduxDocument, MongoReduxSync, SyncStatus } from './types';

const getEventWriteId = <State>(change: ChangeStreamDocument<MongoReduxDocument<State>>) => {
  if (change.operationType === 'update') {
    const updatedFields = change.updateDescription.updatedFields as Document | undefined;
    const writeId = updatedFields?.['_sync.writeId'];
    return typeof writeId === 'string' ? writeId : undefined;
  }

  if (change.operationType === 'insert' || change.operationType === 'replace') {
    return change.fullDocument._sync?.writeId;
  }

  return undefined;
};

export const createSynchronizer = <State>(
  collection: Collection<MongoReduxDocument<State>>,
  documentId: string,
  shouldIgnoreAction: (action: unknown) => boolean,
  onError?: (error: unknown) => void,
) => {
  let status: SyncStatus = 'active';
  let syncError: unknown;
  let stopping = false;
  let changeStream: ChangeStream<MongoReduxDocument<State>> | undefined;
  let watchTask = Promise.resolve();
  let writeQueue = Promise.resolve();
  const pendingWriteIds = new Set<string>();

  const closeChangeStream = async () => {
    if (changeStream && !changeStream.closed) {
      await changeStream.close();
    }
  };

  const fail = (error: unknown) => {
    if (status !== 'active') {
      return;
    }

    status = 'error';
    syncError = error;
    pendingWriteIds.clear();

    try {
      onError?.(error);
    } catch {
      // The synchronization error remains the source of failure.
    }

    void closeChangeStream().catch(() => undefined);
  };

  const enqueueWrite = (state: State) => {
    const writeId = crypto.randomUUID();
    pendingWriteIds.add(writeId);

    writeQueue = writeQueue.then(async () => {
      if (status !== 'active') {
        pendingWriteIds.delete(writeId);
        return;
      }

      try {
        const result = await collection.updateOne(
          { _id: documentId },
          {
            $set: {
              '_sync.writeId': writeId,
              state,
            },
          },
        );

        if (result.matchedCount === 0) {
          throw new Error(`MongoDB state document \`${documentId}\` was deleted.`);
        }
      } catch (error) {
        pendingWriteIds.delete(writeId);
        throw error;
      }
    });

    void writeQueue.catch(fail);
  };

  const middleware: Middleware<{}, State> = (storeApi) => (next) => (action) => {
    const previousState = storeApi.getState();
    const result = next(action);
    const nextState = storeApi.getState();

    if (
      !stopping &&
      status === 'active' &&
      !shouldIgnoreAction(action) &&
      nextState !== previousState
    ) {
      enqueueWrite(nextState);
    }

    return result;
  };

  const flush = async () => {
    try {
      await writeQueue;
    } catch (error) {
      fail(error);
      throw error;
    }

    if (status === 'error') {
      throw syncError;
    }
  };

  const stop = async () => {
    if (status === 'stopped') {
      return;
    }

    if (status === 'error') {
      stopping = true;
      await closeChangeStream().catch(() => undefined);
      await watchTask;
      throw syncError;
    }

    stopping = true;

    try {
      await flush();
      await closeChangeStream();
      await watchTask;
      pendingWriteIds.clear();
      status = 'stopped';
    } catch (error) {
      fail(error);
      throw error;
    }
  };

  const sync: MongoReduxSync = {
    get error() {
      return syncError;
    },
    flush,
    get status() {
      return status;
    },
    stop,
  };

  const start = async (
    startAtOperationTime: OperationTime,
    applyRemoteState: (state: State) => void,
  ) => {
    const applyChange = (change: ChangeStreamDocument<MongoReduxDocument<State>>) => {
      if (
        change.operationType === 'delete' ||
        change.operationType === 'drop' ||
        change.operationType === 'dropDatabase' ||
        change.operationType === 'invalidate' ||
        change.operationType === 'rename'
      ) {
        throw new Error(
          `MongoDB state document \`${documentId}\` or its collection is no longer available.`,
        );
      }

      if (
        change.operationType !== 'insert' &&
        change.operationType !== 'replace' &&
        change.operationType !== 'update'
      ) {
        throw new Error(`Unsupported MongoDB change-stream event: ${change.operationType}.`);
      }

      const state = getDocumentState(change.fullDocument);
      const writeId = getEventWriteId(change);

      if (writeId && pendingWriteIds.delete(writeId)) {
        return;
      }

      applyRemoteState(state);
    };

    try {
      changeStream = collection.watch(
        [
          {
            $match: {
              $or: [
                { 'documentKey._id': documentId },
                {
                  operationType: {
                    $in: ['drop', 'dropDatabase', 'invalidate', 'rename'],
                  },
                },
              ],
            },
          },
        ],
        {
          fullDocument: 'updateLookup',
          maxAwaitTimeMS: 100,
          startAtOperationTime,
        },
      );

      const initialChange = await changeStream.tryNext();

      if (initialChange) {
        applyChange(initialChange);
      }
    } catch (error) {
      await closeChangeStream().catch(() => undefined);
      throw error;
    }

    watchTask = (async () => {
      try {
        for await (const change of changeStream) {
          applyChange(change);
        }
      } catch (error) {
        if (!stopping) {
          fail(error);
        }
      }
    })();
  };

  return { middleware, start, sync };
};
