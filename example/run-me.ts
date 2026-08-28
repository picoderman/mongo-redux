import { configureStore } from "@reduxjs/toolkit";

import { slice } from "./slice";
import { getDb } from "./mongo";

(async () => {
  const db = await getDb();

  const store = configureStore({
    reducer: {
      test: slice.reducer,
    },
  });

  // DO: SYNC

  setInterval(() => {
    store.dispatch(slice.actions.toggleValue());

    console.clear();
    console.log('State after toggleValue:', store.getState());
  }, 1000);
})();
