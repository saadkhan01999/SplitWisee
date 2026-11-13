import { aggregate, idField } from "./common.js";
// Household invitation history for the platform audit. Recipient addresses are never stored here.
export default aggregate(["id", "status", "householdId", "at"], {
  id: idField,
  status: { enum: ["created", "accepted"] },
  householdId: idField,
  invitedBy: idField,
  userId: idField,
  at: { bsonType: "date" },
});
