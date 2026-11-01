// Environment: a shared sky, sun, fog and falling particles, plus five hand-laid maps (MAPS) rebuilt on demand.
// Realistic look: natural colour, lit by a sun and a cloudy sky.
// Every map has a round fighting arena (enemies come in through its gates) inside a square tile that repeats
// forever in every direction. Only real things block you: each wall segment, house, rock, trunk and post has its own
// collider (low ones can be jumped), and water can be waded. In explore mode every prop can be cut (W.cutProp).
// After a map is built its static meshes are merged per material, so the 3x3 block of tiles round the camera stays cheap.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MATS } from './slicer.js';

const rnd = (a, b) => a + Math.random() * (b - a);
// seeded generator, so a map is laid out the same way every time (hidden charms keep their places)
function rng(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const TAU = Math.PI * 2;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ---------- themes (time of day)
// real: top = zenith, mid = horizon, bot = haze below the horizon; clouds = cover 0..1 and their colour
export const THEMES_REAL = [
  { name: 'Golden Dawn', top: 0x5b8cc8, mid: 0xf2c49a, bot: 0xb7a48c, sun: 0xffe2b0, sunDir: [-0.45, 0.14, -1], sunSize: 160, fog: 0xe3c4a4, fogD: 0.0075,
    light: 0xffd2a0, li: 2.6, hemiS: 0xb9cdea, hemiG: 0x6b5a40, hi: 0.95, lantern: 0.45, stars: 0, exposure: 1.0, clouds: 0.5, cloud: 0xffd9bc, blossom: 0xf1a9bd },
  { name: 'Moonlit Night', top: 0x0a1528, mid: 0x2e3f5e, bot: 0x1c2433, sun: 0xdfe7f6, sunDir: [0.4, 0.34, -1], sunSize: 260, fog: 0x2a3650, fogD: 0.0075,
    light: 0xb4c6ee, li: 1.7, hemiS: 0x7088bc, hemiG: 0x30364a, hi: 1.35, lantern: 1.25, stars: 1, exposure: 1.45, clouds: 0.3, cloud: 0x34405a, blossom: 0xa07888, moon: true },
  { name: 'Spring Day', top: 0x3f7fd0, mid: 0xcbe0f2, bot: 0xa8b4a0, sun: 0xfffbf0, sunDir: [0.5, 0.6, -1], sunSize: 200, fog: 0xc9d8e6, fogD: 0.0055,
    light: 0xfff4e4, li: 3.0, hemiS: 0xcfe2ff, hemiG: 0x7a6a4a, hi: 1.05, lantern: 0.15, stars: 0, exposure: 1.0, clouds: 0.6, cloud: 0xffffff, blossom: 0xf6b8c8 },
  { name: 'Blood Moon', top: 0x1e0808, mid: 0x7a2c1c, bot: 0x3a1c16, sun: 0xd0301c, sunDir: [-0.2, 0.3, -1], sunSize: 150, fog: 0x4e261a, fogD: 0.0072,
    light: 0xffa080, li: 1.9, hemiS: 0x9a5848, hemiG: 0x3a2420, hi: 1.2, lantern: 1.15, stars: 0.6, exposure: 1.4, clouds: 0.35, cloud: 0x5a2018, blossom: 0xb06070, moon: true },
];
// Explore's day: dawn, day, dusk (the dawn colours with the sun setting on the other side) and night, blended smoothly
export const DUSK = { ...THEMES_REAL[0], name: 'Dusk', sunDir: [0.5, 0.12, -1], light: 0xffb888, mid: 0xf0a878, cloud: 0xffc0a0, fog: 0xd8a888 };
// Weather (explore): extra cloud, fog, how much the light dims, and rain (snow on the snowy map)
export const WEATHER = {
  clear: { name: 'Clear', cover: 0, fogMul: 1, dim: 0, rain: 0 },
  cloudy: { name: 'Cloudy', cover: 0.4, fogMul: 1.25, dim: 0.25, rain: 0 },
  rain: { name: 'Rain', cover: 0.55, fogMul: 1.6, dim: 0.4, rain: 0.7 },
  storm: { name: 'Storm', cover: 0.7, fogMul: 1.9, dim: 0.55, rain: 1 },
  fog: { name: 'Fog', cover: 0.3, fogMul: 3.2, dim: 0.2, rain: 0 },
};
// a town on each map (tile-local centre, radius, name); the village map's town is its own square and streets
const TOWNS = {
  shrine: { x: -54, z: -60, r: 16, name: 'Kiyomizu', road: [-54, 0] },
  bamboo: { x: -46, z: -62, r: 16, name: 'Takemura', road: [0, -62] },
  village: { x: 0, z: 0, r: 20, name: 'Yamamura', built: true },
  snow: { x: 56, z: 60, r: 16, name: 'Yukimura', road: [56, 0] },
  castle: { x: -50, z: 60, r: 16, name: 'Jokamachi', road: [0, 60] },
};

// ---------- maps (metadata; the builders live inside buildWorld)
export const MAPS = [
  { id: 'shrine', name: 'Shrine Courtyard', kanji: '神社', desc: 'Walled shrine, torii gates, a bamboo forest and pagodas' },
  { id: 'bamboo', name: 'Bamboo Grove', kanji: '竹林', desc: 'A clearing deep in a bamboo forest, ponds and hidden shrines' },
  { id: 'village', name: 'Mountain Village', kanji: '山村', desc: 'Village square, rice paddies and a water mill' },
  { id: 'snow', name: 'Snowy Pass', kanji: '雪峠', desc: 'A high pass ringed by boulders, a frozen lake and pines' },
  { id: 'castle', name: 'Castle Grounds', kanji: '城', desc: 'Castle courtyard behind stone walls, a moat and the keep' },
];

function canvasTex(w, h, draw, rep = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]); t.anisotropy = 8; return t;
}
const speck = (g, w, h, n, col, a0, a1, s0, s1) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${col},${a0 + Math.random() * (a1 - a0)})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, s0 + Math.random() * (s1 - s0), 0, 7); g.fill(); } };
const blades = (g, w, h, n, hues) => { for (let i = 0; i < n; i++) { const [hh, s, l] = hues[i % hues.length]; g.fillStyle = `hsla(${hh + rnd(-8, 8)},${s}%,${l + rnd(-8, 8)}%,${rnd(0.35, 0.8)})`; g.save(); g.translate(Math.random() * w, Math.random() * h); g.rotate(rnd(-0.5, 0.5)); g.fillRect(0, 0, 1 + Math.random(), 3 + Math.random() * 6); g.restore(); } };
function paving(g, w, h, hue, sat, l0) {
  g.fillStyle = `hsl(${hue},${sat}%,${l0 - 18}%)`; g.fillRect(0, 0, w, h);
  let y = 0;
  while (y < h) {
    const rh = 40 + Math.random() * 24; let x = -Math.random() * 60;
    while (x < w) {
      const rw = 50 + Math.random() * 60;
      g.fillStyle = `hsl(${hue + rnd(-6, 6)},${sat + rnd(-4, 4)}%,${l0 + rnd(-6, 6)}%)`; g.fillRect(x + 2 + Math.random() * 2, y + 2 + Math.random() * 2, rw - 5, rh - 5);
      for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(40,35,30,${Math.random() * 0.09})`; g.fillRect(x + 3 + Math.random() * (rw - 8), y + 3 + Math.random() * (rh - 8), 2 + Math.random() * 6, 1 + Math.random() * 2); }
      x += rw;
    }
    y += rh;
  }
}
// leaves, needles and bark are painted in neutral greys: each instance's colour (green, sakura pink, maple red,
// snowy blue-green) tints them. Marks near an edge are drawn again across it, so the textures tile seamlessly.
function wrapDraw(g, w, h, x, y, m, fn) { for (const dx of [0, -w, w]) for (const dy of [0, -h, h]) if ((dx === 0 || Math.abs(x + dx - w / 2) < w / 2 + m) && (dy === 0 || Math.abs(y + dy - h / 2) < h / 2 + m)) fn(x + dx, y + dy); }
function foliage(g, w, h, n, s0, s1) {
  g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, l = 62 + Math.random() * 38, a = Math.random() * Math.PI, sz = s0 + Math.random() * (s1 - s0);
    g.fillStyle = `hsla(0,0%,${l}%,${0.55 + Math.random() * 0.4})`;
    wrapDraw(g, w, h, x, y, sz, (px, py) => { g.beginPath(); g.ellipse(px, py, sz, sz * 0.45, a, 0, 7); g.fill(); });
  }
}
function bark(g, w, h) {
  g.fillStyle = '#c9c2b8'; g.fillRect(0, 0, w, h);
  speck(g, w, h, 300, '70,62,55', 0.05, 0.18, 2, 7);
  for (let i = 0; i < 70; i++) {   // fissures running up the trunk, wobbling, darker in the cracks
    const x0 = Math.random() * w, lw = 1 + Math.random() * 3.5, wob = 2 + Math.random() * 5, ph = Math.random() * 7;
    g.strokeStyle = `rgba(35,28,22,${0.45 + Math.random() * 0.45})`; g.lineWidth = lw;
    for (const dx of [0, -w, w]) { g.beginPath(); for (let y = -8; y <= h + 8; y += 8) g.lineTo(x0 + dx + Math.sin(y / h * Math.PI * 4 + ph) * wob, y); g.stroke(); }
  }
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(255,250,240,${0.08 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2; const x0 = Math.random() * w; g.beginPath(); g.moveTo(x0, -4); g.lineTo(x0 + Math.random() * 4 - 2, h + 4); g.stroke(); }
  speck(g, w, h, 50, '120,135,90', 0.12, 0.3, 1, 4);   // lichen
}
function needles(g, w, h) {
  g.fillStyle = '#909090'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * w, y = Math.random() * h, len = 5 + Math.random() * 10, a = Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    g.strokeStyle = `hsla(0,0%,${60 + Math.random() * 40}%,${0.5 + Math.random() * 0.45})`; g.lineWidth = 1 + Math.random();
    wrapDraw(g, w, h, x, y, len, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); g.stroke(); });
  }
}
// surface painters (real colour)
const PAINT = {
  grass: (g, w, h) => { g.fillStyle = '#58733a'; g.fillRect(0, 0, w, h); speck(g, w, h, 60, '70,90,30', 0.05, 0.18, 6, 26); speck(g, w, h, 40, '120,110,60', 0.04, 0.12, 4, 18); blades(g, w, h, 1600, [[85, 40, 30], [70, 45, 38], [95, 35, 24], [55, 40, 40]]); },
  moss: (g, w, h) => { g.fillStyle = '#3e5629'; g.fillRect(0, 0, w, h); speck(g, w, h, 80, '30,45,20', 0.08, 0.25, 4, 20); speck(g, w, h, 60, '110,120,60', 0.05, 0.15, 3, 12); blades(g, w, h, 900, [[90, 35, 24], [75, 40, 30]]); },
  dirt: (g, w, h) => { g.fillStyle = '#8b7356'; g.fillRect(0, 0, w, h); speck(g, w, h, 70, '90,70,48', 0.08, 0.2, 6, 24); speck(g, w, h, 500, '60,50,40', 0.15, 0.4, 0.6, 2); speck(g, w, h, 200, '190,170,140', 0.15, 0.4, 0.6, 1.8); },
  snow: (g, w, h) => { g.fillStyle = '#e9eef3'; g.fillRect(0, 0, w, h); speck(g, w, h, 60, '170,190,215', 0.05, 0.14, 8, 34); speck(g, w, h, 400, '255,255,255', 0.3, 0.8, 0.5, 1.5); },
  packed: (g, w, h) => { g.fillStyle = '#d3dbe2'; g.fillRect(0, 0, w, h); speck(g, w, h, 70, '150,165,185', 0.06, 0.16, 6, 26); speck(g, w, h, 300, '120,120,125', 0.1, 0.3, 0.5, 1.4); },
  stone: (g, w, h) => paving(g, w, h, 38, 12, 62),
  dark: (g, w, h) => paving(g, w, h, 30, 6, 46),
  gravel: (g, w, h) => { g.fillStyle = '#bdb6a6'; g.fillRect(0, 0, w, h); speck(g, w, h, 1400, '120,112,100', 0.2, 0.5, 0.5, 1.6); speck(g, w, h, 600, '235,230,220', 0.3, 0.6, 0.5, 1.4); g.strokeStyle = 'rgba(90,82,70,.28)'; g.lineWidth = 2; for (let y = 4; y < h; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } },
  ice: (g, w, h) => { g.fillStyle = '#b7d2e2'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 26; i++) { g.lineWidth = rnd(0.5, 1.5); g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rnd(-40, 40); y += rnd(-40, 40); g.lineTo(x, y); } g.stroke(); } speck(g, w, h, 40, '255,255,255', 0.05, 0.2, 10, 30); },
  plaster: (g, w, h) => { g.fillStyle = '#ece5d8'; g.fillRect(0, 0, w, h); speck(g, w, h, 90, '160,150,130', 0.03, 0.08, 4, 22); },
  wood: (g, w, h) => { g.fillStyle = '#6b4a2f'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = `hsl(25,${30 + rnd(-5, 5)}%,${26 + rnd(-5, 5)}%)`; g.fillRect(0, y, w, 15); g.fillStyle = 'rgba(20,12,6,.45)'; g.fillRect(0, y + 15, w, 1); } for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(30,18,8,${rnd(0.05, 0.2)})`; g.fillRect(Math.random() * w, Math.random() * h, rnd(10, 60), 1); } },
  roof: (g, w, h) => { g.fillStyle = '#2d3036'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = `hsl(220,6%,${22 + rnd(-3, 4)}%)`; g.fillRect(x + 1, 0, 12, h); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 3, 0, 3, h); } for (let y = 0; y < h; y += 22) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y, w, 2); } },
  thatch: (g, w, h) => { g.fillStyle = '#8a7347'; g.fillRect(0, 0, w, h); blades(g, w, h, 2200, [[38, 40, 42], [42, 35, 30], [35, 30, 55]]); },
  bark: (g, w, h) => bark(g, w, h),
  leaves: (g, w, h) => foliage(g, w, h, 2200, 2.5, 7),
  fronds: (g, w, h) => foliage(g, w, h, 1600, 3, 11),   // bamboo: longer, thinner blades
  needles: (g, w, h) => needles(g, w, h),
  boulder: (g, w, h) => { g.fillStyle = '#cbc7bf'; g.fillRect(0, 0, w, h); speck(g, w, h, 900, '90,86,80', 0.05, 0.22, 1, 5); speck(g, w, h, 300, '255,252,245', 0.05, 0.18, 1, 4); speck(g, w, h, 60, '110,125,85', 0.08, 0.25, 2, 6);
    for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(50,45,40,${0.25 + Math.random() * 0.35})`; g.lineWidth = 1 + Math.random() * 1.5; let x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rnd(-22, 22); y += rnd(-22, 22); g.lineTo(x, y); } g.stroke(); } },
  rockface: (g, w, h) => { g.fillStyle = '#7d7a72'; g.fillRect(0, 0, w, h); let y = 0; while (y < h) { const rh = rnd(18, 34); let x = -rnd(0, 30); while (x < w) { const rw = rnd(26, 50); g.fillStyle = `hsl(40,${rnd(3, 9)}%,${rnd(40, 58)}%)`; g.beginPath(); g.ellipse(x + rw / 2, y + rh / 2, rw / 2 - 1.5, rh / 2 - 1.5, 0, 0, 7); g.fill(); x += rw; } y += rh; } },
};

export function buildWorld(scene, renderer, quality) {
  const hi = quality === 'high';
  const W = { lowMat: !hi, map: null, arenaR: 23.2, wallR: 24.5, bodyR: 23.8, exploreR: 80, tile: 160, camR: 28, leapH: 3.3, explore: false,
    colliders: [], gates: [], rings: [], water: [], charms: [], dummies: [], mm: [], particles: 'petals' };

  // ---------- sky: a cloudy daylight sky with a sun or moon
  const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() },
    sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunSize: { value: 900 }, moon: { value: 0 },
    cover: { value: 0.5 }, cloudCol: { value: new THREE.Color() }, time: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top, mid, bot, sunCol, sunDir, cloudCol; uniform float sunSize, moon, cover, time; varying vec3 vD;
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = 0.5, s = 0.; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){ vec3 d = normalize(vD); float h = d.y; vec3 sd = normalize(sunDir); float s = dot(d, sd);
        vec3 c;
          c = h > 0. ? mix(mid, top, pow(clamp(h, 0., 1.), 0.5)) : mix(mid, bot, clamp(-h * 4., 0., 1.));
          c += sunCol * (pow(max(s, 0.), 6.) * 0.22 + pow(max(s, 0.), 60.) * 0.35) * (1. - 0.7 * moon);   // glow round the sun
          float r = 1.0 - 1.0 / sunSize, disc = smoothstep(r - 0.0006, r + 0.0006, s);
          float cl = 0.;
          if (h > 0.) {   // clouds on a dome: denser and flatter towards the horizon
            vec3 q = vec3(d.xz / (h + 0.18) * 1.3, 0.) + vec3(time * 0.012, time * 0.004, 0.);
            float n = fbm(q * 1.4);
            cl = smoothstep(0.62 - cover * 0.32, 0.86, n) * smoothstep(0.0, 0.12, h);
            vec3 cc = cloudCol * (0.78 + 0.32 * fbm(q * 3.1 + 4.));
            cc += sunCol * pow(max(s, 0.), 10.) * 0.35 * (1. - moon);   // silver lining towards the sun
            c = mix(c, cc, cl * 0.88);
          }
          c = mix(c, sunCol * (moon > 0.5 ? 1.0 : 1.6), disc * (1. - cl * 0.85));
          c = mix(c, mid, exp(-abs(h) * 14.) * 0.35);      // haze on the horizon
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  W.sky = sky;

  const sp = []; for (let i = 0; i < 1200; i++) { const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.9 + 0.05; v.normalize().multiplyScalar(450); sp.push(v.x, v.y, v.z); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; scene.add(stars);

  // ---------- lights (the sun's shadow box follows the camera, so explored corners get shadows too)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  const sm = hi ? 2048 : 1024;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  W.sun = sun;
  const sunOff = new THREE.Vector3(0, 60, 0);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6); scene.add(fill, fill.target);   // opposite-side fill so backlit enemies stay readable
  const centreLight = new THREE.PointLight(0xffa050, 0, 34, 1.4); centreLight.position.set(0, 6, 0); scene.add(centreLight);
  scene.fog = new THREE.FogExp2(0x000000, 0.012);

  // ---------- ground plane (texture per map)
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // ---------- particles near the camera: petals, leaves or snow, per map
  const PN = hi ? 420 : 220;
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xf6b2c6, side: THREE.DoubleSide, roughness: 0.7, emissive: 0x401020, emissiveIntensity: 0.4 });
  const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.05), petalMat, PN);
  petals.frustumCulled = false;
  const pd = [];
  for (let i = 0; i < PN; i++) pd.push({ x: rnd(-18, 18), y: rnd(0, 9), z: rnd(-18, 18), s: rnd(0.6, 1.4), ph: rnd(0, 6.28), sp: rnd(0.6, 1.3) });
  scene.add(petals);

  // ---------- environment map for metals and water, built from the sky only
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const envSky = new THREE.Mesh(sky.geometry, sky.material); envScene.add(envSky);
  const hemiEnv = new THREE.Mesh(new THREE.SphereGeometry(100, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.BackSide }));
  envScene.add(hemiEnv);
  let envRT = null;

  // ---------- shared, style-aware materials (rebuilt with the map)
  W.glowMat = new THREE.MeshBasicMaterial({ color: 0xffb35a, toneMapped: false });
  const _c = new THREE.Color();
  let made = [];   // materials and textures of the current map, disposed on rebuild
  const keepMat = m => (made.push(m), m);
  // identical materials are shared (per map build), so the static merge can fold every house's timber, every
  // torii's lacquer etc. into one mesh instead of one draw call each; `fresh` opts out for one that gets tweaked
  const mat = (hex, o = {}) => {
    if (o.fresh) return newMat(hex, o);
    const k = 'm|' + hex + '|' + o.r + '|' + o.m + '|' + o.flat + '|' + o.side + '|' + !!o.vc + '|' + !!o.keep + '|' + (o.map ? o.map.uuid : '');
    return matCache[k] || (matCache[k] = newMat(hex, o));
  };
  // W.lowMat (LOW quality): plain Lambert shading for the scenery, far cheaper per pixel than the physically based
  // material on integrated graphics; roughness and metalness are dropped
  const newMat = (hex, o) => keepMat(W.lowMat
    ? new THREE.MeshLambertMaterial({ color: hex, flatShading: o.flat ?? false, side: o.side ?? THREE.FrontSide, vertexColors: !!o.vc, map: o.map || null })
    : new THREE.MeshStandardMaterial({ color: hex, roughness: o.r ?? 0.85, metalness: o.m ?? 0, flatShading: o.flat ?? false, side: o.side ?? THREE.FrontSide, vertexColors: !!o.vc, map: o.map || null }));
  const texCache = {};
  function tex(kind, rep = [1, 1]) {
    const k = kind + rep.join('x');
    if (!texCache[k]) { texCache[k] = canvasTex(256, 256, (g, w, h) => { PAINT[kind](g, w, h); }, rep); made.push(texCache[k]); }
    return texCache[k];
  }
  let matCache = {};
  const texMat = (kind, rep, o = {}) => { const k = kind + rep.join('x') + JSON.stringify(o); return matCache[k] || (matCache[k] = mat(0xffffff, { ...o, map: tex(kind, rep) })); };
  // rippling water: a scrolling normal map over a dark, glossy surface that reflects the sky
  let waterNorm = null;
  function waterMat() {
    if (!waterNorm) {
      waterNorm = canvasTex(128, 128, (g, w, h) => {
        const hgt = []; for (let i = 0; i < w * h; i++) hgt.push(0);
        for (let k = 0; k < 40; k++) { const cx = Math.random() * w, cy = Math.random() * h, r = rnd(6, 26), a = rnd(0.2, 1); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let dx = Math.abs(x - cx), dy = Math.abs(y - cy); dx = Math.min(dx, w - dx); dy = Math.min(dy, h - dy); hgt[y * w + x] += a * Math.cos(Math.min(Math.PI, Math.hypot(dx, dy) / r * Math.PI)) * 0.5 + a * 0.5 * (Math.hypot(dx, dy) < r ? 1 : 0); } }
        const d = g.createImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const gx = hgt[y * w + (x + 1) % w] - hgt[y * w + (x - 1 + w) % w], gy = hgt[((y + 1) % h) * w + x] - hgt[((y - 1 + h) % h) * w + x];
          const n = new THREE.Vector3(-gx * 0.5, -gy * 0.5, 1).normalize(), i = (y * w + x) * 4;
          d.data[i] = (n.x * 0.5 + 0.5) * 255; d.data[i + 1] = (n.y * 0.5 + 0.5) * 255; d.data[i + 2] = (n.z * 0.5 + 0.5) * 255; d.data[i + 3] = 255;
        }
        g.putImageData(d, 0, 0);
      }, [6, 6]);
      waterNorm.colorSpace = THREE.NoColorSpace;
    }
    const m = keepMat(new THREE.MeshStandardMaterial({ color: 0x2b4a55, roughness: 0.08, metalness: 0.35, normalMap: waterNorm, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.9 }));
    return m;
  }

  // ---------- map building helpers (G = current map group, R = its seeded random)
  let G = null, CG = null, MG = null, R = Math.random, tiles = [];
  const r = (a, b) => a + R() * (b - a);
  let grid = new Map(), boxes = [];
  const CELL = 4;
  const cellKey = (i, j) => i * 4096 + j;
  function gridAdd(o, rad) {
    for (let i = Math.floor((o.x - rad) / CELL); i <= Math.floor((o.x + rad) / CELL); i++)
      for (let j = Math.floor((o.z - rad) / CELL); j <= Math.floor((o.z + rad) / CELL); j++) { const k = cellKey(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o); }
  }
  // Props: every tree, stalk, rock, lantern, house, wall segment... remembers its instanced parts, its slice of the
  // merged tile meshes and its colliders, so the whole thing can be lifted out and cut (cap = colour of the cut face)
  let props = [], curProp = null;
  let inTown = false;   // props built while true belong to a town: the blade glances off them (as it does off every house)
  const beginProp = cap => (curProp = { cap, inst: [], ranges: [], col: [], box: new THREE.Box3(), cut: false, town: inTown }, props.push(curProp), curProp);
  const endProp = () => { curProp = null; };
  const add = (geo, m, x, y, z, shadow = true, parent = G) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o; };
  const grp = (x, z, ry = 0, s = 1) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(s); if (curProp) g.userData.prop = curProp; G.add(g); return g; };
  // solid circle: blocks the player everywhere, and enemies too when it's in or near the arena; anything jumping
  // higher than h clears it
  function solid(x, z, rad, dot = true, h = 99) {
    const o = { x, z, r: rad, h }; gridAdd(o, rad); if (curProp) curProp.col.push(o);
    if (Math.hypot(x, z) < W.wallR + 4) W.colliders.push(o);
    if (dot && rad >= 0.45) W.mm.push({ k: 'c', x, z, r: rad, col: '#4a4038' });
  }
  // solid oriented box (houses, halls)
  function solidBox(x, z, hw, hd, rot, col = '#6b5a48', h = 99, mm = true) {
    const o = { x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), box: true, h }; gridAdd(o, Math.hypot(hw, hd)); boxes.push(o); if (curProp) curProp.col.push(o);
    if (mm) W.mm.push({ k: 'r', x, z, hw, hd, rot, col });
  }
  // a ring outline on the minimap (walls, fences); what blocks is each segment's own collider
  function ring(rad, w, gaps, gapHalf, col = '#5a5048') { W.mm.push({ k: 'ring', r: rad, w, gaps, gh: Math.asin(Math.min(0.99, gapHalf / rad)), col }); }
  const inGap = (a, gaps, gh) => gaps.some(g => Math.abs(angDiff(a, g)) < gh);
  // enemy entrances: they gather outside at (ox, oz) and walk in through the gap to (ix, iz)
  function gate(a) {
    const dx = Math.sin(a), dz = -Math.cos(a);
    W.gates.push({ a, dx, dz, tx: -dz, tz: dx, ox: dx * (W.wallR + 9), oz: dz * (W.wallR + 9), ix: dx * (W.wallR - 3.5), iz: dz * (W.wallR - 3.5) });
  }
  const polar = (a, d) => [Math.sin(a) * d, -Math.cos(a) * d];
  // keep-out zones for scattered scenery (paths, buildings, clearings)
  let clear = [];
  const isClear = (x, z, pad = 0) => !clear.some(c => c.seg ? segDist(x, z, c) < c.w + pad : Math.hypot(x - c.x, z - c.z) < c.r + pad);
  const segDist = (x, z, s) => { const vx = s.x1 - s.x0, vz = s.z1 - s.z0, l2 = vx * vx + vz * vz, t = Math.max(0, Math.min(1, ((x - s.x0) * vx + (z - s.z0) * vz) / l2)); return Math.hypot(x - s.x0 - vx * t, z - s.z0 - vz * t); };
  const keepOut = (x, z, rad) => clear.push({ x, z, r: rad });
  function path(x0, z0, x1, z1, w, kind = 'stone', mmCol = '#a89a84') {
    clear.push({ seg: true, x0, z0, x1, z1, w: w / 2 + 1.2 });
    const L = Math.hypot(x1 - x0, z1 - z0), m = texMat(kind, [Math.max(1, w / 4), L / 4], { r: 0.95 });
    m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, L), m);
    p.rotation.set(-Math.PI / 2, 0, Math.atan2(-(x1 - x0), -(z1 - z0))); p.position.set((x0 + x1) / 2, 0.015, (z0 + z1) / 2); p.receiveShadow = true; G.add(p);
    W.mm.push({ k: 'seg', x0, z0, x1, z1, w, col: mmCol });
  }
  function floorDisc(rad, kind, rep) {
    const m = texMat(kind, [rep, rep], { r: 0.92 }); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2;
    const f = new THREE.Mesh(new THREE.CircleGeometry(rad, 72), m); f.rotation.x = -Math.PI / 2; f.position.y = 0.02; f.receiveShadow = true; G.add(f);
  }
  function waterDisc(x, z, rad, solidToo = true) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(rad, 48), waterMat()); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); m.receiveShadow = true; G.add(m);
    const bank = new THREE.Mesh(new THREE.RingGeometry(rad, rad + 0.9, 48), texMat('rockface', [6, 1])); bank.rotation.x = -Math.PI / 2; bank.position.set(x, 0.05, z); bank.receiveShadow = true; G.add(bank);
    keepOut(x, z, rad + 2);
    W.water.push({ x, z, r: rad });
    W.mm.push({ k: 'c', x, z, r: rad, col: '#4f7f95' });
  }
  function waterRect(x, z, w, d, rot = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), waterMat()); m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, 0.035, z); m.receiveShadow = true; G.add(m);
    W.mm.push({ k: 'r', x, z, hw: w / 2, hd: d / 2, rot: -rot, col: '#5d8f8a' }); W.water.push({ x, z, hw: w / 2, hd: d / 2 });
  }

  // instanced batches, flushed at the end of each map build
  const batches = {};
  const _dm = new THREE.Object3D();
  function inst(name, ...v) {   // x, y, z, rx, ry, rz, sx, sy, sz, colour
    const L = batches[name] = batches[name] || []; if (curProp) curProp.inst.push({ name, i: L.length }); L.push(v);
  }
  function flush(name, geo, m, shadow = true) {
    const L = batches[name]; if (!L || !L.length) return;
    const im = new THREE.InstancedMesh(geo, m, L.length);
    L.forEach((v, i) => { _dm.position.set(v[0], v[1], v[2]); _dm.rotation.set(v[3], v[4], v[5]); _dm.scale.set(v[6], v[7], v[8]); _dm.updateMatrix(); im.setMatrixAt(i, _dm.matrix); if (v[9] !== undefined) im.setColorAt(i, _c.set(v[9])); });
    im.name = name; im.castShadow = shadow; im.receiveShadow = true; G.add(im); delete batches[name];
    made.push(geo);
  }

  // ---------- props
  const red = () => mat(0xb5281c, { r: 0.55, keep: true }), black = () => mat(0x1a1714, { r: 0.6 });
  function torii(parent) {
    const rm = red(), bm = black();
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.27, 0.32, 6.2, 14), rm, sx * 3.6, 3.1, 0, true, parent);
      add(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 14), bm, sx * 3.6, 0.25, 0, true, parent);
    }
    add(new THREE.BoxGeometry(8.6, 0.32, 0.34), rm, 0, 4.9, 0, true, parent);
    add(new THREE.BoxGeometry(0.3, 0.9, 0.25), rm, 0, 5.45, 0, true, parent);
    add(new THREE.BoxGeometry(10.4, 0.42, 0.66), bm, 0, 6.15, 0, true, parent);
    add(new THREE.BoxGeometry(10.0, 0.3, 0.55), rm, 0, 5.85, 0, true, parent);
    for (const sx of [-1, 1]) { const e = add(new THREE.BoxGeometry(1.2, 0.42, 0.66), bm, sx * 5.5, 6.32, 0, true, parent); e.rotation.z = sx * 0.28; }
  }
  function toriiAt(x, z, ry, s = 1, block = true) {
    beginProp('wood'); const g = grp(x, z, ry, s); torii(g);
    if (block) for (const sx of [-1, 1]) solid(x + Math.cos(ry) * 3.6 * s * sx, z - Math.sin(ry) * 3.6 * s * sx, 0.45 * s, false);
    endProp();
  }
  let stoneMat = null;
  function lantern(x, z, s = 1, collide = false) {
    stoneMat = stoneMat || mat(0x8a857c, { r: 0.95, flat: true });
    beginProp('stone'); const g = grp(x, z, 0, s);
    add(new THREE.CylinderGeometry(0.42, 0.5, 0.25, 6), stoneMat, 0, 0.12, 0, true, g);
    add(new THREE.CylinderGeometry(0.13, 0.17, 1.0, 6), stoneMat, 0, 0.75, 0, true, g);
    add(new THREE.CylinderGeometry(0.36, 0.3, 0.16, 6), stoneMat, 0, 1.32, 0, true, g);
    add(new THREE.BoxGeometry(0.42, 0.38, 0.42), stoneMat, 0, 1.58, 0, true, g);
    add(new THREE.BoxGeometry(0.44, 0.22, 0.3), W.glowMat, 0, 1.6, 0, false, g);
    add(new THREE.BoxGeometry(0.3, 0.22, 0.44), W.glowMat, 0, 1.6, 0, false, g);
    add(new THREE.ConeGeometry(0.62, 0.42, 6), stoneMat, 0, 1.98, 0, true, g);
    add(new THREE.SphereGeometry(0.09, 6, 4), stoneMat, 0, 2.24, 0, true, g);
    solid(x, z, 0.5 * s, collide, 2.25 * s); endProp();
  }
  // bamboo: instanced stalks with node bands and leaf clusters
  function bamboo(x, z, collide = true) {
    const h = r(7, 14); beginProp('plant');
    inst('stalk', x, 0, z, r(-0.06, 0.06), r(0, 6), r(-0.06, 0.06), r(0.8, 1.25), h, r(0.8, 1.25), new THREE.Color().setHSL(r(0.17, 0.24), r(0.3, 0.5), r(0.3, 0.45)).getHex());
    for (let k = 0; k < 3; k++) inst('bleaf', x + r(-0.9, 0.9), h * r(0.62, 1), z + r(-0.9, 0.9), r(0, 3), r(0, 3), r(0, 3), r(0.9, 1.6), r(0.35, 0.6), r(0.9, 1.6), new THREE.Color().setHSL(r(0.2, 0.28), r(0.35, 0.55), r(0.22, 0.34)).getHex());
    if (collide) solid(x, z, 0.16, false);
    endProp();
  }
  // a canopy clump: a sphere pushed in and out by smooth noise (so clumps read as leafy masses, not facets),
  // shaded smooth, with uvs wrapped round it for the leaf texture and darker underneath where light can't reach
  function canopyGeo(detail, bump) {
    let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.attributes.position, uv = [], col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + bump * (Math.sin(x * 3.1 + 1.3) * Math.sin(y * 2.7 + 0.4) * Math.sin(z * 3.3 + 2.1) + 0.5 * Math.sin(x * 6.3 + y * 5.1 - z * 4.7));
      p.setXYZ(i, x * n, y * n * 0.92, z * n);
      uv.push(Math.atan2(z, x) / (Math.PI * 2) + 0.5, y * 0.5 + 0.5);
      const ao = 0.68 + 0.32 * Math.max(0, Math.min(1, (y + 0.9) / 1.6)); col.push(ao, ao, ao);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }
  function flushBamboo() {
    const sg = new THREE.CylinderGeometry(0.075, 0.09, 1, 5, 9, false).translate(0, 0.5, 0);
    const p = sg.attributes.position, colA = [];
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), f = (y * 9) % 1, band = f < 0.02 || f > 0.98, v = band ? 0.6 : 0.88 + y * 0.12; colA.push(v, v, v); }
    sg.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
    flush('stalk', sg, mat(0xffffff, { r: 0.55, vc: true, flat: false }), false);
    flush('bleaf', canopyGeo(1, 0.18), texMat('fronds', [2, 1], { r: 0.9, vc: true, flat: false }), false);
  }
  // conifer: trunk + three stacked cones (snowy: lighter tips)
  function pine(x, z, s = 1, collide = true, snowy = false) {
    beginProp('wood'); inst('ptrunk', x, 0, z, 0, 0, 0, s, s, s, 0x7a6250);
    for (let k = 0; k < 3; k++) inst('pcone', x, s * (2.2 + k * 1.6), z, 0, r(0, 6), 0, s * (2.3 - k * 0.55), s * 2.6, s * (2.3 - k * 0.55), snowy && k < 2 ? 0x8fa6a0 : new THREE.Color().setHSL(r(0.3, 0.36), r(0.3, 0.45), r(0.15, 0.24)).getHex());
    solid(x, z, 0.4 * s, false); endProp();
  }
  function flushPines(snowy) {
    flush('ptrunk', new THREE.CylinderGeometry(0.16, 0.26, 2.6, 8).translate(0, 1.3, 0), texMat('bark', [2, 1], { r: 0.95, flat: false }));
    const cg = new THREE.ConeGeometry(1, 1, 14, 3), cp = cg.attributes.position, ccol = [];
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), a = Math.atan2(z, x);
      if (y < -0.49) { const j = 1 + 0.12 * Math.sin(a * 7) + 0.06 * Math.sin(a * 13 + 1); cp.setXYZ(i, x * j, y - 0.1 * (0.5 + 0.5 * Math.sin(a * 9)), z * j); }   // ragged, drooping hem
      const ao = 0.68 + 0.32 * (y + 0.5); ccol.push(ao, ao, ao);
    }
    cg.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3)); cg.computeVertexNormals();
    flush('pcone', cg, texMat('needles', [4, 1], { r: 0.9, vc: true, flat: false }));
  }
  // broadleaf tree (maple / sakura-like when pink)
  function tree(x, z, s = 1, leaf = null, collide = true) {
    beginProp('wood'); inst('ttrunk', x, 0, z, r(-0.05, 0.05), r(0, 6), r(-0.05, 0.05), s, s, s, 0x7d6553);
    const lc = leaf ?? new THREE.Color().setHSL(r(0.22, 0.3), r(0.35, 0.5), r(0.22, 0.32)).getHex();
    for (let k = 0; k < 4; k++) inst('tleaf', x + r(-1.2, 1.2) * s, s * r(3.4, 4.6), z + r(-1.2, 1.2) * s, r(0, 3), r(0, 3), r(0, 3), s * r(1.1, 1.6), s * r(0.8, 1.1), s * r(1.1, 1.6), lc);
    solid(x, z, 0.35 * s, false); endProp();
  }
  function flushTrees() {
    flush('ttrunk', new THREE.CylinderGeometry(0.16, 0.3, 3.6, 8, 2).translate(0, 1.8, 0), texMat('bark', [2, 2], { r: 0.95, flat: false }));
    flush('tleaf', canopyGeo(1, 0.16), texMat('leaves', [3, 2], { r: 0.85, vc: true, flat: false }));
  }
  // boulders: a lumpy icosahedron (snowy maps put snow on top through vertex colours)
  function rock(x, z, s, collide = true, sq = 0.7) {
    beginProp('stone'); inst('rock', x, s * 0.25, z, r(0, 3), r(0, 6), r(0, 0.3), s * r(0.9, 1.2), s * sq * r(0.8, 1.1), s * r(0.9, 1.2), new THREE.Color().setHSL(r(0.08, 0.12), r(0.04, 0.1), r(0.55, 0.7)).getHex());   // lighter: the stone texture darkens it
    if (collide) solid(x, z, s * 0.9, true, s * (0.25 + sq));   // low boulders can be jumped
    endProp();
  }
  function flushRocks(snowy) {
    // a weathered boulder: corners shared, shape pushed in and out by smooth noise (no cracks between faces),
    // a planed-off underside, uvs for the stone texture, snow on the upward faces on snowy maps
    let g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
    const p = g.attributes.position, uv = [], col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.16 * Math.sin(x * 2.3 + 0.7) * Math.sin(y * 2.9 + 1.9) * Math.sin(z * 2.1 + 0.3) + 0.07 * Math.sin(x * 6.7 - y * 5.3 + z * 7.1) + 0.03 * Math.sin(x * 13.1 + y * 11.7 - z * 12.3);
      p.setXYZ(i, x * n, Math.max(-0.55, y * n), z * n);
      uv.push(Math.atan2(z, x) / (Math.PI * 2) + 0.5, y * 0.5 + 0.5);
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    for (let i = 0; i < p.count; i++) { const ny = g.attributes.normal.getY(i), w = snowy ? Math.max(0, Math.min(1, (ny - 0.35) / 0.25)) : 0, ao = 0.75 + 0.25 * Math.max(0, ny); col.push(ao + w * 2, ao + w * 2, ao + w * 2.2); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    flush('rock', g, texMat('boulder', [2, 1], { r: 0.95, vc: true, flat: false }));
  }
  // timber house with a tiled (or thatched) gable roof; the door side faces +z of its own frame
  function house(x, z, ry, w = 7, d = 5.5, h = 3.2, o = {}) {
    beginProp('wood').town = true; const g = grp(x, z, ry);
    const wall = o.wall || (o.wood ? texMat('wood', [Math.round(w / 1.5) / 2, Math.round(h / 1.5) / 2]) : texMat('plaster', [1, 1])), timber = mat(0x3c2a1c, { r: 0.8 });
    add(new THREE.BoxGeometry(w, h, d), wall, 0, h / 2, 0, true, g);
    add(new THREE.BoxGeometry(w + 0.1, 0.22, d + 0.1), timber, 0, h * 0.45, 0, true, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.22, h, 0.22), timber, sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05), true, g);
    add(new THREE.BoxGeometry(1.3, 2.1, 0.12), mat(0x2a1d14, { r: 0.8 }), 0, 1.05, d / 2 + 0.02, false, g);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(1.0, 0.7, 0.08), W.glowMat, sx * w * 0.28, h * 0.66, d / 2 + 0.03, false, g);
    const rh = o.thatch ? h * 0.7 : h * 0.45, rs = new THREE.Shape();
    rs.moveTo(-(d / 2 + 0.7), 0); rs.lineTo(d / 2 + 0.7, 0); rs.lineTo(0, rh); rs.closePath();
    const rg = new THREE.ExtrudeGeometry(rs, { depth: w + 0.9, bevelEnabled: false }).translate(0, 0, -(w + 0.9) / 2);
    const roofM = o.thatch ? texMat('thatch', [2, 2]) : texMat('roof', [2, 1]);
    const rm = add(rg, roofM, 0, h, 0, true, g); rm.rotation.y = Math.PI / 2;
    solidBox(x, z, w / 2 + 0.2, d / 2 + 0.2, ry); endProp();
    return g;
  }
  function pagoda(x, z, s) {
    beginProp('wood'); const g = grp(x, z, 0, s);
    const wall = mat(0x8b2f22, { r: 0.75, keep: true }), roofM = mat(0x2a2c31, { r: 0.65, side: THREE.DoubleSide }), gold = mat(0xb08d4a, { r: 0.45, m: 0.5 });
    add(new THREE.BoxGeometry(7, 1.2, 7), texMat('stone', [2, 1]), 0, 0.6, 0, true, g);
    let y = 1.2;
    for (let i = 0; i < 5; i++) {
      const w = 4.2 - i * 0.55;
      add(new THREE.BoxGeometry(w, 1.6, w), wall, 0, y + 0.8, 0, true, g);
      add(new THREE.CylinderGeometry(w * 0.25, w * 1.05, 0.9, 4, 1, true), roofM, 0, y + 1.9, 0, true, g).rotation.y = Math.PI / 4;
      y += 2.1;
    }
    add(new THREE.CylinderGeometry(0.06, 0.12, 3.2, 6), gold, 0, y + 1.2, 0, true, g);
    solidBox(x, z, 3.5 * s, 3.5 * s, 0); endProp();
  }
  function hall(x, z, ry, s = 1) {
    beginProp('wood'); const g = grp(x, z, ry, s);
    add(new THREE.BoxGeometry(14, 1.2, 9), texMat('stone', [3, 2]), 0, 0.6, 0, true, g);
    add(new THREE.BoxGeometry(11, 4.2, 7), texMat('wood', [4, 2]), 0, 3.3, 0, true, g);
    for (let i = -2; i <= 2; i++) add(new THREE.CylinderGeometry(0.22, 0.22, 4.2, 10), red(), i * 2.6, 3.3, 3.6, true, g);
    const rf = add(new THREE.CylinderGeometry(3, 9.6, 3, 4), texMat('roof', [4, 1]), 0, 6.9, 0, true, g); rf.rotation.y = Math.PI / 4; rf.scale.z = 0.7;
    add(new THREE.BoxGeometry(3, 3, 0.2), W.glowMat, 0, 2.8, 3.55, false, g);
    solidBox(x, z, 7 * s, 4.6 * s, ry); endProp();
  }
  function hokora(x, z, ry, s = 1) {   // tiny wayside shrine
    beginProp('wood'); const g = grp(x, z, ry, s);
    add(new THREE.BoxGeometry(1.4, 0.5, 1.2), texMat('stone', [1, 1]), 0, 0.25, 0, true, g);
    add(new THREE.BoxGeometry(1, 1.0, 0.8), texMat('wood', [1, 1]), 0, 1.0, 0, true, g);
    const rf = add(new THREE.CylinderGeometry(0.2, 1.05, 0.6, 4), mat(0x2c2e33, { r: 0.6 }), 0, 1.8, 0, true, g); rf.rotation.y = Math.PI / 4;
    add(new THREE.BoxGeometry(0.5, 0.4, 0.05), W.glowMat, 0, 1.0, 0.42, false, g);
    solidBox(x, z, 0.7 * s, 0.6 * s, ry, '#6b5a48', 1.9 * s); endProp();
  }
  // ring of instanced wall segments with openings at the gates
  // A town: a beaten-earth square with a well, two market stalls and a bounty board, ringed by houses facing it
  // (gaps for two streets), lanterns round the square and a road out to the nearest path. Everything can be cut.
  function town(T, snowy) {
    inTown = true;
    const tr = rng(T.x * 31 + T.z * 17 + 5), q = (a, b) => a + tr() * (b - a), { x: cx, z: cz } = T;
    if (T.road) path(cx, cz, T.road[0], T.road[1], 5, snowy ? 'packed' : 'dirt', '#8b7356');
    keepOut(cx, cz, T.r + 4);
    { const m = texMat(snowy ? 'packed' : 'dirt', [5, 5], { r: 0.95 }); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2;
      const f = new THREE.Mesh(new THREE.CircleGeometry(10, 48), m); f.rotation.x = -Math.PI / 2; f.position.set(cx, 0.018, cz); f.receiveShadow = true; G.add(f);
      W.mm.push({ k: 'c', x: cx, z: cz, r: 10, col: '#a08b6a' }); }
    const streets = [Math.atan2(T.road ? T.road[0] - cx : 1, T.road ? -(T.road[1] - cz) : 0)]; streets.push(streets[0] + Math.PI);
    for (let i = 0; i < 9; i++) {
      const a = (i + 0.5) / 9 * TAU; if (streets.some(s => Math.abs(angDiff(a, s)) < 0.42)) continue;
      const [x, z] = polar(a, 14.5); house(cx + x, cz + z, -a, q(5.5, 7), q(4.5, 5.5), q(2.9, 3.6), { thatch: tr() < 0.4, wood: tr() < 0.5 });
    }
    // the well
    beginProp('stone'); { const g = grp(cx, cz);
      add(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 14), texMat('stone', [2, 1]), 0, 0.45, 0, true, g);
      add(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 14), mat(0x1c2a30, { r: 0.2 }), 0, 0.82, 0, false, g);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.14, 2.2, 0.14), mat(0x4a3424, { r: 0.8 }), sx * 1.0, 1.1, 0, true, g);
      const rf = add(new THREE.ConeGeometry(1.7, 0.8, 4), texMat('roof', [1, 1]), 0, 2.5, 0, true, g); rf.rotation.y = Math.PI / 4;
      solid(cx, cz, 1.3); } endProp();
    // market stalls: a counter of goods under a dyed cloth awning
    const cloths = [0xa8322a, 0x2f5d8a, 0x7a5a2a];
    for (const [k, a] of [[0, streets[0] + Math.PI / 2], [1, streets[0] - Math.PI / 2]]) {
      const [ox, oz] = polar(a, 7), sx = cx + ox, sz = cz + oz;
      beginProp('wood'); const g = grp(sx, sz, -a);
      add(new THREE.BoxGeometry(2.6, 0.9, 1.0), texMat('wood', [2, 1]), 0, 0.45, 0, true, g);
      for (const px of [-1.25, 1.25]) for (const pz of [-0.45, 0.45]) add(new THREE.BoxGeometry(0.1, 2.3, 0.1), mat(0x3c2a1c, { r: 0.8 }), px, 1.15, pz, true, g);
      add(new THREE.BoxGeometry(3.0, 0.06, 1.6), mat(cloths[k], { r: 0.9, keep: true }), 0, 2.3, 0, true, g).rotation.x = 0.12;
      for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.32, 0.26, 0.32), mat([0xc89a4a, 0x8a3a2a, 0x6a8a3a, 0xd8c8a0, 0x4a6a8a][i], { r: 0.8 }), -1 + i * 0.5, 1.03, q(-0.2, 0.2), true, g);
      solidBox(sx, sz, 1.4, 0.6, -a, '#7a5a3a'); endProp();
      (T.stalls = T.stalls || []).push({ x: sx - Math.sin(a) * 1.2, z: sz + Math.cos(a) * 1.2 });   // where the merchant stands (the street side)
    }
    // the bounty board
    { const a = streets[0] + Math.PI, [ox, oz] = polar(a, 8.5), bx = cx + ox, bz = cz + oz;
      beginProp('wood'); const g = grp(bx, bz, -a);
      for (const px of [-0.9, 0.9]) add(new THREE.BoxGeometry(0.14, 2.4, 0.14), mat(0x3c2a1c, { r: 0.8 }), px, 1.2, 0, true, g);
      add(new THREE.BoxGeometry(2.0, 1.2, 0.08), texMat('wood', [1, 1]), 0, 1.6, 0, true, g);
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.36, 0.48, 0.02), mat(0xece2c8, { r: 0.9 }), -0.6 + i * 0.4, 1.6 + q(-0.2, 0.2), 0.05, false, g);
      add(new THREE.BoxGeometry(2.3, 0.1, 0.4), texMat('roof', [1, 1]), 0, 2.3, 0, true, g);
      solidBox(bx, bz, 1.1, 0.3, -a, '#7a5a3a'); endProp();
      T.board = { x: bx - Math.sin(a) * 1.3, z: bz + Math.cos(a) * 1.3 }; }
    for (let k = 0; k < 6; k++) { const [x, z] = polar(k / 6 * TAU + 0.26, 10.6); lantern(cx + x, cz + z, 0.9, false); }
    inTown = false;
  }
  function wallRing(rad, gaps, gapHalf, layers, h = 99, cap = 'stone') {
    const segLen = 2.0, segN = Math.ceil(TAU * rad / segLen), gh = Math.asin(Math.min(0.99, gapHalf / rad));
    const mats = [];
    for (let i = 0; i < segN; i++) {
      const a = (i + 0.5) / segN * TAU;
      if (inGap(a, gaps, gh + 0.03)) continue;
      mats.push(a);
    }
    const D = Math.max(...layers.map(L => L.d)) / 2;
    const segs = mats.map(a => { const P = beginProp(cap), [x, z] = polar(a, rad); solidBox(x, z, segLen / 2 + 0.05, D, -a, '', h, false); endProp(); return P; });
    layers.forEach((L, li) => {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(segLen + 0.1, L.h, L.d), L.m, mats.length); im.name = 'wall' + li;
      mats.forEach((a, i) => { segs[i].inst.push({ name: im.name, i }); _dm.position.set(Math.sin(a) * rad, L.y, -Math.cos(a) * rad); _dm.rotation.set(0, -a, 0); _dm.scale.set(1, 1, 1); _dm.updateMatrix(); im.setMatrixAt(i, _dm.matrix); });
      im.castShadow = im.receiveShadow = true; G.add(im); made.push(im.geometry);
    });
  }
  // Mountain ranges: three rings of ridgeline round the horizon (they ride with the camera), each a strip whose
  // height follows ridged fractal noise, so the skyline reads as real ranges rather than separate cones. The
  // colours (haze at the foot, the range's own tone higher up, snow on the tall peaks; the far rings paler) are
  // vertex colours, refreshed by setTheme from the time of day.
  function mountains(snowy, n = 11) {
    W.ranges = [];
    const N = 300, ROWS = [-0.08, 0.45, 0.8, 1];   // strip rows as fractions of the local peak height (first: below the horizon)
    const layers = [{ d: 440, h0: 70, h1: 200, far: 1 }, { d: 350, h0: 40, h1: 140, far: 0.55 }, { d: 270, h0: 18, h1: 75, far: 0.15 }];
    for (const L of layers) {
      const oct = [2, 3, 5, 8, 13, 21, 34].map(f => ({ f, ph: r(0, TAU), a: 1 / Math.pow(f, 0.85) }));
      const prof = []; let lo = 1e9, hi = -1e9;
      for (let i = 0; i < N; i++) { const t = i / N * TAU; let v = 0; for (const o of oct) v += o.a * (1 - Math.abs(Math.sin(o.f * t + o.ph))); prof.push(v); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const h1 = L.h1 * (snowy ? 1.25 : 1), snowLine = snowy ? 0.45 : 0.72;
      const pos = [], tone = [], snow = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N * TAU, u = Math.pow((prof[i % N] - lo) / (hi - lo), 1.4), top = L.h0 + (h1 - L.h0) * u;
        ROWS.forEach((f, k) => {
          pos.push(Math.sin(t) * L.d, f * top - 4, -Math.cos(t) * L.d);
          tone.push(Math.max(0, f));
          snow.push(k >= 2 && u > snowLine ? Math.min(1, (u - snowLine) / 0.15) * (k === 3 ? 1 : 0.5) : 0);
        });
        if (i < N) for (let k = 0; k < ROWS.length - 1; k++) { const a = i * ROWS.length + k, b = a + ROWS.length; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3)); geo.setIndex(idx);
      const m = add(geo, keepMat(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide })), 0, 0, 0, false, MG);
      m.renderOrder = -1;
      W.ranges.push({ geo, tone, snow, far: L.far });
    }
  }
  // colour the ranges for the current time of day
  const _rc = new THREE.Color(), _hz = new THREE.Color(), _sn = new THREE.Color(), _vc = new THREE.Color();
  function colourRanges(T) {
    for (const R of W.ranges || []) {
      _hz.set(T.fog);
      _rc.set(T.fog).lerp(new THREE.Color(0x34404c), 0.55 - 0.35 * R.far);
      _sn.set(T.mid).lerp(new THREE.Color(0xffffff), 0.65).lerp(_hz, 0.3 * R.far);
      const c = R.geo.attributes.color;
      for (let i = 0; i < c.count; i++) { _vc.copy(_hz).lerp(_rc, Math.min(1, 0.25 + R.tone[i] * 0.9)).lerp(_sn, R.snow[i]); c.setXYZ(i, _vc.r, _vc.g, _vc.b); }
      c.needsUpdate = true;
    }
  }
  // scatter: try n spots in the annulus [r0, r1], skipping paths and keep-out zones
  // scatter: try n spots over the whole square tile (outside radius r0), skipping paths and keep-out zones;
  // the tile repeats, so filling it edge to edge makes the forest seamless
  function scatter(n, r0, r1, fn, pad = 0) {
    const H = W.exploreR;
    for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
      const x = r(-H, H), z = r(-H, H), d = Math.hypot(x, z);
      if (d < r0 || !isClear(x, z, pad)) continue;
      fn(x, z, Math.atan2(x, -z), d); i++;
    }
  }
  // hidden charms (explore mode): a red omamori on a gold cord, hovering and glinting
  function charm(x, z) {
    const g = new THREE.Group(); g.position.set(x, 1.1, z); CG.add(g);
    add(new THREE.BoxGeometry(0.26, 0.36, 0.07), keepMat(new THREE.MeshStandardMaterial({ color: 0xc0281e, emissive: 0x5a0a06, emissiveIntensity: 0.6, roughness: 0.5 })), 0, 0, 0, false, g);
    add(new THREE.TorusGeometry(0.07, 0.015, 6, 12), keepMat(new THREE.MeshStandardMaterial({ color: 0xe8c15a, metalness: 0.7, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.6 })), 0, 0.24, 0, false, g);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24), keepMat(new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.45, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })));
    g.add(halo);
    g.visible = W.explore;
    W.charms.push({ x, z, g, halo });
  }
  const dummySpot = (x, z) => W.dummies.push({ x, z });

  // ---------- the maps
  const BUILD = {
    shrine() {
      Object.assign(W, { wallR: 24.5, exploreR: 80, particles: 'petals', ground: 'grass' });
      const gA = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
      gA.forEach(gate);
      floorDisc(W.wallR + 0.4, 'stone', 9);
      const inlay = mat(0x2f2a26, { r: 0.8, fresh: true }); inlay.polygonOffset = true; inlay.polygonOffsetFactor = -2; inlay.polygonOffsetUnits = -4;
      for (const [r0, r1] of [[7.6, 8.1], [15.6, 15.9]]) { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), inlay); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.receiveShadow = true; G.add(m); }
      for (const a of gA) {
        const [x, z] = polar(a, W.wallR + 0.3); toriiAt(x, z, -a);
        const [x2, z2] = polar(a, W.wallR + 16); toriiAt(x2, z2, -a);
        const [px, pz] = polar(a, W.wallR + 1), [qx, qz] = polar(a, W.exploreR);
        path(px, pz, qx, qz, 7, 'stone');
        for (const sx of [-1, 1]) for (const d of [W.wallR + 6, W.wallR + 22]) { const [lx, lz] = polar(a, d); lantern(lx - Math.cos(a) * 4.6 * sx, lz - Math.sin(a) * 4.6 * sx, 1, false); }
      }
      wallRing(W.wallR + 0.35, gA, 4.3, [{ h: 1.1, d: 0.7, y: 0.55, m: texMat('plaster', [1, 1]) }, { h: 0.2, d: 1.0, y: 1.2, m: mat(0x2e3036, { r: 0.6 }) }], 1.3);   // a double jump clears it
      ring(W.wallR + 0.35, 0.5, gA, 4.3);
      for (let k = 0; k < 4; k++) { const [x, z] = polar(Math.PI / 4 + k * Math.PI / 2, 11.5); lantern(x, z, 1.35, true); }
      // landmarks out in the forest
      hall(0, -(W.wallR + 40), 0); keepOut(0, -(W.wallR + 40), 12);
      pagoda(46, -44, 1.5); keepOut(46, -44, 9);
      pagoda(-52, 36, 1.4); keepOut(-52, 36, 9);
      waterDisc(42, 34, 7); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; rock(42 + Math.sin(a) * 8.6, 34 - Math.cos(a) * 8.6, r(0.6, 1.1), true, 0.6); }
      keepOut(-44, -40, 8); hokora(-44, -40, 0.6);
      const sak = 0xf1a9bd;
      for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4 + r(-0.12, 0.12), [x, z] = polar(a, W.wallR + r(3, 5)); tree(x, z, r(1.1, 1.35), sak); keepOut(x, z, 3); }
      scatter(hi ? 900 : 480, W.wallR + 4, W.exploreR + 12, (x, z) => bamboo(x, z), 0.4);
      flushBamboo(); flushTrees(); flushRocks(false);
      [[0, -(W.wallR + 33)], [52, -40], [-46, 42], [42, 24], [-44, -36], [-66, -8], [64, 10], [8, 70]].forEach(([x, z]) => charm(x, z));
      [[-6, -9], [7, -10], [0, -14]].forEach(([x, z]) => dummySpot(x, z));
      mountains(false);
    },
    bamboo() {
      Object.assign(W, { wallR: 26, exploreR: 80, particles: 'leaves', ground: 'moss' });
      const gA = [0, TAU / 3, 2 * TAU / 3];
      gA.forEach(gate);
      floorDisc(W.wallR + 1.5, 'moss', 10);
      // low bamboo fence round the clearing
      const fence = mat(0x9a8a5a, { r: 0.8 });
      wallRing(W.wallR + 0.4, gA, 4, [{ h: 0.12, d: 0.12, y: 0.45, m: fence }, { h: 0.12, d: 0.12, y: 0.9, m: fence }], 0.95, 'wood');   // hop the fence
      { const segN = Math.ceil(TAU * (W.wallR + 0.4) / 1.0), gh = Math.asin(4 / (W.wallR + 0.4)); for (let i = 0; i < segN; i++) { const a = i / segN * TAU; if (inGap(a, gA, gh)) continue; const [x, z] = polar(a, W.wallR + 0.4); beginProp('wood'); inst('post', x, 0, z, 0, 0, 0, 1, 1, 1, 0x8a7a4a); endProp(); } flush('post', new THREE.CylinderGeometry(0.06, 0.07, 1.2, 6).translate(0, 0.6, 0), mat(0xffffff, { r: 0.8 })); }
      ring(W.wallR + 0.4, 0.4, gA, 4);
      for (const a of gA) { const [px, pz] = polar(a, W.wallR), [qx, qz] = polar(a, W.exploreR); path(px, pz, qx, qz, 4.5, 'dirt', '#8b7356'); for (const d of [W.wallR + 8, W.wallR + 30]) { const [lx, lz] = polar(a, d); lantern(lx + Math.cos(a) * 3, lz + Math.sin(a) * 3, 0.9); } }
      // clumps of bamboo inside the clearing to fight around
      for (let k = 0; k < 4; k++) { const a = TAU / 6 + k * TAU / 4 + r(-0.2, 0.2), [cx, cz] = polar(a, r(10, 13)); for (let i = 0; i < 12; i++) bamboo(cx + r(-1.1, 1.1), cz + r(-1.1, 1.1), true); }
      rock(-14, 5, 1.5); rock(15, 4, 1.2); hokora(0, -17.5, 0, 0.9);
      // the forest outside: clearings with a pond, a hidden shrine and a stone circle
      waterDisc(-40, 40, 8); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; rock(-40 + Math.sin(a) * 9.4, 40 - Math.cos(a) * 9.4, r(0.5, 1), true, 0.6); }
      keepOut(55, 45, 9); hokora(55, 45, -2.2); toriiAt(51, 39, -2.2 + Math.PI, 0.55);
      keepOut(-55, -35, 10); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; rock(-55 + Math.sin(a) * 6, -35 - Math.cos(a) * 6, 1.1, true, 1.3); }
      keepOut(40, -50, 7); for (let i = 0; i < 5; i++) tree(40 + r(-4, 4), -50 + r(-4, 4), r(0.9, 1.2), 0xc0502a);
      scatter(hi ? 1500 : 800, W.wallR + 2.5, W.exploreR + 12, (x, z) => bamboo(x, z), 0.2);
      flushBamboo(); flushTrees(); flushRocks(false);
      [[-40, 29], [55, 41], [-55, -35], [40, -50], [-70, 5], [10, -70], [70, -10], [-20, 66]].forEach(([x, z]) => charm(x, z));
      [[-5, -8], [6, -8]].forEach(([x, z]) => dummySpot(x, z));
      mountains(false);
    },
    village() {
      Object.assign(W, { wallR: 25, exploreR: 85, particles: 'leaves', ground: 'grass', leapH: 6 });
      const gA = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
      gA.forEach(gate);
      floorDisc(W.wallR + 4, 'dirt', 10);
      // a ring of houses facing the square, with streets out at the gates
      const HR = W.wallR + 3.2, gh = Math.asin(4.2 / HR);
      for (let i = 0; i < 20; i++) {
        const a = (i + 0.5) / 20 * TAU; if (inGap(a, gA, gh + 0.12)) continue;
        const [x, z] = polar(a, HR); house(x, z, -a, r(6, 7.2), 5, r(3, 3.8), { thatch: R() < 0.35, wood: R() < 0.4 });
      }
      for (const a of gA) {
        const [px, pz] = polar(a, W.wallR), [qx, qz] = polar(a, W.exploreR); path(px, pz, qx, qz, 6, 'dirt', '#8b7356');
        for (let d = 40; d < 78; d += 11) for (const sx of [-1, 1]) { if (R() < 0.25) continue; const [x, z] = polar(a, d); house(x - Math.cos(a) * 8 * sx, z - Math.sin(a) * 8 * sx, Math.atan2(sx * Math.cos(a), sx * Math.sin(a)), r(6, 7.5), 5, r(3, 3.6), { thatch: R() < 0.5, wood: R() < 0.5 }); }
      }
      // the square: a well, a cart, barrels and crates
      { beginProp('stone'); const g = grp(-9, 8); add(new THREE.CylinderGeometry(1, 1.05, 0.9, 16, 1, true), texMat('rockface', [3, 1]), 0, 0.45, 0, true, g); add(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 16), waterMat(), 0, 0.5, 0, false, g); for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.15, 2.2, 0.15), mat(0x4a3424), sx * 0.9, 1.1, 0, true, g); add(new THREE.BoxGeometry(2.2, 0.15, 0.2), mat(0x4a3424), 0, 2.2, 0, true, g); solid(-9, 8, 1.1, true, 0.95); endProp(); }
      { beginProp('wood'); const g = grp(10, 9, 0.6); add(new THREE.BoxGeometry(1.6, 0.5, 2.8), texMat('wood', [1, 1]), 0, 0.9, 0, true, g); for (const sx of [-1, 1]) { const w = add(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 14), mat(0x3a2a1c), sx * 0.9, 0.6, 0.2, true, g); w.rotation.z = Math.PI / 2; } add(new THREE.BoxGeometry(0.1, 0.1, 2.2), mat(0x3a2a1c), 0.3, 0.7, 2.3, true, g); solidBox(10, 9.6, 1.0, 2.0, 0.6, '#6b5a48', 1.25); endProp(); }
      for (const [x, z] of [[-12, -7], [-11.2, -6.2], [-12.4, -5.9]]) { beginProp('wood'); add(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 12), texMat('wood', [1, 1]), 0, 0.45, 0, true, grp(x, z)); solid(x, z, 0.42, true, 0.95); endProp(); }
      for (const [x, z, y] of [[13, -10, 0.4], [13.9, -10.2, 0.4], [13.4, -10.1, 1.2]]) { beginProp('wood'); add(new THREE.BoxGeometry(0.8, 0.8, 0.8), texMat('wood', [1, 1]), 0, y, 0, true, grp(x, z)); if (y < 1) solid(x, z, 0.5, true, 1.65); endProp(); }
      // rice paddies between the streets, a water mill on a pond
      for (const q of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
        const [cx, cz] = polar(q, 56); if (Math.hypot(cx - 50, cz + 48) < 22) continue;   // leave room for the water mill
        for (const [ox, oz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { const x = cx + ox, z = cz + oz; waterRect(x, z, 10.5, 10.5); keepOut(x, z, 8); for (let i = 0; i < (hi ? 70 : 35); i++, endProp()) beginProp('plant'), inst('rice', x + r(-5, 5), 0, z + r(-5, 5), 0, r(0, 6), r(-0.15, 0.15), 1, r(0.8, 1.2), 1, new THREE.Color().setHSL(r(0.22, 0.27), 0.5, r(0.3, 0.4)).getHex()); }
      }
      flush('rice', new THREE.ConeGeometry(0.12, 0.7, 4).translate(0, 0.35, 0), mat(0xffffff, { r: 0.9 }), false);
      { const mx = 50, mz = -48; waterDisc(mx + 7, mz, 6); house(mx, mz, -Math.PI / 2, 6, 5, 3.6, { wood: true, thatch: true }); beginProp('wood').live = ['wheel']; const wh = new THREE.Group(); wh.name = 'wheel'; wh.position.set(mx + 3.2, 2.2, mz); G.add(wh); const wheel = add(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 16, 1, true), mat(0x4a3424, { side: THREE.DoubleSide }), 0, 0, 0, true, wh); wheel.rotation.z = Math.PI / 2; for (let i = 0; i < 8; i++) { const sp = add(new THREE.BoxGeometry(0.1, 4.2, 0.4), mat(0x3a2a1c), 0, 0, 0, true, wh); sp.rotation.x = i / 8 * Math.PI; } endProp(); keepOut(mx, mz, 12); }
      scatter(hi ? 90 : 50, W.wallR + 12, W.exploreR + 10, (x, z) => R() < 0.5 ? tree(x, z, r(0.9, 1.4), R() < 0.3 ? 0xc0582a : null) : pine(x, z, r(0.8, 1.2)), 3);
      flushTrees(); flushPines(false); flushRocks(false);
      [[-9, 10], [56, 56], [-56, 56], [-56, -56], [46, -52], [70, 12], [-14, 74], [12, -76]].forEach(([x, z]) => charm(x, z));
      [[-4, -12], [5, -13]].forEach(([x, z]) => dummySpot(x, z));
      mountains(false);
    },
    snow() {
      Object.assign(W, { wallR: 26, exploreR: 80, particles: 'snow', ground: 'snow' });
      const gA = [0, Math.PI / 2, Math.PI * 1.5];
      gA.forEach(gate);
      floorDisc(W.wallR + 2, 'packed', 10);
      // boulders ring the plateau, opening on to the trails
      const gh = Math.asin(4.2 / (W.wallR + 2.5));
      for (let i = 0; i < 46; i++) { const a = (i + 0.5) / 46 * TAU; if (inGap(a, gA, gh + 0.05)) continue; const [x, z] = polar(a, W.wallR + r(1.8, 3.4)); rock(x, z, r(1.6, 2.6), true, r(0.9, 1.4)); }
      for (const a of gA) { const [px, pz] = polar(a, W.wallR), [qx, qz] = polar(a, W.exploreR); path(px, pz, qx, qz, 4, 'snow', '#d8dde6'); }
      rock(-12, -6, 1.7); rock(13, -3, 1.4); rock(3, 14, 1.2); pine(-10, 12, 1, true, true); pine(12, 11, 1.1, true, true);
      lantern(-6, -15, 1.1, true);
      // the lake, a hut, a half-buried torii, and pines everywhere
      { const m = new THREE.Mesh(new THREE.CircleGeometry(18, 64), texMat('ice', [4, 4], { r: 0.15 })); m.material.metalness = 0.1; m.rotation.x = -Math.PI / 2; m.position.set(0, 0.03, 52); m.receiveShadow = true; G.add(m); keepOut(0, 52, 20); W.mm.push({ k: 'c', x: 0, z: 52, r: 18, col: '#a9c8da' }); }
      house(45, 35, -2.4, 6, 5, 3, { wood: true, thatch: true }); keepOut(45, 35, 8);
      keepOut(-42, 40, 7); toriiAt(-42, 40, 0.8, 0.8); { beginProp('snow'); const g = grp(-42, 40, 0.8); add(new THREE.CylinderGeometry(4, 4.5, 0.7, 12), texMat('snow', [2, 1]), 0, 0.35, 0, false, g); endProp(); }   // the drift sits on the ground so a cut piece doesn't pop up
      keepOut(-50, -45, 8); hokora(-50, -45, 0.4);
      scatter(hi ? 260 : 150, W.wallR + 5, W.exploreR + 12, (x, z) => R() < 0.85 ? pine(x, z, r(0.9, 1.6), true, true) : rock(x, z, r(0.8, 1.8)), 1.5);
      flushPines(true); flushRocks(true); flushTrees();
      [[0, 38], [45, 29], [-42, 34], [-50, -40], [62, -30], [-70, -4], [20, -68], [16, 66]].forEach(([x, z]) => charm(x, z));
      [[-5, -9], [6, -9]].forEach(([x, z]) => dummySpot(x, z));
      mountains(true, 14);
    },
    castle() {
      Object.assign(W, { wallR: 25, exploreR: 85, particles: 'petals', ground: 'grass' });
      const gA = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
      gA.forEach(gate);
      floorDisc(W.wallR + 0.5, 'gravel', 12);
      // ishigaki stone base, white plastered wall, tiled cap; a roofed gatehouse at every opening
      const WR = W.wallR + 0.9;
      wallRing(WR, gA, 4.3, [{ h: 2.2, d: 2.4, y: 1.1, m: texMat('rockface', [1, 1]) }, { h: 1.8, d: 0.7, y: 3.1, m: texMat('plaster', [1, 1]) }, { h: 0.3, d: 1.1, y: 4.1, m: mat(0x2c2e33, { r: 0.55 }) }]);
      ring(WR, 1.3, gA, 4.3, '#7a7068');
      for (const a of gA) {
        beginProp('stone'); const [x, z] = polar(a, WR), g = grp(x, z, -a);
        for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(1.2, 5.6, 2.4), texMat('rockface', [1, 2]), sx * 4.9, 2.8, 0, true, g); solid(x + Math.cos(a) * 4.9 * sx, z + Math.sin(a) * 4.9 * sx, 1.1, false); }
        add(new THREE.BoxGeometry(11, 1.6, 2.6), texMat('plaster', [2, 1]), 0, 6.3, 0, true, g);
        const rf = add(new THREE.CylinderGeometry(4, 8.6, 1.6, 4, 1, true), mat(0x2c2e33, { r: 0.55, side: THREE.DoubleSide }), 0, 7.9, 0, true, g); rf.rotation.y = Math.PI / 4; rf.scale.z = 0.4; endProp();
      }
      // the moat, crossed by a bridge at each gate
      { const m = new THREE.Mesh(new THREE.RingGeometry(33, 38, 120), waterMat()); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; G.add(m);
        for (const rr of [32.6, 38.4]) { const b = new THREE.Mesh(new THREE.RingGeometry(rr - 0.5, rr + 0.5, 120), texMat('rockface', [40, 1])); b.rotation.x = -Math.PI / 2; b.position.y = 0.06; b.receiveShadow = true; G.add(b); }
        W.mm.push({ k: 'ring', r: 35.5, w: 2.5, gaps: gA, gh: Math.asin(2.6 / 35.5), col: '#4f7f95' });
        W.water.push({ r0: 33, r1: 38 });   // the moat can be waded
        for (const a of gA) { const [bx, bz] = polar(a, 35.5); W.dry.push({ x: bx, z: bz, ax: Math.sin(a), az: -Math.cos(a), hl: 4.2, hw: 2.7, prop: beginProp('wood') }); const [x, z] = polar(a, 35.5), g = grp(x, z, -a); add(new THREE.BoxGeometry(5, 0.3, 8), texMat('wood', [2, 3]), 0, 0.2, 0, true, g); for (const sx of [-1, 1]) for (const sz of [-3.6, 0, 3.6]) add(new THREE.BoxGeometry(0.18, 1.1, 0.18), red(), sx * 2.4, 0.75, sz, true, g); for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.12, 8), red(), sx * 2.4, 1.25, 0, true, g); endProp(); }
      }
      for (const a of gA) { const [px, pz] = polar(a, 39), [qx, qz] = polar(a, W.exploreR); path(px, pz, qx, qz, 6, 'stone'); }
      for (let k = 0; k < 4; k++) { const [x, z] = polar(Math.PI / 4 + k * Math.PI / 2, 12.5); beginProp('stone'); add(new THREE.BoxGeometry(2.4, 0.5, 2.4), texMat('stone', [1, 1]), 0, 0.25, 0, true, grp(x, z)); solidBox(x, z, 1.2, 1.2, 0, '#6b5a48', 0.55); endProp(); pine(x, z, 0.85, false); }
      for (let k = 0; k < 4; k++) { const [x, z] = polar(k * Math.PI / 2 + 0.35, 19); lantern(x, z, 1.2, true); }
      // the keep: a sloped stone base and five white tiers under dark roofs
      { beginProp('stone'); const kx = 0, kz = -64, g = grp(kx, kz);
        add(new THREE.CylinderGeometry(9, 12, 6, 4), texMat('rockface', [4, 2]), 0, 3, 0, true, g).rotation.y = Math.PI / 4;
        let y = 6;
        for (let i = 0; i < 5; i++) { const w = 11 - i * 1.8; add(new THREE.BoxGeometry(w, 2.6, w * 0.8), texMat('plaster', [2, 1]), 0, y + 1.3, 0, true, g); const rf = add(new THREE.CylinderGeometry(w * 0.45, w * 0.85, 1.4, 4, 1, true), mat(0x2c2e33, { r: 0.55, side: THREE.DoubleSide }), 0, y + 3.2, 0, true, g); rf.rotation.y = Math.PI / 4; rf.scale.z = 0.8; for (const sx of [-1, 1]) add(new THREE.BoxGeometry(w * 0.15, 0.6, 0.05), W.glowMat, sx * w * 0.25, y + 1.4, w * 0.4 + 0.03, false, g); y += 3.3; }
        add(new THREE.ConeGeometry(0.4, 1.2, 6), mat(0xc8a040, { r: 0.4, m: 0.6, keep: true }), 0, y + 0.8, 0, true, g);
        solidBox(kx, kz, 8.5, 8.5, 0); keepOut(kx, kz, 18); endProp(); }
      house(52, 40, -2.2, 7, 5, 3, { wood: true }); keepOut(52, 40, 9);
      const sak = 0xf1a9bd;
      scatter(hi ? 110 : 60, 42, W.exploreR + 10, (x, z) => R() < 0.45 ? tree(x, z, r(1, 1.4), R() < 0.6 ? sak : null) : pine(x, z, r(0.9, 1.4)), 3);
      flushTrees(); flushPines(false); flushRocks(false);
      [[0, -48], [52, 33], [-60, 30], [60, -30], [-35.5, 1], [12, 70], [-70, -40], [30, -75]].forEach(([x, z]) => charm(x, z));
      [[-5, -9], [6, -9], [0, 9]].forEach(([x, z]) => dummySpot(x, z));
      mountains(false);
    },
  };

  let curTheme = 0, spheres = [], casts = [], thin = [];
  const SHADOW_R = 45;
  W.setMap = (id, force = false) => {
    if (W.map === id && !force && !W.dirty) return;   // rebuilt if anything was cut down
    W.dirty = false;
    for (const t of tiles) scene.remove(t);
    if (G) G.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    for (const g of [CG, MG]) if (g) { scene.remove(g); g.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
    for (const m of made) m.dispose(); made = []; for (const k in texCache) delete texCache[k]; stoneMat = null; matCache = {}; cutMats.clear();
    G = new THREE.Group(); CG = new THREE.Group(); MG = new THREE.Group(); scene.add(CG, MG);
    W.map = id; W.colliders = []; W.gates = []; W.rings = []; W.water = []; W.dry = []; props = []; curProp = null; W.charms = []; W.dummies = []; W.mm = []; W.leapH = 3.3;
    grid = new Map(); boxes = []; clear = [];
    R = rng(MAPS.findIndex(m => m.id === id) * 7919 + 13);
    const T = W.town = { ...TOWNS[id] };
    if (!T.built) town(T, id === 'snow');
    BUILD[id].call(W);
    if (T.built) { T.stalls = [{ x: 4, z: 6 }, { x: -4, z: 6 }]; T.board = { x: 0, z: -7 }; }
    W.arenaR = W.wallR - 1.3; W.bodyR = W.wallR - 0.7; W.tile = W.exploreR * 2;
    mergeStatic(G); measureProps();
    tiles = []; for (let i = 0; i < 9; i++) { const t = i === 4 ? G : G.clone(); tiles.push(t); scene.add(t); }
    casts = G.children.map(o => o.castShadow);
    // dense instanced scenery (forests, rice, rocks) can be thinned on tiles further away: scatter adds instances
    // in random order, so drawing only the first part of the list leaves an even, sparser spread
    thin = G.children.map(o => o.isInstancedMesh && !/^(wall|post)/.test(o.name) ? o.count : 0);
    spheres = G.children.map(o => { if (!o.isMesh) return null; const b = o.isInstancedMesh ? (o.boundingSphere || (o.computeBoundingSphere(), o.boundingSphere)) : (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere)); return b && b.radius < 1e5 ? b : null; });
    W.wheels = []; for (const t of tiles) { const w = t.getObjectByName('wheel'); if (w) W.wheels.push(w); }
    groundMat.map = tex(W.ground, [110, 110]); groundMat.needsUpdate = true;
    W.mmLayer = null;
    W.setTheme(curTheme);
    W.setExplore(W.explore);
    warmCutMaterials();
  };
  // The cut pieces of each scenery material use a vertex-coloured copy of it (cutMat); compiling that shader the
  // first time something made of it was cut froze the game for a few hundred ms mid-fight. So the copies are
  // compiled when the map loads (during the screen change anyway), against the real scene's lights and fog.
  function warmCutMaterials() {
    const mats = new Set();
    for (const pr of props) {
      for (const it of pr.inst) { const im = G.getObjectByName(it.name); if (im) mats.add(im.material); }
      for (const rg of pr.ranges) mats.add(rg.mat);
    }
    const tmp = new THREE.Scene(), cam = new THREE.PerspectiveCamera(), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)); g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
    for (const m of mats) { const c = m.isMeshBasicMaterial ? MATS.glow : cutMat(m), o = new THREE.Mesh(g, c); o.castShadow = o.receiveShadow = true; tmp.add(o); }
    try { renderer.compile(tmp, cam, scene); } catch (e) {}   // (compileAsync trips over the separate light scene in this three.js)
    g.dispose();
  }
  // one mesh per material (and shadow flag) for everything static in the tile; instanced batches stay as they are
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    const groups = new Map(), drop = [];
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      let pr = null;
      for (let a = o.parent; a && a !== root; a = a.parent) { if (a.name === 'wheel') return; pr = pr || a.userData.prop || null; }
      const key = o.material.uuid + (o.castShadow ? 's' : '');
      let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.clearGroups(); g.morphAttributes = {};
      if (!groups.has(key)) groups.set(key, { m: o.material, shadow: o.castShadow, list: [], owners: [] });
      groups.get(key).list.push(g); groups.get(key).owners.push(pr); drop.push(o);
    });
    for (const o of drop) { o.parent.remove(o); o.geometry.dispose(); }
    // the prop groups they came from are empty now; drop them so they aren't matrix-updated every frame in 9 tiles
    for (const g of root.children.slice()) if (g.isGroup && !g.children.length && g.name !== 'wheel') root.remove(g);
    for (const { m, shadow, list, owners } of groups.values()) {
      const merged = mergeGeometries(list, false);
      if (merged) { let off = 0; list.forEach((g, i) => { const n = g.attributes.position.count, pr = owners[i]; if (pr) { g.computeBoundingBox(); pr.box.union(g.boundingBox); pr.ranges.push({ geo: merged, start: off, count: n, mat: m }); } off += n; }); }
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m); mesh.castShadow = shadow; mesh.receiveShadow = true; root.add(mesh);
    }
  }
  // bounding boxes of instanced parts, then a centre and radius per prop for quick hit tests
  function measureProps() {
    const ims = {}, M = new THREE.Matrix4(), bb = new THREE.Box3();
    G.traverse(o => { if (o.isInstancedMesh) { ims[o.name] = o; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); } });
    for (const pr of props) {
      for (const it of pr.inst) { const im = ims[it.name]; if (!im) continue; im.getMatrixAt(it.i, M); pr.box.union(bb.copy(im.geometry.boundingBox).applyMatrix4(M)); }
      for (const name of pr.live || []) { const o = G.getObjectByName(name); if (o) pr.box.union(bb.setFromObject(o)); }
      if (pr.box.isEmpty()) { pr.cut = true; continue; }
      pr.cx = (pr.box.min.x + pr.box.max.x) / 2; pr.cz = (pr.box.min.z + pr.box.max.z) / 2; pr.rad = Math.hypot(pr.box.max.x - pr.box.min.x, pr.box.max.z - pr.box.min.z) / 2;
    }
  }
  // props whose nearest copy is within R of pos: [{ prop, ox, oz, box (world) }]
  W.propsNear = (pos, R, withTown = false) => {   // town props only when asked (to show the blade glancing off them)
    if (!W.explore) return [];
    const P = W.tile, tx = Math.round(pos.x / P) * P, tz = Math.round(pos.z / P) * P, lx = pos.x - tx, lz = pos.z - tz, out = [];
    for (const pr of props) {
      if (pr.cut || (pr.town && !withTown)) continue;
      let dx = pr.cx - lx, dz = pr.cz - lz; const kx = Math.round(dx / P), kz = Math.round(dz / P); dx -= kx * P; dz -= kz * P;
      if (Math.hypot(dx, dz) - pr.rad > R) continue;
      const ox = tx + kx * P, oz = tz + kz * P;
      out.push({ prop: pr, ox, oz, box: pr.box.clone().translate(new THREE.Vector3(ox, 0, oz)) });
    }
    return out;
  };
  // Lift a prop out of the scenery as world-space, sliceable pieces [{ geo, mat, cap }] placed at (ox, oz), and
  // remove it (and its colliders) from every copy of the tile
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), _M = new THREE.Matrix4(), _ic = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
  // a cut piece keeps the prop's own material (texture, roughness, double-sided roofs), switched to vertex colours
  // so per-instance tints survive and the slicer can colour the cut faces
  const cutMats = new Map();
  const cutMat = m => { let c = cutMats.get(m); if (!c) { c = keepMat(m.clone()); c.vertexColors = true; cutMats.set(m, c); } return c; };
  function sliceItem(g, tint, m, cap) {   // keep position, normal and uv; the tint (and any vertex colours) go into vertex colours
    if (g.index) g = g.toNonIndexed();
    const glow = m.isMeshBasicMaterial, base = glow ? m.color.clone().multiply(tint) : tint;
    const vc = g.attributes.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const k = vc ? vc.getX(i) : 1, k2 = vc ? vc.getY(i) : 1, k3 = vc ? vc.getZ(i) : 1; col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k2; col[i * 3 + 2] = base.b * k3; }
    for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && (a !== 'uv' || glow)) g.deleteAttribute(a);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return { geo: g, mat: glow ? MATS.glow : cutMat(m), cap };
  }
  W.cutProp = (pr, ox, oz) => {
    if (pr.cut || pr.town) return null;
    pr.cut = true; W.dirty = true;
    const items = [], T = new THREE.Matrix4().makeTranslation(ox, 0, oz);
    for (const it of pr.inst) {
      const ims = tiles.map(t => t.getObjectByName(it.name)).filter(Boolean); if (!ims.length) continue;
      const im = ims[0]; im.getMatrixAt(it.i, _M);
      items.push(sliceItem(im.geometry.clone().applyMatrix4(_M.clone().premultiply(T)), im.instanceColor ? (im.getColorAt(it.i, _ic), _ic.clone()) : WHITE, im.material, pr.cap));
      for (const m of ims) { m.setMatrixAt(it.i, ZERO); m.instanceMatrix.addUpdateRange(it.i * 16, 16); m.instanceMatrix.needsUpdate = true; }   // re-upload just this instance
    }
    for (const rg of pr.ranges) {
      const Pa = rg.geo.attributes.position, Na = rg.geo.attributes.normal, Ua = rg.geo.attributes.uv, a = rg.start * 3, b = (rg.start + rg.count) * 3, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(Pa.array.slice(a, b), 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Na.array.slice(a, b), 3));
      if (Ua) g.setAttribute('uv', new THREE.Float32BufferAttribute(Ua.array.slice(rg.start * 2, (rg.start + rg.count) * 2), 2));
      g.applyMatrix4(T);
      items.push(sliceItem(g, WHITE, rg.mat, pr.cap));
      Pa.array.fill(0, a, b); Pa.addUpdateRange(a, b - a); Pa.needsUpdate = true;   // every tile copy shares this geometry; re-upload only the cut range, not the whole merged mesh
    }
    for (const name of pr.live || []) {   // moving parts (the water wheel) aren't merged: copy their meshes as they stand now
      const o = G.getObjectByName(name); if (!o) continue;
      o.updateMatrixWorld(true); const inv = G.matrixWorld.clone().invert();
      o.traverse(m => { if (m.isMesh) items.push(sliceItem(m.geometry.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld).premultiply(T)), WHITE, m.material, pr.cap)); });
      for (const t of tiles) { const x = t.getObjectByName(name); if (x) x.visible = false; }
    }
    for (const c of pr.col) c.dead = true;
    return items;
  };
  // wading: inside a pond, paddy or the moat (tile-local test)
  W.inWater = pos => {
    const q = W.local(pos);
    // dry footing over the water: the moat's bridges (until they're cut away)
    if (W.dry.some(b => { const dx = q.x - b.x, dz = q.z - b.z; return !b.prop.cut && Math.abs(dx * b.ax + dz * b.az) < b.hl && Math.abs(dx * b.az - dz * b.ax) < b.hw; })) return false;
    return W.water.some(w => w.r0 !== undefined ? (d => d > w.r0 && d < w.r1)(Math.hypot(q.x, q.z)) : w.r !== undefined ? Math.hypot(q.x - w.x, q.z - w.z) < w.r : Math.abs(q.x - w.x) < w.hw && Math.abs(q.z - w.z) < w.hd);
  };
  // explore mode opens the whole map (charms show; the arena edge no longer holds you in)
  W.setExplore = on => {
    W.explore = on;
    for (const c of W.charms) c.g.visible = on && !c.found;
    W.camR = on ? 1e9 : W.wallR + 3.5;
  };

  // push a circle (x, z, rad) out of everything solid; returns nothing, edits p in place
  W.collide = (p, rad, y = 0) => {
    if (!W.explore) return collideLocal(p, rad, y);
    const P = W.tile, cx = Math.round(p.x / P) * P, cz = Math.round(p.z / P) * P, q = { x: p.x - cx, z: p.z - cz }, E = P / 2 - 4;
    collideLocal(q, rad, y);
    const ox = q.x > E ? -P : q.x < -E ? P : 0, oz = q.z > E ? -P : q.z < -E ? P : 0;   // props just across the tile edge
    for (const [dx, dz] of [[ox, 0], [0, oz], [ox, oz]]) if (dx || dz) { q.x += dx; q.z += dz; collideLocal(q, rad, y); q.x -= dx; q.z -= dz; }
    p.x = q.x + cx; p.z = q.z + cz;
  };
  // position in the tile under p (the map repeats every W.tile metres)
  W.local = p => { const P = W.tile; return { x: p.x - Math.round(p.x / P) * P, z: p.z - Math.round(p.z / P) * P }; };
  function collideLocal(p, rad, y = 0) {
    const i0 = Math.floor((p.x - rad) / CELL), i1 = Math.floor((p.x + rad) / CELL), j0 = Math.floor((p.z - rad) / CELL), j1 = Math.floor((p.z + rad) / CELL);
    const seen = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const L = grid.get(cellKey(i, j)); if (!L) continue;
      for (const o of L) {
        if (seen.has(o)) continue; seen.add(o);
        if (o.dead || y > o.h) continue;   // cut down, or jumped over
        if (o.box) {
          const dx = p.x - o.x, dz = p.z - o.z, lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
          const cx = Math.max(-o.hw, Math.min(o.hw, lx)), cz = Math.max(-o.hd, Math.min(o.hd, lz));
          let ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
          if (d >= rad) continue;
          if (d < 1e-4) { const px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz); if (px < pz) { ex = Math.sign(lx) || 1; ez = 0; d = 0; lxPush(p, o, ex * (px + rad), 0); } else { lxPush(p, o, 0, (Math.sign(lz) || 1) * (pz + rad)); } continue; }
          lxPush(p, o, ex / d * (rad - d), ez / d * (rad - d));
        } else {
          const ox = p.x - o.x, oz = p.z - o.z, rr = o.r + rad, l = Math.hypot(ox, oz);
          if (l < rr && l > 1e-4) { p.x += ox / l * (rr - l); p.z += oz / l * (rr - l); }
        }
      }
    }
    if (!W.explore) { const pr = Math.hypot(p.x, p.z), M = W.arenaR - rad; if (pr > M) { p.x *= M / pr; p.z *= M / pr; } }   // the arena edge only holds during a fight
  }
  const lxPush = (p, o, lx, lz) => { p.x += lx * o.c + lz * o.s; p.z += -lx * o.s + lz * o.c; };

  let rainK = 0;
  W.setTheme = (i) => { curTheme = i; W.skyState = null; rainK = 0; applyTheme(THEMES_REAL[i], true); };
  // explore: blend two themes (a to b by t) under a weather; env: also rebuild the reflections (costly, so throttled)
  const COLS = ['top', 'mid', 'bot', 'sun', 'fog', 'light', 'hemiS', 'hemiG', 'cloud', 'blossom'], _ca = new THREE.Color(), _cb = new THREE.Color(), GREY = new THREE.Color(0x707680);
  W.setSky = (a, b, t, w, env) => {
    W.skyState = { a, b, t, w };
    const T = {};
    for (const k in a) { const va = a[k], vb = b[k] ?? va; T[k] = typeof va === 'number' ? va + (vb - va) * t : t < 0.5 ? va : vb; }
    for (const k of COLS) T[k] = _ca.set(a[k] ?? 0xffffff).lerp(_cb.set(b[k] ?? a[k] ?? 0xffffff), t).getHex();
    T.sunDir = a.sunDir.map((v, i) => v + (b.sunDir[i] - v) * t); T.moon = (t < 0.5 ? a : b).moon;
    T.clouds = Math.min(1, (T.clouds || 0) + w.cover); T.fogD *= w.fogMul; T.li *= 1 - 0.55 * w.dim; T.hi *= 1 - 0.25 * w.dim;
    for (const k of ['top', 'mid', 'fog', 'cloud']) T[k] = _ca.set(T[k]).lerp(GREY.clone().multiplyScalar(k === 'cloud' ? 0.8 : 0.9 * (0.4 + 0.6 * T.li / 3)), w.dim * 0.6).getHex();
    rainK = w.rain;
    applyTheme(T, env);
  };
  function applyTheme(T, env) {
    skyU.top.value.set(T.top); skyU.mid.value.set(T.mid); skyU.bot.value.set(T.bot); skyU.sunCol.value.set(T.sun);
    skyU.sunDir.value.set(...T.sunDir).normalize(); skyU.sunSize.value = T.sunSize; skyU.moon.value = T.moon ? 1 : 0;
    skyU.cover.value = T.clouds ?? 0; skyU.cloudCol.value.set(T.cloud ?? 0xffffff);
    const snowy = W.particles === 'snow';
    scene.fog.color.set(T.fog); scene.fog.density = T.fogD * (snowy ? 1.4 : 1);
    const sd = new THREE.Vector3(...T.sunDir).normalize();
    sunOff.set(sd.x * 60, Math.max(30, sd.y * 120), sd.z * 60);
    sun.color.set(T.light); sun.intensity = T.li;
    fill.position.set(-sd.x * 40, 25, -sd.z * 40);
    fill.color.set(T.hemiS); fill.intensity = 0.25 + T.lantern * 0.35;
    hemi.color.set(T.hemiS); hemi.groundColor.set(T.hemiG); hemi.intensity = T.hi;
    W.glowMat.color.setRGB(1.0 * T.lantern + 0.4, 0.62 * T.lantern + 0.25, 0.25 * T.lantern + 0.1);
    centreLight.intensity = T.lantern * 12;
    starMat.opacity = T.stars;
    const pc = snowy ? 0xffffff : W.particles === 'leaves' ? 0x7a8a3a : T.blossom;
    petalMat.color.set(pc); petalMat.emissive.set(snowy ? 0x606870 : 0x401020); petalMat.emissiveIntensity = snowy ? 0.6 : 0.4;
    colourRanges(T);
    hemiEnv.material.color.set(T.hemiG);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = T.exposure * 0.95;
    if (env || !envRT) { if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, 0.02); scene.environment = envRT.texture; }
    scene.environmentIntensity = 0.55;
  }
  // rain: streaks falling round the camera, slanted by the wind (slow white sleet on the snowy map)
  const RN = hi ? 1400 : 600, rainPos = new Float32Array(RN * 6), rd = Array.from({ length: RN }, () => ({ x: rnd(-20, 20), y: rnd(0, 16), z: rnd(-20, 20), s: rnd(0.8, 1.2) }));
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xb8c4d0, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  function updRain(dt, cam) {
    rain.visible = rainK > 0.02 && W.explore; if (!rain.visible) return;
    const snowy = W.particles === 'snow', sp = snowy ? 5 : 24, len = snowy ? 0.12 : 0.55, n = Math.floor(RN * rainK);
    rainMat.color.set(snowy ? 0xffffff : 0xb8c4d0); rainMat.opacity = (snowy ? 0.8 : 0.42) * Math.min(1, rainK * 1.4);
    for (let i = 0; i < RN; i++) {
      const p = rd[i], o = i * 6;
      if (i >= n) { rainPos.fill(0, o, o + 6); continue; }
      p.y -= dt * sp * p.s; p.x += dt * (snowy ? 1.2 : 3);
      if (p.y < 0) { p.y += 16; }
      p.x = wrap(p.x, cam.x, 20); p.z = wrap(p.z, cam.z, 20);
      rainPos[o] = p.x; rainPos[o + 1] = p.y; rainPos[o + 2] = p.z; rainPos[o + 3] = p.x - (snowy ? 0.05 : 0.07); rainPos[o + 4] = p.y + len; rainPos[o + 5] = p.z;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const wrap = (v, c, h) => v - c > h ? v - 2 * h : v - c < -h ? v + 2 * h : v;
  W.update = (dt, t, cam) => {
    skyU.time.value = t;
    // the shadow box rides with the camera (snapped, so shadows don't shimmer)
    const sx = Math.round(cam.x / 4) * 4, sz = Math.round(cam.z / 4) * 4;
    sun.target.position.set(sx, 0, sz); sun.position.set(sx + sunOff.x, sunOff.y, sz + sunOff.z); fill.target.position.set(sx, 0, sz);
    if (waterNorm) { waterNorm.offset.x = t * 0.012; waterNorm.offset.y = t * 0.007; }
    for (const w of W.wheels || []) w.rotation.x = t * 0.6;   // the water wheels turn
    // the 3x3 block of tiles round the camera (only the home tile in an arena fight on low graphics)
    const P = W.tile, ti = Math.round(cam.x / P), tj = Math.round(cam.z / P), all = W.explore || hi;
    tiles.forEach((g, i) => { const dx = i % 3 - 1, dz = Math.floor(i / 3) - 1; g.position.set((ti + dx) * P, 0, (tj + dz) * P); g.visible = all || (dx === 0 && dz === 0 && ti === 0 && tj === 0); });
    // past the distance where the fog is ~opaque nothing shows, so those cells are not drawn (nor cast shadows)
    const far = Math.min(400, 2.1 / scene.fog.density);
    for (const g of tiles) {
      if (!g.visible) continue;
      const ch = g.children, ox = g.position.x, oz = g.position.z;
      const tx = Math.max(0, Math.abs(cam.x - ox) - P / 2), tz = Math.max(0, Math.abs(cam.z - oz) - P / 2), td = Math.hypot(tx, tz);   // camera to this tile's square
      const keep = td < 40 ? 1 : td < 80 ? 0.75 : 0.5;
      for (let k = 0; k < ch.length; k++) if (thin[k]) ch[k].count = Math.ceil(thin[k] * keep);
      for (let k = 0; k < ch.length; k++) {
        const b = spheres[k]; if (!b) continue;
        const ddx = b.center.x + ox - cam.x, ddz = b.center.z + oz - cam.z, d2 = ddx * ddx + ddz * ddz, lim = far + b.radius, sh = (W.shadowR ?? SHADOW_R) + b.radius;
        ch[k].visible = d2 < lim * lim;
        if (casts[k]) ch[k].castShadow = d2 < sh * sh;   // only scenery near you casts: the sun's shadow box reaches far beyond what you can see
      }
    }
    const gp = 700 / 110; ground.position.set(Math.round(cam.x / gp) * gp, 0, Math.round(cam.z / gp) * gp);   // texture stays put
    if (MG) MG.position.set(cam.x, 0, cam.z);
    if (CG) CG.position.set(ti * P, 0, tj * P);
    if (W.explore) for (const c of W.charms) if (c.g.visible) { c.g.position.y = 1.1 + Math.sin(t * 2 + c.x) * 0.12; c.g.rotation.y = t * 1.5; c.halo.lookAt(cam); c.halo.material.opacity = 0.3 + 0.2 * Math.sin(t * 4 + c.z); }
    const snow = W.particles === 'snow', leaves = W.particles === 'leaves';
    for (let i = 0; i < PN; i++) {
      const p = pd[i];
      p.y -= dt * (snow ? 0.8 : 0.55) * p.sp; p.x += dt * (snow ? 0.3 + Math.sin(t * 0.5 + p.ph) * 0.4 : 0.5 + Math.sin(t * 0.7 + p.ph) * 0.6); p.z += dt * 0.25;
      if (p.y < 0.02) p.y = rnd(7, 10);
      p.x = wrap(p.x, cam.x, 18); p.z = wrap(p.z, cam.z, 18);
      const k = snow ? 0.25 : 1;   // flakes drift and turn slowly, petals and leaves tumble
      _e.set(t * 2.1 * p.sp * k + p.ph, t * 1.3 * k + p.ph, Math.sin(t * 3 * k + p.ph));
      petals.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e), _s.setScalar(p.s * (snow ? 1.1 : leaves ? 1.4 : 1))));
    }
    petals.instanceMatrix.needsUpdate = true;
    updRain(dt, cam);
  };
  return W;
}
