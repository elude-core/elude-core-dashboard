import type { HetznerServer, HetznerSnapshot } from '@/app/api/hetzner/route'
import { Cpu, HardDrive, MemoryStick, Network, Server as ServerIcon, Camera } from 'lucide-react'

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'running'
      ? 'bg-green-500'
      : status === 'off' || status === 'stopped'
      ? 'bg-red-500'
      : 'bg-yellow-500'
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block size-2.5 rounded-full ${color}`} />
      <span className="text-sm capitalize">{status}</span>
    </span>
  )
}

export function VpsCard({ server }: { server: HetznerServer | null }) {
  if (!server) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <p className="text-gray-500">No server found in Hetzner account.</p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ServerIcon className="size-5 text-blue-500" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{server.name}</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {server.type} · {server.datacenter} ({server.location})
          </p>
          <p className="mt-1 font-mono text-xs text-gray-400">{server.ipv4}</p>
        </div>
        <StatusDot status={server.status} />
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
  )
}

function SpecTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

export function SnapshotsCard({ snapshots }: { snapshots: HetznerSnapshot[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Camera className="size-5 text-purple-500" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Snapshots</h2>
        <span className="ml-auto text-sm text-gray-500">{snapshots.length}</span>
      </div>

      {snapshots.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          Aucun snapshot. Hetzner Cloud propose les snapshots à 0.01€/GB/mois — utile en complément des backups
          R2.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {snapshots.map((snap) => (
            <li key={snap.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {snap.description || `Snapshot #${snap.id}`}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(snap.createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono text-gray-700 dark:text-gray-300">
                  {snap.imageSizeGB ? `${snap.imageSizeGB.toFixed(1)} GB` : '--'}
                </p>
                <p className="text-xs text-gray-400">{snap.status}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
