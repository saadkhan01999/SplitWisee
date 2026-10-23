import { useState } from "react";
import { balanceMovements, monthlyStatement } from "@domain/platform-accounting/statement.js";
import { Button } from "../../../src/components/Button.jsx";
import { csvBlob } from "../../../src/utils/csv.js";
import { saveBlob } from "../../../src/utils/downloads.js";
import { formatMoney } from "../../../src/utils/format.js";
import { PdfReport } from "../../../src/utils/pdf.js";

async function statementPdf(report, rows) {
  const pdf = await PdfReport.create({
    label: "MONTHLY PLATFORM STATEMENT",
    subtitle: "PLATFORM ACCOUNTS · ACCOUNTANT REVIEW",
  });
  pdf.heading(`Statement for ${report.month}`);
  pdf.muted("Monthly movements only: opening balances, tax and accruals are not included.", 9);
  pdf.section("Summary");
  pdf.table(
    [
      { label: "Metric", width: 124 },
      { label: "Amount", width: 50, align: "right" },
    ],
    report.summary.map((row) => [row.metric, formatMoney(row.pence)]),
  );
  pdf.section("Debit / credit record");
  pdf.table(
    [
      { label: "Date · account · description", width: 84 },
      { label: "Debit", width: 30, align: "right" },
      { label: "Credit", width: 30, align: "right" },
      { label: "Running", width: 30, align: "right" },
    ],
    rows.map((row) => [
      `${row.date} · ${row.account} · ${row.description}`,
      formatMoney(row.debitPence),
      formatMoney(row.creditPence),
      formatMoney(row.runningMovementPence),
    ]),
  );
  if (report.exceptions.length) {
    pdf.section("Exceptions for accountant review");
    report.exceptions.forEach((exception) => pdf.text(`${exception.id}: ${exception.issue}`, { size: 9 }));
  }
  pdf.section("Notes");
  report.notes.forEach((note) => pdf.muted(note));
  return pdf.finish([
    "Prepared from recorded Stripe transactions and manual bank entries.",
    "Reconcile with original statements before filing.",
  ]);
}

/** Monthly statement PDF and debit/credit CSV for the accountant. */
export function StatementPanel({ report }) {
  const rows = monthlyStatement(report);
  const movements = balanceMovements(report);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function downloadPdf() {
    setBusy(true);
    setError("");
    try {
      saveBlob(await statementPdf(report, rows), `SplitWisee-${report.month}-Monthly-Statement.pdf`);
    } catch (failure) {
      setError(failure.message || "The statement PDF could not be created.");
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    saveBlob(
      csvBlob([
        ["SplitWisee debit / credit record", report.month, "GBP pence; no opening balances"],
        [
          "Date",
          "Reference",
          "Description",
          "Account",
          "Source",
          "Debit pence",
          "Credit pence",
          "Running movement pence",
        ],
        ...rows.map((row) => [
          row.date,
          row.reference,
          row.description,
          row.account,
          row.source,
          row.debitPence,
          row.creditPence,
          row.runningMovementPence,
        ]),
      ]),
      `SplitWisee-${report.month}-Debit-Credit.csv`,
    );
  }

  return (
    <section className="card statement-preview">
      <div className="section-heading wrap">
        <div>
          <h2>Monthly statement &amp; debit / credit record</h2>
          <p>{report.month} · GBP · for accountant review</p>
        </div>
        <div className="actions wrap">
          <Button disabled={busy} onClick={downloadPdf}>
            {busy ? "Preparing…" : "Statement PDF"}
          </Button>
          <Button variant="outline" onClick={downloadCsv}>
            Debit / credit CSV
          </Button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="caption">
        Running movements start at zero for the month and are kept separately for Stripe and bank records.
        They are not your bank balance.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Date / reference</th>
              <th scope="col">Account / description</th>
              <th scope="col">Debit</th>
              <th scope="col">Credit</th>
              <th scope="col">Running movement</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.reference}-${index}`}>
                <td>
                  {row.date}
                  <small>{row.reference}</small>
                </td>
                <td>
                  {row.account}
                  <small>{row.description}</small>
                </td>
                <td>{formatMoney(row.debitPence)}</td>
                <td>{formatMoney(row.creditPence)}</td>
                <td>{formatMoney(row.runningMovementPence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p>No recorded movements this month.</p>}
      </div>
      <details>
        <summary>Balance sheet movements</summary>
        <p>
          Asset and funding changes only. A full balance sheet also needs opening balances, liabilities, tax
          and accountant adjustments.
        </p>
        {movements.map((row) => (
          <div className="member-row" key={row.account}>
            <span className="grow">
              {row.account}
              <small>{row.section}</small>
            </span>
            <strong>{formatMoney(row.pence)}</strong>
          </div>
        ))}
      </details>
    </section>
  );
}
