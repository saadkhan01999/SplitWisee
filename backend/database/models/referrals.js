import { aggregate, idField } from "./common.js";
export default aggregate(["id", "ownerId", "referredUserId", "kind", "at"], {
  id: idField,
  ownerId: idField,
  referredUserId: idField,
  kind: { enum: ["access", "invoice"] },
  at: { bsonType: "date" },
});
