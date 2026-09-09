export interface KpiCardProps {
  label: string;
  value: number | null;
  unit?: string;
  format?: "percent" | "rate" | "gigabytes" | "plain" | "eur";
  total?: number; // pour les barres (RAM)
  hint?: string;
  /**
   * Préfixe les valeurs positives d'un "+". Réservé aux écarts/variations (ex. CA web
   * vs l'an dernier) — un ratio absolu comme un uptime ou un % de CPU n'est pas une
   * variation, "+99,50%" n'y aurait pas de sens. `false` par défaut : à activer
   * explicitement tuile par tuile, jamais globalement pour ce format.
   */
  signed?: boolean;
}

function formatValue(value: number, format: KpiCardProps["format"], signed: boolean): string {
  const signe = signed && value > 0 ? "+" : "";
  switch (format) {
    case "percent":
      return `${signe}${value.toFixed(2)}%`;
    case "rate":
      if (value >= 1000) return `${signe}${(value / 1000).toFixed(1)}k`;
      return `${signe}${value.toFixed(0)}`;
    case "gigabytes":
      return `${signe}${value.toFixed(1)}`;
    case "eur":
      // Même convention que `eur()` dans components/elude/ventes/format.ts — dupliquée
      // plutôt qu'importée : un composant générique ne doit pas dépendre d'un module feature.
      return `${signe}${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
    default:
      return `${signe}${value.toFixed(0)}`;
  }
}

export function KpiCard({ label, value, unit, format = "plain", total, hint, signed = false }: KpiCardProps) {
  if (value === null) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <p className="font-medium text-gray-500 text-sm dark:text-gray-400">{label}</p>
        <p className="mt-2 font-bold text-3xl text-gray-300 dark:text-gray-700">--</p>
        {hint && <p className="mt-1 text-gray-400 text-xs">{hint}</p>}
      </div>
    );
  }

  const formatted = formatValue(value, format, signed);
  const pctOfTotal = total ? (value / total) * 100 : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <p className="font-medium text-gray-500 text-sm dark:text-gray-400">{label}</p>
      <p className="mt-2 font-bold text-3xl text-gray-900 dark:text-gray-100">
        {formatted}
        {unit && <span className="ml-1 font-normal text-base text-gray-500">{unit}</span>}
        {total && (
          <span className="ml-1 font-normal text-base text-gray-500">
            {" "}
            / {total.toFixed(0)}
            {unit ?? ""}
          </span>
        )}
      </p>
      {pctOfTotal !== null && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div className="h-full bg-blue-500" style={{ width: `${Math.min(pctOfTotal, 100)}%` }} />
        </div>
      )}
      {hint && <p className="mt-1 text-gray-400 text-xs">{hint}</p>}
    </div>
  );
}
