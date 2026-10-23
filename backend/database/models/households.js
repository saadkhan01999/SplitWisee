import { aggregate, idField } from "./common.js";
export default aggregate(["id", "name", "members", "expenses", "version"], {
  id: idField,
  name: { bsonType: "string" },
  rooms: {
    bsonType: "array",
    maxItems: 100,
    uniqueItems: true,
    items: { bsonType: "string", minLength: 1, maxLength: 60 },
  },
  members: {
    bsonType: "array",
    items: {
      bsonType: "object",
      required: ["id", "name", "role", "room", "joined"],
      properties: {
        id: idField,
        name: { bsonType: "string", maxLength: 80 },
        role: { enum: ["owner", "admin", "member"] },
        room: { bsonType: "string", maxLength: 60 },
        joined: { bsonType: "string" },
        left: { bsonType: "string" },
      },
    },
  },
  expenses: { bsonType: "array" },
  version: { bsonType: ["int", "long", "double"], minimum: 1 },
  currency: { enum: ["GBP"] },
});
