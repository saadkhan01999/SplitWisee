import { aggregate, idField } from "./common.js";
export default aggregate(["id", "actorId", "action", "at"], {
  id: idField,
  actorId: idField,
  at: { bsonType: "date" },
});
