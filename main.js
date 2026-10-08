import { mountShader, prefersReducedMotion } from "./shaders.js?v=d0e76af4";
import { startSea } from "./sea.js?v=d0e76af4";

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
// the title face may land after the first paint; repaint the reflection with the real letters
document.fonts?.ready.then(() => sea?.redraw());
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
// phones always follow the phone's own setting; the saved pick is desktop-only
const phoneTheme = matchMedia("(max-width: 760px), (hover: none) and (pointer: coarse)");
function savedTheme() {
  if (phoneTheme.matches) return null;
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
// phones skip the lens and the deck: keep in sync with css/m-cards.css
const phoneMQ = matchMedia("(max-width: 760px), (max-height: 500px) and (orientation: landscape) and (pointer: coarse)");
let liveVid = null;
document.querySelectorAll(".card-art").forEach((art) => {
  const video = art.querySelector("video");
  const print = art.querySelector(".art-shader");
  const play = () => { if (!reduced) { liveVid = video; video.play().catch(() => {}); } };
  const stop = () => { video.pause(); if (liveVid === video) liveVid = null; };
  if (finePtr) {
    art.addEventListener("pointerenter", () => { if (phoneMQ.matches) return; art.classList.add("lens"); play(); });
    art.addEventListener("pointermove", (e) => {
      const r = print.getBoundingClientRect();
      print.style.setProperty("--mx", (e.clientX - r.left).toFixed(1) + "px");
      print.style.setProperty("--my", (e.clientY - r.top).toFixed(1) + "px");
    });
    art.addEventListener("pointerleave", () => { if (phoneMQ.matches) return; art.classList.remove("lens"); stop(); });
  } else {
    // touch: the top card of the deck opens on its own (see frame); a tap toggles it by hand
    const hint = document.createElement("span");
    hint.className = "card-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.innerHTML = '<svg viewBox="0 0 9 10"><path fill="currentColor" d="M0 0l9 5-9 5z"/></svg>Tap to watch';
    art.append(hint);
    art.addEventListener("click", () => {
      if (phoneMQ.matches) return;
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

// phones: the film is the art. the card nearest mid-screen plays, every other one sits paused
const deck = document.querySelector(".deck");
const deckVids = [...document.querySelectorAll(".card-art video")];
let deckNear = false, pickQueued = false;
const pickFilm = () => {
  pickQueued = false;
  if (!phoneMQ.matches) return;
  let best = null;
  if (deckNear && !reduced) {
    const vh = window.innerHeight;
    let bestD = Infinity, curD = Infinity;
    for (const v of deckVids) {
      const r = v.getBoundingClientRect();
      if (!r.height || (Math.min(r.bottom, vh) - Math.max(r.top, 0)) / r.height < 0.6) continue;
      const d = Math.abs(r.top + r.height / 2 - vh / 2);
      if (v === liveVid) curD = d;
      if (d < bestD) { bestD = d; best = v; }
    }
    // keep the playing film until another is clearly closer to the middle, so two in view don't flip
    if (curD !== Infinity && curD - bestD < 48) best = liveVid;
  }
  for (const v of deckVids) if (v !== best && !v.paused) v.pause();
  if (best) { liveVid = best; if (best.paused) best.play().catch(() => {}); }
  else if (deckVids.includes(liveVid)) liveVid = null;
};
const queuePick = () => { if (!pickQueued) { pickQueued = true; requestAnimationFrame(pickFilm); } };
if (deck && "IntersectionObserver" in window) {
  new IntersectionObserver(([e]) => { deckNear = e.isIntersecting; queuePick(); }, { rootMargin: "25% 0px" }).observe(deck);
  window.addEventListener("scroll", () => { if (deckNear && phoneMQ.matches) queuePick(); }, { passive: true });
  window.addEventListener("resize", queuePick, { passive: true });
  phoneMQ.addEventListener("change", () => {
    document.querySelectorAll(".card-art").forEach((a) => { a.classList.remove("lens", "open"); a.dataset.shut = ""; });
    deckVids.forEach((v) => v.pause());
    liveVid = null;
    queuePick();
  });
}

// ---------- sign-in shells: accounts aren't live yet, so say so on submit ----------
document.querySelectorAll("form.login").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    form.querySelector(".login-msg").textContent = form.dataset.msg || "Sign-in opens soon.";
  });
});

// ---------- film postcards: play while on screen ----------
// every video paints its own first frame underneath, so nothing flashes dark while it starts
document.querySelectorAll("video[poster]").forEach((v) => {
  v.style.background = `#19203a center / cover no-repeat url("${v.getAttribute("poster")}")`;
});
const films = [...document.querySelectorAll(".frame video")];
const frames = [...document.querySelectorAll(".frame")];
const filmRow = document.querySelector(".frames");
const filmSection = document.querySelector(".film");
// phones get an endless swipe row (m-home.css); keep in step with its breakpoint
const filmSwipe = matchMedia("(max-width: 760px)");
let rowFrames = frames;                     // on phones: clones + originals + clones
let near = false;
const onScreen = new Set();
const syncFilms = () => {
  if (reduced) return;
  const live = document.visibilityState === "visible";
  if (filmSwipe.matches) {
    // only the cards actually in view play, wherever they are in the endless row
    rowFrames.forEach((f) => {
      const v = f.querySelector("video");
      const want = live && near && parseFloat(f.style.getPropertyValue("--k") || 0) > 0.02;
      if (want && v.paused) v.play().catch(() => {});
      else if (!want && !v.paused) v.pause();
    });
  } else {
    films.forEach((v) => {
      const want = live && onScreen.has(v);
      if (want && v.paused) v.play().catch(() => {});
      else if (!want && !v.paused) v.pause();
    });
  }
};
if (films.length && "IntersectionObserver" in window) {
  const fio = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target);
    syncFilms();
  }, { threshold: 0.2 });
  films.forEach((v) => fio.observe(v));
  if (filmSection) new IntersectionObserver(([e]) => { near = e.isIntersecting; syncFilms(); }, { rootMargin: "20% 0px" }).observe(filmSection);
  document.addEventListener("visibilitychange", syncFilms);
}

if (filmRow && frames.length) {
  let clones = [];
  const makeClone = (f) => {
    const c = f.cloneNode(true);
    c.classList.add("clone"); c.setAttribute("aria-hidden", "true");
    c.querySelector("video")?.setAttribute("preload", "none");
    return c;
  };
  const build = () => {
    clones.forEach((c) => c.remove()); clones = [];
    if (filmSwipe.matches) {
      const before = frames.map(makeClone), after = frames.map(makeClone);
      before.forEach((c) => filmRow.insertBefore(c, frames[0]));
      after.forEach((c) => filmRow.appendChild(c));
      clones = [...before, ...after];
      rowFrames = [...before, ...frames, ...after];
    } else rowFrames = frames;
  };
  let fq = false;
  // --k is 1 for the centred postcard and falls to 0 one card away
  const centre = () => {
    fq = false;
    if (!filmSwipe.matches) { frames.forEach((f) => { f.style.removeProperty("--k"); f.classList.remove("on"); }); return; }
    const mid = filmRow.scrollLeft + filmRow.clientWidth / 2;
    const step = rowFrames[1].offsetLeft - rowFrames[0].offsetLeft;
    rowFrames.forEach((f) => {
      const c = f.offsetLeft - filmRow.offsetLeft + f.offsetWidth / 2;
      const k = clamp(1 - Math.abs(c - mid) / step, 0, 1);
      f.style.setProperty("--k", k.toFixed(3));
      f.classList.toggle("on", k > 0.5);
    });
    syncFilms();
  };
  const queueCentre = () => { if (!fq) { fq = true; requestAnimationFrame(centre); } };
  const leftFor = (f) => f.offsetLeft - filmRow.offsetLeft + f.offsetWidth / 2 - filmRow.clientWidth / 2;
  const snapTo = (f, smooth) => filmRow.scrollTo({ left: leftFor(f), behavior: smooth && !reduced ? "smooth" : "instant" });
  // when a swipe settles on a copy, hop to the matching original; same picture, so the jump is invisible
  let settle = 0;
  const wrap = () => {
    if (!filmSwipe.matches) return;
    const n = frames.length;
    const mid = filmRow.scrollLeft + filmRow.clientWidth / 2;
    let best = 0, bd = Infinity;
    rowFrames.forEach((f, i) => { const d = Math.abs(f.offsetLeft - filmRow.offsetLeft + f.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
    if (best >= n && best < 2 * n) return;
    const target = rowFrames[n + (best % n)], from = rowFrames[best];
    const tv = target.querySelector("video"), fv = from.querySelector("video");
    if (tv && fv && fv.readyState > 1) { try { tv.currentTime = fv.currentTime; } catch {} }
    const snap = filmRow.style.scrollSnapType;
    filmRow.style.scrollSnapType = "none";
    filmRow.scrollLeft += leftFor(target) - leftFor(from);
    filmRow.style.scrollSnapType = snap;
    queueCentre();
  };
  const open = () => { build(); if (filmSwipe.matches) snapTo(frames[1] || frames[0], false); queueCentre(); };
  open();
  filmSwipe.addEventListener("change", open);
  filmRow.addEventListener("scroll", () => { queueCentre(); clearTimeout(settle); settle = setTimeout(wrap, 140); }, { passive: true });
  if ("onscrollend" in window) filmRow.addEventListener("scrollend", wrap);
  addEventListener("resize", queueCentre, { passive: true });
  // a tap on a peeking card brings it to the middle
  filmRow.addEventListener("click", (e) => {
    const f = e.target.closest(".frame");
    if (f && filmSwipe.matches && !f.classList.contains("on")) snapTo(f, true);
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
const phoneNav = matchMedia("(max-width: 760px), (max-height: 500px) and (pointer: coarse)");
let menuOpen = false;
function setMenu(open) {
  if (!rail || !menuBtn || open === menuOpen) return;
  menuOpen = open;
  const hadFocus = rail.contains(document.activeElement);
  rail.classList.toggle("open", open);
  root.classList.toggle("menu-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.textContent = open ? "Close" : "Menu";
  // everything but the rail goes inert, which also keeps tab focus inside the menu
  for (const el of document.body.children) if (el !== rail) el.inert = open;
  if (open) rail.querySelector(".rail-link")?.focus({ preventScroll: true });
  else if (hadFocus) menuBtn.focus({ preventScroll: true });
}
const closeMenu = () => setMenu(false);
menuBtn?.addEventListener("click", () => setMenu(!menuOpen));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menuOpen) { e.preventDefault(); closeMenu(); } });
// close on any link tap in the rail (same-page anchors don't navigate)
rail?.addEventListener("click", (e) => { if (e.target.closest("a")) closeMenu(); });
phoneNav.addEventListener?.("change", closeMenu);
addEventListener("pageshow", closeMenu);
// the bar takes a fill once the page moves under it
const railScrolled = () => rail?.classList.toggle("is-scrolled", window.scrollY > 8);
addEventListener("scroll", railScrolled, { passive: true });
railScrolled();
// day / night inside the menu drives the same switch as the desktop toggle
const themePicks = [...document.querySelectorAll("[data-theme-pick]")];
const syncPicks = () => themePicks.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themePick === theme())));
themePicks.forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.themePick !== theme()) document.querySelector(".theme-toggle")?.click();
}));
new MutationObserver(syncPicks).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
syncPicks();

let queued = false;
// style writes go through here: skipped when the value hasn't moved, so a still part of the page
// isn't restyled on every scroll frame
const setVar = (el, k, v) => {
  const c = el._sv || (el._sv = {});
  if (c[k] !== v) { c[k] = v; el.style.setProperty(k, v); }
};
const cardBox = [], cardH = [], artTop = [], frameBox = [];
function frame() {
  queued = false;
  const vh = window.innerHeight;
  const y = window.scrollY;
  let top = -1;

  // the hero is gone after one screen; stop touching it
  if (hero && !reduced && y < vh * 1.5) setVar(hero, "--hp", clamp(y / (vh * 0.9), 0, 1).toFixed(4));

  const phone = phoneMQ.matches;
  if (!phone) {
    // every read first, then every write: interleaving them forced a style + layout pass per card
    for (let i = 0; i < cards.length; i++) {
      cardBox[i] = cards[i].getBoundingClientRect();
      cardH[i] = cards[i].offsetHeight;
      artTop[i] = cardArts[i] ? cardArts[i].getBoundingClientRect().top : Infinity;
    }
    for (let i = 0; i < cards.length; i++) {
      const r = cardBox[i];
      if (r.bottom < -vh || r.top > vh * 2) continue;
      const nr = cardBox[i + 1];
      const p = nr ? clamp(1 - (nr.top - r.top) / cardH[i], 0, 1) : 0;
      setVar(cards[i], "--p", p.toFixed(4));
      if (p < 0.5 && r.top < vh * 0.55 && r.bottom > vh * 0.55) top = i;
      if (!reduced && arts[i]) {
        const off = (r.top + r.height / 2 - vh / 2) / vh;
        setVar(arts[i], "--py", (off * -36).toFixed(2) + "px");
      }
      // a print buried under the next card can't be seen: hold its shader until it's uncovered
      const m = arts[i]?.paperShaderMount;
      if (m && !reduced) {
        const buried = !!nr && nr.top <= artTop[i] + 1;
        if (buried && m.speed !== 0) { m._held = m.speed; m.setSpeed(0); }
        else if (!buried && m._held != null) {
          if (r.bottom > -120 && r.top < vh + 120) m.setSpeed(m._held);
          m._held = null;
        }
      }
    }
  }

  // touch: only the card on top of the deck shows its film; the rest pause
  if (!finePtr && !phone) {
    for (let i = 0; i < cards.length; i++) {
      const art = cardArts[i];
      if (!art) continue;
      if (i !== top) { art.dataset.shut = ""; setOpen(art, false); }
      else if (art.dataset.shut !== "1") setOpen(art, true);
    }
  }

  // the phone swipe row has its own motion (--k); vertical drift there is wasted work
  if (!reduced && !filmSwipe.matches) {
    for (let i = 0; i < frames.length; i++) frameBox[i] = frames[i].getBoundingClientRect();
    frames.forEach((f, i) => {
      const r = frameBox[i];
      if (r.bottom < 0 || r.top > vh) return;
      const off = (r.top + r.height / 2 - vh / 2) / vh;
      setVar(f, "--py", (off * (i === 1 ? -60 : -24)).toFixed(2) + "px");
    });
  }

  if (compass && !reduced) {
    const r = compass.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) setVar(compass, "--rot", ((r.top + r.height / 2 - vh / 2) * -0.08).toFixed(2) + "deg");
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
