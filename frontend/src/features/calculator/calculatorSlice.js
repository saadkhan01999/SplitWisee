import { createSlice, nanoid } from "@reduxjs/toolkit";

// A four-function calculator with standard operator precedence (2 + 3 × 4 = 14). Numbers are kept as the
// strings the user typed; results are normalised to 12 significant digits to hide binary floating-point noise.

export const OPERATORS = ["+", "−", "×", "÷"];
const MAX_DIGITS = 15;
const MAX_HISTORY = 12;
const LIMIT = 1e15;

export class CalculatorError extends Error {}

const isOperator = (token) => OPERATORS.includes(token);
const digitCount = (entry) => entry.replace(/[^0-9]/g, "").length;

/** "-0." → "-0", "12." → "12" */
const finishEntry = (entry) => {
  const trimmed = entry.endsWith(".") ? entry.slice(0, -1) : entry;
  return trimmed === "-0" || trimmed === "" || trimmed === "-" ? "0" : trimmed;
};

export function normalise(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= LIMIT) throw new CalculatorError("Number too large");
  const rounded = Number(value.toPrecision(12));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Evaluates [number, operator, number, …] with × and ÷ before + and −. */
export function evaluate(tokens) {
  const values = [Number(tokens[0])];
  const additive = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i];
    const operand = Number(tokens[i + 1]);
    if (operator === "×") values[values.length - 1] *= operand;
    else if (operator === "÷") {
      if (operand === 0) throw new CalculatorError("Can't divide by zero");
      values[values.length - 1] /= operand;
    } else {
      additive.push(operator);
      values.push(operand);
    }
  }
  const total = values.reduce((sum, value, i) =>
    i === 0 ? value : additive[i - 1] === "+" ? sum + value : sum - value,
  );
  return normalise(total);
}

/** "1234567.5" → "1,234,567.5" (keeps a trailing "." or zeros while typing). */
export function formatNumber(value) {
  if (!value || /e/i.test(value)) return value || "0";
  const negative = value.startsWith("-");
  const [whole, fraction] = value.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}${grouped}${fraction !== undefined ? `.${fraction}` : ""}`;
}

export const formatExpression = (tokens) =>
  tokens.map((token) => (isOperator(token) ? token : formatNumber(token))).join(" ");

const initialState = {
  tokens: [],
  entry: "0",
  evaluated: false,
  lastExpression: "",
  error: null,
  history: [],
};

const startOver = (state, entry = "0") => {
  state.tokens = [];
  state.entry = entry;
  state.evaluated = false;
  state.lastExpression = "";
  state.error = null;
};

const calculatorSlice = createSlice({
  name: "calculator",
  initialState,
  reducers: {
    digitPressed(state, { payload: digit }) {
      if (state.error || state.evaluated) return startOver(state, digit);
      if (state.entry === "0") state.entry = digit;
      else if (state.entry === "-0") state.entry = `-${digit}`;
      else if (digitCount(state.entry) < MAX_DIGITS) state.entry += digit;
    },
    decimalPressed(state) {
      if (state.error || state.evaluated) return startOver(state, "0.");
      if (state.entry === "") state.entry = "0.";
      else if (!state.entry.includes(".") && digitCount(state.entry) < MAX_DIGITS) state.entry += ".";
    },
    operatorPressed(state, { payload: operator }) {
      if (state.error) return;
      if (state.evaluated) {
        state.tokens = [state.entry, operator];
        state.entry = "";
        state.evaluated = false;
        state.lastExpression = "";
      } else if (state.entry === "") {
        if (state.tokens.length) state.tokens[state.tokens.length - 1] = operator;
      } else {
        state.tokens.push(finishEntry(state.entry), operator);
        state.entry = "";
      }
    },
    equalsPressed(state) {
      if (state.error || state.evaluated) return;
      const expression =
        state.entry === "" ? state.tokens.slice(0, -1) : [...state.tokens, finishEntry(state.entry)];
      if (expression.length < 3) return;
      try {
        const result = evaluate(expression);
        state.history.unshift({ id: nanoid(), expression: formatExpression(expression), result });
        state.history.splice(MAX_HISTORY);
        state.lastExpression = `${formatExpression(expression)} =`;
        state.tokens = [];
        state.entry = result;
        state.evaluated = true;
      } catch (error) {
        state.error = error.message;
      }
    },
    /** 50 + 10 % → 50 + 5 (percentage of the running total); 20 × 10 % → 20 × 0.1. */
    percentPressed(state) {
      if (state.error || state.entry === "") return;
      const value = Number(finishEntry(state.entry));
      const lastOperator = state.tokens.at(-1);
      try {
        if (!state.evaluated && (lastOperator === "+" || lastOperator === "−")) {
          const base = Number(evaluate(state.tokens.slice(0, -1)));
          state.entry = normalise((base * value) / 100);
        } else {
          if (state.evaluated) startOver(state);
          state.entry = normalise(value / 100);
        }
      } catch (error) {
        state.error = error.message;
      }
    },
    signToggled(state) {
      if (state.error || state.entry === "") return;
      if (state.evaluated) {
        const value = state.entry;
        startOver(state, value);
      }
      state.entry = state.entry.startsWith("-") ? state.entry.slice(1) : `-${state.entry}`;
    },
    backspacePressed(state) {
      if (state.error || state.evaluated) return startOver(state);
      if (state.entry !== "") {
        const shorter = state.entry.slice(0, -1);
        state.entry = shorter === "" || shorter === "-" ? (state.tokens.length ? "" : "0") : shorter;
      } else if (state.tokens.length) {
        state.tokens.pop();
        state.entry = state.tokens.pop();
      }
    },
    cleared(state) {
      startOver(state);
    },
    historyRecalled(state, { payload: id }) {
      const item = state.history.find((entry) => entry.id === id);
      if (!item) return;
      if (!state.error && !state.evaluated && state.entry === "" && state.tokens.length)
        state.entry = item.result;
      else startOver(state, item.result);
    },
    historyCleared(state) {
      state.history = [];
    },
  },
});

export const {
  digitPressed,
  decimalPressed,
  operatorPressed,
  equalsPressed,
  percentPressed,
  signToggled,
  backspacePressed,
  cleared,
  historyRecalled,
  historyCleared,
} = calculatorSlice.actions;
export default calculatorSlice.reducer;

export const selectCalculator = (state) => state.calculator;

/** The value currently shown, as a number (NaN when nothing has been typed). */
export const displayValue = (calculator) =>
  Number(finishEntry(calculator.entry || calculator.tokens.at(-2) || "0"));

/** Running result while an expression is being typed, e.g. "12 + 3 ×" with 4 typed → "24". */
export function livePreview(calculator) {
  if (calculator.evaluated || calculator.error || !calculator.tokens.length || calculator.entry === "")
    return null;
  try {
    return evaluate([...calculator.tokens, finishEntry(calculator.entry)]);
  } catch {
    return null;
  }
}
