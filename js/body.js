// Realistic human body: one continuous skinned mesh (Mixamo "Soldier", see README) driven by the game's pivot rig.
// The model's bones are re-parented under the named pivots (hips, torso, armL, ...), so every pose the
// game sets on the pivots deforms the skin with no per-frame retargeting. On death the skin is baked into
// one rigid piece per pivot so the ragdoll and the slicer keep working on plain geometry.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
let SRC = null;
export const BODY_SCALE = 1.03;    // model is 1.83 m tall; this matches the old ninja height
export const RIG = {};             // joint positions (metres, model space, at BODY_SCALE) after the rest pose is applied

// game pivots sit on the -x side for "L"; Mixamo's Right side is -x when the model faces +z
const MAP = [['hips', 'Hips'], ['torso', 'Spine'], ['head', 'Neck'],
  ['armL', 'RightArm'], ['elbowL', 'RightForeArm'], ['handL', 'RightHand'], ['armR', 'LeftArm'], ['elbowR', 'LeftForeArm'], ['handR', 'LeftHand'],
  ['legL', 'RightUpLeg'], ['kneeL', 'RightLeg'], ['legR', 'LeftUpLeg'], ['kneeR', 'LeftLeg']];
const KEYS = new Set(MAP.map(m => m[0]));
const bone = (root, n) => root.getObjectByName('mixamorig' + n);

function rotWorld(o, q) {   // rotate an object about its own origin by a world-space rotation
  o.parent.updateWorldMatrix(true, false);
  const pw = o.parent.getWorldQuaternion(new Q()), w = o.getWorldQuaternion(new Q());
  o.quaternion.copy(pw.invert().multiply(q.clone().multiply(w)));
  o.updateMatrixWorld(true);
}
const wpos = o => o.getWorldPosition(new V3());

export function parseBody(buffer) {
  return new Promise((res, rej) => new GLTFLoader().parse(buffer, '', g => { setup(g.scene); res(); }, rej));
}
export async function loadBody(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('body model ' + r.status);
  await parseBody(await r.arrayBuffer());
}

function setup(scene) {
  SRC = scene;
  SRC.updateMatrixWorld(true);
  if (wpos(bone(SRC, 'LeftToe_End')).z < wpos(bone(SRC, 'LeftFoot')).z) { SRC.rotation.y = Math.PI; SRC.updateMatrixWorld(true); }   // face +z like the game rig
  SRC.traverse(o => { if (o.isSkinnedMesh) thickenWaist(o); });
  // rest pose: arms hang at the sides (model ships in a T-pose), hands closed into loose fists
  for (const [s, sx] of [['Left', 1], ['Right', -1]]) {
    const arm = bone(SRC, s + 'Arm'), dir = wpos(bone(SRC, s + 'ForeArm')).sub(wpos(arm)).normalize();
    const q = new Q().setFromUnitVectors(dir, new V3(sx * 0.16, -1, 0.03).normalize());
    const palm = new V3(0, -1, 0).applyQuaternion(q);
    rotWorld(arm, q);
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) [1.0, 1.2, 0.9].forEach((a, i) => {
      const b = bone(SRC, s + 'Hand' + f + (i + 1)), c = bone(SRC, s + 'Hand' + f + (i + 2));
      if (!b || !c) return;
      const d = wpos(c).sub(wpos(b)).normalize();
      rotWorld(b, new Q().setFromAxisAngle(new V3().crossVectors(d, palm).normalize(), a));
    });
  }
  SRC.traverse(o => { if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; o.userData.noSlice = true; } });
  SRC.updateMatrixWorld(true);
  const p = n => wpos(bone(SRC, n)).multiplyScalar(BODY_SCALE);
  Object.assign(RIG, {
    hips: p('Hips'), spine: p('Spine'), chest: p('Spine2'), neck: p('Neck'), head: p('Head'), top: p('HeadTop_End'),
    sh: p('RightArm'), el: p('RightForeArm'), wr: p('RightHand'),
    hp: p('RightUpLeg'), kn: p('RightLeg'), an: p('RightFoot'), toe: p('RightToe_End'),
  });
}
export const bodyReady = () => !!SRC;

// Widen the waist and belly to the chest's width and depth (the model tapers into a narrow V).
// Works on the bind pose in world space: measure the trunk per 4 cm slice, then scale each slice
// between the hips and the chest out to the chest size, fading out toward the thighs and shoulders.
function thickenWaist(m) {
  const g = m.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const trunk = new Set(['Hips', 'Spine', 'Spine1', 'Spine2'].map(n => m.skeleton.bones.indexOf(bone(SRC, n))));
  const y0 = wpos(bone(SRC, 'Hips')).y, y1 = wpos(bone(SRC, 'Spine2')).y, yN = wpos(bone(SRC, 'Neck')).y;
  const W = m.matrixWorld, inv = W.clone().invert(), v = new V3(), n = new V3(), S = 0.04, rows = new Map();
  const isTrunk = i => { let b = -1, bw = 0; for (let j = 0; j < 4; j++) if (sw.getComponent(i, j) > bw) { bw = sw.getComponent(i, j); b = si.getComponent(i, j); } return trunk.has(b); };
  for (let i = 0; i < pos.count; i++) {
    if (!isTrunk(i)) continue;
    v.fromBufferAttribute(pos, i).applyMatrix4(W);
    const k = Math.round(v.y / S); let r = rows.get(k); if (!r) rows.set(k, r = { xn: 9, xx: -9, zn: 9, zx: -9 });
    r.xn = Math.min(r.xn, v.x); r.xx = Math.max(r.xx, v.x); r.zn = Math.min(r.zn, v.z); r.zx = Math.max(r.zx, v.z);
  }
  let tw = 0, td = 0;   // chest size: widest trunk slice between Spine2 and the neck
  for (const [k, r] of rows) if (k * S >= y1 - 0.02 && k * S <= yN) { tw = Math.max(tw, r.xx - r.xn); td = Math.max(td, r.zx - r.zn); }
  const row = y => rows.get(Math.round(y / S));
  const ss = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(W);
    const f = ss(y0 - 0.12, y0 + 0.02, v.y) * (1 - ss(y1 - 0.04, y1 + 0.06, v.y));
    if (f <= 0) continue;
    const r = row(v.y) || row(Math.min(Math.max(v.y, y0), y1));
    if (!r || Math.abs(v.x) > (r.xx - r.xn) * 0.5 + 0.12) continue;   // keep well clear of anything outside the trunk
    const sx = 1 + f * Math.max(0, tw / (r.xx - r.xn) - 1), sz = 1 + f * Math.max(0, td / (r.zx - r.zn) - 1), zc = (r.zx + r.zn) / 2;
    v.x *= sx; v.z = zc + (v.z - zc) * sz;
    pos.setXYZ(i, ...v.applyMatrix4(inv).toArray());
    n.fromBufferAttribute(nor, i).transformDirection(W);
    n.set(n.x / sx, n.y, n.z / sz).normalize().transformDirection(inv);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = nor.needsUpdate = true;
  g.computeBoundingSphere();
}

const matCache = new Map();
function skinMat(hex, rough) {
  const k = hex + ':' + rough;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.02 }));
  return matCache.get(k);
}

// Adds the body to `root`, whose pivots must already sit on the RIG joints and have no rotation.
// look: { surface, joints } colours.
export function attachBody(root, look) {
  const rig = SkeletonUtils.clone(SRC);
  rig.name = 'body';
  rig.scale.setScalar(BODY_SCALE);
  root.add(rig);
  rig.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const joints = /Joints/.test(o.name);
    o.material = skinMat(joints ? look.joints : look.surface, joints ? 0.6 : 0.78);
  });
  root.updateMatrixWorld(true);
  const bs = MAP.map(([pv, bn]) => [root.getObjectByName(pv), bone(rig, bn)]);   // look up first: attaching moves bones out of rig
  for (const [pv, b] of bs) pv.attach(b);
  return rig;
}

// Clone a character, rebinding skinned meshes to the clone's own bones.
export const cloneChar = o => SkeletonUtils.clone(o);

// Bake the posed skin into world-space, non-indexed pieces, one per pivot (hands stay on the forearm).
const HAND = { handL: 'elbowL', handR: 'elbowR' };
const LIMB = new Set(['armL', 'elbowL', 'armR', 'elbowR', 'legL', 'kneeL', 'legR', 'kneeR']);
// Posed (skinned) world-space vertex positions, normals and pivot key per vertex of one skinned mesh.
function skinPose(m) {
  const _m = new THREE.Matrix4(), sk = m.skeleton, bones = sk.bones, g = m.geometry;
  const keyOf = bones.map(b => { let o = b; while (o && !KEYS.has(o.name)) o = o.parent; const k = o ? o.name : 'torso'; return HAND[k] || k; });
  const E = bones.map((b, i) => _m.multiplyMatrices(m.matrixWorld, m.bindMatrixInverse).multiply(b.matrixWorld).multiply(sk.boneInverses[i]).multiply(m.bindMatrix).elements.slice());
  const pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = pos.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), K = new Array(n);
  for (let v = 0; v < n; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v), a = nor.getX(v), b = nor.getY(v), c = nor.getZ(v);
    let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0, best = -1;
    for (let j = 0; j < 4; j++) {
      const w = sw.getComponent(v, j); if (w <= 0) continue;
      const bi = si.getComponent(v, j), e = E[bi];
      px += w * (e[0] * x + e[4] * y + e[8] * z + e[12]); py += w * (e[1] * x + e[5] * y + e[9] * z + e[13]); pz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
      nx += w * (e[0] * a + e[4] * b + e[8] * c); ny += w * (e[1] * a + e[5] * b + e[9] * c); nz += w * (e[2] * a + e[6] * b + e[10] * c);
      if (w > best) { best = w; K[v] = keyOf[bi]; }
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz; N[v * 3] = nx / l; N[v * 3 + 1] = ny / l; N[v * 3 + 2] = nz / l;
  }
  return { P, N, K, idx: g.index.array };
}

// Glowing cut lines where each plane crosses the posed skin: thin ribbons lifted just off the surface.
export const MARK_MAT = new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false, transparent: true, side: THREE.DoubleSide, depthWrite: false });
const MARK_CORE = new THREE.MeshBasicMaterial({ color: 0xfff4e0, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
// a red-hot band with a white core
export function cutMarks(root, planes) {
  const outer = markMesh(root, planes, 0.022, 0.007, MARK_MAT); if (!outer) return null;
  const g = new THREE.Group(); g.add(outer, markMesh(root, planes, 0.007, 0.009, MARK_CORE)); g.children[1].renderOrder = 3;
  return g;
}
function markMesh(root, planes, width, liftBy, mat) {
  const meshes = [];
  root.traverse(o => { if (o.isSkinnedMesh && o.visible) meshes.push(o); });
  if (!meshes.length) return null;
  root.updateMatrixWorld(true);
  const out = [], hw = width * root.scale.x, lift = liftBy * root.scale.x, a = new V3(), b = new V3(), na = new V3(), nb = new V3();
  const d = [0, 0, 0];
  for (const m of meshes) {
    const { P, N, idx } = skinPose(m);
    for (const pl of planes) {
      const pn = pl.normal;
      for (let t = 0; t < idx.length; t += 3) {
        for (let k = 0; k < 3; k++) { const v = idx[t + k] * 3; d[k] = pn.x * P[v] + pn.y * P[v + 1] + pn.z * P[v + 2] + pl.constant; }
        if ((d[0] > 0) === (d[1] > 0) && (d[1] > 0) === (d[2] > 0)) continue;
        let got = 0;
        for (let k = 0; k < 3 && got < 2; k++) {
          const k2 = (k + 1) % 3; if ((d[k] > 0) === (d[k2] > 0)) continue;
          const f = d[k] / (d[k] - d[k2]), v0 = idx[t + k] * 3, v1 = idx[t + k2] * 3, p = got ? b : a, n = got ? nb : na;
          p.set(P[v0] + (P[v1] - P[v0]) * f, P[v0 + 1] + (P[v1 + 1] - P[v0 + 1]) * f, P[v0 + 2] + (P[v1 + 2] - P[v0 + 2]) * f);
          n.set(N[v0] + (N[v1] - N[v0]) * f, N[v0 + 1] + (N[v1 + 1] - N[v0 + 1]) * f, N[v0 + 2] + (N[v1 + 2] - N[v0 + 2]) * f).normalize();
          p.addScaledVector(n, lift); got++;
        }
        if (got < 2) continue;
        const q = (p, s) => out.push(p.x + pn.x * hw * s, p.y + pn.y * hw * s, p.z + pn.z * hw * s);
        q(a, 1); q(a, -1); q(b, 1); q(b, 1); q(a, -1); q(b, -1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  return mesh;
}

export function bakeBody(root) {
  const meshes = [];
  root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) return [];
  root.updateMatrixWorld(true);
  const out = [], col = new THREE.Color();
  for (const m of meshes) {
    const { P, N, K } = skinPose(m), g = m.geometry;
    col.copy(m.material.color);
    const groups = new Map(), idx = g.index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
      const k = K[i1] === K[i2] ? K[i1] : K[i0];
      let gr = groups.get(k); if (!gr) groups.set(k, gr = []);
      gr.push(i0, i1, i2);
    }
    for (const [key, ids] of groups) {
      const p = new Float32Array(ids.length * 3), nn = new Float32Array(ids.length * 3), cc = new Float32Array(ids.length * 3);
      ids.forEach((v, i) => { for (let c = 0; c < 3; c++) { p[i * 3 + c] = P[v * 3 + c]; nn[i * 3 + c] = N[v * 3 + c]; } cc[i * 3] = col.r; cc[i * 3 + 1] = col.g; cc[i * 3 + 2] = col.b; });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      out.push({ key, geo, cap: LIMB.has(key) ? 'limb' : 'flesh' });
    }
  }
  for (const m of meshes) m.visible = false;
  return out;
}
