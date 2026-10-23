const PATHS = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  home: "M3 10l9-7 9 7v11H3z M9 21v-8h6v8",
  wallet: "M3 5h17v15H3z M3 5V3h14 M16 11h5v4h-5z",
  share: "M8 12l9-7 M8 12l9 7 M3 9h5v6H3z M17 2h5v6h-5z M17 16h5v6h-5z",
  tag: "M3 3h9l9 9-9 9-9-9z M7 7h1",
  chart: "M3 3v18h18 M7 15l5-5 4 3 5-8",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c-5 5-5 13 0 18 M12 3c5 5 5 13 0 18",
  help: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M9 9a3 3 0 1 1 4 3c-1 1-1 1-1 3 M12 18h.01",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  plus: "M12 5v14 M5 12h14",
  books: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z M18 20H7a3 3 0 0 1 0-6h11",
};

export function AdminIcon({ name }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name] ?? PATHS.grid} />
    </svg>
  );
}
