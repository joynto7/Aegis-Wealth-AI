"use client";

import Link from "next/link";
import { Repeat } from "lucide-react";
import { Panel } from "@/components/shared/panel";
import { Money } from "@/components/shared/money";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DriftChart } from "@/components/monitoring/drift-chart";
import { TradesTable } from "@/components/monitoring/trades-table";
import { formatDate } from "@/lib/format";
import type { ProposalRebalance } from "@/lib/types";

const g = (n: number) => String(Number(n.toPrecision(6)));

/** The banner a rebalancing shows once the market has moved, or the holdings changed, since it was priced. */
export function StaleRebalance() {
  return (
    <Alert>
      <AlertTitle>Prices have moved since this rebalancing was priced</AlertTitle>
      <AlertDescription>
        It can no longer be confirmed, because the trades would not match what you hold.{" "}
        <Link href="/account#risk" className="font-medium text-(--primary) hover:underline">
          Propose a fresh one from your account
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}

/** A rebalancing proposal's trades, priced at one market month, with the drift that prompted it. */
export function RebalancePanel({ rebalance }: { rebalance: ProposalRebalance }) {
  return (
    <Panel
      icon={Repeat}
      title="Rebalancing trades"
      description={
        <>
          Back to the mix of{" "}
          <Link href={`/proposals/${rebalance.source_proposal_id}`} className="font-medium text-(--primary) hover:underline">
            proposal #{rebalance.source_proposal_id}
          </Link>
          , priced at the simulated prices of {formatDate(rebalance.market_as_of)}. The sales come first and fund the purchases.
        </>
      }
    >
      <div className="space-y-5">
        {rebalance.stale ? <StaleRebalance /> : null}
        <TradesTable trades={rebalance.trades} />
        <dl className="grid grid-cols-2 gap-3 text-body sm:grid-cols-4">
          <div>
            <dt className="text-caption text-(--text-muted)">Sells</dt>
            <dd className="font-semibold text-(--text)">
              <Money value={rebalance.sell_total} withCents />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-(--text-muted)">Buys</dt>
            <dd className="font-semibold text-(--text)">
              <Money value={rebalance.buy_total} withCents />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-(--text-muted)">Cash released</dt>
            <dd className="font-semibold text-(--text)">
              <Money value={rebalance.net_cash} withCents />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-(--text-muted)">Turnover</dt>
            <dd className="font-semibold tabular-nums text-(--text)">{g(rebalance.turnover_pct)}% of the value</dd>
          </div>
        </dl>
        <div className="space-y-2">
          <h3 className="text-body font-semibold text-(--text)">The drift it corrects</h3>
          <DriftChart classes={rebalance.drift_before} band={rebalance.band_pp} compact />
        </div>
      </div>
    </Panel>
  );
}
