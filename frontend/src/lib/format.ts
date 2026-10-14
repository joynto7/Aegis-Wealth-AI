/**
 * Number and date formatting per Section 2.7.2:
 * amounts as "CNY 200,000" in summaries and "CNY 200,000.00" in tables;
 * percentages with one decimal ("25.0%"), fees with two ("0.30%");
 * dates as "30 Sep 2026".
 */

export function formatMoney(value: number, withCents = false): string {
  const n = Number(value ?? 0);
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  });
  return `CNY ${formatted}`;
}

export function formatPercent(value: number, decimals = 1): string {
  const n = Number(value ?? 0);
  return `${n.toFixed(decimals)}%`;
}

export function formatFeePercent(value: number): string {
  return formatPercent(value, 2);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(iso)}, ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function roundHalfUp(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
