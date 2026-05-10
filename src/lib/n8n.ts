export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface N8nExecution {
  id: number;
  finished: boolean;
  mode: string;
  status: "success" | "error" | "running" | "waiting" | "canceled" | "unknown";
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  workflowName?: string;
}

export interface N8nStats {
  totalWorkflows: number;
  activeWorkflows: number;
  executions24h: number;
  errors24h: number;
  lastExecution: N8nExecution | null;
  recentRuns: N8nExecution[];
}

async function n8nFetch(path: string): Promise<unknown> {
  const url = process.env.N8N_API_URL;
  const key = process.env.N8N_API_KEY;
  if (!url) throw new Error("N8N_API_URL env var is not set");
  if (!key) throw new Error("N8N_API_KEY env var is not set");
  const res = await fetch(`${url}${path}`, {
    headers: { "X-N8N-API-KEY": key, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`n8n API ${res.status}: ${path}`);
  return res.json();
}

export async function listWorkflows(): Promise<N8nWorkflow[]> {
  const data = (await n8nFetch("/api/v1/workflows?limit=250")) as { data: N8nWorkflow[] };
  return data.data;
}

export async function listExecutions(limit = 50): Promise<N8nExecution[]> {
  const data = (await n8nFetch(`/api/v1/executions?limit=${limit}`)) as { data: N8nExecution[] };
  return data.data;
}

export async function getStats(): Promise<N8nStats> {
  const [workflows, executions] = await Promise.all([listWorkflows(), listExecutions(50)]);

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = executions.filter((e) => new Date(e.startedAt).getTime() >= dayAgo);

  const activeWorkflows = workflows.filter((w) => w.active).length;
  const errors24h = last24h.filter((e) => e.status === "error").length;

  // Inject workflow name into execution
  const wfMap = new Map(workflows.map((w) => [w.id, w.name]));
  const enriched = executions.map((e) => ({
    ...e,
    workflowName: wfMap.get(e.workflowId) ?? "(unknown)",
  }));

  return {
    totalWorkflows: workflows.length,
    activeWorkflows,
    executions24h: last24h.length,
    errors24h,
    lastExecution: enriched[0] ?? null,
    recentRuns: enriched.slice(0, 10),
  };
}
