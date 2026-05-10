"use client";

import { useEffect, useState } from "react";
import { useStatus } from "@/hooks/useStatus";
import { Clock } from "lucide-react";

const POLL_INTERVAL_SECONDS = 30;

export function RefreshTimer() {
  const { data, isLoading } = useStatus();
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data) setLastUpdate(Date.now());
  }, [data]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading || !lastUpdate) return null;

  const elapsedSec = Math.floor((now - lastUpdate) / 1000);
  const nextRefreshIn = Math.max(0, POLL_INTERVAL_SECONDS - elapsedSec);
  const lastUpdateStr = new Date(lastUpdate).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="hidden items-center gap-2 text-xs text-gray-500 dark:text-gray-400 lg:flex">
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
