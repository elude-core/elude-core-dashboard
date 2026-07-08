"use client";

import { useEffect, useMemo, useState } from "react";

import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

import { COUNTRY_CENTROIDS } from "./country-centroids";

/**
 * Carte monde HUD — landmass holographique (contour cyan lumineux) +
 * graticule discret + un dot pulsant par pays avec visiteurs actifs
 * (taille ∝ visiteurs, teinte unique : la magnitude est portée par la
 * TAILLE). Landmass : world-atlas `land-110m` (import dynamique, ~150 ko
 * hors bundle initial — aucun fetch réseau externe).
 */

const W = 960;
const H = 470;

export function WorldMap({
  countries,
  activeCountries = {},
}: {
  /** Trace 30 min (dots estompés). */
  countries: Record<string, number>;
  /** Sessions actives ≤ 5 min (dots brillants + pulse) — cohérent avec le
   *  compteur « en ligne » du header. */
  activeCountries?: Record<string, number>;
}) {
  const [landPath, setLandPath] = useState<string | null>(null);

  const projection = useMemo(
    () =>
      geoNaturalEarth1().fitExtent(
        [
          [8, 8],
          [W - 8, H - 8],
        ],
        { type: "Sphere" },
      ),
    [],
  );
  const graticulePath = useMemo(() => geoPath(projection)(geoGraticule10()) ?? undefined, [projection]);

  useEffect(() => {
    let alive = true;
    import("world-atlas/land-110m.json")
      .then((mod) => {
        if (!alive) return;
        const topo = (mod.default ?? mod) as unknown as Topology<{
          land: GeometryCollection;
        }>;
        const land = feature(topo, topo.objects.land) as unknown as FeatureCollection<Geometry>;
        setLandPath(geoPath(projection)(land) ?? null);
      })
      .catch(() => {
        // landmass indisponible → la page reste utilisable (dots sans fond)
      });
    return () => {
      alive = false;
    };
  }, [projection]);

  const dots = useMemo(() => {
    const isos = new Set([...Object.keys(countries), ...Object.keys(activeCountries)]);
    const all = Array.from(isos).map((iso) => ({
      iso,
      n30: countries[iso] ?? 0,
      nActive: activeCountries[iso.toUpperCase()] ?? activeCountries[iso] ?? 0,
    }));
    const max = Math.max(1, ...all.map((d) => Math.max(d.n30, d.nActive)));
    return all
      .map(({ iso, n30, nActive }) => {
        const c = COUNTRY_CENTROIDS[iso.toUpperCase()];
        if (!c) return null;
        const xy = projection(c);
        if (!xy) return null;
        const n = Math.max(n30, nActive);
        // rayon 5→18 px, racine carrée (aire ∝ visiteurs, pas le rayon)
        const r = 5 + 13 * Math.sqrt(n / max);
        return { iso, n: nActive > 0 ? nActive : n30, active: nActive > 0, x: xy[0], y: xy[1], r };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => b.r - a.r);
  }, [countries, activeCountries, projection]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Visiteurs actifs par pays">
      <defs>
        <filter id="hudGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {graticulePath ? <path d={graticulePath} fill="none" stroke="#67e8f9" strokeWidth={0.3} opacity={0.1} /> : null}
      {landPath ? (
        <>
          {/* halo du contour puis landmass — effet hologramme ; le contour se
              DESSINE au boot (pathLength normalisé → dasharray 1), le fill
              apparaît ensuite en fondu. */}
          <path d={landPath} fill="none" stroke="#22d3ee" strokeWidth={1.6} opacity={0.12} filter="url(#hudGlow)" />
          <path
            d={landPath}
            pathLength={1}
            className="tv-draw tv-fill"
            fill="#0a1826"
            stroke="#2dd4ef"
            strokeWidth={0.55}
            strokeOpacity={0.5}
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}

      {dots.map((d) =>
        d.active ? (
          // EN LIGNE (≤5 min) : brillant, pulse radar, réticule, label
          <g key={d.iso} transform={`translate(${d.x},${d.y})`}>
            <circle r={d.r} fill="none" stroke="#22d3ee" strokeWidth={1.4} className="tv-pulse" />
            <circle r={d.r} fill="#22d3ee" opacity={0.12} />
            <circle r={Math.max(3.2, d.r * 0.4)} fill="#7df3ff" filter="url(#hudGlow)" />
            <line x1={-d.r - 6} x2={-d.r - 2} y1={0} y2={0} stroke="#67e8f9" strokeWidth={1} opacity={0.7} />
            <line x1={d.r + 2} x2={d.r + 6} y1={0} y2={0} stroke="#67e8f9" strokeWidth={1} opacity={0.7} />
            <text
              y={-d.r - 7}
              textAnchor="middle"
              fill="#aef4ff"
              fontSize={13}
              fontWeight={600}
              style={{ letterSpacing: "0.08em" }}
            >
              {d.iso} · {d.n}
            </text>
          </g>
        ) : (
          // trace 30 min : dot statique estompé, sans pulse ni label
          <g key={d.iso} transform={`translate(${d.x},${d.y})`} opacity={0.35}>
            <circle r={Math.max(2.6, d.r * 0.3)} fill="#2dd4ef" />
          </g>
        ),
      )}
    </svg>
  );
}
