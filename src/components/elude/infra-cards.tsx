import { Camera, Cpu, HardDrive, MemoryStick, Network, Server as ServerIcon } from "lucide-react";

import type { HetznerServer, HetznerSnapshot } from "@/app/api/hetzner/route";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { dot: string; chip: string }> = {
    running: {
      dot: "bg-green-500",
      chip: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    },
    off: {
      dot: "bg-red-500",
      chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    },
    stopped: {
      dot: "bg-red-500",
      chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    },
  };
  const style = styles[status] ?? {
    dot: "bg-yellow-500",
    chip: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs capitalize ${style.chip}`}
    >
      <span className={`inline-block size-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

export function VpsCard({ server }: { server: HetznerServer | null }) {
  if (!server) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <p className="text-gray-500">No server found in Hetzner account.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ServerIcon className="size-5 text-blue-500" />
            <h2 className="font-bold text-gray-900 text-xl dark:text-gray-100">{server.name}</h2>
          </div>
          <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
            {server.type} · {server.datacenter} ({server.location})
          </p>
          <p className="mt-1 font-mono text-gray-400 text-xs dark:text-gray-500">{server.ipv4}</p>
        </div>
        <StatusBadge status={server.status} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SpecTile icon={<Cpu className="size-4" />} label="vCPU" value={`${server.cores}`} />
        <SpecTile icon={<MemoryStick className="size-4" />} label="RAM" value={`${server.ramGB} GB`} />
        <SpecTile icon={<HardDrive className="size-4" />} label="Disk" value={`${server.diskGB} GB`} />
        <SpecTile
          icon={<Network className="size-4" />}
          label="Traffic"
          value={`${(server.ingoingTrafficGB + server.outgoingTrafficGB).toFixed(1)} GB`}
          hint={`/ ${server.includedTrafficGB.toFixed(0)} GB included`}
        />
      </div>
    </div>
  );
}

function SpecTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
      <div className="flex items-center gap-2 text-gray-500 text-xs dark:text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 font-bold text-gray-900 text-xl dark:text-gray-100">{value}</p>
      {hint && <p className="text-gray-400 text-xs dark:text-gray-500">{hint}</p>}
    </div>
  );
}

export function SnapshotsCard({ snapshots }: { snapshots: HetznerSnapshot[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Camera className="size-5 text-purple-500" />
        <h2 className="font-bold text-gray-900 text-lg dark:text-gray-100">Snapshots</h2>
        <span className="ml-auto text-gray-500 text-sm dark:text-gray-400">{snapshots.length}</span>
      </div>

      {snapshots.length === 0 ? (
        <p className="mt-4 text-gray-500 text-sm dark:text-gray-400">
          Aucun snapshot. Hetzner Cloud propose les snapshots à 0.01€/GB/mois — utile en complément des backups R2.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {snapshots.map((snap) => (
            <li key={snap.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-gray-900 text-sm dark:text-gray-100">
                  {snap.description || `Snapshot #${snap.id}`}
                </p>
                <p className="text-gray-500 text-xs dark:text-gray-400">
                  {new Date(snap.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-gray-700 text-sm dark:text-gray-300">
                  {snap.imageSizeGB ? `${snap.imageSizeGB.toFixed(1)} GB` : "--"}
                </p>
                <p className="text-gray-400 text-xs dark:text-gray-500">{snap.status}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
