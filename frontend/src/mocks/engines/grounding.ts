import type { NumberSource } from "@/lib/types";

/**
 * Number sources (port of the backend's grounding check, Section 2.5.7):
 * every figure in a reply, by its character span, with the tool field, the
 * client's message or the profile it came from. Small whole numbers (0-10)
 * and years (2000-2030) need no source and are left unmarked.
 */

const IDENTIFIER = /\b(?:[A-Z]{1,4}-\d+|[A-Z]{1,3}\d+[A-Z]?)\b|#\d+/g;
const NUMBER = /(?<![\w.\-])([\-+−]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?%)?/g;
const DIGITS = /\d+(?:\.\d+)?/g;

interface ReplyNumber {
  text: string;
  value: number;
  decimals: number;
  percent: boolean;
  start: number;
  end: number;
}

interface Source {
  tool: string;
  path: string;
  value: number;
  rank: number; // 0 numeric field, 1 id-like field, 2 digits found inside text
}

export function extractNumbers(text: string): ReplyNumber[] {
  // Identifiers are blanked with spaces of the same length, so offsets still point into the original text.
  const cleaned = text.replace(IDENTIFIER, (m) => " ".repeat(m.length));
  const found: ReplyNumber[] = [];
  for (const m of cleaned.matchAll(NUMBER)) {
    const [whole, sign, digits, frac, pct] = m;
    let value = Number(digits.replace(/,/g, "") + (frac ?? ""));
    if (sign === "-" || sign === "−") value = -value;
    const start = m.index ?? 0;
    found.push({ text: whole, value, decimals: frac ? frac.length - 1 : 0, percent: !!pct, start, end: start + whole.length });
  }
  return found;
}

function isId(path: string): boolean {
  const key = (path.split(".").pop() ?? "").split("[")[0];
  return key === "id" || key === "version" || key === "parent_id" || key.endsWith("_id");
}

function walk(tool: string, value: unknown, path: string, out: Source[]) {
  if (value === null || value === undefined || typeof value === "boolean") return;
  if (typeof value === "number") {
    out.push({ tool, path, value, rank: isId(path) ? 1 : 0 });
  } else if (typeof value === "string") {
    for (const d of value.match(DIGITS) ?? []) out.push({ tool, path, value: Number(d), rank: 2 });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => walk(tool, v, `${path}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(tool, v, path ? `${path}.${k}` : k, out);
  }
}

function roundHalf(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return (Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9)) / f;
}

function matches(n: ReplyNumber, y: number): boolean {
  const x = Math.abs(n.value);
  const half = 0.5 * 10 ** -n.decimals + 1e-9;
  const candidates = [Math.abs(y)];
  if (n.percent && Math.abs(y) <= 1) candidates.push(Math.abs(y) * 100);
  return candidates.some((c) => Math.abs(x - roundHalf(c, n.decimals)) <= 1e-9 || Math.abs(x - c) <= half);
}

export function numberSources(reply: string, toolResults: [string, unknown][], userMessage: string): NumberSource[] {
  const sources: Source[] = [];
  for (const [tool, result] of toolResults) walk(tool, result, "", sources);
  for (const n of extractNumbers(userMessage)) sources.push({ tool: "user_message", path: "message", value: Math.abs(n.value), rank: 0 });
  sources.sort((a, b) => a.rank - b.rank); // stable: numeric fields first

  const out: NumberSource[] = [];
  for (const n of extractNumbers(reply)) {
    const x = Math.abs(n.value);
    if (!n.percent && n.decimals === 0 && (x <= 10 || (x >= 2000 && x <= 2030))) continue;
    const source = sources.find((s) => matches(n, s.value));
    if (!source) continue;
    const kind = source.tool === "user_message" ? "message" : source.tool === "context" ? "context" : "tool";
    out.push({
      start: n.start,
      end: n.end,
      text: n.text,
      kind,
      tool: kind === "tool" ? source.tool : null,
      path: kind === "message" ? null : source.path,
      value: source.value,
    });
  }
  return out;
}
