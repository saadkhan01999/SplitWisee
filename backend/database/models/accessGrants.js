import { aggregate, idField } from "./common.js";
export default aggregate(["id", "ownerId", "kind", "at"], {
  id: idField,
  ownerId: idField,
  kind: { enum: ["access"] },
  at: { bsonType: "date" },
});
