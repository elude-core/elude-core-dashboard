import { AlertOctagon, AlertTriangle } from "lucide-react";

export interface DegradedBannerProps {
  state: "ok" | "stale" | "error";
  upstream?: string;
  staleSinceMs?: number;
  /**
   * Remplace le texte par défaut. Nécessaire pour les cas où "stale"/"error" ne
   * viennent pas d'un fetch avec retry auto (ex. instantané nocturne trop vieux :
   * pas de bouton Refresh, le message générique induirait en erreur).
   * Sans ces props, comportement strictement identique à avant (tous les appels existants).
   */
  title?: React.ReactNode;
  detail?: React.ReactNode;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

export function DegradedBanner({ state, upstream, staleSinceMs, title, detail }: DegradedBannerProps) {
  if (state === "ok") return null;

  if (state === "stale") {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-orange-900 text-sm dark:border-orange-600/50 dark:bg-orange-900/20 dark:text-orange-100"
      >
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-semibold">
            {title ?? (
              <>
                Données stale — {upstream} unreachable
                {staleSinceMs !== undefined && ` depuis ${formatDuration(staleSinceMs)}`}
              </>
            )}
          </p>
          <p className="text-xs opacity-80">{detail ?? "Retry auto dans 10s. Cliquer Refresh pour forcer."}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900 text-sm dark:border-red-600/50 dark:bg-red-900/20 dark:text-red-100"
    >
      <AlertOctagon className="h-5 w-5 flex-shrink-0" />
      <div>
        <p className="font-semibold">{title ?? `${upstream ?? "Service"} unavailable`}</p>
        <p className="text-xs opacity-80">{detail ?? `Pas de cache disponible. Vérifier ${upstream}.`}</p>
      </div>
    </div>
  );
}
