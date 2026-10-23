/** Member app sections, in sidebar order. */
export const TABS = [
  {
    id: "home",
    label: "Overview",
    eyebrow: "A CALMER WAY TO SHARE",
    title: null,
    intro: "Your shared spending, all in a good place.",
  },
  {
    id: "expenses",
    label: "Expenses",
    title: "Every little expense.",
    intro: "One clear record of what was spent, and who paid.",
  },
  {
    id: "settle",
    label: "Settlements",
    title: "Let’s settle up.",
    intro: "Fair shares. Fewer transfers. No awkward maths.",
  },
  {
    id: "reports",
    label: "Reports",
    title: "The bigger picture.",
    intro: "Understand your household spending, down to the penny.",
  },
  {
    id: "books",
    label: "Bookkeeping",
    title: "Your monthly books.",
    intro: "Keep this month and every previous month in order.",
  },
  {
    id: "rewards",
    label: "Invite & earn",
    title: "Good things, shared.",
    intro: "Invite a new user. Earn one free month.",
  },
  {
    id: "bank",
    label: "Bank details",
    title: "Banking, your way.",
    intro: "Optional details. The same clear expense tools.",
  },
  {
    id: "people",
    label: "Household",
    title: "Your people. Your place.",
    intro: "A shared space for everyone who calls it home.",
  },
  {
    id: "settings",
    label: "Account & settings",
    title: "Make yourself at home.",
    intro: "Manage your profile, preferences and data.",
  },
];

export const BOTTOM_NAV = [
  { id: "home", label: "Home" },
  { id: "expenses", label: "Expenses" },
  { id: "add", label: "Add" },
  { id: "settle", label: "Settle" },
  { id: "settings", label: "Account" },
];

export const tabById = (id) => TABS.find((tab) => tab.id === id) ?? TABS[0];
