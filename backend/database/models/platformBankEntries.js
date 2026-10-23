import { aggregate, idField } from "./common.js";
export default aggregate(["id", "date", "kind", "amountPence"], {
  id: idField,
  date: { bsonType: "string" },
  kind: { enum: ["income", "expense"] },
  amountPence: { bsonType: ["int", "long", "double"], minimum: 1 },
});
