import type { ReactNode } from "react";

import { Rajdhani, Share_Tech_Mono } from "next/font/google";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Elude — Live",
  robots: { index: false, follow: false },
};

/** Typo HUD : Rajdhani (titres/chiffres, condensée techno) + Share Tech Mono (feed). */
const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-hud",
});
const techMono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-hud-mono",
});

/**
 * Layout TV « JARVIS » : plein écran, fond radar sombre (grille + vignette),
 * scanlines, accent cyan holographique unique. Aucun chrome dashboard —
 * pensé pour un écran d'affichage en continu.
 */
export default function TvLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${rajdhani.variable} ${techMono.variable} fixed inset-0 overflow-hidden bg-[#030a12] text-[#d7f4ff]`}
      style={{ fontFamily: "var(--font-hud), sans-serif" }}
    >
      <style>{`
        /* pulse des dots map — SVG-safe */
        @keyframes tvPulse {
          0% { transform: scale(0.55); opacity: 0.5; }
          75% { transform: scale(2.1); opacity: 0; }
          100% { transform: scale(2.1); opacity: 0; }
        }
        .tv-pulse { transform-box: fill-box; transform-origin: center; animation: tvPulse 2.6s ease-out infinite; }
        /* balayage radar (coin de map) */
        @keyframes tvSweep { to { transform: rotate(360deg); } }
        .tv-sweep { animation: tvSweep 5s linear infinite; transform-origin: center; }
        /* respiration du hero */
        @keyframes tvBreathe { 0%,100% { opacity: 1; } 50% { opacity: 0.82; } }
        .tv-breathe { animation: tvBreathe 3.2s ease-in-out infinite; }
        /* fond : grille holo + vignette */
        .tv-bg {
          background:
            radial-gradient(ellipse 75% 60% at 50% 38%, rgba(34,211,238,0.07), transparent 65%),
            linear-gradient(rgba(103,232,249,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(103,232,249,0.045) 1px, transparent 1px),
            #030a12;
          background-size: auto, 44px 44px, 44px 44px, auto;
        }
        /* scanlines CRT discrètes */
        .tv-scan::after {
          content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 50;
          background: repeating-linear-gradient(0deg, rgba(215,244,255,0.022) 0 1px, transparent 1px 3px);
        }
        .hud-glow { text-shadow: 0 0 18px rgba(34,211,238,0.55), 0 0 46px rgba(34,211,238,0.22); }
        .hud-panel {
          position: relative;
          background: rgba(6,17,28,0.72);
          border: 1px solid rgba(103,232,249,0.16);
          box-shadow: inset 0 0 32px rgba(34,211,238,0.05);
        }
        /* coins crochets HUD */
        .hud-panel::before, .hud-panel::after,
        .hud-panel > .hud-c::before, .hud-panel > .hud-c::after {
          content: ""; position: absolute; width: 14px; height: 14px;
          border-color: rgba(103,232,249,0.75); border-style: solid; border-width: 0;
        }
        .hud-panel::before { top: -1px; left: -1px; border-top-width: 2px; border-left-width: 2px; }
        .hud-panel::after { top: -1px; right: -1px; border-top-width: 2px; border-right-width: 2px; }
        .hud-panel > .hud-c::before { bottom: -1px; left: -1px; border-bottom-width: 2px; border-left-width: 2px; }
        .hud-panel > .hud-c::after { bottom: -1px; right: -1px; border-bottom-width: 2px; border-right-width: 2px; }
        /* ④ boot cascade (pattern Animator d'Arwes) — délai par --i */
        @keyframes bootIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        .boot-in { opacity: 0; animation: bootIn .5s cubic-bezier(.2,.9,.3,1) forwards; animation-delay: calc(var(--i, 0) * 110ms); }
        /* ① la map se dessine (pathLength=1 normalisé) */
        @keyframes hudDraw { to { stroke-dashoffset: 0; } }
        .tv-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: hudDraw 2.4s ease-out forwards .3s; }
        @keyframes hudFillIn { to { fill-opacity: 1; } }
        .tv-fill { fill-opacity: 0; animation: hudFillIn 1.2s ease-out forwards 1.6s; }
        /* ③ anneaux segmentés contre-rotatifs */
        @keyframes hudSpin { to { transform: rotate(360deg); } }
        .hud-ring {
          border-radius: 50%;
          background: repeating-conic-gradient(rgba(34,211,238,.8) 0 14deg, transparent 14deg 22deg);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0);
          mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 0);
          animation: hudSpin 14s linear infinite;
        }
        .hud-ring--rev { animation: hudSpin 9s linear infinite reverse; opacity: .5; }
        /* ⑤ flicker holographique (subtil, éléments choisis) */
        @keyframes hudFlicker { 0%,91%,94%,100% { opacity: 1; } 92% { opacity: .72; } 96.5% { opacity: .86; } }
        .hud-flicker { animation: hudFlicker 7s steps(1) infinite; }
        /* ⑤ sweep lumineux vertical sur panneau */
        @keyframes hudSweep2 { from { background-position: 0 220%; } to { background-position: 0 -220%; } }
        .hud-sweep-overlay {
          position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(180deg, transparent, rgba(34,211,238,.045) 50%, transparent);
          background-size: 100% 200%;
          animation: hudSweep2 9s linear infinite;
        }
        /* boot splash */
        @keyframes splashOut { to { opacity: 0; visibility: hidden; } }
        .hud-splash { animation: splashOut .6s ease-in forwards 2s; }
      `}</style>
      <div className="tv-bg tv-scan absolute inset-0">{children}</div>
    </div>
  );
}
