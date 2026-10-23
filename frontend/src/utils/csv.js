// CSV helpers. Text that a spreadsheet would run as a formula (starting with =, +, -, @, tab or carriage return) is
// prefixed with an apostrophe so an exported description can never execute in Excel or Sheets. Plain numbers,
// including negative amounts such as refunds, are left as numbers.

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  const text = value !== null && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  const safe = FORMULA_START.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export const csvText = (rows) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

/** UTF-8 with a byte-order mark so Excel shows £ correctly. */
export const csvBlob = (rows) =>
  new Blob([BYTE_ORDER_MARK + csvText(rows)], { type: "text/csv;charset=utf-8" });
