import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { fileToDataUrl, prepareReceipt } from "./receiptFiles.js";
import { scanReceipt, ScanStopped } from "./scanner.js";

const UPLOAD_TIMEOUT_MS = 120_000;

const initialState = {
  attachment: null, // { id, name, mime, bytes } once the API has stored the original
  previewUrl: null,
  uploading: false,
  scanning: false,
  progress: 0,
  stage: "",
  scan: null, // parseReceipt() result
  canRescan: false,
  error: "",
};

/**
 * Attaches a receipt to a new expense: stores the original privately through the API and, in parallel, reads it
 * with the in-browser scanner. `onScanned(result)` lets the form pre-fill amount, merchant, date and items.
 */
export function useReceiptUpload(householdId, onScanned) {
  const [state, setState] = useState(initialState);
  const scanInput = useRef(null);
  const controller = useRef(null);
  const sequence = useRef(0); // latest scan run
  const fileSequence = useRef(0); // latest chosen file
  const onScannedRef = useRef(onScanned);

  useEffect(() => {
    onScannedRef.current = onScanned;
  });

  const update = (changes) => setState((current) => ({ ...current, ...changes }));

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const url = state.previewUrl;
    return () => url && URL.revokeObjectURL(url);
  }, [state.previewUrl]);

  const scan = useCallback(async (input) => {
    const run = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    update({ scanning: true, progress: 0, stage: "Preparing", scan: null });
    try {
      const result = await scanReceipt(input, {
        signal: abort.signal,
        onProgress: (progress, stage) => run === sequence.current && update({ progress, stage }),
      });
      if (run !== sequence.current) return;
      update({ scan: result });
      onScannedRef.current?.(result);
    } catch (failure) {
      if (run !== sequence.current) return;
      update({
        scan: {
          confidence: "none",
          amountPence: null,
          items: [],
          error: failure.message,
          stopped: failure instanceof ScanStopped,
        },
      });
    } finally {
      if (run === sequence.current) update({ scanning: false });
    }
  }, []);

  const choose = useCallback(
    async (file) => {
      if (!file) return;
      controller.current?.abort();
      sequence.current++;
      const fileRun = ++fileSequence.current;
      const current = () => fileRun === fileSequence.current;
      scanInput.current = null;
      setState({ ...initialState, uploading: true, stage: "Preparing receipt" });

      let prepared;
      try {
        prepared = await prepareReceipt(file);
      } catch (failure) {
        if (current()) setState({ ...initialState, error: failure.message });
        return;
      }
      if (!current()) {
        if (prepared.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
        return;
      }
      scanInput.current = prepared.scanInput;
      update({ previewUrl: prepared.previewUrl, canRescan: true });

      const upload = fileToDataUrl(prepared.original)
        .then((data) =>
          api.post(
            `/households/${encodeURIComponent(householdId)}/receipts`,
            { data, name: prepared.original.name },
            { timeout: UPLOAD_TIMEOUT_MS },
          ),
        )
        .then(
          (attachment) => current() && update({ attachment, uploading: false }),
          (failure) =>
            current() && update({ uploading: false, error: `The receipt was not saved: ${failure.message}` }),
        );
      await Promise.all([upload, scan(prepared.scanInput)]);
    },
    [householdId, scan],
  );

  const rescan = useCallback(() => scanInput.current && scan(scanInput.current), [scan]);
  const cancelScan = useCallback(() => controller.current?.abort(), []);
  const remove = useCallback(() => {
    controller.current?.abort();
    sequence.current++;
    fileSequence.current++;
    scanInput.current = null;
    setState(initialState);
  }, []);

  return { ...state, choose, rescan, cancelScan, remove };
}
