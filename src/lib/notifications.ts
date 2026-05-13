const TELEGRAM_WORKFLOW_ID = "7vErSUVq2lPWXjkq";

export type NotificationStatus = "down" | "up" | "test" | "error";

export interface Notification {
  id: string;
  startedAt: string;
  status: NotificationStatus;
  service: string;
  message: string;
  raw: string;
}

interface N8nExecution {
  id: string;
  status: string;
  startedAt: string;
  data?: {
    resultData?: {
      runData?: {
        [nodeName: string]: Array<{
          data?: { main?: Array<Array<{ json?: { text?: string } }>> };
        }>;
      };
    };
  };
}

function parseNotification(exec: N8nExecution): Notification | null {
  const fmt = exec.data?.resultData?.runData?.["Format Message"];
  const text = fmt?.[0]?.data?.main?.[0]?.[0]?.json?.text;
  if (!text) return null;

  const statusMatch = text.match(/^(🟢|🔴|🧪)\s*\*?(UP|DOWN|TEST)\*?\s*—\s*([^\n]+)/);
  if (!statusMatch) return null;

  const statusStr = statusMatch[2];
  const service = statusMatch[3].trim();
  const status: NotificationStatus = statusStr === "DOWN" ? "down" : statusStr === "UP" ? "up" : "test";

  const msgMatch = text.match(/💬\s*(.+?)(?:\n|$)/);
  const message = msgMatch ? msgMatch[1].trim() : "";

  return { id: exec.id, startedAt: exec.startedAt, status, service, message, raw: text };
}

export async function getNotifications(limit = 20): Promise<Notification[]> {
  const url = process.env.N8N_API_URL;
  const key = process.env.N8N_API_KEY;
  if (!url || !key) throw new Error("N8N env vars not set");
  const res = await fetch(
    `${url}/api/v1/executions?workflowId=${TELEGRAM_WORKFLOW_ID}&limit=${limit}&includeData=true`,
    { headers: { "X-N8N-API-KEY": key }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`n8n executions API ${res.status}`);
  const data = (await res.json()) as { data: N8nExecution[] };
  return data.data.map(parseNotification).filter((n): n is Notification => n !== null);
}
