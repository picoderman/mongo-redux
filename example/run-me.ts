import { createMongoReduxStore } from "mongo-redux";

import { slice } from "./slice";
import { getDb } from "./mongo";

(async () => {
  const db = await getDb();

  const { store, sync } = await createMongoReduxStore({
    mongo: {
      collection: db.collection('redux-states'),
      documentId: 'main',
    },
    redux: {
      reducer: {
        test: slice.reducer,
      },
    },
    sync: {
      onError: console.error,
    },
  });

  const interval = setInterval(() => {
    store.dispatch(slice.actions.toggleValue());

    console.clear();
    console.log('State after toggleValue:', store.getState());
  }, 1000);

  process.once('SIGINT', async () => {
    clearInterval(interval);
    await sync.stop();
    process.exit(0);
  });
})();
