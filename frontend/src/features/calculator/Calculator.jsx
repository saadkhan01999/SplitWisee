import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { dialogOpened, toastShown } from "../../app/uiSlice.js";
import { Icon } from "../../components/Icon.jsx";
import { copyText } from "../../utils/downloads.js";
import { formatMoney } from "../../utils/format.js";
import { equalSplit } from "../../utils/split.js";
import {
  backspacePressed,
  cleared,
  decimalPressed,
  digitPressed,
  displayValue,
  equalsPressed,
  formatExpression,
  formatNumber,
  historyCleared,
  historyRecalled,
  livePreview,
  operatorPressed,
  percentPressed,
  selectCalculator,
  signToggled,
} from "./calculatorSlice.js";

const digit = (value) => ({ id: value, label: value, kind: "digit", action: () => digitPressed(value) });
const operator = (symbol, name) => ({
  id: symbol,
  label: symbol,
  name,
  kind: "operator",
  action: () => operatorPressed(symbol),
});

const KEYS = [
  { id: "clear", label: "AC", name: "All clear", kind: "function", action: cleared },
  {
    id: "backspace",
    label: <Icon name="backspace" />,
    name: "Delete last digit",
    kind: "function",
    action: backspacePressed,
  },
  { id: "%", label: "%", name: "Percent", kind: "function", action: percentPressed },
  operator("÷", "Divide"),
  digit("7"),
  digit("8"),
  digit("9"),
  operator("×", "Multiply"),
  digit("4"),
  digit("5"),
  digit("6"),
  operator("−", "Subtract"),
  digit("1"),
  digit("2"),
  digit("3"),
  operator("+", "Add"),
  { id: "sign", label: "±", name: "Change sign", kind: "function", action: signToggled },
  digit("0"),
  { id: ".", label: ".", name: "Decimal point", kind: "digit", action: decimalPressed },
  { id: "=", label: "=", name: "Equals", kind: "equals", action: equalsPressed },
];

/** Physical keyboard → key id. */
const KEYBOARD = {
  "+": "+",
  "-": "−",
  "*": "×",
  x: "×",
  X: "×",
  "/": "÷",
  "%": "%",
  ".": ".",
  ",": ".",
  "=": "=",
  Enter: "=",
  Backspace: "backspace",
  Delete: "clear",
  c: "clear",
  C: "clear",
};

const MAX_PEOPLE = 20;

function SplitHelper({ value }) {
  const dispatch = useDispatch();
  const [people, setPeople] = useState(2);
  const pence = Number.isFinite(value) ? Math.round(value * 100) : 0;
  const usable = pence > 0 && pence <= 100_000_000;
  const { share, extraPennies } = usable ? equalSplit(pence, people) : { share: 0, extraPennies: 0 };

  return (
    <section className="calc-split" aria-label="Split this amount">
      <div className="calc-split-header">
        <span>Split {usable ? formatMoney(pence) : "the result"} between</span>
        <div className="calc-stepper">
          <button
            type="button"
            aria-label="Fewer people"
            disabled={people <= 2}
            onClick={() => setPeople(people - 1)}
          >
            −
          </button>
          <output aria-live="polite">{people} people</output>
          <button
            type="button"
            aria-label="More people"
            disabled={people >= MAX_PEOPLE}
            onClick={() => setPeople(people + 1)}
          >
            +
          </button>
        </div>
      </div>
      {usable ? (
        <p className="calc-split-result">
          <strong>{formatMoney(share)}</strong> each
          {extraPennies > 0 && (
            <small>
              {extraPennies} {extraPennies === 1 ? "person pays" : "people pay"} {formatMoney(share + 1)} so
              every penny is covered
            </small>
          )}
        </p>
      ) : (
        <p className="caption">Calculate a positive amount to split it.</p>
      )}
      <button
        type="button"
        className="btn full"
        disabled={!usable}
        onClick={() => dispatch(dialogOpened("expense-new", { amount: (pence / 100).toFixed(2) }))}
      >
        <Icon name="plus" /> Add {usable ? formatMoney(pence) : ""} as an expense
      </button>
    </section>
  );
}

export function Calculator() {
  const dispatch = useDispatch();
  const calculator = useSelector(selectCalculator);
  const [pressed, setPressed] = useState(null);
  const pressTimer = useRef(null);
  const preview = livePreview(calculator);
  // While an expression is pending, split and copy the running result rather than the number being typed.
  const value = preview !== null ? Number(preview) : displayValue(calculator);
  const shown = calculator.error ?? formatNumber(calculator.entry || calculator.tokens.at(-2) || "0");
  const expression = calculator.evaluated ? calculator.lastExpression : formatExpression(calculator.tokens);

  const press = (key) => {
    dispatch(key.action());
    setPressed(key.id);
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPressed(null), 140);
  };

  useEffect(() => {
    function onKeyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest?.("input, select, textarea")) return;
      const id = /^[0-9]$/.test(event.key) ? event.key : KEYBOARD[event.key];
      const key = KEYS.find((candidate) => candidate.id === id);
      if (!key) return;
      event.preventDefault();
      press(key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(pressTimer.current);
    };
    // `press` only dispatches and updates local highlight state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyResult() {
    try {
      await copyText(String(value));
      dispatch(toastShown(`Copied ${formatNumber(String(value))}`));
    } catch {
      dispatch(toastShown("Copy is not available here. Select the number instead."));
    }
  }

  return (
    <div className="calculator">
      <div className="calc-screen">
        <div className="calc-expression" aria-hidden="true">
          {expression}
        </div>
        <output
          className={`calc-value ${calculator.error ? "is-error" : ""}`.trim()}
          aria-live="polite"
          aria-atomic="true"
        >
          {calculator.error ? shown : shown.length > 14 ? <small>{shown}</small> : shown}
        </output>
        <div className="calc-preview" aria-hidden="true">
          {preview !== null && `= ${formatNumber(preview)}`}
        </div>
        <button
          type="button"
          className="calc-copy"
          aria-label="Copy result"
          title="Copy result"
          onClick={copyResult}
        >
          <Icon name="copy" size={16} />
        </button>
      </div>

      <div className="calc-keypad" role="group" aria-label="Calculator keys">
        {KEYS.map((key) => (
          <button
            key={key.id}
            type="button"
            className={`calc-key ${key.kind} ${pressed === key.id ? "is-pressed" : ""}`.trim()}
            aria-label={key.name}
            onClick={() => press(key)}
          >
            {key.label}
          </button>
        ))}
      </div>

      <SplitHelper value={value} />

      {calculator.history.length > 0 && (
        <details className="calc-history">
          <summary>
            <Icon name="history" size={16} /> History ({calculator.history.length})
          </summary>
          <ol>
            {calculator.history.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => dispatch(historyRecalled(item.id))}>
                  <span>{item.expression} =</span>
                  <strong>{formatNumber(item.result)}</strong>
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="btn text small" onClick={() => dispatch(historyCleared())}>
            Clear history
          </button>
        </details>
      )}
      <p className="caption">
        Keyboard: digits, + − × ÷ (or * /), Enter for =, Backspace to delete, C to clear. Ledger amounts are
        always calculated separately in exact pence.
      </p>
    </div>
  );
}
