/**
 * Rounding as backend/app/engines/numbers.py does it: half away from zero, on the number's shortest decimal
 * form (Python's Decimal(repr(x))). JavaScript's String(x) gives the same shortest round-trip digits, so the
 * mock rounds exactly as the backend: 2.675 rounds to 2.68 as written, not as its binary neighbour.
 */
export function roundHalf(value: number, decimals = 0): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const negative = value < 0;
  const text = Math.abs(value).toString();
  if (text.includes("e")) {
    // Very small or very large: no tie at these magnitudes worth the string work.
    const factor = 10 ** decimals;
    const r = Math.round(Math.abs(value) * factor) / factor;
    return negative ? -r : r;
  }
  const [intPart, frac = ""] = text.split(".");
  if (frac.length <= decimals) return value;
  let digits = BigInt(intPart + frac.slice(0, decimals));
  if (frac.charCodeAt(decimals) - 48 >= 5) digits += BigInt(1);
  const result = Number(digits) / 10 ** decimals;
  return negative ? -result : result;
}

export const round1 = (v: number) => roundHalf(v, 1);
export const round2 = (v: number) => roundHalf(v, 2);
export const round4 = (v: number) => roundHalf(v, 4);

/** The digits of a number's shortest decimal form as a BigInt, and how many of them are decimals. */
function decimalParts(value: number): [bigint, number] | null {
  const text = Math.abs(value).toString();
  if (text.includes("e")) return null;
  const [intPart, frac = ""] = text.split(".");
  return [BigInt(intPart + frac), frac.length];
}

/**
 * Fund units an amount buys at a NAV: floor(amount / NAV x 10,000) / 10,000, in exact decimals, as the backend's
 * units_for (Decimal arithmetic). Plain floating point would turn 3 / 1 x 10,000 into 29,999.999... on some inputs.
 */
export function unitsFor(amount: number, nav: number): number {
  if (amount <= 0 || nav <= 0) return 0;
  const a = decimalParts(amount);
  const n = decimalParts(nav);
  if (!a || !n) return Math.floor((amount / nav) * 10000) / 10000;
  const quotient = (a[0] * BigInt(10) ** BigInt(n[1] + 4)) / (n[0] * BigInt(10) ** BigInt(a[1]));
  return Number(quotient) / 10000;
}
