import { aggregate, idField } from "./common.js";
export default aggregate(["id", "name"], {
  id: idField,
  name: { bsonType: "string", minLength: 1, maxLength: 80 },
  referralCode: { bsonType: "string" },
  profile: {
    bsonType: "object",
    properties: {
      bio: { bsonType: "string", maxLength: 240 },
      timeZone: { bsonType: "string" },
      monthEndReminders: { bsonType: "bool" },
    },
  },
  email: { bsonType: "string" },
  phone: { bsonType: "string" },
  createdAt: { bsonType: "date" },
  verifiedAt: { bsonType: ["date", "null"] },
});
