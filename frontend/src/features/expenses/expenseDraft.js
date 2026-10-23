import { allocate, money, sum } from "@domain/calculation-engine/index.js";
import { formatMoney } from "../../utils/format.js";

// Pure rules behind the expense form. Money uses the same exact-pence helpers as the API, so the preview the
// member sees is exactly what the server will accept.

export const SPLIT_METHODS = [
  { id: "equal", label: "Equally" },
  { id: "fixed", label: "Fixed amounts", placeholder: "£" },
  { id: "percent", label: "Percentages", placeholder: "%" },
  { id: "weight", label: "Weighted shares", placeholder: "Units" },
  { id: "items", label: "By receipt item" },
];

/** Members who belonged to the household on `date` (joined on or before it and not yet left). */
export const eligibleMembers = (members, date) =>
  members.filter((member) => member.joined <= date && (!member.left || member.left >= date));

/** "2.50" → 250, "-0.50" → -50 (receipt lines can be discounts). */
export function linePence(amount) {
  const text = String(amount).trim().replace("£", "");
  return text.startsWith("-") ? -money(text.slice(1)) : money(text);
}

/**
 * Splits each receipt line equally between the members chosen for it. Discount lines (negative) reduce the
 * shares of the members they are assigned to. Lines must add up to the expense total.
 */
export function itemAllocation(items, totalPence) {
  if (!items.length) throw new Error("Add the receipt items to split by item.");
  const shares = new Map();
  let itemsTotal = 0;
  items.forEach((item, index) => {
    const label = item.title?.trim() || `item ${index + 1}`;
    if (!item.members.length) throw new Error(`Choose who shares “${label}”.`);
    let pence;
    try {
      pence = linePence(item.amount);
    } catch {
      throw new Error(`Enter a valid amount for “${label}”.`);
    }
    itemsTotal += pence;
    const sign = Math.sign(pence);
    for (const { memberId, amountPence } of allocate(
      Math.abs(pence),
      item.members.map((memberId) => ({ memberId })),
    ))
      shares.set(memberId, (shares.get(memberId) ?? 0) + sign * amountPence);
  });
  if (itemsTotal !== totalPence)
    throw new Error(
      `The items add up to ${formatMoney(itemsTotal)} but the total is ${formatMoney(totalPence)}.`,
    );
  if ([...shares.values()].some((pence) => pence < 0))
    throw new Error("A discount is larger than the items shared by the same people. Change who shares it.");
  return [...shares]
    .filter(([, pence]) => pence > 0)
    .map(([memberId, amountPence]) => ({ memberId, amountPence }));
}

/** Cost shares for the chosen split. Throws a user-facing message when the inputs are incomplete or invalid. */
export function computeAllocation({ amount, method, selected, values, items }) {
  const totalPence = money(amount);
  if (method === "items") return itemAllocation(items, totalPence);
  return allocate(
    totalPence,
    selected.map((memberId) => ({ memberId, value: values[memberId] })),
    method,
  );
}

/** Actual funders. A single funder with no amount entered paid the full total. */
export function computeFunders(funders, totalPence) {
  const rows = funders.map((funder) => ({
    memberId: funder.memberId,
    amountPence: funders.length === 1 && !String(funder.value).trim() ? totalPence : money(funder.value),
  }));
  if (new Set(rows.map((row) => row.memberId)).size !== rows.length)
    throw new Error("Each funder can only be listed once.");
  if (sum(rows.map((row) => row.amountPence)) !== totalPence)
    throw new Error(
      `Funding adds up to ${formatMoney(sum(rows.map((row) => row.amountPence)))}; it must equal the total.`,
    );
  return rows;
}

export const penceToInput = (pence) => (pence / 100).toFixed(2);
