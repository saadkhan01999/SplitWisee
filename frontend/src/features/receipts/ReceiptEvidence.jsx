import { useState } from "react";
import { apiUrl } from "../../api/client.js";
import { formatMoney } from "../../utils/format.js";
import { formatItemAmount } from "./receiptRecord.js";

export const receiptUrl = (householdId, receiptId, { inline = false } = {}) =>
  apiUrl(
    `/households/${encodeURIComponent(householdId)}/receipts/${encodeURIComponent(receiptId)}${inline ? "?inline=1" : ""}`,
  );

/** The uploaded original (served privately by the API) next to what the scanner read from it. */
export function ReceiptEvidence({ expense, householdId }) {
  const { receipt, receiptScan: scan } = expense;
  const [previewFailed, setPreviewFailed] = useState(false);
  if (!receipt && !scan) return null;

  const inlineUrl = receipt && receiptUrl(householdId, receipt.id, { inline: true });
  const isImage = receipt?.mime?.startsWith("image/");
  const items = scan?.items ?? [];

  return (
    <section className="card receipt-evidence">
      <div className="section-heading">
        <h3>Original receipt &amp; scan details</h3>
        {scan && <span className="pill">{scan.reviewed ? "Reviewed by member" : "Review needed"}</span>}
      </div>
      <p className="caption">
        Compare the saved expense with the uploaded file. Scanned values can contain errors.
      </p>

      {receipt ? (
        <>
          <div className="receipt-source">
            {isImage && !previewFailed ? (
              <a href={inlineUrl} target="_blank" rel="noreferrer">
                <img
                  src={inlineUrl}
                  alt={`Original receipt: ${receipt.name}`}

                  onError={() => setPreviewFailed(true)}
                />
              </a>
            ) : (
              <p>
                {previewFailed
                  ? "The preview could not be shown. Open or download the original below."
                  : `Attached document: ${receipt.name}`}
              </p>
            )}
          </div>
          <div className="actions wrap">
            <a className="btn outline" href={inlineUrl} target="_blank" rel="noreferrer">
              Open full receipt
            </a>
            <a className="btn outline" href={receiptUrl(householdId, receipt.id)} download={receipt.name}>
              Download original file
            </a>
          </div>
        </>
      ) : (
        <p>No original file is attached to this record.</p>
      )}

      {scan && (
        <>
          <dl className="receipt-meta">
            <div>
              <dt>Detected merchant</dt>
              <dd>{scan.merchant || "Not detected"}</dd>
            </div>
            <div>
              <dt>Detected date</dt>
              <dd>{scan.date || "Not detected"}</dd>
            </div>
            <div>
              <dt>Receipt number</dt>
              <dd>{scan.receiptNumber || "Not detected"}</dd>
            </div>
            <div>
              <dt>Detected total</dt>
              <dd>{scan.amountPence != null ? formatMoney(scan.amountPence) : "Not detected"}</dd>
            </div>
            {scan.taxPence != null && (
              <div>
                <dt>VAT shown</dt>
                <dd>{formatMoney(scan.taxPence)}</dd>
              </div>
            )}
          </dl>
          {items.length > 0 && (
            <details open>
              <summary>Scanned purchase items ({items.length})</summary>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={`${item.title}-${index}`}>
                        <td>{item.title}</td>
                        <td>{formatItemAmount(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <details>
            <summary>Scanned text</summary>
            <pre className="ocr-text">{scan.text || "No text recognised."}</pre>
          </details>
          <p className="caption">
            The saved expense amount is what counts. Scanned values are kept for comparison and never change
            the ledger by themselves.
          </p>
        </>
      )}
    </section>
  );
}
