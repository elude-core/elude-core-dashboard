import Link from "next/link";

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

export interface StatusBadgeProps {
  status: "ok" | "degraded" | "down" | "loading";
  upCount?: number;
  totalCount?: number;
}

const wrapperBase = "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition hover:opacity-80";

export function StatusBadge({ status, upCount, totalCount }: StatusBadgeProps) {
  let content: React.ReactNode;
  let cls: string;

  if (status === "loading") {
    cls = "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
    content = (
      <>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading…</span>
      </>
    );
  } else if (status === "ok") {
    cls = "bg-green-100 font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300";
    content = (
      <>
        <CheckCircle2 className="h-4 w-4" />
        <span>All systems operational</span>
      </>
    );
  } else if (status === "degraded") {
    const down = totalCount && upCount !== undefined ? totalCount - upCount : 0;
    cls = "bg-orange-100 font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
    content = (
      <>
        <AlertTriangle className="h-4 w-4" />
        <span>{down > 0 ? `${down} service${down > 1 ? "s" : ""} degraded` : "Degraded"}</span>
      </>
    );
  } else {
    cls = "bg-red-100 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300";
    content = (
      <>
        <XCircle className="h-4 w-4" />
        <span>System down</span>
      </>
    );
  }

  return (
    <Link href="/dashboard/stack-health" className={`${wrapperBase} ${cls}`} aria-label="Voir Stack Health">
      {content}
    </Link>
  );
}
