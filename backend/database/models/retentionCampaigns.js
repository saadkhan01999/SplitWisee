import { aggregate, idField } from "./common.js";
export default aggregate(["id", "title", "message", "status"], { id: idField, status: { enum: ["draft"] } });
