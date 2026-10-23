import { aggregate, idField } from "./common.js";
export default aggregate(["id", "type", "status"], { id: idField });
