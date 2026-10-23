import { aggregate, idField } from "./common.js";
export default aggregate(["id", "subject", "status"], {
  id: idField,
  status: { enum: ["open", "resolved"] },
});
