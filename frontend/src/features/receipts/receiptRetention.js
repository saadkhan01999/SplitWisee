import { useEffect, useState } from "react";
import { retentionDate } from "@domain/periods/index.js";
import { api } from "../../api/client.js";

// Original receipt files are kept while their period is open and for one month after it is locked. After that, and
// only once the platform owner has approved the policy, the original file may be removed; the record stays.

/** The date the original file of this expense's receipt may be removed, or null while its period is open. */
export function receiptRetentionDate(household, expense) {
  const closing = household.closings.find((item) => item.expenseIds?.includes(expense.id));
  return closing ? (closing.retentionUntil ?? retentionDate(closing.createdAt)) : null;
}

const cache = new Map();

/** Receipt records (with removal dates) for a household, loaded once per household and version. */
export function useReceiptRecords(household) {
  const cacheKey = `${household.id}:${household.version}`;
  const [loaded, setLoaded] = useState(null);

  useEffect(() => {
    if (cache.has(cacheKey)) return undefined;
    let cancelled = false;
    const done = (byId) => {
      cache.set(cacheKey, byId);
      if (!cancelled) setLoaded({ cacheKey, byId });
    };
    api
      .get(`/households/${encodeURIComponent(household.id)}/receipts`)
      .then((data) => done(new Map((data.receipts || []).map((record) => [record.id, record]))))
      .catch(() => done(new Map()));
    return () => {
      cancelled = true;
    };
  }, [cacheKey, household.id]);

  return cache.get(cacheKey) ?? (loaded?.cacheKey === cacheKey ? loaded.byId : null);
}
