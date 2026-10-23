import fs from "node:fs";
import path from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toast } from "../src/components/Toast.jsx";
import { AppShell } from "../src/features/layout/AppShell.jsx";
import { parseReceipt } from "../src/features/receipts/parseReceipt.js";
import { household, user } from "./helpers/fixtures.js";
import { mockApi } from "./helpers/mockApi.js";
import { renderWithStore, signedInState } from "./helpers/render.jsx";

// jsdom has no canvas or OCR engine: the image preparation and scanner are replaced by the real parser applied
// to real Tesseract output for the same receipt (see ocr.integration.test.js).
vi.mock("../src/features/receipts/receiptFiles.js", async (importOriginal) => ({
  ...(await importOriginal()),
  prepareReceipt: vi.fn(async (file) => ({ original: file, scanInput: file, previewUrl: "blob:preview" })),
  fileToDataUrl: vi.fn(async () => "data:image/png;base64,iVBORw0KGgo="),
}));
vi.mock("../src/features/receipts/scanner.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanReceipt: vi.fn(async (_file, { onProgress }) => {
    onProgress(100, "Done");
    return parseReceipt(
      fs.readFileSync(path.join(import.meta.dirname, "fixtures/receipts/green-house.ocr.txt"), "utf8"),
    );
  }),
}));

const REWARDS = { code: "SW-TEST", url: "", freeMonths: 0, rewards: [], subscription: "Not subscribed" };

function setup(api = {}, data = household()) {
  let current = data;
  const mock = mockApi({
    "GET /account/rewards": () => REWARDS,
    "POST /households/h-test/actions": ({ body }) => {
      current = {
        ...current,
        version: current.version + 1,
        expenses: [{ ...body.payload, status: "approved", createdBy: user.id }, ...current.expenses],
      };
      return current;
    },
    ...api,
  });
  const ui = (
    <>
      <AppShell />
      <Toast />
    </>
  );
  return {
    api: mock,
    ...renderWithStore(ui, { preloadedState: signedInState({ tab: "expenses", household: data }) }),
  };
}

describe("expenses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records an expense split equally to the penny", async () => {
    const { api, user: person } = setup();
    await person.click(screen.getAllByRole("button", { name: "Add expense" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add an expense" });

    await person.type(within(dialog).getByLabelText("What was it for?"), "Pizza night");
    await person.type(within(dialog).getByLabelText("Total amount (£)"), "10");
    expect(within(dialog).getByText(/£10.00 fully allocated between 3 people/)).toBeInTheDocument();
    await person.click(within(dialog).getByRole("button", { name: /Save expense/ }));

    await waitFor(() => expect(api.called("POST", "/households/h-test/actions")).toHaveLength(1));
    const [{ body }] = api.called("POST", "/households/h-test/actions");
    expect(body).toMatchObject({ type: "expense", version: 4 });
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.payload).toMatchObject({
      title: "Pizza night",
      amountPence: 1000,
      purchasedBy: "u-owner",
      method: "equal",
      status: "submitted",
      funders: [{ memberId: "u-owner", amountPence: 1000 }],
    });
    expect(body.payload.allocations.map((row) => row.amountPence).sort()).toEqual([333, 333, 334]);
    expect(await screen.findByText("Expense saved")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("scans an uploaded receipt, requires a review, and splits it by item", async () => {
    const { api, user: person } = setup({
      "POST /households/h-test/receipts": ({ body }) => ({
        id: "r-1",
        name: body.name,
        mime: "image/png",
        bytes: 49697,
      }),
    });
    await person.click(screen.getAllByRole("button", { name: "Add expense" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add an expense" });

    const file = new File(["png"], "receipt.png", { type: "image/png" });
    await person.upload(dialog.querySelector('input[type="file"]:not([capture])'), file);

    expect(await within(dialog).findByText("Detected total: £14.50")).toBeInTheDocument();
    expect(within(dialog).getByText(/Original receipt saved privately/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("What was it for?")).toHaveValue("GREEN HOUSE MARKET");
    expect(within(dialog).getByLabelText("Total amount (£)")).toHaveValue("14.50");
    expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-10-16");

    await person.click(within(dialog).getByRole("button", { name: /Save expense/ }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("confirm you checked the scanned details");
    expect(api.called("POST", "/households/h-test/actions")).toHaveLength(0);

    await person.click(within(dialog).getByLabelText(/I checked the amount, date and items/));
    await person.selectOptions(within(dialog).getByLabelText("Split method"), "items");
    // Vegetables are only for Ben and Chloe.
    const vegetables = within(dialog).getByRole("group", { name: "Who shares item 3" });
    await person.click(within(vegetables).getByLabelText("Amira Shah"));
    await person.click(within(dialog).getByRole("button", { name: /Save expense/ }));

    await waitFor(() => expect(api.called("POST", "/households/h-test/actions")).toHaveLength(1));
    const { payload } = api.called("POST", "/households/h-test/actions")[0].body;
    expect(payload).toMatchObject({
      amountPence: 1450,
      method: "items",
      receipt: { id: "r-1", name: "receipt.png" },
    });
    expect(payload.receiptScan).toMatchObject({
      merchant: "GREEN HOUSE MARKET",
      amountPence: 1450,
      reviewed: true,
    });
    const shares = Object.fromEntries(payload.allocations.map((row) => [row.memberId, row.amountPence]));
    // Milk 2.50 → 84/83/83 and Bread 2.00 → 67/67/66 (spare pennies by member ID); Vegetables 10.00 → 500 each.
    expect(shares).toEqual({ "u-admin": 651, "u-member": 650, "u-owner": 149 });
    expect(api.called("POST", "/households/h-test/receipts")[0].body).toEqual({
      data: "data:image/png;base64,iVBORw0KGgo=",
      name: "receipt.png",
    });
  });

  it("keeps today's date when the receipt predates everyone joining the household", async () => {
    const newHousehold = household({
      members: household().members.map((member) => ({ ...member, joined: "2026-10-20" })),
    });
    const { user: person } = setup(
      { "POST /households/h-test/receipts": () => ({ id: "r-2", name: "receipt.png", mime: "image/png" }) },
      newHousehold,
    );
    await person.click(screen.getAllByRole("button", { name: "Add expense" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add an expense" });
    const today = within(dialog).getByLabelText("Date").value;
    await person.upload(
      dialog.querySelector('input[type="file"]:not([capture])'),
      new File(["png"], "receipt.png", { type: "image/png" }),
    );

    expect(
      await within(dialog).findByText(/dated 16 October 2026, before anyone had joined/),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Date")).toHaveValue(today);
    expect(within(dialog).getByText(/£14.50 fully allocated between 3 people/)).toBeInTheDocument();
  });

  it("explains why an invalid split cannot be saved", async () => {
    const { api, user: person } = setup();
    await person.click(screen.getAllByRole("button", { name: "Add expense" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add an expense" });
    await person.type(within(dialog).getByLabelText("What was it for?"), "Bills");
    await person.type(within(dialog).getByLabelText("Total amount (£)"), "90");
    await person.selectOptions(within(dialog).getByLabelText("Split method"), "percent");
    await person.type(within(dialog).getByLabelText("Amira Shah share (%)"), "50");
    await person.type(within(dialog).getByLabelText("Ben Carter share (%)"), "30");
    await person.type(within(dialog).getByLabelText("Chloe Diaz share (%)"), "10");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Percentages must add up to 100%.");
    await person.click(within(dialog).getByRole("button", { name: /Save expense/ }));
    expect(api.called("POST", "/households/h-test/actions")).toHaveLength(0);
  });

  it("filters the expense list and opens an expense record", async () => {
    const { user: person } = setup();
    expect(screen.getByText("2 records")).toBeInTheDocument();
    await person.type(screen.getByLabelText("Search expenses"), "cleaning");
    expect(screen.getByText("1 record")).toBeInTheDocument();
    await person.click(screen.getByRole("button", { name: /Cleaning supplies/ }));
    const dialog = await screen.findByRole("dialog", { name: "Expense details" });
    expect(within(dialog).getByRole("heading", { name: "Cleaning supplies" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
  });
});
