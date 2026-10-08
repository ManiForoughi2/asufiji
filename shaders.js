// =============================================================================
// Paper Shaders (shaders.paper.design) — vanilla loader + mount helper.
// No build step: @paper-design/shaders is pulled from a CDN as an ES module at
// runtime. Every mount degrades gracefully — if the CDN, WebGL, or a uniform
// conversion fails, the host element keeps its CSS fallback background and the
// page works untouched.
// =============================================================================

const VERSION = "0.0.76"; // pinned: the package ships breaking changes under 0.0.x
const CDNS = [
  `https://esm.sh/@paper-design/shaders@${VERSION}`,
  `https://cdn.jsdelivr.net/npm/@paper-design/shaders@${VERSION}/dist/index.js`,
  `https://unpkg.com/@paper-design/shaders@${VERSION}/dist/index.js`,
];

let libPromise = null;
export function loadShaderLib() {
  if (!libPromise) {
    libPromise = (async () => {
      for (const url of CDNS) {
        try { return await import(url); } catch { /* try the next CDN */ }
      }
      return null;
    })();
  }
  return libPromise;
}

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The shaders this site uses. `frag` names the fragment-shader export, `sizing`
// picks the lib's default sizing params, `enums` maps string params (shape,
// type…) onto the lib's numeric lookup tables, `noise` marks shaders that need
// the pre-computed randomizer texture.
const SHADERS = {
  meshGradient:  { frag: "meshGradientFragmentShader",  sizing: "object" },
  grainGradient: { frag: "grainGradientFragmentShader", sizing: "object", noise: true, enums: { shape: "GrainGradientShapes" } },
  dithering:     { frag: "ditheringFragmentShader",     sizing: "pattern", enums: { shape: "DitheringShapes", type: "DitheringTypes" }, renames: { size: "pxSize" } },
  pulsingBorder: { frag: "pulsingBorderFragmentShader", sizing: "object", noise: true, enums: { aspectRatio: "PulsingBorderAspectRatios" } },
  godRays:       { frag: "godRaysFragmentShader",       sizing: "object", noise: true },
  smokeRing:     { frag: "smokeRingFragmentShader",     sizing: "object", noise: true },
  water:         { frag: "waterFragmentShader",         sizing: "object", blankImage: true },
};

// shaders that sample u_image get a transparent one, so they render pure surface
// instead of whatever an unbound texture unit returns
let blankPromise = null;
function blankImage() {
  if (!blankPromise) {
    blankPromise = (async () => {
      const c = document.createElement("canvas");
      c.width = c.height = 4;
      const img = new Image();
      img.src = c.toDataURL("image/png");
      try { await img.decode(); } catch { /* still usable once loaded */ }
      return img;
    })();
  }
  return blankPromise;
}

// Convert friendly params ({colors:['#fff'], swirl:.6, shape:'sphere'}) into the
// u_-prefixed uniforms ShaderMount expects. Unknown numeric params pass through
// as u_<name>, matching the library's own convention.
function toUniforms(lib, def, params) {
  const u = {};
  for (const [key, val] of Object.entries(params)) {
    if (val == null || key === "speed" || key === "frame") continue;
    if (key === "colors") {
      u.u_colors = val.map((c) => lib.getShaderColorFromString(c));
      u.u_colorsCount = val.length;
    } else if (key.startsWith("color")) {
      // colorBack / colorFront / colorBloom / … — any single-color param
      u["u_" + key] = lib.getShaderColorFromString(val);
    } else if (key === "fit") {
      u.u_fit = lib.ShaderFitOptions[val] ?? val;
    } else if (def.enums && def.enums[key] != null && typeof val === "string") {
      u["u_" + key] = lib[def.enums[key]][val];
    } else {
      u["u_" + ((def.renames && def.renames[key]) || key)] = val;
    }
  }
  return u;
}

// Mount a shader into `el` (el must be positioned; the canvas fills it).
// Returns a handle { set, speed, dispose } or null when anything is missing.
export async function mountShader(el, type, params = {}, opts = {}) {
  const def = SHADERS[type];
  if (!el || !def || el.paperShaderMount) return null;
  // The re-mount guard above is checked before any await — close the async gap too, or two
  // overlapping mounts on the same element both pass it and stack two WebGL contexts.
  if (el.dataset.shaderPending) return null;
  el.dataset.shaderPending = "1";
  try {
    return await mountShaderInner(el, def, params, opts);
  } finally {
    delete el.dataset.shaderPending;
  }
}

async function mountShaderInner(el, def, params, opts) {
  const lib = await loadShaderLib();
  if (!lib || !lib.ShaderMount || !lib[def.frag]) return null;

  const sizingDefaults = def.sizing === "pattern" ? lib.defaultPatternSizing : lib.defaultObjectSizing;
  let uniforms;
  try { uniforms = toUniforms(lib, def, { ...sizingDefaults, ...params }); } catch { return null; }

  if (def.noise && lib.getShaderNoiseTexture) {
    const img = lib.getShaderNoiseTexture();
    if (img) {
      if (!img.complete) await new Promise((res) => { img.onload = res; img.onerror = res; });
      uniforms.u_noiseTexture = img;
    }
  }

  // Reduced motion: render a single, well-developed frame and never animate.
  if (def.blankImage) uniforms.u_image = await blankImage();

  const reduced = prefersReducedMotion();
  const desired = params.speed ?? 0.2;
  const speed = reduced ? 0 : desired;
  const frame = params.frame ?? (reduced ? 38000 : 0);

  let mount;
  try {
    mount = new lib.ShaderMount(el, lib[def.frag], uniforms, undefined, speed, frame,
      opts.minPixelRatio ?? 1.5, opts.maxPixelCount);
  } catch { return null; }
  el.classList.add("shader-on");

  const handle = {
    _speed: speed,
    _visible: true,
    set(next) { try { mount.setUniforms(toUniforms(lib, def, next)); } catch { /* keep last good frame */ } },
    speed(v) { this._speed = reduced ? 0 : v; if (this._visible) mount.setSpeed(this._speed); },
    dispose() { try { io?.disconnect(); mount.dispose(); } catch {} el.classList.remove("shader-on"); },
  };

  // Pause offscreen mounts — speed 0 stops the rAF loop entirely.
  let io = null;
  if (opts.pauseOffscreen !== false && !reduced && "IntersectionObserver" in window) {
    io = new IntersectionObserver(([entry]) => {
      handle._visible = entry.isIntersecting;
      mount.setSpeed(entry.isIntersecting ? handle._speed : 0);
    }, { rootMargin: "120px" });
    io.observe(el);
  }
  return handle;
}
