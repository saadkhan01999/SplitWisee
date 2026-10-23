import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { saveBlob, shareBlob } from "../../utils/downloads.js";
import { selectHousehold, selectMemberName } from "../household/householdSlice.js";
import { receiptUrl } from "./ReceiptEvidence.jsx";
import { receiptCsv, receiptFileBase, receiptJson, receiptPdf } from "./receiptRecord.js";

/** PDF (recommended), CSV, JSON and original-file downloads for one expense. */
export function ReceiptDownloads({ expense }) {
  const household = useSelector(selectHousehold);
  const memberName = useSelector(selectMemberName);
  const base = receiptFileBase(expense);
  const [pdf, setPdf] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let url;
    receiptPdf(expense, household, memberName)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPdf({ blob, url });
      })
      .catch(() => !cancelled && setError("The PDF could not be prepared. Try again or download the CSV."));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [expense, household, memberName]);

  async function run(task, success) {
    setError("");
    try {
      await task();
      setStatus(success);
    } catch (failure) {
      if (failure?.name === "AbortError") setStatus("Sharing cancelled. Your receipt is still available.");
      else
        setError(
          failure?.message || "The download could not start. Open the PDF preview and save it from there.",
        );
    }
  }

  return (
    <section className="receipt-downloads export-panel" aria-label="Download this record">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SAVE &amp; SHARE</span>
          <h3>Download this record</h3>
        </div>
        <span className="pill mint">PDF recommended</span>
      </div>
      <p>A clean record with the total, who paid and each person’s share.</p>
      <div className="export-primary">
        <button
          type="button"
          className="btn"
          disabled={!pdf}
          onClick={() =>
            run(() => saveBlob(pdf.blob, `${base}.pdf`), "PDF download started. Check Downloads or Files.")
          }
        >
          {pdf ? "Download PDF" : "Preparing PDF…"}
        </button>
        <button
          type="button"
          className="btn outline"
          disabled={!pdf}
          onClick={() =>
            run(() => shareBlob(pdf.blob, `${base}.pdf`, "Shared expense record"), "Ready to share.")
          }
        >
          Share PDF
        </button>
        {pdf && (
          <a className="btn text" href={pdf.url} target="_blank" rel="noreferrer">
            Open PDF preview
          </a>
        )}
      </div>
      <p className="caption">
        On iPhone use Share → Save to Files. If a download is blocked, open the preview and save it.
      </p>
      <div className="export-secondary">
        <button
          type="button"
          className="btn outline"
          onClick={() =>
            run(() => saveBlob(receiptCsv(expense, memberName), `${base}.csv`), "CSV download started.")
          }
        >
          Download CSV
        </button>
        <button
          type="button"
          className="btn outline"
          onClick={() =>
            run(() => saveBlob(receiptJson(expense, household), `${base}.json`), "JSON download started.")
          }
        >
          Download JSON
        </button>
        {expense.receipt && (
          <a
            className="btn outline"
            href={receiptUrl(household.id, expense.receipt.id)}
            download={expense.receipt.name}
          >
            Original receipt
          </a>
        )}
      </div>
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
