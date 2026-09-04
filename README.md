## Mongo-Redux syncer

Synchronize one Redux root state with one MongoDB document.

### Installation

```sh
bun add @tt-tt/mongo-redux
```

This package runs directly from its TypeScript source, so use it with Bun.

Requirements:

- TypeScript 7+
- Redux Toolkit 2+
- MongoDB 7+
- Redux 5+

### Usage

```ts
import { createMongoReduxStore } from '@tt-tt/mongo-redux';

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

store.dispatch(slice.actions.toggleValue());

await sync.flush();
await sync.stop();
```

The factory loads MongoDB before creating Redux. If the document does not exist, it is
created from the reducers' initial state. The stored document has this shape:

```js
{
  _id: 'main',
  state: {
    // Redux root state
  },
  _sync: {
    // Internal write metadata
    writeId: '...'
  }
}
```

Redux changes are written to MongoDB in dispatch order. External MongoDB changes replace
the complete Redux root state. `sync.status` is `active`, `error`, or `stopped`, while
`sync.error` retains the first runtime synchronization failure.

MongoDB must run as a replica set or sharded cluster because incoming synchronization uses
a change stream. Version 1 supports one active Redux store per MongoDB document.

`initDBContainer` requires Bun and Apple's `container` CLI with its service running. It
starts a local MongoDB container configured as a single-node replica set and returns its
connection string.

### Idea

```mermaid
sequenceDiagram
    participant MongoDB@{ "type": "database" }
    participant Reducer
    participant ReduxStore as Redux Store

    MongoDB->>Reducer: initial state
    Reducer->>ReduxStore: create store
 
    ReduxStore<<->>MongoDB: "<br />"
    Note over ReduxStore,MongoDB: 🔄 Sync
```

### Data Flow

```mermaid
flowchart TB
  linkStyle default stroke-dasharray: 9,5,stroke-dashoffset: 900,animation: dash 25s linear infinite;

  DB@{ shape: database, label: MongoDB }
  style DB fill:#00ed64,color:#001e2b,stroke:#001e2b

  subgraph YOUR-APP["Your App"]
    style YOUR-APP fill:none,stroke-dasharray: 9,5
  
    STORE@{ shape: das, label: Redux Store }
    style STORE fill:#593d88,color:#fff,stroke:#fff
    
    OUTER-DISPATCH[Dispatch]
    
    subgraph LIBRARY["mongo-redux"]
      style LIBRARY fill:none
    
      INCOMING@{ shape: rounded, label: "1. Watch for DB changes<br>2. Dispatch root state" }
      MIDDLEWARE@{ shape: rounded, label: "1. Middleware on changes<br>2. collection.updateOne()" }
    end
  end
  
  OUTER-DISPATCH ==> STORE ==> MIDDLEWARE ==> DB
  DB ==> INCOMING ==> STORE

  linkStyle 0 stroke:#593d88
  linkStyle 1 stroke:#593d88
  linkStyle 2 stroke:#593d88
  linkStyle 3 stroke:#00C853
  linkStyle 4 stroke:#00C853
```
