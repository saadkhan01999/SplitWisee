export const idField = { bsonType: "string" };
export const aggregate = (required, properties) => ({
  $jsonSchema: { bsonType: "object", required, properties },
});
