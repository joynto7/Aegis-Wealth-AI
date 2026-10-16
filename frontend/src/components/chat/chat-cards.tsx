"use client";

import Link from "next/link";
import { ArrowRight, Scale, ShieldX, UserRound, ListChecks, Package, FileSpreadsheet, XCircle } from "lucide-react";
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
  ProductsCard,
  ProfileCard,
  ProposalCard,
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
      title={`Proposal #${card.proposal_id} · v${card.version}`}
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
