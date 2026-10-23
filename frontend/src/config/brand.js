/* global __APP_VERSION__ */

export const brand = Object.freeze({
  name: "SplitWisee",
  // Injected from package.json by vite.config.js.
  version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev",
  tagline: "Split simply. Live freely.",
  description:
    "Shared expenses, receipt scanning and clear monthly balances for homes, families and friends.",
  pricePence: 99,
});
