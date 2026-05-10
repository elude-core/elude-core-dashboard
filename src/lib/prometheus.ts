export interface PromInstantResponse {
  status: 'success' | 'error'
  data: {
    resultType: 'vector'
    result: Array<{
      metric: Record<string, string>
      value: [number, string] // [timestamp, value]
    }>
  }
}

const PROM_URL = process.env.PROMETHEUS_URL!
if (!PROM_URL) throw new Error('PROMETHEUS_URL env var is not set')

export async function promQuery(promQL: string): Promise<number | null> {
  const url = `${PROM_URL}/api/v1/query?query=${encodeURIComponent(promQL)}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Prometheus query ${res.status}: ${promQL}`)

  const json = (await res.json()) as PromInstantResponse
  if (json.status !== 'success') throw new Error(`Prometheus query failed: ${JSON.stringify(json)}`)
  if (json.data.result.length === 0) return null
  return parseFloat(json.data.result[0].value[1])
}
