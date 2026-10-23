import { Button } from "../../components/Button.jsx";
import { Checkbox } from "../../components/Field.jsx";
import { Icon } from "../../components/Icon.jsx";
import { formatMoney } from "../../utils/format.js";

function ScanSummary({ scan, reviewed, onReviewedChange }) {
  if (scan.error)
    return (
      <div className="scan-result" role="status">
        <strong>{scan.stopped ? "Scan stopped" : "The receipt could not be read"}</strong>
        <p>{scan.error} You can still enter the details yourself.</p>
      </div>
    );

  const found = [
    scan.merchant && `merchant ${scan.merchant}`,
    scan.date && `date ${scan.date}`,
    scan.items?.length && `${scan.items.length} ${scan.items.length === 1 ? "item" : "items"}`,
  ].filter(Boolean);

  return (
    <div className={`scan-result ${scan.confidence === "high" ? "confident" : ""}`.trim()} role="status">
      <strong>
        {scan.amountPence ? `Detected total: ${formatMoney(scan.amountPence)}` : "Total not found"}
      </strong>
      <p>
        {scan.amountPence
          ? scan.ambiguous
            ? "Several possible totals were found. Compare the amount with your receipt."
            : "Check the amount and details below against your receipt before saving."
          : "Enter the total from your receipt."}
        {found.length > 0 && ` Also found: ${found.join(", ")}.`}
      </p>
      {scan.items?.length > 0 && (
        <p className="caption">
          {scan.itemsMatchTotal
            ? "✓ The scanned items add up to the total. Choose “By receipt item” to split them."
            : "The scanned items do not add up to the total. Check for missed lines or discounts before splitting by item."}
        </p>
      )}
      <Checkbox checked={reviewed} onChange={onReviewedChange}>
        I checked the amount, date and items against my original receipt.
      </Checkbox>
      {scan.text && (
        <details>
          <summary>View scanned text</summary>
          <pre className="ocr-text">{scan.text}</pre>
        </details>
      )}
    </div>
  );
}

/** Choose or photograph a receipt, follow the upload and scan, and confirm what was read. */
export function ReceiptCapture({ upload, reviewed, onReviewedChange }) {
  const busy = upload.scanning || upload.uploading;
  const pick = (event) => {
    upload.choose(event.target.files[0]);
    event.target.value = "";
  };

  return (
    <div className="receipt-capture">
      <div className="receipt-pickers">
        <label className={`upload ${busy ? "disabled" : ""}`.trim()}>
          <Icon name="camera" size={27} />
          <strong>{upload.attachment ? upload.attachment.name : "Add your receipt"}</strong>
          <span>JPEG, PNG, WebP or PDF · up to 12 MB</span>
          <input
            type="file"
            disabled={busy}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={pick}
          />
        </label>
        <label className={`btn outline camera-capture ${busy ? "disabled" : ""}`.trim()}>
          <Icon name="camera" /> Take photo
          <input type="file" disabled={busy} accept="image/*" capture="environment" onChange={pick} />
        </label>
      </div>

      {upload.previewUrl && (
        <img className="upload-receipt-preview" src={upload.previewUrl} alt="Receipt to be scanned" />
      )}

      {upload.uploading && !upload.scanning && (
        <p className="caption" role="status">
          Saving the original receipt securely…
        </p>
      )}
      {upload.attachment && !upload.uploading && (
        <p className="caption green">✓ Original receipt saved privately to this household.</p>
      )}

      {upload.scanning && (
        <div className="notice scan-progress" role="status">
          <span>
            Reading your receipt… {upload.progress}%<small>{upload.stage} · keep this page open</small>
          </span>
          <progress max="100" value={upload.progress} aria-label="Scan progress" />
          <Button variant="text" onClick={upload.cancelScan}>
            Cancel scan
          </Button>
        </div>
      )}

      {upload.scan && !upload.scanning && (
        <ScanSummary scan={upload.scan} reviewed={reviewed} onReviewedChange={onReviewedChange} />
      )}

      {upload.error && (
        <p className="error" role="alert">
          {upload.error}
        </p>
      )}

      {(upload.previewUrl || upload.attachment || upload.scan) && !busy && (
        <div className="actions wrap">
          {upload.canRescan && (
            <Button variant="text" onClick={upload.rescan}>
              Scan again
            </Button>
          )}
          <Button variant="text" danger onClick={upload.remove}>
            Remove receipt
          </Button>
        </div>
      )}
    </div>
  );
}
