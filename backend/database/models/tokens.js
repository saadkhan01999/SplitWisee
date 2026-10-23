import { aggregate, idField } from "./common.js";
export default aggregate(["id", "type", "expiresAt"], {
  id: idField,
  type: { bsonType: "string" },
  expiresAt: { bsonType: "date" },
});
