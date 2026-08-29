import type { Collection, OperationTime } from 'mongodb';

import type { MongoReduxDocument } from './types';

export const getDocumentState = <State>(
  document: MongoReduxDocument<State> | null | undefined,
) => {
  if (!document || !Object.hasOwn(document, 'state')) {
    throw new Error('The MongoDB state document is missing its `state` field.');
  }

  return document.state;
};

export const initializeMongoState = async <State>(
  collection: Collection<MongoReduxDocument<State>>,
  documentId: string,
  reducerInitialState: State,
) => {
  const session = collection.db.client.startSession({ causalConsistency: true });
  let initialDocument: MongoReduxDocument<State> | null;
  let startAtOperationTime: OperationTime | undefined;

  try {
    initialDocument = await collection.findOne({ _id: documentId }, { session });

    if (!initialDocument) {
      initialDocument = await collection.findOneAndUpdate(
        { _id: documentId },
        { $setOnInsert: { state: reducerInitialState } },
        {
          includeResultMetadata: false,
          returnDocument: 'after',
          session,
          upsert: true,
        },
      );
    }

    startAtOperationTime = session.operationTime;
  } finally {
    await session.endSession();
  }

  const state = getDocumentState(initialDocument);

  if (!startAtOperationTime) {
    throw new Error('MongoDB did not provide an operation time for change-stream startup.');
  }

  return { startAtOperationTime, state };
};
