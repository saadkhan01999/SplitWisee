import { allocate } from "@domain/calculation-engine/index.js";

// Fictional records for tests only. Nothing here is used by the application.

export const user = {
  id: "u-owner",
  name: "Amira Shah",
  email: "amira@example.test",
  operator: false,
  profile: {},
};

export const members = [
  { id: "u-owner", name: "Amira Shah", role: "owner", room: "Room 1", joined: "2026-01-01" },
  { id: "u-admin", name: "Ben Carter", role: "admin", room: "Room 2", joined: "2026-01-01" },
  { id: "u-member", name: "Chloe Diaz", role: "member", room: "Room 2", joined: "2026-01-01" },
];

function expense(id, title, date, amountPence, funderId, status = "approved") {
  return {
    id,
    title,
    date,
    category: "Groceries",
    amountPence,
    purchasedBy: funderId,
    createdBy: funderId,
    method: "equal",
    status,
    funders: [{ memberId: funderId, amountPence }],
    allocations: allocate(
      amountPence,
      members.map((member) => ({ memberId: member.id })),
    ),
  };
}

export function household(overrides = {}) {
  return {
    id: "h-test",
    name: "Maple House",
    type: "house",
    version: 4,
    currency: "GBP",
    settings: { approvals: false, requireReceipts: false },
    rooms: ["Room 1", "Room 2"],
    members: structuredClone(members),
    expenses: [
      expense("e-1", "Weekly shop", "2026-09-05", 9000, "u-owner"),
      expense("e-2", "Cleaning supplies", "2026-09-12", 2400, "u-admin"),
    ],
    closings: [],
    audit: [
      {
        id: "a-1",
        actorId: "u-owner",
        action: "household created",
        detail: "Maple House",
        at: "2026-01-01T09:00:00.000Z",
      },
    ],
    ...overrides,
  };
}
