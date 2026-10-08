// night sea under the crest. a small WebGL ocean: perspective wave field seen from just
// above the surface, fresnel mirror toward the horizon, and the actual FIJI wordmark
// reflected through the moving wave normals. returns null if WebGL is unavailable.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;        // sea canvas size, device px (top edge = horizon)
uniform float uTime;
uniform float uF;         // focal length, device px
uniform sampler2D uWord;  // the area above the horizon: word alpha, bottom row = horizon
uniform vec2 uWordRes;    // that area's size, device px
uniform vec3 uSkyHz, uSkyTop, uBody, uDeep, uGlint, uWordCol;

const float EYE = 1.0;

vec2 waveGrad(vec2 xz, float t, float fp) {
  vec2 g = vec2(0.0);
  float L = 9.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float ang = sin(fi * 12.9898) * 0.7;                // spread around the view axis
    vec2 dir = vec2(sin(ang), cos(ang));
    float k = 6.2831853 / L;
    float w = sqrt(9.8 * k);
    float A = L * 0.011;
    float atten = smoothstep(4.0 * fp, 14.0 * fp, L);     // drop waves smaller than a few pixels
    float ph = dot(dir, xz) * k - w * t + fi * 1.7;
    g += dir * (A * k * cos(ph) * atten);
    L *= 0.70;
  }
  return g;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);   // y = distance below horizon
  vec3 d = normalize(vec3((px.x - uRes.x * 0.5) / uF, -(px.y + 0.75) / uF, 1.0));
  float t = EYE / -d.y;
  vec3 p = d * t;
  float fp = t / uF;                                         // world size of one pixel here

  vec2 g = waveGrad(p.xz, uTime, fp);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

  vec3 r = reflect(d, n);
  r.y = max(r.y, 0.0005);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-d, n), 0.0), 5.0);

  // where the reflected ray lands in the scene above the horizon
  float up = r.y / r.z * uF;                                 // px above horizon
  float xs = uRes.x * 0.5 + r.x / r.z * uF;
  float h01 = clamp(up / uWordRes.y, 0.0, 1.0);
  vec3 sky = mix(uSkyHz, uSkyTop, pow(h01, 0.6));
  vec2 wuv = vec2(xs / uWordRes.x, 1.0 - up / uWordRes.y);
  float word = 0.0;
  if (wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0 && wuv.y < 1.0) word = texture2D(uWord, wuv).a;
  vec3 refl = mix(sky, uWordCol * 0.86, word * 0.74);

  // sea body: a touch lighter where waves face the viewer
  float depth01 = clamp(px.y / uRes.y, 0.0, 1.0);
  vec3 body = mix(uBody, uDeep, depth01) * (0.85 + 0.3 * n.z * 0.5);
  vec3 col = mix(body, refl, fres);

  // glitter from a low light behind the crest
  vec3 L = normalize(vec3(0.0, 0.035, 1.0));
  float s = pow(max(dot(r, L), 0.0), 1400.0);
  col += uGlint * s * 1.2 * (1.0 - smoothstep(0.0, 1.0, fp * 0.08));

  // distance haze into the horizon line
  float haze = exp(-t * 0.0045);
  col = mix(uSkyHz, col, haze);

  // fine dither so the gradients never band
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dn - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const LOOK = {
  dark:  { skyHz: "#22324f", skyTop: "#0c1324", body: "#132038", deep: "#080e1b", glint: "#f4e6cc", word: "#ecdcc2" },
  light: { skyHz: "#bccbdb", skyTop: "#ebe3d4", body: "#56779f", deep: "#3d5c85", glint: "#ffffff", word: "#19203a" },
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export function startSea(canvas, opts) {
  const { getTheme, reduced, hero, word: wordEl } = opts;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) return null;

  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn("sea shader:", e); return null; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const wc = document.createElement("canvas");
  const wctx = wc.getContext("2d");

  let dpr = 1, raf = 0, visible = true, last = 0;

  // draw the wordmark exactly where the DOM puts it, into the above-horizon texture
  function paintWord() {
    const hr = hero.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const aboveH = cr.top - hr.top;
    wc.width = Math.max(1, Math.round(cr.width * dpr));
    wc.height = Math.max(1, Math.round(aboveH * dpr));
    wctx.clearRect(0, 0, wc.width, wc.height);
    const cs = getComputedStyle(wordEl);
    const fs = parseFloat(cs.fontSize);
    wctx.save();
    wctx.scale(dpr, dpr);
    wctx.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
    if ("letterSpacing" in wctx) wctx.letterSpacing = cs.letterSpacing;
    wctx.textBaseline = "alphabetic";
    wctx.fillStyle = "#fff";
    const wr = wordEl.getBoundingClientRect();
    // baseline sits .87em below the element's top (line-height 1, Recia metrics)
    const x = wr.left - cr.left + parseFloat(cs.textIndent || 0);
    const y = wr.top - hr.top + fs * 0.87;
    wctx.fillText(wordEl.textContent, x, y);
    wctx.restore();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, wc);
    gl.uniform2f(U("uWordRes"), wc.width, wc.height);
  }

  function setLook() {
    const l = LOOK[getTheme()] || LOOK.dark;
    gl.uniform3fv(U("uSkyHz"), hex(l.skyHz));
    gl.uniform3fv(U("uSkyTop"), hex(l.skyTop));
    gl.uniform3fv(U("uBody"), hex(l.body));
    gl.uniform3fv(U("uDeep"), hex(l.deep));
    gl.uniform3fv(U("uGlint"), hex(l.glint));
    gl.uniform3fv(U("uWordCol"), hex(l.word));
  }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U("uRes"), w, h);
    gl.uniform1f(U("uF"), Math.max(w, h * 1.8) * 0.95);
    paintWord();
  }

  function draw(sec) {
    gl.uniform1f(U("uTime"), sec);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!visible || now - last < 16) return;
    last = now;
    draw(now / 1000 * 0.55);
  }

  setLook(); size(); draw(3.0);
  (document.fonts?.ready || Promise.resolve()).then(() => { size(); draw(3.0); });
  new ResizeObserver(() => { size(); draw(performance.now() / 1000 * 0.55); }).observe(canvas);
  if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  if (!reduced) raf = requestAnimationFrame(loop);

  return { redraw() { setLook(); size(); draw(performance.now() / 1000 * 0.55); } };
}
