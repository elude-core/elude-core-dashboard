"use client";

import { useCallback, useEffect, useState } from "react";

import { CheckCircle2, GitBranch, Loader2, PlayCircle, RefreshCw, XCircle } from "lucide-react";

const HEALTH_URL = process.env.NEXT_PUBLIC_SYNC_HEALTH_URL || "https://sync.elude.fr/health/pipeline";

const REFRESH_INTERVAL_MS = 30_000;

type CheckResult = {
  ok: boolean;
  count?: number;
  error?: string;
  sample_sku?: string;
  sample_handle?: string;
  brand_host?: string;
  status?: number;
  location?: string;
};

type HealthResponse = {
  ok: boolean;
  duration_ms: number;
  ts: string;
  checks: {
    medusa_active_published: CheckResult;
    meili_docs: CheckResult;
    payload_products: CheckResult;
    payload_without_sku: CheckResult;
    medusa_handles_tmp: CheckResult;
    medusa_variants_without_sku: CheckResult;
    catch_all_308: CheckResult;
  };
};

/**
 * Métadonnées d'affichage par check. `tolerant: true` = un count > 0 n'est
 * pas une alerte (juste une info). Les checks sans `tolerant` doivent ok=true
 * pour être en vert.
 */
const CHECK_META: Record<keyof HealthResponse["checks"], { label: string; description: string; tolerant?: boolean }> = {
  medusa_active_published: {
    label: "Medusa produits actifs",
    description: "status=published, deleted_at IS NULL",
  },
  meili_docs: {
    label: "Meili docs indexés",
    description: "Doit matcher Medusa actifs",
  },
  payload_products: {
    label: "Payload products",
    description: "Doit matcher Medusa actifs",
  },
  payload_without_sku: {
    label: "Payload sans SKU",
    description: "Devrait être à 0 (sinon bug subscriber)",
  },
  medusa_handles_tmp: {
    label: "Handles tmp- (sans url_key Akeneo)",
    description: "Info — produits Akeneo sans url_key rempli",
    tolerant: true,
  },
  medusa_variants_without_sku: {
    label: "Medusa variants sans SKU",
    description: "Devrait être à 0",
  },
  catch_all_308: {
    label: "Catch-all 308 (sample HTTP test)",
    description: "Vérifie qu'un produit Akeneo redirige bien vers /p/<sku>-<handle>",
  },
};

function StatusIcon({ ok, loading }: { ok: boolean; loading?: boolean }) {
  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />;
  return ok ? (
    <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden />
  ) : (
    <XCircle className="h-5 w-5 text-red-500" aria-hidden />
  );
}

function CheckCard({
  meta,
  result,
}: {
  meta: { label: string; description: string; tolerant?: boolean };
  result: CheckResult;
}) {
  const isOk = meta.tolerant ? result.error === undefined : result.ok;
  return (
    <div
      className={`rounded-lg border p-4 ${
        isOk
          ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20"
          : "border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <StatusIcon ok={isOk} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold text-sm">{meta.label}</h3>
            {typeof result.count === "number" && (
              <span className="font-bold font-mono text-lg tabular-nums">{result.count}</span>
            )}
          </div>
          <p className="mt-1 text-muted-foreground text-xs">{meta.description}</p>
          {result.error && (
            <p className="mt-2 break-all font-mono text-red-700 text-xs dark:text-red-300">{result.error}</p>
          )}
          {result.sample_sku && result.sample_handle && (
            <p className="mt-2 text-muted-foreground text-xs">
              Sample: <code className="font-mono">{result.sample_sku}</code> →{" "}
              <code className="font-mono">/{result.sample_handle}</code>
              {result.status && (
                <>
                  {" → HTTP "}
                  <span className={result.status === 308 ? "font-bold text-emerald-600" : "font-bold text-red-600"}>
                    {result.status}
                  </span>
                </>
              )}
              {result.location && (
                <>
                  {" → "}
                  <code className="break-all font-mono">{result.location}</code>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SyncPipelineClient() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(HEALTH_URL, { cache: "no-store" });
      // Le endpoint renvoie 503 si certains checks fail mais le body reste
      // valide. On parse même sur status non-200.
      const json = (await res.json()) as HealthResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const interval = setInterval(() => {
      void fetchHealth();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const allOk = data?.ok ?? false;
  const lastCheck = data?.ts ? new Date(data.ts).toLocaleTimeString("fr-FR") : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl text-gray-900 dark:text-gray-100">
            <GitBranch className="h-6 w-6" aria-hidden />
            Sync Pipeline
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Akeneo → Medusa → Payload → Meili → Storefront. Refresh auto toutes les 30s.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchHealth}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 font-medium text-sm hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      {loading && !data && <p className="text-muted-foreground">Loading…</p>}

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">Fetch failed</p>
          <p className="mt-1 font-mono text-sm">{error}</p>
          <p className="mt-2 text-xs">URL: {HEALTH_URL}</p>
        </div>
      )}

      {data && (
        <>
          <div
            className={`rounded-lg border p-4 ${
              allOk
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
            }`}
          >
            <div className="flex items-center gap-3">
              <StatusIcon ok={allOk} />
              <div>
                <p className="font-semibold text-base">Pipeline {allOk ? "OK" : "DEGRADED"}</p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {lastCheck && `Dernière vérif : ${lastCheck}`}
                  {data.duration_ms && ` · ${data.duration_ms}ms`}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(Object.keys(CHECK_META) as Array<keyof HealthResponse["checks"]>).map((key) => (
              <CheckCard key={key} meta={CHECK_META[key]} result={data.checks[key]} />
            ))}
          </div>
        </>
      )}

      <SmokeTestSection />
    </div>
  );
}

type SmokeTestStep = {
  ok: boolean;
  duration_ms: number;
  details?: Record<string, unknown>;
  error?: string;
};

type SmokeTestResult = {
  ok: boolean;
  sku: string;
  total_duration_ms: number;
  ts: string;
  steps: {
    enqueue_sync: SmokeTestStep;
    medusa_synced: SmokeTestStep;
    meili_indexed: SmokeTestStep;
    payload_present: SmokeTestStep;
    storefront_308: SmokeTestStep;
    storefront_200: SmokeTestStep;
  };
};

const SMOKE_STEP_LABELS: Record<keyof SmokeTestResult["steps"], string> = {
  enqueue_sync: "1. Enqueue resync (Akeneo → elude-sync queue)",
  medusa_synced: "2. Medusa product mis à jour",
  meili_indexed: "3. Meili doc indexé",
  payload_present: "4. Payload product présent",
  storefront_308: "5. Storefront /<handle> → 308",
  storefront_200: "6. Storefront /p/<sku>-<handle> → 200",
};

function SmokeTestSection() {
  const [sku, setSku] = useState("R898");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SmokeTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSmoke = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/smoke-test?sku=${encodeURIComponent(sku)}`, {
        method: "POST",
      });
      const body = (await res.json()) as SmokeTestResult | { ok: false; error: string };
      if ("steps" in body) {
        setResult(body);
      } else {
        setError(body.error ?? "Unknown error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [sku]);

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-lg">
          <PlayCircle className="h-5 w-5" aria-hidden />
          Smoke test
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Force un resync d'un SKU et asserte chaque étage du pipeline. Bouclier de contrôle "happy path" — utile après
          un changement d'archi ou pour debug.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="smoke-sku" className="mb-1 block font-medium text-muted-foreground text-xs">
            SKU à tester
          </label>
          <input
            id="smoke-sku"
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase().trim())}
            disabled={running}
            className="w-full max-w-xs rounded-md border bg-background px-3 py-1.5 font-mono text-sm disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={runSmoke}
          disabled={running || !sku}
          className="inline-flex items-center gap-2 rounded-md border bg-primary px-4 py-1.5 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <PlayCircle className="h-4 w-4" aria-hidden />
          )}
          {running ? "Running…" : "Run smoke test"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-700 text-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">Smoke test failed</p>
          <p className="mt-1 font-mono">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div
            className={`rounded-md border p-3 ${
              result.ok
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
            }`}
          >
            <p className="flex items-center gap-2 font-semibold">
              <StatusIcon ok={result.ok} />
              SKU {result.sku} : {result.ok ? "ALL GREEN" : "FAILED"} ({result.total_duration_ms}ms)
            </p>
          </div>

          <ul className="space-y-2">
            {(Object.keys(SMOKE_STEP_LABELS) as Array<keyof SmokeTestResult["steps"]>).map((key) => {
              const step = result.steps[key];
              return (
                <li key={key} className="flex items-start gap-3 rounded-md border bg-background p-3">
                  <StatusIcon ok={step.ok} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-sm">{SMOKE_STEP_LABELS[key]}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">{step.duration_ms}ms</span>
                    </div>
                    {step.error && (
                      <p className="mt-1 break-all font-mono text-red-700 text-xs dark:text-red-300">{step.error}</p>
                    )}
                    {step.details && (
                      <pre className="mt-1 whitespace-pre-wrap break-all text-muted-foreground text-xs">
                        {JSON.stringify(step.details, null, 0)}
                      </pre>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
