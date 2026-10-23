import { aggregate, idField } from "./common.js";
export default aggregate(["id", "householdId", "uploaderId"], {
  id: idField,
  householdId: idField,
  uploaderId: idField,
  mime: { enum: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
  checksum: { bsonType: "string" },
  bytes: { bsonType: ["int", "long", "double"], minimum: 0 },
});
