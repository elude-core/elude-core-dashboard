"use client";

import { Clock } from "lucide-react";

import { useLastStatusFetchAt, useStatus } from "@/hooks/useStatus";

const POLL_INTERVAL_SECONDS = 10;

export function RefreshTimer() {
  const { isLoading } = useStatus();
  const lastFetchAt = useLastStatusFetchAt();

  if (isLoading || lastFetchAt === 0) return null;
  // eslint-disable-next-line react-hooks/purity
  const elapsedSec = Math.floor((Date.now() - lastFetchAt) / 1000);
  const nextRefreshIn = Math.max(0, POLL_INTERVAL_SECONDS - elapsedSec);
  const lastUpdateStr = new Date(lastFetchAt).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="hidden items-center gap-2 text-gray-500 text-xs lg:flex dark:text-gray-400">
      <Clock className="h-3.5 w-3.5" />
      <span className="tabular-nums">
        Updated <span className="font-medium text-gray-700 dark:text-gray-300">{lastUpdateStr}</span>
      </span>
      <span className="text-gray-300 dark:text-gray-700">·</span>
      <span className="tabular-nums">
        Next in <span className="font-medium text-gray-700 dark:text-gray-300">{nextRefreshIn}s</span>
      </span>
    </div>
  );
}
