// Procedural low-poly enemies (sliceable) and detailed ninja weapons.
import * as THREE from 'three';
import { part } from './slicer.js';

const D2R = Math.PI / 180;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);
const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
function at(m, x, y, z, rx = 0, ry = 0, rz = 0, name) { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); if (name) m.name = name; return m; }
function pivot(name, x, y, z) { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); return g; }

// ---------------------------------------------------------------- enemies
const PAL = {
  // ink silhouettes: near-black bodies, one accent each, paper-white eye glints
  grunt: { cloth: 0x161412, trim: 0x9c1a14, skin: 0x2a2520, eye: 0xf2e8d2, wrap: 0x221f1c },
  runner: { cloth: 0x1c1b1e, trim: 0x55504a, skin: 0x2a2622, eye: 0xf2e8d2, wrap: 0x2a282c },
  archer: { cloth: 0x201e1b, trim: 0x6a5a42, skin: 0x2c2722, eye: 0xf2e8d2, wrap: 0x2a2620 },
  samurai: { cloth: 0x1a1816, trim: 0x8a1812, skin: 0x2a2520, eye: 0xf2e8d2, wrap: 0x2e2a27 },
  player: { cloth: 0x0f0e0e, trim: 0x2a2624, skin: 0x1e1b19, eye: 0xf6eedc, wrap: 0x1a1817 },
};

function blade(len, w, curve = 0.05) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  const N = 10;
  for (let i = 1; i <= N; i++) { const t = i / N; s.lineTo(curve * t * t, len * t); }
  s.lineTo(curve + w * 0.6, len * 0.93);
  for (let i = N; i >= 0; i--) { const t = i / N; s.lineTo(curve * t * t + w * (1 - 0.25 * t), len * t * 0.93); }
  return new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }).translate(-w * 0.5, 0, -0.006);
}

const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const capsule = (r, len, rs = 14) => new THREE.CapsuleGeometry(r, len, 5, rs);
// convex solid of revolution from [radius, y] pairs (closed at both ends)
const lathe = (prof, seg = 18) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const TORSO = [[0, 0], [0.16, 0.0], [0.185, 0.08], [0.205, 0.2], [0.222, 0.32], [0.215, 0.41], [0.17, 0.48], [0.1, 0.52], [0, 0.53]];

function ninja(kind) {
  const c = PAL[kind];
  const root = new THREE.Group();
  const hips = pivot('hips', 0, 0.95, 0); root.add(hips);
  hips.add(at(part(sph(0.17).scale(1.12, 0.72, 0.82), c.cloth), 0, -0.02, 0));                     // pelvis
  hips.add(at(part(cyl(0.2, 0.205, 0.1, 24).scale(1, 1, 0.78), c.trim), 0, 0.07, 0));                 // obi sash
  hips.add(at(part(sph(0.055).scale(1.5, 0.9, 0.6), c.trim), 0.05, 0.07, -0.16));                  // obi knot
  for (const sx of [-1, 1]) hips.add(at(part(box(0.05, 0.2, 0.015), c.trim), 0.03 + sx * 0.03, -0.05, -0.17, 0.25, 0, sx * 0.12));   // knot tails
  const torso = pivot('torso', 0, 0.1, 0); hips.add(torso);
  torso.add(part(lathe(TORSO).scale(1, 1, 0.66), c.cloth));                                         // chest shell
  for (const sx of [-1, 1]) torso.add(at(part(box(0.045, 0.34, 0.02), c.wrap), sx * 0.045, 0.3, 0.13, -0.05, 0, sx * 0.38));   // crossed kimono collar
  torso.add(at(part(cyl(0.055, 0.062, 0.12, 14), c.wrap, 'body', 'limb'), 0, 0.55, 0));              // neck
  const head = pivot('head', 0, 0.6, 0); torso.add(head);
  head.add(at(part(sph(0.125, 20, 16).scale(1, 1.1, 1.06), c.cloth), 0, 0.14, 0));                  // hood
  head.add(at(part(sph(0.1, 18, 12).scale(1.05, 0.42, 0.62), c.skin), 0, 0.155, 0.07));             // face opening
  for (const sx of [-1, 1]) head.add(at(part(sph(0.019, 10, 8).scale(1.7, 0.75, 0.6), c.eye, 'glow'), sx * 0.042, 0.16, 0.128));
  head.add(at(part(cyl(0.133, 0.133, 0.036, 24), c.trim), 0, 0.225, 0));                              // headband
  head.add(at(part(box(0.045, 0.3, 0.014), c.trim), 0.05, 0.1, -0.15, 0.35, 0, 0.25));                // headband tails
  head.add(at(part(box(0.045, 0.26, 0.014), c.trim), -0.03, 0.1, -0.155, 0.45, 0, -0.15));
  for (const sx of [-1, 1]) {
    const arm = pivot(sx < 0 ? 'armL' : 'armR', 0.25 * sx, 0.46, 0); torso.add(arm);
    arm.add(part(sph(0.078), c.cloth));                                                              // shoulder
    arm.add(at(part(capsule(0.06, 0.2), c.cloth, 'body', 'limb'), 0, -0.14, 0));                      // upper arm (sleeve)
    const el = pivot(sx < 0 ? 'elbowL' : 'elbowR', 0, -0.3, 0); arm.add(el);
    el.add(at(part(capsule(0.05, 0.18), c.wrap, 'body', 'limb'), 0, -0.13, 0));                       // bandaged forearm
    el.add(at(part(sph(0.052).scale(0.95, 1.15, 0.85), c.skin, 'body', 'limb'), 0, -0.3, 0.005));    // hand
    const hand = pivot(sx < 0 ? 'handL' : 'handR', 0, -0.31, 0); el.add(hand);
    const leg = pivot(sx < 0 ? 'legL' : 'legR', 0.1 * sx, -0.06, 0); hips.add(leg);
    leg.add(at(part(capsule(0.082, 0.26), c.cloth, 'body', 'limb'), 0, -0.2, 0));                     // thigh
    const kn = pivot(sx < 0 ? 'kneeL' : 'kneeR', 0, -0.42, 0); leg.add(kn);
    kn.add(at(part(capsule(0.063, 0.28), c.wrap, 'body', 'limb'), 0, -0.2, 0));                       // shin wraps
    kn.add(at(part(capsule(0.048, 0.13).rotateX(Math.PI / 2).scale(1.25, 1, 1), 0x15161a, 'body', 'limb'), 0, -0.43, 0.045));   // tabi foot
  }
  return root;
}

function enemyKatana(len = 0.75) {
  const g = new THREE.Group();
  g.add(at(part(cyl(0.018, 0.018, 0.2, 10), 0x1b1b1f, 'body', 'wood'), 0, 0, 0));
  g.add(at(part(cyl(0.045, 0.045, 0.012, 16), 0xc9a227, 'metal', 'metal'), 0, 0.105, 0));
  g.add(at(part(blade(len, 0.032, 0.04), 0xd5dde4, 'metal', 'metal'), 0, 0.11, 0));
  return g;
}

export function buildEnemy(kind) {
  let root, scale = 1;
  if (kind === 'oni') return buildOni();
  if (kind === 'dummy') return buildDummy();
  if (kind === 'player') {   // the hero, shown in third-person views (never sliced)
    const r = ninja('player'), head = r.getObjectByName('head'), torso = r.getObjectByName('torso');
    const rib = pivot('ribbon', 0, 0.225, -0.13); head.add(rib);                                     // long flowing headband tails
    for (const sx of [-1, 1]) rib.add(at(part(box(0.034, 0.85, 0.008).translate(0, -0.425, 0), 0xb01e18), sx * 0.035, 0, 0, 0, sx * 0.15, sx * 0.16));
    head.add(at(part(sph(0.052).scale(1, 1.35, 1), 0x0e0d0c), 0, 0.29, -0.07, -0.5, 0, 0));          // topknot
    torso.add(at(part(cyl(0.022, 0.026, 0.9, 12), 0x0c0b0a, 'body', 'wood'), -0.06, 0.32, -0.17, 0, 0, 0.78));   // scabbard across the back
    torso.add(at(part(cyl(0.05, 0.05, 0.015, 16), 0x3a3430, 'metal', 'metal'), 0.22, 0.6, -0.17, 0, 0, 0.78));
    return r;
  }
  root = ninja(kind);
  const handR = root.getObjectByName('handR'), handL = root.getObjectByName('handL');
  if (kind === 'grunt') {
    const k = enemyKatana(); k.rotation.x = Math.PI / 2 + 0.2; handR.add(k);
    root.getObjectByName('torso').add(at(part(cyl(0.025, 0.025, 0.6, 6), 0x111114), -0.12, 0.25, -0.17, 0, 0, 0.8));   // scabbard on back
  } else if (kind === 'runner') {
    for (const h of [handR, handL]) {
      const k = new THREE.Group();
      k.add(part(cyl(0.012, 0.012, 0.1, 5), 0x222222), at(part(new THREE.OctahedronGeometry(0.05, 0).scale(0.5, 2.2, 0.18), 0x9aa3ab, 'metal', 'metal'), 0, 0.15, 0));
      k.rotation.x = Math.PI / 2; h.add(k);
    }
    scale = 0.93;
  } else if (kind === 'archer') {
    const head = root.getObjectByName('head');
    head.add(at(part(cyl(0.02, 0.38, 0.14, 24), 0x7a6a50, 'body', 'wood'), 0, 0.3, 0));                         // straw hat
    root.getObjectByName('torso').add(at(part(box(0.22, 0.26, 0.1), 0x2a221a, 'body', 'wood'), 0, 0.3, -0.19)); // quiver pack
  } else if (kind === 'samurai') {
    const torso = root.getObjectByName('torso'), head = root.getObjectByName('head');
    torso.add(at(part(lathe([[0, 0], [0.22, 0], [0.25, 0.16], [0.26, 0.3], [0.2, 0.4], [0, 0.42]], 20).scale(1, 1, 0.74), 0x2a2624, 'body', 'wood'), 0, 0.1, 0));   // do (chest plate)
    for (let i = 0; i < 3; i++) torso.add(at(part(box(0.5 - i * 0.02, 0.05, 0.36), i % 2 ? 0x6e1410 : 0x1e1c1a, 'body', 'wood'), 0, -0.04 - i * 0.07, 0));   // kusazuri
    for (const sx of [-1, 1]) torso.add(at(part(box(0.2, 0.05, 0.26), 0x2a2624, 'body', 'wood'), 0.33 * sx, 0.52, 0, 0, 0, -0.45 * sx));            // sode
    head.add(at(part(new THREE.SphereGeometry(0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x1a1a1e, 'metal', 'metal'), 0, 0.17, 0));             // kabuto
    head.add(at(part(cyl(0.25, 0.23, 0.03, 24), 0x1a1a1e, 'metal', 'metal'), 0, 0.16, -0.03, -0.25, 0, 0));
    for (const sx of [-1, 1]) head.add(at(part(box(0.035, 0.26, 0.012).translate(0, 0.13, 0), 0xa89468, 'metal', 'metal'), sx * 0.03, 0.27, 0.11, -0.25, 0, -sx * 0.55));   // kuwagata horns
    head.add(at(part(box(0.2, 0.08, 0.05), 0x3a1010), 0, 0.09, 0.12));                                                                              // menpo
    const yari = new THREE.Group();                                                                        // spearman's yari
    yari.add(at(part(cyl(0.018, 0.02, 2.1, 10), 0x2a1e14, 'body', 'wood'), 0, 0.45, 0));
    yari.add(at(part(cyl(0.026, 0.022, 0.08, 10), 0x4a4440, 'metal', 'metal'), 0, 1.52, 0));
    yari.add(at(part(new THREE.OctahedronGeometry(0.05, 0).scale(0.6, 4.2, 0.22), 0xc8cdd2, 'metal', 'metal'), 0, 1.76, 0));
    yari.rotation.x = Math.PI / 2 + 0.25; handR.add(yari);
    scale = 1.14;
  }
  root.scale.setScalar(scale);
  return root;
}

function buildOni() {
  const root = new THREE.Group();
  const skin = 0x231b18, dark = 0x100b0a, tiger = 0x5e5040;
  const hips = pivot('hips', 0, 0.95, 0); root.add(hips);
  hips.add(at(part(sph(0.24).scale(1.1, 0.62, 0.8), tiger), 0, -0.02, 0));                          // tiger-skin loincloth
  for (let i = 0; i < 5; i++) hips.add(at(part(box(0.035, 0.12, 0.02), 0x1a1a1a), -0.16 + i * 0.08, -0.02, 0.19, 0, 0, 0.3));   // stripes
  const torso = pivot('torso', 0, 0.1, 0); hips.add(torso);
  torso.add(part(lathe([[0, 0], [0.26, 0], [0.3, 0.12], [0.36, 0.3], [0.38, 0.44], [0.33, 0.56], [0.2, 0.64], [0, 0.66]], 20).scale(1, 1, 0.74), skin));
  for (const sx of [-1, 1]) torso.add(at(part(sph(0.15).scale(1.1, 0.7, 0.55), skin), sx * 0.14, 0.42, 0.17));   // pecs
  torso.add(at(part(sph(0.24).scale(1.1, 0.85, 0.62), skin), 0, 0.17, 0.1));                          // belly
  const head = pivot('head', 0, 0.66, 0.04); torso.add(head);
  head.add(at(part(sph(0.2, 22, 16).scale(1.05, 1, 0.95), skin), 0, 0.17, 0));
  head.add(at(part(sph(0.12).scale(1.9, 0.5, 0.8), dark), 0, 0.25, 0.1));                             // heavy brow
  head.add(at(part(sph(0.07).scale(1.4, 1, 1), skin), 0, 0.15, 0.18));                                 // nose
  for (const sx of [-1, 1]) {
    head.add(at(part(sph(0.03, 10, 8).scale(1.6, 0.8, 0.6), 0xe0281c, 'glow'), 0.075 * sx, 0.2, 0.175));
    head.add(at(part(new THREE.ConeGeometry(0.05, 0.24, 12), 0xf1e6c8, 'body', 'bone'), 0.11 * sx, 0.4, 0, 0, 0, -0.35 * sx));
    head.add(at(part(new THREE.ConeGeometry(0.02, 0.075, 8), 0xf6f0de, 'body', 'bone'), 0.055 * sx, 0.05, 0.16, Math.PI, 0, 0));   // tusks
  }
  head.add(at(part(sph(0.09).scale(1.5, 0.4, 0.5), 0x2a0606), 0, 0.07, 0.15));                        // mouth
  head.add(at(part(sph(0.14).scale(1.5, 0.6, 1.2), 0x1c1414), 0, 0.31, -0.07));                        // wild hair
  for (const sx of [-1, 1]) {
    const arm = pivot(sx < 0 ? 'armL' : 'armR', 0.42 * sx, 0.55, 0); torso.add(arm);
    arm.add(part(sph(0.14), skin));
    arm.add(at(part(capsule(0.105, 0.24), skin, 'body', 'limb'), 0, -0.18, 0));
    const el = pivot(sx < 0 ? 'elbowL' : 'elbowR', 0, -0.36, 0); arm.add(el);
    el.add(at(part(capsule(0.09, 0.2), skin, 'body', 'limb'), 0, -0.16, 0));
    el.add(at(part(cyl(0.1, 0.1, 0.07, 18), 0x6a5a40, 'metal', 'metal'), 0, -0.25, 0));               // gold bracer
    el.add(at(part(sph(0.095).scale(1, 1.1, 0.9), skin, 'body', 'limb'), 0, -0.38, 0));
    const hand = pivot(sx < 0 ? 'handL' : 'handR', 0, -0.38, 0); el.add(hand);
    const leg = pivot(sx < 0 ? 'legL' : 'legR', 0.15 * sx, -0.06, 0); hips.add(leg);
    leg.add(at(part(capsule(0.125, 0.22), skin, 'body', 'limb'), 0, -0.21, 0));
    const kn = pivot(sx < 0 ? 'kneeL' : 'kneeR', 0, -0.42, 0); leg.add(kn);
    kn.add(at(part(capsule(0.095, 0.26), skin, 'body', 'limb'), 0, -0.21, 0));
    kn.add(at(part(capsule(0.07, 0.14).rotateX(Math.PI / 2).scale(1.3, 1, 1), dark, 'body', 'limb'), 0, -0.44, 0.06));
  }
  // kanabo club
  const club = new THREE.Group();
  club.add(at(part(cyl(0.035, 0.035, 0.3, 10), 0x3a2414, 'body', 'wood'), 0, 0, 0));
  club.add(at(part(cyl(0.11, 0.06, 0.95, 14), 0x2b2b30, 'metal', 'metal'), 0, 0.6, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i % 4) * Math.PI / 2 + (i > 3 && i < 8 ? Math.PI / 4 : 0), y = 0.35 + Math.floor(i / 4) * 0.27;
    club.add(at(part(new THREE.ConeGeometry(0.03, 0.07, 8), 0xc0c4c8, 'metal', 'metal'), Math.cos(a) * 0.1, y, Math.sin(a) * 0.1, 0, 0, 0).rotateOnAxis(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -Math.PI / 2));
  }
  club.rotation.x = Math.PI / 2 + 0.2;
  root.getObjectByName('handR').add(club);
  root.scale.setScalar(2.1);
  return root;
}

// straw training dummy for the tutorial
function buildDummy() {
  const root = new THREE.Group(), straw = 0xd8b45a, rope = 0x6b4a22, wood = 0x5a3a1e;
  root.add(at(part(cyl(0.06, 0.07, 1.0, 7), wood, 'body', 'wood'), 0, 0.5, 0));
  root.add(at(part(cyl(0.24, 0.2, 0.75, 18), straw, 'body', 'wood'), 0, 1.15, 0));
  for (const y of [0.88, 1.15, 1.42]) root.add(at(part(cyl(0.245, 0.245, 0.04, 18), rope, 'body', 'wood'), 0, y, 0));
  root.add(at(part(cyl(0.04, 0.04, 0.95, 6).rotateZ(Math.PI / 2), wood, 'body', 'wood'), 0, 1.38, 0));
  for (const sx of [-1, 1]) root.add(at(part(ico(0.08, 0), straw, 'body', 'wood'), 0.5 * sx, 1.38, 0));
  root.add(at(part(sph(0.17), 0xc9a777, 'body', 'wood'), 0, 1.7, 0));
  root.add(at(part(cyl(0.1, 0.1, 0.02, 12).rotateX(Math.PI / 2), 0xc0281e, 'body', 'wood'), 0, 1.72, 0.16));
  root.add(at(part(cyl(0.045, 0.045, 0.025, 10).rotateX(Math.PI / 2), 0xf2ead8, 'body', 'wood'), 0, 1.72, 0.17));
  return root;
}

// enemy projectile (thrown shuriken, dark red steel)
export function enemyStar() { const m = shurikenMesh(0x6b2a2a, 0.13); return m; }

// ---------------------------------------------------------------- player weapons
let steelMat, darkSteel, goldMat, wrapMat, woodMat, lacquerMat, clothMat, skinMat;
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
function mats() {
  if (steelMat) return;
  steelMat = new THREE.MeshStandardMaterial({ color: 0xf2f6fa, metalness: 0.88, roughness: 0.2, envMapIntensity: 1.8 });
  darkSteel = new THREE.MeshStandardMaterial({ color: 0x8a929b, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.6 });
  goldMat = new THREE.MeshStandardMaterial({ color: 0xd8a93a, metalness: 1, roughness: 0.3 });
  const wrap = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#16161c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e9e1cf';
    for (let y = -32; y < h + 32; y += 32) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w, y + 16); g.lineTo(w / 2, y + 32); g.lineTo(0, y + 16); g.closePath(); g.fill(); }
    g.fillStyle = '#16161c';
    for (let y = -32; y < h + 32; y += 32) { g.beginPath(); g.moveTo(w / 2, y + 6); g.lineTo(w - 12, y + 16); g.lineTo(w / 2, y + 26); g.lineTo(12, y + 16); g.closePath(); g.fill(); }
  });
  wrap.repeat.set(1, 4);
  wrapMat = new THREE.MeshStandardMaterial({ map: wrap, roughness: 0.85 });
  woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.7, map: canvasTex(32, 256, (g, w, h) => { g.fillStyle = '#a07040'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,30,10,${0.1 + Math.random() * 0.25})`; g.fillRect(Math.random() * w, 0, 1 + Math.random() * 2, h); } }) });
  lacquerMat = new THREE.MeshStandardMaterial({ color: 0x8e1414, roughness: 0.25, metalness: 0.1 });
  clothMat = new THREE.MeshStandardMaterial({ color: 0x1d2440, roughness: 0.9 });
  skinMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.8 });
}
function mesh(g, m) { const o = new THREE.Mesh(g, m); return o; }

function katanaBladeGeo(len, w, curve) {
  const s = new THREE.Shape(); const N = 16;
  s.moveTo(0, 0);
  for (let i = 1; i <= N; i++) { const t = i / N; s.lineTo(curve * t * t, len * t * 0.94); }
  s.lineTo(curve + w * 0.15, len);
  for (let i = N; i >= 0; i--) { const t = i / N; s.lineTo(curve * t * t + w * (1 - 0.3 * t), len * t * 0.9); }
  return new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 4 }).translate(-w * 0.5, 0, -0.003);
}
function katana() {
  mats();
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.016, 0.018, 0.26, 10), wrapMat), 0, -0.13, 0));
  g.add(at(mesh(cyl(0.02, 0.02, 0.02, 10), goldMat), 0, -0.27, 0));
  g.add(at(mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 20), darkSteel), 0, 0.01, 0, Math.PI / 2));
  g.add(at(mesh(cyl(0.042, 0.042, 0.01, 20), darkSteel), 0, 0.01, 0));
  g.add(at(mesh(box(0.034, 0.03, 0.016), goldMat), 0, 0.03, 0));
  g.add(at(mesh(katanaBladeGeo(0.82, 0.03, 0.05), steelMat), 0, 0.04, 0));
  const edge = new THREE.Mesh(katanaBladeGeo(0.8, 0.008, 0.05), new THREE.MeshBasicMaterial({ color: 0xcfefff, toneMapped: false }));
  edge.scale.set(1, 1, 1.05); edge.position.set(-0.011, 0.045, 0); g.add(edge);
  g.userData.tip = new THREE.Vector3(0.05, 0.86, 0);
  return g;
}
function starShape(r, ri, pts = 4, hole = 0.016) {
  const s = new THREE.Shape();
  for (let i = 0; i < pts * 2; i++) { const a = i / (pts * 2) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? ri : r; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const h = new THREE.Path(); h.absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(h);
  return s;
}
export function shurikenMesh(color = 0xc4ccd4, r = 0.11) {
  mats();
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.25, envMapIntensity: 1.8 });
  const g = new THREE.ExtrudeGeometry(starShape(r, r * 0.3), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1 }).translate(0, 0, -0.003);
  const o = new THREE.Group(); o.add(new THREE.Mesh(g, m));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.24, 0.006, 6, 16), goldMat); o.add(ring);
  return o;
}
export function kunaiMesh() {
  mats();
  const g = new THREE.Group();
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.032, 0.055); s.lineTo(0, 0.2); s.lineTo(-0.032, 0.055); s.closePath();
  g.add(at(mesh(new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.004, bevelSegments: 1 }).translate(0, 0, -0.002), darkSteel), 0, 0.01, 0));
  g.add(at(mesh(cyl(0.011, 0.012, 0.12, 8), wrapMat), 0, -0.05, 0));
  g.add(at(mesh(new THREE.TorusGeometry(0.024, 0.006, 6, 16), darkSteel), 0, -0.135, 0));
  return g;
}
function kusarigama() {
  mats();
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.018, 0.02, 0.4, 8), woodMat), 0, 0.06, 0));
  g.add(at(mesh(cyl(0.024, 0.024, 0.03, 8), darkSteel), 0, 0.26, 0));
  g.add(sickle());
  // chain hanging from the pommel
  const link = new THREE.TorusGeometry(0.014, 0.004, 4, 8);
  for (let i = 0; i < 7; i++) g.add(at(mesh(link, darkSteel), 0.004 * i * i * 0.3, -0.16 - i * 0.022, 0.003 * i, 0, i % 2 ? Math.PI / 2 : 0, 0));
  g.add(at(mesh(cyl(0.02, 0.02, 0.05, 6), darkSteel), 0.06, -0.34, 0.02));
  return g;
}
export function sickle() {
  mats();
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.quadraticCurveTo(0.12, 0.09, 0.26, 0.0); s.quadraticCurveTo(0.12, 0.04, 0, -0.035); s.closePath();
  const m = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 }).translate(0, 0, -0.002), steelMat);
  m.position.set(0.01, 0.26, 0);
  const o = new THREE.Group(); o.add(m); o.name = 'sickle';
  return o;
}
function naginata() {
  mats();
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.02, 0.022, 1.5, 10), lacquerMat), 0, 0.05, 0));
  for (const y of [-0.6, 0.0, 0.55]) g.add(at(mesh(cyl(0.025, 0.025, 0.03, 10), goldMat), 0, y, 0));
  g.add(at(mesh(cyl(0.026, 0.022, 0.12, 10), darkSteel), 0, 0.82, 0));
  g.add(at(mesh(cyl(0.04, 0.04, 0.01, 12), goldMat), 0, 0.88, 0));
  g.add(at(mesh(katanaBladeGeo(0.5, 0.05, 0.1), steelMat), 0, 0.89, 0));
  const edge = new THREE.Mesh(katanaBladeGeo(0.48, 0.01, 0.1), new THREE.MeshBasicMaterial({ color: 0xe8f4ff, toneMapped: false }));
  edge.position.set(-0.02, 0.895, 0); edge.scale.z = 1.05; g.add(edge);
  g.position.y = -0.45;
  const w = new THREE.Group(); w.add(g);
  return w;
}

export const WEAPON_MODELS = {
  katana, kusarigama, naginata,
  shuriken: () => { const s = shurikenMesh(); s.rotation.x = 0.4; return s; },
  kunai: () => { const k = kunaiMesh(); k.scale.setScalar(1.4); return k; },
};

// first-person hand: sleeve + glove, grip at origin
export function hand() {
  mats();
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.045, 0.065, 0.42, 10), clothMat), 0.05, -0.08, 0.2, 1.25, 0, -0.2));
  g.add(at(mesh(new THREE.BoxGeometry(0.075, 0.075, 0.09), skinMat), 0, 0, 0.01));
  g.add(at(mesh(cyl(0.05, 0.05, 0.04, 10), new THREE.MeshStandardMaterial({ color: 0x9a1a1a, roughness: 0.7 })), 0.035, -0.05, 0.11, 1.25, 0, -0.2));
  return g;
}

export function weaponIconSVG(id) {
  const P = {
    katana: '<path d="M4 20l2.6-2.6M3.2 16.6l4.2 4.2" stroke-width="2.4"/><path d="M7.4 16.6C12 12.4 16.2 8 20.6 3.2" stroke-width="2.8"/>',
    shuriken: '<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="currentColor" stroke-width="1"/><circle cx="12" cy="12" r="1.8" fill="#000" stroke="none"/>',
    kunai: '<path d="M12 2.5l3.2 8-3.2 3-3.2-3z" fill="currentColor" stroke-width="1"/><path d="M12 13.5v5" stroke-width="2.6"/><circle cx="12" cy="20.6" r="1.6" stroke-width="1.6"/>',
    kusarigama: '<path d="M6 19L15 7" stroke-width="2.6"/><path d="M15 7c3-2 6-1.6 7.4.2-2.6-.6-5 .2-6.6 1.8z" fill="currentColor" stroke-width="1"/><path d="M5.2 20.5c-1.6 1.2-2.8.8-3.4-.4" stroke-width="1.6" stroke-dasharray="1.6 1.4"/>',
    naginata: '<path d="M3 21L15.5 8.5" stroke-width="2.2"/><path d="M15.5 8.5C17 5.6 19.6 3.4 22 2.4c-.4 3-2.4 5.8-5 7.4z" fill="currentColor" stroke-width="1"/>',
    heart: '<path d="M12 21s-7.5-4.6-9.4-9.4C1.2 8 3.4 4.4 7 4.4c2 0 3.4 1 5 2.8 1.6-1.8 3-2.8 5-2.8 3.6 0 5.8 3.6 4.4 7.2C19.5 16.4 12 21 12 21z" fill="currentColor" stroke-width="1"/>',
    storm: '<path d="M3 17L17 3M7 21L21 7M2 10l8-8M14 22l8-8" stroke-width="2"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${P[id]}</svg>`;
}
