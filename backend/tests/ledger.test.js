import test from "node:test";
import assert from "node:assert/strict";
import {
  allocate,
  money,
  sum,
  balances,
  netTransfers,
  applyAction,
} from "../src/modules/calculation-engine/index.js";
import { householdFixture } from "./fixtures/household.js";
import { cleanExpense, requireMember } from "../src/routes/households.js";
const fixture = () => {
  const s = householdFixture();
  s.members = s.members.slice(0, 3);
  s.expenses = [
    {
      id: "a",
      title: "Groceries",
      date: "2026-10-01",
      amountPence: 9000,
      status: "approved",
      purchasedBy: "m2",
      createdBy: "m2",
      funders: [
        { memberId: "m1", amountPence: 6000 },
        { memberId: "m2", amountPence: 3000 },
      ],
      allocations: allocate(
        9000,
        ["m1", "m2", "m3"].map((memberId) => ({ memberId })),
      ),
    },
    {
      id: "b",
      title: "Cleaning",
      date: "2026-10-02",
      amountPence: 2400,
      status: "approved",
      purchasedBy: "m3",
      createdBy: "m3",
      funders: [{ memberId: "m3", amountPence: 2400 }],
      allocations: allocate(
        2400,
        ["m2", "m3"].map((memberId) => ({ memberId })),
      ),
    },
  ];
  return s;
};

test("PRD exact worked example credits actual funders, not shopper", () => {
  const s = fixture();
  assert.deepEqual(
    balances(s).map((r) => r.net),
    [3000, -1200, -1800],
  );
  assert.deepEqual(netTransfers(balances(s)), [
    { from: "m3", to: "m1", amountPence: 1800 },
    { from: "m2", to: "m1", amountPence: 1200 },
  ]);
});
test("equal penny allocation deterministic regardless of selection order", () => {
  assert.deepEqual(allocate(1000, [{ memberId: "c" }, { memberId: "a" }, { memberId: "b" }]), [
    { memberId: "a", amountPence: 334 },
    { memberId: "b", amountPence: 333 },
    { memberId: "c", amountPence: 333 },
  ]);
});
test("property: 2000 varying allocations conserve every penny", () => {
  for (let n = 1; n <= 2000; n++) {
    const rs = Array.from({ length: (n % 8) + 1 }, (_, i) => ({ memberId: "m" + i, value: i + 1 }));
    assert.equal(sum(allocate(n, rs).map((x) => x.amountPence)), n);
    assert.equal(sum(allocate(n, rs, "weight").map((x) => x.amountPence)), n);
  }
});
test("fixed and percentage validation", () => {
  assert.equal(
    sum(
      allocate(
        999,
        [
          { memberId: "a", value: "30" },
          { memberId: "b", value: "70" },
        ],
        "percent",
      ).map((x) => x.amountPence),
    ),
    999,
  );
  assert.throws(() => allocate(100, [{ memberId: "a", value: "0.99" }], "fixed"));
  assert.throws(() => allocate(100, [{ memberId: "a", value: "99" }], "percent"));
  assert.throws(() => allocate(100, [{ memberId: "a", value: "-1" }], "weight"));
});
test("amount parser rejects fractional pennies and scientific notation", () => {
  assert.equal(money("1.01"), 101);
  for (const a of ["1.001", "1e2", "-1", "0", "Infinity"]) assert.throws(() => money(a));
});
test("unselected members have no cost share", () => {
  const s = fixture();
  assert.equal(balances({ ...s, expenses: [s.expenses[1]] })[0].share, 0);
});
test("closing permissions, overlap, and locks", () => {
  const s = fixture();
  assert.throws(() =>
    applyAction(s, { type: "close", payload: { start: "2026-10-01", end: "2026-10-31" } }, "m3"),
  );
  const next = applyAction(s, { type: "close", payload: { start: "2026-10-01", end: "2026-10-31" } }, "m1");
  assert.throws(() =>
    applyAction(next, { type: "close", payload: { start: "2026-10-02", end: "2026-11-30" } }, "m1"),
  );
  assert.throws(() => applyAction(next, { type: "expense", payload: { ...s.expenses[0], id: "x" } }, "m1"));
});
test("sent is not received; recipient confirmation applies only once", () => {
  let s = applyAction(
    fixture(),
    { type: "close", payload: { start: "2026-10-01", end: "2026-10-31" } },
    "m1",
  );
  const c = s.closings[0],
    p = c.payments[0],
    payload = { closingId: c.id, id: p.id, status: "sent" };
  assert.throws(() => applyAction(s, { type: "payment", payload }, "m2"));
  s = applyAction(s, { type: "payment", payload }, p.from);
  assert.deepEqual(
    balances(s).map((r) => r.net),
    [3000, -1200, -1800],
  );
  assert.throws(() =>
    applyAction(s, { type: "payment", payload: { ...payload, status: "received" } }, p.from),
  );
  s = applyAction(s, { type: "payment", payload: { ...payload, status: "received" } }, p.to);
  assert.deepEqual(
    balances(s).map((r) => r.net),
    [1200, -1200, 0],
  );
  const again = applyAction(s, { type: "payment", payload: { ...payload, status: "received" } }, p.to);
  assert.deepEqual(again, s);
  assert.equal(sum(balances(s).map((r) => r.net)), 0);
  assert.equal(sum(s.expenses.map((e) => e.amountPence)), 11400);
});
test("reversal preserves locked original and neutralises matching shares", () => {
  let s = applyAction(
    fixture(),
    { type: "close", payload: { start: "2026-10-01", end: "2026-10-31" } },
    "m1",
  );
  const before = structuredClone(s.expenses);
  s = applyAction(
    s,
    { type: "reverse", payload: { id: "a", date: "2026-11-01", reason: "Full refund" } },
    "m1",
  );
  assert.deepEqual(s.expenses.slice(1), before);
  assert.equal(sum(balances(s).map((r) => r.funded)), 2400);
  assert.throws(() =>
    applyAction(s, { type: "reverse", payload: { id: "a", date: "2026-11-01", reason: "again" } }, "m1"),
  );
});
test("pending and disputed expenses block closing", () => {
  for (const status of ["draft", "pending", "disputed"]) {
    const s = fixture();
    s.expenses[0].status = status;
    assert.throws(() =>
      applyAction(s, { type: "close", payload: { start: "2026-10-01", end: "2026-10-31" } }, "m1"),
    );
  }
});
test("joining date blocks retroactive member allocation", () => {
  const s = fixture();
  s.members[2].joined = "2026-10-20";
  assert.throws(() => applyAction(s, { type: "expense", payload: { ...s.expenses[0], id: "new" } }, "m1"));
});
test("cross-household access denied and inactive membership denied", () => {
  const s = fixture();
  assert.throws(() => requireMember(s, "stranger"));
  s.members[0].left = "2026-10-10";
  assert.throws(() => requireMember(s, "m1"));
  assert.equal(requireMember(s, "m2").id, "m2");
});
test("server strips forged approved/reversal/creator and arbitrary receipt data", () => {
  const e = cleanExpense({
    ...fixture().expenses[0],
    reversalOf: "fake",
    createdBy: "victim",
    status: "approved",
    receipt: { data: "data:text/html,bad" },
    allocations: [],
  });
  assert.equal(e.status, "submitted");
  assert.equal(e.reversalOf, undefined);
  assert.equal(e.createdBy, undefined);
  assert.equal(e.receipt, null);
});
test("fixture household ledger reconciles", () => {
  const rs = balances(householdFixture());
  assert.equal(sum(rs.map((r) => r.net)), 0);
  assert.equal(sum(rs.map((r) => r.funded)), sum(rs.map((r) => r.share)));
  assert.ok(netTransfers(rs).length <= 7);
});
