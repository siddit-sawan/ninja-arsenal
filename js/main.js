import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sdk, initSDK, loadingStart, loadingStop, happytime, gameplay, loadData, saveData, clearData, adsOK, runAd } from './sdk.js';
import { audio, sfx, music } from './audio.js';
import { CAP, batchParts } from './slicer.js';
import { loadBody, cloneChar, RIG, cutMarks, MARK_MAT } from './body.js';
import { makePhysics } from './ragdoll.js';
import { buildEnemy, enemyStar, WEAPON_MODELS, weaponIconSVG, shurikenMesh, kunaiMesh, sickle } from './models.js';
import { buildWorld, THEMES, ARENA_R } from './world.js';
import { makeFX } from './fx.js';

const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0), YAX = new V3(0, 1, 0);
const QS = new URLSearchParams(location.search);
const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);   // dev-only URL switches never work on the live site
const AUTO = DEV && QS.has('auto');                // dev: autopilot swipes (for testing)

/* ============ save ============ */
const SAVE_KEY = 'ninjaArsenal_v1';
const WIDS = ['katana', 'shuriken', 'kunai', 'kusarigama', 'naginata'];
const defSave = () => ({ coins: 0, stage: 1, sel: 1, w: { katana: 1, shuriken: 0, kunai: 0, kusarigama: 0, naginata: 0 }, cur: 'katana', hearts: 0,
  sfx: true, mus: true, q: null, blood: true, tut: false, best: 0, cam: 'tp', tutDone: false, shopTour: false });
let save = defSave();
function loadSave() {
  try {
    const s = JSON.parse(loadData(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') { save = Object.assign(defSave(), s); save.w = Object.assign(defSave().w, s.w || {}); }
    else save = defSave();
  } catch (e) { save = defSave(); }
}
const persist = () => saveData(SAVE_KEY, JSON.stringify(save));

/* ============ weapons ============ */
const WEAP = {
  katana: { name: 'Katana', mode: 'swipe', cost: 0, color: '#cfefff', flash: 0xcfefff,
    desc: 'Swipe to slice anything within reach. Cut falling halves again in mid-air for bonus coins.',
    range: l => 7.5 + l * 0.9, dmg: l => 1 + Math.floor((l - 1) / 2), cd: () => 0, up: [200, 450, 900, 1600] },
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
};
const HEART_UP = [400, 900, 1600, 2600];
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
  oni: { hp: 30, speed: 1.3, value: 150, h: 4.3, w: 1.0, boss: true, dmg: 2, name: 'ONI WARLORD', slain: 'ONI SLAIN' },
  shogun: { hp: 34, speed: 1.7, value: 220, h: 3.0, w: 0.75, boss: true, dmg: 2, reach: 2.6, name: 'SHOGUN GENERAL', slain: 'SHOGUN FALLS' },
  shadow: { hp: 26, speed: 2.6, value: 240, h: 2.55, w: 0.5, boss: true, dmg: 1, reach: 2.0, wind: 0.6, name: 'SHADOW MASTER', slain: 'SHADOW BANISHED' },
  dummy: { hp: 1, speed: 0, value: 0, h: 1.9, w: 0.3, dummy: true },
};

/* ============ renderer / scene ============ */
let renderer, scene, camera, composer = null, bloom, world, fx, phys, quality, baseFov = 60, fovKick = 0, hitStop = 0, landDip = 0;
const EYE = 1.68, PLAYER_R = 0.42, SPEED = 6.4;
const player = { y: 0, vy: 0, ground: true, jumps: 0, flip: 0, ph: 0, pos: new V3(), vel: new V3(), yaw: 0, pitch: -0.06, dashT: 0, dashCD: 0, dashDir: new V3(), moveDir: new V3(), bob: 0, bobAmt: 0 };
const keys = {};
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const look = { drag: false, x: 0, y: 0 };
const cursor = { x: 0, y: 0 };
let locked = false, blade = false, lockFail = false, lockErrs = 0;
let vw = innerWidth, vh = innerHeight;

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;   // keeps the paper and ink colours true
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.05, 900);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
}
// Dynamic resolution: drop render scale when frames run slow, raise it again once there is headroom.
const dynRes = { scale: 1, acc: 0, n: 0, cool: 0 };
function basePR() { return Math.min(devicePixelRatio || 1, quality === 'high' ? 1.5 : 1); }
function setRenderScale(sc) {
  dynRes.scale = sc;
  renderer.setPixelRatio(basePR() * sc);
  renderer.setSize(vw, vh, false);
  if (composer) composer.setSize(vw, vh);
}
function tuneRes(rdt) {
  if (document.hidden || rdt <= 0 || rdt >= 0.05) return;   // ignore tab switches and hitches
  dynRes.acc += rdt; dynRes.n++;
  if (dynRes.acc < 1) return;
  const avg = dynRes.acc / dynRes.n; dynRes.acc = dynRes.n = 0;
  if (dynRes.cool > 0) { dynRes.cool--; return; }
  const minS = 0.65;
  if (avg > 1 / 50 && dynRes.scale > minS) { setRenderScale(Math.max(minS, dynRes.scale - 0.15)); dynRes.cool = 1; }
  else if (avg < 1 / 58 && dynRes.scale < 1) { setRenderScale(Math.min(1, dynRes.scale + 0.1)); dynRes.cool = 3; }
}
function applyQuality() {
  const hi = quality === 'high';
  dynRes.scale = 1;
  renderer.setPixelRatio(basePR());
  if (world) {
    const s = hi ? 2048 : 1024; world.sun.shadow.mapSize.set(s, s);
    if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  }
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
  renderer.setSize(vw, vh, false);
  if (composer) composer.setSize(vw, vh);
  camera.aspect = vw / vh;
  const hf = 80 * Math.PI / 180;   // keep at least ~80° horizontal view on narrow screens
  camera.fov = baseFov = clamp(2 * Math.atan(Math.tan(hf / 2) / camera.aspect) * 180 / Math.PI, 58, 96);
  camera.updateProjectionMatrix();
  const tc = $('trail'), dpr = Math.min(devicePixelRatio || 1, 2);
  tc.width = vw * dpr; tc.height = vh * dpr; tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const tctx = $('trail').getContext('2d');

/* ============ viewmodel ============ */
const vm = new THREE.Group(), wPivot = new THREE.Group(), vmArm = new THREE.Group();
const vmW = {};
const VM_BASE = { katana: [0.36, -0.4, -0.6], shuriken: [0.27, -0.2, -0.62], kunai: [0.28, -0.24, -0.6], kusarigama: [0.32, -0.34, -0.58], naginata: [0.42, -0.5, -0.72] };
const VM_DIR = { katana: [0.05, 0.8, -1], shuriken: [0.12, 1, 0.08], kunai: [-0.35, 1, -0.35], kusarigama: [-0.3, 1, -0.6], naginata: [-0.45, 0.8, -1] };
const DISPLAY_Z = { katana: -1.5, shuriken: -0.5, kunai: -0.55, kusarigama: -0.85, naginata: -2.1 };
const DISPLAY_Y = { katana: -0.42, shuriken: 0, kunai: 0, kusarigama: -0.08, naginata: -0.25 };
const swing = { on: false, t: 0, dur: 0.16, d: new V3(1, 0, 0) };
let jab = 0, vmMode = 'hand', displayId = 'katana';

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
  _vp.set(b[0], b[1] + Math.sin(t * 2) * 0.008, b[2]);
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
let stats = { kills: 0, maxCombo: 0, dmg: 0, air: 0 };
let spawnT = 0, killedCounted = 0, revived = false, bossE = null, shake = 0, timeScale = 1, slowT = 0, slowTo = 1, strokeKills = new Map();
const cds = {}; WIDS.forEach(id => cds[id] = 0);
let lastCoins = 0, resDoubled = false, adsWatchedThisRun = 0, playsSinceAd = 0, lastAdAt = performance.now();
const AD_EVERY_STAGES = 3, AD_GAP_MS = 180000;   // midgame ads: at most every 3rd stage, 3+ minutes apart
const after = (t, fn) => timers.push({ t, fn });

const BOSSES = ['oni', 'shogun', 'shadow'];   // every 5th stage, in rotation
function makeStage(n) {
  const boss = n % 5 === 0;
  const total = Math.min(Math.round(12 + n * 3.2 + n * n * 0.06), 110) - (boss ? 4 : 0);
  const q = [];
  for (let i = 0; i < total; i++) {
    const w = [['grunt', 1]];
    if (n >= 2) w.push(['runner', 0.3 + 0.03 * n]);
    if (n >= 3) w.push(['archer', 0.22 + 0.02 * n]);
    if (n >= 4) w.push(['samurai', 0.18 + 0.03 * n]);
    if (n >= 4) w.push(['brute', 0.1 + 0.025 * n]);
    if (n >= 6) w.push(['assassin', 0.14 + 0.025 * n]);
    let r = Math.random() * w.reduce((s, x) => s + x[1], 0), kind = 'grunt';
    for (const [k, p] of w) { r -= p; if (r <= 0) { kind = k; break; } }
    q.push({ kind, gap: Math.max(0.35, 2.1 - n * 0.07) * rnd(0.55, 1.35) * (Math.random() < 0.18 + n * 0.01 ? 0.15 : 1) });
  }
  if (boss) q.push({ kind: BOSSES[(n / 5 - 1) % BOSSES.length], gap: 2 });
  return { n, boss, queue: q, total: q.length, theme: boss ? 3 : (n - 1) % 3, speedMul: Math.min(1.6, 1 + 0.025 * (n - 1)) };
}

const templates = {};
function spawnEnemy(kind, x, z, minion = false, gate = null) {
  const d = EDEF[kind];
  const root = cloneChar(templates[kind]);
  const P = {}; ['hips', 'torso', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR'].forEach(n => P[n] = root.getObjectByName(n));
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const e = { kind, d, root, P, hp: d.hp, maxHp: d.hp, x, z, speed: d.speed * stage.speedMul * rnd(0.9, 1.1), state: 'run', t: 0, ph: rnd(0, 6), atkT: 0,
    stagger: 0, s: root.scale.x, minion, holdR: rnd(9, 14), lastStroke: -1, sumT: 6, gate, y: 0, air: null, leapCD: rnd(1.5, 4) };
  if (d.boss) { e.hp = e.maxHp = d.hp + 8 * (stage.n / 5 - 1); e.blinkT = rnd(3, 4); bossE = e; $('bossName').textContent = d.name; $('bossBar').classList.remove('hidden'); updBoss(); banner(d.name, 'BOSS'); sfx.roar(); music('boss'); shake = 0.6; }
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
  if (e.stagger > 0) {
    rotTo(P.hips, -0.35, k); rotTo(P.armL, 0.6, k); rotTo(P.armR, 0.6, k); rotTo(P.legL, 0.3, k); rotTo(P.legR, -0.2, k);
    return;
  }
  if (e.state === 'run' || e.state === 'charging') {
    e.ph += dt * (e.state === 'charging' ? 15 : e.speed) * (e.d.boss ? 1.6 : 2.3);
    const s = Math.sin(e.ph), c = Math.cos(e.ph);
    P.legL.rotation.x = -s * 0.85; P.legR.rotation.x = s * 0.85;
    P.kneeL.rotation.x = Math.max(0, c) * 1.3; P.kneeR.rotation.x = Math.max(0, -c) * 1.3;
    P.armL.rotation.x = s * 0.8; rotTo(P.armR, e.kind === 'runner' ? -s * 0.8 : -0.45 - s * 0.25, k);
    P.elbowL.rotation.x = -0.9; P.elbowR.rotation.x = -1.0;
    P.hips.rotation.x = e.kind === 'runner' ? 0.45 : 0.25;
    P.hips.position.y = RIG.hips.y + Math.abs(c) * 0.06;
    P.head.rotation.x = -P.hips.rotation.x * 0.6;
    return;
  }
  // standing poses
  rotTo(P.legL, -0.25, k); rotTo(P.legR, 0.3, k); rotTo(P.kneeL, 0.35, k); rotTo(P.kneeR, 0.2, k); rotTo(P.hips, 0.12, k);
  P.hips.position.y += (RIG.hips.y - 0.03 - P.hips.position.y) * k;
  P.head.rotation.x = -0.05;
  rotTo(P.armL, -0.4, k); rotTo(P.elbowL, -1.0, k);
  if (e.state === 'chargeWind') { rotTo(P.armR, -1.2, k); rotTo(P.elbowR, -0.3, k); rotTo(P.hips, 0.55, k); rotTo(P.legL, -0.7, k); rotTo(P.kneeL, 0.9, k); rotTo(P.legR, 0.5, k); rotTo(P.kneeR, 0.6, k); P.hips.position.y += (RIG.hips.y - 0.18 - P.hips.position.y) * k; }
  else if (e.state === 'windup') { const f = Math.min(1, e.t / e.windDur); rotTo(P.armR, -2.9 * f - 0.4 * (1 - f), k); rotTo(P.elbowR, -0.4, k); rotTo(P.hips, -0.1, k); }
  else if (e.state === 'recover') { rotTo(P.armR, -0.15, 1 - Math.exp(-dt * 30)); rotTo(P.elbowR, -0.1, k); rotTo(P.hips, 0.4, k); }
  else if (e.state === 'throw') { const f = e.t / 0.45; rotTo(P.armR, f < 0.7 ? 1.4 : -1.7, f < 0.7 ? k : 1 - Math.exp(-dt * 30)); rotTo(P.elbowR, -0.5, k); }
  else { rotTo(P.armR, -0.6 + Math.sin(e.t * 2 + e.ph) * 0.05, k); rotTo(P.elbowR, -0.9, k); }
}

// vanish in smoke and reappear behind (or beside) the player, already winding up a strike
function shadowStep(e) {
  fx.dust(new V3(e.x, 0, e.z), 18, 1.3 * e.s); sfx.swish(0.7);
  const f = new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)), a = rnd(-1, 1), r = reachOf(e) - 0.3;
  let x = player.pos.x - (f.x * Math.cos(a) - f.z * Math.sin(a)) * r, z = player.pos.z - (f.z * Math.cos(a) + f.x * Math.sin(a)) * r;
  const R = Math.hypot(x, z), M = world.arenaR - 1.5; if (R > M) { x *= M / R; z *= M / R; }
  e.x = x; e.z = z; e.gate = null; e.root.rotation.y = Math.atan2(player.pos.x - x, player.pos.z - z);
  fx.dust(new V3(x, 0, z), 18, 1.3 * e.s);
  e.state = 'windup'; e.t = 0; e.windDur = e.d.wind ?? 0.6; sfx.warn(); floater('!', headPos(e), 'warn');
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
        e.air = null; e.y = 0; e.gate = null; e.P.hips.rotation.x = 0;
        fx.dust(new V3(e.x, 0, e.z), 10, e.s); sfx.thud(0.35);
        if (A.attack) { e.state = 'windup'; e.t = 0; e.windDur = 0.42; sfx.warn(); floater('!', headPos(e), 'warn'); }
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
      if (!e.gate && dist <= reachOf(e)) { e.state = d.ranged ? 'aim' : 'ready'; e.t = 0; e.atkT = d.ranged ? rnd(0.5, 1.2) : rnd(0.2, 0.5); }
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
          let tx = e.x - dx * 5.5, tz = e.z - dz * 5.5; const r = Math.hypot(tx, tz), R = world.arenaR - 1.5; if (r > R) { tx *= R / r; tz *= R / r; }
          leap(e, tx, tz, 1.7, 0.7, -1); e.leapCD = rnd(3.5, 5); continue;
        }
        e.x -= dx * 2.2 * dt; e.z -= dz * 2.2 * dt;
      }
      if (e.state === 'ready' || e.state === 'aim') {
        e.atkT -= dt;
        if (e.atkT <= 0) {
          e.t = 0;
          if (e.state === 'aim') e.state = 'throw';
          else { e.state = 'windup'; e.windDur = d.wind ?? (d.boss ? 1.0 : 0.72); sfx.warn(); floater('!', headPos(e), 'warn'); }
        }
      } else if (e.state === 'windup') {
        if (e.t >= e.windDur) {
          e.state = 'recover'; e.t = 0; sfx.swish(0.6);
          if (d.boss || d.heavy) { shake = Math.max(shake, d.boss ? 0.8 : 0.5); sfx.thud(d.boss ? 2 : 1.2); if (d.heavy) fx.dust(new V3(e.x + dx * 1.4, 0, e.z + dz * 1.4), 14, 1.2); }
          if (dist <= reachOf(e) + 0.75 && player.dashT <= 0 && player.y < 0.9) hurtPlayer(d.dmg || 1);
          else { floater('DODGED', headPos(e), ''); if (tut) tut.flags.dodge = true; }
        }
      } else if (e.state === 'chargeWind') {
        if (e.t >= 0.75) { e.state = 'charging'; e.t = 0; e.hitDone = false; sfx.swish(1.2); shake = Math.max(shake, 0.3); }
      } else if (e.state === 'charging') {   // a straight, unstoppable rush along the telegraphed line
        e.x += e.cdx * 15 * dt; e.z += e.cdz * 15 * dt;
        if (Math.random() < dt * 30) fx.dust(new V3(e.x, 0, e.z), 2, 0.8);
        if (!e.hitDone && dist < d.w + PLAYER_R + 0.6) { e.hitDone = true; if (player.dashT <= 0 && player.y < 0.9) hurtPlayer(d.dmg || 1); else floater('DODGED', headPos(e), ''); }
        if (e.t >= 0.55) { e.state = 'recover'; e.t = 0; if (!e.hitDone && tut) tut.flags.dodge = true; }
      } else if (e.state === 'recover') {
        if (e.t >= 0.45) { e.state = 'ready'; e.atkT = rnd(0.8, 1.4) * (d.boss ? 1.3 : 1); }
      } else if (e.state === 'throw') {
        if (e.t >= 0.45) { throwStar(e); e.state = 'aim'; e.t = 0; e.atkT = rnd(2.2, 3.2); }
      }
    }
    // keep apart from each other and from the player
    for (const o of enemies) {
      if (o === e) continue;
      const ox = e.x - o.x, oz = e.z - o.z, rr = d.w + o.d.w + 0.15, l = Math.hypot(ox, oz);
      if (l < rr && l > 1e-4) { const k = (rr - l) * 0.5; e.x += ox / l * k; e.z += oz / l * k; }
    }
    { const ox = e.x - px, oz = e.z - pz, rr = d.w + PLAYER_R + 0.1, l = Math.hypot(ox, oz); if (l < rr && l > 1e-4) { e.x += ox / l * (rr - l); e.z += oz / l * (rr - l); } }
    if (!e.gate) {
      for (const c of world.colliders) { const ox = e.x - c.x, oz = e.z - c.z, rr = c.r + d.w, l = Math.hypot(ox, oz); if (l < rr && l > 1e-4) { e.x += ox / l * (rr - l); e.z += oz / l * (rr - l); } }
      const r = Math.hypot(e.x, e.z), R = world.arenaR - d.w * 0.5; if (r > R) { e.x *= R / r; e.z *= R / r; }
    }
    if (d.boss) {
      e.sumT -= dt;
      if (e.sumT <= 0 && enemies.length < 8) {   // each boss calls its own help
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
function updPProj(dt) {
  const a = new V3(), b = new V3();
  for (const pr of pProj.slice()) {
    pr.life -= dt;
    if (pr.stuck) { if (pr.life <= 0) removePProj(pr); continue; }
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
  after(0.22, () => sliceBodies(ext, sp, W.range(l), stroke));
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
    const spot = e.hp <= dmg && canWound(e) ? woundSpot(e, sp.plane) : null;
    if (spot) woundEnemy(e, spot, sp.plane, sp.push);
    else if (e.hp <= dmg || e.downed) { killEnemy(e, sp.plane, sp.push, { stroke: sid, weapon }); kills++; }
    else hurtEnemy(e, dmg, nearestOnPlane(bodyCenter(e), sp.plane), sp.push);
  }
  hitProjectiles(seg);
  if (bodies) sliceBodies(seg, sp, range, sid);
  return kills;
}
// corpses and severed pieces can always be cut again
function sliceBodies(seg, sp, range, sid) {
  for (const b of phys.all()) {
    if (b.stroke === sid || b.sink) continue;
    const c = phys.center(b);
    if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > range + 1.5) continue;
    const r = boxRect(phys.bounds(b));
    if (r && segRect(seg, r)) cutBody(b, sp.plane, sp.push, sid);
  }
}
const nearestOnPlane = (p, plane) => plane.projectPoint(p, new V3());

/* ============ wounds & finishers ============ */
// A lethal blow that only clips the legs (low cut) or an arm (glancing side cut) cripples instead:
// the enemy drops to his knees, bleeding and harmless, and can be executed with a finisher (Q / FINISH)
// for bonus rewards. Any further hit kills him outright; left alone he bleeds out after a while.
const FINISH_R = 3.6, BLEED_OUT = 20;
let finish = null;
const canWound = e => !e.d.boss && !e.d.dummy && !e.air && !e.downed && (!stage.tutorial || (tut && tut.wounds));
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
  const D = e.downed; D.t += dt; D.drip -= dt;
  if (D.drip <= 0) { D.drip = rnd(0.25, 0.5); fx.burst(new V3(e.x, e.y + (D.spot === 'legs' ? 0.25 : 0.8) * e.s, e.z), UP, 3, 0.35); }
  if (!e.finishing) { let da = Math.atan2(px - e.x, pz - e.z) - e.root.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); e.root.rotation.y += da * Math.min(1, dt * 2); }
  // on his knees: thighs upright, shins flat behind, head bowed (lower still while being executed)
  const P = e.P, k = 1 - Math.exp(-dt * 10), f = e.finishing ? 1 : 0, lean = 0.2 + 0.15 * f;
  P.hips.position.y += (RIG.hips.y - 0.54 - P.hips.position.y) * k;
  rotTo(P.hips, lean, k); rotTo(P.legL, -lean + 0.05, k); rotTo(P.legR, -lean - 0.08, k); rotTo(P.kneeL, 1.55, k); rotTo(P.kneeR, 1.45, k);
  rotTo(P.head, 0.35 + 0.3 * f + Math.sin(D.t * 3) * 0.04, k);
  rotTo(P.armL, -0.15, k); rotTo(P.elbowL, -0.5, k); rotTo(P.armR, D.spot === 'arm' ? 0.15 : -0.2, k); rotTo(P.elbowR, -0.2, k);
  e.root.position.set(e.x, e.y, e.z);
  if (D.t > BLEED_OUT && !e.finishing) killEnemy(e, new THREE.Plane().setFromNormalAndCoplanarPoint(UP, bodyCenter(e)), UP.clone(), { stroke: -4 });
}
function finishTarget() {
  if (state !== 'play' || finish) return null;
  let best = null, bd = FINISH_R;
  for (const e of enemies) if (e.downed && !e.finishing && !e.stormed) { const d = Math.hypot(e.x - player.pos.x, e.z - player.pos.z) - e.d.w; if (d < bd) { bd = d; best = e; } }
  return best;
}
// Cinematic finisher (~2.7 s, real time): step in, letterbox + side camera, slow two-handed wind-up,
// a snapping downward cut in heavy slow motion, a held follow-through while the camera pushes in,
// then a blood-flick (chiburi) and everything eases back to normal.
const FIN_STRIKE = 1.25, FIN_HIT = 1.31, FIN_END = 2.75;
let cineW = 0;
function tryFinish() {
  if (finish) return true;
  const e = finishTarget(); if (!e) return false;
  const dx = player.pos.x - e.x, dz = player.pos.z - e.z, l = Math.hypot(dx, dz) || 1, r = 1.15 * e.s;
  const x1 = e.x + dx / l * r, z1 = e.z + dz / l * r;
  // film from whichever side keeps the camera inside the arena
  const side = Math.hypot((x1 + e.x) / 2 + dz / l * 3, (z1 + e.z) / 2 - dx / l * 3) < Math.hypot((x1 + e.x) / 2 - dz / l * 3, (z1 + e.z) / 2 + dx / l * 3) ? 1 : -1;
  finish = { e, t0: T, x0: player.pos.x, z0: player.pos.z, x1, z1, ex: e.x, ez: e.z, side, yaw0: player.yaw, yaw1: Math.atan2(dx, dz), pitch0: player.pitch };
  e.finishing = true; invuln = FIN_END + 0.5; player.dashT = 0; player.vel.set(0, 0, 0);
  document.body.classList.add('cine');
  slowmo(0.55, 0.4); sfx.swish(0.8); fovKick = Math.max(fovKick, 6);
  after(0.35, () => { sfx.warn(); slowmo(0.4, 0.9); });
  after(FIN_HIT, finishStrike);
  after(2.0, () => { sfx.swish(0.5); if (heroP.handR) fx.burst(heroP.handR.getWorldPosition(new V3()), new V3(Math.cos(player.yaw), 0, -Math.sin(player.yaw)), 10, 0.6); });   // chiburi
  after(2.4, () => document.body.classList.remove('cine'));
  after(FIN_END, () => { finish = null; });
  return true;
}
function finishStrike() {
  if (!finish) return;
  const e = finish.e; if (enemies.indexOf(e) < 0) return;
  sfx.swish(1.2);
  e.root.updateMatrixWorld(true);
  const neck = e.P.head.getWorldPosition(new V3()).add(new V3(0, 0.07 * e.s, 0));
  const side = new V3(Math.cos(e.root.rotation.y), 0, -Math.sin(e.root.rotation.y));
  const n = UP.clone().addScaledVector(side, 0.2).normalize();
  killEnemy(e, new THREE.Plane().setFromNormalAndCoplanarPoint(n, neck), side.clone().add(new V3(0, 0.6, 0)), { stroke: ++stroke, weapon: cur });
  fx.burst(neck, UP, 60, 1.5);
  const fw = $('flashW'); fw.style.transition = 'none'; fw.style.opacity = 0.85; requestAnimationFrame(() => { fw.style.transition = 'opacity .7s'; fw.style.opacity = 0; });
  banner('FINISHED', '介錯');
  const b = e.d.value;
  runCoins += b; score += 300; ult = Math.min(100, ult + 15);
  floater('+' + b + ' FINISHER BONUS', { x: vw / 2, y: vh * 0.72 }, 'big');
  slowmo(0.08, 0.75); shake = Math.max(shake, 0.6); hitStop = Math.max(hitStop, 0.12); fovKick = -9;
  if (tut) tut.flags.finish = true;
}
// the player is carried through the finisher: step in and face the target
function updFinishPlayer() {
  const f = smooth(clamp((T - finish.t0) / 0.3, 0, 1));
  player.pos.x = finish.x0 + (finish.x1 - finish.x0) * f; player.pos.z = finish.z0 + (finish.z1 - finish.z0) * f;
  let dy = finish.yaw1 - finish.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.yaw = finish.yaw0 + dy * f; player.pitch = finish.pitch0;
  player.vel.set(0, 0, 0); player.moveDir.set(0, 0, 0);
}
// hero keyframes: [time, armR.x, armR.z, elbowR, armL.x, armL.z, elbowL, hips, legL, legR, kneeL, kneeR, drop]
const FIN_KEYS = [
  [0.0, -0.7, 0, -0.9, 0, 0, -0.8, 0.35, -0.5, 0.4, 0.5, 0.3, 0],              // dashing in
  [0.3, -0.8, 0, -0.9, -0.3, 0, -0.9, 0.1, -0.35, 0.3, 0.35, 0.25, 0.03],      // planted stance
  [FIN_STRIKE, -3.05, -0.15, -0.5, -2.75, 0.35, -0.7, -0.14, -0.35, 0.3, 0.35, 0.25, 0.02],   // blade raised overhead, two hands
  [FIN_HIT + 0.04, -0.3, 0, -0.15, -0.45, 0, -0.4, 0.5, -0.65, 0.45, 0.95, 0.5, 0.14],   // the cut: deep lunge
  [2.0, -0.35, 0, -0.15, -0.45, 0, -0.4, 0.45, -0.6, 0.45, 0.9, 0.5, 0.12],            // held follow-through
  [2.3, -0.9, 1.1, -0.1, -0.1, 0, -0.6, 0.15, -0.35, 0.3, 0.35, 0.25, 0.03],          // chiburi: flick the blood off
  [FIN_END, -0.7, 0, -0.9, 0, 0, -0.8, 0.12, 0, 0, 0.1, 0.1, 0],                       // back to ready
];
function finishPose(P) {
  const u = T - finish.t0;
  let i = 0; while (i < FIN_KEYS.length - 2 && u > FIN_KEYS[i + 1][0]) i++;
  const a = FIN_KEYS[i], b = FIN_KEYS[i + 1], t = clamp((u - a[0]) / (b[0] - a[0]), 0, 1);
  const s = a[0] === FIN_STRIKE ? t * t : smooth(t);   // the cut accelerates; everything else eases
  const v = j => a[j] + (b[j] - a[j]) * s;
  P.armR.rotation.x = v(1); P.armR.rotation.z = v(2); P.elbowR.rotation.x = v(3);
  P.armL.rotation.x = v(4); P.armL.rotation.z = v(5); P.elbowL.rotation.x = v(6);
  P.hips.rotation.x = v(7); P.legL.rotation.x = v(8); P.legR.rotation.x = v(9); P.kneeL.rotation.x = v(10); P.kneeR.rotation.x = v(11);
  P.hips.position.y = RIG.hips.y - v(12); P.torso.rotation.y = 0; P.head.rotation.x = 0.25;
}
const _cP = new V3(), _cT = new V3(), _cM = new THREE.Matrix4(), _cQ = new THREE.Quaternion();
function cineCam() {
  const u = T - finish.t0;
  cineW = smooth(clamp((u - 0.12) / 0.45, 0, 1)) * (1 - smooth(clamp((u - 2.35) / 0.4, 0, 1)));
  if (cineW <= 0) return;
  let dx = finish.ex - finish.x1, dz = finish.ez - finish.z1; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const mx = (finish.x1 + finish.ex) / 2, mz = (finish.z1 + finish.ez) / 2;
  const wind = smooth(clamp((u - 0.3) / (FIN_STRIKE - 0.3), 0, 1)), post = smooth(clamp((u - FIN_HIT) / 0.9, 0, 1));
  const ang = 1.2 + 0.3 * wind + 0.35 * post;              // angle from the player's side of the line, drifting round
  const px = dz * finish.side, pz = -dx * finish.side;      // perpendicular
  const cx = -dx * Math.cos(ang) + px * Math.sin(ang), cz = -dz * Math.cos(ang) + pz * Math.sin(ang);
  const dist = 4.6 - 0.3 * wind - 1.3 * post, h = 1.35 + 0.1 * wind - 0.5 * post;   // wide enough for the raised blade, then push in low
  _cP.set(mx + cx * dist, h, mz + cz * dist);
  _cT.set(mx + dx * 0.35 * post, 1.2 + 0.1 * wind - 0.4 * post, mz + dz * 0.35 * post);   // drift toward the falling head after the cut
  camera.position.lerp(_cP, cineW);
  _cQ.setFromRotationMatrix(_cM.lookAt(_cP, _cT, UP));
  camera.quaternion.slerp(_cQ, cineW);
}

/* ============ kills & bodies ============ */
function cutBody(b, plane, push, sid) {
  const air = phys.airborne(b), at = nearestOnPlane(phys.center(b), plane);
  const res = phys.cut(b, plane, push, sid);
  if (!res) return null;
  fx.burst(at, plane.normal, b.isDoll ? 18 : 8, 0.7); fx.flash(at, plane.normal, push, 1.3);
  sfx.slice(0.6);
  if (air && b.cuts < 4) { stats.air++; runCoins += 2; score += 40; ult = Math.min(100, ult + 2); floater('AIR SLICE +2', at, ''); }
  else score += 5;
  return res;
}
const bodySize = b => b.isDoll ? b.parts.length : b.group.userData.size * 4;
function killEnemy(e, plane, push, opts = {}) {
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
  e.hp -= dmg;
  e.stagger = e.d.boss ? 0.18 : 0.32; e.knock = e.d.boss ? 1.2 : 4;
  if (e.state === 'windup') { e.state = 'ready'; e.atkT = 0.6; }
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
  ult = Math.min(100, ult + (e.d.boss ? 40 : 7));
  floater(coins ? '+' + coins : 'SLICED!', pos, '');
  if (player.y > 0.5) { runCoins += 3; score += 60; floater('AERIAL KILL +3', { x: vw / 2, y: vh * 0.38 }, ''); slowmo(0.35, 0.3); }
  if (tut) tut.kills++;
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
  sfx.hurt(); shake = Math.max(shake, 0.7); comboN = 0; $('combo').classList.remove('on');
  const v = $('vignette'); v.style.transition = 'none'; v.style.opacity = 1; requestAnimationFrame(() => { v.style.transition = 'opacity .6s'; v.style.opacity = 0; });
  const h = $('hearts'); h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit');
  updHearts();
  if (hearts <= 0) gameOver();
}
function slowmo(scale, dur) { timeScale = Math.min(timeScale, scale); slowTo = scale; slowT = Math.max(slowT, dur); }

function storm() {
  if (ult < 100 || state !== 'play') return;
  ult = 0; if (tut) tut.flags.storm = true; sfx.ult(); slowmo(0.2, 1.4);
  const fw = $('flashW'); fw.style.transition = 'none'; fw.style.opacity = 0.7; requestAnimationFrame(() => { fw.style.transition = 'opacity .5s'; fw.style.opacity = 0; });
  banner('BLADE STORM', '嵐');
  const sid = ++stroke;
  const dd = e => Math.hypot(e.x - player.pos.x, e.z - player.pos.z);
  const list = enemies.filter(e => dd(e) < 35).sort((a, b) => dd(a) - dd(b));
  list.forEach((e, i) => after(0.25 + i * 0.07, () => {
    if (!enemies.includes(e)) return;
    const n = new V3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-0.3, 0.3)).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, bodyCenter(e));
    const s = toScreen(bodyCenter(e)); if (s) stormLines.push({ x: s.x, y: s.y, a: rnd(0, Math.PI), t: 0.35 });
    if (e.d.boss && e.hp > 12) hurtEnemy(e, 12, bodyCenter(e), n);
    else stormMark(e, plane, sid);
  }));
  for (const pr of eProj.slice()) deflect(pr);
}

// Blade Storm victims freeze where they stand with glowing cut lines traced across their bodies,
// then fall apart along exactly those lines once the marks have burned for STORM_HOLD seconds.
const STORM_HOLD = 2;
function stormMark(e, plane, sid) {
  const c = bodyCenter(e), planes = [plane];
  for (let k = e.d.boss ? 3 : 1; k > 0; k--) {
    const n = new V3(rnd(-1, 1), rnd(-0.7, 0.7), rnd(-0.4, 0.4)).normalize();
    planes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(n, c.clone().add(new V3(0, rnd(-0.3, 0.3) * e.d.h, 0))));
  }
  e.stormed = { t0: T, sid, planes, x: e.x, z: e.z };
  e.marks = cutMarks(e.root, planes);
  if (e.marks) scene.add(e.marks);
  fx.flash(c, plane.normal, new V3().crossVectors(plane.normal, UP).normalize(), e.d.h * 1.2);
  sfx.slice(0.4);
  after(STORM_HOLD, () => {
    if (!enemies.includes(e)) return;
    killEnemy(e, planes[0], new V3().crossVectors(planes[0].normal, UP).normalize(), { stroke: sid, planes: planes.slice(1), extra: 0, weapon: 'katana' });
  });
}
function updStormed(e) {
  const S = e.stormed, u = T - S.t0, shiver = u > STORM_HOLD - 0.45 ? (u - STORM_HOLD + 0.45) * 0.05 : 0;   // a tremor just before they come apart
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
  fling.on = false; fling.mesh.visible = fling.chain.visible = false;
}
function startStage(n) {
  clearField();
  stage = makeStage(n);
  world.setTheme(stage.theme);
  maxHearts = 5 + save.hearts; hearts = maxHearts;
  score = 0; runCoins = 0; comboN = 0; ult = Math.min(ult, 40); invuln = 0;
  stats = { kills: 0, maxCombo: 0, dmg: 0, air: 0 };
  killedCounted = 0; spawnT = 0.8; revived = false; bossE = null; strokeKills.clear();
  timeScale = 1; slowT = 0;
  player.pos.set(0, 0, 4); player.vel.set(0, 0, 0); player.yaw = 0; player.pitch = -0.06; player.dashT = player.dashCD = 0; player.y = player.vy = player.flip = 0; player.ground = true;
  if (!has(cur)) cur = 'katana';
  if (trial && has(trial)) cur = trial;
  for (const id of WIDS) cds[id] = 0;
  state = 'play'; vmMode = 'hand';
  showLayer(null); $('hud').classList.remove('hidden'); $('bossBar').classList.add('hidden'); $('coinsBadge').classList.add('hidden');
  $('stageTag').textContent = `STAGE ${n} · ${THEMES[stage.theme].name.toUpperCase()}`;
  updHearts(); buildWBar(); updHUD();
  banner(`STAGE ${n}`, stage.boss ? 'BOSS STAGE' : THEMES[stage.theme].name);
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
  const cap = Math.min(16, 6 + Math.floor(stage.n / 2));   // more on the field at once as stages climb
  if (spawnT > 0 || enemies.length >= cap) return;
  if (EDEF[head.kind].boss && enemies.length > 2) return;
  stage.queue.shift();
  if (DEV && QS.has('near')) { const a = rnd(-0.6, 0.6) + player.yaw; const nd = +QS.get('near') || 9; spawnEnemy(head.kind, player.pos.x - Math.sin(a) * nd, player.pos.z - Math.cos(a) * nd); }
  else {
    if (['grunt', 'runner', 'archer', 'assassin'].includes(head.kind) && Math.random() < 0.5) {
      const a = rnd(0, Math.PI * 2), e = spawnEnemy(head.kind, Math.sin(a) * (ARENA_R + 2.6), -Math.cos(a) * (ARENA_R + 2.6));
      leap(e, Math.sin(a) * (ARENA_R - 3.5), -Math.cos(a) * (ARENA_R - 3.5), 3.3, 1.05, 1);
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
  if (state !== 'play' || stage.tutorial || stage.queue.length || enemies.length) return;
  state = 'clearing';
  gameplay(false); exitLock();
  after(1.4, stageClear);
}
function stageClear() {
  const n = stage.n;
  const stars = stats.dmg === 0 ? 3 : hearts >= maxHearts / 2 ? 2 : 1;
  const bonus = 40 + n * 12 + (stats.dmg === 0 ? 50 : 0);
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
  $('resStats').innerHTML = `<span>Enemies sliced</span><b>${stats.kills}</b><span>Best combo</span><b>x${stats.maxCombo}</b><span>Air slices</span><b>${stats.air}</b><span>Clear bonus</span><b>+${bonus}</b><span>Score</span><b>${score}</b>`;
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
function bankRunCoins() { save.coins += runCoins; runCoins = 0; persist(); }
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
  $('skipTutBtn').classList.toggle('hidden', !tut);
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
  world.setTheme(((save.sel - 1) % 3));
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
  if (sdk.touch || lockFail || locked) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { lockFail = true; }
}
const exitLock = () => { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {} };
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked) { blade = false; if (ptr.down) endStroke(); if (state === 'play') pause(); }
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
}
function endStroke() {
  if (!ptr.down) return;
  ptr.down = false;
  if (state !== 'play') return;
  const W = WEAP[cur], L = Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy);
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
  if (W.mode === 'sweep') { if (cds[cur] > 0) return; cds[cur] = W.cd(l); }
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
addEventListener('keydown', e => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  audio.unlock();
  keys[e.code] = true;
  const k = e.key.toLowerCase();
  if (state === 'play') {
    if (k >= '1' && k <= '5') selectWeapon(WIDS[+k - 1]);
    else if (k === 'q') { if (!tryFinish()) storm(); }   // Q finishes a crippled enemy nearby, otherwise Blade Storm
    else if (k === 'e' || k === 'f') storm();
    else if (k === 'c' || k === 'v') cycleCam();
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') dash();
    else if (e.code === 'Space' && !e.repeat) jump();
    else if (k === 'p' || k === 'escape') pause();
  } else if (state === 'paused' && k === 'p') resumeAndLock();
});
addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; pause(); });
addEventListener('resize', () => { resize(); if (!$('tour').classList.contains('hidden')) placeTour(); });

function dash() {
  if (state !== 'play' || player.dashCD > 0) return;
  const d = player.moveDir.lengthSq() > 0.01 ? player.moveDir.clone() : new V3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  player.dashDir.copy(d.normalize()); player.dashT = 0.18; player.dashCD = 0.75; fovKick = 10;
  sfx.swish(0.45); $('dashBtn').classList.add('cd');
  if (tut) tut.flags.dash = true;
}
function jump() {
  if (state !== 'play') return;
  if (player.ground) { player.vy = 7.6; player.ground = false; player.jumps = 1; sfx.swish(0.4); }
  else if (player.jumps < 2) { player.vy = 7.2; player.jumps = 2; player.flip = 0.001; sfx.swish(0.8); fovKick = Math.max(fovKick, 6); if (tut) tut.flags.flip = true; }
}
function updPlayer(dt) {
  if (finish) { updFinishPlayer(); return; }
  let fx = 0, fz = 0, turn = 0;
  if (keys.KeyW || keys.ArrowUp) fz -= 1;
  if (keys.KeyS || keys.ArrowDown) fz += 1;
  if (keys.KeyA) fx -= 1;
  if (keys.KeyD) fx += 1;
  if (keys.ArrowLeft) turn += 1;
  if (keys.ArrowRight) turn -= 1;
  if (joy.id !== null) { fz += joy.y; turn -= Math.sign(joy.x) * Math.max(0, Math.abs(joy.x) - 0.15) * 1.2; }
  player.yaw += turn * 2.4 * dt;
  const L = Math.hypot(fx, fz); if (L > 1) { fx /= L; fz /= L; }
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  const wx = fx * cy + fz * sy, wz = -fx * sy + fz * cy;
  player.moveDir.set(wx, 0, wz);
  const k = Math.min(1, dt * 12);
  player.vel.x += (wx * SPEED - player.vel.x) * k; player.vel.z += (wz * SPEED - player.vel.z) * k;
  const p = player.pos;
  p.x += player.vel.x * dt; p.z += player.vel.z * dt;
  if (player.dashT > 0) { player.dashT -= dt; p.addScaledVector(player.dashDir, 21 * dt); }
  if (player.dashCD > 0) { player.dashCD -= dt; if (player.dashCD <= 0) $('dashBtn').classList.remove('cd'); }
  for (const c of world.colliders) { const ox = p.x - c.x, oz = p.z - c.z, rr = c.r + PLAYER_R, l = Math.hypot(ox, oz); if (l < rr && l > 1e-4) { p.x += ox / l * (rr - l); p.z += oz / l * (rr - l); } }
  const r = Math.hypot(p.x, p.z), R = world.arenaR - PLAYER_R; if (r > R) { p.x *= R / r; p.z *= R / r; }
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
  const show = state === 'play' && needLock() && !(DEV && QS.has('sim'));
  $('lockHint').classList.toggle('hidden', !show);
  $('cross').classList.toggle('hidden', !(state === 'play' && locked));
}
function resumeAndLock() { requestLock(); resume(); }

function selectWeapon(id) {
  if (!has(id)) { toast(`${WEAP[id].name} is locked: unlock it in the Arsenal`); return; }
  if (cur === id) return;
  cur = id; save.cur = id; sfx.click();
  if (WEAP[id].mode === 'throw' && !save['tip_' + id]) { toast('Tap or hold to throw'); save['tip_' + id] = 1; }
  if (WEAP[id].mode === 'fling' && !save.tip_fling) { toast('Swipe and release to fling the sickle'); save.tip_fling = 1; }
  buildWBar();
}

/* ============ UI ============ */
const LAYERS = ['loading', 'menu', 'arsenal', 'settings', 'pause', 'results', 'gameover'];
function showLayer(id) { for (const l of LAYERS) $(l).classList.toggle('hidden', l !== id); $('coinsBadge').classList.toggle('hidden', !['menu', 'arsenal', 'results'].includes(id)); updCoins(); }
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
  const u = $('ultBtn'); u.style.setProperty('--p', ft ? 100 : ult); u.classList.toggle('ready', ult >= 100 || !!ft); u.classList.toggle('finish', !!ft);
  $('ultLbl').textContent = ft ? 'FINISH' : 'STORM';
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
  const n = save.sel, th = n % 5 === 0 ? 3 : (n - 1) % 3;
  $('stLabel').innerHTML = `STAGE ${n}<small>${n % 5 === 0 ? 'BOSS · ' : ''}${THEMES[th].name.toUpperCase()}</small>`;
  $('stPrev').disabled = n <= 1; $('stNext').disabled = n >= save.stage;
  updCoins();
}
const click = (id, fn) => $(id).addEventListener('click', () => { audio.unlock(); sfx.click(); fn(); });
click('stPrev', () => { save.sel = Math.max(1, save.sel - 1); updMenu(); world.setTheme(save.sel % 5 === 0 ? 3 : (save.sel - 1) % 3); });
click('stNext', () => { save.sel = Math.min(save.stage, save.sel + 1); updMenu(); world.setTheme(save.sel % 5 === 0 ? 3 : (save.sel - 1) % 3); });
click('playBtn', () => save.tutDone ? playStage(save.sel, false) : startTutorial());
click('tutorialBtn', () => startTutorial());
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
    $('wdStats').innerHTML = statRow('Hearts', hv / 9, hv, save.hearts < HEART_UP.length ? hv + 1 : undefined);
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
click('restartBtn', () => { bankRunCoins(); if (stage.tutorial) startTutorial(); else playStage(stage.n, true); });
click('skipTutBtn', () => { save.tutDone = true; persist(); toMenu(); });
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
function buildHero() {
  hero = batchParts(buildEnemy('player')); hero.visible = false; scene.add(hero);
  ['hips', 'torso', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR', 'handR', 'ribbon'].forEach(n => heroP[n] = hero.getObjectByName(n));
  for (const id of WIDS) {
    const m = WEAPON_MODELS[id](); m.rotation.set(Math.PI / 2 + 0.25, 0, 0); m.visible = false;
    m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    heroP.handR.add(m); heroW[id] = m;
  }
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
function animHero(dt) {
  const show = (save.cam !== 'fp' || cineW > 0.35) && inGame();   // the cinematic shows the hero even in first person
  hero.visible = show;
  if (!show) return;
  const P = heroP, k = 1 - Math.exp(-dt * 14), sp = clamp(Math.hypot(player.vel.x, player.vel.z) / SPEED, 0, 1);
  hero.position.set(player.pos.x, player.y, player.pos.z);
  hero.rotation.y = player.yaw + Math.PI;
  player.ph += dt * sp * 11;
  const s = Math.sin(player.ph) * sp, c = Math.cos(player.ph);
  P.legL.rotation.x = -s * 0.9; P.legR.rotation.x = s * 0.9;
  P.kneeL.rotation.x = 0.1 + Math.max(0, c) * 1.2 * sp; P.kneeR.rotation.x = 0.1 + Math.max(0, -c) * 1.2 * sp;
  if (player.flip > 0) {
    const f = Math.sin(Math.PI * player.flip);
    P.hips.rotation.x = Math.PI * 2 * smooth(player.flip);
    P.legL.rotation.x = P.legR.rotation.x = -1.5 * f; P.kneeL.rotation.x = P.kneeR.rotation.x = 2.2 * f;
  } else if (!player.ground) {
    rotTo(P.hips, 0.1, k); P.legL.rotation.x = -0.9; P.legR.rotation.x = 0.3; P.kneeL.rotation.x = 1.4; P.kneeR.rotation.x = 0.6;
  } else rotTo(P.hips, 0.12 + sp * 0.2 + (player.dashT > 0 ? 0.5 : 0), k);
  P.hips.position.y = RIG.hips.y + Math.abs(c) * 0.05 * sp;
  P.armL.rotation.x = s * 0.7; P.elbowL.rotation.x = -0.8;
  P.head.rotation.x = -player.pitch * 0.4;
  P.ribbon.rotation.x = 0.75 + sp * 0.9 + (player.ground ? 0 : 0.7) + (player.dashT > 0 ? 0.6 : 0) + Math.sin(T * 13) * 0.08 * (0.3 + sp);   // headband tails stream behind
  P.ribbon.rotation.z = Math.sin(T * 7) * 0.06 * (0.3 + sp);
  if (swing.on) {
    const t = Math.min(1, swing.t), dir = swing.d.x >= 0 ? 1 : -1;
    P.armR.rotation.x = -2.5 + t * 2.9; P.armR.rotation.z = dir * (0.9 - t * 1.8) * 0.6;
    P.elbowR.rotation.x = -0.25; P.torso.rotation.y = dir * (0.6 - t * 1.2);
  } else if (jab > 0) {
    rotTo(P.armR, -1.7, 1 - Math.exp(-dt * 40)); P.elbowR.rotation.x = -0.1;
  } else {
    rotTo(P.armR, -0.7, k); P.armR.rotation.z *= 1 - k; rotTo(P.elbowR, -0.9, k); P.torso.rotation.y *= 1 - k;
  }
  if (finish) finishPose(P);
  for (const id of WIDS) heroW[id].visible = id === cur;
  const sk = heroW.kusarigama.getObjectByName('sickle'); if (sk) sk.visible = !fling.on;
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
  { t: 'Move', d: () => sdk.touch ? 'Push the stick up to run forward, down to back off.' : 'Run around with W A S D.',
    check: () => tut.dist > 7 },
  { t: 'Dash', d: () => sdk.touch ? 'Tap DASH to dash in the direction you are moving. Dashing dodges attacks.' : 'Press Shift (or Space) to dash. Dashing dodges attacks.',
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
  { t: 'Finishers', d: () => sdk.touch ? 'Swipe LOW across his legs to cripple him instead of killing him. Then get close and tap FINISH.' : 'Slice LOW across his legs to cripple him instead of killing him. Then get close and press Q to finish him.',
    init: () => { tut.wounds = true; tutTarget(); }, check: () => { if (!tut.flags.finish && !enemies.length) tutTarget(); return tut.flags.finish && !enemies.length; } },
  { t: 'Blade Storm', d: () => sdk.touch ? 'Your STORM gauge is full. Tap STORM to slice every enemy around you.' : 'Your Storm gauge is full. Press Q to slice every enemy around you.',
    init: () => { ult = 100; spawnFront('grunt', 4, 10, 0.5); }, check: () => tut.flags.storm && !enemies.length },
  { t: 'Camera views', d: () => sdk.touch ? 'Tap the camera button (top right) to switch between first person, third person and wide view.' : 'Press C (or the camera button, top right) to switch between first person, third person and wide view.',
    check: () => (tut.flags.cam || 0) >= 2 },
];
function tutTarget() { spawnFront('grunt', 1, 4.5); enemies[enemies.length - 1].state = 'idle'; }   // a ninja who stands still for practice
function startTutorial() {
  clearField();
  stage = { n: 0, tutorial: true, boss: false, queue: [], total: TUT_STEPS.length, theme: 2, speedMul: 1 };
  world.setTheme(2);
  maxHearts = 5 + save.hearts; hearts = maxHearts;
  score = 0; runCoins = 0; comboN = 0; ult = 0; invuln = 0;
  stats = { kills: 0, maxCombo: 0, dmg: 0, air: 0 };
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
  $('tutText').textContent = typeof st.d === 'function' ? st.d() : st.d;
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
  { sel: null, t: 'In battle', d: 'Every weapon you own is ready in every fight: switch with 1-5, the mouse wheel or the weapon bar. Mix them up!' },
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
  if (tourFromTut) { tourFromTut = false; vmMode = 'hand'; playStage(1, false); }
}
click('tourNext', nextTour);
click('tourSkip', () => { tourFromTut = false; endTour(); });

/* ============ loop ============ */
let last = performance.now(), T = 0;
// swipes are drawn as a wet ink brush stroke: thick at the head, dry and broken at the tail
function drawTrail(now) {
  tctx.clearRect(0, 0, vw, vh);
  while (trail.length && now - trail[0].t > 160) trail.shift();
  if (trail.length > 1) {
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
    if (dist > 28 || e.gate) continue;
    const s = toScreen(bodyCenter(e));
    if (s && s.x > 30 && s.x < vw - 30 && s.y > 30 && s.y < vh - 30) continue;
    const lx = dx * cy - dz * sy, lf = -dx * sy - dz * cy, a = Math.atan2(lx, lf);
    const x = vw / 2 + Math.sin(a) * (vw / 2 - 46), y = vh / 2 - Math.cos(a) * (Math.cos(a) > 0 ? vh / 2 - 46 : vh / 2 - 110);
    const danger = e.state === 'windup' || e.state === 'throw', near = clamp(1 - dist / 28, 0.25, 1);
    const sz = (danger ? 22 : 15) * (0.7 + near * 0.5) * (danger ? 1 + Math.sin(t * 30) * 0.15 : 1);
    tctx.save(); tctx.translate(x, y); tctx.rotate(a);
    tctx.fillStyle = danger ? '#ff2a2a' : `rgba(255,70,60,${0.35 + near * 0.55})`;
    tctx.shadowColor = '#000'; tctx.shadowBlur = 6;
    tctx.beginPath(); tctx.moveTo(0, -sz); tctx.lineTo(sz * 0.75, sz * 0.5); tctx.lineTo(0, sz * 0.15); tctx.lineTo(-sz * 0.75, sz * 0.5); tctx.closePath(); tctx.fill();
    tctx.restore();
  }
  if (fovKick > 2.5 && state === 'play') {
    const k = Math.min(1, (fovKick - 2.5) / 7), cx = vw / 2, cy = vh / 2, R = Math.hypot(cx, cy);
    tctx.strokeStyle = `rgba(20,16,12,${0.3 * k})`; tctx.lineWidth = 2;
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2 + (i * 7.3 % 1), r0 = R * (0.55 + (i * 3.7 % 1) * 0.25); tctx.beginPath(); tctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); tctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); tctx.stroke(); }
  }
  if (blade && ptr.down) { tctx.strokeStyle = '#fff'; tctx.lineWidth = 2; tctx.beginPath(); tctx.arc(cursor.x, cursor.y, 7, 0, Math.PI * 2); tctx.stroke(); }
}

function frame(now) {
  requestAnimationFrame(frame);
  step(Math.min(0.05, (now - last) / 1000), now); last = now;
}
const _camT = new V3();
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
      updTutorial(dt);
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
  animHero(dt);
  phys.update(dt); fx.update(dt); world.update(dt, T, camera.position);
  // camera
  shake = Math.max(0, shake - rdt * 2.2);
  if (state === 'menu' || state === 'arsenal' || state === 'settings') {
    const a = T * 0.04;
    camera.position.set(Math.sin(a) * 15, 3.2, Math.cos(a) * 15);
    camera.lookAt(0, 1.6, 0);
  } else {
    if (save.cam === 'fp') {
      camera.position.set(player.pos.x, player.y + EYE + Math.sin(player.bob) * 0.04 * player.bobAmt - landDip, player.pos.z);
      camera.rotation.set(player.pitch - (player.flip > 0 ? Math.PI * 2 * smooth(player.flip) : 0), player.yaw, Math.sin(player.bob * 0.5) * 0.004 * player.bobAmt);
    } else {
      // over-the-shoulder (tp) or high wide action view, orbiting with the look direction
      const wide = save.cam === 'wide';
      let dist = wide ? 6.8 : 3.7;
      const side = wide ? 0 : 0.95, lift = wide ? 1.5 : 0.45;
      const pitch = clamp(player.pitch + (wide ? -0.32 : -0.08), -1.3, 0.9), yaw = player.yaw;
      const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
      const hx = player.pos.x + Math.cos(yaw) * side, hy = 1.55 + lift + player.y * 0.75 - landDip, hz = player.pos.z - Math.sin(yaw) * side;
      for (let i = 0; i < 6 && Math.hypot(hx - fx * dist, hz - fz * dist) > ARENA_R + 3.5; i++) dist *= 0.8;   // stay out of the bamboo
      const kc = 1 - Math.exp(-rdt * 16);
      camera.position.lerp(_camT.set(hx - fx * dist, Math.max(0.35, hy - fy * dist), hz - fz * dist), state === 'play' ? kc : 1);
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
  if (composer) composer.render(); else renderer.render(scene, camera);
  tuneRes(rdt);
  drawTrail(performance.now());
  drawThreats();
  if (DEV && QS.has('dbg')) { frameN = (frameN || 0) + 1; document.title = `f${frameN} cam=${save.cam} v2=${save.camV2} T${T.toFixed(1)} st=${state} en=${enemies.length} bodies=${phys.dolls.length}/${phys.rigids.length} k=${stats.kills} em=${enemies.reduce((n, e) => { e.root.traverseVisible(o => { if (o.isMesh) n++; }); return n; }, 0)} rs=${dynRes.scale.toFixed(2)} q=${stage ? stage.queue.length : -1}`; }
}

/* ============ boot ============ */
async function boot() {
  await initSDK();
  loadingStart();
  sdk.onMute = applyAudio;
  sdk.onAdUI = updAdUI;
  sdk.onAuth = () => { loadSave(); if (state === 'menu') updMenu(); updCoins(); };
  loadSave();
  quality = save.q || (sdk.touch ? 'low' : 'high');
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
  fx = makeFX(scene); fx.blood = save.blood;
  phys = makePhysics(scene, fx, sfx, world.arenaR);
  await loadBody('models/body.glb');
  for (const k of Object.keys(EDEF)) templates[k] = batchParts(buildEnemy(k));   // fewer draw calls per enemy
  buildViewmodel(); buildFling(); buildHero();
  applyQuality();
  world.setTheme((save.sel - 1) % 3);
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
  state = 'menu'; showLayer('menu'); updMenu(); updToggles();
  const unlockMusic = () => { music('menu'); removeEventListener('pointerdown', unlockMusic); removeEventListener('keydown', unlockMusic); };
  addEventListener('pointerdown', unlockMusic); addEventListener('keydown', unlockMusic);
  requestAnimationFrame(t => { last = t; frame(t); });
  const test = DEV ? QS.get('test') : null;
  if (DEV && QS.get('w') && WEAP[QS.get('w')]) { trial = QS.get('w'); }
  if (test === 'play') startStage(+(QS.get('stage') || 1));
  if (test === 'play' && QS.get('spawn')) after(0.4, () => QS.get('spawn').split(',').forEach((k, i, all) => { const a = player.yaw + (i - (all.length - 1) / 2) * 0.5; spawnEnemy(k, player.pos.x - Math.sin(a) * 6, player.pos.z - Math.cos(a) * 6); }));   // dev: e.g. &spawn=shogun,brute
  if (test === 'arsenal') $('arsenalBtn').click();
  if (test === 'storm') { startStage(+(QS.get('stage') || 2)); after(+(QS.get('at') || 1.6), () => { ult = 100; storm(); }); }   // dev: fire Blade Storm into the first wave
  if (test === 'finish') {   // dev: a crippled ninja in front of you; &go runs the finisher
    startStage(1);
    after(0.3, () => { const e = spawnEnemy('grunt', player.pos.x, player.pos.z - 2.8, true); e.state = 'idle'; woundEnemy(e, 'legs', new THREE.Plane(UP.clone(), -0.4), new V3(1, 0, 0)); });
    if (QS.has('go')) after(1.4, tryFinish);
  }
  if (test === 'tutorial') { startTutorial(); if (QS.get('tstep')) { tut.i = +QS.get('tstep') - 2; nextTutStep(); } }
  if (test === 'tour') { $('arsenalBtn').click(); startTour(false); for (let i = 0; i < +(QS.get('tour') || 0); i++) nextTour(); }
  if (DEV && QS.get('cam')) save.cam = QS.get('cam');
  if (DEV && QS.get('pitch')) player.pitch = +QS.get('pitch');
  const sim = DEV ? +(QS.get('sim') || 0) : 0;           // dev: advance the simulation synchronously (headless screenshots)
  for (let i = 0; i < sim; i++) step(1 / 60, performance.now() + i * 16.7, i === sim - 1);
}
boot();
