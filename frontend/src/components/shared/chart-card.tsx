import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataLabel } from "@/components/shared/data-label";

/** ChartCard (Section 2.7.4): a card around a chart, with a text summary for screen readers. */
export function ChartCard({
  title,
  summary,
  dataLabel,
  children,
  action,
}: {
  title: string;
  summary: string;
  dataLabel?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-6">
        <h3 className="text-form font-semibold text-(--text)">{title}</h3>
        <div className="flex items-center gap-2">
          {dataLabel ? <DataLabel label={dataLabel} /> : null}
          {action}
        </div>
      </CardHeader>
      <CardContent className="px-6">
        <p className="sr-only">{summary}</p>
        <div aria-hidden>{children}</div>
      </CardContent>
    </Card>
  );
}
