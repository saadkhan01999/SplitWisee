import { describe, expect, it } from "vitest";
import {
  computeAllocation,
  computeFunders,
  eligibleMembers,
  itemAllocation,
  linePence,
} from "../src/features/expenses/expenseDraft.js";

describe("expense form rules", () => {
  it("splits £10 three ways to the exact penny", () => {
    const rows = computeAllocation({
      amount: "10.00",
      method: "equal",
      selected: ["a", "b", "c"],
      values: {},
      items: [],
    });
    expect(rows.map((row) => row.amountPence)).toEqual([334, 333, 333]);
    expect(rows.reduce((sum, row) => sum + row.amountPence, 0)).toBe(1000);
  });

  it("validates percentage and fixed splits", () => {
    expect(() =>
      computeAllocation({
        amount: "90",
        method: "percent",
        selected: ["a", "b"],
        values: { a: "50", b: "40" },
        items: [],
      }),
    ).toThrow("Percentages must add up to 100%.");
    const fixed = computeAllocation({
      amount: "90",
      method: "fixed",
      selected: ["a", "b"],
      values: { a: "60", b: "30" },
      items: [],
    });
    expect(fixed).toEqual([
      { memberId: "a", amountPence: 6000 },
      { memberId: "b", amountPence: 3000 },
    ]);
  });

  it("splits receipt items between the people who shared each line, including discounts", () => {
    const items = [
      { title: "Milk", amount: "2.00", members: ["a", "b"] },
      { title: "Wine", amount: "9.00", members: ["b"] },
      { title: "Multibuy saving", amount: "-1.00", members: ["b"] },
    ];
    expect(itemAllocation(items, 1000)).toEqual([
      { memberId: "a", amountPence: 100 },
      { memberId: "b", amountPence: 900 },
    ]);
  });

  it("explains why an item split cannot be saved", () => {
    expect(() => itemAllocation([{ title: "Milk", amount: "2.00", members: ["a"] }], 300)).toThrow(
      "The items add up to £2.00 but the total is £3.00.",
    );
    expect(() => itemAllocation([{ title: "Milk", amount: "2.00", members: [] }], 200)).toThrow(
      "Choose who shares “Milk”.",
    );
    expect(() =>
      itemAllocation(
        [
          { title: "Bread", amount: "1.00", members: ["a"] },
          { title: "Voucher", amount: "-2.00", members: ["b"] },
          { title: "Tea", amount: "3.00", members: ["a"] },
        ],
        200,
      ),
    ).toThrow(/discount is larger/);
    expect(linePence("-£0.50")).toBe(-50);
  });

  it("credits a single funder with the full amount and checks multiple funders add up", () => {
    expect(computeFunders([{ memberId: "a", value: "" }], 9000)).toEqual([
      { memberId: "a", amountPence: 9000 },
    ]);
    expect(
      computeFunders(
        [
          { memberId: "salman", value: "60" },
          { memberId: "ahmed", value: "30" },
        ],
        9000,
      ),
    ).toHaveLength(2);
    expect(() =>
      computeFunders(
        [
          { memberId: "a", value: "50" },
          { memberId: "b", value: "30" },
        ],
        9000,
      ),
    ).toThrow("Funding adds up to £80.00; it must equal the total.");
    expect(() =>
      computeFunders(
        [
          { memberId: "a", value: "45" },
          { memberId: "a", value: "45" },
        ],
        9000,
      ),
    ).toThrow("Each funder can only be listed once.");
  });

  it("only offers members who belonged to the household on the expense date", () => {
    const members = [
      { id: "early", joined: "2026-01-01" },
      { id: "late", joined: "2026-06-01" },
      { id: "gone", joined: "2026-01-01", left: "2026-03-01" },
    ];
    expect(eligibleMembers(members, "2026-04-01").map((member) => member.id)).toEqual(["early"]);
    expect(eligibleMembers(members, "2026-02-01").map((member) => member.id)).toEqual(["early", "gone"]);
  });
});
