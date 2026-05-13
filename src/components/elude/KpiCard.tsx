export interface KpiCardProps {
  label: string;
  value: number | null;
  unit?: string;
  format?: "percent" | "rate" | "gigabytes" | "plain";
  total?: number; // pour les barres (RAM)
  hint?: string;
}

function formatValue(value: number, format: KpiCardProps["format"]): string {
  switch (format) {
    case "percent":
      return `${value.toFixed(2)}%`;
    case "rate":
      if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
      return value.toFixed(0);
    case "gigabytes":
      return value.toFixed(1);
    default:
      return value.toFixed(0);
  }
}

export function KpiCard({ label, value, unit, format = "plain", total, hint }: KpiCardProps) {
  if (value === null) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <p className="font-medium text-gray-500 text-sm dark:text-gray-400">{label}</p>
        <p className="mt-2 font-bold text-3xl text-gray-300 dark:text-gray-700">--</p>
        {hint && <p className="mt-1 text-gray-400 text-xs">{hint}</p>}
      </div>
    );
  }

  const formatted = formatValue(value, format);
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
