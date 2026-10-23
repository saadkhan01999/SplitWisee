import { describe, expect, it } from "vitest";
import reducer, {
  backspacePressed,
  cleared,
  decimalPressed,
  digitPressed,
  displayValue,
  equalsPressed,
  evaluate,
  formatNumber,
  historyRecalled,
  livePreview,
  operatorPressed,
  percentPressed,
  signToggled,
} from "../src/features/calculator/calculatorSlice.js";

/** Feeds a key sequence such as "12+3×4=" through the reducer. */
function press(sequence, state = reducer(undefined, { type: "init" })) {
  const actions = {
    "+": () => operatorPressed("+"),
    "−": () => operatorPressed("−"),
    "×": () => operatorPressed("×"),
    "÷": () => operatorPressed("÷"),
    "=": equalsPressed,
    ".": decimalPressed,
    "%": percentPressed,
    "±": signToggled,
    "⌫": backspacePressed,
    C: cleared,
  };
  for (const key of sequence) state = reducer(state, /\d/.test(key) ? digitPressed(key) : actions[key]());
  return state;
}

describe("calculator engine", () => {
  it("applies multiplication and division before addition and subtraction", () => {
    expect(press("2+3×4=").entry).toBe("14");
    expect(press("100−20÷4=").entry).toBe("95");
    expect(evaluate(["10", "−", "4", "−", "3"])).toBe("3");
  });

  it("hides binary floating-point noise", () => {
    expect(press("0.1+0.2=").entry).toBe("0.3");
    expect(press("1.1×3=").entry).toBe("3.3");
  });

  it("shows a running result while an expression is typed", () => {
    expect(livePreview(press("12+3×4"))).toBe("24");
    expect(livePreview(press("12+"))).toBeNull();
  });

  it("refuses to divide by zero and recovers on the next digit", () => {
    const failed = press("8÷0=");
    expect(failed.error).toBe("Can't divide by zero");
    expect(press("5", failed)).toMatchObject({ entry: "5", error: null, tokens: [] });
  });

  it("treats percent as a share of the running total after + or −", () => {
    expect(press("50+10%=").entry).toBe("55");
    expect(press("200−25%=").entry).toBe("150");
    expect(press("20×10%=").entry).toBe("2");
    expect(press("45%").entry).toBe("0.45");
  });

  it("replaces an operator pressed twice and continues from a result", () => {
    expect(press("9+×2=").entry).toBe("18");
    const result = press("6×7=");
    expect(result).toMatchObject({ entry: "42", evaluated: true, lastExpression: "6 × 7 =" });
    expect(press("+8=", result).entry).toBe("50");
    expect(press("3", result).entry).toBe("3");
  });

  it("edits the number being typed", () => {
    expect(press("12.5⌫⌫").entry).toBe("12");
    expect(press("7⌫").entry).toBe("0");
    expect(press("5+⌫").entry).toBe("5");
    expect(press("1..2").entry).toBe("1.2");
    expect(press(".5").entry).toBe("0.5");
    expect(press("4±").entry).toBe("-4");
    expect(press("4±±").entry).toBe("4");
    expect(press("3±+5=").entry).toBe("2");
  });

  it("limits entries to 15 digits", () => {
    expect(press("1234567890123456789").entry).toBe("123456789012345");
  });

  it("keeps a history that can be recalled into a new calculation", () => {
    let state = press("2+2=");
    state = press("C10×3=", state);
    expect(state.history.map((item) => item.result)).toEqual(["30", "4"]);
    state = press("C5+", state);
    state = reducer(state, historyRecalled(state.history[1].id));
    expect(press("=", state).entry).toBe("9");
  });

  it("formats numbers for display", () => {
    expect(formatNumber("1234567.5")).toBe("1,234,567.5");
    expect(formatNumber("-1200")).toBe("−1,200");
    expect(formatNumber("12.")).toBe("12.");
    expect(displayValue(press("12+"))).toBe(12);
  });
});
