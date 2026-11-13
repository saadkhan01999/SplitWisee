import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { dialogOpened } from "../../app/uiSlice.js";
import { Button } from "../../components/Button.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { formatDate, formatMoney, formatShortDate } from "../../utils/format.js";
import { selectHousehold } from "../household/householdSlice.js";
import { closingName, closingStatus, closingTotal } from "../settlements/closingSheet.js";
import { useClosingDownloads } from "../settlements/useClosingDownloads.js";

/** Reports > Settlement history: every locked period, newest first, with its frozen closing sheet. */
export function SettlementHistory() {
  const dispatch = useDispatch();
  const household = useSelector(selectHousehold);
  const { download, busy } = useClosingDownloads();
  const [year, setYear] = useState("all");
  const [status, setStatus] = useState("all");

  const closings = [...household.closings].sort((a, b) => b.end.localeCompare(a.end));
  const years = [...new Set(closings.map((closing) => closing.end.slice(0, 4)))];
  const shown = closings.filter((closing) => {
    const state = closingStatus(closing);
    return (
      (year === "all" || closing.end.startsWith(year)) &&
      (status === "all" || (status === "settled" ? state.settled : !state.settled))
    );
  });
  const open = (closing) =>
    dispatch(dialogOpened("closing-sheet", { closingId: closing.id, name: closingName(closing) }));

  return (
    <section className="settlement-history">
      <div className="section-heading wrap">
        <div>
          <span className="eyebrow">REPORTS / SETTLEMENT HISTORY</span>
          <h2>Previous closing sheets</h2>
          <p className="caption">Revisit every completed period without changing its recorded totals.</p>
        </div>
      </div>
      <div className="history-stats">
        <div className="card">
          <small>Periods closed</small>
          <strong>{closings.length}</strong>
        </div>
        <div className="card">
          <small>Total recorded</small>
          <strong>{formatMoney(closings.reduce((sum, c) => sum + closingTotal(household, c), 0))}</strong>
        </div>
        <div className="card">
          <small>Last closing</small>
          <strong>{closings.length ? formatShortDate(closings[0].end) : "None yet"}</strong>
        </div>
      </div>
      <section className="card">
        <div className="section-heading wrap">
          <h3>Settlement archive</h3>
          <div className="actions wrap">
            <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="locked">Locked · pending</option>
              <option value="settled">Settled</option>
            </select>
            <select aria-label="Filter by year" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        {shown.length ? (
          <div className="table-scroll">
            <table className="data-table history-table">
              <thead>
                <tr>
                  <th scope="col">Closing period</th>
                  <th scope="col">Status</th>
                  <th scope="col">Recorded expense</th>
                  <th scope="col">Settlement requests</th>
                  <th scope="col">Report</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((closing) => {
                  const state = closingStatus(closing);
                  return (
                    <tr key={closing.id}>
                      <td>
                        <strong>{closingName(closing)}</strong>
                        <small>
                          {formatShortDate(closing.start)} – {formatShortDate(closing.end)} · locked{" "}
                          {formatDate(closing.createdAt)}
                        </small>
                      </td>
                      <td>
                        <span className={`pill ${state.settled ? "mint" : "warning"}`}>{state.label}</span>
                      </td>
                      <td>{formatMoney(closingTotal(household, closing))}</td>
                      <td>{state.total}</td>
                      <td>
                        <div className="actions">
                          <Button variant="outline" size="small" onClick={() => open(closing)}>
                            View
                          </Button>
                          <Button
                            size="small"
                            icon="download"
                            disabled={busy(closing, "pdf")}
                            aria-label={`Download PDF for ${closingName(closing)}`}
                            onClick={() => download("pdf", closing)}
                          >
                            PDF
                          </Button>
                          <Button variant="text" size="small" onClick={() => download("csv", closing)}>
                            CSV
                          </Button>
                          <Button variant="text" size="small" onClick={() => download("json", closing)}>
                            JSON
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="history" title={closings.length ? "No closings match" : "No closed periods yet"}>
            {closings.length
              ? "Change the filters to see other periods."
              : "When an owner or admin closes a period, its frozen closing sheet appears here."}
          </EmptyState>
        )}
        <p className="caption">
          Each PDF shows the CoinSplit logo and version, household and period, frozen balances and transfers,
          the export time and page numbers.
        </p>
      </section>
    </section>
  );
}
