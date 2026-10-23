import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { sum } from "@domain/calculation-engine/index.js";
import { Icon } from "../../components/Icon.jsx";
import { EXPENSE_CATEGORIES, formatMoney, signedAmount } from "../../utils/format.js";
import { selectHousehold, selectMemberName } from "../household/householdSlice.js";
import { ExpenseList } from "./ExpenseList.jsx";

const STATUSES = ["approved", "pending", "draft", "disputed"];

export function ExpensesPage() {
  const household = useSelector(selectHousehold);
  const memberName = useSelector(selectMemberName);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...household.expenses]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((expense) => category === "All" || expense.category === category)
      .filter((expense) => status === "All" || expense.status === status)
      .filter((expense) => {
        if (!needle) return true;
        const people = [expense.purchasedBy, ...expense.funders.map((funder) => funder.memberId)].map(
          memberName,
        );
        return [expense.title, expense.category, ...people].join(" ").toLowerCase().includes(needle);
      });
  }, [household.expenses, query, category, status, memberName]);

  return (
    <section className="card list-card">
      <div className="filters">
        <div className="search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search expenses"
            placeholder="Search expenses, people, categories…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="All">All categories</option>
          {EXPENSE_CATEGORIES.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="All">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="list-summary">
        {filtered.length} {filtered.length === 1 ? "record" : "records"}{" "}
        <strong>{formatMoney(sum(filtered.map(signedAmount)))}</strong>
      </div>
      <ExpenseList expenses={filtered} />
    </section>
  );
}
