import { MongoClient } from 'mongodb';

const client = new MongoClient("mongodb://root:example@localhost:57757");

export const getDb = async () => {
  await client.connect();
  return client.db("test");
};
