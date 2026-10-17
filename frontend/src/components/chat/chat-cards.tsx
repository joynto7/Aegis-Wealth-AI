"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Crosshair,
  FileSpreadsheet,
  ListChecks,
  Package,
  Scale,
  ShieldX,
  Target,
  UserRound,
  Wand2,
  XCircle,
} from "lucide-react";
import { FanChart } from "@/components/charts/fan-chart";
import { Button } from "@/components/ui/button";
import { useProposeRebalance, useReviseProposal } from "@/lib/queries";
import { ApiError } from "@/lib/api-client";
import { StatusBadge } from "@/components/shared/status-badge";
import { SuitabilityBadge } from "@/components/shared/suitability-badge";
import { TierBadge } from "@/components/shared/tier-badge";
import { RegulationChips } from "@/components/shared/regulation-chips";
import { ASSET_ORDER } from "@/lib/asset-colors";
import { AllocationBar } from "@/components/shared/allocation-bar";
import { ASSET_CLASS_LABEL } from "@/lib/labels";
import { formatFeePercent, formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  BlockedCard,
  ChatCard,
  ComparisonCard,
  DriftCard,
  ProductsCard,
  ProfileCard,
  ProjectionCard,
  ProposalCard,
  RemedyCard,
  RuleCard,
} from "@/lib/types";
import { TOOL_LABEL } from "@/components/chat/reply-text";

/**
 * Chat cards (addition): each tool result behind a reply, drawn as a card.
 * The cards come from the tools' own output, never from the model's words,
 * so what a card shows is exactly what the engines computed.
 */
export function ChatCards({ cards, className }: { cards: ChatCard[] | null | undefined; className?: string }) {
  if (!cards?.length) return null;
  return (
    <div className={cn("space-y-2", className)}>
      {cards.map((card, i) => (
        <ChatCardView key={`${card.type}-${i}`} card={card} />
      ))}
    </div>
  );
}

function ChatCardView({ card }: { card: ChatCard }) {
  switch (card.type) {
    case "proposal":
      return <ProposalCardView card={card} />;
    case "comparison":
      return <ComparisonCardView card={card} />;
    case "profile":
      return <ProfileCardView card={card} />;
    case "rule":
      return <RuleCardView card={card} />;
    case "products":
      return <ProductsCardView card={card} />;
    case "blocked":
      return <BlockedCardView card={card} />;
    case "projection":
      return <ProjectionCardView card={card} />;
    case "remedy":
      return <RemedyCardView card={card} />;
    case "drift":
      return <DriftCardView card={card} />;
  }
}

function Shell({
  icon: Icon,
  title,
  aside,
  children,
  tone = "default",
}: {
  icon: typeof Scale;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "blocked";
}) {
  return (
    <section
      className={cn(
        "rounded-lg border bg-(--surface) p-3 text-left text-caption text-(--text) shadow-xs",
        tone === "blocked" ? "border-(--text-muted) border-dashed" : "border-(--border)"
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h4 className="flex min-w-0 items-center gap-1.5 font-semibold">
          <Icon className="size-3.5 shrink-0 text-(--primary)" aria-hidden />
          <span className="truncate">{title}</span>
        </h4>
        {aside}
      </header>
      {children}
    </section>
  );
}

function ProposalCardView({ card }: { card: ProposalCard }) {
  const weights = card.class_weights_pct;
  return (
    <Shell
      icon={FileSpreadsheet}
      title={`${card.kind === "rebalance" ? "Rebalancing" : "Proposal"} #${card.proposal_id} · v${card.version}`}
      aside={<StatusBadge decision={card.gate_decision} className="px-2 py-0.5 text-caption [&_svg]:size-3.5" />}
    >
      <AllocationBar weights={weights} legend={false} />
      <p className="mt-1.5 text-(--text-muted)">
        {ASSET_ORDER.filter((c) => weights[c] > 0)
          .map((c) => `${ASSET_CLASS_LABEL[c]} ${formatPercent(weights[c], 0)}`)
          .join(" · ")}
      </p>
      {card.failed_rules.length ? (
        <ul className="mt-2 space-y-1.5">
          {card.failed_rules.map((r) => (
            <li key={r.id} className="flex items-start gap-1.5">
              <XCircle
                className={cn("mt-0.5 size-3.5 shrink-0", r.type === "hard" ? "text-(--reject)" : "text-(--warning)")}
                aria-hidden
              />
              <span>
                <span className="font-medium">
                  <span className="font-mono">{r.id}</span> {r.name}
                </span>
                <span className="sr-only">{r.type === "hard" ? " failed" : " warning"}</span>
                <span className="block text-(--text-muted)">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-(--text-muted)">Every compliance rule passed.</p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-(--border) pt-2">
        <span className="text-(--text-muted)">
          {formatMoney(card.amount)} · {card.horizon_years} years · tier {card.tier}
        </span>
        <Link
          href={`/proposals/${card.proposal_id}`}
          className="inline-flex items-center gap-1 font-medium text-(--primary) hover:underline"
        >
          Open <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </Shell>
  );
}

function ComparisonCardView({ card }: { card: ComparisonCard }) {
  return (
    <Shell icon={Scale} title={`Fees on ${formatMoney(card.amount)} over ${card.horizon_years} years`}>
      <table className="w-full">
        <caption className="sr-only">Fee cost and value after fees for each product</caption>
        <thead className="text-(--text-muted)">
          <tr>
            <th className="pb-1 text-left font-normal">Product</th>
            <th className="pb-1 text-right font-normal">Fees</th>
            <th className="pb-1 text-right font-normal">After fees</th>
          </tr>
        </thead>
        <tbody>
          {card.items.map((item) => (
            <tr key={item.code} className="border-t border-(--border) align-top">
              <td className="py-1 pr-2">
                <span className="font-medium">{item.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-(--text-muted)">
                  Fee {formatFeePercent(item.annual_fee_pct)} · assumes {formatPercent(item.assumed_return_pct)} growth
                  {item.code === card.cheapest_code ? (
                    <span className="rounded-full bg-(--primary-soft) px-1.5 font-medium text-(--primary)">Lowest cost</span>
                  ) : null}
                </span>
                <SuitabilityBadge suitable={item.suitable} short className="mt-1" />
              </td>
              <td className="whitespace-nowrap py-1 text-right tabular-nums">{formatMoney(item.fee_cost)}</td>
              <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">{formatMoney(item.end_value_after_fees)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-(--text-muted)">Growth rates are assumptions before fees, not forecasts. {card.data_label}.</p>
    </Shell>
  );
}

function ProfileCardView({ card }: { card: ProfileCard }) {
  return (
    <Shell icon={UserRound} title="Your risk profile" aside={<TierBadge tier={card.tier} className="px-2 py-0.5 text-caption" />}>
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-(--text-muted)">Capacity</dt>
          <dd className="font-semibold tabular-nums">{card.capacity_score}</dd>
        </div>
        <div>
          <dt className="text-(--text-muted)">Willingness</dt>
          <dd className="font-semibold tabular-nums">{card.willingness_score}</dd>
        </div>
        <div>
          <dt className="text-(--text-muted)">Max loss</dt>
          <dd className="font-semibold tabular-nums">{formatPercent(card.max_acceptable_loss_pct, 0)}</dd>
        </div>
      </dl>
      {card.status !== "complete" ? (
        <p className="mt-2 text-(--text-muted)">Two answers contradict each other; fix them in Risk Profile.</p>
      ) : null}
    </Shell>
  );
}

function RuleCardView({ card }: { card: RuleCard }) {
  return (
    <Shell
      icon={ListChecks}
      title={`${card.id} ${card.name}`}
      aside={<span className="rounded-full bg-(--muted) px-2 py-0.5 text-(--text-muted)">{card.rule_type === "hard" ? "Hard rule" : "Warning"}</span>}
    >
      <p>{card.description}</p>
      <p className="mt-1 font-mono text-(--text-muted)">{card.threshold}</p>
      <RegulationChips basis={card.basis} className="mt-2" />
    </Shell>
  );
}

function ProductsCardView({ card }: { card: ProductsCard }) {
  return (
    <Shell icon={Package} title={`${card.total} product${card.total === 1 ? "" : "s"} found`}>
      <ul className="space-y-1">
        {card.items.map((item) => (
          <li key={item.code} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              {item.name} <span className="text-(--text-muted)">· R{item.risk_level} · {formatFeePercent(item.annual_fee_pct)}</span>
            </span>
            <SuitabilityBadge suitable={item.suitable} short />
          </li>
        ))}
      </ul>
      {card.total > card.items.length ? (
        <Link href="/products" className="mt-1.5 inline-block font-medium text-(--primary) hover:underline">
          {card.total - card.items.length} more on the Product Shelf
        </Link>
      ) : null}
    </Shell>
  );
}

function BlockedCardView({ card }: { card: BlockedCard }) {
  return (
    <Shell icon={ShieldX} title="Blocked by the permission broker" tone="blocked">
      <p>
        <span className="font-medium">{TOOL_LABEL[card.tool] ?? card.tool}</span>{" "}
        <span className="font-mono text-(--text-muted)">
          ({card.tool} · {card.tier})
        </span>
      </p>
      <p className="mt-0.5 text-(--text-muted)">Reason: {card.reason}</p>
    </Shell>
  );
}

function ProjectionCardView({ card }: { card: ProjectionCard }) {
  const chance = card.probability_target_pct;
  return (
    <Shell
      icon={Target}
      title={card.target_amount ? `Reaching ${formatMoney(card.target_amount)} in ${card.horizon_years} years` : `${card.horizon_years}-year projection`}
      aside={
        chance !== null ? (
          <span className="rounded-full bg-(--primary-soft) px-2 py-0.5 font-semibold tabular-nums text-(--primary)">{chance}% chance</span>
        ) : null
      }
    >
      <p className="text-(--text-muted)">{card.basis_label}</p>
      <div className="mt-2">
        <FanChart
          years={card.years}
          amount={card.amount}
          monthly={card.monthly_contribution}
          target={card.target_amount}
          height={132}
          compact
        />
      </div>
      <dl className="mt-1 grid grid-cols-3 gap-2">
        {(
          [
            ["Bad (P10)", card.end.p10],
            ["Typical", card.end.p50],
            ["Good (P90)", card.end.p90],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-(--text-muted)">{label}</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-(--border) pt-2">
        <span className="text-(--text-muted)">Illustrative, not a forecast</span>
        <Link href="/planner" className="inline-flex items-center gap-1 font-medium text-(--primary) hover:underline">
          Planner <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </Shell>
  );
}

/** The agent proposes; the client approves. Apply saves the fix as the next version, which the gate checks again. */
function RemedyCardView({ card }: { card: RemedyCard }) {
  const router = useRouter();
  const revise = useReviseProposal(card.proposal_id);
  const [appliedId, setAppliedId] = useState<number | null>(null);
  const error = revise.error instanceof ApiError ? revise.error : null;
  async function apply() {
    const next = await revise.mutateAsync(card.items);
    setAppliedId(next.id);
    router.push(`/proposals/${next.id}`);
  }
  return (
    <Shell
      icon={Wand2}
      title={`How to fix #${card.proposal_id}`}
      aside={
        <span className="flex items-center gap-1">
          <StatusBadge decision={card.gate_before} className="px-1.5 py-0.5 text-[11px] [&_svg]:size-3" />
          <ArrowRight className="size-3 text-(--text-muted)" aria-hidden />
          <StatusBadge decision={card.gate_after} className="px-1.5 py-0.5 text-[11px] [&_svg]:size-3" />
        </span>
      }
    >
      <ul className="space-y-1">
        {card.changes.map((c) => (
          <li key={c.product_code} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              {c.name} <span className="font-mono text-(--text-muted)">{c.rule_ids.join(" ")}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              <span className="text-(--text-muted)">{c.from_pct}%</span> → {c.to_pct}%
            </span>
          </li>
        ))}
      </ul>
      {card.failed_after.length ? (
        <p className="mt-1.5 text-(--text-muted)">Still a warning after the fix: {card.failed_after.join(", ")}.</p>
      ) : null}
      {error ? <p className="mt-1.5 text-(--reject)">{error.message}</p> : null}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-(--border) pt-2">
        <span className="text-(--text-muted)">Computed by code. You decide.</span>
        {appliedId ? (
          <span className="inline-flex items-center gap-1 font-medium text-(--primary)">
            <Check className="size-3.5" aria-hidden /> Saved as #{appliedId}
          </span>
        ) : card.changes.length ? (
          <Button size="sm" className="h-7 px-2.5 text-caption" onClick={apply} disabled={revise.isPending}>
            {revise.isPending ? "Applying…" : "Apply as a new version"}
          </Button>
        ) : null}
      </div>
    </Shell>
  );
}

const g = (n: number) => String(Number(n.toPrecision(6)));

/**
 * The check_drift result (monitoring loop): each class's live weight against the agreed mix at simulated prices. The
 * advisor can only report it; proposing a rebalancing here is the client's own click, and nothing trades until the
 * client's quiz and Confirm.
 */
function DriftCardView({ card }: { card: DriftCard }) {
  const router = useRouter();
  const propose = useProposeRebalance();
  const [proposedId, setProposedId] = useState<number | null>(null);
  const error = propose.error instanceof ApiError ? propose.error : null;
  async function onPropose() {
    const proposal = await propose.mutateAsync();
    setProposedId(proposal.id);
    router.push(`/proposals/${proposal.id}`);
  }
  if (card.status === "none" || !card.largest) {
    return (
      <Shell icon={Crosshair} title="Drift check">
        <p className="text-(--text-muted)">No invested portfolio yet: drift is measured once a proposal has been executed.</p>
      </Shell>
    );
  }
  const needed = card.outside_band || card.status === "rule_breach";
  const pendingId = proposedId ?? card.open_rebalance_id;
  return (
    <Shell
      icon={Crosshair}
      title={`Drift from proposal #${card.target_proposal_id}`}
      aside={
        <span className="rounded-full bg-(--surface-2) px-2 py-0.5 font-semibold tabular-nums ring-1 ring-(--border)">
          {card.largest.drift_pp >= 0 ? "+" : ""}
          {g(card.largest.drift_pp)} pts {ASSET_CLASS_LABEL[card.largest.asset_class].toLowerCase()}
        </span>
      }
    >
      <ul className="space-y-1">
        {card.classes.map((c) => (
          <li key={c.asset_class} className="flex items-center justify-between gap-2">
            <span>{ASSET_CLASS_LABEL[c.asset_class]}</span>
            <span className="tabular-nums">
              <span className="text-(--text-muted)">
                {g(c.current_pct)}% of {g(c.target_pct)}%
              </span>{" "}
              <span className={cn(c.outside_band && "font-bold")}>
                {c.drift_pp >= 0 ? "+" : ""}
                {g(c.drift_pp)}
              </span>
              {c.outside_band ? <span className="sr-only"> (outside the band)</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {card.rules_failing.length ? (
        <p className="mt-1.5 text-(--text-muted)">
          Failing on what you hold: <span className="font-mono text-(--text)">{card.rules_failing.join(", ")}</span>
        </p>
      ) : null}
      {needed && card.sell_total !== null ? (
        <p className="mt-1.5 text-(--text-muted)">Rebalancing would sell {formatMoney(card.sell_total)}.</p>
      ) : null}
      {error ? <p className="mt-1.5 text-(--reject)">{error.message}</p> : null}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-(--border) pt-2">
        <span className="text-(--text-muted)">
          Band ±{g(card.band_pp)} pts · simulated prices, {card.market_as_of}
        </span>
        {pendingId ? (
          <Link href={`/proposals/${pendingId}`} className="inline-flex items-center gap-1 font-medium text-(--primary) hover:underline">
            Open #{pendingId} <ArrowRight className="size-3" aria-hidden />
          </Link>
        ) : needed ? (
          <Button size="sm" className="h-7 px-2.5 text-caption" onClick={onPropose} disabled={propose.isPending}>
            {propose.isPending ? "Preparing…" : "Propose rebalancing"}
          </Button>
        ) : (
          <Link href="/account#risk" className="inline-flex items-center gap-1 font-medium text-(--primary) hover:underline">
            Details <ArrowRight className="size-3" aria-hidden />
          </Link>
        )}
      </div>
    </Shell>
  );
}
