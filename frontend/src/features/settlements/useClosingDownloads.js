import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toastShown } from "../../app/uiSlice.js";
import { saveBlob, shareBlob } from "../../utils/downloads.js";
import { selectHousehold } from "../household/householdSlice.js";
import { closingFilename, closingSheetCsv, closingSheetJson, closingSheetPdf } from "./closingSheet.js";

/** Downloads a closing sheet as PDF (share sheet on phones), CSV or JSON. */
export function useClosingDownloads() {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const [busy, setBusy] = useState(null);

  async function download(format, closing) {
    setBusy(`${closing.id}:${format}`);
    try {
      if (format === "pdf")
        await shareBlob(
          await closingSheetPdf(household, closing),
          closingFilename(household, closing, "pdf"),
          "Closing sheet",
        );
      else if (format === "csv")
        saveBlob(closingSheetCsv(household, closing), closingFilename(household, closing, "csv"));
      else saveBlob(closingSheetJson(household, closing), closingFilename(household, closing, "json"));
    } catch (failure) {
      if (failure?.name !== "AbortError")
        dispatch(toastShown(failure?.message || "The closing sheet could not be created."));
    } finally {
      setBusy(null);
    }
  }

  return { download, busy: (closing, format) => busy === `${closing.id}:${format}` };
}
