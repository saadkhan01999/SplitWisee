import { aggregate, idField } from "./common.js";
// v1.2.7: rate-limit windows (`rl:`) and authentication failure locks (`lock:`). Keys are SHA-256 digests only.
export default aggregate(["key", "expiresAt"], {
  key: idField,
  expiresAt: { bsonType: "date" },
  hits: { bsonType: ["int", "long", "double"] },
  failures: { bsonType: ["int", "long", "double"] },
  resetAt: { bsonType: "date" },
  lastAttemptAt: { bsonType: "date" },
  lockedUntil: { bsonType: "date" },
});
