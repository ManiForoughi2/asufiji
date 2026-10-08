// night scene behind the crest: one WebGL pass draws the sky AND the sea from the same light
// model, so the reflection samples exactly the sky it sits under. perspective wave field from
// just above the surface, fresnel mirror toward the horizon, mist across the horizon line, a low
// glow behind the word, and the real DOM wordmark reflected through the wave normals.
// returns null if WebGL is unavailable (the CSS sky + DOM reflection stay as the fallback).

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

// 12 waves, constants baked on the cpu: dir, k, w never change, only the phase moves
const TAU = Math.PI * 2;
const WAVES = [];
for (let i = 0, L = 9; i < 12; i++, L *= 0.7) {
  const ang = Math.sin(i * 12.9898) * 0.7, k = TAU / L;
  WAVES.push({ L, dx: Math.sin(ang), dz: Math.cos(ang), k, w: Math.sqrt(9.8 * k), off: i * 1.7 });
}
const f = (x) => x.toPrecision(9);
const AK = 0.011 * TAU;                                     // amplitude * k, same for every wave

// smoothstep(4fp, 14fp, L) == s(L / 10fp - 0.4); waves shorter than 4fp are fully attenuated and
// they only get shorter, so stop there (far pixels near the horizon need just a few)
const WAVE_GLSL = `
vec2 waveGrad(vec2 xz, float fp) {
  vec2 g = vec2(0.0);
  float iv = 0.1 / fp, f4 = 4.0 * fp, a;
${WAVES.map((w, i) => `  if (f4 >= ${f(w.L)}) return g;
  a = clamp(${f(w.L)} * iv - 0.4, 0.0, 1.0);
  g += vec2(${f(w.dx * AK)}, ${f(w.dz * AK)}) * (cos(dot(vec2(${f(w.dx * w.k)}, ${f(w.dz * w.k)}), xz) + uPh[${i}]) * a * a * (3.0 - 2.0 * a));`).join("\n")}
  return g;
}`;

// one source, two programs: sky pixels never pay for (or hold registers for) the sea path
const FRAG = (part, oct = 4) => `
#define ${part}
#define OCT ${oct}
precision highp float;
uniform vec2 uRes;        // canvas size, device px
uniform float uHz;        // horizon, device px from the top (= the word's baseline)
uniform float uTime;
uniform float uF;         // focal length, device px
uniform float uQ;         // render scale, keeps the star grid in full-res px
uniform float uStars;     // 1 at night, 0 by day
uniform sampler2D uWord;  // word alpha for the area above the horizon; bottom row = horizon
uniform sampler2D uPlateDay, uPlateNight; // blender-rendered sky + islands; bottom row = horizon (see asufiji-render)
uniform float uNight;     // 0 day .. 1 night, animated on theme switch
uniform float uPlateOn;   // 1 once the render has loaded
uniform vec2 uPlateT;     // the render's half-width and full-height, in tan(angle)
uniform vec2 uSunT;       // the rendered sun, in tan(angle) (x right, y up)
uniform vec3 uHorizon;    // the render's horizon color with the islands left out
uniform vec2 uWordRes;
uniform float uWordHz;    // the horizon's row in the word texture (it also holds what hangs below)
uniform float uPh[12];    // per-wave phase at uTime, wrapped on the cpu
uniform vec3 uSkyTop, uSkyMid, uHaze, uGlow, uBody, uDeep, uGlint, uWordCol;
uniform vec3 uIsle, uIsleFar, uCloud;   // island silhouettes and cloud tint
uniform vec3 uSkyLow, uSkyHz, uSun, uCloudLit;  // sunset band colors, sun, sunlit cloud edge
uniform float uSunE;                    // sun elevation (sin), just above or below the horizon
uniform float uClouds;                  // cloud amount
// scene texture (premultiplied): r = wordmark, g = near island, b = far island

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// the blender render, looked up by view direction so any screen shape maps onto it
vec3 plate(vec3 d) {
  vec2 t = d.xy / d.z;
  vec2 uv = vec2(0.5 + t.x / (2.0 * uPlateT.x), 1.0 - clamp(t.y, 0.0, uPlateT.y) / uPlateT.y);
  return mix(texture2D(uPlateDay, uv).rgb, texture2D(uPlateNight, uv).rgb, uNight);
}

// the sun sits low, straight behind the crest
vec3 sunDir() { return normalize(vec3(0.0, uSunE, 1.0)); }

// a sunset sky: hot band at the horizon, warm low sky, then mid and top; the sun's halo
// is strongest straight behind the word and spreads sideways along the horizon
vec3 sky(vec3 d) {
  float e = max(d.y, 0.0);
  float side = d.x * d.x;
  vec3 hz = mix(uSkyHz, uSkyLow, smoothstep(0.05, 0.9, side));          // the band cools away from the sun
  vec3 c = mix(hz, uSkyLow, smoothstep(0.0, 0.06, e));
  c = mix(c, uSkyMid, smoothstep(0.05, 0.26, e));
  c = mix(c, uSkyTop, smoothstep(0.24, 0.75, e));
  float cs = max(dot(d, sunDir()), 0.0);
  float cs2 = cs * cs, cs4 = cs2 * cs2, cs8 = cs4 * cs4;
  c += uSun * (cs8 * cs8 * cs8 * 0.32 + cs4 * 0.08) * (1.0 - 0.6 * smoothstep(0.0, 0.3, e));
  c += uSun * smoothstep(0.99985, 0.99993, cs) * 1.4;                   // the disk, when it is up
  return c;
}
#ifdef SKY
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < OCT; i++) { v += a * vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return v;
}
#endif
#ifdef SEA
${WAVE_GLSL}
#endif

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);   // y from the top
  float dy = uHz - px.y;                                     // + above the horizon
  vec3 d = normalize(vec3((px.x - uRes.x * 0.5) / uF, (dy - 0.75) / uF, 1.0));
  vec3 col;

#ifdef SKY
  if (dy <= 0.0) discard;
  if (uPlateOn > 0.5) {
    col = plate(d);
    // stars come out only in the dark upper sky of the night render
    vec2 sp = px / (uQ * 3.0);
    float h = hash(floor(sp));
    if (h > 0.997) {
      float dark = 1.0 - smoothstep(0.08, 0.3, dot(col, vec3(0.3, 0.5, 0.2)));
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
      float core = smoothstep(0.5, 0.0, length(fract(sp) - 0.5));
      col += vec3(0.92, 0.9, 0.85) * core * tw * dark * uStars * smoothstep(0.08, 0.3, d.y) * (h - 0.997) * 200.0;
    }
  } else {
  col = sky(d);
  // a sparse field of stars, thinning toward the horizon haze
  vec2 sp = px / (uQ * 3.0);
  float h = hash(floor(sp));
  if (h > 0.9965) {
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    float fade = smoothstep(0.04, 0.22, d.y);
    float core = smoothstep(0.5, 0.0, length(fract(sp) - 0.5));
    col += vec3(0.92, 0.9, 0.85) * core * tw * fade * uStars * (h - 0.9965) * 220.0;
  }
  // a cloud deck seen in perspective, lit from below by the low sun: the side of each
  // cloud facing the horizon catches the light, the rest falls into the dusk color
  float e = d.y;
  vec2 cp = vec2(d.x, 1.0) / max(e, 0.018);
  vec2 q = vec2(cp.x * 0.34 + uTime * 0.01, cp.y * 1.15);
  float cl = fbm(q);
  float cm = smoothstep(0.47, 0.8, cl) * smoothstep(0.018, 0.1, e) * (1.0 - smoothstep(0.38, 0.9, e));
  if (cm > 0.001) {
    float lit = clamp((cl - fbm(q + vec2(0.0, 0.35))) * 3.2 + 0.45, 0.0, 1.0);   // thinner toward the sun = lit edge
    float cs = max(dot(d, sunDir()), 0.0);
    float glow = cs * cs; glow *= glow; glow *= glow;
    vec3 cc = mix(uCloud, uCloudLit, lit * (0.55 + 0.45 * smoothstep(0.35, 0.0, e)));
    cc += uSun * glow * (0.35 + 0.65 * lit) * 0.7;                          // silver lining near the sun
    col = mix(col, cc, cm * uClouds);
  }
  // islands on the horizon, the far one already half lost in the haze
  vec4 sc = texture2D(uWord, vec2(px.x / uWordRes.x, px.y / uWordRes.y));
  col = mix(col, uIsleFar, sc.b);
  col = mix(col, uIsle, sc.g);
  }
#else
  if (dy > 0.0) discard;
  float t = 1.0 / -d.y;                                      // eye height 1
  vec3 p = d * t;
  float fp = t / uF;
  vec2 g = waveGrad(p.xz, fp);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 r = reflect(d, n);
  r.y = max(r.y, 0.0005);
  float c = 1.0 - max(dot(-d, n), 0.0), c2 = c * c;
  float fres = 0.02 + 0.98 * c2 * c2 * c;

  float up = r.y / r.z * uF;
  float xs = uRes.x * 0.5 + r.x / r.z * uF;
  vec2 wuv = vec2(xs / uWordRes.x, (uWordHz - up) / uWordRes.y);
  vec4 sc = vec4(0.0);
  if (wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0 && wuv.y < 1.0) sc = texture2D(uWord, wuv);
  vec3 refl;
  if (uPlateOn > 0.5) refl = plate(r) * 0.86;
  else {
    refl = sky(r) * 0.85;
    refl = mix(refl, uIsleFar * 0.9, sc.b);
    refl = mix(refl, uIsle * 0.9, sc.g);
  }
  refl = mix(refl, uWordCol * 0.86, sc.r * 0.74);

  float depth01 = clamp(-dy / (uRes.y - uHz), 0.0, 1.0);
  vec3 body = mix(uBody, uDeep, depth01) * (0.85 + 0.15 * n.z);
  col = mix(body, refl, fres);

  vec3 L = normalize(uPlateOn > 0.5 ? vec3(uSunT.x, max(uSunT.y, 0.012), 1.0) : vec3(0.0, max(uSunE, 0.012), 1.0));
  float s = pow(max(dot(r, L), 0.0), 900.0);
  col += uGlint * s * 1.6 * (1.0 - smoothstep(0.0, 1.0, fp * 0.08));

  vec3 far = uPlateOn > 0.5 ? uHorizon : uHaze;            // the horizon's own color
  col = mix(far, col, exp(-t * 0.0045));                   // sea fades into the mist
#endif

  // one band of mist straddles the horizon so sky and sea meet without a seam
  float mist = exp(-abs(dy) / (uRes.y * 0.035));
  float mx = (px.x / uRes.x - 0.5) * 2.4;
  if (uPlateOn > 0.5) col = mix(col, uHorizon, mist * 0.3);
  else col = mix(col, mix(uHaze, uSkyHz, exp(-mx * mx)) + uGlow * 0.12 * exp(-mx * mx), mist * 0.5);

  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dn - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// night = the last of a sunset (sun just under the horizon); day = a late sunrise (sun low, up)
const LOOK = {
  dark: {
    skyTop: "#080b1c", skyMid: "#211d45", skyLow: "#6b3a58", skyHz: "#e2865a", haze: "#5a3a52", glow: "#c46a4e",
    sun: "#ffb27a", sunE: -0.006,
    body: "#121732", deep: "#070a18", glint: "#ffcf9e", word: "#f0c9a6", stars: 1,
    isle: "#0b0c1c", isleFar: "#3b2a47", cloud: "#2a2242", cloudLit: "#e9906a", clouds: 0.85,
  },
  light: {
    skyTop: "#4f86bd", skyMid: "#9cc0de", skyLow: "#f2d2b6", skyHz: "#ffdca6", haze: "#f3dcc0", glow: "#ffe2b0",
    sun: "#fff1d0", sunE: 0.03,
    body: "#3a6a95", deep: "#22496f", glint: "#fff6e2", word: "#19203a", stars: 0,
    isle: "#4d5f7a", isleFar: "#b6a9a8", cloud: "#c9d3df", cloudLit: "#fff1dc", clouds: 0.9,
  },
};
const LOOK_U = [["uSkyTop", "skyTop"], ["uSkyMid", "skyMid"], ["uSkyLow", "skyLow"], ["uSkyHz", "skyHz"],
  ["uHaze", "haze"], ["uGlow", "glow"], ["uSun", "sun"],
  ["uBody", "body"], ["uDeep", "deep"], ["uGlint", "glint"], ["uWordCol", "word"],
  ["uIsle", "isle"], ["uIsleFar", "isleFar"], ["uCloud", "cloud"], ["uCloudLit", "cloudLit"]];

// the crest's own palm (phosphor tree-palm, MIT), planted on the islands
const PALM = new Path2D("M239.84 60.33a8 8 0 0 1-4.65 5.75L179 90.55a71.42 71.42 0 0 1 43.36 33.21a70.64 70.64 0 0 1 7.2 54.32a8 8 0 0 1-12.56 4.28l-81-61.68V224a8 8 0 0 1-16 0V120.68l-81 61.68a8 8 0 0 1-12.57-4.28a70.64 70.64 0 0 1 7.2-54.32A71.42 71.42 0 0 1 77 90.55L20.81 66.08a8 8 0 0 1-2.6-12.85a66.86 66.86 0 0 1 97.74 0a72.2 72.2 0 0 1 12 17a72.2 72.2 0 0 1 12.05-17a66.86 66.86 0 0 1 97.74 0a8 8 0 0 1 2.1 7.1");

// a low island: a soft mound with palms, its base sitting on the horizon line
function island(ctx, cx, base, w, h, palms) {
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, base);
  ctx.bezierCurveTo(cx - w * 0.3, base - h * 0.05, cx - w * 0.22, base - h * 0.3, cx - w * 0.05, base - h * 0.32);
  ctx.bezierCurveTo(cx + w * 0.14, base - h * 0.34, cx + w * 0.24, base - h * 0.16, cx + w * 0.34, base - h * 0.1);
  ctx.bezierCurveTo(cx + w * 0.42, base - h * 0.06, cx + w * 0.46, base - h * 0.02, cx + w / 2, base);
  ctx.closePath();
  ctx.fill();
  for (const p of palms) {
    const ph = h * p.s, sc = ph / 232;                       // the icon's trunk runs y 8..232
    ctx.save();
    ctx.translate(cx + w * p.x, base - h * p.y);
    ctx.rotate(p.r);
    ctx.scale(sc * (p.flip ? -1 : 1), sc);
    ctx.translate(-128, -232);
    ctx.fill(PALM);
    ctx.restore();
  }
}

// quality ladder for slow gpus: drop to 30fps first (waves are slow, it reads the same),
// then render scale, never below 0.75
const LEVELS = [{ q: 1, ms: 1000 / 60 }, { q: 1, ms: 1000 / 30 }, { q: 0.85, ms: 1000 / 30 }, { q: 0.75, ms: 1000 / 30 }];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// phones and tablets: weaker gpus that also have to composite a touch scroll. same scene, fewer
// pixels, 30fps and 3 cloud octaves; it keeps moving while you scroll
const TOUCH = matchMedia("(hover: none) and (pointer: coarse)");

export function startSea(canvas, opts) {
  const { getTheme, reduced, word: wordEl } = opts;
  const touch = TOUCH.matches;
  const attrs = { antialias: false, alpha: false, premultipliedAlpha: false, depth: false, stencil: false, preserveDrawingBuffer: false };
  const gl = canvas.getContext("webgl", attrs);
  if (!gl) return null;

  const wc = document.createElement("canvas");
  const wctx = wc.getContext("2d");
  const ph = new Float32Array(12);
  const px1 = new Uint8Array(4);

  let progs, sky, sea, tex;
  let dpr = 1, raf = 0, visible = true, lost = false, last = 0;
  let level = 0, W = 1, H = 1, hz = 0, acc = 0, n = 0, bad = 0;
  let scrollT = -1e9, cw = 0, ch = 0;

  function init() {
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const mk = (part) => {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG(part, touch ? 3 : 4)));
      gl.bindAttribLocation(p, 0, "p");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const c = {};
      return { p, u: (n) => (n in c ? c[n] : (c[n] = gl.getUniformLocation(p, n))) };
    };
    sky = mk("SKY"); sea = mk("SEA"); progs = [sky, sea];
    sky.time = sky.u("uTime"); sea.time = sea.u("uTime"); sea.ph = sea.u("uPh");

    // one oversized triangle covers the viewport, no diagonal seam
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.SCISSOR_TEST);

    texs.day = texs.night = null; shapeNow = "";   // a restored context needs the renders uploaded again
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  const each = (fn) => { for (const P of progs) { gl.useProgram(P.p); fn(P.u); } };

  // ---- the blender render (asufiji-render/build_scene.py) ----
  // wide: desktop/landscape framing; tall: phones, where the islands sit just outside the word.
  // sun = the day render's sun, moon = the night render's moon, both in tan(angle)
  const PLATES = {
    wide: { tx: 0.56, tv: 0.672, sun: [0.1228, 0.196], moon: [-0.38, 0.27] },
    tall: { tx: 0.25, tv: 0.66, sun: [0.1228, 0.196], moon: [-0.13, 0.25] },
  };
  const imgs = new Map();                       // key -> decoded image (or null while loading)
  const texs = { day: null, night: null };
  let shapeNow = "", horizon = { day: [0.6, 0.6, 0.62], night: [0.1, 0.12, 0.2] };
  let nightNow = getTheme() === "light" ? 0 : 1, fadeRaf = 0;

  const shapeFor = () => {
    const edge = (canvas.clientWidth / 2) / (Math.max(canvas.clientWidth, canvas.clientHeight * 1.1) * 0.95);
    return edge <= PLATES.tall.tx ? "tall" : "wide";
  };
  function horizonOf(img) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 8;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, img.height - 8, img.width, 8, 0, 0, 256, 8);
    const px = x.getImageData(0, 0, 256, 8).data;
    let r = 0, g = 0, b = 0, n = 0, top = 0;
    for (let i = 0; i < px.length; i += 4) top = Math.max(top, px[i] + px[i + 1] + px[i + 2]);
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] + px[i + 1] + px[i + 2] < top * 0.45) continue;    // skip the island silhouettes
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
    return n ? [r / n / 255, g / n / 255, b / n / 255] : [0.5, 0.45, 0.45];
  }
  function upload(which, img, unit) {
    if (!texs[which]) texs[which] = gl.createTexture();
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, texs[which]);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    horizon[which] = img.horizon || (img.horizon = horizonOf(img));
  }
  // load both renders for this screen shape, the one on screen first
  function usePlate() {
    const shape = shapeFor();
    const order = getTheme() === "light" ? ["day", "night"] : ["night", "day"];
    const fresh = shape !== shapeNow;
    shapeNow = shape;
    for (const which of order) {
      const key = `${shape}-${which}`;
      const img = imgs.get(key);
      if (img) { if (fresh || !texs[which] || texs[which].key !== key) { upload(which, img, which === "day" ? gl.TEXTURE1 : gl.TEXTURE2); texs[which].key = key; } continue; }
      if (imgs.has(key)) continue;
      imgs.set(key, null);
      const im = new Image();
      im.decoding = "async";
      im.src = new URL(`assets/sky/${key}.webp`, import.meta.url).href;
      im.decode().then(() => { imgs.set(key, im); if (!lost) { usePlate(); applyLook(nightNow); draw(performance.now() / 1000 * 0.55); } })
        .catch(() => imgs.delete(key));
    }
    // a missing half borrows the other until it arrives, so the shader never samples an empty unit
    const haveDay = texs.day && texs.day.key === `${shape}-day`, haveNight = texs.night && texs.night.key === `${shape}-night`;
    const on = getTheme() === "light" ? haveDay : haveNight;
    each((u) => {
      gl.uniform1i(u("uWord"), 0);
      gl.uniform1i(u("uPlateDay"), haveDay ? 1 : 2);
      gl.uniform1i(u("uPlateNight"), haveNight ? 2 : 1);
      gl.uniform1f(u("uPlateOn"), on ? 1 : 0);
      gl.uniform2f(u("uPlateT"), PLATES[shape].tx, PLATES[shape].tv);
    });
    if (on) reveal();
  }
  // the scene stays hidden until its rendered sky is in, so the stand-in sky never flashes
  let shown = false;
  function reveal() {
    if (shown) return;
    shown = true;
    canvas.style.transition = reduced ? "none" : "opacity .6s ease";
    canvas.style.opacity = "1";
  }
  canvas.style.opacity = "0";
  setTimeout(reveal, 5000);        // the render never came: fall back to the drawn sky

  // every theme-driven uniform, blended by how far into night we are (0 day .. 1 night)
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function applyLook(t) {
    const d = LOOK.light, n = LOOK.dark, p = PLATES[shapeNow || shapeFor()];
    each((u) => {
      for (const [name, k] of LOOK_U) gl.uniform3fv(u(name), lerp3(hex(d[k]), hex(n[k]), t));
      gl.uniform1f(u("uStars"), lerp(d.stars, n.stars, t));
      gl.uniform1f(u("uClouds"), lerp(d.clouds, n.clouds, t));
      gl.uniform1f(u("uSunE"), lerp(d.sunE, n.sunE, t));
      gl.uniform1f(u("uNight"), t);
      gl.uniform2fv(u("uSunT"), lerp3([...p.sun, 0], [...p.moon, 0], t).slice(0, 2));
      gl.uniform3fv(u("uHorizon"), lerp3(horizon.day, horizon.night, t));
    });
  }
  function setLook() {
    const target = getTheme() === "light" ? 0 : 1;
    usePlate();
    cancelAnimationFrame(fadeRaf);
    if (reduced || target === nightNow || !progs) { nightNow = target; applyLook(nightNow); return; }
    // a slow sunrise / nightfall: ease the whole scene across about a second
    const from = nightNow, t0 = performance.now(), dur = 1100;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = k * k * (3 - 2 * k);
      nightNow = lerp(from, target, e);
      applyLook(nightNow);
      if (!lost) draw(now / 1000 * 0.55);
      if (k < 1) fadeRaf = requestAnimationFrame(step);
    };
    fadeRaf = requestAnimationFrame(step);
  }

  // horizon = the word's baseline; paint the word into a texture of the area above it
  function paintWord() {
    const cr = canvas.getBoundingClientRect();
    const cs = getComputedStyle(wordEl);
    const fs = parseFloat(cs.fontSize);
    const wr = wordEl.getBoundingClientRect();
    const baseline = wr.top - cr.top + fs * 0.87;          // line-height 1, Recia metrics
    hz = baseline * dpr;
    wc.width = Math.max(1, Math.round(cr.width * dpr));
    wc.height = Math.max(1, Math.round((baseline + fs * 0.32) * dpr));   // room for the descender under the water
    wctx.clearRect(0, 0, wc.width, wc.height);
    wctx.save();
    wctx.scale(dpr, dpr);
    wctx.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
    if ("letterSpacing" in wctx) wctx.letterSpacing = cs.letterSpacing;
    wctx.textBaseline = "alphabetic";
    // each layer in its own channel; additive so overlaps don't steal coverage from each other
    wctx.globalCompositeOperation = "lighter";
    wctx.fillStyle = "#f00";
    wctx.fillText(wordEl.textContent, wr.left - cr.left + parseFloat(cs.textIndent || 0), baseline);
    // islands sit in the open water beside the word, sized to the gap they have
    const cw = cr.width, ih = Math.min(cr.height * 0.11, cw * 0.09);
    const gapL = wr.left - cr.left, gapR = cr.right - wr.right;
    const fit = (gap, w, h) => { const k = Math.min(1, (gap * 0.86) / w); return [w * k, h * k]; };
    if (gapL > 34) {
      const [w, h] = fit(gapL, ih * 2.2, ih * 0.55);
      wctx.fillStyle = "#00f";
      island(wctx, gapL / 2, baseline + 0.5, w, h, [{ x: 0.02, y: 0.28, s: 0.62, r: -0.08 }]);
    }
    if (gapR > 34) {
      const [w, h] = fit(gapR, ih * 3.2, ih);
      wctx.fillStyle = "#0f0";
      island(wctx, cw - gapR / 2, baseline + 0.5, w, h, [
        { x: -0.08, y: 0.28, s: 0.95, r: -0.1 },
        { x: 0.1, y: 0.3, s: 0.7, r: 0.12, flip: true },
      ]);
    }
    wctx.restore();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, wc);
    each((u) => { gl.uniform1f(u("uHz"), hz); gl.uniform2f(u("uWordRes"), wc.width, wc.height); gl.uniform1f(u("uWordHz"), baseline * dpr); });
  }


  function size() {
    const q = LEVELS[level].q;
    dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 1.5) * q;
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    W = Math.max(1, Math.round(canvas.clientWidth * dpr)); H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    gl.viewport(0, 0, W, H);
    each((u) => {
      gl.uniform2f(u("uRes"), W, H);
      gl.uniform1f(u("uF"), Math.max(W, H * 1.1) * 0.95);
      gl.uniform1f(u("uQ"), q);
    });
    fitWord();
    paintWord();
    usePlate();
    applyLook(nightNow);
  }

  // the islands are baked into the sky, so the title shrinks to fit the open water between them
  const heroEl = wordEl.closest(".hero");
  function fitWord() {
    if (!heroEl) return;
    heroEl.style.removeProperty("--kw");
    const inner = shapeFor() === "tall" ? 0.16 : 0.29;      // tan of the islands' inner edges
    const room = 2 * inner * Math.max(canvas.clientWidth, canvas.clientHeight * 1.1) * 0.95;
    const w = wordEl.getBoundingClientRect().width;
    if (w > room) heroEl.style.setProperty("--kw", `${parseFloat(getComputedStyle(wordEl).fontSize) * room / w}px`);
  }

  function draw(sec) {
    if (lost) return;
    for (let i = 0; i < 12; i++) ph[i] = (WAVES[i].off - WAVES[i].w * sec) % TAU;
    // sky above the horizon row, sea below; one row of overlap, the shaders discard the extra
    const split = Math.min(H, Math.max(0, Math.floor(H - hz - 0.5)));
    gl.useProgram(sky.p);
    gl.uniform1f(sky.time, sec);
    gl.scissor(0, split, W, H - split);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(sea.p);
    gl.uniform1f(sea.time, sec);
    gl.uniform1fv(sea.ph, ph);
    gl.scissor(0, 0, W, Math.min(H, split + 1));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // one-off gpu cost probe: a blocking 1px read waits for the frame to finish (one read per
  // frame, or a tile gpu folds the overdrawn frames into one)
  function probe() {
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
    draw(3.0); sync();                                       // warm up (driver compiles lazily)
    const t0 = performance.now();
    draw(3.0); sync(); draw(3.0); sync();
    return (performance.now() - t0) / 2;
  }

  function pick(ms) {
    // ~11ms leaves room at 60fps; at 30fps aim for ~22ms of gpu per frame
    level = ms < 11 ? 0 : ms < 22 ? 1 : ms * 0.7225 < 22 ? 2 : 3;
  }

  function degrade() {
    if (level >= LEVELS.length - 1) return;
    const q = LEVELS[level].q;
    level++;
    acc = n = bad = 0;
    if (LEVELS[level].q !== q) size();
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const iv = LEVELS[level].ms, el = now - last;
    if (el < iv * 0.75) return;
    // watch real pacing: two windows of 30 frames well over budget means the gpu can't keep up
    if (last && el < 250) {
      acc += el;
      if (++n === 30) {
        if (acc / 30 > iv * 1.5) { if (++bad >= 2) degrade(); } else bad = 0;
        acc = n = 0;
      }
    } else acc = n = 0;
    last = now;
    draw(now / 1000 * 0.55);
  }

  const run = (on) => {
    if (on && !raf && !reduced && !lost) { last = 0; raf = requestAnimationFrame(loop); }
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  };

  try { init(); } catch (e) { console.warn("sea shader:", e); return null; }
  setLook(); size();
  if (!reduced) {
    pick(probe());
    if (touch) level = Math.max(level, 1);                   // waves are slow, 30fps reads the same
    if (LEVELS[level].q !== 1) size();
  }
  draw(3.0);
  (document.fonts?.ready || Promise.resolve()).then(() => { size(); draw(3.0); });
  const resized = () => { if (!lost) { size(); draw(performance.now() / 1000 * 0.55); } };
  let rt = 0;
  // resizing clears the canvas, so always redraw in the same frame (the phone url bar resizes
  // the page while you scroll; skipping this left a stretched or blank sky)
  new ResizeObserver(resized).observe(canvas);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !lost) draw(performance.now() / 1000 * 0.55);
      run(visible);
    }, { threshold: 0 }).observe(canvas);
  }
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; run(false); });
  canvas.addEventListener("webglcontextrestored", () => {
    try { init(); } catch (e) { console.warn("sea shader:", e); return; }
    lost = false;
    setLook(); size(); draw(performance.now() / 1000 * 0.55);
    run(visible);
  });
  run(true);

  return { redraw() { if (lost) return; setLook(); size(); draw(performance.now() / 1000 * 0.55); } };
}
