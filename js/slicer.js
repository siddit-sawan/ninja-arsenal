// Real-time mesh slicing: cuts non-indexed (position, normal, color) geometry by a plane and caps the hole.
import * as THREE from 'three';

export const MATS = {
  body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.85 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

// Cut faces: an outer rim plus an inner disc (bone in limbs, darker meat in torsos).
export const CAP = { blood: true };
const C = h => new THREE.Color(h);
const capColors = {
  flesh: () => CAP.blood ? { rim: C(0xb3121b), inner: C(0x5e070c), k: 0.55 } : { rim: C(0x2a2040), inner: C(0x140f22), k: 0.55 },
  limb: () => CAP.blood ? { rim: C(0xc0161f), inner: C(0xefe6d2), k: 0.3 } : { rim: C(0x2a2040), inner: C(0xd8d0e8), k: 0.3 },
  metal: () => ({ rim: C(0xc9d2da), inner: C(0xa8b2bc), k: 0.5 }),
  wood: () => ({ rim: C(0xd9b07a), inner: C(0xb98e58), k: 0.55 }),
  bone: () => ({ rim: C(0xf2ead8), inner: C(0xe0d4bc), k: 0.5 }),
  glow: () => ({ rim: C(0xffffff), inner: C(0xffffff), k: 0.5 }),
};
export const capColor = kind => (capColors[kind] || capColors.flesh)();

// Per-corner normals averaged over neighbouring faces within `deg` degrees:
// rounded shapes shade smoothly, hard edges (boxes, cylinder rims) stay crisp.
function smoothNormals(g, deg) {
  const P = g.attributes.position.array, nf = P.length / 9;
  const fn = new Float32Array(nf * 3), fu = new Float32Array(nf * 3);
  for (let f = 0; f < nf; f++) {
    const o = f * 9;
    const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
    const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
    const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx, l = Math.hypot(x, y, z) || 1;
    fn[f * 3] = x; fn[f * 3 + 1] = y; fn[f * 3 + 2] = z;
    fu[f * 3] = x / l; fu[f * 3 + 1] = y / l; fu[f * 3 + 2] = z / l;
  }
  const key = v => Math.round(P[v * 3] * 1e4) + ',' + Math.round(P[v * 3 + 1] * 1e4) + ',' + Math.round(P[v * 3 + 2] * 1e4);
  const map = new Map(), keys = [];
  for (let v = 0; v < nf * 3; v++) { const k = key(v); keys.push(k); let a = map.get(k); if (!a) map.set(k, a = []); a.push(v / 3 | 0); }
  const cos = Math.cos(deg * Math.PI / 180), N = new Float32Array(P.length);
  for (let v = 0; v < nf * 3; v++) {
    const f = v / 3 | 0; let x = 0, y = 0, z = 0;
    for (const g2 of map.get(keys[v])) {
      if (fu[f * 3] * fu[g2 * 3] + fu[f * 3 + 1] * fu[g2 * 3 + 1] + fu[f * 3 + 2] * fu[g2 * 3 + 2] < cos) continue;
      x += fn[g2 * 3]; y += fn[g2 * 3 + 1]; z += fn[g2 * 3 + 2];
    }
    const l = Math.hypot(x, y, z) || 1;
    N[v * 3] = x / l; N[v * 3 + 1] = y / l; N[v * 3 + 2] = z / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
}

const _c = new THREE.Color();
// Build a sliceable part mesh: smooth-shaded where rounded, vertex-coloured.
export function part(geo, color, mat = 'body', capKind = 'flesh') {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  smoothNormals(g, 52);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, MATS[mat]);
  m.castShadow = mat !== 'glow';
  m.userData.capKind = capKind;
  return m;
}

// --- clipping ---------------------------------------------------------------
function vert(P, N, C, i) {
  const a = i * 3;
  return [P[a], P[a + 1], P[a + 2], N[a], N[a + 1], N[a + 2], C[a], C[a + 1], C[a + 2]];
}
function lerpV(a, b, s) { const r = new Array(9); for (let i = 0; i < 9; i++) r[i] = a[i] + (b[i] - a[i]) * s; return r; }
function pushV(out, v) { out.p.push(v[0], v[1], v[2]); out.n.push(v[3], v[4], v[5]); out.c.push(v[6], v[7], v[8]); }
function fan(out, poly) { for (let i = 1; i + 1 < poly.length; i++) { pushV(out, poly[0]); pushV(out, poly[i]); pushV(out, poly[i + 1]); } }

const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _t = new THREE.Vector3();
function addCap(out, pts, n, col, facing) {
  // facing: +1 cap normal = +n, -1 cap normal = -n
  if (pts.length < 3) return;
  let cx = 0, cy = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= pts.length; cy /= pts.length; cz /= pts.length;
  _u.set(1, 0, 0); if (Math.abs(n.x) > 0.8) _u.set(0, 1, 0);
  _u.sub(_t.copy(n).multiplyScalar(_u.dot(n))).normalize();
  _v.crossVectors(n, _u);
  const sorted = pts.map(p => {
    const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
    return { p, a: Math.atan2(dx * _v.x + dy * _v.y + dz * _v.z, dx * _u.x + dy * _u.y + dz * _u.z) };
  }).sort((a, b) => a.a - b.a);
  const ring = [];
  for (const s of sorted) {
    const l = ring[ring.length - 1];
    if (l && Math.abs(l[0] - s.p[0]) + Math.abs(l[1] - s.p[1]) + Math.abs(l[2] - s.p[2]) < 1e-4) continue;
    ring.push(s.p);
  }
  if (ring.length > 2) { const f = ring[0], l = ring[ring.length - 1]; if (Math.abs(f[0] - l[0]) + Math.abs(f[1] - l[1]) + Math.abs(f[2] - l[2]) < 1e-4) ring.pop(); }
  if (ring.length < 3) return;
  const nx = n.x * facing, ny = n.y * facing, nz = n.z * facing, k = col.k, R = col.rim, I = col.inner;
  const V = (p, c, m = 1) => [p[0], p[1], p[2], nx, ny, nz, c.r * m, c.g * m, c.b * m];
  const inner = p => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k, cz + (p[2] - cz) * k];
  const centre = V([cx, cy, cz], I, 0.85);
  const tri = (a, b, c) => { if (facing > 0) { pushV(out, a); pushV(out, b); pushV(out, c); } else { pushV(out, a); pushV(out, c); pushV(out, b); } };
  for (let i = 0; i < ring.length; i++) {
    const p0 = ring[i], p1 = ring[(i + 1) % ring.length], q0 = inner(p0), q1 = inner(p1);
    tri(centre, V(q0, I), V(q1, I));                                   // inner disc
    tri(V(q0, R, 0.62), V(p0, R), V(p1, R)); tri(V(q0, R, 0.62), V(p1, R), V(q1, R, 0.62));   // rim, darker toward the middle
  }
}
function toGeo(o) {
  if (o.p.length < 9) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
  return g;
}

// Returns {front, back} geometries (null when that side is empty). front = side the plane normal points to.
export function clipGeo(geo, plane, capCol) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, C = geo.attributes.color.array;
  const F = { p: [], n: [], c: [] }, B = { p: [], n: [], c: [] }, cap = [];
  const nx = plane.normal.x, ny = plane.normal.y, nz = plane.normal.z, pc = plane.constant;
  const d = [0, 0, 0], vs = [null, null, null];
  const cnt = P.length / 3;
  for (let t = 0; t < cnt; t += 3) {
    let pos = 0, neg = 0;
    for (let k = 0; k < 3; k++) {
      const i = (t + k) * 3;
      let dd = P[i] * nx + P[i + 1] * ny + P[i + 2] * nz + pc;
      if (Math.abs(dd) < 1e-6) dd = 0;
      d[k] = dd; if (dd > 0) pos++; else if (dd < 0) neg++;
      vs[k] = vert(P, N, C, t + k);
    }
    if (neg === 0) { pushV(F, vs[0]); pushV(F, vs[1]); pushV(F, vs[2]); for (let k = 0; k < 3; k++) if (d[k] === 0) cap.push(vs[k]); continue; }
    if (pos === 0) { pushV(B, vs[0]); pushV(B, vs[1]); pushV(B, vs[2]); for (let k = 0; k < 3; k++) if (d[k] === 0) cap.push(vs[k]); continue; }
    const fp = [], bp = [];
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3, vk = vs[k];
      if (d[k] >= 0) fp.push(vk);
      if (d[k] <= 0) bp.push(vk);
      if (d[k] === 0) cap.push(vk);
      if ((d[k] > 0 && d[j] < 0) || (d[k] < 0 && d[j] > 0)) {
        const v = lerpV(vk, vs[j], d[k] / (d[k] - d[j]));
        fp.push(v); bp.push(v); cap.push(v);
      }
    }
    fan(F, fp); fan(B, bp);
  }
  if (F.p.length && B.p.length) {
    addCap(F, cap, plane.normal, capCol, -1);
    addCap(B, cap, plane.normal, capCol, 1);
  }
  return { front: toGeo(F), back: toGeo(B) };
}

// --- chunks -----------------------------------------------------------------
// A chunk is a Group of meshes whose geometry is expressed in the group's local space.
const _box = new THREE.Box3(), _ctr = new THREE.Vector3();
function makeChunk(items, refMatrixWorld) {
  _box.makeEmpty();
  for (const it of items) { it.geo.computeBoundingBox(); _box.union(it.geo.boundingBox); }
  _box.getCenter(_ctr);
  const grp = new THREE.Group();
  for (const it of items) {
    it.geo.translate(-_ctr.x, -_ctr.y, -_ctr.z);
    it.geo.computeBoundingSphere();
    const m = new THREE.Mesh(it.geo, it.mat);
    m.castShadow = it.mat !== MATS.glow;
    m.userData.capKind = it.cap;
    grp.add(m);
  }
  const size = _box.getSize(new THREE.Vector3());
  grp.userData.box = new THREE.Box3(size.clone().multiplyScalar(-0.5), size.clone().multiplyScalar(0.5));
  grp.userData.size = size.length();
  // place group so world positions are unchanged
  const mw = refMatrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(_ctr.x, _ctr.y, _ctr.z));
  mw.decompose(grp.position, grp.quaternion, grp.scale);
  return grp;
}

// Build a chunk from world-space items [{geo, mat, cap}].
export const chunkFrom = items => makeChunk(items, new THREE.Matrix4());

// Bake an animated object hierarchy into a single world-space chunk.
export function bakeToChunk(root) {
  root.updateMatrixWorld(true);
  const items = [];
  root.traverse(o => {
    if (o.isMesh && o.visible && !o.userData.noSlice) items.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld), mat: o.material, cap: o.userData.capKind });
  });
  return makeChunk(items, new THREE.Matrix4());
}

const _inv = new THREE.Matrix4();
// Slice a chunk by a world plane. Returns [front, back] new chunks, or null if the plane misses.
export function sliceChunk(chunk, worldPlane) {
  chunk.updateMatrixWorld(true);
  _inv.copy(chunk.matrixWorld).invert();
  const lp = worldPlane.clone().applyMatrix4(_inv);
  const fr = [], bk = [];
  for (const m of chunk.children) {
    const r = clipGeo(m.geometry, lp, capColor(m.userData.capKind));
    if (r.front) fr.push({ geo: r.front, mat: m.material, cap: m.userData.capKind });
    if (r.back) bk.push({ geo: r.back, mat: m.material, cap: m.userData.capKind });
  }
  if (!fr.length || !bk.length) { for (const it of fr.concat(bk)) it.geo.dispose(); return null; }
  // drop slivers: a side that is almost empty counts as a miss
  const vol = items => { _box.makeEmpty(); for (const it of items) { it.geo.computeBoundingBox(); _box.union(it.geo.boundingBox); } const s = _box.getSize(_ctr); return s.x * s.y * s.z + 1e-9; };
  const whole = chunk.userData.box.getSize(new THREE.Vector3());
  const wv = whole.x * whole.y * whole.z + 1e-9;
  if (vol(fr) < wv * 0.004 || vol(bk) < wv * 0.004) { for (const it of fr.concat(bk)) it.geo.dispose(); return null; }
  return [makeChunk(fr, chunk.matrixWorld), makeChunk(bk, chunk.matrixWorld)];
}

export function disposeChunk(c) { for (const m of c.children) m.geometry.dispose(); }

// --- draw-call batching for living characters --------------------------------
// Parts stay separate so slicing keeps clean convex caps, but rendering ~40 meshes per enemy is slow.
// batchParts merges each pivot's direct mesh children (per material) into one proxy for drawing and
// hides the originals; unbatchParts restores them right before the body becomes a ragdoll.
export function batchParts(root) {
  const groups = [];
  root.traverse(o => {
    if (o.isMesh) return;
    const by = new Map();
    for (const m of o.children) if (m.isMesh && !m.isSkinnedMesh && m.visible && !m.userData.proxy) { let a = by.get(m.material); if (!a) by.set(m.material, a = []); a.push(m); }
    for (const [mat, ms] of by) if (ms.length > 1) groups.push({ o, mat, ms });
  });
  for (const { o, mat, ms } of groups) {
    let n = 0; for (const m of ms) n += m.geometry.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), _n = new THREE.Matrix3(), v = new THREE.Vector3();
    let k = 0;
    for (const m of ms) {
      m.updateMatrix(); _n.getNormalMatrix(m.matrix);
      const g = m.geometry.attributes, cnt = g.position.count;
      for (let i = 0; i < cnt; i++, k += 3) {
        v.fromBufferAttribute(g.position, i).applyMatrix4(m.matrix); P[k] = v.x; P[k + 1] = v.y; P[k + 2] = v.z;
        v.fromBufferAttribute(g.normal, i).applyMatrix3(_n).normalize(); N[k] = v.x; N[k + 1] = v.y; N[k + 2] = v.z;
        C[k] = g.color.getX(i); C[k + 1] = g.color.getY(i); C[k + 2] = g.color.getZ(i);
      }
      m.visible = false; m.userData.batched = true;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.computeBoundingSphere();
    const proxy = new THREE.Mesh(geo, mat);
    proxy.castShadow = mat !== MATS.glow; proxy.userData.proxy = true; proxy.userData.noSlice = true;
    o.add(proxy);
  }
  return root;
}
export function unbatchParts(root) {
  const proxies = [];
  root.traverse(o => { if (o.userData.batched) { o.visible = true; o.userData.batched = false; } else if (o.userData.proxy) proxies.push(o); });
  for (const p of proxies) p.parent.remove(p);   // geometry is shared with the template, so it is not disposed
}
