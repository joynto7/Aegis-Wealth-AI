"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Coins, Landmark, Plus, ScrollText, Search, SlidersHorizontal, TrendingUp, X, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { RiskMeter } from "@/components/shared/risk-meter";
import { SuitabilityBadge } from "@/components/shared/suitability-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageTitle } from "@/components/shell/page-title";
import { useProducts } from "@/lib/queries";
import { ASSET_CLASS_LABEL, PRODUCT_TYPE_LABEL } from "@/lib/labels";
import { useAssetColors } from "@/lib/asset-colors";
import { cn } from "@/lib/utils";
import type { AssetClass, Product } from "@/lib/types";

const MAX_SELECTION = 3;

const CLASS_ICON: Record<AssetClass, LucideIcon> = {
  cash: Landmark,
  bond: ScrollText,
  gold: Coins,
  equity: TrendingUp,
};

const FILTERS: { value: "all" | AssetClass; label: string }[] = [
  { value: "all", label: "All products" },
  { value: "cash", label: "Cash & deposits" },
  { value: "bond", label: "Bonds" },
  { value: "gold", label: "Gold" },
  { value: "equity", label: "Equity" },
];

type SortKey = "fee" | "risk" | "name";

function access(days: number): string {
  return days === 0 ? "Same day" : `${days} day${days === 1 ? "" : "s"}`;
}

function ClassIcon({ assetClass, size = "md" }: { assetClass: AssetClass; size?: "md" | "lg" }) {
  const colors = useAssetColors();
  const Icon = CLASS_ICON[assetClass];
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-xl", size === "lg" ? "size-12" : "size-10")}
      style={{ backgroundColor: `${colors[assetClass]}1f`, color: colors[assetClass] }}
      aria-hidden
    >
      <Icon className={size === "lg" ? "size-6" : "size-5"} />
    </span>
  );
}

function ProductDetailDrawer({ product, onClose }: { product: Product | null; onClose: () => void }) {
  return (
    <Sheet open={!!product} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md">
        {product ? (
          <>
            <SheetHeader className="border-b border-(--border)">
              <div className="flex items-center gap-3">
                <ClassIcon assetClass={product.asset_class} size="lg" />
                <div>
                  <SheetTitle>{product.name}</SheetTitle>
                  <SheetDescription>
                    {product.code} · {PRODUCT_TYPE_LABEL[product.type]}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="space-y-5 overflow-y-auto p-5 text-body">
              <p className="text-(--text-muted)">{product.description}</p>
              <div className="flex items-center justify-between rounded-xl bg-(--surface-2) p-3">
                <RiskMeter level={product.risk_level} />
                <SuitabilityBadge suitable={product.suitable} short />
              </div>
              <dl className="grid grid-cols-2 gap-3">
                {[
                  ["Annual fee", <Percent key="f" value={product.annual_fee_pct} decimals={2} />],
                  ["Access", access(product.liquidity_days)],
                  ["Lock-up", product.lockup_months ? `${product.lockup_months} months` : "None"],
                  ["Minimum", <Money key="m" value={product.min_investment} />],
                  ["Volatility (hist.)", <Percent key="v" value={product.volatility_pct} />],
                  ["Max drawdown (hist.)", <Percent key="d" value={product.max_drawdown_pct} />],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-(--border) p-3">
                    <dt className="text-caption text-(--text-muted)">{label}</dt>
                    <dd className="mt-0.5 font-display text-form font-bold text-(--text)">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-caption text-(--text-muted)">
                NAV {product.nav.toFixed(4)} on {product.nav_date} · {product.data_label}
              </p>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ProductCard({
  product,
  selected,
  disabled,
  onToggle,
  onOpen,
}: {
  product: Product;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      className={cn(
        "group flex flex-col rounded-2xl border bg-(--surface) p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raised",
        selected ? "border-(--primary) ring-2 ring-(--primary)/20" : "border-(--border)"
      )}
    >
      <div className="flex items-start gap-3">
        <ClassIcon assetClass={product.asset_class} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-(--text)">
            <button type="button" onClick={onOpen} className="text-left hover:text-(--primary) focus-visible:outline-none">
              {product.name}
            </button>
          </h3>
          <p className="text-caption text-(--text-muted)">
            {PRODUCT_TYPE_LABEL[product.type]} · <span className="font-mono">{product.code}</span>
          </p>
        </div>
      </div>

      <RiskMeter level={product.risk_level} className="mt-4" />

      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-(--surface-2) p-3">
        <div>
          <dt className="text-[11px] text-(--text-muted)">Annual fee</dt>
          <dd className="text-body font-semibold text-(--text)">
            <Percent value={product.annual_fee_pct} decimals={2} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-(--text-muted)">Access</dt>
          <dd className="text-body font-semibold text-(--text)">{access(product.liquidity_days)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-(--text-muted)">Lock-up</dt>
          <dd className="text-body font-semibold text-(--text)">{product.lockup_months ? `${product.lockup_months} mo` : "None"}</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-2">
        <SuitabilityBadge suitable={product.suitable} short />
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onOpen}>
            Details
          </Button>
          <Button
            variant={selected ? "default" : "outline"}
            size="sm"
            onClick={onToggle}
            disabled={disabled}
            aria-pressed={selected}
            title={disabled ? "You can compare up to 3 products at once." : undefined}
          >
            {selected ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
            {selected ? "Added" : "Compare"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function CompareTray({ products, onRemove, onClear, onCompare }: { products: Product[]; onRemove: (code: string) => void; onClear: () => void; onCompare: () => void }) {
  if (!products.length) return null;
  return (
    <div className="sticky bottom-6 z-20 mx-auto mt-6 max-w-3xl">
      <div className="bg-ink flex flex-wrap items-center gap-3 rounded-2xl border border-(--ink-border) p-3 pl-4 shadow-raised">
        <p className="text-body font-semibold text-white">
          Compare <span className="text-(--ink-muted)">({products.length}/{MAX_SELECTION})</span>
        </p>
        <ul className="flex flex-1 flex-wrap gap-2">
          {products.map((p) => (
            <li key={p.code} className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-3 pr-1 text-caption text-white">
              {p.name}
              <button
                type="button"
                onClick={() => onRemove(p.code)}
                className="flex size-5 items-center justify-center rounded-full hover:bg-white/15"
                aria-label={`Remove ${p.name}`}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-(--ink-muted) hover:bg-white/10 hover:text-white">
          Clear
        </Button>
        <Button size="sm" onClick={onCompare} disabled={products.length < 2} className="bg-white text-(--ink) hover:bg-white/90">
          {products.length < 2 ? "Pick one more" : "Compare now"} <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ProductShelf() {
  usePageTitle("Product Shelf");
  const router = useRouter();
  const [assetClass, setAssetClass] = useState<"all" | AssetClass>("all");
  const [onlySuitable, setOnlySuitable] = useState(false);
  const [sort, setSort] = useState<SortKey>("fee");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Product | null>(null);

  const { data, isLoading, error, refetch } = useProducts({ q: query || undefined });
  const all = useMemo(() => data?.items ?? [], [data]);

  const items = useMemo(() => {
    let list = all;
    if (assetClass !== "all") list = list.filter((p) => p.asset_class === assetClass);
    if (onlySuitable) list = list.filter((p) => p.suitable !== false);
    const sorted = [...list];
    sorted.sort((a, b) =>
      sort === "fee" ? a.annual_fee_pct - b.annual_fee_pct || a.risk_level - b.risk_level : sort === "risk" ? a.risk_level - b.risk_level || a.annual_fee_pct - b.annual_fee_pct : a.name.localeCompare(b.name)
    );
    return sorted;
  }, [all, assetClass, onlySuitable, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const p of all) c[p.asset_class] = (c[p.asset_class] ?? 0) + 1;
    return c;
  }, [all]);

  function toggle(code: string) {
    setSelected((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= MAX_SELECTION) return prev;
      return [...prev, code];
    });
  }

  const selectedProducts = selected.map((c) => all.find((p) => p.code === c)).filter((p): p is Product => !!p);

  return (
    <div>
      <PageHeader
        eyebrow="Invest"
        title="Product Shelf"
        description="Every product shows its risk level, cost and how fast you can get your money back. Pick up to three to compare."
      />

      <div className="mb-6 space-y-4 rounded-2xl border border-(--border) bg-(--surface) p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--text-muted)" />
            <Input placeholder="Search by name or code" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" aria-label="Search products" />
          </div>
          <button
            type="button"
            onClick={() => setOnlySuitable((v) => !v)}
            aria-pressed={onlySuitable}
            className={cn(
              "flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-body font-medium transition-colors",
              onlySuitable ? "border-(--primary) bg-(--primary-soft) text-(--primary)" : "border-(--border) text-(--text-muted) hover:text-(--text)"
            )}
          >
            <span className={cn("flex size-4 items-center justify-center rounded-[4px] border", onlySuitable ? "border-(--primary) bg-(--primary) text-white" : "border-(--border-strong)")}>
              {onlySuitable ? <Check className="size-3" /> : null}
            </span>
            Suitable for me
          </button>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-44" aria-label="Sort products">
              <SlidersHorizontal className="size-4 text-(--text-muted)" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fee">Lowest fee first</SelectItem>
              <SelectItem value="risk">Lowest risk first</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Asset class">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setAssetClass(f.value)}
              aria-pressed={assetClass === f.value}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-body font-medium transition-colors",
                assetClass === f.value ? "bg-(--ink) text-white" : "bg-(--surface-2) text-(--text-muted) ring-1 ring-(--border) hover:text-(--text)"
              )}
            >
              {f.label}
              <span className={cn("ml-1.5 text-caption", assetClass === f.value ? "text-white/70" : "text-(--text-muted)")}>{counts[f.value] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-60 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No products match" description={`Nothing in ${assetClass === "all" ? "the shelf" : ASSET_CLASS_LABEL[assetClass]} matches. Try another filter or search.`} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <ProductCard
              key={p.code}
              product={p}
              selected={selected.includes(p.code)}
              disabled={!selected.includes(p.code) && selected.length >= MAX_SELECTION}
              onToggle={() => toggle(p.code)}
              onOpen={() => setDetail(p)}
            />
          ))}
        </div>
      )}

      <CompareTray
        products={selectedProducts}
        onRemove={(code) => setSelected((prev) => prev.filter((c) => c !== code))}
        onClear={() => setSelected([])}
        onCompare={() => router.push(`/products/compare?codes=${selected.join(",")}`)}
      />

      <ProductDetailDrawer product={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <RoleGate role="client">
      <ProductShelf />
    </RoleGate>
  );
}
