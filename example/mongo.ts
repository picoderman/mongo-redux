import { MongoClient } from 'mongodb';
import { initDBContainer } from 'mongo-redux';

const dbConfig = {
  dbName: 'test',
  username: 'root',
  password: 'example',
  port: 57757,
} as const;

export const getDb = async () => {
  const connectionString = await initDBContainer(dbConfig);
  const client = new MongoClient(connectionString);

  await client.connect();
  return client.db(dbConfig.dbName);
};
