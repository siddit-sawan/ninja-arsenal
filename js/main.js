import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sdk, initSDK, loadingStart, loadingStop, happytime, gameplay, loadData, saveData, clearData, adsOK, runAd } from './sdk.js';
import { audio, sfx, music } from './audio.js';
import { CAP, batchParts, chunkFrom, MATS } from './slicer.js';
import { ClothTail } from './cloth.js';
import { loadBody, cloneChar, RIG, cutMarks, MARK_MAT } from './body.js';
import { makePhysics } from './ragdoll.js';
import { buildEnemy, buildPlayer, enemyStar, WEAPON_MODELS, weaponIconSVG, shurikenMesh, kunaiMesh, horokuMesh, sickle } from './models.js';
import { buildWorld, MAPS, THEMES_REAL, DUSK, WEATHER } from './world.js';
import { makeFX } from './fx.js';

const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0), YAX = new V3(0, 1, 0);
const QS = new URLSearchParams(location.search);
const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);
let dbgDraw = '';   // dev (&dbg): draw calls and triangles of the last frame, shown in the tab title   // dev-only URL switches never work on the live site
const AUTO = DEV && QS.has('auto');                // dev: autopilot swipes (for testing)

/* ============ save ============ */
const SAVE_KEY = 'ninjaArsenal_v1';
// Playable heroes: a look and a perk each, unlocked with coins.
const CHARS = [
  { id: 'kage', name: 'KAGE', title: 'The Shadow', cost: 0, perk: 'Balanced: no strengths, no weaknesses.', speed: 1, dash: 1, hearts: 0, ult: 1 },
  { id: 'hana', name: 'HANA', title: 'Kunoichi', cost: 900, perk: '+15% run speed and dash recharges 35% faster.', speed: 1.15, dash: 0.65, hearts: 0, ult: 1 },
  { id: 'tetsu', name: 'TETSU', title: 'Ronin', cost: 1800, perk: '+1 heart, but 5% slower on foot.', speed: 0.95, dash: 1, hearts: 1, ult: 1 },
  { id: 'raiden', name: 'RAIDEN', title: 'Oni Mask', cost: 3200, perk: 'Blade Storm charges 30% faster.', speed: 1, dash: 1, hearts: 0, ult: 1.3 },
];
const CH = () => CHARS.find(c => c.id === save.char) || CHARS[0];
// Charm blessings: every charm found in explore mode (all maps together) counts toward permanent blessings.
const BLESSINGS = [
  { n: 3, t: '+1 heart' }, { n: 8, t: 'Storm charges 15% faster' }, { n: 14, t: '+15% coins from every run' },
  { n: 20, t: 'Stages start with the Storm gauge half full' }, { n: 28, t: '+1 more heart' }, { n: 40, t: 'Dash recharges 25% faster' }];
const charmCount = () => Object.values(save.charms || {}).reduce((a, l) => a + l.length, 0);
const blessed = n => charmCount() >= n;
const heartsMax = () => 5 + save.hearts + CH().hearts + (blessed(3) ? 1 : 0) + (blessed(28) ? 1 : 0);
const ultRate = () => CH().ult * (blessed(8) ? 1.15 : 1);

const WIDS = ['katana', 'shuriken', 'kunai', 'kusarigama', 'naginata', 'horoku'];
const defSave = () => ({ coins: 0, stage: 1, sel: 1, w: { katana: 1, shuriken: 0, kunai: 0, kusarigama: 0, naginata: 0, horoku: 0 }, cur: 'katana', hearts: 0,
  sfx: true, mus: true, q: null, blood: false, family: 1, map: 'auto', charms: {}, tut: false, best: 0, cam: 'tp', tutDone: false, exGuide: false, shopTour: false, char: 'kage', chars: { kage: true } });
let save = defSave();
function loadSave() {
  try {
    const s = JSON.parse(loadData(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') { save = Object.assign(defSave(), s); save.w = Object.assign(defSave().w, s.w || {}); save.chars = Object.assign({ kage: true }, s.chars || {}); }
    else save = defSave();
  } catch (e) { save = defSave(); }
  if (!save.family) { save.family = 1; save.blood = false; }   // family-friendly by default; Blood can be turned back on in Settings
}
const persist = () => saveData(SAVE_KEY, JSON.stringify(save));

/* ============ weapons ============ */
const WEAP = {
  katana: { name: 'Katana', mode: 'swipe', cost: 0, color: '#cfefff', flash: 0xcfefff,
    desc: 'Swipe to slice anything within reach. Cut falling halves again in mid-air for bonus coins.',
    range: l => 7.5 + l * 0.9, dmg: l => 1 + Math.floor((l - 1) / 2), cd: () => 0.3, up: [200, 450, 900, 1600] },
  shuriken: { name: 'Shuriken', mode: 'throw', cost: 300, color: '#ffe08a', flash: 0xffe08a,
    desc: 'Tap or hold to throw spinning stars. They pierce through enemies and cut them across the middle.',
    range: () => 60, dmg: l => l >= 4 ? 2 : 1, cd: l => 0.38 - l * 0.035, pierce: l => 1 + Math.floor(l / 2), count: l => l >= 5 ? 3 : l >= 3 ? 2 : 1, up: [300, 600, 1100, 1900] },
  kunai: { name: 'Kunai', mode: 'throw', cost: 700, color: '#ff9a7a', flash: 0xff9a7a,
    desc: 'Heavy throwing knives that split enemies from head to toe. Cuts straight through samurai armor.',
    range: () => 70, dmg: l => 2 + l, cd: l => 0.62 - l * 0.05, pierce: l => l >= 3 ? 2 : 1, count: () => 1, up: [450, 850, 1500, 2500] },
  kusarigama: { name: 'Kusarigama', mode: 'fling', cost: 1400, color: '#b6ff9a', flash: 0xb6ff9a,
    desc: 'Swipe to fling the chained sickle across the battlefield, cutting everything along the arc.',
    range: l => 20 + l * 2.5, dmg: l => 2 + Math.floor(l / 2), cd: l => 1.05 - l * 0.09, up: [600, 1100, 1900, 3000] },
  naginata: { name: 'Naginata', mode: 'sweep', cost: 2200, color: '#ffb27a', flash: 0xffc89a,
    desc: 'One huge sweep per swipe that cleaves every enemy along the line, edge to edge of the screen.',
    range: l => 10 + l * 1.2, dmg: l => 2 + Math.floor((l + 1) / 2), cd: l => 0.85 - l * 0.07, up: [800, 1500, 2500, 4000] },
  horoku: { name: 'Hōroku Bomb', mode: 'throw', cost: 3000, color: '#ffb35a', flash: 0xffb35a,
    desc: 'Lob a clay bomb where you tap. It bursts on impact and cuts apart everything caught in the blast.',
    range: () => 30, dmg: l => 2 + Math.floor(l / 2), cd: l => 1.7 - l * 0.15, radius: l => 2.6 + l * 0.4, count: () => 1, pierce: () => 1, up: [1200, 2000, 3200, 4800] },
};
const HEART_UP = [400, 900, 1600, 2600, 3800, 5200, 7000, 9500];   // Vitality: 8 levels, +1 heart each
let trial = null;   // weapon unlocked for one stage by a rewarded ad
const lvl = id => save.w[id] || (trial === id ? 1 : 0);
const has = id => lvl(id) > 0;

/* ============ enemies ============ */
const EDEF = {
  grunt: { hp: 1, speed: 3.1, value: 5, h: 1.85, w: 0.38 },
  runner: { hp: 1, speed: 5.4, value: 7, h: 1.72, w: 0.36 },
  archer: { hp: 1, speed: 2.7, value: 9, h: 1.85, w: 0.38, ranged: true },
  samurai: { hp: 3, speed: 2.1, value: 16, h: 2.1, w: 0.46, armor: true },
  brute: { hp: 2, speed: 1.9, value: 14, h: 2.4, w: 0.55, reach: 2.0, wind: 1.0, heavy: true },
  assassin: { hp: 1, speed: 4.4, value: 12, h: 1.72, w: 0.34, wind: 0.5, blink: true },
  shade: { hp: 1, speed: 3.8, value: 3, h: 1.6, w: 0.32, wind: 0.6 },
  citizen0: { hp: 1, speed: 1.2, value: 0, h: 1.85, w: 0.36, civ: true },
  citizen1: { hp: 1, speed: 1.2, value: 0, h: 1.85, w: 0.36, civ: true },
  citizen2: { hp: 1, speed: 1.2, value: 0, h: 1.85, w: 0.36, civ: true },
  citizen3: { hp: 1, speed: 1.2, value: 0, h: 1.85, w: 0.36, civ: true },
  oni: { hp: 30, speed: 1.3, value: 150, h: 4.3, w: 1.0, boss: true, dmg: 2, name: 'ONI WARLORD', slain: 'ONI SLAIN' },
  shogun: { hp: 34, speed: 1.7, value: 220, h: 3.0, w: 0.75, boss: true, dmg: 2, reach: 2.6, name: 'SHOGUN GENERAL', slain: 'SHOGUN FALLS' },
  shadow: { hp: 26, speed: 2.6, value: 240, h: 2.55, w: 0.5, boss: true, dmg: 1, reach: 2.0, wind: 0.6, name: 'SHADOW MASTER', slain: 'SHADOW BANISHED' },
  dummy: { hp: 1, speed: 0, value: 0, h: 1.9, w: 0.3, dummy: true },
};

/* ============ renderer / scene ============ */
let renderer, scene, camera, composer = null, bloom, world, fx, phys, quality, baseFov = 60, fovKick = 0, hitStop = 0, landDip = 0;
const EYE = 1.68, PLAYER_R = 0.42, SPEED = 6.4;
const player = { y: 0, vy: 0, ground: true, jumps: 0, flip: 0, ph: 0, pos: new V3(), vel: new V3(), yaw: 0, pitch: -0.06, dashT: 0, dashCD: 0, dashDir: new V3(), moveDir: new V3(), bob: 0, bobAmt: 0, hurtT: 0 };
const keys = {};
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const look = { drag: false, x: 0, y: 0 };
const cursor = { x: 0, y: 0 };
let locked = false, blade = false, lockFail = false, lockErrs = 0;
let vw = innerWidth, vh = innerHeight;

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: quality === 'high', powerPreference: 'high-performance' });   // LOW skips multisampling (costly at 1080p on integrated graphics)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.05, 900);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
}
// Slow-frame fallback: after 3 slow seconds of play, switch HIGH to LOW once. The render size is never changed on
// the fly: resizing the canvas and the post-processing targets stalls the GPU for up to a second, and most frames
// are limited by draw calls rather than pixels anyway. Menus, pause, cutscenes and the first seconds of a new
// screen or stage (shader compiles, uploads) don't count.
const dynRes = { scale: 1, acc: 0, n: 0, slow: 0, st: null, settle: 0 };
// LOW renders at most 720 pixels tall (the browser scales the picture up): on a 1080p laptop screen that's
// two-thirds of the pixels to shade, which integrated graphics need. Set at start and on resize only.
function basePR() { return quality === 'high' ? Math.min(devicePixelRatio || 1, 1.5) : Math.min(devicePixelRatio || 1, 1, 720 / Math.max(1, innerHeight)); }
function tuneRes(rdt) {
  if (state !== dynRes.st || state !== 'play' || finish) { dynRes.st = state; dynRes.settle = 2.5; dynRes.acc = dynRes.n = dynRes.slow = 0; return; }   // menus, pause and cutscenes don't count
  if (dynRes.settle > 0) { dynRes.settle -= Math.min(rdt, 0.1); return; }
  if (document.hidden || rdt <= 0 || rdt >= 0.25) return;   // ignore tab switches and one-off hitches (rdt is the raw, unclamped frame time)
  dynRes.acc += rdt; dynRes.n++;
  if (dynRes.acc < 1) return;
  const avg = dynRes.acc / dynRes.n; dynRes.acc = dynRes.n = 0;
  dynRes.slow = avg > 1 / 45 ? dynRes.slow + 1 : 0;
  if (dynRes.slow < 3) return;
  dynRes.slow = 0;
  // drop bloom and soft shadows for the rest of the session
  if (quality === 'high') { quality = 'low'; applyQuality(); updToggles(); toast('Switched to LOW quality for smoother play'); }
}
// laptop/phone graphics (Intel, Mali, Adreno, PowerVR) start on LOW unless the player picked a quality
function integratedGPU() {
  try {   // asked of a throwaway context: this runs before the renderer exists
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'), d = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : ''; gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return /intel|mali|adreno|powervr|swiftshader|llvmpipe/i.test(name);
  } catch (e) { return false; }
}
function applyQuality() {
  const hi = quality === 'high';
  dynRes.scale = 1; dynRes.slow = 0;
  renderer.setPixelRatio(basePR());
  if (world) {
    const s = hi ? 2048 : 1024; world.sun.shadow.mapSize.set(s, s);
    if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
    world.shadowR = hi ? 45 : 25;   // how far round you scenery casts shadows
    if (world.lowMat === hi) { world.lowMat = !hi; if (world.map) world.setMap(world.map, true); }   // scenery materials follow the quality
  }
  // Shadows stay soft and are redrawn every frame on LOW too: hard-edged ones shimmered across moving characters,
  // and at half rate they trailed them every other frame, so runners looked like they were glitching.
  if (composer) { composer.dispose(); composer = null; }
  if (hi) {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.14, 0.4, 0.97);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  resize();
}
function resize() {
  vw = innerWidth; vh = innerHeight;
  renderer.setPixelRatio(basePR());
  renderer.setSize(vw, vh, false);
  if (composer) composer.setSize(vw, vh);
  camera.aspect = vw / vh;
  const hf = 80 * Math.PI / 180;   // keep at least ~80° horizontal view on narrow screens
  camera.fov = baseFov = clamp(2 * Math.atan(Math.tan(hf / 2) / camera.aspect) * 180 / Math.PI, 58, 96);
  camera.updateProjectionMatrix();
  const tc = $('trail'), dpr = Math.min(devicePixelRatio || 1, 2);
  tc.width = vw * dpr; tc.height = vh * dpr; tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tDrawn = true;
}
const tctx = $('trail').getContext('2d');

/* ============ viewmodel ============ */
const vm = new THREE.Group(), wPivot = new THREE.Group(), vmArm = new THREE.Group();
const vmW = {};
const VM_BASE = { katana: [0.36, -0.4, -0.6], shuriken: [0.27, -0.2, -0.62], kunai: [0.28, -0.24, -0.6], kusarigama: [0.32, -0.34, -0.58], naginata: [0.42, -0.5, -0.72], horoku: [0.27, -0.22, -0.6] };
const VM_DIR = { katana: [0.05, 0.8, -1], shuriken: [0.12, 1, 0.08], kunai: [-0.35, 1, -0.35], kusarigama: [-0.3, 1, -0.6], naginata: [-0.45, 0.8, -1], horoku: [0, 1, 0] };
const DISPLAY_Z = { katana: -1.5, shuriken: -0.5, kunai: -0.55, kusarigama: -0.85, naginata: -2.1, horoku: -0.5 };
const DISPLAY_Y = { katana: -0.42, shuriken: 0, kunai: 0, kusarigama: -0.08, naginata: -0.25, horoku: 0 };
const swing = { on: false, t: 0, dur: 0.16, d: new V3(1, 0, 0) };
let jab = 0, vmMode = 'hand', displayId = 'katana', drawT = -9;

function buildViewmodel() {
  camera.add(vm);
  vm.add(vmArm, wPivot);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x1d2440, roughness: 0.9 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: 0.75 });
  const cuffM = new THREE.MeshStandardMaterial({ color: 0x9a1a1a, roughness: 0.6 });
  const sd = new V3(0.35, -0.5, 0.8).normalize();
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.6, 12), cloth);
  sleeve.quaternion.setFromUnitVectors(YAX, sd); sleeve.position.copy(sd).multiplyScalar(0.33);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 0.05, 12), cuffM);
  cuff.quaternion.copy(sleeve.quaternion); cuff.position.copy(sd).multiplyScalar(0.06);
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.085, 0.09), glove);
  fist.rotation.set(0.3, 0.2, 0.2);
  vmArm.add(sleeve, cuff, fist);
  for (const id of WIDS) { const m = WEAPON_MODELS[id](); m.visible = false; wPivot.add(m); vmW[id] = m; }
}
function showVM(id) { for (const k of WIDS) vmW[k].visible = k === id; }
function startSwing(dx, dy, dur = 0.16) {
  swing.on = true; swing.t = 0; swing.dur = dur;
  swing.d.set(dx, -dy, 0).normalize();
}
const _vq = new THREE.Quaternion(), _vp = new V3(), _vb = new V3();
const inGame = () => ['play', 'clearing', 'gameover', 'paused'].includes(state);
function updateVM(dt, t) {
  vm.visible = vmMode === 'display' || (save.cam === 'fp' && inGame() && cineW < 0.35);
  let id = vmMode === 'display' ? displayId : cur;
  showVM(id);
  vmArm.visible = vmMode !== 'display' && WEAP[id].mode !== 'throw';
  if (vmMode === 'display') {
    _vp.set(vw > 700 ? -0.02 : 0, DISPLAY_Y[id], DISPLAY_Z[id]);
    vm.position.lerp(_vp, 1 - Math.exp(-dt * 8));
    _vq.setFromEuler(new THREE.Euler(0.15, t * 0.8, id === 'shuriken' ? 0 : -0.25));
    wPivot.quaternion.slerp(_vq, 1 - Math.exp(-dt * 8));
    return;
  }
  const b = VM_BASE[id];
  // breathing, a figure-eight bob with the stride, a dip on landing and lift in the air; a fresh weapon is drawn up from below
  const bob = player.bob, ba = player.bobAmt, draw = Math.max(0, 1 - (t - drawT) / 0.28);
  _vp.set(b[0] + Math.sin(bob) * 0.014 * ba, b[1] + Math.sin(t * 2) * 0.008 - Math.abs(Math.cos(bob)) * 0.016 * ba - landDip * 0.45 + clamp(player.vy * 0.004, -0.03, 0.03) - draw * draw * 0.4, b[2]);
  _vb.set(...VM_DIR[id]).normalize();
  let k = 1 - Math.exp(-dt * 16);
  if (swing.on) {
    swing.t += dt / swing.dur;
    const s = 1 - Math.pow(1 - Math.min(1, swing.t), 2.2);
    const a = 0.2 + s * (Math.PI - 0.4);
    _vb.copy(swing.d).multiplyScalar(-Math.cos(a)).add(new V3(0, 0.25, -Math.sin(a) * 1.2)).normalize();
    _vp.addScaledVector(swing.d, (s - 0.5) * 0.45); _vp.z -= Math.sin(s * Math.PI) * 0.12;
    k = 1 - Math.exp(-dt * 60);
    if (swing.t >= 1) swing.on = false;
  }
  if (jab > 0) { jab = Math.max(0, jab - dt); _vp.z -= Math.sin((jab / 0.18) * Math.PI) * 0.22; _vp.y += Math.sin((jab / 0.18) * Math.PI) * 0.05; }
  vm.position.lerp(_vp, k);
  _vq.setFromUnitVectors(YAX, _vb);
  wPivot.quaternion.slerp(_vq, k);
  const sk = vmW.kusarigama.getObjectByName('sickle'); if (sk) sk.visible = !fling.on;
}

/* ============ game state ============ */
let state = 'loading', cur = 'katana';
let stage = null, enemies = [], pProj = [], eProj = [], timers = [];
let hearts = 5, maxHearts = 5, score = 0, runCoins = 0, comboN = 0, comboT = 0, ult = 0, invuln = 0;
let stats = { kills: 0, maxCombo: 0, dmg: 0, air: 0, counters: 0, perfect: 0, clean: 0 };
let spawnT = 0, killedCounted = 0, revived = false, bossE = null, shake = 0, timeScale = 1, slowT = 0, slowTo = 1, strokeKills = new Map();
const cds = {}; WIDS.forEach(id => cds[id] = 0);
let lastCoins = 0, resDoubled = false, adsWatchedThisRun = 0, playsSinceAd = 0, lastAdAt = performance.now();
const AD_EVERY_STAGES = 3, AD_GAP_MS = 180000;   // midgame ads: at most every 3rd stage, 3+ minutes apart
const after = (t, fn) => timers.push({ t, fn });

// Enemy types unlock one by one and keep appearing afterwards: the first three arrive on stages 2-4, every later
// type at least 10 stages after the previous one. w(n) = weight in the random part of the mix.
const ROSTER = [
  { kind: 'grunt', from: 1, w: n => 1 },
  { kind: 'runner', from: 2, w: n => 0.3 + 0.03 * n, name: 'RUNNER', tip: 'Zig-zags in fast and flips into an attack' },
  { kind: 'archer', from: 3, w: n => 0.22 + 0.02 * n, name: 'ARCHER', tip: 'Keeps its distance. Swipe its shuriken to block' },
  { kind: 'samurai', from: 4, w: n => 0.18 + 0.03 * n, name: 'SAMURAI', tip: 'Armored: takes 3 hits (kunai pierce armor)' },
  { kind: 'brute', from: 14, w: n => 0.12 + 0.025 * n, name: 'BRUTE', tip: 'Takes 2 hits. Step back from its ground slam' },
  { kind: 'assassin', from: 24, w: n => 0.14 + 0.025 * n, name: 'ASSASSIN', tip: 'Vanishes in smoke and strikes from behind' },
];
const BOSSES = ['oni', 'shogun', 'shadow'];   // every 5th stage, in rotation
// Maps: stages rotate through them (map i opens once you reach stage i + 1); the menu can pin one instead
const themeName = i => THEMES_REAL[i].name;
const mapIdx = id => MAPS.findIndex(m => m.id === id);
const mapOpen = id => save.stage >= mapIdx(id) + 1;
const autoMap = n => MAPS[(n - 1 + Math.floor(n / 5)) % MAPS.length].id;
const stageMap = n => save.map !== 'auto' && mapOpen(save.map) ? save.map : autoMap(n);
const EXPLORE_THEME = { shrine: 2, bamboo: 0, village: 2, snow: 2, castle: 0 };
function makeStage(n) {
  const boss = n % 5 === 0;
  const total = Math.min(Math.round(12 + n * 3.2 + n * n * 0.09), 170) - (boss ? 4 : 0);
  const open = ROSTER.filter(r => n >= r.from), debut = ROSTER.find(r => r.from === n && n > 1);
  // every unlocked type is guaranteed a share of the stage (growing with the stage); the rest is a weighted draw
  const kinds = [];
  for (const r of open) if (r.kind !== 'grunt') for (let i = Math.min(2 + Math.floor((n - r.from) / 3), 8); i > 0; i--) kinds.push(r.kind);
  if (debut) kinds.push(debut.kind, debut.kind);
  while (kinds.length < total) {
    let x = Math.random() * open.reduce((s, r) => s + r.w(n), 0), kind = 'grunt';
    for (const r of open) { x -= r.w(n); if (x <= 0) { kind = r.kind; break; } }
    kinds.push(kind);
  }
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  if (debut) {   // a newcomer shows up early (3rd and 6th spawn), so it gets introduced before the crowd builds
    for (const at of [2, 5]) { const j = kinds.indexOf(debut.kind, at); if (j > at) [kinds[at], kinds[j]] = [kinds[j], kinds[at]]; }
  }
  const q = kinds.map(kind => ({ kind, gap: Math.max(0.25, 2.1 - n * 0.07) * rnd(0.55, 1.35) * (Math.random() < 0.18 + n * 0.01 ? 0.15 : 1) }));
  if (boss) q.push({ kind: BOSSES[(n / 5 - 1) % BOSSES.length], gap: 2 });
  return { n, boss, queue: q, total: q.length, debut: debut && debut.kind, theme: boss ? 3 : (n - 1) % 3, speedMul: Math.min(2, 1 + 0.03 * (n - 1)), ...difficulty(n) };
}
// Mid and end game get much harder: from stage 6 `hard` climbs to 1 by stage 30 (and on to 1.4 at 40). It shortens
// wind-ups and the pauses between attacks (pace), toughens enemies (armoured and heavy ones gain hit points, light
// ones may be veterans with two), makes heavy, armoured and boss blows cost an extra heart from stage 18, and bosses
// get far more health.
function difficulty(n) {
  const hard = clamp((n - 6) / 24, 0, 1.4);
  return { hard, pace: Math.max(0.5, 1 - 0.36 * hard), dmgUp: n >= 18 };
}

const templates = {};
const blow = d => (d.dmg || 1) + (stage.dmgUp && (d.heavy || d.armor || d.boss) ? 1 : 0);   // hearts a melee hit costs
function spawnEnemy(kind, x, z, minion = false, gate = null) {
  const d = EDEF[kind];
  const root = cloneChar(templates[kind]);
  const P = {}; ['hips', 'torso', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR'].forEach(n => P[n] = root.getObjectByName(n));
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const e = { kind, d, root, P, hp: d.hp, maxHp: d.hp, x, z, speed: d.speed * stage.speedMul * rnd(0.9, 1.1), state: 'run', t: 0, ph: rnd(0, 6), atkT: 0,
    stagger: 0, s: root.scale.x, minion, holdR: rnd(9, 14), lastStroke: -1, sumT: 6, gate, y: 0, air: null, leapCD: rnd(1.5, 4) };
  const H = stage.hard || 0;
  if (!d.boss && H > 0) { e.hp = e.maxHp = d.hp + (d.armor || d.heavy ? Math.floor(H * 2) : Math.random() < H * 0.35 ? 1 : 0); }   // tougher foes later on
  if (d.boss) { e.hp = e.maxHp = d.hp + (8 + 8 * H) * (stage.n / 5 - 1); e.blinkT = rnd(3, 4); bossE = e; $('bossName').textContent = d.name; $('bossBar').classList.remove('hidden'); updBoss(); banner(d.name, 'BOSS'); sfx.roar(); music('boss'); shake = 0.6; }
  root.position.set(x, 0, z); root.rotation.y = Math.atan2(-x, -z);
  scene.add(root); enemies.push(e);
  return e;
}

const rotTo = (o, v, k) => { o.rotation.x += (v - o.rotation.x) * k; };
const smooth = t => t * t * (3 - 2 * t);
// jump along an arc, flipping `spins` times (negative = backflip)
function leap(e, tx, tz, h, dur, spins, attack = false) {
  e.air = { t: 0, dur, x0: e.x, z0: e.z, y0: e.y, x1: tx, z1: tz, h, spins, attack };
  e.state = 'run'; sfx.swish(0.5);
}
function animEnemy(e, dt) {
  const P = e.P, k = 1 - Math.exp(-dt * 14);
  e.t += dt;
  if (e.air) {           // tucked flip around the hips
    const t = e.air.t, f = Math.sin(Math.PI * t);
    P.hips.rotation.x = e.air.spins * Math.PI * 2 * smooth(t); P.hips.position.y = RIG.hips.y;
    P.legL.rotation.x = P.legR.rotation.x = -1.4 * f; P.kneeL.rotation.x = P.kneeR.rotation.x = 2.1 * f;
    P.armL.rotation.x = -0.9 * f; P.armR.rotation.x = -0.9 * f - 0.3; P.elbowL.rotation.x = P.elbowR.rotation.x = -1.2 * f;
    P.head.rotation.x = 0.3 * f;
    return;
  }
  const tw = (o, ax, v, kk = k) => { o.rotation[ax] += (v - o.rotation[ax]) * kk; };
  const land = e.landT > 0 ? e.landT / 0.25 : 0; e.landT = Math.max(0, (e.landT || 0) - dt);   // crouch after a leap
  if (e.stagger > 0) {   // whiplash: snapped back hard, then recovering as the stagger runs out
    const a = e.stagger / 0.32;
    rotTo(P.hips, -0.45 * a, k); rotTo(P.head, -0.45 * a, k); rotTo(P.armL, 0.7 * a, k); rotTo(P.armR, 0.5 * a, k); rotTo(P.elbowL, -0.3, k);
    rotTo(P.legL, 0.3 * a, k); rotTo(P.legR, -0.25 * a, k); rotTo(P.kneeR, 0.5 * a, k);
    tw(P.torso, 'y', Math.sin(e.t * 28) * 0.18 * a); tw(P.hips, 'z', Math.sin(e.t * 17) * 0.08 * a);
    return;
  }
  tw(P.hips, 'z', Math.sin(e.t * 1.3 + e.ph) * 0.035);   // idle weight shift (also a slight roll while running)
  if (e.state === 'run' || e.state === 'charging') {
    e.ph += dt * (e.state === 'charging' ? 15 : e.speed) * (e.d.boss ? 1.6 : 2.3);
    const s = Math.sin(e.ph), c = Math.cos(e.ph);
    P.legL.rotation.x = -s * 0.85; P.legR.rotation.x = s * 0.85;
    P.kneeL.rotation.x = Math.max(0, c) * 1.3 + land; P.kneeR.rotation.x = Math.max(0, -c) * 1.3 + land;
    P.armL.rotation.x = s * 0.8; rotTo(P.armR, e.kind === 'runner' ? -s * 0.8 : -0.45 - s * 0.25, k);
    P.elbowL.rotation.x = -0.9; P.elbowR.rotation.x = -1.0;
    P.hips.rotation.x = (e.kind === 'runner' ? 0.45 : 0.25) + land * 0.3;
    P.hips.position.y = RIG.hips.y + Math.abs(c) * 0.06 - land * 0.22;
    tw(P.torso, 'y', s * 0.2); tw(P.torso, 'x', 0);   // shoulders counter the hips
    P.head.rotation.x = -P.hips.rotation.x * 0.6; P.head.rotation.y = -P.torso.rotation.y * 0.8;   // eyes stay on target
    return;
  }
  // standing poses: breathing, and every strike is a coil (shoulder back) and an uncoil (lunge onto the front foot)
  const br = Math.sin(e.t * 2.4 + e.ph);
  rotTo(P.legL, -0.25, k); rotTo(P.legR, 0.3, k); rotTo(P.kneeL, 0.35 + land, k); rotTo(P.kneeR, 0.2 + land, k); rotTo(P.hips, 0.12 + land * 0.3, k);
  P.hips.position.y += (RIG.hips.y - 0.03 + br * 0.01 - land * 0.22 - P.hips.position.y) * k;
  P.head.rotation.x = -0.05; tw(P.head, 'y', 0);
  tw(P.torso, 'x', br * 0.035);
  rotTo(P.armL, -0.4, k); rotTo(P.elbowL, -1.0, k);
  if (e.state === 'chargeWind') { rotTo(P.armR, -1.2, k); rotTo(P.elbowR, -0.3, k); rotTo(P.hips, 0.55, k); rotTo(P.legL, -0.7, k); rotTo(P.kneeL, 0.9, k); rotTo(P.legR, 0.5, k); rotTo(P.kneeR, 0.6, k); P.hips.position.y += (RIG.hips.y - 0.18 - P.hips.position.y) * k; tw(P.torso, 'y', 0); }
  else if (e.state === 'windup') {
    const f = Math.min(1, e.t / e.windDur), q = smooth(f);
    rotTo(P.armR, -2.9 * q - 0.4 * (1 - q), k); rotTo(P.elbowR, -0.4, k); rotTo(P.hips, -0.1 - 0.12 * q, k);
    tw(P.torso, 'y', -0.55 * q); rotTo(P.armL, -0.9 * q - 0.4, k); rotTo(P.legR, 0.45, k); rotTo(P.kneeL, 0.5, k);
    if (f > 0.8) tw(P.torso, 'y', -0.55 + Math.sin(e.t * 60) * 0.04, 1);   // a tremor of tension just before the strike
  }
  else if (e.state === 'recover') {
    const kk = 1 - Math.exp(-dt * 30);
    rotTo(P.armR, -0.15, kk); rotTo(P.elbowR, -0.1, k); rotTo(P.hips, 0.45, k); tw(P.torso, 'y', 0.45, kk);
    rotTo(P.legL, -0.75, kk); rotTo(P.kneeL, 0.65, kk); rotTo(P.legR, 0.5, k); rotTo(P.armL, 0.4, k);
  }
  else if (e.state === 'throw') { const f = e.t / 0.45; rotTo(P.armR, f < 0.7 ? 1.4 : -1.7, f < 0.7 ? k : 1 - Math.exp(-dt * 30)); rotTo(P.elbowR, -0.5, k); tw(P.torso, 'y', f < 0.7 ? -0.5 : 0.4, f < 0.7 ? k : 1 - Math.exp(-dt * 30)); }
  else { rotTo(P.armR, -0.6 + Math.sin(e.t * 2 + e.ph) * 0.05, k); rotTo(P.elbowR, -0.9, k); tw(P.torso, 'y', Math.sin(e.t * 0.7 + e.ph) * 0.08); }
}

// vanish in smoke and reappear behind (or beside) the player, already winding up a strike
function shadowStep(e) {
  fx.dust(new V3(e.x, 0, e.z), 18, 1.3 * e.s); sfx.swish(0.7);
  const f = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), a = rnd(-1, 1), r = reachOf(e) - 0.3;
  let x = player.pos.x - (f.x * Math.cos(a) - f.z * Math.sin(a)) * r, z = player.pos.z - (f.z * Math.cos(a) + f.x * Math.sin(a)) * r;
  const R = Math.hypot(x, z), M = world.arenaR - 1.5; if (R > M && !stage.explore) { x *= M / R; z *= M / R; }
  e.x = x; e.z = z; e.gate = null; e.root.rotation.y = Math.atan2(player.pos.x - x, player.pos.z - z);
  fx.dust(new V3(x, 0, z), 18, 1.3 * e.s);
  e.state = 'windup'; e.t = 0; e.windDur = Math.max(0.3, (e.d.wind ?? 0.6) * (stage.pace ?? 1)); sfx.warn(); floater('!', headPos(e), 'warn');
}
function chargeWind(e, dx, dz) {
  e.state = 'chargeWind'; e.t = 0; e.cdx = dx; e.cdz = dz;
  sfx.warn(); floater('!!', headPos(e), 'warn'); shake = Math.max(shake, 0.2);
}
const reachOf = e => e.d.ranged ? e.holdR : (e.d.reach ?? (e.d.boss ? 3.0 : 1.5)) + PLAYER_R;
function updEnemies(dt) {
  const px = player.pos.x, pz = player.pos.z;
  for (const e of enemies.slice()) {
    const d = e.d;
    if (d.dummy) { e.root.position.set(e.x, 0, e.z); continue; }   // training dummies just stand there
    if (e.stormed) { updStormed(e); continue; }
    if (e.downed) { updDowned(e, dt, px, pz); continue; }
    e.leapCD -= dt;
    if (e.air) {
      const A = e.air; A.t = Math.min(1, A.t + dt / A.dur); const t = A.t;
      e.x = A.x0 + (A.x1 - A.x0) * t; e.z = A.z0 + (A.z1 - A.z0) * t; e.y = Math.max(0, A.y0 * (1 - t) + A.h * 4 * t * (1 - t));
      const want = A.spins > 0 ? Math.atan2(A.x1 - A.x0, A.z1 - A.z0) : Math.atan2(px - e.x, pz - e.z);
      let da = want - e.root.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); e.root.rotation.y += da * Math.min(1, dt * 10);
      if (t >= 1) {
        e.air = null; e.y = 0; e.gate = null; e.P.hips.rotation.x = 0; e.landT = 0.25;
        fx.dust(new V3(e.x, 0, e.z), 10, e.s); sfx.thud(0.35);
        if (A.attack) { e.state = 'windup'; e.t = 0; e.windDur = Math.max(0.3, 0.42 * (stage.pace ?? 1)); sfx.warn(); floater('!', headPos(e), 'warn'); }
      }
      animEnemy(e, dt); e.root.position.set(e.x, e.y, e.z);
      continue;
    }
    let dx = px - e.x, dz = pz - e.z; const dist = Math.hypot(dx, dz) || 1e-3; dx /= dist; dz /= dist;
    if (e.stagger > 0) { e.stagger -= dt; e.x -= dx * e.knock * dt; e.z -= dz * e.knock * dt; }
    else if (e.state === 'run') {
      // walk in through the gate first, then hunt the player
      let tx = px, tz = pz;
      if (e.gate) { tx = e.gate.x; tz = e.gate.z; if (Math.hypot(tx - e.x, tz - e.z) < 1.5) e.gate = null; }
      let mx = tx - e.x, mz = tz - e.z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      if (!e.gate && dist <= reachOf(e)) { e.state = d.ranged ? 'aim' : 'ready'; e.t = 0; e.atkT = (d.ranged ? rnd(0.5, 1.2) : rnd(0.2, 0.5)) * (stage.pace ?? 1); }
      else {
        if (e.kind === 'runner' && !e.gate && dist > 4) { const w = Math.sin(e.t * 2.6 + e.ph) * 0.7; const ax = mx - mz * w, az = mz + mx * w, al = Math.hypot(ax, az); mx = ax / al; mz = az / al; }
        e.x += mx * e.speed * dt; e.z += mz * e.speed * dt;
        if (d.blink && !d.boss && !e.gate && e.leapCD <= 0 && dist > 4 && dist < 14) { shadowStep(e); e.leapCD = rnd(4, 6.5); continue; }
        if (e.kind === 'shogun' && e.leapCD <= 0 && dist > 4.5 && dist < 13) { chargeWind(e, dx, dz); e.leapCD = rnd(5, 7); }
        // runners (and the odd grunt) close the gap with a flying front flip into an attack
        if (!e.gate && e.leapCD <= 0 && ((e.kind === 'runner' && dist > 3.5 && dist < 7.5) || (e.kind === 'grunt' && dist > 5 && dist < 8 && Math.random() < dt * 0.6))) {
          leap(e, px - dx * (reachOf(e) - 0.2), pz - dz * (reachOf(e) - 0.2), 1.7, 0.62, 1, true); e.leapCD = rnd(4, 7);
        }
      }
    } else {
      // engaged: chase again if the player got away
      if ((e.state === 'ready' || e.state === 'aim') && dist > reachOf(e) * (d.ranged ? 1.4 : 1.2)) { e.state = 'run'; e.t = 0; }
      if (d.ranged && e.state === 'aim' && dist < 5.5) {
        if (e.leapCD <= 0) {    // archers backflip out of reach
          let tx = e.x - dx * 5.5, tz = e.z - dz * 5.5; const r = Math.hypot(tx, tz), R = world.arenaR - 1.5; if (r > R && !stage.explore) { tx *= R / r; tz *= R / r; }
          leap(e, tx, tz, 1.7, 0.7, -1); e.leapCD = rnd(3.5, 5); continue;
        }
        e.x -= dx * 2.2 * dt; e.z -= dz * 2.2 * dt;
      }
      if (e.state === 'ready' || e.state === 'aim') {
        e.atkT -= dt;
        if (e.atkT <= 0) {
          e.t = 0;
          if (e.state === 'aim') e.state = 'throw';
          else { e.state = 'windup'; e.windDur = e.npc ? Math.max(0.26, 0.5 - 0.05 * e.npc.rank) : Math.max(0.3, (d.wind ?? (d.boss ? 1.0 : 0.72)) * (stage.pace ?? 1)); sfx.warn(); floater('!', headPos(e), 'warn'); }
        }
      } else if (e.state === 'windup') {
        if (e.t >= e.windDur) {
          e.state = 'recover'; e.t = 0; sfx.swish(0.6);
          if (d.boss || d.heavy) { shake = Math.max(shake, d.boss ? 0.8 : 0.5); sfx.thud(d.boss ? 2 : 1.2); if (d.heavy) fx.dust(new V3(e.x + dx * 1.4, 0, e.z + dz * 1.4), 14, 1.2); }
          const inReach = dist <= reachOf(e) + 0.75;
          if (inReach && player.dashT <= 0 && player.y < 0.9) hurtPlayer(e.npc ? (e.npc.rank >= 4 ? 2 : 1) : blow(d));
          else if (inReach && T - Math.max(player.dashAt ?? -9, player.jumpAt ?? -9) < PERFECT_WIN) perfectDodge(e);   // dashed or jumped at the last moment
          else { floater('DODGED', headPos(e), ''); if (tut) tut.flags.dodge = true; }
        }
      } else if (e.state === 'chargeWind') {
        if (e.t >= 0.75) { e.state = 'charging'; e.t = 0; e.hitDone = false; sfx.swish(1.2); shake = Math.max(shake, 0.3); }
      } else if (e.state === 'charging') {   // a straight, unstoppable rush along the telegraphed line
        e.x += e.cdx * 15 * dt; e.z += e.cdz * 15 * dt;
        if (Math.random() < dt * 30) fx.dust(new V3(e.x, 0, e.z), 2, 0.8);
        if (!e.hitDone && dist < d.w + PLAYER_R + 0.6) { e.hitDone = true; if (player.dashT <= 0 && player.y < 0.9) hurtPlayer(blow(d)); else floater('DODGED', headPos(e), ''); }
        if (e.t >= 0.55) { e.state = 'recover'; e.t = 0; if (!e.hitDone && tut) tut.flags.dodge = true; }
      } else if (e.state === 'recover') {
        if (e.t >= (e.npc ? 0.3 : 0.45)) { e.state = 'ready'; e.atkT = e.npc ? rnd(0.1, 0.55 - 0.07 * e.npc.rank) : rnd(0.8, 1.4) * (d.boss ? 1.3 : 1) * (stage.pace ?? 1); }
      } else if (e.state === 'throw') {
        if (e.t >= 0.45) { throwStar(e); e.state = 'aim'; e.t = 0; e.atkT = rnd(2.2, 3.2) * (stage.pace ?? 1); }
      }
    }
    // keep apart from each other and from the player
    for (const o of enemies) {
      if (o === e) continue;
      const ox = e.x - o.x, oz = e.z - o.z, rr = d.w + o.d.w + 0.15, l = Math.hypot(ox, oz);
      if (l < rr && l > 1e-4) { const k = (rr - l) * 0.5; e.x += ox / l * k; e.z += oz / l * k; }
    }
    { const ox = e.x - px, oz = e.z - pz, rr = d.w + PLAYER_R + 0.1, l = Math.hypot(ox, oz); if (l < rr && l > 1e-4) { e.x += ox / l * (rr - l); e.z += oz / l * (rr - l); } }
    if (stage.explore) { const q = { x: e.x, z: e.z }; world.collide(q, d.w); e.x = q.x; e.z = q.z; }
    else if (!e.gate) {
      for (const c of world.colliders) { const ox = e.x - c.x, oz = e.z - c.z, rr = c.r + d.w, l = Math.hypot(ox, oz); if (l < rr && l > 1e-4) { e.x += ox / l * (rr - l); e.z += oz / l * (rr - l); } }
      const r = Math.hypot(e.x, e.z), R = world.arenaR - d.w * 0.5; if (r > R) { e.x *= R / r; e.z *= R / r; }
    }
    if (d.boss) {
      e.sumT -= dt;
      if (e.sumT <= 0 && enemies.length < 8 + Math.floor((stage.hard || 0) * 6)) {   // each boss calls its own help
        e.sumT = e.kind === 'shadow' ? rnd(8, 10) : rnd(7, 9);
        const call = e.kind === 'shogun' ? ['samurai', 'archer'] : e.kind === 'shadow' ? ['shade', 'shade'] : ['grunt', 'grunt'];
        call.forEach((k, i) => { const a = Math.atan2(e.x - px, e.z - pz) + (i ? 0.7 : -0.7), m = spawnEnemy(k, e.x + Math.sin(a) * 2.5, e.z + Math.cos(a) * 2.5, true); if (k === 'shade') fx.dust(new V3(m.x, 0, m.z), 16, 1.2); });
        if (e.kind === 'shadow') sfx.swish(0.8); else sfx.roar();
      }
      if (e.kind === 'shadow' && (e.state === 'run' || e.state === 'ready')) { e.blinkT -= dt; if (e.blinkT <= 0) { e.blinkT = rnd(3.5, 5); shadowStep(e); } }
    }
    // face the player (or the gate while entering)
    const want = e.gate ? Math.atan2(e.gate.x - e.x, e.gate.z - e.z) : e.state === 'charging' || e.state === 'chargeWind' ? Math.atan2(e.cdx, e.cdz) : Math.atan2(px - e.x, pz - e.z);
    let da = want - e.root.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
    e.root.rotation.y += da * Math.min(1, dt * 8);
    animEnemy(e, dt);
    e.root.position.set(e.x, e.y, e.z);
  }
}
const headPos = e => new V3(e.x, e.y + e.d.h + 0.15, e.z);
const bodyCenter = e => new V3(e.x, e.y + e.d.h * 0.55, e.z);

/* ============ projectiles ============ */
const starTpl = () => enemyStar();
const headPt = () => new V3(player.pos.x, player.y + EYE - 0.15, player.pos.z);
function throwStar(e) {
  const p = new V3(e.x, e.d.h * 0.75, e.z);
  const target = headPt().addScaledVector(player.vel, 0.35).add(new V3(rnd(-0.3, 0.3), rnd(-0.3, 0.1), rnd(-0.3, 0.3)));
  const T = Math.max(0.3, p.distanceTo(target) / 15);
  const v = target.clone().sub(p).divideScalar(T); v.y += 0.5 * 6 * T;
  const g = new THREE.Group(); const m = starTpl(); m.rotation.x = Math.PI / 2; g.add(m);
  g.scale.setScalar(1.6); g.position.copy(p); scene.add(g);
  eProj.push({ g, p, v, life: 4 });
  sfx.throwS();
}
function updEProj(dt) {
  const h = headPt();
  for (const pr of eProj.slice()) {
    pr.v.y -= 6 * dt; pr.p.addScaledVector(pr.v, dt); pr.life -= dt;
    pr.g.position.copy(pr.p); pr.g.rotation.y += dt * 22;
    if (pr.p.distanceTo(h) < 0.75) { removeEProj(pr); if (player.dashT > 0) floater('DODGED', pr.p, ''); else hurtPlayer(1); continue; }
    if (pr.life <= 0 || pr.p.y < 0) removeEProj(pr);
  }
}
function removeEProj(pr) { scene.remove(pr.g); eProj.splice(eProj.indexOf(pr), 1); }
function deflect(pr) {
  fx.sparks(pr.p, 16, 0xffd27a, 6); sfx.clang(); removeEProj(pr);
  runCoins += 2; floater('BLOCKED +2', pr.p, ''); score += 20;
}

function fireThrow(id, sx, sy) {
  if (id === 'horoku') { lobBomb(sx, sy); return; }
  const l = lvl(id), W = WEAP[id], n = W.count(l);
  const origin = throwOrigin();
  const base = rayDir(sx, sy);
  for (let k = 0; k < n; k++) {
    const dir = base.clone().applyAxisAngle(UP, (k - (n - 1) / 2) * 0.06);
    // aim assist: snap to the enemy the ray passes closest to
    let aim = camera.position.clone().addScaledVector(dir, 45), best = 0.9;
    for (const e of enemies) {
      const c = bodyCenter(e), toC = c.clone().sub(camera.position), t = toC.dot(dir);
      if (t < 0) continue;
      const off = toC.clone().addScaledVector(dir, -t).length() / (e.d.w * 2.2);
      if (off < best) { best = off; aim = c; }
    }
    const v = aim.clone().sub(origin).normalize().multiplyScalar(id === 'kunai' ? 52 : 40);
    const g = new THREE.Group(); let spin;
    if (id === 'shuriken') { const tilt = new THREE.Group(); tilt.rotation.x = -Math.PI / 2; spin = shurikenMesh(); spin.scale.setScalar(1.5); tilt.add(spin); g.add(tilt); g.quaternion.setFromUnitVectors(new V3(0, 0, -1), v.clone().normalize()); }
    else { spin = kunaiMesh(); spin.scale.setScalar(1.5); g.add(spin); g.quaternion.setFromUnitVectors(YAX, v.clone().normalize()); }
    g.position.copy(origin); scene.add(g);
    pProj.push({ id, g, spin, p: origin.clone(), v, dmg: W.dmg(l), pierce: W.pierce(l), hit: new Set(), life: 1.6, stuck: false });
  }
  jab = 0.18; sfx.throwS();
}
// Hōroku bomb: lobbed in an arc to the enemy nearest your aim (or the ground you point at, up to 30 m away)
const BOMB_G = 16;
function lobBomb(sx, sy) {
  const l = lvl('horoku'), origin = throwOrigin(), dir = rayDir(sx, sy);
  let aim = null, best = 0.9;
  for (const e of enemies) {
    const c = bodyCenter(e), toC = c.clone().sub(camera.position), t = toC.dot(dir); if (t < 0) continue;
    const off = toC.clone().addScaledVector(dir, -t).length() / (e.d.w * 2.2); if (off < best) { best = off; aim = new V3(e.x, 0.5, e.z); }
  }
  if (!aim) { const t = dir.y < -0.02 ? -camera.position.y / dir.y : 30; aim = camera.position.clone().addScaledVector(dir, Math.min(30, t)); aim.y = 0; }
  const dx = aim.x - origin.x, dz = aim.z - origin.z, d = Math.min(30, Math.hypot(dx, dz)), k = d / (Math.hypot(dx, dz) || 1), ft = clamp(d / 17, 0.35, 1.1);
  const v = new V3(dx * k / ft, (aim.y - origin.y + 0.5 * BOMB_G * ft * ft) / ft, dz * k / ft);
  const spin = horokuMesh(); spin.scale.setScalar(1.6); const g = new THREE.Group(); g.add(spin); g.position.copy(origin); scene.add(g);
  pProj.push({ id: 'horoku', g, spin, p: origin.clone(), v, dmg: WEAP.horoku.dmg(l), r: WEAP.horoku.radius(l), hit: new Set(), life: 2.5, stuck: false });
  jab = 0.18; sfx.throwS();
}
// the blast: everything in the radius is cut along a random plane (bosses and duelling rivals take the damage instead)
function explode(pr) {
  removePProj(pr);
  const p = pr.p.clone(); p.y = Math.max(0.3, p.y); const sid = ++stroke;
  fx.sparks(p, 70, 0xffb35a, 9); fx.dust(new V3(p.x, 0, p.z), 30, pr.r * 0.6); fx.flash(p, UP, new V3(1, 0, 0), pr.r * 1.6, 0xffb35a);
  sfx.thud(1.6); sfx.slice(1.4); shake = Math.max(shake, 0.6); hitStop = Math.max(hitStop, 0.05);
  const randPlane = c => new THREE.Plane().setFromNormalAndCoplanarPoint(new V3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)).normalize(), c);
  for (const e of enemies.slice()) {
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) - e.d.w; if (d > pr.r || e.stormed) continue;
    const c = bodyCenter(e), push = new V3(dx, 0.6, dz).normalize(), pl = randPlane(c);
    if (!e.d.boss && !e.npc && (e.hp <= pr.dmg || e.downed)) killEnemy(e, pl, push, { stroke: sid, weapon: 'horoku', extra: 1 });
    else hurtEnemy(e, pr.dmg, c, push);
  }
  let n = 0;
  for (const b of phys.all()) {
    if (b.sink || b.stroke === sid || n >= 8) continue;
    const c = phys.center(b); if (c.distanceTo(p) > pr.r) continue;
    cutBody(b, randPlane(c), c.clone().sub(p).setY(0.5).normalize(), sid); n++;
  }
  for (const q of eProj.slice()) if (q.p.distanceTo(p) < pr.r) removeEProj(q);   // stars caught in the blast
  if (stage && stage.explore) for (const h of world.propsNear(p, pr.r).filter(h => !h.prop.queued).slice(0, 4)) {
    h.prop.queued = true; propQ.push({ h, plane: randPlane(h.box.getCenter(new V3())), push: h.box.getCenter(new V3()).sub(p).setY(0).normalize(), sid });
  }
}
function updPProj(dt) {
  const a = new V3(), b = new V3();
  for (const pr of pProj.slice()) {
    pr.life -= dt;
    if (pr.stuck) { if (pr.life <= 0) removePProj(pr); continue; }
    if (pr.id === 'horoku') {   // bursts on the first enemy it reaches, on the ground, or when its fuse runs out
      pr.v.y -= BOMB_G * dt; pr.p.addScaledVector(pr.v, dt); pr.g.position.copy(pr.p); pr.spin.rotation.x += dt * 9; pr.spin.rotation.z += dt * 5;
      if (pr.p.y < 0.08 || pr.life <= 0 || enemies.some(e => Math.hypot(e.x - pr.p.x, e.z - pr.p.z) < e.d.w + 0.35 && pr.p.y < e.y + e.d.h)) explode(pr);
      continue;
    }
    a.copy(pr.p); pr.v.y -= 2 * dt; pr.p.addScaledVector(pr.v, dt); b.copy(pr.p);
    pr.g.position.copy(pr.p);
    if (pr.id === 'shuriken') pr.spin.rotation.z += dt * 30; else pr.spin.rotation.y += dt * 8;
    for (const e of enemies.slice()) {
      if (pr.hit.has(e)) continue;
      const hx = b.x - a.x, hz = b.z - a.z, L2 = hx * hx + hz * hz || 1e-6;
      const t = clamp(((e.x - a.x) * hx + (e.z - a.z) * hz) / L2, 0, 1);
      const qx = a.x + hx * t, qz = a.z + hz * t, qy = a.y + (b.y - a.y) * t;
      if (Math.hypot(qx - e.x, qz - e.z) > e.d.w * 1.15 || qy < e.y || qy > e.y + e.d.h) continue;
      pr.hit.add(e);
      const q = new V3(qx, qy, qz), vd = pr.v.clone().normalize();
      let n;
      if (pr.id === 'shuriken') n = UP.clone().applyAxisAngle(vd, rnd(-0.45, 0.45));
      else n = new V3().crossVectors(vd, UP).normalize().applyAxisAngle(vd, rnd(-0.25, 0.25));
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, q);
      if (e.hp <= pr.dmg || e.downed || (pr.id === 'kunai' && e.d.armor)) killEnemy(e, plane, vd, { stroke: -2, weapon: pr.id });
      else hurtEnemy(e, pr.dmg, q, vd);
      if (--pr.pierce <= 0) { removePProj(pr); break; }
    }
    if (!pProj.includes(pr)) continue;
    for (const b of phys.all()) {
      if (b.sink || (pr.hitB && pr.hitB.has(b)) || !phys.bounds(b).containsPoint(pr.p)) continue;
      const vd = pr.v.clone().normalize();
      const n = pr.id === 'shuriken' ? UP.clone().applyAxisAngle(vd, rnd(-0.45, 0.45)) : new V3().crossVectors(vd, UP).normalize();
      const res = cutBody(b, new THREE.Plane().setFromNormalAndCoplanarPoint(n, pr.p), vd, -4);
      pr.hitB = pr.hitB || new Set(); pr.hitB.add(b); if (res) res.forEach(x => pr.hitB.add(x));
    }
    for (const h of propsAt(pr.p)) {
      const vd = pr.v.clone().normalize();
      const n = pr.id === 'shuriken' ? UP.clone().applyAxisAngle(vd, rnd(-0.45, 0.45)) : new V3().crossVectors(vd, UP).normalize();
      pr.hitB = pr.hitB || new Set(); for (const x of cutProp(h, new THREE.Plane().setFromNormalAndCoplanarPoint(n, pr.p), vd, -4)) pr.hitB.add(x);
    }
    if (pr.p.y < 0.03) { pr.stuck = true; pr.life = 2; pr.p.y = 0.03; fx.sparks(pr.p, 5, 0xffe0a0, 3); }
    else if (pr.life <= 0) removePProj(pr);
  }
}
function removePProj(pr) { scene.remove(pr.g); const i = pProj.indexOf(pr); if (i >= 0) pProj.splice(i, 1); }

/* ============ kusarigama fling ============ */
const fling = { on: false, t: 0, dur: 0.62, a: new V3(), b: new V3(), dist: 12, mesh: null, chain: null };
function buildFling() {
  fling.mesh = new THREE.Group(); const s = sickle(); s.scale.setScalar(2.2); s.position.y = -0.55; fling.mesh.add(s);
  fling.mesh.visible = false; scene.add(fling.mesh);
  fling.chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x777d86, metalness: 1, roughness: 0.4 }));
  fling.chain.visible = false; scene.add(fling.chain);
}
function doFling(x0, y0, x1, y1) {
  const id = 'kusarigama', l = lvl(id), W = WEAP[id];
  const sp = swipePlane(x0, y0, x1, y1); if (!sp) return;
  cds[id] = W.cd(l); stroke++;
  const ext = extendSeg(x0, y0, x1, y1, 0.35);
  const targets = findTargets(ext, W.range(l), stroke);
  let far = 9;
  for (const e of targets) {
    const dist = Math.hypot(e.x - player.pos.x, e.z - player.pos.z); far = Math.max(far, Math.hypot(e.x - camera.position.x, e.z - camera.position.z));
    const sid = stroke;
    after(0.08 + dist / W.range(l) * 0.24, () => {
      if (!enemies.includes(e)) return;
      if (e.hp <= W.dmg(l) || e.downed) killEnemy(e, sp.plane, sp.push, { stroke: sid, weapon: id }); else hurtEnemy(e, W.dmg(l), bodyCenter(e), sp.push);
    });
  }
  hitProjectiles(ext);
  after(0.22, () => { sliceBodies(ext, sp, W.range(l), stroke); if (stage && stage.explore) sliceProps(ext, sp, W.range(l), stroke); });
  fling.on = true; fling.t = 0; fling.a.copy(rayDir(x0, y0)); fling.b.copy(rayDir(x1, y1)); fling.dist = Math.min(W.range(l) + Math.hypot(camera.position.x - player.pos.x, camera.position.z - player.pos.z), far + 1);
  fling.mesh.visible = fling.chain.visible = true;
  sfx.swish(0.7); jab = 0.18;
}
function updFling(dt) {
  if (!fling.on) return;
  fling.t += dt / fling.dur;
  if (fling.t >= 1) { fling.on = false; fling.mesh.visible = fling.chain.visible = false; return; }
  const s = fling.t, r = fling.dist * Math.sin(Math.PI * Math.min(1, s * 1.05));
  const dir = fling.a.clone().lerp(fling.b, clamp(s * 1.3 - 0.15, 0, 1)).normalize();
  const p = camera.position.clone().addScaledVector(dir, r + 0.6);
  fling.mesh.position.copy(p); fling.mesh.rotation.set(s * 30, s * 7, 0);
  const h = throwOrigin();
  fling.chain.position.copy(h);
  const d = p.clone().sub(h); fling.chain.scale.set(1, d.length(), 1);
  fling.chain.quaternion.setFromUnitVectors(YAX, d.normalize());
}

/* ============ slicing ============ */
const _pv = new V3();
function toScreen(v) { _pv.copy(v).project(camera); if (_pv.z > 1) return null; return { x: (_pv.x + 1) / 2 * vw, y: (1 - _pv.y) / 2 * vh }; }
function rectOfPoints(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (const p of pts) { const s = toScreen(p); if (!s) continue; n++; x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
  return n ? { x0, y0, x1, y1 } : null;
}
function enemyRect(e) {
  const w = e.d.w, h = e.d.h, pts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [e.y, e.y + h]) pts.push(new V3(e.x + sx * w, y, e.z + sz * w * 0.8));
  return rectOfPoints(pts);
}
function boxRect(b) {
  const pts = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new V3(x, y, z));
  return rectOfPoints(pts);
}
function segRect(s, r) {
  let t0 = 0, t1 = 1; const dx = s[2] - s[0], dy = s[3] - s[1];
  const p = [-dx, dx, -dy, dy], q = [s[0] - r.x0, r.x1 - s[0], s[1] - r.y0, r.y1 - s[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else { const t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
  }
  return true;
}
function distPtSeg(px, py, s) {
  const dx = s[2] - s[0], dy = s[3] - s[1], L = dx * dx + dy * dy || 1;
  const t = clamp(((px - s[0]) * dx + (py - s[1]) * dy) / L, 0, 1);
  return Math.hypot(px - s[0] - dx * t, py - s[1] - dy * t);
}
function extendSeg(x0, y0, x1, y1, f) { const dx = x1 - x0, dy = y1 - y0; return [x0 - dx * f, y0 - dy * f, x1 + dx * f, y1 + dy * f]; }
function rayDir(x, y) { return new V3((x / vw) * 2 - 1, -(y / vh) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize(); }
function swipePlane(x0, y0, x1, y1) {
  const a = rayDir(x0, y0), b = rayDir(x1, y1);
  const n = new V3().crossVectors(a, b);
  if (n.lengthSq() < 1e-12) return null;
  n.normalize();
  return { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, camera.position), push: b.clone().sub(a).normalize() };
}
function findTargets(seg, range, sid) {
  const out = [];
  for (const e of enemies) {
    if (e.lastStroke === sid) continue;
    if (Math.hypot(e.x - player.pos.x, e.z - player.pos.z) > range + e.d.w) continue;
    const r = enemyRect(e);
    if (r && segRect(seg, r)) { e.lastStroke = sid; out.push(e); }
  }
  return out;
}
function hitProjectiles(seg) {
  for (const pr of eProj.slice()) { const s = toScreen(pr.p); if (s && distPtSeg(s.x, s.y, seg) < 42) deflect(pr); }
}
// one blade stroke segment (katana / naginata / storm)
function sliceSeg(seg, x0, y0, x1, y1, range, dmg, sid, weapon, bodies = true) {
  const sp = swipePlane(x0, y0, x1, y1); if (!sp) return 0;
  let kills = 0;
  for (const e of findTargets(seg, range, sid)) {
    const ctr = canCounter(e), hit = ctr ? (e.d.boss ? dmg * 3 : Math.max(dmg, e.hp)) : dmg;
    if (ctr) counterHit(e);
    const spot = !ctr && e.hp <= hit && canWound(e) ? woundSpot(e, sp.plane) : null;
    if (spot) woundEnemy(e, spot, sp.plane, sp.push);
    else if (e.hp <= hit || e.downed) { if (!ctr && !e.downed) cleanCut(e, sp.plane); killEnemy(e, sp.plane, sp.push, { stroke: sid, weapon }); kills++; }
    else hurtEnemy(e, hit, nearestOnPlane(bodyCenter(e), sp.plane), sp.push);
  }
  hitProjectiles(seg);
  if (bodies) sliceBodies(seg, sp, range, sid);
  if (stage && stage.explore) sliceProps(seg, sp, range, sid);
  return kills;
}
// corpses and severed pieces can always be cut again
// Explore: the blade cuts the scenery itself. A prop the stroke crosses is lifted out of the world as a loose body
// and split along the cut; trees, stalks, lanterns and wall segments come down, houses fall apart.
// Cuts are queued and done a couple per frame, nearest first, so a stroke through a whole grove doesn't stall a frame.
const PROP_CUTS_PER_FRAME = 2, MAX_STROKE_PROPS = 6;
let propQ = [];
function sliceProps(seg, sp, range, sid) {
  const hits = [];
  for (const h of world.propsNear(player.pos, range + 1.5)) {
    if (h.prop.queued) continue;
    const r = boxRect(h.box); if (r && segRect(seg, r)) hits.push([h.box.distanceToPoint(player.pos), h]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  for (const [, h] of hits.slice(0, MAX_STROKE_PROPS)) { h.prop.queued = true; propQ.push({ h, plane: sp.plane.clone(), push: sp.push.clone(), sid }); }
}
function updPropCuts() {
  for (let k = 0; k < PROP_CUTS_PER_FRAME && propQ.length; k++) { const q = propQ.shift(); q.h.prop.queued = false; cutProp(q.h, q.plane, q.push, q.sid); }
}
// thrown weapons cut whatever scenery they fly into
const propsAt = p => stage && stage.explore ? world.propsNear(p, 0.5).filter(h => h.box.containsPoint(p)) : [];
// returns the loose bodies the prop became
function cutProp(h, plane, push, sid) {
  const items = world.cutProp(h.prop, h.ox, h.oz); if (!items || !items.length) return [];
  const big = h.box.getSize(new V3()).length(), b = phys.addRigid(chunkFrom(items), new V3(), new V3(), sid);
  b.scenery = true;   // stays where it falls (see ragdoll.js), its pieces too
  const at = nearestOnPlane(h.box.getCenter(new V3()), plane), k = Math.min(1, 2 / big);
  const res = phys.cut(b, plane, push, sid);
  if (!res) { b.v.copy(push).multiplyScalar(2 * k).add(new V3(0, k, 0)); b.w.set(push.z, 0, -push.x).multiplyScalar(2.5 * k); }   // missed the middle: knocked over
  else for (const p of res) settleCut(p, plane, push);
  const stone = h.prop.cap === 'stone';
  if (stone) { sfx.clang(); fx.sparks(at, 18); } else sfx.slice(0.7);
  fx.flash(at, plane.normal, push, Math.min(6, big * 0.6), 0x120e0b); fx.dust(new V3(at.x, 0, at.z), 8, Math.min(2, 0.4 + big * 0.12));
  shake = Math.max(shake, Math.min(0.6, big * 0.04)); score += 5;
  errandStep('cut'); gflag('prop');
  return res || [b];
}
// big pieces don't fly: what still stands on the ground stays as a stump (or leans away from a vertical cut),
// what was above the cut topples over in the stroke's direction; small pieces keep the slicer's scatter
function settleCut(p, plane, push) {
  const bx = phys.bounds(p).clone(), size = bx.getSize(new V3()).length(); if (size < 1.5) return;
  const n = plane.normal.clone().multiplyScalar(Math.sign(plane.distanceToPoint(bx.getCenter(new V3()))) || 1), tip = Math.min(1, 1.5 / size);
  const fwd = push.clone().setY(0); if (fwd.lengthSq() < 1e-4) fwd.set(n.x, 0, n.z); fwd.normalize();
  if (bx.min.y < 0.15) { p.v.set(n.x, 0, n.z).multiplyScalar(0.4); p.w.crossVectors(UP, n).multiplyScalar(tip); }
  else { p.v.copy(fwd).multiplyScalar(1.2).addScaledVector(n, 0.4); p.v.y = Math.min(p.v.y, 0.3); p.w.crossVectors(UP, fwd).multiplyScalar(1.5 * tip); }
}
// one stroke cuts at most MAX_STROKE_CUTS bodies, nearest first: hacking through a pile stays one frame's work
const MAX_STROKE_CUTS = 10;
function sliceBodies(seg, sp, range, sid) {
  const hits = [];
  for (const b of phys.all()) {
    if (b.stroke === sid || b.sink) continue;
    const c = phys.center(b), d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
    if (d > range + 1.5) continue;
    const r = boxRect(phys.bounds(b));
    if (r && segRect(seg, r)) hits.push([d, b]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  for (const [, b] of hits.slice(0, MAX_STROKE_CUTS)) cutBody(b, sp.plane, sp.push, sid);
}
const nearestOnPlane = (p, plane) => plane.projectPoint(p, new V3());

/* ============ skill: counters, perfect dodges, clean cuts ============ */
// Timing and precision pay, mashing doesn't:
// - COUNTER: cut a foe in the late part of his wind-up (the red ! has been up a while), or while a perfect dodge has
//   left him open. It cuts through anything (bosses take triple damage but follow through with the blow). Earlier
//   hits land but no longer stop the attack: he follows through, so watch the tell.
// - PERFECT DODGE: dash or jump just before a blow that would have hit lands. Time slows and he is left open.
// - CLEAN CUT: a killing cut straight through the middle of the body, not a graze.
const COUNTER_FROM = 0.55, PERFECT_WIN = 0.22, OPEN_FOR = 1.2;
const lateWindup = e => e.state === 'windup' && e.t >= e.windDur * COUNTER_FROM;
const canCounter = e => !e.npc && !e.downed && (lateWindup(e) || (e.openT || 0) > T);
function counterHit(e) {
  stats.counters++; e.openT = 0;
  floater('COUNTER!', headPos(e), 'big'); sfx.clang(); fx.sparks(bodyCenter(e), 26, 0xfff2c0, 5);
  slowmo(0.3, 0.45); hitStop = Math.max(hitStop, 0.06); shake = Math.max(shake, 0.35);
  ult = Math.min(100, ult + 10 * ultRate()); runCoins += 3; score += 75;
  if (e.state === 'windup' && !e.d.boss) { e.state = 'recover'; e.t = 0; }   // knocked out of the attack (bosses follow through)
}
function perfectDodge(e) {
  stats.perfect++; e.openT = T + OPEN_FOR;
  floater('PERFECT DODGE', headPos(e), 'big'); sfx.swish(1.2);
  slowmo(0.3, 0.6); fovKick = Math.max(fovKick, 8);
  ult = Math.min(100, ult + 15 * ultRate()); runCoins += 2; score += 50;
  if (tut) tut.flags.dodge = true;
}
function cleanCut(e, plane) {
  if (Math.abs(plane.distanceToPoint(bodyCenter(e))) > e.d.w * 0.3 * e.s) return;
  stats.clean++; floater('CLEAN CUT', headPos(e), ''); score += 30; runCoins += 1; ult = Math.min(100, ult + 3 * ultRate());
}

/* ============ wounds & finishers ============ */
// A lethal blow that only clips the legs (low cut) or an arm (glancing side cut) cripples instead:
// the enemy drops to his knees, bleeding and harmless, and can be executed with a finisher (Q / FINISH)
// for bonus rewards. Any further hit kills him outright; left alone he bleeds out after a while.
const FINISH_R = 3.6, BLEED_OUT = 20;
let finish = null;
const canWound = e => !e.npc && !e.d.boss && !e.d.dummy && !e.air && !e.downed && (!stage.tutorial || (tut && tut.wounds));
function woundSpot(e, plane) {
  const c = bodyCenter(e), off = plane.distanceToPoint(c), n = plane.normal;
  const p = c.clone().addScaledVector(n, -off);
  if (Math.abs(n.y) > 0.6 && p.y < e.y + e.d.h * 0.42) return 'legs';
  if (Math.abs(n.y) < 0.6 && Math.abs(off) > e.d.w * 0.5) return 'arm';
  return null;
}
function woundEnemy(e, spot, plane, push) {
  e.downed = { t: 0, drip: 0, spot }; e.state = 'downed'; e.stagger = 0; e.t = 0;
  const at = nearestOnPlane(bodyCenter(e), plane);
  fx.burst(at, push, 26, 0.9); fx.flash(at, plane.normal, push, e.d.w * 3);
  sfx.slice(0.8); shake = Math.max(shake, 0.2); hitStop = Math.max(hitStop, 0.05);
  floater(spot === 'legs' ? 'CRIPPLED' : 'WOUNDED', headPos(e), '');
  score += 25;
  if (tut) tut.flags.wound = true;
}
function updDowned(e, dt, px, pz) {
  if (e.frozen) { e.root.position.set(e.x, e.y, e.z); return; }
  const D = e.downed; D.t += dt; D.drip -= dt;
  if (D.drip <= 0) { D.drip = rnd(0.25, 0.5); if (fx.blood) fx.burst(new V3(e.x, e.y + (D.spot === 'legs' ? 0.25 : 0.8) * e.s, e.z), UP, 3, 0.35); else fx.sparks(new V3(e.x, e.y + 1.25 * e.s, e.z), 3, 0xffe27a, 1.2); }   // family mode: dizzy stars
  if (!e.finishing) { let da = Math.atan2(px - e.x, pz - e.z) - e.root.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); e.root.rotation.y += da * Math.min(1, dt * 2); }
  // on his knees: thighs upright, shins flat behind, head bowed (lower still while being executed)
  const P = e.P, k = 1 - Math.exp(-dt * 10), f = e.finishing ? 1 : 0, lean = 0.2 + 0.15 * f;
  P.hips.position.y += (RIG.hips.y - 0.54 - P.hips.position.y) * k;
  rotTo(P.hips, lean, k); rotTo(P.legL, -lean + 0.05, k); rotTo(P.legR, -lean - 0.08, k); rotTo(P.kneeL, 1.55, k); rotTo(P.kneeR, 1.45, k);
  // every few seconds he tries to rise and fails; a cut arm hangs while the other hand clutches the wound
  const st = f ? 0 : Math.pow(Math.max(0, Math.sin(D.t * 0.9 + e.ph)), 6);
  P.hips.position.y += st * 0.1 * k;
  rotTo(P.head, 0.35 + 0.3 * f - st * 0.45 + Math.sin(D.t * 3) * 0.04, k);
  rotTo(P.armL, D.spot === 'arm' ? -0.75 : -0.15 - st * 0.5, k); rotTo(P.elbowL, D.spot === 'arm' ? -1.5 : -0.5, k); rotTo(P.armR, D.spot === 'arm' ? 0.15 : -0.2, k); rotTo(P.elbowR, -0.2, k);
  P.armL.rotation.z += ((D.spot === 'arm' ? 0.7 : 0) - P.armL.rotation.z) * k;
  P.torso.rotation.y *= 1 - k; P.torso.rotation.x += (Math.sin(D.t * 2.6) * 0.05 - P.torso.rotation.x) * k; P.hips.rotation.z *= 1 - k; P.head.rotation.y *= 1 - k;
  e.root.position.set(e.x, e.y, e.z);
  if (D.t > BLEED_OUT && !e.finishing) faint(e);
}
// left alone too long, a dazed enemy faints and vanishes in a puff of smoke
function faint(e) {
  const i = enemies.indexOf(e); if (i < 0) return;
  enemies.splice(i, 1); scene.remove(e.root);
  fx.dust(new V3(e.x, 0, e.z), 18, 1.1); fx.dust(new V3(e.x, 0.6, e.z), 10, 0.6); sfx.swish(0.6);
  addKill(e, headPos(e), -4);
}
function finishTarget() {
  if (state !== 'play' || finish) return null;
  let best = null, bd = airborne() ? AIR_FIN_R : FINISH_R;
  for (const e of enemies) if (e.downed && !e.finishing && !e.stormed) { const d = Math.hypot(e.x - player.pos.x, e.z - player.pos.z) - e.d.w; if (d < bd) { bd = d; best = e; } }
  return best;
}
// Cinematic finishers (~2.75 s, real time). Every variant shares the frame: step in, letterbox + side camera,
// a wind-up, the cut(s), a held follow-through, a blood-flick (chiburi) and a smooth hand-back.
// Each variant brings its own hero keyframes, camera swing and cut. A random one plays, never the same twice in a row.
const FIN_END = 2.75;
let cineW = 0, lastFin = -1;
// hero keyframe: [time, armR.x, armR.z, elbowR, armL.x, armL.z, elbowL, hips, drop, footL.z, footR.z, twist, head]
// armR holds the blade; for armR -z swings inward, for armL +z swings inward (so ±z pairs bring the hands together).
// Legs are solved by IK from the foot positions (z forward of the hips), so stances stay planted on the ground.
const K_IN = [0.0, -0.7, 0, -0.9, 0.2, 0, -0.8, 0.35, 0.05, -0.3, 0.35, 0, -0.2];          // dashing in
const K_SET = [0.3, -1.0, -0.3, -0.6, -1.0, 0.3, -0.6, 0.12, 0.08, -0.3, 0.3, 0, 0.15];     // planted, both hands on the hilt
const K_FLICK = [2.3, -0.6, 1.0, -0.15, 0.1, 0, -0.5, 0.12, 0.08, -0.3, 0.3, 0.2, 0.1];     // chiburi: blood flicked off to the side
const K_READY = [FIN_END, -0.7, 0, -0.9, 0, 0, -0.8, 0.12, 0.02, -0.15, 0.15, 0, 0];
const hold = (k, t) => [t, ...k.slice(1)];
// cuts in the sword hand's side: high over the shoulder -> low across the body (s = +1 right shoulder, -1 left)
const K_HIGH = s => s > 0 ? [0, -2.5, 0.35, -1.2, -2.4, 0.75, -1.3, 0, 0.08, -0.3, 0.3, 0.5, 0.1] : [0, -2.4, -0.75, -1.2, -2.5, -0.35, -1.2, 0, 0.1, -0.3, 0.35, -0.5, 0.1];
const K_LOW = s => s > 0 ? [0, -0.85, -0.75, -0.1, -0.9, -0.15, -0.2, 0.35, 0.2, -0.3, 0.5, -0.6, 0.35] : [0, -0.9, 0.65, -0.1, -0.85, 0.35, -0.15, 0.35, 0.2, -0.3, 0.5, 0.55, 0.35];
const KAI_UP = [1.25, -2.95, -0.22, -0.5, -2.95, 0.22, -0.5, -0.08, 0.06, -0.3, 0.3, 0, 0.1];   // blade raised overhead, two hands
const KAI_CUT = [1.35, -1.0, -0.32, -0.12, -1.0, 0.32, -0.12, 0.35, 0.2, -0.3, 0.5, 0, 0.35];   // the cut, lunging onto the front foot
const IAI_SET = [0.3, -0.35, -0.6, -1.5, -0.2, 0.45, -1.2, 0.3, 0.26, -0.45, 0.4, 0.5, -0.05];  // crouched, hand on the hilt at the hip
const IAI_CUT = [1.22, -1.5, 1.15, -0.05, 0.35, -0.25, -0.3, 0.3, 0.22, -0.5, 0.45, -0.6, 0];    // drawn and swept wide: zanshin
// enemy-relative cut geometry
const finSide = e => new V3(Math.cos(e.root.rotation.y), 0, -Math.sin(e.root.rotation.y));
const finNeck = e => { e.root.updateMatrixWorld(true); return e.P.head.getWorldPosition(new V3()).add(new V3(0, 0.07 * e.s, 0)); };
const finChest = e => { e.root.updateMatrixWorld(true); return e.P.torso.getWorldPosition(new V3()).add(new V3(0, 0.22 * e.s, 0)); };
const finPlane = (n, p) => new THREE.Plane().setFromNormalAndCoplanarPoint(n.normalize(), p);
const diag = (e, s) => finSide(e).multiplyScalar(0.75 * s).add(new V3(0, 0.66, 0));   // s = +1 / -1: which shoulder

const FINISHERS = [
  { name: 'KABUTOWARI', kanji: '兜割り', strike: 1.25, fast: [1.25], cam: [1.2, 0.3, 0.35],   // overhead two-handed helmet-splitter: cleaves him top to bottom
    keys: [K_IN, K_SET, KAI_UP, KAI_CUT, hold(KAI_CUT, 2.0), K_FLICK, K_READY],
    events: [[1.31, e => { const p = finNeck(e); finKill(e, [finPlane(finSide(e).add(new V3(0, 0.1, 0)), p)], finSide(e)); fx.burst(p, UP, 40, 1.2); }]] },
  { name: 'IAIGIRI', kanji: '居合斬り', strike: 1.15, fast: [1.15], cam: [1.55, 0.15, 0.9], dash: [1.16, 0.09],   // crouched quick-draw, dash straight past; he only falls after
    keys: [K_IN, IAI_SET, [1.15, -0.35, -0.62, -1.55, -0.2, 0.45, -1.2, 0.34, 0.3, -0.45, 0.4, 0.58, -0.05], IAI_CUT, hold(IAI_CUT, 1.95),
      [2.35, -0.9, 0.5, -0.5, -0.2, 0.2, -0.8, 0.15, 0.08, -0.3, 0.3, 0, 0], K_READY], sheathed: [[0, 1.16]],
    events: [[1.19, e => { finMark(e, [finPlane(UP.clone().addScaledVector(finSide(e), 0.12), finChest(e))]); sfx.swish(1.4); slowmo(0.1, 0.5); }],
      [1.9, e => finKill(e, e.finPlanes, finSide(e).add(new V3(0, 0.4, 0)))]] },
  { name: 'KESAGIRI', kanji: '袈裟斬り', strike: 1.15, fast: [1.15], cam: [1.05, 0.25, 0.45],   // diagonal shoulder-to-hip cleave
    keys: [K_IN, K_SET, hold(K_HIGH(1), 1.15), hold(K_LOW(1), 1.27), hold(K_LOW(1), 1.95), K_FLICK, K_READY],
    events: [[1.22, e => finKill(e, [finPlane(diag(e, 1), finChest(e))], diag(e, 1).add(finSide(e)))]] },
  { name: 'JUMONJI', kanji: '十文字', strike: 0.95, fast: [0.95, 1.3], cam: [1.35, 0.3, 0.5],   // two crossing cuts burn in, then he falls in four
    keys: [K_IN, K_SET, hold(K_HIGH(1), 0.95), hold(K_LOW(1), 1.05), hold(K_HIGH(-1), 1.3), hold(K_LOW(-1), 1.4), hold(K_LOW(-1), 1.95), K_FLICK, K_READY],
    events: [[1.0, e => { finMark(e, [finPlane(diag(e, 1), finChest(e))]); sfx.swish(1.1); }],
      [1.35, e => { finMark(e, [...e.finPlanes, finPlane(diag(e, -1), finChest(e))]); sfx.swish(1.3); slowmo(0.12, 0.5); }],
      [1.9, e => finKill(e, e.finPlanes, UP.clone())]] },
];

// Aerial finishers: pressing Q in mid-air near a crippled enemy (from further away than on foot) launches
// the hero into an acrobatic kill. They are carried along `path` ([time, along, height, ease]; along 0..1 runs
// from the jump point to the near side of the target, 1..2 on past him; height null = where the jump was;
// ease 0 = smooth, 1 = falling/accelerating, 2 = rising/decelerating) and posed from their own keyframes:
// [time, armR.x, armR.z, elbowR, armL.x, armL.z, elbowL, spin, drop, legL, kneeL, legR, kneeR, plant, twist, head, yaw]
// spin flips the whole body around the hips (2π = one front flip), yaw spins it about the vertical (corkscrews),
// and plant blends the free leg angles into the planted IK crouch for the landing.
const AIR_FIN_R = 7.5, TAU = Math.PI * 2;
const A_LAUNCH = [0, -0.9, -0.2, -1.2, -0.6, 0.3, -1.0, 0.25, 0, -0.9, 1.4, 0.3, 0.6, 0, 0, -0.15, 0];
const A_TUCK = (t, spin, yaw = 0) => [t, -1.4, -0.3, -1.6, -1.2, 0.3, -1.6, spin, 0, -1.5, 2.2, -1.5, 2.2, 0, 0, 0.3, yaw];
const A_LAND = (t, spin, yaw = 0) => [t, -1.5, 1.15, -0.05, 0.35, -0.25, -0.3, spin + 0.3, 0.34, -1.2, 2, -0.2, 1.6, 1, -0.6, 0, yaw];   // crouched, blade swept out: zanshin
const A_FLICK = (t, spin, yaw = 0) => [t, -0.6, 1.0, -0.15, 0.1, 0, -0.5, spin + 0.12, 0.08, -0.4, 0.5, 0.1, 0.4, 1, 0.2, 0.1, yaw];
const A_READY = (t, spin, yaw = 0) => [t, -0.7, 0, -0.9, 0, 0, -0.8, spin + 0.12, 0.02, -0.2, 0.3, 0.1, 0.2, 1, 0, 0, yaw];
const finHips = e => { e.root.updateMatrixWorld(true); return e.P.hips.getWorldPosition(new V3()).add(new V3(0, 0.12 * e.s, 0)); };
const tilted = (e, k) => UP.clone().addScaledVector(finSide(e), rnd(-k, k)).add(new V3(rnd(-k, k), 0, rnd(-k, k)));
function airLand(big = 1) {
  fx.dust(new V3(player.pos.x, 0, player.pos.z), 22, 1.4 * big); sfx.thud(0.9 * big);
  shake = Math.max(shake, 0.55 * big); landDip = 0.14; fovKick = -6;
}
const AIR_FINISHERS = [
  { name: 'HIEN', kanji: '飛燕', air: true, strike: 1.12, fast: [0.97], cam: [1.35, 0.25, 0.4], camD: [5.4, 0.2, -1.6], flickAt: 2.15, end: 2.65,   // swallow dive: a front flip to the top of the arc, then straight down through him
    path: [[0, 0, null], [0.5, 0.45, 3.3, 2], [0.95, 0.62, 3.55], [1.12, 1, 0, 1], [2.65, 1, 0]],
    keys: [A_LAUNCH, A_TUCK(0.4, 0.6), A_TUCK(0.82, TAU), [0.97, -2.95, -0.22, -0.5, -2.95, 0.22, -0.5, TAU - 0.3, 0, -0.4, 0.5, 0.25, 0.4, 0, 0, -0.25, 0],
      [1.12, -1.0, -0.32, -0.12, -1.0, 0.32, -0.12, TAU + 0.45, 0.4, -1.2, 2, -0.2, 1.6, 1, 0, 0.4, 0], [1.9, -1.0, -0.32, -0.12, -1.0, 0.32, -0.12, TAU + 0.45, 0.4, -1.2, 2, -0.2, 1.6, 1, 0, 0.4, 0],
      A_FLICK(2.35, TAU), A_READY(2.65, TAU)],
    events: [[0.45, () => sfx.swish(0.9)], [0.92, () => { slowmo(0.15, 0.35); fovKick = Math.max(fovKick, 8); }],
      [1.12, e => { airLand(1.2); finKill(e, [finPlane(finSide(e).add(new V3(0, 0.08, 0)), finNeck(e))], finSide(e)); }]] },
  { name: 'RAIJIN OTOSHI', kanji: '雷神落とし', air: true, strike: 1.45, fast: [0.95], cam: [1.5, 0.2, 0.5], camD: [6.2, 0.2, -2.2], flickAt: 2.2, end: 2.75,   // thunder drop: a backflip high above him, then a corkscrew fall that carves him in three
    path: [[0, 0, null], [0.55, 0.55, 4.3, 2], [0.95, 0.7, 4.5], [1.45, 1, 0, 1], [2.75, 1, 0]],
    keys: [A_LAUNCH, A_TUCK(0.2, 0.2), A_TUCK(0.75, -TAU), [0.95, -1.55, 1.2, -0.1, -1.4, -0.9, -0.2, -TAU + 0.2, 0, -0.4, 0.8, 0.2, 0.4, 0, 0, 0.1, 0],
      [1.45, -1.55, 1.2, -0.1, -1.4, -0.9, -0.2, -TAU + 0.35, 0.34, -1.2, 2, -0.2, 1.6, 1, 0, 0.1, 3 * TAU], A_LAND(1.6, -TAU, 3 * TAU), A_LAND(1.95, -TAU, 3 * TAU),
      A_FLICK(2.4, -TAU, 3 * TAU), A_READY(2.75, -TAU, 3 * TAU)],
    events: [[0.2, () => sfx.swish(0.9)], [0.9, () => { slowmo(0.2, 0.6); sfx.warn(); }],
      ...[[1.08, finNeck], [1.22, finChest], [1.36, finHips]].map(([t, at]) => [t, e => { finMark(e, [...(e.finPlanes || []), finPlane(tilted(e, 0.22), at(e))]); sfx.swish(1.1); }]),
      [1.45, () => airLand(1.3)], [1.95, e => finKill(e, e.finPlanes, UP.clone())]] },
  { name: 'TENGU GAESHI', kanji: '天狗返し', air: true, strike: 0.72, fast: [0.66], cam: [1.6, 0.1, 0.8], camD: [5.2, 0.2, -1.2], flick: false, end: 2.6,   // vault right over him, inverted, cutting down on the way past; he falls at the click of the sheath
    path: [[0, 0, null], [0.4, 1, 1.6, 2], [0.75, 1.45, 1.9], [1.1, 2, 0, 1], [2.6, 2, 0]], sheathed: [[2.05, 2.6]],
    keys: [A_LAUNCH, [0.38, -1.0, -0.3, -0.6, -1.0, 0.3, -0.6, 0.8, 0, -1.2, 1.8, -0.6, 1.4, 0, 0, 0.3, 0],
      [0.66, -2.95, -0.22, -0.5, -2.95, 0.22, -0.5, Math.PI - 0.3, 0, 0.2, 0.3, 0.2, 0.3, 0, 0, 0.4, 0],
      [0.8, -1.0, -0.32, -0.12, -1.0, 0.32, -0.12, Math.PI + 0.5, 0, -0.3, 0.6, -0.3, 0.6, 0, 0, 0.3, 0],
      A_LAND(1.1, TAU), A_LAND(1.85, TAU), [2.15, -0.35, -0.6, -1.5, -0.2, 0.45, -1.2, TAU + 0.15, 0.1, -0.4, 0.5, 0.1, 0.4, 1, 0.3, 0, 0], A_READY(2.6, TAU)],
    events: [[0.72, e => { finMark(e, [finPlane(finSide(e).add(new V3(0, 0.35, 0)), finNeck(e))]); sfx.swish(1.4); slowmo(0.1, 0.6); }],
      [1.1, () => airLand()], [2.05, e => { sfx.clang(); finKill(e, e.finPlanes, finSide(e).add(new V3(0, 0.4, 0))); }]] },
];
// cut lines burn onto the body (he stays frozen) until finKill splits him along them
function finMark(e, planes) {
  if (e.marks) { scene.remove(e.marks); for (const m of e.marks.children) m.geometry.dispose(); }
  e.frozen = true; e.finPlanes = planes;
  e.marks = cutMarks(e.root, planes); if (e.marks) scene.add(e.marks);
  const fw = $('flashW'); fw.style.transition = 'none'; fw.style.opacity = 0.4; requestAnimationFrame(() => { fw.style.transition = 'opacity .4s'; fw.style.opacity = 0; });
  shake = Math.max(shake, 0.3); hitStop = Math.max(hitStop, 0.06);
}
function finKill(e, planes, push) {
  if (enemies.indexOf(e) < 0) return;
  sfx.swish(1.2);
  killEnemy(e, planes[0], push.normalize(), { stroke: ++stroke, planes: planes.slice(1), weapon: cur });
  const fw = $('flashW'); fw.style.transition = 'none'; fw.style.opacity = 0.85; requestAnimationFrame(() => { fw.style.transition = 'opacity .7s'; fw.style.opacity = 0; });
  banner(finish.v.name, finish.v.kanji);
  const air = !!finish.v.air, b = e.d.value * (air ? 2 : 1);   // aerial finishers pay double
  runCoins += b; score += air ? 500 : 300; ult = Math.min(100, ult + (air ? 25 : 15) * ultRate());
  floater('+' + b + (air ? ' AERIAL FINISHER' : ' FINISHER BONUS'), { x: vw / 2, y: vh * 0.72 }, 'big');
  slowmo(0.08, 0.75); shake = Math.max(shake, 0.6); hitStop = Math.max(hitStop, 0.12); fovKick = -9;
  if (tut) tut.flags.finish = true;
}
function tryFinish() {
  if (finish) return true;
  const e = finishTarget(); if (!e) return false;
  const air = airborne(), list = air ? AIR_FINISHERS : FINISHERS, last = air ? lastAirFin : lastFin;
  let vi = Math.floor(Math.random() * list.length); if (vi === last) vi = (vi + 1) % list.length;
  if (DEV && QS.get('fin')) vi = +QS.get('fin') % list.length;
  if (air) lastAirFin = vi; else lastFin = vi;
  startCine(list[vi], e);
  return true;
}
let lastAirFin = -1;
const airborne = () => !player.ground && player.y > 0.3;
// Start a cutscene: with a target (finisher) the hero steps in and the camera frames the pair;
// without one (Blade Storm) the hero holds his ground and the camera frames him and the space ahead.
function startCine(v, e) {
  const end = v.end || FIN_END;
  let dx, dz, l, x1, z1, x2, z2, ex, ez;
  if (e) {
    dx = player.pos.x - e.x; dz = player.pos.z - e.z; l = Math.hypot(dx, dz) || 1; const r = 1.15 * e.s;
    x1 = e.x + dx / l * r; z1 = e.z + dz / l * r;
    x2 = e.x - dx / l * 1.4 * e.s + dz / l * 0.55; z2 = e.z - dz / l * 1.4 * e.s - dx / l * 0.55;   // the quick-draw carries you past him
    ex = e.x; ez = e.z;
  } else {
    dx = Math.sin(player.yaw); dz = Math.cos(player.yaw); l = 1;
    x1 = x2 = player.pos.x; z1 = z2 = player.pos.z; ex = player.pos.x - dx * 1.4; ez = player.pos.z - dz * 1.4;
  }
  // film from whichever side keeps the camera inside the arena
  const side = Math.hypot((x1 + ex) / 2 + dz / l * 3, (z1 + ez) / 2 - dx / l * 3) < Math.hypot((x1 + ex) / 2 - dz / l * 3, (z1 + ez) / 2 + dx / l * 3) ? 1 : -1;
  finish = { e, v, end, t0: T, x0: player.pos.x, z0: player.pos.z, x1, z1, x2, z2, ex, ez, side, yaw0: player.yaw, yaw1: e ? Math.atan2(dx, dz) : player.yaw, pitch0: player.pitch };
  if (e) e.finishing = true;
  if (v.path) {   // aerial: the path takes over from gravity and ends on the ground
    finish.path = v.path.map(k => k[2] === null ? [k[0], k[1], player.y, k[3]] : k);
    player.ground = true; player.vy = 0; player.jumps = 0; player.flip = 0;
  }
  invuln = end + 0.5; player.dashT = 0; player.dashAnim = null; player.vel.set(0, 0, 0);
  document.body.classList.add('cine');
  if (e) { slowmo(0.55, 0.4); sfx.swish(0.8); fovKick = Math.max(fovKick, 6); after(0.35, () => { sfx.warn(); slowmo(0.4, 0.9); }); }
  for (const [t, fn] of v.events) after(t, () => { if (finish && finish.v === v && (!e || enemies.includes(e))) fn(e); });
  if (v.flick !== false) after(v.flickAt || 2.0, () => { sfx.swish(0.5); if (heroP.handR) fx.burst(heroP.handR.getWorldPosition(new V3()), new V3(Math.cos(player.yaw), 0, -Math.sin(player.yaw)), 10, 0.6); });   // chiburi
  after(end - 0.35, () => document.body.classList.remove('cine'));
  after(end, () => { if (finish && finish.v === v) finish = null; });
}
// the player is carried through the finisher: step in and face the target (the quick-draw dashes on past him)
function updFinishPlayer() {
  const u = T - finish.t0, f = smooth(clamp(u / 0.3, 0, 1)), D = finish.v.dash;
  let x = finish.x0 + (finish.x1 - finish.x0) * f, z = finish.z0 + (finish.z1 - finish.z0) * f;
  if (finish.path) {
    const K = finish.path; let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
    const a = K[i], b = K[i + 1], t = clamp((u - a[0]) / (b[0] - a[0]), 0, 1);
    const s = b[3] === 1 ? t * t : b[3] === 2 ? 1 - (1 - t) * (1 - t) : smooth(t);
    const al = a[1] + (b[1] - a[1]) * s, g = Math.min(al, 1), h = Math.max(al - 1, 0);
    x = finish.x0 + (finish.x1 - finish.x0) * g + (finish.x2 - finish.x1) * h;
    z = finish.z0 + (finish.z1 - finish.z0) * g + (finish.z2 - finish.z1) * h;
    player.y = a[2] + (b[2] - a[2]) * s;
  }
  if (D) { const g = smooth(clamp((u - D[0]) / D[1], 0, 1)); x += (finish.x2 - finish.x1) * g; z += (finish.z2 - finish.z1) * g; }
  player.pos.x = x; player.pos.z = z;
  let dy = finish.yaw1 - finish.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.yaw = finish.yaw0 + dy * f; player.pitch = finish.pitch0;
  player.vel.set(0, 0, 0); player.moveDir.set(0, 0, 0);
}
function finishPose(P) {
  const u = T - finish.t0, K = finish.v.keys;
  let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], t = clamp((u - a[0]) / (b[0] - a[0]), 0, 1);
  const s = finish.v.fast.includes(a[0]) ? t * t : smooth(t);   // cuts accelerate; everything else eases
  const v = j => a[j] + (b[j] - a[j]) * s;
  P.armR.rotation.x = v(1); P.armR.rotation.z = v(2); P.elbowR.rotation.x = v(3);
  P.armL.rotation.x = v(4); P.armL.rotation.z = v(5); P.elbowL.rotation.x = v(6);
  if (finish.v.air) {
    const spin = v(7), w = v(13), sp = Math.atan2(Math.sin(spin), Math.cos(spin));   // wrapped, so the hand-back never unwinds a flip
    P.hips.rotation.set(sp, 0, 0); P.hips.position.y = RIG.hips.y - v(8);
    legIK(P.legL, P.kneeL, sp, P.hips.position.y, -0.32); legIK(P.legR, P.kneeR, sp, P.hips.position.y, 0.38);
    P.legL.rotation.x += (v(9) - P.legL.rotation.x) * (1 - w); P.kneeL.rotation.x += (v(10) - P.kneeL.rotation.x) * (1 - w);
    P.legR.rotation.x += (v(11) - P.legR.rotation.x) * (1 - w); P.kneeR.rotation.x += (v(12) - P.kneeR.rotation.x) * (1 - w);
    P.torso.rotation.set(0, v(14), 0); P.head.rotation.set(v(15), 0, 0);
    hero.rotation.y += v(16);
    return;
  }
  P.hips.rotation.set(v(7), 0, 0); P.hips.position.y = RIG.hips.y - v(8);
  legIK(P.legL, P.kneeL, v(7), P.hips.position.y, v(9)); legIK(P.legR, P.kneeR, v(7), P.hips.position.y, v(10));
  P.torso.rotation.set(0, v(11), 0); P.head.rotation.set(v(12), 0, 0);
}
// Two-bone leg IK in the sagittal plane: put the ankle on the ground footZ ahead of the hips (root space).
function legIK(leg, knee, hipsRot, hipsY, footZ) {
  const oy = RIG.hp.y - RIG.hips.y, oz = RIG.hp.z - RIG.hips.z, L1 = RIG.hp.distanceTo(RIG.kn), L2 = RIG.kn.distanceTo(RIG.an);
  const c = Math.cos(hipsRot), s = Math.sin(hipsRot);
  const hy = hipsY + oy * c - oz * s, hz = RIG.hips.z + oy * s + oz * c;     // hip joint after the pelvis tilt
  const dy = RIG.an.y - hy, dz = footZ - hz, d = clamp(Math.hypot(dy, dz), 0.25, L1 + L2 - 0.004);
  const toFoot = Math.atan2(-dz, -dy);                                      // 0 = straight down, negative = forward
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  leg.rotation.set(toFoot - a - hipsRot, 0, 0);                             // thigh swings forward of the line so the knee bends forward
  knee.rotation.set(Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1)), 0, 0);
}
const _cP = new V3(), _cT = new V3(), _cM = new THREE.Matrix4(), _cQ = new THREE.Quaternion();
function cineCam() {
  const u = T - finish.t0, v = finish.v, [a0, aW, aP] = v.cam;
  cineW = smooth(clamp((u - 0.12) / 0.45, 0, 1)) * (1 - smooth(clamp((u - finish.end + 0.4) / 0.4, 0, 1)));
  if (cineW <= 0) return;
  let dx = finish.ex - finish.x1, dz = finish.ez - finish.z1; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const mx = (player.pos.x + finish.ex) / 2, mz = (player.pos.z + finish.ez) / 2;
  const wind = smooth(clamp((u - 0.3) / (v.strike - 0.3), 0, 1)), post = smooth(clamp((u - v.strike - 0.06) / 0.9, 0, 1));
  const ang = a0 + aW * wind + aP * post;                   // angle from the player's side of the line, drifting round
  const px = dz * finish.side, pz = -dx * finish.side;      // perpendicular
  const cx = -dx * Math.cos(ang) + px * Math.sin(ang), cz = -dz * Math.cos(ang) + pz * Math.sin(ang);
  const [d0, dW, dP] = v.camD || [4.6, -0.3, -1.3], [h0, hW, hP] = v.camH || [1.35, 0.1, -0.5], [t0, tW, tP] = v.camT || [1.2, 0.1, -0.4];
  const dist = d0 + dW * wind + dP * post, h = h0 + hW * wind + hP * post;   // finishers: wide enough for a raised blade, then push in low
  const lift = v.air ? player.y : 0, dl = dist + lift * 0.6;                 // aerial: pull back and look up between the hero and his target
  const [lP, lT] = v.lift || [0.35, 0.45];                                    // how far camera and aim rise with him
  _cP.set(mx + cx * dl, h + lift * lP, mz + cz * dl);
  _cT.set(mx + dx * 0.35 * post, t0 + tW * wind + tP * post + lift * lT, mz + dz * 0.35 * post);
  camera.position.lerp(_cP, cineW);
  _cQ.setFromRotationMatrix(_cM.lookAt(_cP, _cT, UP));
  camera.quaternion.slerp(_cQ, cineW);
}

/* ============ kills & bodies ============ */
function cutBody(b, plane, push, sid) {
  const air = phys.airborne(b), at = nearestOnPlane(phys.center(b), plane);
  const res = phys.cut(b, plane, push, sid);
  if (!res) return null;
  if (b.scenery) fx.dust(at, 8, 0.6); else fx.burst(at, plane.normal, b.isDoll ? 18 : 8, 0.7);   // wood and stone don't bleed
  fx.flash(at, plane.normal, push, 1.3);
  sfx.slice(0.6);
  if (air && b.cuts < 4) { stats.air++; runCoins += 2; score += 40; ult = Math.min(100, ult + 2 * ultRate()); floater('AIR SLICE +2', at, ''); }
  else score += 5;
  return res;
}
const bodySize = b => b.isDoll ? b.parts.length : b.group.userData.size * 4;
function killEnemy(e, plane, push, opts = {}) {
  if (e.npc) { npcHit(e, e.hp, push); return; }   // duels are never to the death: a lethal blow makes him yield
  const i = enemies.indexOf(e); if (i < 0) return;
  enemies.splice(i, 1);
  scene.remove(e.root);
  if (e.marks) { scene.remove(e.marks); for (const m of e.marks.children) m.geometry.dispose(); e.marks = null; }
  e.root.position.set(e.x, e.y, e.z);
  const toP = new V3(player.pos.x - e.x, 0, player.pos.z - e.z).normalize();
  const vel = e.air ? new V3((e.air.x1 - e.air.x0) / e.air.dur, 2, (e.air.z1 - e.air.z0) / e.air.dur) : toP.multiplyScalar(e.state === 'run' ? e.speed * 0.5 : 0);
  const c = bodyCenter(e);
  let pl = plane;
  if (Math.abs(pl.distanceToPoint(c)) > e.d.h * 0.42) pl = new THREE.Plane().setFromNormalAndCoplanarPoint(plane.normal, c);
  const pw = push.clone().multiplyScalar(e.d.boss ? 0.6 : 1);
  let mine = phys.fromEnemy(e.root, vel);
  let res = phys.cut(mine[0], pl, pw, opts.stroke);
  if (!res) { pl = new THREE.Plane().setFromNormalAndCoplanarPoint(plane.normal, c); res = phys.cut(mine[0], pl, pw, opts.stroke); }
  if (res) mine = [...res, ...mine.slice(1)];
  for (const p of opts.planes || []) {   // further cuts along given planes (Blade Storm marks)
    for (const piece of mine.slice()) { const r = phys.cut(piece, p, p.normal, opts.stroke); if (r) mine.splice(mine.indexOf(piece), 1, ...r); }
  }
  // extra cuts (boss, Blade Storm) on this enemy's own pieces
  const extra = opts.extra ?? (e.d.boss ? 4 : 0);
  for (let k = 0; k < extra; k++) {
    mine.sort((a, b) => bodySize(b) - bodySize(a));
    const big = mine[0], n = new V3().randomDirection();
    const r = phys.cut(big, new THREE.Plane().setFromNormalAndCoplanarPoint(n, phys.center(big)), n, opts.stroke);
    if (r) mine.splice(0, 1, ...r);
  }
  const at = nearestOnPlane(c, pl);
  fx.burst(at, pl.normal, e.d.boss ? 90 : 40, e.d.boss ? 1.6 : 1);
  fx.flash(at, pl.normal, push, e.d.h * 1.4, 0x120e0b);
  sfx.slice(e.d.boss ? 2 : 1);
  shake = Math.max(shake, e.d.boss ? 1.2 : 0.22);
  hitStop = Math.max(hitStop, e.d.boss ? 0.12 : 0.05);
  if (e === bossE) bossDown(e);
  addKill(e, at, opts.stroke);
}
function hurtEnemy(e, dmg, point, push) {
  if (e.npc) { npcHit(e, dmg, push); return; }
  e.hp -= dmg;
  if (!e.d.boss) {   // bosses never flinch, get knocked back or have a blow stopped: they just take the damage
    e.stagger = 0.32; e.knock = 4;
    if (lateWindup(e)) { e.state = 'ready'; e.atkT = 0.6; }   // only a late hit stops the blow (see COUNTER)
  }
  if (e.d.armor || e.d.boss) { sfx.clang(); fx.sparks(point, 20); }
  else sfx.slice(0.5);
  fx.burst(point, push, e.d.boss ? 18 : 8, 0.6);
  fx.flash(point, new V3().crossVectors(push, camera.getWorldDirection(new V3())).normalize(), push, e.d.w * 3);
  shake = Math.max(shake, 0.15);
  if (e === bossE) updBoss();
}
function addKill(e, pos, sid) {
  stats.kills++;
  if (!e.minion) killedCounted++;
  comboN++; comboT = 1.8; stats.maxCombo = Math.max(stats.maxCombo, comboN);
  const mult = 1 + Math.min(3, Math.floor(comboN / 5) * 0.5);
  const coins = Math.round(e.d.value * mult);
  runCoins += coins; score += Math.round(e.d.value * 10 * mult);
  ult = Math.min(100, ult + (e.d.boss ? 40 : 7) * ultRate());
  floater(coins ? '+' + coins : 'SLICED!', pos, '');
  if (player.y > 0.5) { runCoins += 3; score += 60; floater('AERIAL KILL +3', { x: vw / 2, y: vh * 0.38 }, ''); slowmo(0.35, 0.3); }
  if (tut) tut.kills++;
  if (e.trial) trialKill();
  if (comboN >= 2) { const c = $('combo'); c.textContent = `x${comboN} COMBO`; c.classList.add('on'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
  if (sid !== undefined && sid >= 0) {
    const n = (strokeKills.get(sid) || 0) + 1; strokeKills.set(sid, n);
    if (n >= 2) {
      const label = n === 2 ? 'DOUBLE SLICE!' : n === 3 ? 'TRIPLE SLICE!' : `MULTI SLICE x${n}!`;
      floater(label + ' +' + n * 5, { x: vw / 2, y: vh * 0.3 }, 'big'); runCoins += n * 5; score += n * 100;
      slowmo(0.3, 0.35);
    }
  }
  if (!save.tut) { save.tut = true; persist(); $('tut').classList.add('hidden'); }
  sfx.coin();
}
/* ============ player ============ */
function hurtPlayer(n) {
  if (invuln > 0 || state !== 'play') return;
  hearts = Math.max(0, hearts - (stage.tutorial ? 0 : n)); stats.dmg += n; invuln = 0.35;
  sfx.hurt(); shake = Math.max(shake, 0.7); player.hurtT = 0.35; comboN = 0; $('combo').classList.remove('on');
  const v = $('vignette'); v.style.transition = 'none'; v.style.opacity = 1; requestAnimationFrame(() => { v.style.transition = 'opacity .6s'; v.style.opacity = 0; });
  const h = $('hearts'); h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit');
  updHearts();
  if (hearts <= 0) { if (trialRun) trialFall(); else if (stage.explore) loseDuel(); else gameOver(); }
}
function slowmo(scale, dur) { timeScale = Math.min(timeScale, scale); slowTo = scale; slowT = Math.max(slowT, dur); }

// Blade Storm is a cutscene: the hero kneels into a draw stance, the blade flashes out and every enemy in range
// is marked at once; he holds the follow-through while they stand frozen, then sheathes - and they all fall apart.
const STORM_DRAW = 0.55, STORM_SHEATHE = 2.6;
const K_SHEATHE = [2.5, -0.35, -0.6, -1.5, -0.2, 0.45, -1.2, 0.15, 0.08, -0.3, 0.3, 0.3, 0];
const STORM_CINE = { name: 'BLADE STORM', strike: STORM_DRAW, fast: [0.45], end: 3.1, flick: false,
  cam: [2.4, -0.2, -1.6], camD: [3.2, -0.3, 2.6], camH: [1.05, -0.1, 1.5], camT: [1.05, 0, 0.1],   // his face first, then pull up and round to the marked field
  sheathed: [[0, 0.5], [2.48, 99]],
  keys: [hold(K_SET, 0), hold(IAI_SET, 0.45), hold(IAI_CUT, STORM_DRAW), hold(IAI_CUT, 2.15), K_SHEATHE, hold(K_SHEATHE, 2.7), [3.1, ...K_READY.slice(1)]],
  events: [[STORM_DRAW, stormDraw], [STORM_SHEATHE, stormSheathe]] };
// Sky Storm, the aerial Blade Storm: from a jump he soars up, draws in a whirlwind spin at the top that marks
// every enemy below, floats down holding the follow-through, lands, and they fall apart at the click of the sheath.
const SKY_DRAW = 0.75, SKY_SHEATHE = 2.65;
const SKY_CINE = { name: 'SKY STORM', title: 'SKY STORM', kanji: '天嵐', air: true, strike: SKY_DRAW, sheatheAt: SKY_SHEATHE, fast: [0.6], end: 3.1, flick: false,
  cam: [2.2, -0.2, -1.4], camD: [4.4, 0, 2.4], camH: [1.2, 0, 1.2], camT: [1.1, 0, 0.1], lift: [0.75, 1.0],   // the camera rides up with him
  path: [[0, 0, null], [0.55, 0, 4.2, 2], [SKY_DRAW, 0, 4.5], [2.0, 0, 3.4], [2.25, 0, 0, 1], [3.1, 0, 0]], sheathed: [[0, 0.55], [2.55, 99]],
  keys: [A_LAUNCH, A_TUCK(0.45, -TAU), [0.6, -0.35, -0.6, -1.5, -0.2, 0.45, -1.2, -TAU + 0.3, 0, -1.0, 1.6, -0.4, 1.2, 0, 0.5, -0.05, 0],
    [SKY_DRAW, -1.5, 1.15, -0.05, 0.35, -0.25, -0.3, -TAU + 0.1, 0, -0.5, 0.7, 0.2, 0.4, 0, -0.6, 0, 2 * TAU],
    [2.0, -1.5, 1.15, -0.05, 0.35, -0.25, -0.3, -TAU + 0.1, 0, -0.6, 0.9, 0.1, 0.5, 0, -0.6, 0.1, 2 * TAU + 0.6],
    A_LAND(2.25, -TAU, 2 * TAU + 0.6), [2.5, -0.35, -0.6, -1.5, -0.2, 0.45, -1.2, -TAU + 0.15, 0.1, -0.4, 0.5, 0.1, 0.4, 1, 0.3, 0, 2 * TAU + 0.6],
    A_READY(3.1, -TAU, 2 * TAU + 0.6)],
  events: [[SKY_DRAW, () => { stormDraw(); fx.sparks(heroP.handR.getWorldPosition(new V3()), 60, 0xffffff, 9); }], [2.25, () => airLand(1.3)], [SKY_SHEATHE, stormSheathe]] };
function storm() {
  if (ult < 100 || state !== 'play' || finish) return;
  const v = airborne() ? SKY_CINE : STORM_CINE;
  ult = 0; if (tut) tut.flags.storm = true; sfx.ult(); slowmo(0.2, (v.sheatheAt || STORM_SHEATHE) + 0.2);
  startCine(v, null);
}
function stormDraw() {
  const fw = $('flashW'); fw.style.transition = 'none'; fw.style.opacity = 0.7; requestAnimationFrame(() => { fw.style.transition = 'opacity .5s'; fw.style.opacity = 0; });
  banner(finish.v.title || 'BLADE STORM', finish.v.kanji || '嵐'); sfx.swish(1.4); shake = Math.max(shake, 0.4);
  const sid = finish.sid = ++stroke, holdAt = (finish.v.sheatheAt || STORM_SHEATHE) - finish.v.strike;
  const dd = e => Math.hypot(e.x - player.pos.x, e.z - player.pos.z);
  const list = enemies.filter(e => dd(e) < 35).sort((a, b) => dd(a) - dd(b));
  list.forEach((e, i) => after(i * 0.03, () => {
    if (!enemies.includes(e) || e.stormed) return;
    const n = new V3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-0.3, 0.3)).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, bodyCenter(e));
    const s = toScreen(bodyCenter(e)); if (s) stormLines.push({ x: s.x, y: s.y, a: rnd(0, Math.PI), t: 0.35 });
    if (e.d.boss && e.hp > 12) hurtEnemy(e, 12, bodyCenter(e), n);
    else if (e.npc) hurtEnemy(e, 5, bodyCenter(e), n);   // rivals shrug off a Storm with a heavy wound
    else stormMark(e, plane, sid, holdAt - i * 0.03);
  }));
  for (const pr of eProj.slice()) deflect(pr);
  if (stage.explore) stormScenery(sid, holdAt);
}
// Explore: the Storm takes the surroundings with it. Every prop in reach is marked when the blade flashes out
// and comes apart at the click of the sheath (nearest first), along a slanting cut low enough to fell trees and
// take the top off a house; loose pieces already lying around are cut again.
const STORM_PROPS_R = 16, STORM_PROPS_MAX = 30;
function stormScenery(sid, hold) {
  const ctr = h => h.box.getCenter(new V3()), dd = h => { const c = ctr(h); return Math.hypot(c.x - player.pos.x, c.z - player.pos.z); };
  const list = world.propsNear(player.pos, STORM_PROPS_R).sort((a, b) => dd(a) - dd(b)).slice(0, STORM_PROPS_MAX);
  list.forEach((h, i) => {
    const c = ctr(h); c.y = Math.min(c.y, 2.2);
    const out = new V3(c.x - player.pos.x, 0, c.z - player.pos.z); if (out.lengthSq() < 1e-4) out.set(0, 0, -1); out.normalize();
    const side = new V3().crossVectors(UP, out), n = UP.clone().addScaledVector(side, rnd(-0.7, 0.7)).addScaledVector(out, rnd(-0.3, 0.3)).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, c);
    after(i * 0.02, () => { fx.flash(c, n, side, Math.min(5, h.box.getSize(new V3()).length() * 0.5)); const s = toScreen(c); if (s) stormLines.push({ x: s.x, y: s.y, a: rnd(0, Math.PI), t: 0.35 }); });
    after(hold + i * 0.03, () => { if (stage.explore) cutProp(h, plane, out, sid); });
  });
  after(hold, () => {
    for (const b of phys.all()) {
      if (b.sink || b.stroke === sid) continue;
      const c = phys.center(b); if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > STORM_PROPS_R) continue;
      const out = new V3(c.x - player.pos.x, 0, c.z - player.pos.z).normalize();
      cutBody(b, new THREE.Plane().setFromNormalAndCoplanarPoint(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(), c), out, sid);
    }
  });
}
function stormSheathe() { sfx.clang(); shake = Math.max(shake, 0.5); hitStop = Math.max(hitStop, 0.08); }   // the click of the guard: they fall

// Blade Storm victims freeze where they stand with glowing cut lines traced across their bodies,
// then fall apart along exactly those lines once the marks have burned for STORM_HOLD seconds.
const STORM_HOLD = 2;
function stormMark(e, plane, sid, hold = STORM_HOLD) {
  const c = bodyCenter(e), planes = [plane];
  for (let k = e.d.boss ? 3 : 1; k > 0; k--) {
    const n = new V3(rnd(-1, 1), rnd(-0.7, 0.7), rnd(-0.4, 0.4)).normalize();
    planes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(n, c.clone().add(new V3(0, rnd(-0.3, 0.3) * e.d.h, 0))));
  }
  e.stormed = { t0: T, hold, sid, planes, x: e.x, z: e.z };
  e.marks = cutMarks(e.root, planes);
  if (e.marks) scene.add(e.marks);
  fx.flash(c, plane.normal, new V3().crossVectors(plane.normal, UP).normalize(), e.d.h * 1.2);
  sfx.slice(0.4);
  after(hold, () => {
    if (!enemies.includes(e)) return;
    killEnemy(e, planes[0], new V3().crossVectors(planes[0].normal, UP).normalize(), { stroke: sid, planes: planes.slice(1), extra: 0, weapon: 'katana' });
  });
}
function updStormed(e) {
  const S = e.stormed, u = T - S.t0, shiver = u > S.hold - 0.45 ? (u - S.hold + 0.45) * 0.05 : 0;   // a tremor just before they come apart
  e.x = S.x + rnd(-shiver, shiver); e.z = S.z + rnd(-shiver, shiver);
  e.root.position.set(e.x, e.y, e.z);
  if (e.marks) e.marks.position.set(e.x - S.x, 0, e.z - S.z);
}

/* ============ stage flow ============ */
let stroke = 0;
function clearField() {
  finish = null; cineW = 0; document.body.classList.remove('cine');
  for (const e of enemies) scene.remove(e.root);
  phys.clear();
  for (const p of pProj) scene.remove(p.g);
  for (const p of eProj) scene.remove(p.g);
  enemies = []; pProj = []; eProj = []; timers = [];
  for (const e of npcs) { scene.remove(e.root); e.npc.tag.remove(); }
  npcs = []; talkNPC = duelNPC = null; $('dlg').classList.add('hidden'); $('npcPrompt').classList.add('hidden');
  for (const q of propQ) q.h.prop.queued = false; propQ = [];
  clearTrial(); removeWisp(); wispT = 8; clearCitizens(); errand = null; charmMark = -1; updQuest();
  guide = null; $('tutSkip').textContent = 'Skip tutorial';
  fling.on = false; fling.mesh.visible = fling.chain.visible = false;
}
function startStage(n) {
  clearField();
  stage = makeStage(n); stage.map = stageMap(n);
  world.setExplore(false); world.setMap(stage.map); world.setTheme(stage.theme); $('minimap').classList.add('hidden');
  maxHearts = heartsMax(); hearts = maxHearts;
  score = 0; runCoins = 0; comboN = 0; ult = Math.max(Math.min(ult, 40), blessed(20) ? 50 : 0); invuln = 0;
  stats = { kills: 0, maxCombo: 0, dmg: 0, air: 0, counters: 0, perfect: 0, clean: 0 };
  killedCounted = 0; spawnT = 0.8; revived = false; bossE = null; strokeKills.clear();
  timeScale = 1; slowT = 0;
  player.pos.set(0, 0, 4); player.vel.set(0, 0, 0); player.yaw = 0; player.pitch = -0.06; player.dashT = player.dashCD = 0; player.y = player.vy = player.flip = 0; player.ground = true;
  if (!has(cur)) cur = 'katana';
  if (trial && has(trial)) cur = trial;
  for (const id of WIDS) cds[id] = 0;
  state = 'play'; vmMode = 'hand';
  showLayer(null); $('hud').classList.remove('hidden'); $('bossBar').classList.add('hidden'); $('coinsBadge').classList.add('hidden');
  $('stageTag').textContent = `STAGE ${n} · ${MAPS[mapIdx(stage.map)].name.toUpperCase()}`;
  updHearts(); buildWBar(); updHUD();
  banner(`STAGE ${n}`, stage.boss ? 'BOSS STAGE' : `${MAPS[mapIdx(stage.map)].name} · ${themeName(stage.theme)}`);
  $('tut').classList.add('hidden'); $('tutBox').classList.add('hidden'); tut = null;
  music(stage.boss ? 'battle' : 'battle');
  playsSinceAd++;
  gameplay(true);
  requestLock(); updLockUI();
}
function updSpawner(dt) {
  if (!stage.queue.length) return;
  spawnT -= dt;
  const head = stage.queue[0];
  const cap = Math.min(24, 6 + Math.floor(stage.n * 0.6));   // more on the field at once as stages climb
  if (spawnT > 0 || enemies.length >= cap) return;
  if (EDEF[head.kind].boss && enemies.length > 2) return;
  stage.queue.shift();
  if (head.kind === stage.debut) { stage.debut = null; const r = ROSTER.find(r => r.kind === head.kind); after(0.6, () => { banner(r.name, 'NEW ENEMY'); floater(r.tip, { x: vw / 2, y: vh * 0.36 }, ''); }); }
  if (DEV && QS.has('near')) { const a = rnd(-0.6, 0.6) + player.yaw; const nd = +QS.get('near') || 9; spawnEnemy(head.kind, player.pos.x - Math.sin(a) * nd, player.pos.z - Math.cos(a) * nd); }
  else {
    if (['grunt', 'runner', 'archer', 'assassin'].includes(head.kind) && Math.random() < 0.5) {
      const a = rnd(0, Math.PI * 2), W = world.wallR, e = spawnEnemy(head.kind, Math.sin(a) * (W + 2.6), -Math.cos(a) * (W + 2.6));
      leap(e, Math.sin(a) * (W - 3.5), -Math.cos(a) * (W - 3.5), world.leapH, 1.05, 1);
      spawnT = stage.queue.length ? stage.queue[0].gap : 0;
      return;
    }
    const g = world.gates[Math.floor(Math.random() * world.gates.length)], j = EDEF[head.kind].boss ? 0 : rnd(-2, 2), k = rnd(-1.5, 1.5);
    spawnEnemy(head.kind, g.ox + g.tx * j + g.dx * k, g.oz + g.tz * j + g.dz * k, false, { x: g.ix + g.tx * j * 0.6, z: g.iz + g.tz * j * 0.6 });
  }
  spawnT = stage.queue.length ? stage.queue[0].gap : 0;
}
function bossDown(e) {
  bossE = null; $('bossBar').classList.add('hidden');
  slowmo(0.15, 1.6); banner(e.d.slain, 'VICTORY'); happytime(); music('battle');
  for (const o of enemies.slice()) if (o.minion) killEnemy(o, new THREE.Plane().setFromNormalAndCoplanarPoint(new V3().randomDirection(), bodyCenter(o)), UP.clone(), { stroke: -3 });
}
function checkClear() {
  if (state !== 'play' || stage.tutorial || stage.explore || stage.queue.length || enemies.length) return;
  state = 'clearing';
  gameplay(false); exitLock();
  after(1.4, stageClear);
}
function stageClear() {
  const n = stage.n;
  // Stars: 3 for losing no more than the allowance (40% of your hearts, at least 2, plus 1 more every 10 stages),
  // 2 for any clear without a revive, 1 for a clear after reviving. A flawless clear still pays extra.
  const allow = Math.max(2, Math.ceil(maxHearts * 0.4)) + Math.floor(n / 10);
  const stars = revived ? 1 : stats.dmg <= allow ? 3 : 2;
  const bonus = 40 + n * 12 + (stats.dmg === 0 ? 50 : 0) + (stars === 3 ? 25 : 0);
  lastCoins = runCoins + bonus;
  save.coins += lastCoins;
  if (n >= save.stage) save.stage = n + 1;
  save.sel = save.stage;
  save.best = Math.max(save.best, score);
  trial = null;
  persist();
  state = 'results'; sfx.win(); music('menu');
  $('resTitle').textContent = `STAGE ${n} CLEAR`;
  [...$('resStars').children].forEach((s, i) => { s.classList.toggle('on', i < stars); s.style.animationDelay = (0.15 + i * 0.18) + 's'; });
  $('resStats').innerHTML = `<span>Hearts lost (3★ allows ${allow})</span><b>${stats.dmg}${stats.dmg === 0 ? ' · FLAWLESS' : ''}</b><span>Enemies sliced</span><b>${stats.kills}</b><span>Best combo</span><b>x${stats.maxCombo}</b><span>Air slices</span><b>${stats.air}</b><span>Counters · perfect dodges</span><b>${stats.counters} · ${stats.perfect}</b><span>Clean cuts</span><b>${stats.clean}</b><span>Clear bonus</span><b>+${bonus}</b><span>Score</span><b>${score}</b>`;
  $('resCoins').innerHTML = `<span class="coinI"></span>+${lastCoins}`;
  resDoubled = false;
  showLayer('results'); $('hud').classList.add('hidden'); updAdUI();
}
function gameOver() {
  state = 'gameover'; gameplay(false); exitLock(); sfx.lose(); music('menu');
  slowmo(0.3, 0.8);
  $('goStats').innerHTML = `<span>Stage</span><b>${stage.n}</b><span>Enemies sliced</span><b>${stats.kills}</b><span>Coins this run</span><b>${runCoins}</b>`;
  after(0.9, () => { showLayer('gameover'); $('hud').classList.add('hidden'); updAdUI(); });
}
function bankRunCoins() { save.coins += blessed(14) ? Math.round(runCoins * 1.15) : runCoins; runCoins = 0; persist(); }
function revive() {
  revived = true; hearts = maxHearts; invuln = 1.5; state = 'play';
  showLayer(null); $('hud').classList.remove('hidden'); updHearts();
  const sid = ++stroke;
  for (const e of enemies.slice()) if (Math.hypot(e.x - player.pos.x, e.z - player.pos.z) < 9) {
    if (e.d.boss) { hurtEnemy(e, 0, bodyCenter(e), UP); e.z -= 6; continue; }
    killEnemy(e, new THREE.Plane().setFromNormalAndCoplanarPoint(new V3(rnd(-1, 1), rnd(-0.5, 0.5), 0).normalize(), bodyCenter(e)), UP.clone(), { stroke: sid });
  }
  for (const pr of eProj.slice()) removeEProj(pr);
  banner('SECOND WIND', ''); music(bossE ? 'boss' : 'battle');
  gameplay(true); requestLock(); updLockUI();
}
function pause() {
  if (state !== 'play') return;
  state = 'paused'; gameplay(false); showLayer('pause'); updToggles();
  $('skipTutBtn').classList.toggle('hidden', !tut && !guide); $('skipTutBtn').textContent = guide ? 'Skip guide' : 'Skip tutorial';
  $('guideBtn').classList.toggle('hidden', !stage.explore || !!guide);
  $('pBless').innerHTML = stage.explore ? blessText() : ''; $('pBless').classList.toggle('hidden', !stage.explore);
  ptr.down = false; blade = false; joy.id = null; showJoy(); for (const k in keys) keys[k] = false;
  exitLock(); updLockUI();
}
function resume() { if (state !== 'paused') return; state = 'play'; showLayer(null); gameplay(true); updLockUI(); }
async function playStage(n, withAd) {
  if (withAd && adsOK() && playsSinceAd >= AD_EVERY_STAGES && performance.now() - lastAdAt > AD_GAP_MS) { await runAd('midgame'); playsSinceAd = 0; lastAdAt = performance.now(); }
  startStage(n);
}
function toMenu() {
  if (state === 'play' || state === 'paused' || state === 'gameover') bankRunCoins();
  trial = null; tut = null; $('tutBox').classList.add('hidden');
  clearField(); gameplay(false); exitLock();
  state = 'menu'; vmMode = 'hand';
  menuWorld(); $('minimap').classList.add('hidden');
  $('hud').classList.add('hidden'); $('tut').classList.add('hidden');
  showLayer('menu'); updLockUI(); updMenu(); music('menu');
}

/* ============ input ============ */
// Desktop: pointer lock. Mouse = look; hold left button = blade mode (camera freezes, the mouse draws the cut).
// Touch: left-side joystick moves/turns, swipes elsewhere slice. Fallback without pointer lock: right-drag looks.
const ptr = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, lx: 0, ly: 0, lt: 0, swept: false, lastSwing: 0 };
const trail = [], stormLines = [];
const canvas = $('c');
const needLock = () => !sdk.touch && !lockFail && !locked;
function requestLock() {
  if (sdk.touch || lockFail || locked || (DEV && QS.has('sim'))) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { lockFail = true; }
}
const exitLock = () => { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {} };
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked) { blade = false; if (ptr.down) endStroke(); if (state === 'play' && !talkNPC) pause(); }   // a dialogue releases the mouse on purpose
  updLockUI();
});
document.addEventListener('pointerlockerror', () => {
  if (++lockErrs >= 2) { lockFail = true; toast('Mouse lock unavailable: hold right mouse button to look'); }
  updLockUI();
});
function beginStroke(x, y) {
  Object.assign(ptr, { down: true, x, y, sx: x, sy: y, lx: x, ly: y, lt: performance.now(), swept: false });
  stroke++; trail.length = 0; trail.push({ x, y, t: performance.now() });
  const W = WEAP[cur];
  if (W.mode === 'throw' && cds[cur] <= 0) { fireThrow(cur, x, y); cds[cur] = W.cd(lvl(cur)); }
  ptr.live = cds[cur] <= 0; ptr.cutT = 0;   // swipe: a stroke started while the blade recovers doesn't cut
}
// a swipe is one swing: it cuts for up to SWING_T, then the blade needs its cooldown before the next swing
const SWING_T = 500;
function endSwing() { if (ptr.cutT) { cds[cur] = WEAP[cur].cd(lvl(cur)); ptr.cutT = 0; } ptr.live = false; }
function endStroke() {
  if (!ptr.down) return;
  ptr.down = false;
  if (state !== 'play') return;
  const W = WEAP[cur], L = Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy);
  if (W.mode === 'swipe' && ptr.cutT) { endSwing(); return; }
  if (W.mode === 'fling') { if (cds[cur] <= 0) { if (L > 45) doFling(ptr.sx, ptr.sy, ptr.x, ptr.y); else quickSlash(); } }
  else if ((W.mode === 'swipe' || W.mode === 'sweep') && L < 22) quickSlash();
}
let quickFlip = false;
// a click without dragging: diagonal slash through the crosshair (or the tap point)
function quickSlash() {
  const W = WEAP[cur], l = lvl(cur);
  const cx = locked ? vw / 2 : ptr.sx, cy = locked ? vh / 2 : ptr.sy;
  quickFlip = !quickFlip;
  const a = quickFlip ? -0.65 : Math.PI + 0.65, r = Math.min(vw, vh) * 0.26;
  const x0 = cx - Math.cos(a) * r, y0 = cy + Math.sin(a) * r, x1 = cx + Math.cos(a) * r, y1 = cy - Math.sin(a) * r;
  if (W.mode === 'fling') { doFling(x0, y0, x1, y1); return; }
  if (W.mode === 'sweep' || W.mode === 'swipe') { if (cds[cur] > 0) return; cds[cur] = W.cd(l); }
  stroke++;
  const now = performance.now(); trail.length = 0;
  for (let i = 0; i <= 8; i++) trail.push({ x: x0 + (x1 - x0) * i / 8, y: y0 + (y1 - y0) * i / 8, t: now - (8 - i) * 8 });
  startSwing(x1 - x0, y1 - y0, W.mode === 'sweep' ? 0.26 : 0.16); sfx.swish(W.mode === 'sweep' ? 0.75 : 1);
  sliceSeg(W.mode === 'sweep' ? extendSeg(x0, y0, x1, y1, 30) : [x0, y0, x1, y1], x0, y0, x1, y1, W.range(l), W.dmg(l), stroke, cur);
}
canvas.addEventListener('pointerdown', e => {
  audio.unlock();
  if (state !== 'play') return;
  const mouse = e.pointerType === 'mouse';
  if (mouse && needLock()) { requestLock(); return; }
  if (!mouse && joy.id === null && e.clientX < vw * 0.42) {
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    showJoy(); return;
  }
  if (mouse && e.button === 2) { look.drag = true; look.x = e.clientX; look.y = e.clientY; return; }
  if ((mouse && e.button !== 0) || ptr.down) return;
  ptr.id = e.pointerId;
  if (locked) { blade = true; cursor.x = vw / 2; cursor.y = vh / 2; beginStroke(cursor.x, cursor.y); }
  else { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} beginStroke(e.clientX, e.clientY); }
});
canvas.addEventListener('pointermove', e => {
  if (state !== 'play') return;
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const L = Math.hypot(dx, dy), R = 56;
    if (L > R) { dx *= R / L; dy *= R / L; }
    joy.x = dx / R; joy.y = dy / R; showJoy(); return;
  }
  if (locked) {
    const mx = e.movementX || 0, my = e.movementY || 0;
    if (blade && ptr.down) { cursor.x = clamp(cursor.x + mx * 1.3, 0, vw); cursor.y = clamp(cursor.y + my * 1.3, 0, vh); moveTo(cursor.x, cursor.y); }
    else { player.yaw -= mx * 0.0022; player.pitch = clamp(player.pitch - my * 0.0022, -1.25, 1.1); }
    return;
  }
  if (look.drag) {
    player.yaw -= (e.clientX - look.x) * 0.005; player.pitch = clamp(player.pitch - (e.clientY - look.y) * 0.005, -1.25, 1.1);
    look.x = e.clientX; look.y = e.clientY; return;
  }
  if (!ptr.down || e.pointerId !== ptr.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])) moveTo(ev.clientX, ev.clientY);
});
function moveTo(x, y) {
  ptr.x = x; ptr.y = y;
  const W = WEAP[cur], now = performance.now();
  if (W.mode !== 'throw') trail.push({ x, y, t: now });
  const dx = x - ptr.lx, dy = y - ptr.ly, L = Math.hypot(dx, dy);
  if (W.mode === 'swipe') {
    if (L < 9) return;
    if (!ptr.live && cds[cur] <= 0) ptr.live = true;   // still dragging when the blade is ready again: the next swing starts
    if (!ptr.live) { ptr.lx = x; ptr.ly = y; return; }
    if (!ptr.cutT) ptr.cutT = now; else if (now - ptr.cutT > SWING_T) { endSwing(); return; }
    const l = lvl(cur);
    if (now - ptr.lastSwing > 200 && L > 14) { startSwing(dx, dy); sfx.swish(1); ptr.lastSwing = now; }
    sliceSeg([ptr.lx, ptr.ly, x, y], ptr.lx, ptr.ly, x, y, W.range(l), W.dmg(l), stroke, cur);
    ptr.lx = x; ptr.ly = y;
  } else if (W.mode === 'sweep') {
    const tx = x - ptr.sx, ty = y - ptr.sy, TL = Math.hypot(tx, ty);
    if (!ptr.swept && TL > 70 && cds[cur] <= 0) {
      ptr.swept = true;
      const l = lvl(cur);
      cds[cur] = W.cd(l);
      startSwing(tx, ty, 0.26); sfx.swish(0.75);
      sliceSeg(extendSeg(ptr.sx, ptr.sy, x, y, 30), ptr.sx, ptr.sy, x, y, W.range(l), W.dmg(l), stroke, cur);
    }
  } else { ptr.lx = x; ptr.ly = y; }
}
function upHandler(e) {
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; showJoy(); return; }
  if (e.pointerType === 'mouse' && e.button === 2) { look.drag = false; return; }
  if (!ptr.down || e.pointerId !== ptr.id) return;
  blade = false; endStroke();
}
canvas.addEventListener('pointerup', upHandler);
canvas.addEventListener('pointercancel', upHandler);
canvas.addEventListener('wheel', e => {
  if (state !== 'play') return;
  const own = WIDS.filter(has); if (own.length < 2) return;
  const i = own.indexOf(cur), n = own[(i + (e.deltaY > 0 ? 1 : -1) + own.length) % own.length];
  selectWeapon(n);
}, { passive: true });
addEventListener('contextmenu', e => e.preventDefault());
// Every control is bound to a key's physical position (e.code), so ZQSD works on AZERTY, the number row picks
// weapons without Shift, and no key does two things on another layout; the labels shown to the player follow
// their layout (keyName). Pause is P (Esc also pauses, since it releases the mouse, but it isn't relied on).
addEventListener('keydown', e => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyW' && document.fullscreenElement) e.preventDefault();   // don't close the tab mid-fight
  audio.unlock();
  learnKey(e);
  keys[e.code] = true;
  const c = e.code, num = /^(Digit|Numpad)([1-9])$/.exec(c), n = num ? +num[2] : 0;
  if (state === 'play' && talkNPC) {   // dialogue: number keys pick a reply, T (or Esc) leaves
    if (n) { const b = $('dlgOpts').children[n - 1]; if (b) b.click(); }
    else if (c === 'Escape' || c === 'KeyT') closeDlg();
    return;
  }
  if (state === 'play') {
    if (stage.explore && (c === 'KeyT' || c === 'KeyR')) { const np = nearNPC(); if (np) { if (c === 'KeyT') talk(np); else challenge(np); return; } const ct = c === 'KeyT' && nearCit(); if (ct) { talkCit(ct); return; } }
    if (n >= 1 && n <= WIDS.length) selectWeapon(WIDS[n - 1]);
    else if (c === 'KeyQ') { if (!tryFinish()) storm(); }   // finishes a crippled enemy nearby, otherwise Blade Storm
    else if (c === 'KeyE' || c === 'KeyF') storm();
    else if (c === 'KeyC' || c === 'KeyV') cycleCam();
    else if (c === 'ShiftLeft' || c === 'ShiftRight') dash();
    else if (c === 'Space' && !e.repeat) jump();
    else if (c === 'KeyP' || c === 'Escape') pause();
  } else if (state === 'paused' && c === 'KeyP') resumeAndLock();
});
// Ctrl/Cmd+W closes the tab: while fullscreen, ask the browser to hand that key to the game instead
document.addEventListener('fullscreenchange', () => { try { if (document.fullscreenElement) navigator.keyboard?.lock?.(['KeyW'])?.catch?.(() => {}); else navigator.keyboard?.unlock?.(); } catch (_) {} });
addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; pause(); });
addEventListener('resize', () => { resize(); if (!$('tour').classList.contains('hidden')) placeTour(); });

function dash() {
  if (state !== 'play' || player.dashCD > 0) return;
  const d = player.moveDir.lengthSq() > 0.01 ? player.moveDir.clone() : new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  player.dashDir.copy(d.normalize()); player.dashT = 0.18; player.dashCD = 0.75 * CH().dash * (blessed(40) ? 0.75 : 1); player.dashAt = T;
  // which way relative to where we face: forward lunge, back-step, or side-step
  const fwd = -d.x * Math.sin(player.yaw) - d.z * Math.cos(player.yaw), rgt = d.x * Math.cos(player.yaw) - d.z * Math.sin(player.yaw);
  const dir = Math.abs(fwd) >= Math.abs(rgt) ? (fwd >= 0 ? 'F' : 'B') : (rgt > 0 ? 'R' : 'L');
  player.dashAnim = { t0: T, dir };
  fovKick = dir === 'F' ? 12 : dir === 'B' ? -6 : 7;
  fx.dust(new V3(player.pos.x - d.x * 0.3, 0, player.pos.z - d.z * 0.3), 10, 0.9);
  sfx.swish(0.45); $('dashBtn').classList.add('cd');
  if (tut) tut.flags.dash = true;
}
function jump() {
  if (state !== 'play') return;
  if (player.ground) { player.vy = 7.6; player.ground = false; player.jumps = 1; sfx.swish(0.4); player.jumpAt = T; }
  else if (player.jumps < 2) { player.vy = 7.2; player.jumps = 2; player.flip = 0.001; sfx.swish(0.8); fovKick = Math.max(fovKick, 6); if (tut) tut.flags.flip = true; }
}
function updPlayer(dt) {
  if (talkNPC) { player.vel.set(0, 0, 0); player.moveDir.set(0, 0, 0); return; }   // standing still while talking
  if (finish) { updFinishPlayer(); return; }
  let ix = 0, iz = 0, turn = 0;   // movement input (not `fx`: that would hide the effects module)
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA) ix -= 1;
  if (keys.KeyD) ix += 1;
  if (keys.ArrowLeft) turn += 1;
  if (keys.ArrowRight) turn -= 1;
  if (joy.id !== null) { iz += joy.y; turn -= Math.sign(joy.x) * Math.max(0, Math.abs(joy.x) - 0.15) * 1.2; }
  player.yaw += turn * 2.4 * dt;
  const L = Math.hypot(ix, iz); if (L > 1) { ix /= L; iz /= L; }
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  const wx = ix * cy + iz * sy, wz = -ix * sy + iz * cy;
  player.moveDir.set(wx, 0, wz);
  const k = Math.min(1, dt * 12);
  player.wade = stage && stage.explore && player.y < 0.15 && world.inWater(player.pos);   // wading through ponds, paddies, the moat
  const spd = SPEED * CH().speed * (player.wade ? 0.55 : 1);
  if (player.wade && Math.hypot(player.vel.x, player.vel.z) > 1 && Math.random() < dt * 10) fx.sparks(new V3(player.pos.x, 0.25, player.pos.z), 3, 0xd8ecff, 1.6);
  player.vel.x += (wx * spd - player.vel.x) * k; player.vel.z += (wz * spd - player.vel.z) * k;
  const p = player.pos;
  p.x += player.vel.x * dt; p.z += player.vel.z * dt;
  if (player.dashT > 0) { player.dashT -= dt; p.addScaledVector(player.dashDir, 21 * dt); }
  if (player.dashCD > 0) { player.dashCD -= dt; if (player.dashCD <= 0) $('dashBtn').classList.remove('cd'); }
  world.collide(p, PLAYER_R, player.y);   // props and walls (low ones can be jumped); in a fight, the arena edge
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (!player.ground) {
    player.vy -= 22 * dt; player.y += player.vy * dt;
    if (player.y <= 0) { player.y = 0; player.vy = 0; player.ground = true; player.jumps = 0; landDip = 0.14; fx.dust(new V3(p.x, 0, p.z), 12, 1); sfx.thud(0.45); }
  }
  if (player.flip > 0) { player.flip += dt / 0.55; if (player.flip >= 1) { player.flip = 0; if (heroP.hips) heroP.hips.rotation.x = 0; } }
  player.bob += dt * sp * 1.9 * (player.ground ? 1 : 0); player.bobAmt += ((sp > 1 ? 1 : 0) - player.bobAmt) * Math.min(1, dt * 8);
}
function showJoy() {
  const j = $('joy');
  j.classList.toggle('hidden', joy.id === null);
  if (joy.id === null) return;
  j.style.left = joy.ox + 'px'; j.style.top = joy.oy + 'px';
  j.firstElementChild.style.transform = `translate(${joy.x * 56}px,${joy.y * 56}px)`;
}
function updLockUI() {
  const show = state === 'play' && needLock() && !talkNPC && !(DEV && QS.has('sim'));
  $('lockHint').classList.toggle('hidden', !show);
  $('cross').classList.toggle('hidden', !(state === 'play' && locked));
}
function resumeAndLock() { requestLock(); resume(); }

function selectWeapon(id) {
  if (!has(id)) { toast(`${WEAP[id].name} is locked: unlock it in the Arsenal`); return; }
  if (cur === id) return;
  cur = id; save.cur = id; sfx.click(); drawT = T; sfx.swish(0.3);
  if (WEAP[id].mode === 'throw' && !save['tip_' + id]) { toast('Tap or hold to throw'); save['tip_' + id] = 1; }
  if (WEAP[id].mode === 'fling' && !save.tip_fling) { toast('Swipe and release to fling the sickle'); save.tip_fling = 1; }
  buildWBar();
}

/* ============ key labels (keyboard layout) ============ */
// The browser's layout map names each physical key in the player's layout (Z for KeyW on AZERTY); where that
// isn't available, the layout is learned from the keys they press. Texts mark keys as {KeyW}, {Digit1} etc.
const layoutKeys = new Map();
try { navigator.keyboard?.getLayoutMap?.().then(m => { m.forEach((v, k) => layoutKeys.set(k, v)); refreshKeyLabels(); }).catch(() => {}); } catch (_) {}
function learnKey(e) {
  if (!/^Key[A-Z]$/.test(e.code) || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
  const v = e.key.toLowerCase(); if (layoutKeys.get(e.code) === v) return;
  layoutKeys.set(e.code, v); refreshKeyLabels();
}
const keyName = code => (layoutKeys.get(code) || code.replace(/^(Key|Digit)/, '')).toUpperCase();
const keyText = s => s.replace(/\{(\w+)\}/g, (_, c) => c === 'MOVE' ? ['KeyW', 'KeyA', 'KeyS', 'KeyD'].map(keyName).join('') : keyName(c));
function refreshKeyLabels() {
  $('lockHint').querySelector('span').innerHTML = keyText(`{MOVE} move · Mouse look · Shift dash · Space jump (twice = flip)<br>Hold left click + drag to slice · Quick click = fast slash<br>1-6 / wheel weapons · {KeyQ} Blade Storm · {KeyC} camera · {KeyP} pause`);
  $('menuHint').innerHTML = keyText(`{MOVE} move · mouse look · Shift dash · Space jump / flip<br>Hold click + drag to slice · tap to throw shuriken &amp; kunai<br>1-6 weapons · {KeyQ} Blade Storm / finisher · {KeyP} pause`);
  $('finishTip').firstElementChild.textContent = keyName('KeyQ');
  $('npcTalk').firstElementChild.textContent = keyName('KeyT'); $('npcDuel').firstElementChild.textContent = keyName('KeyR');
  if (tut && TUT_STEPS[tut.i]) { const st = TUT_STEPS[tut.i]; $('tutText').textContent = keyText(typeof st.d === 'function' ? st.d() : st.d); }
  if (guide && GUIDE_STEPS[guide.i]) $('tutText').textContent = guideText(GUIDE_STEPS[guide.i]);
}

/* ============ UI ============ */
const LAYERS = ['loading', 'menu', 'arsenal', 'chars', 'settings', 'pause', 'results', 'gameover'];
function showLayer(id) { for (const l of LAYERS) $(l).classList.toggle('hidden', l !== id); $('coinsBadge').classList.toggle('hidden', !['menu', 'arsenal', 'chars', 'results'].includes(id)); updCoins(); }
const updCoins = () => { $('coins').textContent = save.coins.toLocaleString(); };
function floater(text, pos, cls) {
  const f = $('floaters'); if (f.children.length > 24) f.firstChild.remove();
  const s = pos.isVector3 ? toScreen(pos) : pos; if (!s) return;
  const d = document.createElement('div'); d.className = 'fl ' + (cls || ''); d.textContent = text;
  d.style.left = s.x + 'px'; d.style.top = s.y + 'px'; d.style.fontSize = cls ? '' : '22px';
  f.appendChild(d); setTimeout(() => d.remove(), 1400);
}
function banner(t, sub) { const b = $('banner'); b.innerHTML = `${sub ? `<small>${sub}</small>` : ''}${t}`; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); }
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2300); }
function updHearts() { $('hearts').innerHTML = Array.from({ length: maxHearts }, (_, i) => weaponIconSVG('heart').replace('<svg', `<svg class="${i < hearts ? '' : 'off'}"`)).join(''); }
function updBoss() { if (bossE) $('bossFill').style.width = Math.max(0, bossE.hp / bossE.maxHp * 100) + '%'; }
function buildWBar() {
  $('wBar').innerHTML = WIDS.map((id, i) => `<button class="slot ${id === cur ? 'sel' : ''} ${has(id) ? '' : 'locked'}" data-w="${id}"><span class="k">${i + 1}</span>${weaponIconSVG(id)}<i class="cd"></i></button>`).join('');
  $('wBar').querySelectorAll('.slot').forEach(b => b.addEventListener('pointerdown', ev => { ev.stopPropagation(); selectWeapon(b.dataset.w); }));
}
let hudScore = -1;
function updHUD() {
  if (score !== hudScore) { $('score').textContent = score.toLocaleString(); hudScore = score; }
  $('hudCoinV').textContent = runCoins;
  $('prog').firstElementChild.style.width = (stage ? Math.min(100, killedCounted / stage.total * 100) : 0) + '%';
  const ft = finishTarget(), tip = $('finishTip'), s = ft && toScreen(new V3(ft.x, ft.y + ft.d.h * 0.75, ft.z));
  tip.classList.toggle('hidden', !s); if (s) { tip.style.left = s.x + 'px'; tip.style.top = s.y + 'px'; }
  const fl = ft ? (airborne() ? 'AIR FINISH' : 'FINISH') : 'STORM';
  if (tip.lastChild.textContent !== fl && ft) tip.lastChild.textContent = fl;
  const u = $('ultBtn'); u.style.setProperty('--p', ft ? 100 : ult); u.classList.toggle('ready', ult >= 100 || !!ft); u.classList.toggle('finish', !!ft);
  $('ultLbl').textContent = fl;
  $('wBar').querySelectorAll('.slot').forEach(b => { const id = b.dataset.w, mx = WEAP[id].cd(lvl(id) || 1); b.querySelector('.cd').style.height = (mx > 0 ? clamp(cds[id] / mx, 0, 1) * 100 : 0) + '%'; });
}
$('ultIcon').innerHTML = weaponIconSVG('storm');
$('ultBtn').addEventListener('pointerdown', e => { e.stopPropagation(); if (!tryFinish()) storm(); });
$('pauseBtn').addEventListener('pointerdown', e => { e.stopPropagation(); pause(); });
$('dashBtn').addEventListener('pointerdown', e => { e.stopPropagation(); dash(); });
$('jumpBtn').addEventListener('pointerdown', e => { e.stopPropagation(); jump(); });
$('camBtn').addEventListener('pointerdown', e => { e.stopPropagation(); cycleCam(); });

// menu
function updMenu() {
  const n = save.sel, th = n % 5 === 0 ? 3 : (n - 1) % 3, m = MAPS[mapIdx(stageMap(n))];
  $('stLabel').innerHTML = `STAGE ${n}<small>${n % 5 === 0 ? 'BOSS · ' : ''}${m.name.toUpperCase()} · ${themeName(th).toUpperCase()}</small>`;
  $('stPrev').disabled = n <= 1; $('stNext').disabled = n >= save.stage;
  const pin = save.map !== 'auto' ? MAPS[mapIdx(save.map)] : null, open = !pin || mapOpen(pin.id);
  $('mpLabel').innerHTML = pin ? `${pin.name.toUpperCase()}<small>${open ? pin.kanji + ' · ' + pin.desc : '🔒 REACH STAGE ' + (mapIdx(pin.id) + 1)}</small>` : `ALL MAPS<small>STAGES ROTATE THROUGH ${MAPS.filter(x => mapOpen(x.id)).length} / ${MAPS.length} UNLOCKED MAPS</small>`;
  $('exploreBtn').disabled = !mapOpen(stageMap(n));
  $('exploreBtn').classList.toggle('pulse', !save.exGuide && save.tutDone && mapOpen(stageMap(n)));   // nudge toward explore until its guide is done
  $('blessInfo').innerHTML = blessText();
  updCoins();
}
const click = (id, fn) => $(id).addEventListener('click', () => { audio.unlock(); sfx.click(); fn(); });
// the menu backdrop shows the map and time of day the selected stage will be played in
function menuWorld() { world.setExplore(false); world.setMap(stageMap(save.sel)); world.setTheme(save.sel % 5 === 0 ? 3 : (save.sel - 1) % 3); }
click('stPrev', () => { save.sel = Math.max(1, save.sel - 1); updMenu(); menuWorld(); });
click('stNext', () => { save.sel = Math.min(save.stage, save.sel + 1); updMenu(); menuWorld(); });
const MAP_OPTS = ['auto', ...MAPS.map(m => m.id)];
const cycleMap = d => { save.map = MAP_OPTS[(MAP_OPTS.indexOf(save.map) + d + MAP_OPTS.length) % MAP_OPTS.length]; persist(); updMenu(); menuWorld(); };
click('mpPrev', () => cycleMap(-1));
click('mpNext', () => cycleMap(1));
click('exploreBtn', () => startExplore(stageMap(save.sel)));
click('playBtn', () => save.tutDone ? playStage(save.sel, false) : startTutorial());
click('tutorialBtn', () => startTutorial());
click('charsBtn', () => { state = 'chars'; vmMode = 'hand'; chSel = save.char; showLayer('chars'); renderChars(); });
click('chBack', () => { state = 'menu'; showLayer('menu'); if (chShown !== save.char) { buildHero(save.char); chShown = save.char; } updMenu(); });
let chSel = 'kage', chShown = 'kage';
function renderChars() {
  if (chShown !== chSel) { buildHero(chSel); chShown = chSel; }
  $('chList').innerHTML = CHARS.map(c => `<button class="wCard ${chSel === c.id ? 'sel' : ''} ${save.chars[c.id] ? '' : 'locked'}" data-id="${c.id}"><div><div class="nm">${c.name}</div><div class="st">${save.char === c.id ? 'Playing' : save.chars[c.id] ? c.title : '🔒 ' + c.cost.toLocaleString()}</div></div></button>`).join('');
  $('chList').querySelectorAll('.wCard').forEach(b => b.addEventListener('click', () => { sfx.click(); chSel = b.dataset.id; renderChars(); }));
  const c = CHARS.find(c => c.id === chSel), own = save.chars[c.id], btn = $('chBuy');
  $('chName').textContent = c.name; $('chTitle').textContent = c.title; $('chPerk').textContent = c.perk;
  btn.textContent = save.char === c.id ? 'Playing' : own ? 'Play as ' + c.name : 'Unlock · ' + c.cost.toLocaleString();
  btn.disabled = save.char === c.id || (!own && save.coins < c.cost);
}
click('chBuy', () => {
  const c = CHARS.find(c => c.id === chSel);
  if (!save.chars[c.id]) { if (save.coins < c.cost) return; save.coins -= c.cost; save.chars[c.id] = true; sfx.coin(); }
  save.char = c.id; persist(); updCoins(); renderChars();
});

click('arsenalBtn', () => { state = 'arsenal'; showLayer('arsenal'); vmMode = 'display'; renderArsenal(); if (!save.shopTour) startTour(false); });
click('arsHelp', () => startTour(false));
click('settingsBtn', () => { state = 'settings'; showLayer('settings'); updToggles(); });
click('arsBack', () => { state = 'menu'; vmMode = 'hand'; showLayer('menu'); updMenu(); });
click('setBack', () => { state = 'menu'; showLayer('menu'); updMenu(); });

// arsenal
let arsSel = 'katana';
const PERK = {
  katana: () => 'Slice falling halves again in mid-air for bonus coins',
  shuriken: l => { const W = WEAP.shuriken, n = W.count(l), p = W.pierce(l); return `${n} star${n > 1 ? 's' : ''} per throw · pierces ${p} enem${p > 1 ? 'ies' : 'y'}`; },
  kunai: l => `Pierces ${WEAP.kunai.pierce(l)} · one-hit kills armored samurai`,
  kusarigama: () => "Cuts every enemy along the sickle's arc",
  naginata: () => 'Cleaves every enemy along the whole swipe line',
  horoku: l => `Blast radius ${WEAP.horoku.radius(l).toFixed(1)} m · cuts every enemy caught in it`,
};
const statRow = (n, v, now, next) => `<div class="stat"><span class="lbl">${n}</span><i><b style="width:${Math.round(clamp(v, 0.05, 1) * 100)}%"></b></i><span class="val">${now}${next !== undefined && next !== now ? ` <em>→ ${next}</em>` : ''}</span></div>`;
function statBars(id) {
  const own = save.w[id], l = Math.max(1, own), nx = own && own < 5 ? own + 1 : 0, W = WEAP[id];
  const rng = x => W.mode === 'throw' ? 'Long' : W.range(x).toFixed(1) + ' m';
  const spd = x => W.cd(x) ? W.cd(x).toFixed(2) + ' s' : 'Instant';
  const rg = W.mode === 'throw' ? 1 : W.range(l) / 32, sp = W.cd(l) ? clamp(0.12 / W.cd(l), 0, 1) : 1;
  return statRow('Power', W.dmg(l) / 6, W.dmg(l), nx ? W.dmg(nx) : undefined)
    + statRow('Range', rg, rng(l), nx ? rng(nx) : undefined)
    + statRow('Speed', sp, spd(l), nx ? spd(nx) : undefined);
}
function renderArsenal() {
  const list = [...WIDS, 'vitality'];
  $('wList').innerHTML = list.map(id => {
    const isV = id === 'vitality', l = isV ? save.hearts : save.w[id];
    const st = isV ? `${5 + save.hearts} hearts` : l ? `Level ${l}` : `🔒 ${WEAP[id].cost}`;
    return `<button class="wCard ${arsSel === id ? 'sel' : ''} ${!isV && !l ? 'locked' : ''}" data-id="${id}">${weaponIconSVG(isV ? 'heart' : id)}<div><div class="nm">${isV ? 'Vitality' : WEAP[id].name}</div><div class="st">${st}</div></div></button>`;
  }).join('');
  $('wList').querySelectorAll('.wCard').forEach(b => b.addEventListener('click', () => { sfx.click(); arsSel = b.dataset.id; renderArsenal(); }));
  const id = arsSel, buy = $('wdBuy'), tr = $('wdTry');
  if (id === 'vitality') {
    $('wdName').textContent = 'Vitality'; $('wdDesc').textContent = 'Train your body. Every level adds one extra heart to survive more hits.';
    const hv = 5 + save.hearts;
    $('wdStats').innerHTML = statRow('Hearts', hv / (6 + HEART_UP.length), hv, save.hearts < HEART_UP.length ? hv + 1 : undefined);
    $('wdPerk').textContent = 'Up to 9 hearts. Refilled at the start of every stage.';
    $('wdLvlTxt').textContent = `Level ${save.hearts} / ${HEART_UP.length}`;
    $('wdLvl').innerHTML = HEART_UP.map((_, i) => `<s class="${i < save.hearts ? 'on' : ''}"></s>`).join('');
    const c = HEART_UP[save.hearts];
    buy.innerHTML = c ? `Upgrade <span class="coinI" style="margin-left:8px"></span>${c}` : 'Maxed'; buy.disabled = !c || save.coins < c; tr.classList.add('hidden');
  } else {
    const W = WEAP[id], l = save.w[id];
    displayId = id;
    $('wdName').textContent = W.name; $('wdDesc').textContent = W.desc; $('wdStats').innerHTML = statBars(id);
    const pl = Math.max(1, l), pn = l && l < 5 ? PERK[id](l + 1) : '';
    $('wdPerk').innerHTML = PERK[id](pl) + (pn && pn !== PERK[id](pl) ? `<em>Next level: ${pn}</em>` : '');
    $('wdLvlTxt').textContent = l ? `Level ${l} / 5` : `Locked · unlock for ${W.cost} coins`;
    $('wdLvl').innerHTML = [0, 1, 2, 3, 4].map(i => `<s class="${i < l ? 'on' : ''}"></s>`).join('');
    if (!l) { buy.innerHTML = `Unlock <span class="coinI" style="margin-left:8px"></span>${W.cost}`; buy.disabled = save.coins < W.cost; }
    else { const c = W.up[l - 1]; buy.innerHTML = c ? `Upgrade <span class="coinI" style="margin-left:8px"></span>${c}` : 'Maxed'; buy.disabled = !c || save.coins < c; }
    tr.classList.toggle('hidden', !!l || !adsOK()); tr.disabled = sdk.adBusy || trial === id; tr.textContent = trial === id ? 'Ready for next stage' : 'Try 1 stage';
  }
  updCoins();
}
click('wdBuy', () => {
  const id = arsSel;
  if (id === 'vitality') { const c = HEART_UP[save.hearts]; if (!c || save.coins < c) return; save.coins -= c; save.hearts++; }
  else { const W = WEAP[id], l = save.w[id], c = l ? W.up[l - 1] : W.cost; if (!c || save.coins < c) return; save.coins -= c; save.w[id] = l + 1; if (!l) save.cur = id; }
  persist(); sfx.coin(); renderArsenal();
});
click('wdTry', async () => {
  const id = arsSel; if (save.w[id]) return;
  const ok = await runAd('rewarded'); lastAdAt = performance.now();
  if (ok) { trial = id; toast(`${WEAP[id].name} unlocked for your next stage!`); }
  renderArsenal();
});

// settings
function updToggles() {
  const t = (id, on, a = 'ON', b = 'OFF') => { const el = $(id); el.textContent = on ? a : b; el.classList.toggle('on', on); };
  t('setSfx', save.sfx); t('setMus', save.mus); t('pSfx', save.sfx); t('pMus', save.mus);
  t('setCam', true, CAM_NAMES[save.cam].toUpperCase());
  t('setQ', quality === 'high', 'HIGH', 'LOW'); t('setBlood', save.blood);
}
function applyAudio() { audio.set(save.sfx, save.mus, sdk.mute || sdk.adMuted); }
for (const [id, key] of [['setSfx', 'sfx'], ['pSfx', 'sfx'], ['setMus', 'mus'], ['pMus', 'mus']]) click(id, () => { save[key] = !save[key]; persist(); applyAudio(); updToggles(); });
click('setCam', () => cycleCam());
click('setQ', () => { quality = quality === 'high' ? 'low' : 'high'; save.q = quality; persist(); applyQuality(); updToggles(); });
click('setBlood', () => { save.blood = !save.blood; CAP.blood = fx.blood = save.blood; persist(); updToggles(); });
$('resetChk').addEventListener('change', e => { $('resetBtn').disabled = !e.target.checked; });
{
  let hold = null, start = 0;
  const bar = $('resetBtn').querySelector('i');
  const stop = () => { if (hold) cancelAnimationFrame(hold); hold = null; bar.style.width = 0; };
  const step = () => {
    const p = (performance.now() - start) / 3000; bar.style.width = Math.min(100, p * 100) + '%';
    if (p >= 1) { stop(); clearData(SAVE_KEY); save = defSave(); save.q = quality; persist(); $('resetChk').checked = false; $('resetBtn').disabled = true; applyAudio(); updToggles(); toast('Progress reset'); return; }
    hold = requestAnimationFrame(step);
  };
  $('resetBtn').addEventListener('pointerdown', () => { if ($('resetBtn').disabled) return; start = performance.now(); hold = requestAnimationFrame(step); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('resetBtn').addEventListener(ev, stop));
}

// pause / results / game over
click('resumeBtn', resumeAndLock);
click('restartBtn', () => { bankRunCoins(); if (stage.tutorial) startTutorial(); else if (stage.explore) startExplore(stage.map); else playStage(stage.n, true); });
click('skipTutBtn', () => { if (guide) { endGuide(false); resumeAndLock(); return; } save.tutDone = true; persist(); toMenu(); });
click('tutSkip', () => { if (guide) { endGuide(false); return; } save.tutDone = true; persist(); toMenu(); });   // the tutorial card's own skip button
click('guideBtn', () => { resumeAndLock(); startGuide(); });   // explore: replay the explorer's guide
click('quitBtn', toMenu);
click('resNext', () => playStage(save.stage > stage.n ? stage.n + 1 : stage.n, true));
click('resMenu', toMenu);
click('resDouble', async () => {
  if (resDoubled) return;
  const ok = await runAd('rewarded'); lastAdAt = performance.now();
  if (ok) { resDoubled = true; save.coins += lastCoins; persist(); $('resCoins').innerHTML = `<span class="coinI"></span>+${lastCoins * 2}`; sfx.coin(); toast('Coins doubled!'); }
  updAdUI(); updCoins();
});
click('reviveBtn', async () => {
  if (revived) return;
  const ok = await runAd('rewarded'); lastAdAt = performance.now();
  if (ok) revive(); else updAdUI();
});
click('retryBtn', () => { bankRunCoins(); playStage(stage.n, true); });
click('goMenu', toMenu);
function updAdUI() {
  $('adwait').classList.toggle('hidden', !sdk.adBusy);
  const ok = adsOK();
  $('resDouble').classList.toggle('hidden', !ok); $('resDouble').disabled = sdk.adBusy || resDoubled;
  $('reviveBtn').classList.toggle('hidden', !ok || revived); $('reviveBtn').disabled = sdk.adBusy;
  if (state === 'arsenal') renderArsenal();
}

/* ============ camera modes & hero ============ */
const CAM_MODES = ['fp', 'tp', 'wide'], CAM_NAMES = { fp: 'First person', tp: 'Third person', wide: 'Wide action' };
let hero = null;
const heroP = {}, heroW = {};
function buildHero(id = save.char) {
  if (hero) scene.remove(hero);
  hero = batchParts(buildPlayer(id)); hero.visible = false; scene.add(hero);
  ['hips', 'torso', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR', 'handR', 'ribbon', 'knot'].forEach(n => heroP[n] = hero.getObjectByName(n));
  buildHeroTails();
  for (const id of WIDS) {
    const m = WEAPON_MODELS[id](); m.rotation.set(Math.PI / 2 + 0.25, 0, 0); m.visible = false;
    m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    heroP.handR.add(m); heroW[id] = m;
  }
}
// The headband and obi-knot tails are cloth (cloth.js): the stiff strips they replace are hidden, and each tail
// takes its colour, length and width from the strip it replaces.
const heroTails = [], _tUp = new V3(), _tSide = new V3(), _tBack = new V3();
let clothMat = null;
function buildHeroTails() {
  for (const t of heroTails) t.tail.dispose(); heroTails.length = 0;
  clothMat = clothMat || Object.assign(MATS.body.clone(), { side: THREE.DoubleSide });
  for (const [piv, opt] of [[heroP.ribbon, { segs: 9, flutter: 0.2, stretch: 0.85, drag: 4, follow: 12 }], [heroP.knot, { segs: 5, flutter: 0.15, stretch: 1.1, drag: 4, follow: 12 }]]) {
    if (!piv) continue;
    for (const m of piv.children) {
      if (!m.isMesh || m.userData.proxy) continue;
      m.geometry.computeBoundingBox(); const sz = m.geometry.boundingBox.getSize(new V3());
      const color = m.geometry.attributes.color ? new THREE.Color().fromBufferAttribute(m.geometry.attributes.color, 0) : new THREE.Color(0xb3201a);
      heroTails.push({ piv, off: m.position.clone(), tail: new ClothTail(scene, { len: sz.y * (opt.stretch || 1), width: sz.x, color, mat: clothMat, segs: opt.segs, flutter: opt.flutter, drag: opt.drag, follow: opt.follow }) });   // heavy cloth: little flutter, damped swing
    }
    piv.visible = false;
  }
}
// What the cloth stays outside of, rebuilt each frame from the posed rig (2.5 cm clear, for the cloth's thickness):
// the trunk's real outline (RIG.trunk: the body's 4 cm slices at rest, tested in the frame of the hips or torso joint,
// whichever the point is nearer, so it follows the spine as it bends), the head round the headband, and the scabbard.
const CLOTH_GAP = 0.025, _cq = new V3(), _cs = new V3(), _ce = new V3();
function trunkCollider(piv, base, yMin, yMax) {
  const inv = piv.matrixWorld.clone().invert(), M = piv.matrixWorld, T = RIG.trunk || [];
  return { out: p => {
    _cq.copy(p).applyMatrix4(inv).add(base);   // the point in the body's rest (model) space
    if (_cq.y < yMin || _cq.y > yMax || !T.length) return;
    let r = T[0]; for (const q of T) if (Math.abs(q.y - _cq.y) < Math.abs(r.y - _cq.y)) r = q;
    const a = r.a + CLOTH_GAP, b = r.b + CLOTH_GAP, dx = (_cq.x - r.xc) / a, dz = (_cq.z - r.zc) / b, d = Math.hypot(dx, dz);
    if (d >= 1) return;
    if (d < 1e-4) _cq.z = r.zc - b; else { _cq.x = r.xc + dx / d * a; _cq.z = r.zc + dz / d * b; }   // out to the surface, straight out from the middle
    p.copy(_cq.sub(base).applyMatrix4(M));
  } };
}
function ellipsoidCollider(piv, c, rad) {
  const inv = piv.matrixWorld.clone().invert(), M = piv.matrixWorld;
  return { out: p => {
    _cq.copy(p).applyMatrix4(inv).sub(c); _cs.set(_cq.x / rad.x, _cq.y / rad.y, _cq.z / rad.z); const d = _cs.length();
    if (d >= 1 || d < 1e-5) return;
    _cs.divideScalar(d); p.set(_cs.x * rad.x, _cs.y * rad.y, _cs.z * rad.z).add(c).applyMatrix4(M);
  } };
}
function capsuleCollider(piv, a, b, r) {
  const A = piv.localToWorld(a.clone()), B = piv.localToWorld(b.clone()), AB = B.clone().sub(A), L2 = AB.lengthSq();
  return { out: p => {
    const t = Math.max(0, Math.min(1, _ce.subVectors(p, A).dot(AB) / L2)); _cq.copy(A).addScaledVector(AB, t);
    _ce.subVectors(p, _cq); const d = _ce.length(); if (d < r && d > 1e-5) p.copy(_cq).addScaledVector(_ce, r / d);
  } };
}
const SCAB_A = new V3(-0.06 + 0.45 * Math.sin(0.78), 0.24 - 0.45 * Math.cos(0.78), -0.25), SCAB_B = new V3(-0.06 - 0.45 * Math.sin(0.78), 0.24 + 0.45 * Math.cos(0.78), -0.25);
function heroColliders() {
  const split = RIG.spine.y;
  return [
    trunkCollider(heroP.hips, RIG.hips, -9, split + 0.02),
    trunkCollider(heroP.torso, RIG.spine, split - 0.02, 9),
    ellipsoidCollider(heroP.head, new V3(0, 0.19, 0.045), new V3(0.105 + CLOTH_GAP, 0.14 + CLOTH_GAP, 0.125 + CLOTH_GAP)),
    capsuleCollider(heroP.torso, SCAB_A, SCAB_B, 0.026 + CLOTH_GAP),
  ];
}
function updHeroTails(dt) {
  const show = hero.visible;
  for (const t of heroTails) { t.tail.mesh.visible = show; if (!show) t.tail.ready = false; }
  if (!show || !heroTails.length) return;
  hero.updateMatrixWorld(true);
  const H = heroP.head.matrixWorld;
  _tSide.set(1, 0, 0).transformDirection(H); _tBack.set(0, 0, -1).transformDirection(H);
  for (const t of heroTails) t.tail.update(dt, t.piv.localToWorld(t.off.clone()), _tSide, _tBack, heroColliders(), T);
}
function cycleCam() {
  save.cam = CAM_MODES[(CAM_MODES.indexOf(save.cam) + 1) % CAM_MODES.length]; persist();
  toast('Camera: ' + CAM_NAMES[save.cam]); sfx.click(); updToggles();
  if (tut) tut.flags.cam = (tut.flags.cam || 0) + 1;
}
function throwOrigin() {
  if (save.cam === 'fp') return camera.localToWorld(new V3(0.28, -0.22, -0.5));
  hero.updateMatrixWorld(true);
  return heroP.handR.getWorldPosition(new V3());
}
// Directional dash poses, blended over the normal pose with a quick-in / held / eased-out envelope (0.42 s).
// Hero local +x is the player's left. Values: hips x/z, drop, leg L x/z/knee, leg R x/z/knee, arm R x/z/elbow, arm L x/z/elbow, head, twist
const DASH_POSE = {
  F: [0.6, 0, 0.14, -1.0, 0, 0.5, 0.75, 0, 1.0, 0.9, 0.2, -0.3, 0.8, -0.2, -0.4, -0.5, 0],     // low lunge, blade trailing
  B: [-0.28, 0, 0.1, 0.55, 0, 0.25, -0.35, 0, 0.75, -1.25, -0.2, -0.7, -0.9, 0.3, -0.9, 0.2, 0],   // back-step, blade up in guard
  R: [0.15, 0.3, 0.12, -0.1, -0.7, 0.35, 0.1, -0.05, 0.1, -0.3, 0.6, -0.4, -0.6, -0.5, -0.6, 0, -0.25],   // side-step to the right
  L: [0.15, -0.3, 0.12, 0.1, 0.05, 0.1, -0.1, 0.7, 0.35, -0.6, 0.5, -0.6, -0.3, -0.6, -0.4, 0, 0.25],    // side-step to the left
};
function dashWeight() {
  const A = player.dashAnim; if (!A) return 0;
  const u = T - A.t0; if (u > 0.42) { player.dashAnim = null; return 0; }
  return smooth(clamp(u / 0.05, 0, 1)) * (1 - smooth(clamp((u - 0.2) / 0.22, 0, 1)));
}
function dashPose(P) {
  const w = dashWeight();
  if (w <= 0) return;   // animHero eases any roll left over from a side-step back out
  const v = DASH_POSE[player.dashAnim.dir], L = (o, ax, t) => { o.rotation[ax] += (t - o.rotation[ax]) * w; };
  L(P.hips, 'x', v[0]); L(P.hips, 'z', v[1]); P.hips.position.y += (RIG.hips.y - v[2] - P.hips.position.y) * w;
  L(P.legL, 'x', v[3]); L(P.legL, 'z', v[4]); L(P.kneeL, 'x', v[5]); L(P.legR, 'x', v[6]); L(P.legR, 'z', v[7]); L(P.kneeR, 'x', v[8]);
  L(P.armR, 'x', v[9]); L(P.armR, 'z', v[10]); L(P.elbowR, 'x', v[11]); L(P.armL, 'x', v[12]); L(P.armL, 'z', v[13]); L(P.elbowL, 'x', v[14]);
  L(P.head, 'x', v[15]); L(P.torso, 'y', v[16]);
}
function animHero(dt) {
  const preview = state === 'chars';
  const show = preview || ((save.cam !== 'fp' || cineW > 0.35) && inGame());   // the cinematic shows the hero even in first person
  hero.visible = show;
  if (!show) return;
  const P = heroP, k = 1 - Math.exp(-dt * 14), sp = preview ? 0 : clamp(Math.hypot(player.vel.x, player.vel.z) / SPEED, 0, 1);
  hero.position.set(player.pos.x, player.y - (player.wade ? 0.38 : 0), player.pos.z);   // knee-deep when wading
  hero.rotation.y = player.yaw + Math.PI;
  if (preview) { hero.position.set(0, 0, 0); hero.rotation.y = 0.35 + Math.sin(T * 0.5) * 0.6; }
  player.ph += dt * sp * 11;
  const s = Math.sin(player.ph) * sp, c = Math.cos(player.ph), idle = 1 - sp, br = Math.sin(T * 2.2);   // br: breathing
  // sideways speed (hero leans into strafes), landing absorb and hit flinch drive the overlays below
  const rgt = preview ? 0 : clamp((player.vel.x * Math.cos(player.yaw) - player.vel.z * Math.sin(player.yaw)) / SPEED, -1, 1);
  const ld = landDip / 0.14, hurt = player.hurtT > 0 ? Math.sin(Math.PI * player.hurtT / 0.35) : 0;
  player.hurtT = Math.max(0, (player.hurtT || 0) - dt);
  const kz = (o, v) => { o.rotation.z += (v - o.rotation.z) * k; };
  // stride while running; a loose, knees-bent guard stance at rest
  P.legL.rotation.x = -s * 0.9 - 0.14 * idle; P.legR.rotation.x = s * 0.9 + 0.1 * idle;
  P.kneeL.rotation.x = 0.1 + Math.max(0, c) * 1.2 * sp + 0.2 * idle; P.kneeR.rotation.x = 0.1 + Math.max(0, -c) * 1.2 * sp + 0.12 * idle;
  kz(P.legL, -0.08 * idle); kz(P.legR, 0.08 * idle); kz(P.hips, -rgt * 0.22); kz(P.armL, 0.25 * idle); P.torso.rotation.z *= 1 - k;
  if (player.flip > 0) {   // tucked front flip, arms hugging the shins
    const f = Math.sin(Math.PI * player.flip);
    P.hips.rotation.x = Math.PI * 2 * smooth(player.flip);
    P.legL.rotation.x = P.legR.rotation.x = -1.5 * f; P.kneeL.rotation.x = P.kneeR.rotation.x = 2.2 * f;
  } else if (!player.ground) {   // knees tucked on the way up, legs reaching for the ground on the way down
    const up = clamp(player.vy / 7, 0, 1), dn = clamp(-player.vy / 9, 0, 1);
    rotTo(P.hips, 0.1 + 0.15 * up - 0.1 * dn, k);
    P.legL.rotation.x = -0.9 - 0.4 * up + 0.4 * dn; P.legR.rotation.x = 0.3 - 0.5 * up - 0.1 * dn;
    P.kneeL.rotation.x = 1.4 + 0.4 * up - 0.8 * dn; P.kneeR.rotation.x = 0.6 + 0.6 * up - 0.3 * dn;
  } else rotTo(P.hips, 0.12 + sp * 0.2 + (player.dashT > 0 ? 0.5 : 0) + ld * 0.35 - hurt * 0.5, k);
  P.hips.position.y = RIG.hips.y + Math.abs(c) * 0.05 * sp + br * 0.008 * idle - ld * 0.2;
  if (ld > 0) { P.legL.rotation.x -= ld * 0.55; P.legR.rotation.x -= ld * 0.35; P.kneeL.rotation.x += ld * 1.1; P.kneeR.rotation.x += ld * 0.8; }
  const air = player.flip > 0 ? Math.sin(Math.PI * player.flip) : 0;
  P.armL.rotation.x = s * 0.7 - 0.35 * idle - 1.1 * air - 0.8 * hurt; P.elbowL.rotation.x = -0.8 - 0.5 * idle - 0.6 * air;
  P.torso.rotation.x = br * 0.03 * idle - hurt * 0.25;
  P.head.rotation.x = -player.pitch * 0.4 - hurt * 0.35;
  P.ribbon.rotation.x = 0.75 + sp * 0.9 + (player.ground ? 0 : 0.7) + (player.dashT > 0 ? 0.6 : 0) + Math.sin(T * 13) * 0.08 * (0.3 + sp);   // headband tails stream behind
  P.ribbon.rotation.z = Math.sin(T * 7) * 0.06 * (0.3 + sp) - rgt * 0.3;
  if (swing.on) {
    // snappy start, decelerating follow-through: the hips drive, the shoulders whip round, the off hand counterbalances
    const t = Math.min(1, swing.t), e = 1 - Math.pow(1 - t, 3), dir = swing.d.x >= 0 ? 1 : -1, big = swing.dur > 0.2 ? 1.35 : 1;
    P.armR.rotation.x = -2.6 + e * 3.0; P.armR.rotation.z = dir * (0.9 - e * 1.9) * 0.6 * big;
    P.elbowR.rotation.x = -0.6 + e * 0.5; P.torso.rotation.y = dir * (0.7 - e * 1.5) * big;
    P.hips.rotation.x += Math.sin(Math.PI * t) * 0.22 * big;
    P.armL.rotation.x = -0.5 + e * 0.3; P.armL.rotation.z = -dir * (0.2 + e * 0.5); P.elbowL.rotation.x = -1.0;
    P.head.rotation.y = -P.torso.rotation.y * 0.6;
  } else if (jab > 0) {
    rotTo(P.armR, -1.7, 1 - Math.exp(-dt * 40)); P.elbowR.rotation.x = -0.1;
    P.torso.rotation.y += (-0.35 - P.torso.rotation.y) * k; P.armL.rotation.x = 0.4;
  } else {
    const k2 = 1 - Math.exp(-dt * 9);   // the blade drifts back to guard instead of snapping
    rotTo(P.armR, -0.7 - 0.6 * air - 0.2 * idle - 1.4 * Math.max(0, 1 - (T - drawT) / 0.3), k2);   // a new weapon is drawn up over the shoulder P.armR.rotation.z *= 1 - k2; rotTo(P.elbowR, -0.9 - 0.4 * air, k2);
    P.torso.rotation.y += (-s * 0.22 - P.torso.rotation.y) * k2;   // shoulders counter-swing the stride
    P.head.rotation.y = -P.torso.rotation.y * 0.8;
  }
  if (finish) finishPose(P); else dashPose(P);
  const shown = finish ? 'katana' : cur;
  for (const id of WIDS) heroW[id].visible = id === shown;
  const sh = finish && finish.v.sheathed && finish.v.sheathed.some(([a, b]) => T - finish.t0 >= a && T - finish.t0 < b);
  heroW.katana.rotation.x = sh ? -Math.PI / 2 - 0.35 : Math.PI / 2 + 0.25;   // reversed at the hip = sheathed
  const sk = heroW.kusarigama.getObjectByName('sickle'); if (sk) sk.visible = !fling.on;
}

/* ============ explore mode ============ */
// Free roam over a whole map: no waves, just practice dummies to slice and hidden charms (omamori) to find.
// Each charm pays once (remembered per map); finding them all pays a bonus.
const CHARM_COINS = 25, CHARM_ALL = 150;
function startExplore(id, fromTut = false) {   // fromTut: straight after the first tutorial, the guide starts at once and leads on to stage 1
  clearField();
  world.setExplore(true); world.setMap(id);
  const got = save.charms[id] || [];
  world.charms.forEach((c, i) => { c.found = got.includes(i); c.g.visible = !c.found; });
  stage = { n: 0, explore: true, fromTut, map: id, boss: false, queue: [], total: world.charms.length, theme: EXPLORE_THEME[id] ?? 2, speedMul: 1 };
  world.setTheme(stage.theme);
  maxHearts = heartsMax(); hearts = maxHearts;
  score = 0; runCoins = 0; comboN = 0; ult = 100; invuln = 0;
  stats = { kills: 0, maxCombo: 0, dmg: 0, air: 0, counters: 0, perfect: 0, clean: 0 };
  killedCounted = got.length; revived = false; bossE = null; strokeKills.clear(); timeScale = 1; slowT = 0;
  player.pos.set(0, 0, 4); player.vel.set(0, 0, 0); player.yaw = 0; player.pitch = -0.06; player.dashT = player.dashCD = 0; player.y = player.vy = player.flip = 0; player.ground = true;
  trial = null; if (!has(cur)) cur = 'katana';
  for (const id of WIDS) cds[id] = 0;
  for (const d of world.dummies) { d.e = null; d.t = 0; spawnDummy(d); }
  for (let i = 0; i < npcCap(); i++) spawnNPCNear(10, 75);
  state = 'play'; vmMode = 'hand'; tut = null;
  showLayer(null); $('hud').classList.remove('hidden'); $('bossBar').classList.add('hidden'); $('tut').classList.add('hidden'); $('tutBox').classList.add('hidden');
  const m = MAPS[mapIdx(id)];
  dayT = 0.2; wx = { from: 'clear', to: 'clear', k: 1, t: rnd(60, 100) }; skyAcc = 9; envAcc = 9; updSky(0);   // morning, clear skies
  exploreTag();
  updHearts(); buildWBar(); updHUD();
  banner(m.name, 'EXPLORE · ' + m.kanji); music('menu');
  $('minimap').classList.remove('hidden'); mmStatic = null;
  gameplay(true); requestLock(); updLockUI();
  const devGuide = DEV && QS.has('guide');
  if (!save.exGuide || devGuide || fromTut) after(devGuide ? 0.5 : fromTut ? 2 : GUIDE_DELAY, startGuide);   // first visit: the explorer's guide joins after a look round (dev: &guide)
}
function spawnDummy(d) { d.e = spawnEnemy('dummy', d.x, d.z, true); d.e.root.rotation.y = Math.atan2(-d.x, 4 - d.z); fx.dust(new V3(d.x, 0, d.z), 12, 0.8); }
function updExplore(dt) {
  if (!stage.explore) return;
  for (const d of world.dummies) if (!enemies.includes(d.e) && (d.t += dt) > 4) { d.t = 0; spawnDummy(d); }   // practice dummies stand back up
  updWisps(dt); updGuide(); updPropCuts(); updSky(dt); updCitizens(dt);
  const got = save.charms[stage.map] = save.charms[stage.map] || [];
  const pl = world.local(player.pos);
  world.charms.forEach((c, i) => {
    if (c.found || Math.hypot(c.x - pl.x, c.z - pl.z) > 1.6 || player.y > 2.2) return;
    c.found = true; c.g.visible = false; got.push(i); killedCounted = got.length;
    save.coins += CHARM_COINS; sfx.coin(); fx.sparks(new V3(player.pos.x, 1.1, player.pos.z), 40, 0xffe08a, 4);
    floater(`CHARM FOUND ${got.length}/${world.charms.length}  +${CHARM_COINS}`, { x: vw / 2, y: vh * 0.36 }, 'big');
    const total = charmCount(), bl = BLESSINGS.find(b => b.n === total), nx = BLESSINGS.find(b => b.n > total);
    if (bl) { banner('BLESSING', bl.t); sfx.win(); maxHearts = heartsMax(); hearts = Math.min(maxHearts, hearts + 1); updHearts(); }
    else if (nx) floater(`${nx.n - total} more charm${nx.n - total > 1 ? 's' : ''} for a blessing: ${nx.t}`, { x: vw / 2, y: vh * 0.42 }, '');
    if (got.length === world.charms.length) { save.coins += CHARM_ALL; banner('ALL CHARMS FOUND', `+${CHARM_ALL}`); sfx.win(); }
    if (i === charmMark) charmMark = -1;
    errandStep('charm');
    persist();
    exploreTag();
  });
}
// minimap (explore): centred on you; the tile's outline is drawn once and repeated, then charms, rivals and you on top
let mmStatic = null, mmTick = 0;
const MM_SPAN = 130;   // metres across
function drawMinimap() {
  if (!stage || !stage.explore || state !== 'play' || (mmTick++ % 3)) return;
  const cv = $('minimap'), g = cv.getContext('2d'), S = cv.width, P = world.tile, k = S / MM_SPAN, base = '#6d7d55';
  if (!mmStatic) {
    mmStatic = document.createElement('canvas'); mmStatic.width = mmStatic.height = Math.ceil(P * k);
    const c = mmStatic.getContext('2d'), X = x => (x + P / 2) * k, C = P / 2 * k;
    c.fillStyle = base; c.fillRect(0, 0, mmStatic.width, mmStatic.height);
    for (const o of world.mm) {
      c.fillStyle = c.strokeStyle = o.col;
      if (o.k === 'c') { c.beginPath(); c.arc(X(o.x), X(o.z), Math.max(1, o.r * k), 0, 7); c.fill(); }
      else if (o.k === 'r') { c.save(); c.translate(X(o.x), X(o.z)); c.rotate(-o.rot); c.fillRect(-o.hw * k, -o.hd * k, o.hw * 2 * k, o.hd * 2 * k); c.restore(); }
      else if (o.k === 'seg') { c.lineWidth = Math.max(1.5, o.w * k); c.beginPath(); c.moveTo(X(o.x0), X(o.z0)); c.lineTo(X(o.x1), X(o.z1)); c.stroke(); }
      else if (o.k === 'ring') {
        c.lineWidth = Math.max(1.5, o.w * 2 * k);
        const cut = [...o.gaps].map(a => [a - o.gh, a + o.gh]).sort((a, b) => a[0] - b[0]);
        for (let i = 0; i < cut.length; i++) { const a0 = cut[i][1], a1 = i + 1 < cut.length ? cut[i + 1][0] : cut[0][0] + Math.PI * 2; c.beginPath(); c.arc(C, C, o.r * k, a0 - Math.PI / 2, a1 - Math.PI / 2); c.stroke(); }
      }
    }
  }
  const pl = world.local(player.pos), wrap = v => v - Math.round(v / P) * P, M = S / 2;
  g.clearRect(0, 0, S, S); g.save(); g.beginPath(); g.arc(M, M, M, 0, 7); g.clip(); g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) g.drawImage(mmStatic, M - (pl.x + P / 2) * k + dx * P * k, M - (pl.z + P / 2) * k + dz * P * k);
  const dot = (x, z, r, fill) => { g.fillStyle = fill; g.strokeStyle = '#1a1208'; g.lineWidth = 1; g.beginPath(); g.arc(M + x * k, M + z * k, r, 0, 7); g.fill(); g.stroke(); };
  for (const c of world.charms) if (!c.found) dot(wrap(c.x - pl.x), wrap(c.z - pl.z), 3, '#ffd34a');
  for (const e of cits) if (!e.cit.hidden && e.cit.role !== 'walker') dot(e.x - player.pos.x, e.z - player.pos.z, 2.4, '#f6eedc');   // merchant and elder
  for (const e of npcs) dot(e.x - player.pos.x, e.z - player.pos.z, 3.2, e === duelNPC ? '#ff4a3a' : e.npc.beaten ? '#9ad08a' : '#5ab4ff');
  const cm = world.charms[charmMark];   // the charm a rumour pointed to: a pulsing gold ring
  if (cm && !cm.found) { g.strokeStyle = '#ffd34a'; g.lineWidth = 2; g.beginPath(); g.arc(M + wrap(cm.x - pl.x) * k, M + wrap(cm.z - pl.z) * k, 6 + 2 * Math.sin(performance.now() / 200), 0, 7); g.stroke(); }
  if (wisp) dot(wisp.x - player.pos.x, wisp.z - player.pos.z, 3.6, '#8fe8ff');   // the waiting spirit
  for (const e of enemies) if (e.trial) dot(e.x - player.pos.x, e.z - player.pos.z, 2.6, '#ff4a3a');   // its warriors
  g.translate(M, M); g.rotate(-player.yaw);
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

/* ============ rival ninjas (explore) ============ */
// Wandering ninjas share the endless map with you. Each has a name, a clan, a rank (1-5, which sets how they fight)
// and a temper (what they say). Walk up to one to talk (T) or challenge them to a duel (R). Duels are never to
// the death: a beaten rival kneels and yields (coins by rank), and if you lose you're knocked down with hearts restored.
// Talking gets you their story, rumours of hidden charms (direction and distance) and fighting tips.
const NPC_N = 22;   // rivals kept round you (fewer on low graphics)
const npcCap = () => quality === 'high' ? NPC_N : 14;
let npcs = [], talkNPC = null, duelNPC = null;
const NPC_NAMES = ['Kenji', 'Haru', 'Sora', 'Ren', 'Aki', 'Yumi', 'Daichi', 'Kaede', 'Ryo', 'Mei', 'Takeshi', 'Nori', 'Hikaru', 'Suzu', 'Isamu', 'Chiyo', 'Botan', 'Jiro', 'Kiku', 'Masa', 'Tora', 'Rin'];
const CLANS = [
  { n: 'Mist', lore: 'We move unseen through the morning fog.' },
  { n: 'Crane', lore: 'Patience first, then one perfect strike.' },
  { n: 'Iron Leaf', lore: 'Our blades are folded a thousand times.' },
  { n: 'Red Lotus', lore: 'We bloom fiercest in the dark.' },
  { n: 'Night Owl', lore: 'We see what others miss.' },
  { n: 'Stone River', lore: 'Like water, we wear down any wall.' },
];
const RANKS = [null, { kinds: ['grunt'], title: 'Novice' }, { kinds: ['runner', 'archer'], title: 'Adept' }, { kinds: ['assassin'], title: 'Shadow' }, { kinds: ['samurai'], title: 'Master' }, { kinds: ['brute'], title: 'Grandmaster' }];
const TEMPER = {
  kind: { hi: ['Peace, traveller.', 'Fine day for a walk, is it not?', 'Your footsteps are light. Good.'], win: 'Well fought! You honour your teachers.', lose: 'Rest a moment. You were close.', accept: 'A friendly spar? Gladly!', beaten: 'Ha, you again! My shoulder still aches.', idle: ['The wind carries petals today.', 'Mind the gates, friend.', 'Breathe, then cut.'] },
  proud: { hi: ['Hmph. Another hopeful blade.', 'You walk as if you own this road.', 'Do you know who I am?'], win: 'Impossible... You have my respect.', lose: 'As expected. Train harder.', accept: 'At last, someone bold enough!', beaten: 'Do not speak of our duel. Ever.', idle: ['None here can match me.', 'I have not lost in a hundred duels.', 'Bow when you pass.'] },
  gruff: { hi: ['What do you want?', 'Make it quick.', 'Hm.'], win: 'Tch. Lucky cut.', lose: 'Go home, pup.', accept: "Fine. Don't cry after.", beaten: 'Hmph. You again.', idle: ['Too many wanderers about.', 'My knees ache.', 'Hmph.'] },
  wise: { hi: ['Ah. The young one with sharp eyes.', 'Sit with me a while.', 'Every path leads back here.'], win: 'The student surpasses the master... today.', lose: 'Defeat is a teacher. Listen to it.', accept: 'Show me what your hands have learned.', beaten: 'You have grown since we crossed blades.', idle: ['Still water, still mind.', 'The blade follows the eye.', 'The charms are restless today.'] },
};
const TIPS = [
  'Dash just before a blow lands, not early, for a PERFECT DODGE: time slows and he is left open.',
  'The red ! is his tell. Cut him late in his wind-up to COUNTER: it cuts through any guard.',
  'Hitting a foe early in his wind-up will not stop the blow. Wait for the moment, then strike.',
  'A cut straight through the middle is a CLEAN CUT and pays a bonus. Grazes do not.',
  'Cut low across the legs and a foe drops to his knees. Then press {KeyQ} for a finisher.',
  'Jump before you press {KeyQ} and the finisher happens in the air. Twice the reward.',
  'A Storm unleashed in mid-air becomes a Sky Storm: everything below is marked.',
  'A red ! means a strike is coming. Dash or jump and it will miss you.',
  'Slice falling halves again before they land. Air slices pay extra.',
  'Kunai split armour. Samurai fear them.',
  "Swipe an archer's star out of the air to send it away.",
  'Double-tap jump to flip. A flip can carry you over a sweeping blade.',
];
const pickOne = a => a[Math.floor(Math.random() * a.length)];
function spawnNPCNear(d0, d1) {
  for (let k = 0; k < 8; k++) {
    const a = rnd(0, Math.PI * 2), d = rnd(d0, d1), x = player.pos.x + Math.sin(a) * d, z = player.pos.z - Math.cos(a) * d, q = { x, z };
    world.collide(q, 0.6);
    const lp = world.local(q);
    if (Math.hypot(q.x - x, q.z - z) > 0.05 || Math.hypot(lp.x, lp.z) < world.wallR + 2) continue;   // open ground, outside the arena
    return makeNPC(x, z);
  }
}
function makeNPC(x, z) {
  const rank = 1 + Math.min(4, Math.floor(Math.pow(Math.random(), 1.5) * 5)), kind = pickOne(RANKS[rank].kinds);
  const e = spawnEnemy(kind, x, z, true); enemies.splice(enemies.indexOf(e), 1);
  const N = e.npc = { name: pickOne(NPC_NAMES), clan: pickOne(CLANS), rank, temper: pickOne(Object.keys(TEMPER)), home: { x, z }, tx: x, tz: z, wait: rnd(0, 3),
    runSpeed: e.speed, sayT: 0, sayCD: rnd(3, 9), yieldT: 0, beaten: false, stuck: 0, tag: document.createElement('div') };
  e.speed = 1.4; e.state = 'idle';
  N.tag.className = 'npcTag'; N.tag.innerHTML = `<i></i><b>${N.name}</b><small>${N.clan.n} clan · ${RANKS[rank].title} ${'★'.repeat(rank)}</small>`;
  $('npcTags').appendChild(N.tag);
  npcs.push(e);
  return e;
}
function removeNPC(e) { scene.remove(e.root); e.npc.tag.remove(); npcs.splice(npcs.indexOf(e), 1); }
function say(e, text, t = 3.5) { const N = e.npc || e.cit; N.sayT = t; N.tag.firstChild.textContent = text; }
const turnTo = (e, x, z, k) => { let da = Math.atan2(x - e.x, z - e.z) - e.root.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); e.root.rotation.y += da * k; };
function kneel(e, dt) {   // yielding: down on one knee, head bowed
  const P = e.P, k = 1 - Math.exp(-dt * 8);
  P.hips.position.y += (RIG.hips.y - 0.5 - P.hips.position.y) * k;
  rotTo(P.hips, 0.25, k); rotTo(P.legL, -1.5, k); rotTo(P.kneeL, 1.6, k); rotTo(P.legR, -0.1, k); rotTo(P.kneeR, 1.7, k);
  rotTo(P.head, 0.55, k); rotTo(P.armL, -0.3, k); rotTo(P.armR, -0.2, k); rotTo(P.elbowR, -0.3, k);
}
const NPC_DRAW_R = 45, NPC_SHADOW_R = 25;
function updNPCs(dt) {
  if (!stage || !stage.explore) return;
  // keep a handful of rivals round you as you travel the endless map
  for (const e of npcs.slice()) if (e !== duelNPC && e !== talkNPC && Math.hypot(e.x - player.pos.x, e.z - player.pos.z) > 130) removeNPC(e);
  if (npcs.length < npcCap() && Math.random() < dt * 4) spawnNPCNear(40, 90);
  if (duelNPC && Math.hypot(duelNPC.x - player.pos.x, duelNPC.z - player.pos.z) > 45) loseDuel(true);   // running off forfeits
  for (const e of npcs) {
    const N = e.npc; N.sayT -= dt;
    if (enemies.includes(e)) continue;   // duelling: the fight AI drives him
    const dx = player.pos.x - e.x, dz = player.pos.z - e.z, dist = Math.hypot(dx, dz);
    if (N.yieldT > 0) { N.yieldT -= dt; kneel(e, dt); e.root.position.set(e.x, 0, e.z); continue; }
    if (e === talkNPC || e === duelNPC || (dist < 5 && !duelNPC)) { e.state = 'idle'; turnTo(e, player.pos.x, player.pos.z, Math.min(1, dt * 5)); }
    else if (duelNPC && Math.hypot(duelNPC.x - e.x, duelNPC.z - e.z) < 30) { e.state = 'idle'; turnTo(e, duelNPC.x, duelNPC.z, Math.min(1, dt * 3)); }   // stop and watch the duel
    else if ((N.wait -= dt) > 0) e.state = 'idle';
    else {
      let mx = N.tx - e.x, mz = N.tz - e.z; const l = Math.hypot(mx, mz);
      if (l < 0.7 || N.stuck > 1.5) { const a = rnd(0, Math.PI * 2), d = rnd(4, 14); N.tx = N.home.x + Math.sin(a) * d; N.tz = N.home.z - Math.cos(a) * d; N.wait = rnd(1, 5); N.stuck = 0; }
      else {
        e.state = 'run'; mx /= l; mz /= l;
        const ox = e.x, oz = e.z, q = { x: e.x + mx * e.speed * dt, z: e.z + mz * e.speed * dt }; world.collide(q, e.d.w);
        e.x = q.x; e.z = q.z; N.stuck = Math.hypot(e.x - ox, e.z - oz) < e.speed * dt * 0.3 ? N.stuck + dt : 0;
        turnTo(e, N.tx, N.tz, Math.min(1, dt * 6));
      }
    }
    if (dist < 12 && (N.sayCD -= dt) <= 0 && e !== talkNPC) { say(e, N.beaten ? TEMPER[N.temper].beaten : pickOne(TEMPER[N.temper].idle)); N.sayCD = rnd(9, 18); }
    // far rivals keep walking but aren't drawn, posed or matrix-updated (a dozen draw calls each, mostly lost in the fog)
    const show = dist < NPC_DRAW_R; e.root.visible = show; e.root.matrixWorldAutoUpdate = show;
    const sh = dist < NPC_SHADOW_R; if (e.npc.sh !== sh) { e.npc.sh = sh; e.root.traverse(m => { if (m.isMesh) m.castShadow = sh; }); }   // only the near ones cast shadows
    if (show) animEnemy(e, dt); e.root.position.set(e.x, 0, e.z);
  }
}
const nearNPC = () => { let b = null, bd = 3.2; for (const e of npcs) { if (e === duelNPC || e.npc.yieldT > 0) continue; const d = Math.hypot(e.x - player.pos.x, e.z - player.pos.z); if (d < bd) { bd = d; b = e; } } return b; };
// name tags with speech bubbles over nearby rivals, and the talk / duel prompt for the closest one
function drawNPCTags() {
  const live = stage && stage.explore && state === 'play' && cineW < 0.2;
  for (const e of [...npcs, ...cits]) {
    const N = e.npc || e.cit, t = N.tag, d = Math.hypot(e.x - player.pos.x, e.z - player.pos.z), s = live && !N.hidden && d < 30 && toScreen(new V3(e.x, e.y + e.d.h * e.s + 0.45, e.z));
    t.classList.toggle('hidden', !s); if (!s) continue;
    t.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%) scale(${clamp(1.25 - d / 30, 0.55, 1)})`;
    t.classList.toggle('duel', e === duelNPC); t.classList.toggle('beaten', !!N.beaten); t.classList.toggle('say', N.sayT > 0);
  }
  const n = live && !talkNPC && !duelNPC && (nearNPC() || nearCit()), pr = $('npcPrompt'), s = n && toScreen(new V3(n.x, 0.2, n.z));
  pr.classList.toggle('hidden', !s); if (s) { pr.style.left = s.x + 'px'; pr.style.top = s.y + 'px'; pr.npc = n; pr.classList.toggle('cit', !!n.cit); }
}
$('npcTalk').addEventListener('pointerdown', e => { e.stopPropagation(); const n = $('npcPrompt').npc; if (n) (n.cit ? talkCit(n) : talk(n)); });
$('npcDuel').addEventListener('pointerdown', e => { e.stopPropagation(); const n = $('npcPrompt').npc; if (n) challenge(n); });
// dialogue: the rival's line, then numbered replies
function talk(e) {
  if (duelNPC) return;
  talkNPC = e; ptr.down = false; blade = false; for (const k in keys) keys[k] = false;
  exitLock(); updLockUI(); gflag('talk');
  const T = TEMPER[e.npc.temper];
  dlg(e, e.npc.beaten ? T.beaten : pickOne(T.hi));
}
function dlg(e, text) {
  const N = e.npc;
  $('dlgName').innerHTML = `${N.name} <small>${N.clan.n} clan · ${RANKS[N.rank].title} ${'★'.repeat(N.rank)}${N.beaten ? ' · beaten' : ''}</small>`;
  $('dlgText').textContent = text;
  const opts = [
    ['Who are you?', () => dlg(e, `I am ${N.name} of the ${N.clan.n} clan, a${/^[AEIOU]/.test(RANKS[N.rank].title) ? 'n' : ''} ${RANKS[N.rank].title.toLowerCase()} of rank ${N.rank}. ${N.clan.lore}`)],
    ['Heard any rumours?', () => dlg(e, rumour(e))],
    ['Teach me something.', () => dlg(e, keyText(pickOne(TIPS)))],
    [errand && errand.giver === e ? 'About that errand...' : 'Need a hand?', () => giveErrand(e)],
    [N.beaten ? 'Rematch!' : 'I challenge you to a duel!', () => challenge(e)],
    ['Farewell.', closeDlg],
  ];
  $('dlgOpts').innerHTML = '';
  opts.forEach(([label, fn], i) => { const b = document.createElement('button'); b.className = 'btn sm'; b.innerHTML = `<i>${i + 1}</i>${label}`; b.addEventListener('click', ev => { ev.stopPropagation(); sfx.click(); fn(); }); $('dlgOpts').appendChild(b); });
  $('dlg').classList.remove('hidden');
}
function closeDlg() { if (!talkNPC) return; talkNPC = null; $('dlg').classList.add('hidden'); requestLock(); updLockUI(); }
// where's the nearest charm you haven't found? (the map repeats, so measure to the nearest copy)
function nearestCharm() {
  const P = world.tile, pl = world.local(player.pos), wrap = v => v - Math.round(v / P) * P;
  let best = null, bd = 1e9;
  world.charms.forEach((c, i) => { if (c.found) return; const dx = wrap(c.x - pl.x), dz = wrap(c.z - pl.z), d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = { dx, dz, i, d }; } });
  if (best) charmMark = best.i;   // a gold marker leads the way (drawMarkers, minimap)
  return best;
}
function rumour(e) {
  const best = nearestCharm(), bd = best ? best.d : 0;
  gflag('rumour');
  if (!best) return 'You have found every charm in these lands. Even I am impressed.';
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const dir = dirs[Math.round(((Math.atan2(best.dx, -best.dz) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8], paces = Math.max(5, Math.round(bd / 5) * 5);
  return { gruff: `Charm? ...${dir}. Maybe ${paces} paces. Now leave me be.`, proud: `Even a novice could find it: ${paces} paces ${dir}. I have no need of charms.`,
    kind: `I saw a red charm glinting to the ${dir}, about ${paces} paces from here. Good luck!`, wise: `Walk ${dir}, some ${paces} paces. What is lost waits to be found.` }[e.npc.temper];
}
// duels: a short stand-off, then he fights like an enemy of his rank until one of you is beaten
function challenge(e) {
  if (duelNPC || trialRun || e.npc.yieldT > 0) return;
  const N = e.npc;
  if (talkNPC) { talkNPC = null; $('dlg').classList.add('hidden'); }
  duelNPC = e; say(e, TEMPER[N.temper].accept, 2.5);
  banner('DUEL', `${N.name} · ${N.clan.n} clan · ${RANKS[N.rank].title}`); sfx.warn();
  hearts = maxHearts; updHearts(); for (const pr of eProj.slice()) removeEProj(pr);
  requestLock(); updLockUI();
  after(1.6, () => {
    if (duelNPC !== e) return;
    e.hp = e.maxHp = 4 + 3 * N.rank; e.speed = N.runSpeed * (1.1 + N.rank * 0.08);
    $('bossName').textContent = `${N.name.toUpperCase()} · ${RANKS[N.rank].title.toUpperCase()}`; $('bossBar').classList.remove('hidden'); $('bossFill').style.width = '100%'; e.state = 'run'; e.t = 0; e.atkT = 0; e.leapCD = rnd(1, 3); e.gate = null;
    enemies.push(e); banner('FIGHT!', ''); sfx.swish(1.2);
  });
}
// A rival reads your blade: each hit may be parried (counter-attack at once) or evaded (a side-step),
// more often the higher his rank. Whatever lands chips at a long health bar; at zero he yields.
function npcHit(e, dmg, push) {
  if (!enemies.includes(e) || e.npc.guardT > T) return;
  e.npc.guardT = T + 0.12;   // one stroke counts once
  const N = e.npc, c = bodyCenter(e), roll = Math.random(), block = 0.18 + 0.07 * N.rank;   // 25% (novice) to 53% (grandmaster)
  if (roll < block * 0.6) {
    sfx.clang(); fx.sparks(c, 24); floater('PARRIED', headPos(e), 'warn'); shake = Math.max(shake, 0.25);
    e.stagger = 0; e.state = 'windup'; e.t = 0; e.windDur = Math.max(0.22, 0.4 - 0.04 * N.rank); sfx.warn();
    return;
  }
  if (roll < block) {
    const sx = Math.random() < 0.5 ? 1 : -1, dx = player.pos.x - e.x, dz = player.pos.z - e.z, l = Math.hypot(dx, dz) || 1;
    fx.dust(new V3(e.x, 0, e.z), 10, 0.8); sfx.swish(0.7); floater('EVADED', headPos(e), '');
    const q = { x: e.x - dz / l * 2.6 * sx - dx / l * 0.8, z: e.z + dx / l * 2.6 * sx - dz / l * 0.8 }; world.collide(q, e.d.w); e.x = q.x; e.z = q.z;
    e.stagger = 0; e.state = 'ready'; e.atkT = 0.05;
    return;
  }
  e.hp -= dmg; $('bossFill').style.width = Math.max(0, e.hp / e.maxHp * 100) + '%';
  sfx.slice(0.5); fx.burst(c, push || UP, 6, 0.5); shake = Math.max(shake, 0.15);
  if (e.hp <= 0) { npcYield(e); return; }
  e.stagger = 0.1; e.knock = 2;   // barely flinches
}
function endDuel(e) {
  const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
  if (e.marks) { scene.remove(e.marks); for (const m of e.marks.children) m.geometry.dispose(); e.marks = null; }
  Object.assign(e, { stormed: null, frozen: false, air: null, y: 0, stagger: 0, downed: null, finishing: false, speed: 1.4, state: 'idle' });
  duelNPC = null; for (const pr of eProj.slice()) removeEProj(pr); $('bossBar').classList.add('hidden'); gflag('duel');   // win or lose, the guide counts it
  hearts = maxHearts; updHearts();
}
function npcYield(e) {
  const N = e.npc; endDuel(e);
  N.beaten = true; N.yieldT = 5; N.wait = 2;
  const coins = 30 * N.rank; save.coins += coins; save.duelWins = (save.duelWins || 0) + 1; persist();
  banner('VICTORY', `${N.name} yields`); sfx.win(); slowmo(0.3, 0.6); fx.sparks(bodyCenter(e), 30, 0xffe08a, 5);
  floater(`+${coins} DUEL WON`, { x: vw / 2, y: vh * 0.36 }, 'big'); say(e, TEMPER[N.temper].win, 4.5);
  errandStep('duel', N.clan);
}
function loseDuel(fled = false) {
  const e = duelNPC; invuln = 2.5; sfx.lose(); slowmo(0.3, 0.8);
  if (!e) { hearts = maxHearts; updHearts(); return; }
  endDuel(e); say(e, fled ? 'Running away? Hah!' : TEMPER[e.npc.temper].lose, 4);
  banner(fled ? 'FORFEIT' : 'DEFEATED', `${e.npc.name} wins the duel`);
  if (!fled) { const dx = player.pos.x - e.x, dz = player.pos.z - e.z, l = Math.hypot(dx, dz) || 1; player.vel.set(dx / l * 9, 0, dz / l * 9); player.vy = 5; player.ground = false; }
}

/* ============ explore: spirit trials, errands, rumour markers ============ */
// Spirit trials: a glowing spirit drifts somewhere near you (cyan on the minimap). Touch it and it calls up spirit
// warriors that rise round you a few at a time: 50 of them, cut down before the time runs out. Each trial you clear
// puts more on the field at once and brings tougher kinds. Clearing one pays coins and fills the Storm gauge; falling (or the
// time running out) ends it, with your hearts restored.
const TRIAL_TIME = 180, TRIAL_COINS = 150, TRIAL_FOES = 50;
let wisp = null, trialRun = null, wispT = 8, charmMark = -1, errand = null;
const wispMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff, toneMapped: false });
const wispGlow = new THREE.MeshBasicMaterial({ color: 0x7fe0ff, toneMapped: false, transparent: true, opacity: 0.35, depthWrite: false });
function openSpot(x0, z0, d0, d1, dir, outside) {   // open ground d0-d1 m from (x0, z0) (outside the arena if asked); dir narrows the heading
  for (let k = 0; k < 12; k++) {
    const a = dir === undefined ? rnd(0, Math.PI * 2) : dir + rnd(-0.9, 0.9), d = rnd(d0, d1), q = { x: x0 + Math.sin(a) * d, z: z0 - Math.cos(a) * d }, x = q.x, z = q.z;
    world.collide(q, 0.9);
    const lp = world.local(q);
    if (Math.hypot(q.x - x, q.z - z) < 0.05 && (!outside || Math.hypot(lp.x, lp.z) > world.wallR + 2)) return q;
  }
  return null;
}
const ahead = () => -player.yaw;   // heading straight in front of you, in openSpot's angle convention
function spawnWisp(d0 = 18, d1 = 35) {
  removeWisp();
  const q = openSpot(player.pos.x, player.pos.z, d0, d1, d0 < 10 ? ahead() : undefined); if (!q) return;   // close ones (the guide's) go in front of you
  const g = new THREE.Group(); g.position.set(q.x, 1.3, q.z);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), wispMat), new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), wispGlow));
  scene.add(g); wisp = { x: q.x, z: q.z, g };
}
function removeWisp() { if (wisp) { scene.remove(wisp.g); wisp = null; } }
function trialFoes() {   // how many, how many at once, and which kinds: grows with the trials you've cleared
  const n = save.trials || 0, kinds = ['grunt', 'grunt', 'runner'];
  if (n >= 1) kinds.push('archer'); if (n >= 3) kinds.push('samurai'); if (n >= 5) kinds.push('assassin'); if (n >= 8) kinds.push('brute');
  return { total: TRIAL_FOES, live: Math.min(8, 4 + Math.floor(n / 2)), kinds };
}
function trialSpawn() {   // spirits rise round you; bandits come in from the edge of the town
  const R = trialRun, q = (R.raid ? openSpot(R.town.x, R.town.z, R.town.r, R.town.r + 8) : openSpot(player.pos.x, player.pos.z, 7, 12)) || { x: player.pos.x + rnd(-8, 8), z: player.pos.z + rnd(-8, 8) };
  const e = spawnEnemy(pickOne(R.kinds), q.x, q.z, true); e.trial = true; R.spawned++;
  e.root.rotation.y = Math.atan2(player.pos.x - q.x, player.pos.z - q.z);
  fx.dust(new V3(q.x, 0, q.z), 16, 1.2); fx.sparks(new V3(q.x, 1, q.z), 20, 0x8fe8ff, 3);
}
function startTrial() {
  removeWisp(); const F = trialFoes();
  trialRun = { kills: 0, spawned: 0, total: F.total, live: F.live, kinds: F.kinds, left: TRIAL_TIME, next: 1.2 };
  banner('SPIRIT TRIAL', `Defeat ${F.total} spirit warriors in ${TRIAL_TIME} s`); sfx.warn(); gflag('trial');
  hearts = maxHearts; updHearts(); updQuest();
}
function clearTrial() {
  if (!trialRun) return; trialRun = null;
  for (const e of enemies.filter(e => e.trial)) {   // the ones still standing fade back into smoke
    scene.remove(e.root); enemies.splice(enemies.indexOf(e), 1);
    if (e.marks) { scene.remove(e.marks); e.marks = null; }
    fx.dust(new V3(e.x, 0.5, e.z), 14, 1);
  }
}
function trialKill() {
  const R = trialRun; if (!R) return;
  R.kills++; score += 40; updQuest();
  if (R.kills >= R.total) endTrial(true);
}
function trialFall() { endTrial(false); hearts = maxHearts; updHearts(); invuln = 2.5; }   // knocked down: hearts back, trial over
function endTrial(won) {
  if (!trialRun) return;
  const R = trialRun; clearTrial(); wispT = 25; updQuest();
  if (R.raid) { endRaid(R, won); return; }
  if (!won) { banner('THE SPIRIT FADES', 'Trial failed'); sfx.lose(); return; }
  save.coins += TRIAL_COINS; save.trials = (save.trials || 0) + 1; ult = 100; persist();
  banner('TRIAL COMPLETE', `+${TRIAL_COINS} · Storm ready`); sfx.win(); slowmo(0.3, 0.5);
  fx.sparks(new V3(player.pos.x, 1.2, player.pos.z), 40, 0x8fe8ff, 5);
  errandStep('trial');
}
function updWisps(dt) {
  const t = performance.now() / 1000;
  if (wisp) {
    const d = Math.hypot(wisp.x - player.pos.x, wisp.z - player.pos.z);
    wisp.g.position.y = 1.3 + Math.sin(t * 2.2) * 0.18; wisp.g.children[1].scale.setScalar(1 + Math.sin(t * 5) * 0.15);
    if (d > 110) { removeWisp(); wispT = 5; }
    else if (d < 1.4 && !duelNPC && !talkNPC) startTrial();
  } else if (!trialRun && (wispT -= dt) <= 0) { spawnWisp(); wispT = 30; }
  const R = trialRun; if (!R) return;
  if ((R.left -= dt) <= 0 || (R.raid && Math.hypot(player.pos.x - R.town.x, player.pos.z - R.town.z) > 75)) { endTrial(false); return; }   // a raid is lost if you leave the town
  const alive = enemies.filter(e => e.trial).length;
  if (R.spawned < R.total && alive < R.live && (R.next -= dt) <= 0) { trialSpawn(); R.next = 0.6; }
  updQuest();
}
// Errands: ask a rival "Need a hand?" and they give you a job (one at a time). It shows under your hearts and pays
// coins by their rank the moment it's done, wherever they are by then.
const ERRAND_ASK = { kind: 'Would you help me? ', proud: 'Prove you are worth my time. ', gruff: 'Make yourself useful. ', wise: 'A task, to test your path. ' };
function giveErrand(e) {
  const N = e.npc;
  if (errand && errand.giver === e) return dlg(e, `Still waiting. ${errand.text}${errand.need > 1 ? ` (${errand.got}/${errand.need})` : ''}.`);
  if (errand) return dlg(e, `You already carry ${errand.name}'s errand. Finish that first.`);
  const kinds = ['cut', 'duel', 'trial', 'raid']; if (world.charms.some(c => !c.found)) kinds.push('charm');
  const kind = pickOne(kinds), reward = 40 + 15 * N.rank, seen = npcs.map(o => o.npc.clan).filter(c => c !== N.clan);
  const clan = seen.length ? pickOne(seen) : pickOne(CLANS.filter(c => c !== N.clan)), need = kind === 'cut' ? 4 + Math.floor(Math.random() * 5) : 1;
  const text = { cut: `Cut down ${need} pieces of scenery`, duel: `Beat a ninja of the ${clan.n} clan in a duel`, trial: 'Finish a spirit trial', charm: 'Find a hidden charm', raid: `Defend ${world.town.name} from a bandit raid` }[kind];
  errand = { kind, need, got: 0, clan, text, reward, giver: e, name: N.name };
  gflag('errand'); updQuest();
  dlg(e, `${ERRAND_ASK[N.temper]}${text}. ${reward} coins when it is done.`);
}
function errandStep(kind, arg) {
  const E = errand; if (!E || E.kind !== kind || (kind === 'duel' && arg !== E.clan)) return;
  if (++E.got < E.need) { updQuest(); return; }
  errand = null; save.coins += E.reward; save.errands = (save.errands || 0) + 1; persist();
  banner('ERRAND DONE', `+${E.reward} · ${E.name} thanks you`); sfx.win();
  if (npcs.includes(E.giver)) say(E.giver, TEMPER[E.giver.npc.temper].win, 4);
  updQuest();
}
let questTxt = '';
function updQuest() {
  const R = trialRun, lines = [];
  if (errand) lines.push(`ERRAND · ${errand.text}${errand.need > 1 ? ` · ${errand.got}/${errand.need}` : ''}`);
  if (R) lines.push(`${R.raid ? 'BANDIT RAID' : 'SPIRIT TRIAL'} · ${R.kills}/${R.total} DEFEATED · ${Math.ceil(Math.max(0, R.left))}s`);
  const s = lines.join('<br>'); if (s === questTxt) return; questTxt = s;
  $('quest').innerHTML = s; $('quest').classList.toggle('hidden', !s);
}
// gold marker on the charm a rumour pointed you to, cyan on the waiting spirit, white on where the guide sends you: over the spot when
// it's on screen, an arrow at the screen edge when it isn't
function drawMarkers() {
  if (!stage || !stage.explore || state !== 'play' || cineW > 0.2) return;
  const P = world.tile, pl = world.local(player.pos), wrap = v => v - Math.round(v / P) * P, out = [], t = performance.now() / 1000;
  const c = world.charms[charmMark]; if (c && !c.found) out.push([new V3(player.pos.x + wrap(c.x - pl.x), 1.6, player.pos.z + wrap(c.z - pl.z)), '#ffd34a']);
  if (guide && guide.goal) out.push([new V3(guide.goal.x, 1.4, guide.goal.z), '#ffffff']);
  if (wisp && Math.hypot(wisp.x - player.pos.x, wisp.z - player.pos.z) < 60) out.push([new V3(wisp.x, 1.9, wisp.z), '#8fe8ff']);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  for (const [p, col] of out) {
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z), s = toScreen(p);
    tDrawn = true; tctx.save(); tctx.fillStyle = col; tctx.strokeStyle = '#120e0b'; tctx.lineWidth = 2; tctx.shadowColor = '#000'; tctx.shadowBlur = 6;
    if (s && s.x > 30 && s.x < vw - 30 && s.y > 30 && s.y < vh - 30) {
      tctx.translate(s.x, s.y - 26 + Math.sin(t * 4) * 4);
      tctx.beginPath(); tctx.moveTo(0, 10); tctx.lineTo(-8, -2); tctx.lineTo(0, -10); tctx.lineTo(8, -2); tctx.closePath(); tctx.fill(); tctx.stroke();
      tctx.font = '700 12px "Segoe UI",system-ui,sans-serif'; tctx.textAlign = 'center'; tctx.fillText(`${Math.round(d)} m`, 0, -16);
    } else {
      const dx = p.x - player.pos.x, dz = p.z - player.pos.z, a = Math.atan2(dx * cy - dz * sy, -dx * sy - dz * cy);
      tctx.translate(vw / 2 + Math.sin(a) * (vw / 2 - 70), vh / 2 - Math.cos(a) * (Math.cos(a) > 0 ? vh / 2 - 70 : vh / 2 - 130)); tctx.rotate(a);
      tctx.beginPath(); tctx.moveTo(0, -16); tctx.lineTo(11, 8); tctx.lineTo(0, 3); tctx.lineTo(-11, 8); tctx.closePath(); tctx.fill(); tctx.stroke();
    }
    tctx.restore();
  }
}

// the charm count, blessings earned and the next one (main menu and explore pause menu)
function blessText() {
  const c = charmCount(), got = BLESSINGS.filter(b => c >= b.n), nx = BLESSINGS.find(b => c < b.n);
  return `<b>CHARMS ${c}/${MAPS.length * 8}</b>${got.length ? ' · ' + got.map(b => b.t).join(' · ') : ''}${nx ? `<br><small>Next blessing at ${nx.n}: ${nx.t}</small>` : ''}`;
}

/* ============ day, night and weather (explore) ============ */
// A whole day takes DAY_LEN seconds: dawn, day, dusk and night, each held a while then blended into the next.
// The weather drifts between clear, cloudy, rain, storms and fog (snow and blizzards on the snowy pass), blending
// over a few seconds; storms throw lightning. The sky is re-coloured ten times a second, reflections every few.
const DAY_LEN = 420, DAY_KEYS = [THEMES_REAL[0], THEMES_REAL[2], DUSK, THEMES_REAL[1]], DAY_NAMES = ['DAWN', 'DAY', 'DUSK', 'NIGHT'];
const WX_ODDS = { clear: 3, cloudy: 2, rain: 1.4, storm: 0.6, fog: 1 };
let dayT = 0.2, wx = { from: 'clear', to: 'clear', k: 1, t: 80 }, skyAcc = 0, envAcc = 0, boltT = 5, skyLabel = '';
const dayPhase = () => { const seg = (dayT % 1) * 4, i = Math.floor(seg), f = seg - i; return { i, t: f < 0.7 ? 0 : smooth((f - 0.7) / 0.3) }; };
const isNight = () => { const P = dayPhase(); return P.i === 3 ? P.t < 0.5 : P.i === 2 && P.t > 0.5; };
const wxName = id => world.particles === 'snow' ? { rain: 'SNOW', storm: 'BLIZZARD' }[id] || WEATHER[id].name.toUpperCase() : WEATHER[id].name.toUpperCase();
function updSky(dt) {
  dayT += dt / DAY_LEN;
  if ((wx.t -= dt) <= 0) {   // the weather turns
    let x = Math.random() * Object.values(WX_ODDS).reduce((a, b) => a + b), next = 'clear';
    for (const [id, w] of Object.entries(WX_ODDS)) { x -= w; if (x <= 0) { next = id; break; } }
    if (next !== wx.to) { wx = { from: wx.to, to: next, k: 0, t: rnd(70, 140) }; toast(`The weather turns: ${wxName(next).toLowerCase()}`); } else wx.t = rnd(40, 80);
  }
  wx.k = Math.min(1, wx.k + dt / 12);
  if (wx.to === 'storm' && wx.k > 0.6 && (boltT -= dt) <= 0) {   // lightning: a white flash, thunder a moment later
    boltT = rnd(6, 16); const fw = $('flashW'); fw.style.transition = 'none'; fw.style.opacity = 0.45;
    requestAnimationFrame(() => { fw.style.transition = 'opacity .6s'; fw.style.opacity = 0; }); after(rnd(0.3, 1.2), () => { sfx.thud(2.2); shake = Math.max(shake, 0.15); });
  }
  if ((skyAcc += dt) < 0.1) return; skyAcc = 0;
  const P = dayPhase(), a = WEATHER[wx.from], b = WEATHER[wx.to], k = smooth(wx.k), w = {};
  for (const key of ['cover', 'fogMul', 'dim', 'rain']) w[key] = a[key] + (b[key] - a[key]) * k;
  const env = (envAcc += 0.1) > 4; if (env) envAcc = 0;
  world.setSky(DAY_KEYS[P.i], DAY_KEYS[(P.i + 1) % 4], P.t, w, env);
  const label = `${DAY_NAMES[P.t < 0.5 ? P.i : (P.i + 1) % 4]} · ${wxName(k < 0.5 ? wx.from : wx.to)}`;
  if (label !== skyLabel) { skyLabel = label; exploreTag(); }
}
function exploreTag() {
  if (!stage || !stage.explore) return;
  const got = (save.charms[stage.map] || []).length;
  $('stageTag').textContent = `EXPLORE · ${MAPS[mapIdx(stage.map)].name.toUpperCase()} · ${got}/${world.charms.length} CHARMS${skyLabel ? ' · ' + skyLabel : ''}`;
}

/* ============ towns and townsfolk (explore) ============ */
// Each map has a town (world.town; the village map's is its own square). Near it, townsfolk walk the square, a
// merchant keeps a stall and the elder stands by the bounty board. Talk to any of them (T). They can't be harmed:
// they aren't fighters, and during a bandit raid they take shelter until it's over.
const CIT_NAMES = ['Ume', 'Goro', 'Hana', 'Taro', 'Sachi', 'Kichi', 'Fumi', 'Jun', 'Nobu', 'Oto', 'Shin', 'Tama', 'Yasu', 'Kane'];
const CIT_LINES = {
  day: ['Fine weather for the market.', 'Have you tried the tea at the stall?', 'Mind the bandits on the roads.', 'My son wants to be a ninja like you.'],
  night: ['Lanterns are lit. Stay safe out there.', 'Bandits love a dark night.', 'The spirits wander after dusk.', 'Late to be out, traveller.'],
  rain: ['This rain will do the rice good.', 'Come in out of the wet!', 'Puddles everywhere...'],
  storm: ['Thunder! The kami are angry.', 'Close the shutters, quick!'],
};
const WARES = [
  { n: 'Healing tea', c: 30, d: 'Restores all your hearts.', ok: () => hearts < maxHearts, buy: () => { hearts = maxHearts; updHearts(); } },
  { n: 'Storm talisman', c: 120, d: 'Fills your Storm gauge.', ok: () => ult < 100, buy: () => { ult = 100; } },
  { n: 'Charm map', c: 150, d: 'Marks the nearest charm you have not found.', ok: () => world.charms.some(c => !c.found), buy: () => nearestCharm() },
  { n: 'Spirit incense', c: 80, d: 'Calls a spirit (and its trial) to you.', ok: () => !trialRun, buy: () => spawnWisp(4, 7) },
];
let cits = [], citKey = null;
const citN = () => quality === 'high' ? 9 : 5;
function townAt() {   // the nearest copy of this map's town (the map repeats), in world coordinates
  const T = world.town; if (!T) return null; const P = world.tile, ti = Math.round((player.pos.x - T.x) / P), tj = Math.round((player.pos.z - T.z) / P);
  return { ...T, x: T.x + ti * P, z: T.z + tj * P, ox: ti * P, oz: tj * P, key: ti + ',' + tj };
}
function makeCitizen(x, z, role) {
  const e = spawnEnemy('citizen' + Math.floor(Math.random() * 4), x, z, true); enemies.splice(enemies.indexOf(e), 1);
  const C = e.cit = { role, name: pickOne(CIT_NAMES), home: { x, z }, tx: x, tz: z, wait: rnd(0, 4), sayT: 0, sayCD: rnd(2, 8), stuck: 0, tag: document.createElement('div') };
  e.speed = 1.2; e.state = 'idle';
  C.tag.className = 'npcTag'; C.tag.innerHTML = role === 'walker' ? '<i></i>' : `<i></i><b>${C.name}</b><small>${role === 'merchant' ? 'Merchant' : 'Village elder'}</small>`;
  $('npcTags').appendChild(C.tag); cits.push(e);
  return e;
}
function clearCitizens() { for (const e of cits) { scene.remove(e.root); e.cit.tag.remove(); } cits = []; citKey = null; }
function spawnCitizens(tw) {
  clearCitizens(); citKey = tw.key;
  const st = tw.stalls[0], bd = tw.board;
  makeCitizen(st.x + tw.ox, st.z + tw.oz, 'merchant'); makeCitizen(bd.x + tw.ox, bd.z + tw.oz, 'elder');
  for (let i = 0; i < citN(); i++) { const q = openSpot(tw.x, tw.z, 3, tw.r - 3); if (q) makeCitizen(q.x, q.z, 'walker'); }
  if (trialRun && trialRun.raid) hideCitizens(true);
}
function hideCitizens(on) {   // a raid: everyone takes shelter (and comes back out when it's over)
  for (const e of cits) { e.cit.hidden = on; if (on) { scene.remove(e.root); fx.dust(new V3(e.x, 0.3, e.z), 8, 0.6); } else scene.add(e.root); }
}
function updCitizens(dt) {
  const tw = townAt(); if (!tw || !tw.stalls) return;
  const d = Math.hypot(player.pos.x - tw.x, player.pos.z - tw.z);
  if (d < 85 && citKey !== tw.key) spawnCitizens(tw); else if (d > 120 && cits.length && !(talkNPC && talkNPC.cit)) clearCitizens();
  const night = isNight(), lines = wx.to === 'storm' ? CIT_LINES.storm : wx.to === 'rain' && wx.k > 0.5 ? CIT_LINES.rain : night ? CIT_LINES.night : CIT_LINES.day;
  for (const e of cits) {
    const C = e.cit; C.sayT -= dt; if (C.hidden) continue;
    const dist = Math.hypot(player.pos.x - e.x, player.pos.z - e.z);
    if (C.role !== 'walker' || e === talkNPC || dist < 3.5) { e.state = 'idle'; if (dist < 7) turnTo(e, player.pos.x, player.pos.z, Math.min(1, dt * 4)); }
    else if ((C.wait -= dt) > 0) e.state = 'idle';
    else {
      let mx = C.tx - e.x, mz = C.tz - e.z; const l = Math.hypot(mx, mz);
      if (l < 0.6 || C.stuck > 1.5) { const q = openSpot(tw.x, tw.z, 2, tw.r - 2); if (q) { C.tx = q.x; C.tz = q.z; } C.wait = rnd(2, 7); C.stuck = 0; }
      else {
        e.state = 'run'; mx /= l; mz /= l;
        const ox = e.x, oz = e.z, q = { x: e.x + mx * e.speed * dt, z: e.z + mz * e.speed * dt }; world.collide(q, e.d.w);
        e.x = q.x; e.z = q.z; C.stuck = Math.hypot(e.x - ox, e.z - oz) < e.speed * dt * 0.3 ? C.stuck + dt : 0;
        turnTo(e, C.tx, C.tz, Math.min(1, dt * 5));
      }
    }
    if (dist < 8 && (C.sayCD -= dt) <= 0 && e !== talkNPC) { say(e, C.role === 'merchant' ? pickOne(['Fresh tea! Talismans!', 'Come, have a look!', 'Best prices in town!']) : C.role === 'elder' ? pickOne(['Ninja! A word, please.', 'Our town needs a blade like yours.']) : pickOne(lines)); C.sayCD = rnd(10, 20); }
    const show = dist < 45; e.root.visible = show; e.root.matrixWorldAutoUpdate = show;
    if (show) animEnemy(e, dt); e.root.position.set(e.x, 0, e.z);
  }
}
const nearCit = () => { let b = null, bd = 2.8; for (const e of cits) { if (e.cit.hidden) continue; const d = Math.hypot(e.x - player.pos.x, e.z - player.pos.z); if (d < bd) { bd = d; b = e; } } return b; };
function talkCit(e) {
  if (duelNPC) return;
  talkNPC = e; ptr.down = false; blade = false; for (const k in keys) keys[k] = false;
  exitLock(); updLockUI(); gflag('town');
  const C = e.cit;
  cdlg(e, C.role === 'merchant' ? 'Welcome, welcome! Everything a wandering blade could need.' : C.role === 'elder' ? `Welcome to ${world.town.name}, ninja. We are simple folk, and the bandits know it.` : pickOne(isNight() ? CIT_LINES.night : CIT_LINES.day));
}
function cdlg(e, text) {
  const C = e.cit, tw = townAt();
  $('dlgName').innerHTML = `${C.name} <small>${C.role === 'merchant' ? 'Merchant' : C.role === 'elder' ? 'Village elder' : 'Townsfolk'} · ${world.town.name}</small>`;
  $('dlgText').textContent = text;
  let opts;
  if (C.role === 'merchant') opts = [...WARES.map(w => [`${w.n} · ${w.c} coins`, () => {
    if (!w.ok()) return cdlg(e, `You have no need of ${w.n.toLowerCase()} right now.`);
    if (save.coins < w.c) return cdlg(e, `${w.n} costs ${w.c} coins. Come back with a fuller purse!`);
    save.coins -= w.c; persist(); w.buy(); sfx.coin(); updHUD(); cdlg(e, `${w.n}: ${w.d} Thank you kindly!`);
  }]), ['Farewell.', closeDlg]];
  else if (C.role === 'elder') opts = [
    ['Any trouble in town?', () => cdlg(e, `Bandits raid us${isNight() ? ' tonight, I fear' : ' often'}. Drive them off and the town will pay ${raidPay()} coins.`)],
    ['I will defend the town!', () => { if (trialRun || duelNPC) return cdlg(e, 'Finish what you are doing first, ninja.'); closeDlg(); startRaid(tw); }],
    ['Tell me about this town.', () => cdlg(e, `${world.town.name} has stood here for three hundred years. Rice, tea and quiet, when the bandits allow it. The merchant by the well sells what travellers need.`)],
    ['Farewell.', closeDlg]];
  else opts = [
    ['How are you?', () => cdlg(e, pickOne(wx.to === 'rain' || wx.to === 'storm' ? [...CIT_LINES.rain, ...CIT_LINES.storm] : isNight() ? CIT_LINES.night : CIT_LINES.day))],
    ['Any news?', () => cdlg(e, wisp ? (() => { const dx = wisp.x - player.pos.x, dz = wisp.z - player.pos.z, dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']; return `A spirit light was seen to the ${dirs[Math.round(((Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]}. They say it tests the brave.`; })() : pickOne(['The elder is worried about bandits.', 'They say charms bring blessings to those who gather them.', 'A rival ninja passed through this morning.']))],
    ['Farewell.', closeDlg]];
  $('dlgOpts').innerHTML = '';
  opts.forEach(([label, fn], i) => { const b = document.createElement('button'); b.className = 'btn sm'; b.innerHTML = `<i>${i + 1}</i>${label}`; b.addEventListener('click', ev => { ev.stopPropagation(); sfx.click(); fn(); }); $('dlgOpts').appendChild(b); });
  $('dlg').classList.remove('hidden');
}
// Bandit raids: bandits pour in from the edge of town, a few at a time; beat them all within the time (and stay in
// town). Each raid repelled makes the next bigger and brings tougher kinds; night raids pay half again.
const raidPay = () => Math.round((120 + 20 * Math.min(10, save.raids || 0)) * (isNight() ? 1.5 : 1));
function startRaid(tw) {
  if (!tw || trialRun || duelNPC) return;
  const n = save.raids || 0, kinds = ['grunt', 'grunt', 'runner', 'archer'];
  if (n >= 2) kinds.push('samurai'); if (n >= 4) kinds.push('brute'); if (n >= 6) kinds.push('assassin');
  trialRun = { raid: true, town: tw, pay: raidPay(), kills: 0, spawned: 0, total: Math.min(30, 12 + 3 * n), live: Math.min(7, 4 + Math.floor(n / 2)), kinds, left: 150, next: 2 };
  hideCitizens(true); banner('BANDIT RAID', `Defend ${tw.name}: ${trialRun.total} bandits`); sfx.warn();
  hearts = maxHearts; updHearts(); updQuest();
}
function endRaid(R, won) {
  hideCitizens(false);
  if (!won) { banner('THE BANDITS ESCAPE', `${R.town.name} is plundered`); sfx.lose(); return; }
  save.coins += R.pay; save.raids = (save.raids || 0) + 1; ult = 100; persist();
  banner('TOWN SAVED', `+${R.pay} · ${R.town.name} cheers you`); sfx.win(); slowmo(0.3, 0.5);
  for (const e of cits) say(e, pickOne(['Hooray!', 'Thank you, ninja!', 'Our hero!', 'They ran like rabbits!']), 4);
  errandStep('raid');
}

/* ============ explorer's guide ============ */
// The first time you explore, a short guide joins you after a little while (once you've had a look round) and walks
// through what explore mode has: the minimap, rivals, rumours, errands, cutting scenery, spirit trials and duels.
// It shares the tutorial's card, pays once, and can be skipped or replayed from the pause menu.
let guide = null;
const GUIDE_COINS = 100, GUIDE_DELAY = 12;
const gflag = k => { if (guide) guide.flags[k] = true; };
function guideRival() {   // make sure there's a rival close by to try things on
  if (npcs.some(e => !e.npc.yieldT && Math.hypot(e.x - player.pos.x, e.z - player.pos.z) < 18)) return;
  const q = openSpot(player.pos.x, player.pos.z, 5, 8, ahead(), true) || openSpot(player.pos.x, player.pos.z, 5, 8, ahead()); if (q) makeNPC(q.x, q.z);
}
const GUIDE_STEPS = [
  { t: 'Into the wilds', d: 'Beyond the arena lies a whole land to roam. Head out through a gate to the white marker. The minimap (top right) shows the land, hidden charms (gold) and other ninjas (blue).',
    init: () => { guide.goal = openSpot(0, 0, world.wallR + 8, world.wallR + 14, ahead(), true) || openSpot(player.pos.x, player.pos.z, world.wallR + 8, world.wallR + 16, undefined, true); },
    check: () => { const l = world.local(player.pos), G = guide.goal; return Math.hypot(l.x, l.z) > world.wallR + 5 && (!G || Math.hypot(G.x - player.pos.x, G.z - player.pos.z) < 4 || guide.dist > 40); } },
  { t: 'Meet a rival', d: () => sdk.touch ? 'Walk up to a ninja and tap Talk.' : 'Walk up to a ninja and press {KeyT} to talk.', init: guideRival, check: () => guide.flags.talk },
  { t: 'Rumours', d: 'Ask "Heard any rumours?" A gold marker then points to that charm. Charms add up to permanent blessings: extra hearts, faster Storm, more coins.', init: guideRival, check: () => guide.flags.rumour },
  { t: 'Errands', d: 'Ask "Need a hand?" for an errand: cut scenery, win a duel, find a charm or finish a spirit trial. It shows under your hearts and pays coins when done.',
    init: guideRival, check: () => guide.flags.errand },
  { t: 'Cut anything', d: 'Out here your blade cuts the world itself. Slice a tree, a lantern or a fence.', check: () => guide.flags.prop },
  { t: 'Spirit trial', d: 'A spirit is waiting (follow the cyan marker). Touch it and spirit warriors rise round you: cut them all down before time runs out.',
    init: () => { if (!trialRun) spawnWisp(7, 10); }, check: () => guide.flags.trial },
  { t: 'Towns', d: () => `Every map has a town: follow the white marker. Talk to townsfolk (${sdk.touch ? 'tap Talk' : 'press {KeyT}'}). The merchant sells tea, talismans and charm maps, and the elder at the bounty board needs help against bandit raids.`,
    init: () => { const tw = townAt(); if (tw) guide.goal = { x: tw.x, z: tw.z }; }, check: () => { const tw = townAt(); return !tw || Math.hypot(player.pos.x - tw.x, player.pos.z - tw.z) < tw.r; } },
  { t: 'Duels', d: () => (sdk.touch ? 'Tap Duel' : 'Press {KeyR}') + ' next to a ninja to challenge them, and see the duel through. Duels are never to the death, and a win pays coins by rank.',
    init: guideRival, check: () => guide.flags.duel },
];
const guideText = st => keyText(typeof st.d === 'function' ? st.d() : st.d);
function startGuide() {
  if (!stage || !stage.explore || guide) return;
  guide = { i: -1 }; nextGuideStep();
  $('tutSkip').textContent = 'Skip guide'; $('tutBox').classList.remove('hidden');
}
function nextGuideStep() {
  if (!guide) return;
  if (++guide.i >= GUIDE_STEPS.length) { endGuide(true); return; }
  Object.assign(guide, { flags: {}, done: false, dist: 0, last: player.pos.clone(), goal: null });
  const st = GUIDE_STEPS[guide.i]; if (st.init) st.init();
  $('tutStep').textContent = `EXPLORER'S GUIDE · ${guide.i + 1} / ${GUIDE_STEPS.length}`;
  $('tutTitle').textContent = st.t; $('tutText').textContent = guideText(st);
  $('tutSkipKey').textContent = sdk.touch ? '' : keyText(' · {KeyP} = pause / skip');
  $('tutBox').classList.remove('done');
}
function updGuide() {
  if (!guide || guide.done) return;
  guide.dist += Math.hypot(player.pos.x - guide.last.x, player.pos.z - guide.last.z); guide.last.copy(player.pos);
  if (GUIDE_STEPS[guide.i].check()) { guide.done = true; $('tutBox').classList.add('done'); sfx.coin(); after(1.0, nextGuideStep); }
}
function endGuide(done) {
  if (!guide) return;
  const first = done && !save.exGuide; guide = null;
  save.exGuide = true; if (first) save.coins += GUIDE_COINS; persist();
  $('tutBox').classList.add('hidden'); $('tutSkip').textContent = 'Skip tutorial';
  if (done) { banner('GUIDE COMPLETE', first ? `+${GUIDE_COINS} COINS` : 'HAPPY TRAVELS'); sfx.win(); }
  if (stage.fromTut) {   // the first-time path goes on to stage 1; explore stays open from the menu
    stage.fromTut = false; after(done ? 3 : 0.5, () => { if (stage.explore && state === 'play') { bankRunCoins(); playStage(1, false); } });
  }
}

/* ============ tutorial ============ */
let tut = null;
function spawnFront(kind, n, d, spread = 0.45) {
  for (let i = 0; i < n; i++) {
    const a = player.yaw + (i - (n - 1) / 2) * spread;
    let x = player.pos.x - Math.sin(a) * d, z = player.pos.z - Math.cos(a) * d;
    const r = Math.hypot(x, z), R = world.arenaR - 1.5; if (r > R) { x *= R / r; z *= R / r; }
    spawnEnemy(kind, x, z, true);
  }
}
const TUT_STEPS = [
  { t: 'Look around', d: () => sdk.touch ? 'Touch the left side of the screen and push the stick left or right to turn.' : 'Move the mouse to look around the arena.',
    check: () => tut.yawAcc > 2.4 },
  { t: 'Move', d: () => sdk.touch ? 'Push the stick up to run forward, down to back off.' : 'Run around with {KeyW} {KeyA} {KeyS} {KeyD}.',
    check: () => tut.dist > 7 },
  { t: 'Dash', d: () => sdk.touch ? 'Tap DASH to dash in the direction you are moving. Dashing dodges attacks.' : 'Press Shift to dash. Dashing dodges attacks.',
    check: () => tut.flags.dash },
  { t: 'Jump & flip', d: () => sdk.touch ? 'Tap JUMP, then tap it again in the air for a front flip. Jumping over a strike dodges it.' : 'Press Space to jump, and Space again in the air for a front flip. Jumping over a strike dodges it.',
    check: () => tut.flags.flip },
  { t: 'Slice!', d: () => sdk.touch ? 'Swipe across the straw dummy to cut it in half.' : 'Hold the left mouse button and drag across the dummy. The cut follows your exact line.',
    init: () => spawnFront('dummy', 1, 4.2), check: () => tut.kills >= 1 },
  { t: 'Quick slash', d: () => sdk.touch ? 'A quick tap on a dummy also slashes it.' : 'Just click (no drag) for a fast slash at the crosshair.',
    init: () => spawnFront('dummy', 2, 3.6), check: () => tut.kills >= 2 },
  { t: 'Air slice', d: 'Slice a falling half again before it lands. Air slices pay bonus coins.',
    init: () => spawnFront('dummy', 2, 4), check: () => stats.air >= 1 || (tut.kills >= 2 && tut.t > 6) },
  { t: 'Throwing weapons', d: () => sdk.touch ? 'Tap the shuriken slot, then tap the far dummies to throw. Hold to keep throwing.' : 'Press 2 for shuriken, then click to throw (hold to keep throwing). Throws reach far targets.',
    init: () => { trial = 'shuriken'; buildWBar(); spawnFront('dummy', 3, 11, 0.3); }, check: () => tut.kills >= 3 },
  { t: 'Dodge', d: 'A ninja attacks! A red ! means a strike is coming: dash or step away, then slice him.',
    init: () => { selectWeapon('katana'); spawnFront('grunt', 1, 9); }, check: () => !enemies.length },
  { t: 'Finishers', d: () => sdk.touch ? 'Swipe LOW across his legs to cripple him instead of killing him. Then get close and tap FINISH (or JUMP first for an aerial finisher).' : 'Slice LOW across his legs to cripple him instead of killing him. Then get close and press {KeyQ} to finish him (jump first for an aerial finisher).',
    init: () => { tut.wounds = true; tutTarget(); }, check: () => { if (!tut.flags.finish && !enemies.length) tutTarget(); return tut.flags.finish && !enemies.length; } },
  { t: 'Blade Storm', d: () => sdk.touch ? 'Your STORM gauge is full. Tap STORM to slice every enemy around you.' : 'Your Storm gauge is full. Press {KeyQ} to slice every enemy around you.',
    init: () => { ult = 100; spawnFront('grunt', 4, 10, 0.5); }, check: () => tut.flags.storm && !enemies.length },
  { t: 'Camera views', d: () => sdk.touch ? 'Tap the camera button (top right) to switch between first person, third person and wide view.' : 'Press {KeyC} (or the camera button, top right) to switch between first person, third person and wide view.',
    check: () => (tut.flags.cam || 0) >= 2 },
];
function tutTarget() { spawnFront('grunt', 1, 4.5); enemies[enemies.length - 1].state = 'idle'; }   // a ninja who stands still for practice
function startTutorial() {
  clearField();
  stage = { n: 0, tutorial: true, boss: false, queue: [], total: TUT_STEPS.length, theme: 2, speedMul: 1, map: 'shrine' };
  world.setExplore(false); world.setMap('shrine'); world.setTheme(2); $('minimap').classList.add('hidden');
  maxHearts = heartsMax(); hearts = maxHearts;
  score = 0; runCoins = 0; comboN = 0; ult = 0; invuln = 0;
  stats = { kills: 0, maxCombo: 0, dmg: 0, air: 0, counters: 0, perfect: 0, clean: 0 };
  killedCounted = 0; revived = false; bossE = null; strokeKills.clear(); timeScale = 1; slowT = 0;
  player.pos.set(0, 0, 4); player.vel.set(0, 0, 0); player.yaw = 0; player.pitch = -0.06; player.dashT = player.dashCD = 0; player.y = player.vy = player.flip = 0; player.ground = true;
  trial = null; cur = 'katana';
  for (const id of WIDS) cds[id] = 0;
  state = 'play'; vmMode = 'hand';
  showLayer(null); $('hud').classList.remove('hidden'); $('bossBar').classList.add('hidden'); $('tut').classList.add('hidden');
  $('stageTag').textContent = 'TRAINING GROUNDS';
  updHearts(); buildWBar(); updHUD();
  banner('TRAINING', 'TUTORIAL'); music('menu');
  tut = { i: -1, wounds: false }; nextTutStep();
  $('tutBox').classList.remove('hidden');
  gameplay(true); requestLock(); updLockUI();
}
function nextTutStep() {
  if (!tut) return;
  tut.i++;
  for (const e of enemies) scene.remove(e.root);
  enemies = [];
  killedCounted = tut.i;
  if (tut.i >= TUT_STEPS.length) { finishTutorial(); return; }
  Object.assign(tut, { kills: 0, t: 0, flags: {}, done: false, yawAcc: 0, dist: 0, lastYaw: player.yaw, lastPos: player.pos.clone() });
  const st = TUT_STEPS[tut.i];
  if (st.init) st.init();
  $('tutStep').textContent = `STEP ${tut.i + 1} / ${TUT_STEPS.length}`;
  $('tutTitle').textContent = st.t;
  $('tutText').textContent = keyText(typeof st.d === 'function' ? st.d() : st.d);
  $('tutSkipKey').textContent = sdk.touch ? '' : keyText(' · {KeyP} = pause / skip');
  $('tutBox').classList.remove('done');
}
function updTutorial(dt) {
  if (!tut || tut.done || tut.i >= TUT_STEPS.length) return;
  tut.t += dt;
  tut.yawAcc += Math.abs(player.yaw - tut.lastYaw); tut.lastYaw = player.yaw;
  tut.dist += Math.hypot(player.pos.x - tut.lastPos.x, player.pos.z - tut.lastPos.z); tut.lastPos.copy(player.pos);
  if (TUT_STEPS[tut.i].check()) { tut.done = true; $('tutBox').classList.add('done'); sfx.coin(); after(1.0, nextTutStep); }
}
function finishTutorial() {
  const first = !save.tutDone;
  save.tutDone = true; save.tut = true;
  if (first) save.coins += 150;
  persist();
  trial = null; tut = null;
  $('tutBox').classList.add('hidden');
  banner('TRAINING COMPLETE', first ? '+150 COINS' : 'WELL DONE');
  sfx.win(); state = 'clearing'; gameplay(false); exitLock(); updLockUI();
  after(2.2, () => {
    clearField(); $('hud').classList.add('hidden');
    state = 'arsenal'; vmMode = 'display'; showLayer('arsenal'); arsSel = 'shuriken'; renderArsenal(); music('menu');
    startTour(true);
  });
}

/* ============ shop tour ============ */
const pick = id => { arsSel = id; renderArsenal(); };
const TOUR = [
  { sel: '#coinsBadge', t: 'Coins', d: 'You earn coins for every slice, combo, air slice and stage clear. Clearing a stage without getting hit pays a bonus.' },
  { sel: '#wList', t: 'Your arsenal', d: 'All 5 weapons plus Vitality. Tap one to see its details. Locked weapons show their unlock price.' },
  { sel: '#wdStats', t: 'Stats', d: 'Power is damage per hit (samurai have 3 HP, the Oni boss much more). Range is reach in meters. Speed is the time between attacks. Green numbers preview the next upgrade.', pre: () => pick('shuriken') },
  { sel: '#wdPerk', t: 'Perks', d: 'Every weapon has a special trait that grows with upgrades, such as more shuriken per throw or piercing several enemies.' },
  { sel: '#wdLvl', t: 'Levels', d: 'Each weapon has 5 levels. Every upgrade improves its stats.' },
  { sel: '#wdBuy', t: 'Unlock & upgrade', d: 'Spend coins here. Each level costs more than the last.' },
  { sel: '#wdTry', t: 'Free trial', d: 'Short on coins? Watch an ad to take a locked weapon into your next stage for free.', skip: () => $('wdTry').classList.contains('hidden') },
  { sel: '.wCard[data-id="vitality"]', t: 'Vitality', d: 'Adds one extra heart per level, up to 9 hearts. More hearts means more mistakes allowed.', pre: () => pick('vitality') },
  { sel: null, t: 'In battle', d: 'Every weapon you own is ready in every fight: switch with 1-6, the mouse wheel or the weapon bar. Mix them up!' },
];
let tourI = -1, tourFromTut = false;
function startTour(fromTut) { tourFromTut = fromTut; tourI = -1; $('tour').classList.remove('hidden'); nextTour(); }
function nextTour() {
  tourI++;
  while (tourI < TOUR.length && TOUR[tourI].skip && TOUR[tourI].skip()) tourI++;
  if (tourI >= TOUR.length) { endTour(); return; }
  const st = TOUR[tourI];
  if (st.pre) st.pre();
  $('tourStep').textContent = `SHOP GUIDE ${tourI + 1} / ${TOUR.length}`;
  $('tourTitle').textContent = st.t; $('tourText').textContent = st.d;
  $('tourNext').textContent = tourI === TOUR.length - 1 ? (tourFromTut ? 'Start Stage 1' : 'Got it') : 'Next';
  requestAnimationFrame(placeTour);
}
function placeTour() {
  const st = TOUR[tourI]; if (!st) return;
  const card = $('tourCard'), hole = $('tourHole'), el = st.sel && document.querySelector(st.sel);
  const cw = card.offsetWidth, ch = card.offsetHeight, gap = 14, pad = 6;
  if (!el) { Object.assign(hole.style, { left: vw / 2 + 'px', top: vh / 2 + 'px', width: '0px', height: '0px' }); card.style.left = (vw - cw) / 2 + 'px'; card.style.top = (vh - ch) / 2 + 'px'; return; }
  const r = el.getBoundingClientRect();
  Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  let x, y;
  if (r.right + gap + cw < vw - 8) { x = r.right + gap; y = r.top + r.height / 2 - ch / 2; }
  else if (r.left - gap - cw > 8) { x = r.left - gap - cw; y = r.top + r.height / 2 - ch / 2; }
  else if (r.bottom + gap + ch < vh - 8) { x = r.left + r.width / 2 - cw / 2; y = r.bottom + gap; }
  else { x = r.left + r.width / 2 - cw / 2; y = r.top - gap - ch; }
  card.style.left = clamp(x, 8, vw - cw - 8) + 'px'; card.style.top = clamp(y, 8, vh - ch - 8) + 'px';
}
function endTour() {
  $('tour').classList.add('hidden');
  save.shopTour = true; persist();
  if (tourFromTut) { tourFromTut = false; vmMode = 'hand'; if (save.exGuide) playStage(1, false); else startExplore(stageMap(1), true); }   // first time: the explorer's guide comes before stage 1
}
click('tourNext', nextTour);
click('tourSkip', () => { tourFromTut = false; endTour(); });

/* ============ loop ============ */
let last = performance.now(), T = 0;
// swipes are drawn as a wet ink brush stroke: thick at the head, dry and broken at the tail
let tDrawn = true;   // the 2D overlay has something on it that needs clearing
function drawTrail(now) {
  if (tDrawn) { tctx.clearRect(0, 0, vw, vh); tDrawn = false; }
  while (trail.length && now - trail[0].t > 160) trail.shift();
  if (trail.length > 1) {
    tDrawn = true;
    tctx.lineCap = 'round'; tctx.lineJoin = 'round';
    const wide = WEAP[cur].mode === 'sweep' ? 1.7 : 1;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], k = clamp(1 - (now - b.t) / 160, 0, 1), f = i / trail.length;
      tctx.strokeStyle = `rgba(16,12,10,${0.85 * k})`;
      tctx.lineWidth = (2 + 15 * Math.sin(Math.min(1, f * 1.15) * Math.PI * 0.85)) * k * wide;
      tctx.beginPath(); tctx.moveTo(a.x, a.y); tctx.lineTo(b.x, b.y); tctx.stroke();
      if (k > 0.5 && ((i * 7919) % 11) === 0) {   // flicked droplets
        const h = (i * 2654435761) % 1000 / 1000;
        tctx.fillStyle = `rgba(16,12,10,${0.7 * k})`; tctx.beginPath(); tctx.arc(b.x + (h - 0.5) * 34, b.y + ((h * 7) % 1 - 0.5) * 34, 1.5 + h * 3, 0, 7); tctx.fill();
      }
    }
    // a thin red edge on the freshest part reads as a sharp blade
    const n = trail.length, c = trail[n - 1], d = trail[Math.max(0, n - 4)];
    tctx.strokeStyle = 'rgba(176,24,18,0.7)'; tctx.lineWidth = 2; tctx.beginPath(); tctx.moveTo(d.x, d.y); tctx.lineTo(c.x, c.y); tctx.stroke();
  }
  for (const s of stormLines.slice()) {
    s.t -= 1 / 60;
    if (s.t <= 0) { stormLines.splice(stormLines.indexOf(s), 1); continue; }
    tDrawn = true;
    const L = Math.max(vw, vh), k = s.t / 0.35, dx = Math.cos(s.a) * L, dy = Math.sin(s.a) * L;
    tctx.strokeStyle = `rgba(16,12,10,${0.9 * k})`; tctx.lineWidth = 14 * k; tctx.beginPath(); tctx.moveTo(s.x - dx, s.y - dy); tctx.lineTo(s.x + dx, s.y + dy); tctx.stroke();
    tctx.strokeStyle = `rgba(176,24,18,${k})`; tctx.lineWidth = 3 * k; tctx.stroke();
  }
}
let autoT = 0, frameN = 0;
function autopilot(dt) {
  const dist = e => Math.hypot(e.x - player.pos.x, e.z - player.pos.z);
  const near = enemies.filter(e => !e.gate).sort((a, b) => dist(a) - dist(b))[0];
  if (near) { const want = Math.atan2(-(near.x - player.pos.x), -(near.z - player.pos.z)); let da = want - player.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); player.yaw += da * Math.min(1, dt * 5); }
  autoT -= dt; if (autoT > 0) return;
  autoT = 0.3;
  const W = WEAP[cur], l = lvl(cur);
  const e = enemies.find(e => dist(e) < (W.range ? W.range(l) : 30));
  if (!e) return;
  const s = toScreen(bodyCenter(e)); if (!s || s.x < 0 || s.x > vw) return;
  const a = rnd(0, Math.PI), r = 120;
  const x0 = s.x - Math.cos(a) * r, y0 = s.y - Math.sin(a) * r, x1 = s.x + Math.cos(a) * r, y1 = s.y + Math.sin(a) * r;
  if (W.mode === 'throw') { if (cds[cur] <= 0) { fireThrow(cur, s.x, s.y); cds[cur] = W.cd(l); } return; }
  if (W.mode === 'fling') { if (cds[cur] <= 0) doFling(x0, y0, x1, y1); return; }
  stroke++; startSwing(x1 - x0, y1 - y0); sfx.swish();
  const now = performance.now(); trail.length = 0;
  for (let i = 0; i <= 8; i++) trail.push({ x: x0 + (x1 - x0) * i / 8, y: y0 + (y1 - y0) * i / 8, t: now - (8 - i) * 6 });
  sliceSeg([x0, y0, x1, y1], x0, y0, x1, y1, 30, 3, stroke, cur);
}

// red arrows at the screen edge for enemies you can't see
function drawThreats() {
  if (state !== 'play') return;
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw), t = performance.now() / 1000;
  for (const e of enemies) {
    const dx = e.x - player.pos.x, dz = e.z - player.pos.z, dist = Math.hypot(dx, dz);
    if (dist > 28 || e.gate || e.d.dummy) continue;
    const s = toScreen(bodyCenter(e));
    if (s && s.x > 30 && s.x < vw - 30 && s.y > 30 && s.y < vh - 30) continue;
    const lx = dx * cy - dz * sy, lf = -dx * sy - dz * cy, a = Math.atan2(lx, lf);
    const x = vw / 2 + Math.sin(a) * (vw / 2 - 46), y = vh / 2 - Math.cos(a) * (Math.cos(a) > 0 ? vh / 2 - 46 : vh / 2 - 110);
    const danger = e.state === 'windup' || e.state === 'throw', near = clamp(1 - dist / 28, 0.25, 1);
    const sz = (danger ? 22 : 15) * (0.7 + near * 0.5) * (danger ? 1 + Math.sin(t * 30) * 0.15 : 1);
    tDrawn = true; tctx.save(); tctx.translate(x, y); tctx.rotate(a);
    tctx.fillStyle = danger ? '#ff2a2a' : `rgba(255,70,60,${0.35 + near * 0.55})`;
    tctx.shadowColor = '#000'; tctx.shadowBlur = 6;
    tctx.beginPath(); tctx.moveTo(0, -sz); tctx.lineTo(sz * 0.75, sz * 0.5); tctx.lineTo(0, sz * 0.15); tctx.lineTo(-sz * 0.75, sz * 0.5); tctx.closePath(); tctx.fill();
    tctx.restore();
  }
  if (fovKick > 2.5 && state === 'play') {
    tDrawn = true; const k = Math.min(1, (fovKick - 2.5) / 7), cx = vw / 2, cy = vh / 2, R = Math.hypot(cx, cy);
    tctx.strokeStyle = `rgba(20,16,12,${0.3 * k})`; tctx.lineWidth = 2;
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2 + (i * 7.3 % 1), r0 = R * (0.55 + (i * 3.7 % 1) * 0.25); tctx.beginPath(); tctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); tctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); tctx.stroke(); }
  }
  if (blade && ptr.down) { tDrawn = true; tctx.strokeStyle = '#fff'; tctx.lineWidth = 2; tctx.beginPath(); tctx.arc(cursor.x, cursor.y, 7, 0, Math.PI * 2); tctx.stroke(); }
}

let rawDt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (DEV && QS.has('hold') && QS.has('sim')) { step(0, now); return; }   // dev: freeze on the last simulated frame
  rawDt = (now - last) / 1000;
  step(Math.min(0.05, rawDt), now); last = now;
}
const _camT = new V3(), cam = { yaw: 0, pitch: 0, p: new V3(), dist: 3.7, init: false };   // the smoothed third-person camera rig
function step(rdt, now, draw = true) {
  T += rdt;
  const running = state === 'play' || state === 'clearing' || state === 'gameover';
  if (slowT > 0) { slowT -= rdt; if (slowT <= 0) slowTo = 1; }
  timeScale += (slowTo - timeScale) * (1 - Math.exp(-rdt * (slowTo < timeScale ? 30 : 5)));
  const frozen = state === 'play' && needLock() && !AUTO && !(DEV && QS.has('sim'));
  const dt = state === 'paused' || frozen ? 0 : rdt * timeScale * (hitStop > 0 ? 0.06 : 1);
  hitStop -= rdt;
  if (state !== 'paused') for (const tm of timers.slice()) { tm.t -= rdt; if (tm.t <= 0) { timers.splice(timers.indexOf(tm), 1); tm.fn(); } }
  if (running && stage) {
    if (state === 'play') {
      updPlayer(dt);
      updTutorial(dt); updExplore(dt); updNPCs(dt);
      updSpawner(dt);
      for (const id of WIDS) cds[id] = Math.max(0, cds[id] - dt);
      if (ptr.down && WEAP[cur].mode === 'throw' && cds[cur] <= 0) { fireThrow(cur, ptr.x, ptr.y); cds[cur] = WEAP[cur].cd(lvl(cur)); }
      comboT -= dt; if (comboT <= 0 && comboN) { comboN = 0; $('combo').classList.remove('on'); }
      invuln -= dt;
      if (AUTO) autopilot(dt);
      checkClear();
    }
    MARK_MAT.opacity = 0.75 + 0.25 * Math.sin(T * 22);
    updEnemies(dt); updPProj(dt); updEProj(dt); updFling(dt);
    updHUD();
  }
  animHero(dt); updHeroTails(dt);
  phys.update(dt); fx.update(dt); world.update(dt, T, camera.position);
  // camera
  shake = Math.max(0, shake - rdt * 2.2);
  if (state === 'chars') {
    camera.position.set(-0.75, 1.3, 3.1); camera.lookAt(-0.45, 1.0, 0);
  } else if (state === 'menu' || state === 'arsenal' || state === 'settings') {
    const a = T * 0.04;
    camera.position.set(Math.sin(a) * 15, 3.2, Math.cos(a) * 15);
    camera.lookAt(0, 1.6, 0);
  } else {
    if (save.cam === 'fp') {
      camera.position.set(player.pos.x, player.y + EYE + Math.sin(player.bob) * 0.04 * player.bobAmt - landDip, player.pos.z);
      const roll = player.dashAnim ? (player.dashAnim.dir === 'R' ? -0.07 : player.dashAnim.dir === 'L' ? 0.07 : 0) * dashWeight() : 0;
      camera.rotation.set(player.pitch - (player.flip > 0 ? Math.PI * 2 * smooth(player.flip) : 0), player.yaw, Math.sin(player.bob * 0.5) * 0.004 * player.bobAmt + roll);
    } else {
      // over-the-shoulder (tp) or high wide action view, orbiting with the look direction
      const wide = save.cam === 'wide';
      let dist = wide ? 6.8 : 3.7;
      const side = wide ? 0 : 0.95, lift = wide ? 1.5 : 0.45;
      // The camera rig is smoothed as a whole: the look angles, the pivot over the shoulder and the boom length
      // each ease toward their targets, and the camera sits exactly on the boom. (Easing only the position while
      // the rotation snapped made the two disagree whenever you turned or strafed, so the view shuddered.)
      const snap = state !== 'play' || !cam.init || Math.hypot(player.pos.x - cam.p.x, player.pos.z - cam.p.z) > 8,   // new stage or a teleport: no swoop
        ka = snap ? 1 : 1 - Math.exp(-rdt * 40), kp = snap ? 1 : 1 - Math.exp(-rdt * 18), ky = snap ? 1 : 1 - Math.exp(-rdt * 10);
      cam.yaw += Math.atan2(Math.sin(player.yaw - cam.yaw), Math.cos(player.yaw - cam.yaw)) * ka;
      cam.pitch += (clamp(player.pitch + (wide ? -0.32 : -0.08), -1.3, 0.9) - cam.pitch) * ka;
      const pitch = cam.pitch, yaw = cam.yaw;
      const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
      cam.p.x += (player.pos.x + Math.cos(yaw) * side - cam.p.x) * kp; cam.p.z += (player.pos.z - Math.sin(yaw) * side - cam.p.z) * kp;
      cam.p.y += (1.55 + lift + player.y * 0.75 - landDip - cam.p.y) * ky;   // jumps and landings lift and dip it softly
      const hx = cam.p.x, hy = cam.p.y, hz = cam.p.z;
      for (let i = 0; i < 6 && Math.hypot(hx - fx * dist, hz - fz * dist) > world.camR; i++) dist *= 0.8;   // stay out of the scenery past the arena
      cam.dist = snap || dist < cam.dist ? dist : cam.dist + (dist - cam.dist) * (1 - Math.exp(-rdt * 5));   // pull in at once, ease back out
      cam.init = true;
      camera.position.set(hx - fx * cam.dist, Math.max(0.35, hy - fy * cam.dist), hz - fz * cam.dist);
      camera.rotation.set(pitch, yaw, 0);
    }
    if (finish && state === 'play') cineCam(); else cineW = 0;
    if (shake > 0) { const s = shake * shake * 0.09; camera.position.x += rnd(-s, s); camera.position.y += rnd(-s, s); camera.rotation.z += rnd(-s, s) * 0.3; }
  }
  landDip = Math.max(0, landDip - rdt * 0.6);
  fovKick *= Math.exp(-rdt * 6);
  { const f = baseFov + fovKick - 8 * cineW; if (Math.abs(camera.fov - f) > 0.02) { camera.fov = f; camera.updateProjectionMatrix(); } }
  camera.updateMatrixWorld();
  updateVM(rdt, T);
  if (!draw) return;
  if (DEV && QS.has('dbg')) renderer.info.autoReset = false;   // dev: count every pass of the frame
  if (composer) composer.render(); else renderer.render(scene, camera);
  if (DEV && QS.has('dbg')) { dbgDraw = `dc=${renderer.info.render.calls} tri=${(renderer.info.render.triangles / 1000).toFixed(0)}k geo=${renderer.info.memory.geometries} prog=${renderer.info.programs.length}`; renderer.info.reset(); }
  tuneRes(rawDt);
  drawTrail(performance.now());
  drawThreats(); drawMinimap(); drawNPCTags(); drawMarkers();
  if (DEV && QS.has('dbg')) { frameN = (frameN || 0) + 1; document.title = `${dbgDraw} ${quality} f${frameN} cam=${save.cam} v2=${save.camV2} T${T.toFixed(1)} st=${state} en=${enemies.length} bodies=${phys.dolls.length}/${phys.rigids.length} k=${stats.kills} em=${enemies.reduce((n, e) => { e.root.traverseVisible(o => { if (o.isMesh) n++; }); return n; }, 0)} rs=${dynRes.scale.toFixed(2)} q=${stage ? stage.queue.length : -1}`; }
}

/* ============ boot ============ */
async function boot() {
  await initSDK();
  loadingStart();
  sdk.onMute = applyAudio;
  sdk.onAdUI = updAdUI;
  sdk.onAuth = () => { loadSave(); if (state === 'menu') updMenu(); updCoins(); };
  loadSave();
  quality = save.q || (sdk.touch || integratedGPU() ? 'low' : 'high');
  document.body.classList.toggle('touch', sdk.touch);
  if (sdk.touch) $('menuHint').innerHTML = 'Left thumb: move &amp; turn · Right side: swipe to slice<br>Tap to throw · JUMP twice to flip · DASH to dodge · STORM when charged';
  $('lockHint').addEventListener('click', () => { audio.unlock(); requestLock(); });
  CAP.blood = save.blood; cur = has(save.cur) ? save.cur : 'katana';
  if (save.stage > 1) save.tutDone = true;   // veterans skip the forced tutorial
  if (!save.camV2) { save.cam = 'tp'; save.camV2 = 1; }   // third person is the new default view
  if (!CAM_MODES.includes(save.cam)) save.cam = 'tp';
  setupRenderer();
  await new Promise(r => setTimeout(r, 30));
  world = buildWorld(scene, renderer, quality);
  if (DEV) window.__dev = { scene, renderer, camera, get hero() { return hero; }, tails: heroTails };   // dev: poke at the scene from the console
  world.setMap(stageMap(save.sel));
  fx = makeFX(scene); fx.blood = save.blood;
  phys = makePhysics(scene, fx, sfx, world);
  await loadBody('models/body.glb');
  delete save.style;   // the ink look is gone; old saves drop the setting
  for (const k of Object.keys(EDEF)) templates[k] = batchParts(buildEnemy(k));   // fewer draw calls per enemy
  buildViewmodel(); buildFling(); buildHero(); chShown = save.char;
  applyQuality();
  world.setTheme(save.sel % 5 === 0 ? 3 : (save.sel - 1) % 3);
  // pre-warm shaders with one of everything on screen
  const warm = [];
  for (const k of Object.keys(EDEF)) { const t = cloneChar(templates[k]); t.position.set(rnd(-3, 3), 0, -10); scene.add(t); warm.push(t); }
  const st = enemyStar(); st.position.set(0, 1, -5); scene.add(st); warm.push(st);
  const wb = phys.fromEnemy(warm[0], new V3()); phys.cut(wb[0], new THREE.Plane(new V3(0, 1, 0), -1), new V3(1, 0, 0), -5);
  for (const id of WIDS) vmW[id].visible = true;
  try { renderer.compile(scene, camera); if (composer) composer.render(); else renderer.render(scene, camera); } catch (e) {}
  for (const w of warm) scene.remove(w);
  phys.clear();
  applyAudio();
  loadingStop();
  state = 'menu'; showLayer('menu'); updMenu(); updToggles(); refreshKeyLabels();
  const unlockMusic = () => { music('menu'); removeEventListener('pointerdown', unlockMusic); removeEventListener('keydown', unlockMusic); };
  addEventListener('pointerdown', unlockMusic); addEventListener('keydown', unlockMusic);
  requestAnimationFrame(t => { last = t; frame(t); });
  const test = DEV ? QS.get('test') : null;
  if (DEV && QS.get('w') && WEAP[QS.get('w')]) { trial = QS.get('w'); }
  if (test === 'play') startStage(+(QS.get('stage') || 1));
  if (test === 'play' && QS.get('spawn')) after(0.4, () => QS.get('spawn').split(',').forEach((k, i, all) => { const a = player.yaw + (i - (all.length - 1) / 2) * 0.5; spawnEnemy(k, player.pos.x - Math.sin(a) * 6, player.pos.z - Math.cos(a) * 6); }));   // dev: e.g. &spawn=shogun,brute
  if (test === 'arsenal') $('arsenalBtn').click();
  if (test === 'chars') { $('charsBtn').click(); if (QS.get('ch')) { chSel = QS.get('ch'); renderChars(); } }   // dev: character screen
  if (DEV && QS.get('dash')) after(+(QS.get('dashAt') || 1), () => { const m = { F: [0, -1], B: [0, 1], L: [-1, 0], R: [1, 0] }[QS.get('dash')], sy = Math.sin(player.yaw), cy = Math.cos(player.yaw); player.moveDir.set(m[0] * cy + m[1] * sy, 0, -m[0] * sy + m[1] * cy); dash(); });   // dev: &dash=F|B|L|R
  if (test === 'storm') { startStage(+(QS.get('stage') || 2)); const at = +(QS.get('at') || 1.6); if (QS.has('air')) after(at - 0.2, jump); after(at, () => { ult = 100; storm(); }); }   // &air: Sky Storm   // dev: fire Blade Storm into the first wave
  if (test === 'finish') {   // dev: a crippled ninja in front of you; &go runs the finisher
    startStage(1);
    after(0.3, () => { const e = spawnEnemy('grunt', player.pos.x, player.pos.z - 2.8, true); e.state = 'idle'; woundEnemy(e, 'legs', new THREE.Plane(UP.clone(), -0.4), new V3(1, 0, 0)); });
    if (QS.has('air')) after(1.2, jump);   // &air: jump first for an aerial finisher
    if (QS.has('go')) after(1.4, tryFinish);
  }
  if (test === 'explore') { startExplore(QS.get('map') || 'shrine'); if (QS.get('at')) { const [x, z] = QS.get('at').split(',').map(Number); player.pos.set(x, 0, z); } }   // dev: ?test=explore&map=castle&at=x,z
  if (test === 'explore' && QS.get('slash')) for (let k = 0; k < +QS.get('slash'); k++) after(1 + k * 0.5, () => { const f = k % 2 ? -1 : 1, x0 = vw * 0.5 - vw * 0.2 * f, y0 = vh * 0.3, x1 = vw * 0.5 + vw * 0.2 * f, y1 = vh * 0.7; stroke++; sliceSeg([x0, y0, x1, y1], x0, y0, x1, y1, +(QS.get('range') || 6), 1, stroke, 'katana'); });   // dev: &slash=N cuts through the screen centre
  if (DEV && QS.get('yaw')) after(0.1, () => { player.yaw = +QS.get('yaw'); });
  if (test === 'explore' && (QS.has('time') || QS.has('wx'))) { if (QS.has('time')) dayT = +QS.get('time'); if (QS.has('wx')) wx = { from: QS.get('wx'), to: QS.get('wx'), k: 1, t: 999 }; skyAcc = envAcc = 9; }   // dev: &time=0..1 (0 dawn, .25 day, .5 dusk, .75 night), &wx=rain|storm|fog|cloudy
  if (test === 'explore' && QS.has('raid')) after(1, () => startRaid(townAt()));   // dev: &raid starts a bandit raid on the nearest town
  if (test === 'explore' && QS.has('wisp')) after(0.5, () => { spawnWisp(1, 1.2); if (QS.has('errand')) errand = { kind: 'trial', need: 1, got: 0, text: 'Finish a spirit trial', reward: 70, name: 'Kenji' }; });   // dev: &wisp starts a spirit trial (&errand with a trial errand)
  if (test === 'explore' && (QS.has('talk') || QS.has('duel'))) after(0.5, () => { const e = makeNPC(player.pos.x, player.pos.z - 2.6); QS.has('talk') ? talk(e) : challenge(e); });   // dev: &talk / &duel
  if (test === 'tutorial') { startTutorial(); if (QS.get('tstep')) { tut.i = +QS.get('tstep') - 2; nextTutStep(); } }
  if (test === 'tour') { $('arsenalBtn').click(); startTour(false); for (let i = 0; i < +(QS.get('tour') || 0); i++) nextTour(); }
  if (DEV && QS.get('cam')) save.cam = QS.get('cam');
  if (DEV && QS.get('pitch')) player.pitch = +QS.get('pitch');
  const sim = DEV ? +(QS.get('sim') || 0) : 0;           // dev: advance the simulation synchronously (headless screenshots)
  for (let i = 0; i < sim; i++) step(1 / 60, performance.now() + i * 16.7, i === sim - 1);
}
boot();
