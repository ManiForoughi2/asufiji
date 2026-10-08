import { mountShader, prefersReducedMotion } from "./shaders.js?v=e8be4c9f";
import { startSea } from "./sea.js?v=e8be4c9f";

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
function applyTheme(t) {
  root.setAttribute("data-theme", t);
  if (themeMeta) themeMeta.content = PAL[t].bg;
  const btn = document.querySelector(".theme-toggle");
  btn?.setAttribute("aria-label", t === "dark" ? "Switch to day" : "Switch to night");
  retint();
  sea?.redraw();
}
function savedTheme() {
  try { const t = localStorage.getItem("asufiji-theme"); return t === "light" || t === "dark" ? t : null; } catch { return null; }
}
// the device setting wins until someone picks a theme with the switch
scheme.addEventListener?.("change", () => { if (!savedTheme()) applyTheme(scheme.matches ? "light" : "dark"); });
document.querySelector(".theme-toggle")?.addEventListener("click", () => {
  const next = theme() === "dark" ? "light" : "dark";
  try { localStorage.setItem("asufiji-theme", next); } catch {}
  applyTheme(next);
});
document.querySelector(".theme-toggle")?.setAttribute("aria-label", theme() === "dark" ? "Switch to day" : "Switch to night");
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
    // touch: the top card of the deck opens on its own (see frame); a tap toggles it by hand
    const hint = document.createElement("span");
    hint.className = "card-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.innerHTML = '<svg viewBox="0 0 9 10"><path fill="currentColor" d="M0 0l9 5-9 5z"/></svg>Tap to watch';
    art.append(hint);
    art.addEventListener("click", () => {
      const open = art.classList.toggle("open");
      art.dataset.shut = open ? "" : "1";
      if (open) play(); else stop();
    });
  }
});
const setOpen = (art, on) => {
  if (art.classList.contains("open") === on) return;
  art.classList.toggle("open", on);
  const v = art.querySelector("video");
  if (on) { if (!reduced) { liveVid = v; v.play().catch(() => {}); } }
  else { v.pause(); if (liveVid === v) liveVid = null; }
};
// browsers pause video in background tabs; resume on return
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") liveVid?.play().catch(() => {});
});

// ---------- sign-in shells: accounts aren't live yet, so say so on submit ----------
document.querySelectorAll("form.login").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    form.querySelector(".login-msg").textContent = form.dataset.msg || "Sign-in opens soon.";
  });
});

// ---------- film postcards: play while on screen ----------
const films = [...document.querySelectorAll(".frame video")];
const frames = [...document.querySelectorAll(".frame")];
if (films.length && !reduced && "IntersectionObserver" in window) {
  const onScreen = new Set();
  const fio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { onScreen.add(e.target); e.target.play().catch(() => {}); }
      else { onScreen.delete(e.target); e.target.pause(); }
    }
  }, { threshold: 0.2 });
  films.forEach((v) => fio.observe(v));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onScreen.forEach((v) => v.play().catch(() => {}));
  });
}

// ---------- one rAF scroll loop: hero drift, deck stacking, art parallax, nav state ----------
const hero = document.querySelector(".hero");
const cards = [...document.querySelectorAll(".card")];
const arts = cards.map((c) => c.querySelector(".art-shader"));
const cardArts = cards.map((c) => c.querySelector(".card-art"));
const compass = document.querySelector(".week-compass");
const navLinks = [...document.querySelectorAll(".rail-link")];

// phone menu
const rail = document.querySelector(".rail");
const menuBtn = document.querySelector(".rail-menu");
menuBtn?.addEventListener("click", () => {
  const open = rail.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.textContent = open ? "Close" : "Menu";
});
const closeMenu = () => { if (rail?.classList.contains("open")) menuBtn.click(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
// close on a link tap (same-page anchors don't navigate) and on any tap outside the rail
rail?.querySelector(".rail-links")?.addEventListener("click", (e) => { if (e.target.closest("a")) closeMenu(); });
document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".rail")) closeMenu(); }, { passive: true });

let queued = false;
function frame() {
  queued = false;
  const vh = window.innerHeight;
  const y = window.scrollY;
  let top = -1;

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
    if (p < 0.5 && r.top < vh * 0.55 && r.bottom > vh * 0.55) top = i;
    if (!reduced && arts[i]) {
      const off = (r.top + r.height / 2 - vh / 2) / vh;
      arts[i].style.setProperty("--py", (off * -36).toFixed(2) + "px");
    }
  }

  // touch: only the card on top of the deck shows its film; the rest pause
  if (!finePtr) {
    for (let i = 0; i < cards.length; i++) {
      const art = cardArts[i];
      if (!art) continue;
      if (i !== top) { art.dataset.shut = ""; setOpen(art, false); }
      else if (art.dataset.shut !== "1") setOpen(art, true);
    }
  }

  if (!reduced) {
    frames.forEach((f, i) => {
      const r = f.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const off = (r.top + r.height / 2 - vh / 2) / vh;
      f.style.setProperty("--py", (off * (i === 1 ? -60 : -24)).toFixed(2) + "px");
    });
  }

  if (compass && !reduced) {
    const r = compass.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) compass.style.setProperty("--rot", ((r.top + r.height / 2 - vh / 2) * -0.08).toFixed(2) + "deg");
  }

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
