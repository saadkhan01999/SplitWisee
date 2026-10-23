import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { ensureIndexes } from "./indexes.js";
import { validators } from "./schema.js";

/**
 * Additive database initializer: creates missing collections with their `$jsonSchema` validators
 * (validationLevel "moderate"), updates existing validators and ensures every index. It never drops or
 * rewrites data and never inserts sample records — the database only ever contains what users create.
 *
 * Used by `src/server.js` at startup and by `npm run db:init` (run that with a migration-capable user).
 */
export async function initialiseDatabase(db, { tolerateValidatorPermission = false, log = console } = {}) {
  for (const [collection, validator] of Object.entries(validators)) {
    const exists = await db.listCollections({ name: collection }).hasNext();
    try {
      if (exists) await db.command({ collMod: collection, validator, validationLevel: "moderate" });
      else await db.createCollection(collection, { validator, validationLevel: "moderate" });
    } catch (error) {
      // 13 = Unauthorized: a least-privilege (readWrite) application user cannot run collMod. Startup continues with
      // the validators already in place; run `npm run db:init` with a migration user after upgrades.
      if (!(tolerateValidatorPermission && error?.code === 13)) throw error;
      log.warn(`Validator for ${collection} not updated (insufficient privilege). Run npm run db:init.`);
    }
  }
  await ensureIndexes(db);
  return { database: db.databaseName, collections: Object.keys(validators) };
}

const runAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runAsScript) {
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI (backend/.env or the environment).");
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const result = await initialiseDatabase(client.db(process.env.MONGODB_DB || "splitwisee"));
    console.log(JSON.stringify(result));
  } finally {
    await client.close();
  }
}
