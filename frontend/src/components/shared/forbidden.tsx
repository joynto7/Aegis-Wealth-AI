import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Forbidden (Section 2.7.6): the account cannot open this screen, with a link home. */
export function Forbidden() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-(--border) bg-(--surface) px-6 py-16 text-center">
      <ShieldX className="size-8 text-(--reject)" aria-hidden />
      <p className="text-form font-semibold text-(--text)">Your account cannot open this screen.</p>
      <p className="max-w-sm text-body text-(--text-muted)">
        This page is restricted to a different role. If you think this is wrong, contact your administrator.
      </p>
      <Button asChild className="mt-1">
        <Link href="/">Back home</Link>
      </Button>
    </div>
  );
}
