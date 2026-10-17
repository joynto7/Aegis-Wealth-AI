"use client";

import { useState } from "react";
import { CalendarClock, FastForward, Gauge, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Segmented } from "@/components/shared/segmented";
import { StatusBadge } from "@/components/shared/status-badge";
import { MonitoringStatusChip } from "@/components/monitoring/drift-panel";
import { useAdvanceMarket, useMonitoringOverview } from "@/lib/queries";
import { ASSET_ORDER, useAssetColors } from "@/lib/asset-colors";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AssetClass, MarketState } from "@/lib/types";

const g = (n: number) => String(Number(n.toPrecision(6)));
const signedPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

function Moves({ label, moves }: { label: string; moves: Record<AssetClass, number> }) {
  const colors = useAssetColors();
  return (
    <div>
      <p className="text-caption text-(--text-muted)">{label}</p>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {ASSET_ORDER.map((c) => (
          <li key={c} className="flex items-center gap-1.5 rounded-full border border-(--border) bg-(--surface-2) px-2.5 py-1 text-caption">
            <span className="size-2 rounded-full" style={{ backgroundColor: colors[c] }} aria-hidden />
            {ASSET_CLASS_LABEL[c]} <span className="font-semibold tabular-nums text-(--text)">{signedPct(moves[c])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The simulated market clock: where it is, what moved, who moved it and why, and the control to move it. */
function MarketCard({ market, onAdvance }: { market: MarketState; onAdvance: () => void }) {
  return (
    <Card>
      <CardContent className="space-y-4 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-form font-semibold text-(--text)">
              <CalendarClock className="size-5 text-(--primary)" aria-hidden /> Simulated market
            </h2>
            <p className="mt-0.5 text-caption text-(--text-muted)">{market.data_label}.</p>
          </div>
          <span className="rounded-full bg-(--muted) px-2.5 py-1 text-caption font-semibold text-(--text-muted)">Illustrative</span>
        </div>
        <div>
          <p className="font-display text-[28px] font-bold leading-tight text-(--text)">{formatDate(market.as_of)}</p>
          <p className="text-caption text-(--text-muted)">
            {market.month
              ? `Month ${market.month} · last replayed ${market.replayed} · next ${market.next_replay}`
              : `Month 0: the data date. The first advance replays ${market.next_replay}.`}
          </p>
        </div>
        {market.last_returns_pct ? <Moves label={`Last month (${market.replayed})`} moves={market.last_returns_pct} /> : null}
        {market.month ? <Moves label={`Since ${formatDate(market.start_date)}`} moves={market.since_start_pct} /> : null}
        <p className="text-caption text-(--text-muted)">
          {market.changed_at ? (
            <>
              Moved by {market.changed_by ?? "compliance"} on {formatDateTime(market.changed_at)}
              {market.reason ? (
                <>
                  {" "}
                  · Reason: <span className="text-(--text)">{market.reason}</span>
                </>
              ) : null}
            </>
          ) : (
            "Never moved. Each month replays one month of the illustrative history and moves every product's NAV by its asset class's return."
          )}
        </p>
        <Button onClick={onAdvance}>
          <FastForward className="size-4" /> Advance the market
        </Button>
      </CardContent>
    </Card>
  );
}

const MONTH_OPTIONS = ["1", "3", "6", "12"].map((value) => ({ value, label: value }));

function AdvanceDialog({ open, onClose, market }: { open: boolean; onClose: () => void; market: MarketState }) {
  const advance = useAdvanceMarket();
  const [months, setMonths] = useState("1");
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 5;
  if (!open) return null;

  async function apply() {
    if (!valid) return;
    try {
      await advance.mutateAsync({ months: Number(months), reason: reason.trim() });
      setReason("");
      onClose();
    } catch {
      // Shown below from advance.error.
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) {
          setReason("");
          onClose();
        }
      }}
      title="Advance the simulated market?"
      description={`Every product's NAV moves by its asset class's return in the next replayed months, starting with ${market.next_replay}. Positions are revalued; nothing is traded. Drift and alerts update at once.`}
      confirmLabel={`Advance ${months === "1" ? "1 month" : `${months} months`}`}
      loading={advance.isPending}
      confirmDisabled={!valid}
      onConfirm={apply}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>How many months</Label>
          <Segmented value={months} onChange={setMonths} options={MONTH_OPTIONS} label="Months to advance" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="market-reason">Reason (kept in the operation log)</Label>
          <Textarea
            id="market-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="For example: demo of drift after an equity rally"
          />
          <p className="text-caption text-(--text-muted)">{valid ? `${reason.trim().length} of 300 characters.` : "At least 5 characters."}</p>
        </div>
        {advance.error ? <ErrorState error={advance.error} /> : null}
      </div>
    </ConfirmDialog>
  );
}

/**
 * The Control Room's Monitoring tab (monitoring loop): the simulated market clock, which only the compliance officer
 * can move, and every client's drift from the mix they agreed to, with the rules their holdings now fail and any
 * rebalancing waiting for them. The officer watches and moves time; the client decides; the AI can only propose.
 */
export function MonitoringRoom() {
  const { data, isLoading, error, refetch } = useMonitoringOverview();
  const [advancing, setAdvancing] = useState(false);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
        <MarketCard market={data.market} onAdvance={() => setAdvancing(true)} />
        <Card>
          <CardContent className="space-y-4 px-6 py-5">
            <h2 className="flex items-center gap-2 text-form font-semibold text-(--text)">
              <Gauge className="size-5 text-(--primary)" aria-hidden /> Drift policy
            </h2>
            <dl className="grid grid-cols-3 gap-3">
              {(
                [
                  ["On target", data.counts.on_target],
                  ["Drifted", data.counts.drifted],
                  ["Rule breach", data.counts.rule_breach],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-(--border) bg-(--surface-2) px-3 py-2.5">
                  <dt className="text-caption text-(--text-muted)">{label}</dt>
                  <dd className="font-display text-section font-bold tabular-nums text-(--text)">{value}</dd>
                </div>
              ))}
            </dl>
            <ul className="space-y-2 text-body">
              <li className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-(--primary)" aria-hidden />
                <span className="text-(--text-muted)">
                  A class more than <span className="font-semibold text-(--text)">{g(data.band_pp)} points</span> from its target is drift (rules.json
                  drift_band_pp); the full gate also runs on the live weights.
                </span>
              </li>
              <li className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-(--primary)" aria-hidden />
                <span className="text-(--text-muted)">{data.policy}</span>
              </li>
              <li className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-(--primary)" aria-hidden />
                <span className="text-(--text-muted)">
                  A rebalancing priced before the market moved can no longer be confirmed: the client proposes a fresh one.
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="px-6 py-5">
          <h2 className="mb-1 flex items-center gap-2 text-form font-semibold text-(--text)">
            <Users className="size-5 text-(--primary)" aria-hidden /> Client portfolios
          </h2>
          <p className="text-body text-(--text-muted)">
            Each invested client&apos;s largest drift from their latest executed proposal, the rules their holdings fail today, and any
            rebalancing waiting for their Confirm.
          </p>
          {data.clients.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-body">
                <thead className="text-caption text-(--text-muted)">
                  <tr className="border-b border-(--border)">
                    <th className="py-2.5 pr-3 font-medium">Client</th>
                    <th className="py-2.5 pr-3 font-medium">Status</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Value</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Largest drift</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Portfolio drift</th>
                    <th className="py-2.5 pr-3 font-medium">Failing now</th>
                    <th className="py-2.5 font-medium">Rebalancing</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clients.map((c) => (
                    <tr key={c.user_id} className="border-b border-(--border) last:border-0">
                      <td className="py-3 pr-3">
                        <span className="font-semibold text-(--text)">{c.client}</span>
                        <span className="block text-caption text-(--text-muted)">
                          Client #{c.user_id} · target #{c.target_proposal_id}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <MonitoringStatusChip status={c.status === "none" ? "on_target" : c.status} />
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <Money value={c.total_value} />
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums">
                        <span className={c.outside_band ? "font-bold text-(--text)" : "text-(--text)"}>
                          {c.largest.drift_pp >= 0 ? "+" : ""}
                          {g(c.largest.drift_pp)} pts
                        </span>
                        <span className="block text-caption text-(--text-muted)">{ASSET_CLASS_LABEL[c.largest.asset_class]}</span>
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums">{g(c.portfolio_drift_pct)}%</td>
                      <td className="py-3 pr-3">
                        {c.rules_failing.length ? (
                          <span className="font-mono text-caption text-(--text)">
                            {c.rules_failing.map((id) => (c.new_failures.includes(id) ? `${id} (new)` : id)).join(", ")}
                          </span>
                        ) : (
                          <span className="text-caption text-(--text-muted)">None</span>
                        )}
                      </td>
                      <td className="py-3">
                        {c.open_rebalance ? (
                          <span className="flex flex-wrap items-center gap-1.5 text-caption">
                            #{c.open_rebalance.proposal_id}
                            <StatusBadge decision={c.open_rebalance.gate_decision} className="px-1.5 py-0.5 text-[11px] [&_svg]:size-3" />
                            {c.open_rebalance.stale ? <span className="text-(--text-muted)">priced before the last move</span> : null}
                          </span>
                        ) : (
                          <span className="text-caption text-(--text-muted)">None proposed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No invested portfolios yet" description="A client appears here once one of their proposals has been executed." />
          )}
        </CardContent>
      </Card>

      <AdvanceDialog open={advancing} onClose={() => setAdvancing(false)} market={data.market} />
    </div>
  );
}
