"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { RoleGate } from "@/components/shared/role-gate";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Money } from "@/components/shared/money";
import { Percent } from "@/components/shared/percent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageTitle } from "@/components/shell/page-title";
import { useProducts } from "@/lib/queries";
import { PRODUCT_TYPE_LABEL } from "@/mocks/data/products";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

const MAX_SELECTION = 3;

function ProductDetailDrawer({ product, onClose }: { product: Product | null; onClose: () => void }) {
  return (
    <Sheet open={!!product} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md">
        {product ? (
          <>
            <SheetHeader className="border-b border-(--border)">
              <SheetTitle>{product.name}</SheetTitle>
              <SheetDescription>{product.code} · {PRODUCT_TYPE_LABEL[product.type]}</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 overflow-y-auto p-4 text-body">
              <p className="text-(--text-muted)">{product.description}</p>
              <dl className="grid grid-cols-2 gap-y-2">
                <dt className="text-(--text-muted)">Risk level</dt>
                <dd className="text-right font-medium">R{product.risk_level}</dd>
                <dt className="text-(--text-muted)">Annual fee</dt>
                <dd className="text-right font-medium">
                  <Percent value={product.annual_fee_pct} decimals={2} />
                </dd>
                <dt className="text-(--text-muted)">Liquidity</dt>
                <dd className="text-right font-medium">{product.liquidity_days} day(s)</dd>
                <dt className="text-(--text-muted)">Lock-up</dt>
                <dd className="text-right font-medium">{product.lockup_months} month(s)</dd>
                <dt className="text-(--text-muted)">Minimum investment</dt>
                <dd className="text-right font-medium">
                  <Money value={product.min_investment} />
                </dd>
                <dt className="text-(--text-muted)">NAV</dt>
                <dd className="text-right font-medium tabular-nums">
                  {product.nav.toFixed(4)} ({product.nav_date})
                </dd>
                <dt className="text-(--text-muted)">Historical volatility</dt>
                <dd className="text-right font-medium">
                  <Percent value={product.volatility_pct} />
                </dd>
                <dt className="text-(--text-muted)">Historical max drawdown</dt>
                <dd className="text-right font-medium">
                  <Percent value={product.max_drawdown_pct} />
                </dd>
              </dl>
              {product.suitable === false ? (
                <Badge variant="outline" className="border-(--warning) text-(--warning)">
                  Above your tier
                </Badge>
              ) : null}
              <p className="text-caption text-(--text-muted)">{product.data_label} · {product.nav_date}</p>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ProductShelf() {
  usePageTitle("Product Shelf");
  const router = useRouter();
  const [type, setType] = useState<string>("all");
  const [onlySuitable, setOnlySuitable] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Product | null>(null);

  const { data, isLoading, error, refetch } = useProducts({ type: type === "all" ? undefined : type, q: query || undefined });

  const items = useMemo(() => {
    const list = data?.items ?? [];
    return onlySuitable ? list.filter((p) => p.suitable !== false) : list;
  }, [data, onlySuitable]);

  function toggle(code: string) {
    setSelected((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= MAX_SELECTION) return prev;
      return [...prev, code];
    });
  }

  return (
    <div>
      <PageHeader
        title="Product Shelf"
        description="20 sample products across 6 types. Select up to 3 to compare."
        action={
          <Button disabled={selected.length < 2} onClick={() => router.push(`/products/compare?codes=${selected.join(",")}`)}>
            Compare ({selected.length})
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-(--text-muted)" />
          <Input placeholder="Search by name or code" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56 pl-8" />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(PRODUCT_TYPE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox id="only-suitable" checked={onlySuitable} onCheckedChange={(v) => setOnlySuitable(!!v)} />
          <Label htmlFor="only-suitable" className="font-normal">
            Only products that suit me
          </Label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No products match" description="Try a different type, search term or filter." />
      ) : (
        <>
          {/* Table on md+, cards below */}
          <div className="hidden overflow-x-auto rounded-xl border border-(--border) bg-(--surface) md:block">
            <table className="w-full text-left text-body">
              <thead className="border-b border-(--border) text-caption text-(--text-muted)">
                <tr>
                  <th className="w-10 px-4 py-2" />
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Risk</th>
                  <th className="px-2 py-2">Fee</th>
                  <th className="px-2 py-2">Liquidity</th>
                  <th className="px-2 py-2">Lock-up</th>
                  <th className="px-2 py-2">Suitable</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <ProductRow
                    key={p.code}
                    product={p}
                    checked={selected.includes(p.code)}
                    disabled={!selected.includes(p.code) && selected.length >= MAX_SELECTION}
                    onToggle={() => toggle(p.code)}
                    onOpen={() => setDetail(p)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 md:hidden">
            {items.map((p) => (
              <button
                key={p.code}
                onClick={() => setDetail(p)}
                className="block w-full rounded-xl border border-(--border) bg-(--surface) p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-(--text)">{p.name}</p>
                  {p.suitable === false ? (
                    <Badge variant="outline" className="shrink-0 border-(--warning) text-(--warning)">
                      Above tier
                    </Badge>
                  ) : null}
                </div>
                <p className="text-caption text-(--text-muted)">
                  {PRODUCT_TYPE_LABEL[p.type]} · R{p.risk_level} · <Percent value={p.annual_fee_pct} decimals={2} /> fee
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      <ProductDetailDrawer product={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function ProductRow({
  product,
  checked,
  disabled,
  onToggle,
  onOpen,
}: {
  product: Product;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const checkbox = (
    <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} aria-label={`Select ${product.name}`} />
  );
  return (
    <tr className={cn("border-b border-(--border) last:border-0 hover:bg-(--muted)")}>
      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
        {disabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{checkbox}</span>
            </TooltipTrigger>
            <TooltipContent>You can compare up to 3 products at once.</TooltipContent>
          </Tooltip>
        ) : (
          checkbox
        )}
      </td>
      <td className="cursor-pointer px-2 py-2 font-medium text-(--text)" onClick={onOpen}>
        {product.name}
        <span className="ml-1.5 text-caption text-(--text-muted)">{product.code}</span>
      </td>
      <td className="cursor-pointer px-2 py-2 text-(--text-muted)" onClick={onOpen}>
        {PRODUCT_TYPE_LABEL[product.type]}
      </td>
      <td className="cursor-pointer px-2 py-2" onClick={onOpen}>
        R{product.risk_level}
      </td>
      <td className="cursor-pointer px-2 py-2" onClick={onOpen}>
        <Percent value={product.annual_fee_pct} decimals={2} />
      </td>
      <td className="cursor-pointer px-2 py-2" onClick={onOpen}>
        {product.liquidity_days}d
      </td>
      <td className="cursor-pointer px-2 py-2" onClick={onOpen}>
        {product.lockup_months}mo
      </td>
      <td className="cursor-pointer px-2 py-2" onClick={onOpen}>
        {product.suitable === null ? (
          <span className="text-(--text-muted)">—</span>
        ) : product.suitable ? (
          <Badge variant="outline" className="border-(--pass) text-(--pass)">
            Suitable
          </Badge>
        ) : (
          <Badge variant="outline" className="border-(--warning) text-(--warning)">
            Above your tier
          </Badge>
        )}
      </td>
    </tr>
  );
}

export default function ProductsPage() {
  return (
    <RoleGate role="client">
      <ProductShelf />
    </RoleGate>
  );
}
