import { aggregate, idField } from "./common.js";
export default aggregate(["id", "ownerId", "kind", "source", "at"], {
  id: idField,
  ownerId: idField,
  kind: { enum: ["access"] },
  at: { bsonType: "date" },
});
