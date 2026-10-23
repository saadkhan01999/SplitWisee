import { aggregate, idField } from "./common.js";
export default aggregate(["id", "userId", "expiresAt"], {
  id: idField,
  userId: idField,
  expiresAt: { bsonType: "date" },
});
