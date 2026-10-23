const PATHS = {
  home: "M3 10 12 3l9 7v10H3z M9 20v-7h6v7",
  expenses: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 7h6 M9 11h6 M9 15h3",
  settle: "M4 7h15l-4-4 M20 17H5l4 4",
  reports: "M4 20V10 M10 20V4 M16 20v-8 M22 20H2",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  calc: "M5 2h14v20H5z M8 5h8v4H8z M8 13h1 M15 13h1 M8 17h1 M15 17h1",
  moon: "M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12",
  sun: "M12 4V2 M12 22v-2 M4 12H2 M22 12h-2 M5 5 6.5 6.5 M17.5 17.5 19 19 M19 5l-1.5 1.5 M6.5 17.5 5 19 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  close: "M6 6l12 12 M18 6 6 18",
  download: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4",
  share: "M12 16V3 M7 8l5-5 5 5 M5 13v8h14v-8",
  camera: "M3 7h4l2-3h6l2 3h4v14H3z M16 14a4 4 0 1 0-8 0 4 4 0 0 0 8 0",
  search: "M20 20l-6-6 M16 9a7 7 0 1 0-14 0 7 7 0 0 0 14 0",
  check: "M5 12l4 4L19 6",
  chevron: "M9 5l7 7-7 7",
  shield: "M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2",
  logout: "M9 3H3v18h6 M8 12h13 M16 7l5 5-5 5",
  wallet: "M3 5h17v15H3z M3 5V3h14 M15 10h6v5h-6z",
  leaf: "M20 3C8 1 1 9 6 15s15 1 14-12z M4 21 15 9",
  copy: "M8 8h13v13H8z M4 16H2V2h14v2",
  backspace: "M21 5H8l-6 7 6 7h13z M12 9l6 6 M18 9l-6 6",
  history: "M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 7v5l3 3",
  books: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z M18 20H7a3 3 0 0 1 0-6h11",
  gift: "M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8c-2-4-6-4-6-1 0 1 1 1 6 1 M12 8c2-4 6-4 6-1 0 1-1 1-6 1",
  bank: "M3 10h18 M4 10V20 M20 10v10 M9 10v10 M15 10v10 M2 21h20 M12 3l9 5H3z",
  help: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M9 9a3 3 0 1 1 4 3c-1 1-1 1-1 3 M12 18h.01",
};

const TAB_ICONS = { books: "books", rewards: "gift", bank: "bank" };

export function Icon({ name, size = 20 }) {
  const path = PATHS[name] ?? PATHS[TAB_ICONS[name]] ?? PATHS.expenses;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}
