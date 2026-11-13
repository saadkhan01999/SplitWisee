import { aggregate, idField } from "./common.js";
// One document per account per promotion campaign ("<campaign key>:<user id>"): a second claim is a duplicate key.
export default aggregate(["id", "key", "userId", "at"], {
  id: idField,
  key: { bsonType: "string" },
  userId: idField,
  freeMonths: { bsonType: ["int", "long", "double"], minimum: 1 },
  at: { bsonType: "date" },
});
