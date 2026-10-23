import { aggregate, idField } from "./common.js";
export default aggregate(["id"], { id: idField });
