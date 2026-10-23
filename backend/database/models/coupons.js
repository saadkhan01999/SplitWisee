import { aggregate } from "./common.js";
export default aggregate(["code", "limit", "used", "expires", "active"], {
  code: { bsonType: "string" },
  limit: { bsonType: ["int", "long", "double"], minimum: 1 },
  used: { bsonType: ["int", "long", "double"], minimum: 0 },
  active: { bsonType: "bool" },
  expires: { bsonType: "string" },
});
