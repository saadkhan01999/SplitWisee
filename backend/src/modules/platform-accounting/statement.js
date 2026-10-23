export function monthlyStatement(report) {
  const running = {};
  return report.journal
    .filter((r) => /^(1000|1010)/.test(r.account))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((r) => {
      running[r.account] = (running[r.account] || 0) + r.debitPence - r.creditPence;
      return {
        date: r.date,
        reference: r.id,
        description: r.description,
        account: r.account,
        source: r.source,
        debitPence: r.debitPence,
        creditPence: r.creditPence,
        runningMovementPence: running[r.account],
      };
    });
}
export function balanceMovements(report) {
  const sum = (code) =>
      report.trial.filter((r) => r.account.startsWith(code)).reduce((n, r) => n + r.balancePence, 0),
    surplus = report.summary.find((r) => r.metric === "Provisional surplus before tax")?.pence || 0;
  return [
    { section: "Asset movement", account: "Stripe balance", pence: sum("1000") },
    { section: "Asset movement", account: "Bank ledger (unreconciled)", pence: sum("1010") },
    { section: "Asset movement", account: "Payout clearing", pence: sum("1100") },
    { section: "Result / funding movement", account: "Current period surplus before tax", pence: surplus },
    {
      section: "Result / funding movement",
      account: "Unclassified funding — review required",
      pence: -sum("9990"),
    },
  ];
}
