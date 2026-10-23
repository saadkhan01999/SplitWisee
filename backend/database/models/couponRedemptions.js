import { aggregate, idField } from "./common.js";
export default aggregate(["id", "code", "userId", "at"], {
  id: idField,
  userId: idField,
  at: { bsonType: "date" },
});
