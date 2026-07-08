"use client";

/**
 * Bande-son HUD — 100 % synthétisée en WebAudio (zéro asset, zéro licence,
 * esthétique « bleeps » Arwes/JARVIS) :
 *   - ambient  : drone grave discret permanent (2 oscillateurs détunés +
 *                lowpass + respiration lente) — présence, pas musique.
 *   - visitor  : blip court quand un visiteur arrive.
 *   - order    : arpège ascendant (le « gong » commande).
 *   - quote    : double-tonalité distincte (devis).
 *
 * ⚠️ Autoplay : le navigateur exige un geste utilisateur pour démarrer
 * l'AudioContext → `enable()` doit être appelé depuis un clic (SoundToggle).
 * Préférence persistée en localStorage ; sur un écran TV en kiosk, lancer
 * Chrome avec `--autoplay-policy=no-user-gesture-required` dispense du clic.
 */

const LS_KEY = "tv-sound-enabled";

class TvAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientNodes: OscillatorNode[] = [];
  enabled = false;

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** À appeler depuis un geste utilisateur. */
  enable(): void {
    const ctx = this.ensure();
    this.enabled = true;
    try {
      localStorage.setItem(LS_KEY, "1");
    } catch {
      // localStorage indisponible (mode privé) — préférence non persistée
    }
    if (this.ambientNodes.length === 0) this.startAmbient(ctx);
  }

  disable(): void {
    this.enabled = false;
    try {
      localStorage.setItem(LS_KEY, "0");
    } catch {
      // localStorage indisponible (mode privé) — préférence non persistée
    }
    for (const o of this.ambientNodes) {
      try {
        o.stop();
      } catch {
        // oscillateur déjà stoppé — sans conséquence
      }
    }
    this.ambientNodes = [];
    void this.ctx?.suspend();
  }

  wasEnabled(): boolean {
    try {
      return localStorage.getItem(LS_KEY) === "1";
    } catch {
      return false;
    }
  }

  /** true si l'AudioContext tourne réellement (kiosk / autoplay autorisé). */
  isRunning(): boolean {
    return this.enabled && this.ctx?.state === "running";
  }

  /** Drone ambiant : La grave détuné + filtre + respiration ~11 s. */
  private startAmbient(ctx: AudioContext): void {
    if (!this.master) return;
    const amb = ctx.createGain();
    amb.gain.value = 0.05; // très bas — présence de fond, pas de la musique
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    amb.connect(lp).connect(this.master);

    for (const [freq, type] of [
      [55, "sine"],
      [55.6, "triangle"],
      [110.3, "sine"],
    ] as Array<[number, OscillatorType]>) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g).connect(amb);
      o.start();
      this.ambientNodes.push(o);
    }
    // respiration lente du volume ambiant
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / 11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(amb.gain);
    lfo.start();
    this.ambientNodes.push(lfo);
  }

  /** Note utilitaire : oscillateur + enveloppe ADSR courte. */
  private note(freq: number, at: number, dur: number, peak: number, type: OscillatorType = "sine"): void {
    const ctx = this.ensure();
    if (!this.master) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** Blip « nouveau visiteur » : sweep bref, discret. */
  visitor(): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    const t = ctx.currentTime;
    this.note(880, t, 0.09, 0.12);
    this.note(1318, t + 0.07, 0.12, 0.09);
  }

  /** « Gong » commande : arpège ascendant Do-Mi-Sol-Do, avec brillance. */
  order(): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    const t = ctx.currentTime;
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => {
      this.note(f, t + i * 0.12, 0.5, 0.22, "triangle");
      this.note(f * 2, t + i * 0.12, 0.3, 0.06); // octave brillante
    });
    this.note(1046.5, t + 0.62, 0.9, 0.18, "sine"); // tenue finale
  }

  /** Devis : double-tonalité descendante-remontante, distincte de la commande. */
  quote(): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    const t = ctx.currentTime;
    this.note(659.25, t, 0.16, 0.16, "triangle");
    this.note(493.88, t + 0.14, 0.16, 0.14, "triangle");
    this.note(659.25, t + 0.3, 0.28, 0.16, "triangle");
  }
}

/** Singleton module (une seule AudioContext par onglet). */
export const tvAudio = new TvAudio();
