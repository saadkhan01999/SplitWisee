import { allocate } from "../../src/modules/calculation-engine/index.js";

/**
 * Test-only household used by the ledger and permission tests. It is never imported by application code and never
 * written to a real database. Eight members in four rooms, owner m1 and admin m2, approved October 2026 expenses.
 */
export function householdFixture() {
  const names = ["Kiran", "Jawaria", "Aisha", "Fatima", "Maryam", "Zainab", "Hafsa", "Amina"];
  const members = names.map((name, index) => ({
    id: `m${index + 1}`,
    name,
    role: index === 0 ? "owner" : index === 1 ? "admin" : "member",
    room: `Room ${Math.floor(index / 2) + 1}`,
    joined: "2026-01-01",
  }));
  const everyone = members.map((member) => member.id);
  const rows = [
    ["Weekly groceries", "2026-10-14", 9068, "Groceries", "m2", [["m1", 6000], ["m2", 3068]], everyone],
    ["October broadband", "2026-10-12", 3200, "Bills", "m1", [["m1", 3200]], everyone],
    ["Kitchen essentials", "2026-10-10", 2475, "Household", "m3", [["m3", 2475]], everyone],
    ["Room 2 light bulbs", "2026-10-09", 1290, "Household", "m4", [["m4", 1290]], ["m3", "m4"]],
    ["Pizza night", "2026-10-08", 4800, "Food & drink", "m5", [["m5", 4800]], ["m1", "m2", "m5", "m6"]],
    ["Electricity top-up", "2026-10-06", 8000, "Bills", "m1", [["m1", 8000]], everyone],
    ["Milk & breakfast", "2026-10-04", 1850, "Groceries", "m6", [["m6", 1850]], everyone],
    ["Cleaning supplies", "2026-10-02", 2400, "Household", "m3", [["m3", 2400]], everyone],
  ];
  return {
    id: "household-fixture",
    name: "The Green House",
    type: "house",
    version: 1,
    currency: "GBP",
    settings: { approvals: false, requireReceipts: false },
    members,
    expenses: rows.map(([title, date, amountPence, category, purchasedBy, funders, sharedBy], index) => ({
      id: `expense-${index}`,
      title,
      date,
      amountPence,
      category,
      purchasedBy,
      createdBy: purchasedBy,
      uploadedBy: purchasedBy,
      funders: funders.map(([memberId, amount]) => ({ memberId, amountPence: amount })),
      allocations: allocate(
        amountPence,
        sharedBy.map((memberId) => ({ memberId })),
      ),
      method: "equal",
      status: "approved",
      receipt: null,
      createdAt: `${date}T12:00:00Z`,
    })),
    closings: [],
    audit: [{ id: "created", actorId: "m1", action: "household created", detail: "Test fixture", at: "2026-10-01T09:00:00Z" }],
  };
}
