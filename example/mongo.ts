import { MongoClient } from 'mongodb';

const client = new MongoClient(
  "mongodb://root:example@localhost:57757/?authSource=admin&replicaSet=rs0&directConnection=true",
);

export const getDb = async () => {
  await client.connect();
  return client.db("test");
};
