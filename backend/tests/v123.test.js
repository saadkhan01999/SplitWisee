import test from "node:test";
import assert from "node:assert/strict";
import { isOperator } from "../src/routes/platform.js";

test("superadmin permits exactly one owner and fails closed for legacy lists", () => {
  const old = process.env.SUPERADMIN_USER_ID,
    legacy = process.env.OPERATOR_USER_IDS;
  try {
    process.env.SUPERADMIN_USER_ID = "owner";
    process.env.OPERATOR_USER_IDS = "other";
    assert.equal(isOperator({ id: "owner" }), true);
    assert.equal(isOperator({ id: "other" }), false);
    assert.equal(isOperator({ id: "household-admin", role: "owner" }), false);
    process.env.SUPERADMIN_USER_ID = "owner,other";
    assert.equal(isOperator({ id: "owner" }), false);
    delete process.env.SUPERADMIN_USER_ID;
    process.env.OPERATOR_USER_IDS = "owner,other";
    assert.equal(isOperator({ id: "owner" }), false);
    process.env.OPERATOR_USER_IDS = "owner";
    assert.equal(isOperator({ id: "owner" }), true);
  } finally {
    if (old === undefined) delete process.env.SUPERADMIN_USER_ID;
    else process.env.SUPERADMIN_USER_ID = old;
    if (legacy === undefined) delete process.env.OPERATOR_USER_IDS;
    else process.env.OPERATOR_USER_IDS = legacy;
  }
});
