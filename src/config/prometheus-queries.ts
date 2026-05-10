export const PROM_QUERIES = {
  uptime7d: `avg_over_time(up[7d]) * 100`,
  medusaReqRate: `sum(rate(http_requests_total{job="medusa"}[1h]))`,
  cpuPct: `100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`,
  ramUsedGB: `(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / 1e9`,
} as const

export type KpiKey = keyof typeof PROM_QUERIES
