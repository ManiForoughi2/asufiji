import { mountShader, prefersReducedMotion } from "./shaders.js";
import { SFX } from "./sfx.js";
import { startSea } from "./sea.js";

const root = document.documentElement;
const reduced = prefersReducedMotion();

const theme = () => (root.getAttribute("data-theme") === "light" ? "light" : "dark");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- palettes (sampled from the chapter's own graphics) ----------
const PAL = {
  dark:  { bg: "#0d1322", sea: "#16253d", glint: "#d8c4a2", card: "#121b2e" },
  light: { bg: "#e9dcc6", sea: "#7f9dc4", glint: "#f7efe2", card: "#121b2e" },
};

// ---------- shaders ----------
const mounts = [];
async function mount(el, type, build, opts) {
  if (!el) return null;
  const h = await mountShader(el, type, build(PAL[theme()]), opts);
  if (h) mounts.push({ h, build });
  return h;
}
function retint() {
  const p = PAL[theme()];
  for (const m of mounts) m.h.set(m.build(p));
}

// night sea under the crest: WebGL ocean that reflects the real wordmark
const heroEl = document.querySelector(".hero");
const seaCanvas = document.getElementById("sea");
const sea = seaCanvas ? startSea(seaCanvas, { getTheme: theme, reduced, hero: heroEl, word: document.querySelector(".word:not(.word-refl)") }) : null;
if (sea) heroEl.classList.add("gl-sea");

mount(document.getElementById("sh-rush"), "pulsingBorder", (p) => ({
  colorBack: p.card, colors: ["#c29f80", "#e0c19a", "#7293bd", "#ecdcc2"],
  roundness: 0.08, thickness: 0.04, softness: 0.8, intensity: 0.12, bloom: 0.16,
  spots: 4, spotSize: 0.4, pulse: 0.18, smoke: 0.35, smokeSize: 0.55,
  marginLeft: 0, marginRight: 0, marginTop: 0, marginBottom: 0, aspectRatio: "auto", speed: 0.7,
})).then((h) => { if (h) document.querySelector(".rush-card")?.classList.add("has-shader"); });

// postcard prints: vintage-print gradients in the chapter palette (sea, brass, sedona, dusk)
const ART = [
  { shape: "wave",    fit: "cover",   back: "#19203a", colors: ["#a9bfd6", "#7293bd", "#2a3a55"] },
  { shape: "sphere",  fit: "contain", back: "#6b4e38", colors: ["#f0dcb8", "#c29f80", "#3e3428"] },
  { shape: "corners", fit: "cover",   back: "#3e2a22", colors: ["#e0a679", "#b5643c", "#6b4e38"] },
  { shape: "blob",    fit: "cover",   back: "#19203a", colors: ["#c29f80", "#7293bd", "#2a3a55"] },
];
document.querySelectorAll(".art-shader").forEach((el) => {
  const a = ART[Number(el.dataset.art)] || ART[0];
  mount(el, "grainGradient", () => ({
    colorBack: a.back, colors: a.colors,
    softness: 0.6, intensity: 0.4, noise: 0.42, shape: a.shape, fit: a.fit, speed: 0.5,
  }));
});

// the reflection ripple is SMIL; freeze it for reduced motion
if (reduced) document.querySelector("svg")?.pauseAnimations?.();

// ---------- theme follows the device setting ----------
const themeMeta = document.querySelector('meta[name="theme-color"]');
const scheme = matchMedia("(prefers-color-scheme: light)");
function syncTheme() {
  const t = scheme.matches ? "light" : "dark";
  root.setAttribute("data-theme", t);
  if (themeMeta) themeMeta.content = PAL[t].bg;
  retint();
  sea?.redraw();
}
scheme.addEventListener?.("change", syncTheme);
if (themeMeta) themeMeta.content = PAL[theme()].bg;

// ---------- kinetic type + scroll reveals ----------
// hidden reveal states only exist under .motion, added here right before the observer
// is wired, so the page stays fully visible if anything above fails or this file never runs
if (!reduced) {
  root.classList.add("motion");
  document.querySelectorAll(".kinetic").forEach((el) => {
    let wi = 0;
    const lines = el.querySelectorAll(".ln");
    for (const host of lines.length ? lines : [el]) {
      const words = host.textContent.trim().split(/\s+/);
      host.textContent = "";
      words.forEach((word, i) => {
        const s = document.createElement("span");
        s.className = "w";
        s.style.setProperty("--wi", wi++);
        s.textContent = word;
        host.append(s);
        if (i < words.length - 1) host.append(" ");
      });
    }
  });

  const targets = document.querySelectorAll(".reveal, .kinetic");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    targets.forEach((t) => io.observe(t));
  } else {
    targets.forEach((t) => t.classList.add("in"));
  }
}

// ---------- value cards: the cursor opens a lens onto the video ----------
const finePtr = matchMedia("(hover: hover) and (pointer: fine)").matches;
let liveVid = null;
document.querySelectorAll(".card-art").forEach((art) => {
  const video = art.querySelector("video");
  const print = art.querySelector(".art-shader");
  const play = () => { if (!reduced) { liveVid = video; video.play().catch(() => {}); } };
  const stop = () => { video.pause(); if (liveVid === video) liveVid = null; };
  if (finePtr) {
    art.addEventListener("pointerenter", () => { art.classList.add("lens"); play(); });
    art.addEventListener("pointermove", (e) => {
      const r = print.getBoundingClientRect();
      print.style.setProperty("--mx", (e.clientX - r.left).toFixed(1) + "px");
      print.style.setProperty("--my", (e.clientY - r.top).toFixed(1) + "px");
    });
    art.addEventListener("pointerleave", () => { art.classList.remove("lens"); stop(); });
  } else {
    // touch: a tap opens the whole print, another tap closes it
    art.addEventListener("click", () => {
      const open = art.classList.toggle("open");
      if (open) play(); else stop();
    });
  }
});
// browsers pause video in background tabs; resume on return
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") liveVid?.play().catch(() => {});
});

// ---------- one rAF scroll loop: hero drift, deck stacking, art parallax, nav state ----------
const hero = document.querySelector(".hero");
const cards = [...document.querySelectorAll(".card")];
const arts = cards.map((c) => c.querySelector(".art-shader"));
const compass = document.querySelector(".week-compass");
const navLinks = [...document.querySelectorAll(".rail-link")];
const navSections = navLinks.map((a) => document.querySelector(a.getAttribute("href")));

let queued = false;
function frame() {
  queued = false;
  const vh = window.innerHeight;
  const y = window.scrollY;

  if (hero && !reduced) hero.style.setProperty("--hp", clamp(y / (vh * 0.9), 0, 1).toFixed(4));

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const r = card.getBoundingClientRect();
    if (r.bottom < -vh || r.top > vh * 2) continue;
    const next = cards[i + 1];
    let p = 0;
    if (next) {
      const nr = next.getBoundingClientRect();
      p = clamp(1 - (nr.top - r.top) / card.offsetHeight, 0, 1);
    }
    card.style.setProperty("--p", p.toFixed(4));
    if (!reduced && arts[i]) {
      const off = (r.top + r.height / 2 - vh / 2) / vh;
      arts[i].style.setProperty("--py", (off * -36).toFixed(2) + "px");
    }
  }

  if (compass && !reduced) {
    const r = compass.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) compass.style.setProperty("--rot", ((r.top + r.height / 2 - vh / 2) * -0.08).toFixed(2) + "deg");
  }

  let active = -1;
  navSections.forEach((s, i) => { if (s && s.getBoundingClientRect().top < vh * 0.45) active = i; });
  navLinks.forEach((a, i) => a.classList.toggle("is-active", i === active));
}
const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
addEventListener("scroll", queue, { passive: true });
addEventListener("resize", queue, { passive: true });
frame();

// ---------- magnetic buttons ----------
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
if (!reduced && finePointer) {
  document.querySelectorAll(".magnetic").forEach((btn) => {
    let box = null;
    btn.addEventListener("pointerenter", () => {
      btn.style.setProperty("--mx", "0px");
      btn.style.setProperty("--my", "0px");
      box = btn.getBoundingClientRect();
    });
    btn.addEventListener("pointermove", (e) => {
      if (!box) box = btn.getBoundingClientRect();
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height / 2);
      btn.style.setProperty("--mx", (dx * 0.22).toFixed(2) + "px");
      btn.style.setProperty("--my", (dy * 0.32).toFixed(2) + "px");
    });
    btn.addEventListener("pointerleave", () => {
      box = null;
      btn.style.setProperty("--mx", "0px");
      btn.style.setProperty("--my", "0px");
    });
  });
}

// ---------- sound: soft synthesized ticks, M toggles (persisted) ----------
document.addEventListener("click", (e) => {
  const t = e.target.closest("a, button");
  if (!t) return;
  if (t.classList.contains("btn-brass")) SFX.click();
  else SFX.tick();
});
let armed = false; // no audio before the first gesture, or the browser logs autoplay warnings
document.addEventListener("pointerdown", () => { armed = true; }, { once: true, passive: true });
navLinks.forEach((a) => a.addEventListener("pointerenter", () => { if (armed) SFX.tick(); }));
document.addEventListener("keydown", (e) => {
  if (e.key !== "m" && e.key !== "M") return;
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea, [contenteditable]")) return;
  SFX.toggle();
});
