"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { useCommerceLive } from "@/hooks/useCommerceLive";
import { useUmamiLive } from "@/hooks/useUmamiLive";

import { tvAudio } from "./audio";
import { countryFlag } from "./country-centroids";
import { WorldMap } from "./WorldMap";

/** Slug d'URL → libellé lisible à 3 m sur une télé.
 *  "/p/r106-rogneuse-manuelle-sur-stand-neolt..." → "Rogneuse manuelle sur stand Neolt…" */
function humanizePath(path: string): { kind: string; label: string } {
  const clean = path.split("?")[0] ?? "/";
  if (clean === "/" || clean === "") return { kind: "⌂", label: "Accueil" };
  const seg = clean.split("/").filter(Boolean);
  const words = (s: string) =>
    s
      .replace(/^r\d+-/, "") // préfixe SKU des handles produit
      .replace(/^\d+-/, "") // préfixe id des slugs catégorie
      .replace(/-/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase());
  if (seg[0] === "p" && seg[1]) return { kind: "Produit", label: words(seg[1]) };
  if (seg[0] === "c" && seg[1]) return { kind: "Catégorie", label: words(seg[seg.length - 1] ?? seg[1]) };
  if (seg[0] === "s") return { kind: "Recherche", label: "Recherche catalogue" };
  if (seg[0] === "b") return { kind: "Guide", label: seg[1] ? words(seg[1]) : "Guides" };
  if (seg[0] === "cart" || seg[0] === "panier") return { kind: "Panier", label: "Panier" };
  if (seg[0] === "checkout") return { kind: "Checkout", label: "Paiement en cours" };
  return { kind: "Page", label: words(seg[seg.length - 1] ?? clean) };
}

/** ② Decode text (design language Arwes `decipher` / scramble soulwire) :
 *  la valeur se « décode » à travers des glyphes à chaque changement. */
const GLYPHS = "!<>-_\\/[]{}—=+*^?#";
function useDecode(value: string): string {
  const [display, setDisplay] = useState(value);
  const prev = useRef<string | null>(null); // null → décode aussi au mount (boot)
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    let i = 0;
    let raf = 0;
    const tick = () => {
      const done = Math.floor(i++ / 2);
      setDisplay(
        value.slice(0, done) +
          [...value.slice(done)].map((c) => (c === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join(""),
      );
      if (done < value.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return display;
}

function DecodedNumber({ value, className }: { value: number | undefined; className?: string }) {
  const text = useDecode(value === undefined ? "–" : String(value));
  return <span className={className}>{text}</span>;
}

/** ③ Anneaux segmentés contre-rotatifs (arc reactor). */
function Rings({ size }: { size: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden>
      <div className="hud-ring absolute inset-0" />
      <div className="hud-ring hud-ring--rev absolute inset-[14%]" />
      <div
        className="absolute inset-[38%] rounded-full bg-[#22d3ee] opacity-70"
        style={{ boxShadow: "0 0 14px #22d3ee, 0 0 34px rgba(34,211,238,.5)" }}
      />
    </div>
  );
}

/** Splash « système en ligne » (~2 s au boot, façon eDEX-UI). */
function BootSplash() {
  const text = useDecode("ELUDE · SYSTÈME EN LIGNE");
  return (
    <div className="hud-splash absolute inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-[#030a12]">
      <Rings size={110} />
      <div className="hud-glow font-semibold text-3xl text-[#d7f4ff] uppercase" style={{ letterSpacing: "0.42em" }}>
        {text}
      </div>
    </div>
  );
}

/**
 * Page TV — analytics temps réel tous sites (Umami), habillage HUD «JARVIS» :
 * accent cyan unique, panneaux à coins crochets, glow, radar. La magnitude
 * reste portée par la taille/l'intensité (pas de palette multi-teintes).
 * Layout une seule vue (pas de scroll). Refresh SWR 15 s, horloge 1 s.
 */

const CYAN = "#22d3ee";
const INK_DIM = "#5e8ba3";
const INK = "#aef4ff";

function Panel({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`hud-panel ${className}`} style={style}>
      <span className="hud-c" />
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="flex items-center gap-2 font-semibold text-[13px] uppercase"
      style={{ color: INK_DIM, letterSpacing: "0.28em" }}
    >
      <span className="inline-block h-[7px] w-[7px] rotate-45 bg-[#22d3ee]" />
      {children}
    </h2>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  return (
    <div className="text-right">
      <div className="hud-glow font-bold text-5xl text-[#d7f4ff] tabular-nums tracking-wider">
        {now.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Paris",
        })}
      </div>
      <div className="text-sm uppercase" style={{ color: INK_DIM, letterSpacing: "0.2em" }}>
        {now.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "Europe/Paris",
        })}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min`;
}

/** Sparkline vues/minute (30 min) — trait cyan glow, zéro dépendance. */
function Sparkline({ series }: { series: Array<{ t: string; views: number }> }) {
  if (series.length < 2) return <div className="h-[46px]" />;
  const w = 360;
  const h = 46;
  const max = Math.max(1, ...series.map((p) => p.views));
  const pts = series.map((p, i) => `${(i / (series.length - 1)) * w},${h - 4 - (p.views / max) * (h - 10)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-[46px] w-full"
      role="img"
      aria-label="Courbe des pages vues sur 30 minutes"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={CYAN}
        strokeWidth={1.6}
        style={{ filter: `drop-shadow(0 0 4px ${CYAN})` }}
      />
    </svg>
  );
}

const COUNTRY_NAMES = new Intl.DisplayNames(["fr"], { type: "region" });

const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** € décodé (le CA « se calcule » sous les yeux à chaque changement). */
function DecodedEuro({ value, className }: { value: number | undefined; className?: string }) {
  const text = useDecode(value === undefined ? "–" : EUR.format(value));
  return <span className={className}>{text}</span>;
}

/** Flash plein écran quand une NOUVELLE commande arrive (display_id qui monte). */
function OrderFlash({
  lastOrderId,
  latest,
}: {
  lastOrderId: number | null;
  latest?: { brand: string; total: number; displayId: number };
}) {
  const seen = useRef<number | null>(null);
  const [flash, setFlash] = useState<{ brand: string; total: number; displayId: number } | null>(null);
  useEffect(() => {
    if (lastOrderId === null) return;
    if (seen.current !== null && lastOrderId > seen.current && latest) {
      setFlash(latest);
      tvAudio.order(); // 🔊 le gong commande
      const t = setTimeout(() => setFlash(null), 6000);
      return () => clearTimeout(t);
    }
    seen.current = lastOrderId;
  }, [lastOrderId, latest]);
  useEffect(() => {
    if (lastOrderId !== null) seen.current = lastOrderId;
  }, [lastOrderId]);
  if (!flash) return null;
  return (
    <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-[#030a12ee]">
      <Rings size={130} />
      <div className="hud-glow font-semibold text-2xl text-[#7df3ff] uppercase" style={{ letterSpacing: "0.42em" }}>
        Nouvelle commande
      </div>
      <div className="hud-glow font-bold text-8xl text-[#e6fbff] tabular-nums">{EUR.format(flash.total)}</div>
      <div className="text-xl uppercase" style={{ color: INK, letterSpacing: "0.2em" }}>
        #{flash.displayId} · {flash.brand}
      </div>
    </div>
  );
}

function timeAgoShort(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}min`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}j`;
}

/** Toggle son (l'autoplay exige un geste utilisateur pour démarrer l'audio).
 *  Préférence mémorisée ; en kiosk TV : --autoplay-policy=no-user-gesture-required. */
function SoundToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // tentative de reprise auto (marche en kiosk --autoplay-policy=... ou si
    // le navigateur considère le site « engagé ») ; sinon le clic activera.
    if (!tvAudio.wasEnabled()) return;
    tvAudio.enable();
    const t = setTimeout(() => setOn(tvAudio.isRunning()), 400);
    return () => clearTimeout(t);
  }, []);
  const toggle = () => {
    if (on) {
      tvAudio.disable();
      setOn(false);
    } else {
      tvAudio.enable();
      setOn(true);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className={`fixed right-4 bottom-4 z-[80] border px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors ${
        on ? "border-[#22d3ee88] text-[#7df3ff]" : "border-[#1d2a37] text-[#5e8ba3]"
      } bg-[#06111ccc]`}
    >
      {on ? "◉ son actif" : "○ activer le son"}
    </button>
  );
}

/** Déclencheurs sonores : blip quand le nombre d'actifs monte, tonalité devis. */
function useSoundTriggers(totalActive: number | undefined, quotesToday: number | undefined) {
  const prevActive = useRef<number | null>(null);
  const prevQuotes = useRef<number | null>(null);
  useEffect(() => {
    if (totalActive === undefined) return;
    if (prevActive.current !== null && totalActive > prevActive.current) tvAudio.visitor();
    prevActive.current = totalActive;
  }, [totalActive]);
  useEffect(() => {
    if (quotesToday === undefined) return;
    if (prevQuotes.current !== null && quotesToday > prevQuotes.current) tvAudio.quote();
    prevQuotes.current = quotesToday;
  }, [quotesToday]);
}

export default function TvPage() {
  const { data, error } = useUmamiLive();
  const { data: commerce } = useCommerceLive();
  useSoundTriggers(data?.totalActive, commerce?.quotesTodayCount);

  const topCountries = Object.entries(data?.countries ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);
  const sitesSorted = [...(data?.sites ?? [])].sort((a, b) => a.label.localeCompare(b.label, "fr"));

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <BootSplash />
      <SoundToggle />
      <OrderFlash lastOrderId={commerce?.lastOrderId ?? null} latest={commerce?.orders?.[0]} />
      {/* ligne 1 — header */}
      <header className="boot-in flex items-end justify-between" style={{ "--i": 0 } as React.CSSProperties}>
        <div className="flex items-end gap-12">
          <div className="flex items-center gap-6">
            <div className="hud-flicker hidden 2xl:block">
              <Rings size={92} />
            </div>
            <div>
              <div
                className="flex items-center gap-2.5 font-semibold text-[13px] uppercase"
                style={{ color: INK_DIM, letterSpacing: "0.34em" }}
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22d3ee] opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22d3ee]" />
                </span>
                Elude · Réseau live
              </div>
              <div className="mt-1 flex items-baseline gap-4">
                <DecodedNumber
                  value={data?.totalActive}
                  className="hud-glow tv-breathe font-bold text-[#e6fbff] text-[7.5rem] tabular-nums leading-none"
                />
                <span className="font-medium text-2xl uppercase" style={{ color: INK, letterSpacing: "0.12em" }}>
                  visiteur{(data?.totalActive ?? 0) > 1 ? "s" : ""} en ligne
                </span>
              </div>
            </div>
          </div>
          <dl className="flex gap-10 pb-2 text-center">
            {[
              { label: "Visiteurs · 30 min", value: data?.visitors30m },
              { label: "Pages vues · 30 min", value: data?.views30m },
              { label: "Visiteurs · jour", value: data?.visitorsToday },
              { label: "Pages vues · jour", value: data?.viewsToday },
            ].map((s) => (
              <div key={s.label}>
                <dd>
                  <DecodedNumber
                    value={s.value}
                    className="hud-glow font-semibold text-5xl text-[#d7f4ff] tabular-nums"
                  />
                </dd>
                <dt
                  className="mt-1 font-semibold text-[11px] uppercase"
                  style={{ color: INK_DIM, letterSpacing: "0.22em" }}
                >
                  {s.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
        <Clock />
      </header>

      {/* ligne 2 — map + colonne latérale */}
      <div className="flex min-h-0 flex-1 gap-4">
        <Panel className="boot-in relative min-w-0 flex-[2.4] p-2" style={{ "--i": 1 } as React.CSSProperties}>
          {/* radar sweep décoratif */}
          <div className="pointer-events-none absolute top-4 right-4 h-16 w-16 rounded-full border border-[#22d3ee33]">
            <div className="absolute inset-1 rounded-full border border-[#22d3ee22]" />
            <div
              className="tv-sweep absolute inset-0 rounded-full"
              style={{ background: "conic-gradient(rgba(34,211,238,0.4), transparent 70deg)" }}
            />
          </div>
          <div className="hud-sweep-overlay" />
          <div
            className="pointer-events-none absolute top-3.5 left-4 text-[11px] uppercase"
            style={{ color: INK_DIM, letterSpacing: "0.24em" }}
          >
            Activité · 30 min — <span className="text-[#7df3ff]">points brillants = en ligne</span>
          </div>
          <WorldMap countries={data?.countries ?? {}} activeCountries={data?.countriesActive ?? {}} />
          {error ? (
            <div className="absolute inset-x-0 bottom-3 text-center text-[#ff9d9d] text-sm">
              ⚠ Flux Umami indisponible — reconnexion automatique
            </div>
          ) : null}
        </Panel>

        <aside className="flex w-[430px] min-w-[370px] flex-col gap-4">
          <Panel className="boot-in p-4" style={{ "--i": 2 } as React.CSSProperties}>
            <PanelTitle>Commerce · jour</PanelTitle>
            <div className="mt-2 flex items-end justify-between">
              <DecodedEuro
                value={commerce?.caToday}
                className="hud-glow font-bold text-5xl text-[#e6fbff] tabular-nums"
              />
              <div
                className="pb-1 text-right text-[12px] uppercase"
                style={{ color: INK_DIM, letterSpacing: "0.14em" }}
              >
                <div>
                  <span className="font-bold text-[#d7f4ff] text-[15px] tabular-nums">
                    {commerce?.ordersTodayCount ?? "–"}
                  </span>{" "}
                  commande{(commerce?.ordersTodayCount ?? 0) > 1 ? "s" : ""}
                </div>
                <div>
                  <span className="font-bold text-[#d7f4ff] text-[15px] tabular-nums">
                    {commerce?.quotesTodayCount ?? "–"}
                  </span>{" "}
                  devis
                </div>
              </div>
            </div>
            <ul
              className="mt-2 space-y-[5px] text-[12px] leading-5"
              style={{ fontFamily: "var(--font-hud-mono), monospace" }}
            >
              {(commerce?.orders ?? []).slice(0, 3).map((o) => (
                <li key={o.displayId} className="flex items-center gap-2">
                  <span className="shrink-0 text-[#2dd4ef]">€</span>
                  <span className="shrink-0" style={{ color: INK }}>
                    #{o.displayId}
                  </span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: "#8fc8dd" }}>
                    {o.brand}
                  </span>
                  <span className="shrink-0 font-bold text-[#d7f4ff] tabular-nums">{EUR.format(o.total)}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: INK_DIM }}>
                    {timeAgoShort(o.at)}
                  </span>
                </li>
              ))}
              {(commerce?.orders ?? []).length === 0 ? (
                <li className="text-[12px]" style={{ color: INK_DIM }}>
                  — aucune commande —
                </li>
              ) : null}
            </ul>
          </Panel>

          <Panel className="boot-in p-4" style={{ "--i": 2.5 } as React.CSSProperties}>
            <PanelTitle>Trafic · 30 min</PanelTitle>
            <div className="mt-2">
              <Sparkline series={data?.series ?? []} />
            </div>
          </Panel>

          <Panel className="boot-in p-4" style={{ "--i": 3 } as React.CSSProperties}>
            <PanelTitle>Pays · 30 min</PanelTitle>
            <ul className="mt-2.5 space-y-2">
              {topCountries.length === 0 ? (
                <li className="text-sm" style={{ color: INK_DIM }}>
                  — aucun signal sur la fenêtre —
                </li>
              ) : (
                topCountries.map(([iso, n]) => {
                  const max = topCountries[0]?.[1] ?? 1;
                  return (
                    <li key={iso} className="flex items-center gap-3 text-[15px]">
                      <span className="w-7 shrink-0">{countryFlag(iso)}</span>
                      <span className="w-32 shrink-0 truncate" style={{ color: INK }}>
                        {COUNTRY_NAMES.of(iso.toUpperCase()) ?? iso}
                      </span>
                      <span className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-sm bg-[#0d2233]">
                        <span
                          className="block h-full rounded-sm bg-[#22d3ee]"
                          style={{
                            width: `${Math.max(8, (n / max) * 100)}%`,
                            boxShadow: `0 0 8px ${CYAN}`,
                          }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right font-bold text-[#d7f4ff] tabular-nums">{n}</span>
                    </li>
                  );
                })
              )}
            </ul>
          </Panel>

          <Panel className="boot-in flex min-h-0 flex-1 flex-col p-4" style={{ "--i": 4 } as React.CSSProperties}>
            <PanelTitle>Dernières visites</PanelTitle>
            <ul className="mt-2.5 min-h-0 flex-1 space-y-2 overflow-hidden text-[14px] leading-6">
              {(data?.feed ?? []).slice(0, 12).map((e) => {
                const h = humanizePath(e.path);
                return (
                  <li key={`${e.at}-${e.site}-${e.path}`} className="flex items-center gap-2.5">
                    <span className="shrink-0">{countryFlag(e.country)}</span>
                    <span
                      className="shrink-0 border border-[#22d3ee2e] bg-[#0a1f2e] px-1.5 py-0.5 text-[11px] uppercase tracking-wider"
                      style={{ color: INK }}
                    >
                      {e.siteLabel}
                    </span>
                    <span className="min-w-0 flex-1 truncate" style={{ color: "#a9d6e8" }} title={e.path}>
                      {h.kind === "Produit" ? "" : `${h.kind} · `}
                      {h.label}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums" style={{ color: INK_DIM }}>
                      {timeAgo(e.at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </aside>
      </div>

      {/* ligne 3 — les sites */}
      <footer className="grid grid-cols-8 gap-3.5">
        {sitesSorted.map((s, idx) => {
          const hot = s.active > 0;
          return (
            <Panel
              key={s.key}
              className={`boot-in p-3 ${hot ? "!border-[#22d3ee66]" : ""}`}
              style={{ "--i": 5 + idx * 0.6 } as React.CSSProperties}
            >
              <div
                className="truncate font-semibold text-[12px] uppercase"
                style={{ color: hot ? INK : INK_DIM, letterSpacing: "0.18em" }}
              >
                {s.label}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`font-bold text-4xl tabular-nums ${hot ? "hud-glow text-[#e6fbff]" : "text-[#28455c]"}`}
                >
                  {s.active}
                </span>
                <span className="text-[10.5px] uppercase tracking-wider" style={{ color: INK_DIM }}>
                  en ligne
                </span>
              </div>
              <div className="mt-1 text-[11px] tabular-nums" style={{ color: INK_DIM }}>
                {s.viewsToday} page{s.viewsToday > 1 ? "s" : ""} vue{s.viewsToday > 1 ? "s" : ""} aujourd&apos;hui
              </div>
            </Panel>
          );
        })}
      </footer>
    </div>
  );
}
