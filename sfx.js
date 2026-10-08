// =============================================================================
// Tiny WebAudio sound kit — synthesized UI sounds, zero assets.
// Everything routes through one master gain; a persisted toggle mutes the kit.
// The AudioContext is created lazily and unlocked by the first user gesture,
// so autoplay policies never throw.
// =============================================================================

const KEY = "asufiji-sfx";
let ctx = null;
let master = null;

function enabled() {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

function ensure() {
  if (!enabled()) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    // A constructor throw (hardware failure, context-limit, locked-down WebView) must stay
    // inside the sound kit — SFX.thud() is the first call in the error-banner path, so an
    // uncaught throw here would blank the feed instead of showing the error.
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch { ctx = null; master = null; return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx.state === "closed" ? null : ctx;
}

// One-time unlock on the first gesture anywhere (safe to call repeatedly).
if (typeof document !== "undefined") {
  const unlock = () => { ensure(); document.removeEventListener("pointerdown", unlock); };
  document.addEventListener("pointerdown", unlock, { passive: true });
}

// A short enveloped oscillator sweep — the building block for most sounds.
function blip({ type = "sine", from = 440, to = from, dur = 0.08, gain = 0.07, at = 0 } = {}) {
  const c = ensure(); if (!c) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

// Band-passed noise sweep for a soft whoosh.
function noiseSweep({ dur = 0.38, from = 260, to = 1900, gain = 0.1 } = {}) {
  const c = ensure(); if (!c) return;
  const t0 = c.currentTime;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(from, t0);
  bp.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

export const SFX = {
  enabled,
  toggle() {
    const next = !enabled();
    try { localStorage.setItem(KEY, next ? "1" : "0"); } catch {}
    if (next) { ensure(); this.tick(); }
    return next;
  },
  /** soft high tick — tabs, hovers, theme toggle */
  tick()  { blip({ type: "triangle", from: 2100, to: 1700, dur: 0.045, gain: 0.045 }); },
  /** confident click — primary buttons */
  click() { blip({ type: "sine", from: 520, to: 400, dur: 0.06, gain: 0.07 }); blip({ type: "triangle", from: 1900, to: 1500, dur: 0.04, gain: 0.03 }); },
  /** answer / content arrival */
  pop()   { blip({ type: "sine", from: 340, to: 700, dur: 0.09, gain: 0.06 }); },
  /** simulate-next-week transition */
  whoosh(){ noiseSweep(); },
  /** milestone fanfare — two rising notes */
  chime() { blip({ type: "sine", from: 659, to: 659, dur: 0.28, gain: 0.07 }); blip({ type: "sine", from: 988, to: 988, dur: 0.4, gain: 0.06, at: 0.1 }); },
  /** error thud */
  thud()  { blip({ type: "sine", from: 170, to: 65, dur: 0.18, gain: 0.1 }); },
};
