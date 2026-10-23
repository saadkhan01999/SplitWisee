import { MongoClient } from "mongodb";
// One client per process. Transactions (coupon redemption) require a replica set or MongoDB Atlas.
export async function connectDatabase(env = process.env) {
  const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, appName: "SplitWisee" });
  await client.connect();
  return { client, db: client.db(env.MONGODB_DB || "splitwisee") };
}
