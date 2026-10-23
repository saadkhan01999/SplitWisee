import { aggregate, idField } from "./common.js";
export default aggregate(["id", "amountPence", "currency", "status"], {
  id: idField,
  amountPence: { bsonType: ["int", "long", "double"], minimum: 0 },
  currency: { bsonType: "string" },
  status: { bsonType: "string" },
});
