// Physics for the dead: articulated verlet ragdolls that stay on the ground and can be cut again and again,
// plus rigid chunks (severed pieces, dropped weapons) with real contact so they topple and lie flat.
import * as THREE from 'three';
import { clipGeo, capColor, sliceChunk, disposeChunk, chunkFrom, MATS, unbatchParts } from './slicer.js';
import { bakeBody } from './body.js';

const V3 = THREE.Vector3;
const G = 19, H = 1 / 120, ITERS = 8;
const rnd = (a, b) => a + Math.random() * (b - a);
const _a = new V3(), _b = new V3(), _c = new V3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _inv = new THREE.Matrix4(), _s = new V3(1, 1, 1);
const UP = new V3(0, 1, 0);

class Pt {
  constructor(p, r, w) { this.p = p.clone(); this.o = p.clone(); this.r = r; this.w = w; }
  vel(out) { return out.subVectors(this.p, this.o).divideScalar(H); }
  setVel(v) { this.o.copy(this.p).addScaledVector(v, -H); }
}
// a bone carries an orientation frame (q) so meshes can ride on it; `ref` (two points) fixes its twist
function bone(a, b, ref = null) {
  const c = { a, b, len: a.p.distanceTo(b.p), q: new THREE.Quaternion(), dir: new V3().subVectors(b.p, a.p).normalize(), ref, carry: false };
  c.q.setFromUnitVectors(UP, c.dir); orient(c);
  return c;
}
const limit = (a, b, min) => ({ a, b, min, limit: true });
function orient(c) {
  const d = _a.subVectors(c.b.p, c.a.p), L = d.length();
  if (L < 1e-5) return;
  d.divideScalar(L);
  if (c.ref) {
    const r = _b.subVectors(c.ref[1].p, c.ref[0].p); r.addScaledVector(d, -r.dot(d));
    if (r.lengthSq() > 1e-6) { r.normalize(); c.q.setFromRotationMatrix(_m.makeBasis(r, d, _c.crossVectors(r, d))); c.dir.copy(d); return; }
  }
  _q.setFromUnitVectors(c.dir, d); c.q.premultiply(_q).normalize(); c.dir.copy(d);   // parallel transport
}
const boneMatrix = c => _m.compose(c.a.p, c.q, _s);

function concat(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.array.length;
  const P = new Float32Array(n), N = new Float32Array(n), C = new Float32Array(n); let o = 0;
  for (const g of geos) { P.set(g.attributes.position.array, o); N.set(g.attributes.normal.array, o); C.set(g.attributes.color.array, o); o += g.attributes.position.array.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return g;
}

export function makePhysics(scene, fx, sfx, W) {   // W.bodyR: the radius bodies are kept inside
  const S = { dolls: [], rigids: [], bleed: [] };
  let thudCD = 0;

  // ------------------------------------------------------------------ ragdoll
  function newDoll(pts, cons, parts) {
    const d = { isDoll: true, pts, cons, parts, group: new THREE.Group(), asleep: false, still: 0, merged: null, age: 0, stroke: -1, cuts: 0, pooled: false, sink: 0 };
    for (const p of parts) d.group.add(p.mesh);
    scene.add(d.group); S.dolls.push(d);
    placeParts(d);
    return d;
  }
  function placeParts(d) { for (const p of d.parts) { p.mesh.position.copy(p.bone.a.p); p.mesh.quaternion.copy(p.bone.q); } }

  // Build a ragdoll from a posed enemy hierarchy (named pivots). Weapons held in the hands drop as rigid chunks.
  S.fromEnemy = (root, vel) => {
    unbatchParts(root);   // back to separate convex parts so cuts get clean caps
    root.updateMatrixWorld(true);
    if (!root.getObjectByName('hips')) return [S.addRigid(bakeRoot(root), vel.clone(), new V3())];
    const s = root.scale.x;
    const W = (n, x = 0, y = 0, z = 0) => root.getObjectByName(n).localToWorld(new V3(x, y, z));
    const P = (v, r, w = 1) => new Pt(v, r * s, w);
    const L = root.userData.rig || { chest: 0.4, head: 0.27, foot: -0.44 };   // landmark offsets from the pivots
    const J = {
      pel: P(W('hips'), 0.12, 0.5), chest: P(W('torso', 0, L.chest, 0), 0.13, 0.5), neck: P(W('head'), 0.07), head: P(W('head', 0, L.head, 0.03), 0.115, 0.8),
      shL: P(W('armL'), 0.07), elL: P(W('elbowL'), 0.05), haL: P(W('handL'), 0.045), shR: P(W('armR'), 0.07), elR: P(W('elbowR'), 0.05), haR: P(W('handR'), 0.045),
      hpL: P(W('legL'), 0.08), knL: P(W('kneeL'), 0.06), ftL: P(W('kneeL', 0, L.foot, 0.05), 0.05), hpR: P(W('legR'), 0.08), knR: P(W('kneeR'), 0.06), ftR: P(W('kneeR', 0, L.foot, 0.05), 0.05),
    };
    const sh = [J.shL, J.shR];
    const cons = [], B = (a, b, ref) => { const c = bone(a, b, ref); cons.push(c); return c; };
    const bones = {
      spine: B(J.pel, J.chest, sh), neck: B(J.chest, J.neck, sh), head: B(J.neck, J.head, sh),
      uaL: B(J.shL, J.elL), faL: B(J.elL, J.haL), uaR: B(J.shR, J.elR), faR: B(J.elR, J.haR),
      thL: B(J.hpL, J.knL), shinL: B(J.knL, J.ftL), thR: B(J.hpR, J.knR), shinR: B(J.knR, J.ftR),
    };
    // torso cage and joint ties (also usable as anchors for severed torso pieces)
    for (const [a, b] of [['chest', 'shL'], ['chest', 'shR'], ['pel', 'hpL'], ['pel', 'hpR'], ['shL', 'shR'], ['hpL', 'hpR'], ['shL', 'hpL'], ['shR', 'hpR'],
      ['shL', 'pel'], ['shR', 'pel'], ['hpL', 'chest'], ['hpR', 'chest'], ['neck', 'shL'], ['neck', 'shR'], ['head', 'chest'], ['head', 'shL'], ['head', 'shR']]) B(J[a], J[b]);
    // joint limits: elbows and knees can't fold flat, so limbs stay believable
    cons.push(limit(J.shL, J.haL, (bones.uaL.len + bones.faL.len) * 0.55), limit(J.shR, J.haR, (bones.uaR.len + bones.faR.len) * 0.55));
    cons.push(limit(J.hpL, J.ftL, (bones.thL.len + bones.shinL.len) * 0.6), limit(J.hpR, J.ftR, (bones.thR.len + bones.shinR.len) * 0.6));
    cons.push(limit(J.ftL, J.ftR, 0.12 * s), limit(J.knL, J.knR, 0.1 * s), limit(J.haL, J.chest, 0.12 * s), limit(J.haR, J.chest, 0.12 * s));
    const MAP = { hips: bones.spine, torso: bones.spine, head: bones.head, armL: bones.uaL, elbowL: bones.faL, armR: bones.uaR, elbowR: bones.faR, legL: bones.thL, kneeL: bones.shinL, legR: bones.thR, kneeR: bones.shinR };
    const parts = [], dropped = { handL: [], handR: [] };
    for (const b of bakeBody(root)) parts.push(mkPart(b.geo, MATS.body, b.cap, MAP[b.key] || bones.spine));   // realistic skin -> rigid pieces
    root.traverse(o => {
      if (!o.isMesh || !o.visible || o.userData.noSlice) return;
      let p = o.parent, key = null;
      while (p && p !== root) { if (p.name === 'handL' || p.name === 'handR') { key = p.name; break; } if (MAP[p.name]) { key = p.name; break; } p = p.parent; }
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (key === 'handL' || key === 'handR') { dropped[key].push({ geo, mat: o.material, cap: o.userData.capKind }); return; }
      const b = MAP[key] || bones.spine;
      parts.push(mkPart(geo, o.material, o.userData.capKind, b));
    });
    const pts = Object.values(J);
    for (const pt of pts) pt.setVel(vel);
    const out = [newDoll(pts, cons, parts)];
    out[0].scale = s;
    for (const k of ['handL', 'handR']) if (dropped[k].length) out.push(S.addRigid(chunkFrom(dropped[k]), vel.clone().add(new V3(rnd(-1.5, 1.5), rnd(1, 3), rnd(-1.5, 1.5))), new V3().randomDirection().multiplyScalar(rnd(4, 9))));
    return out;
  };
  function mkPart(worldGeo, mat, cap, b) {
    worldGeo.applyMatrix4(_inv.copy(boneMatrix(b)).invert());
    worldGeo.computeBoundingSphere();
    const mesh = new THREE.Mesh(worldGeo, mat);
    mesh.castShadow = mat !== MATS.glow; mesh.receiveShadow = true;
    mesh.userData.capKind = cap;
    b.carry = true;
    return { mesh, bone: b };
  }
  function bakeRoot(root) {
    const items = [];
    root.traverse(o => { if (o.isMesh && o.visible) items.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld), mat: o.material, cap: o.userData.capKind }); });
    return chunkFrom(items);
  }

  function stepDoll(d) {
    let move = 0;
    for (const pt of d.pts) {
      const vx = (pt.p.x - pt.o.x) * 0.996, vy = (pt.p.y - pt.o.y) * 0.996, vz = (pt.p.z - pt.o.z) * 0.996;
      pt.o.copy(pt.p);
      pt.p.x += vx; pt.p.y += vy - G * H * H; pt.p.z += vz;
      move = Math.max(move, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
    }
    for (let it = 0; it < ITERS; it++) {
      for (const c of d.cons) {
        const a = c.a, b = c.b;
        const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        let target;
        if (c.limit) { if (L >= c.min) continue; target = c.min; } else target = c.len;
        const k = (L - target) / L / (a.w + b.w);
        a.p.x += dx * k * a.w; a.p.y += dy * k * a.w; a.p.z += dz * k * a.w;
        b.p.x -= dx * k * b.w; b.p.y -= dy * k * b.w; b.p.z -= dz * k * b.w;
      }
      for (const pt of d.pts) if (pt.p.y < pt.r) pt.p.y = pt.r;
    }
    for (const pt of d.pts) {
      if (pt.p.y <= pt.r + 1e-3) {            // ground friction + kill bounce
        const vy = pt.p.y - pt.o.y;
        if (vy < -0.05 && thudCD <= 0 && pt.w <= 0.5) { sfx.thud(Math.min(1, -vy * 8)); thudCD = 0.12; }
        pt.o.x = pt.p.x - (pt.p.x - pt.o.x) * 0.55; pt.o.z = pt.p.z - (pt.p.z - pt.o.z) * 0.55;
        if (pt.o.y < pt.p.y) pt.o.y = pt.p.y;
      }
      const r = Math.hypot(pt.p.x, pt.p.z), R = W.explore ? 1e9 : W.bodyR + 0.6;
      if (r > R) { pt.p.x *= R / r; pt.p.z *= R / r; }
    }
    return move;
  }
  function merge(d) {
    const by = new Map();
    for (const p of d.parts) {
      p.mesh.updateMatrixWorld();
      const g = p.mesh.geometry.clone().applyMatrix4(p.mesh.matrixWorld);
      if (!by.has(p.mesh.material)) by.set(p.mesh.material, []);
      by.get(p.mesh.material).push(g);
      p.mesh.visible = false;
    }
    d.merged = [];
    for (const [mat, geos] of by) {
      const m = new THREE.Mesh(concat(geos), mat); m.castShadow = mat !== MATS.glow; m.receiveShadow = true;
      geos.forEach(g => g.dispose());
      d.group.add(m); d.merged.push(m);
    }
  }
  function unmerge(d) {
    if (d.merged) { for (const m of d.merged) { d.group.remove(m); m.geometry.dispose(); } d.merged = null; }
    for (const p of d.parts) p.mesh.visible = true;
    d.group.position.y = 0;
    d.asleep = false; d.still = 0;
  }
  function removeDoll(d) {
    scene.remove(d.group);
    for (const p of d.parts) p.mesh.geometry.dispose();
    if (d.merged) for (const m of d.merged) m.geometry.dispose();
    S.dolls.splice(S.dolls.indexOf(d), 1);
    S.bleed = S.bleed.filter(b => !d.pts.includes(b.pt));
  }

  function cutDoll(d, plane, push, sid) {
    if (d.merged) unmerge(d);
    for (const p of d.parts) p.mesh.updateMatrixWorld();
    const side = new Map();
    for (const pt of d.pts) side.set(pt, plane.distanceToPoint(pt.p) >= 0 ? 1 : -1);
    // 1) clip every mesh in its own space
    const pieces = []; let meshCut = false;
    for (const pr of d.parts) {
      const lp = plane.clone().applyMatrix4(_inv.copy(pr.mesh.matrixWorld).invert());
      const r = clipGeo(pr.mesh.geometry, lp, capColor(pr.mesh.userData.capKind));
      if (r.front && r.back) { meshCut = true; pieces.push({ geo: r.front, side: 1, src: pr }, { geo: r.back, side: -1, src: pr }); }
      else { (r.front || r.back).dispose(); pieces.push({ geo: pr.mesh.geometry, side: r.front ? 1 : -1, src: pr, whole: true }); }
    }
    // 2) sever every connection crossing the plane; carrying bones leave a stump on each side
    const cons = [], repl = new Map(), stumps = [];
    let severed = false;
    for (const c of d.cons) {
      const sa = side.get(c.a), sb = side.get(c.b);
      if (sa === sb) { cons.push(c); continue; }
      severed = true;
      if (c.limit || !c.carry) continue;
      const da = plane.distanceToPoint(c.a.p), db = plane.distanceToPoint(c.b.p), t = da / (da - db);
      const x = _a.copy(c.a.p).lerp(c.b.p, t), xo = _b.copy(c.a.o).lerp(c.b.o, t);
      const ka = new Pt(x, Math.min(c.a.r, c.b.r) * 0.8, 1), kb = new Pt(x, Math.min(c.a.r, c.b.r) * 0.8, 1);
      ka.o.copy(xo); kb.o.copy(xo);
      side.set(ka, sa); side.set(kb, sb);
      const A = Object.assign(bone(c.a, ka), { q: c.q.clone(), carry: true }), Bn = Object.assign(bone(c.b, kb), { q: c.q.clone(), carry: true });
      A.dir.subVectors(ka.p, c.a.p).normalize(); Bn.dir.subVectors(kb.p, c.b.p).normalize();
      if (A.len > 1e-3) cons.push(A); if (Bn.len > 1e-3) cons.push(Bn);
      repl.set(c, { [sa]: A, [sb]: Bn });
      stumps.push({ pt: ka, from: c.a }, { pt: kb, from: c.b });
    }
    if (!meshCut && !severed) { return null; }
    const allPts = [...d.pts, ...stumps.map(s => s.pt)];
    // 3) re-attach every piece to a bone on its own side (or let it fall free)
    const newParts = [], free = { 1: [], '-1': [] };
    const sideBones = s => cons.filter(c => !c.limit && side.get(c.a) === s && side.get(c.b) === s && c.len > 1e-3);
    for (const pc of pieces) {
      const ob = pc.src.bone;
      let b = null;
      if (cons.includes(ob) && side.get(ob.a) === pc.side) b = ob;
      else if (repl.has(ob)) b = repl.get(ob)[pc.side];
      if (b && pc.whole && b === ob) { newParts.push(pc.src); continue; }
      const geo = pc.geo;
      geo.applyMatrix4(pc.src.mesh.matrixWorld);
      if (!b) {
        geo.computeBoundingSphere();
        const ctr = geo.boundingSphere.center; let best = 0.35 * (d.scale || 1) + geo.boundingSphere.radius * 0.5;
        for (const c of sideBones(pc.side)) {
          const ab = _c.subVectors(c.b.p, c.a.p), t = Math.max(0, Math.min(1, _a.subVectors(ctr, c.a.p).dot(ab) / (ab.lengthSq() || 1)));
          const dist = _b.copy(c.a.p).addScaledVector(ab, t).distanceTo(ctr);
          if (dist < best) { best = dist; b = c; }
        }
      }
      if (b) newParts.push(mkPart(geo, pc.src.mesh.material, pc.src.mesh.userData.capKind, b));
      else free[pc.side].push({ geo, mat: pc.src.mesh.material, cap: pc.src.mesh.userData.capKind });
    }
    for (const pr of d.parts) if (pieces.some(pc => !pc.whole && pc.src === pr)) pr.mesh.geometry.dispose();   // replaced by its two halves
    // 4) split into connected components
    const par = new Map(); const find = x => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    for (const pt of allPts) par.set(pt, pt);
    for (const c of cons) par.set(find(c.a), find(c.b));
    const comps = new Map();
    const comp = r => { if (!comps.has(r)) comps.set(r, { pts: [], cons: [], parts: [] }); return comps.get(r); };
    for (const pt of allPts) comp(find(pt)).pts.push(pt);
    for (const c of cons) comp(find(c.a)).cons.push(c);
    for (const p of newParts) comp(find(p.bone.a)).parts.push(p);
    // remove the old doll's scene graph (meshes are re-parented into the new dolls)
    scene.remove(d.group); S.dolls.splice(S.dolls.indexOf(d), 1);
    if (d.merged) for (const m of d.merged) m.geometry.dispose();
    const out = [];
    const v = new V3();
    for (const cmp of comps.values()) {
      if (!cmp.parts.length) continue;
      const s = side.get(cmp.pts[0]);
      for (const pt of cmp.pts) { pt.vel(v); v.addScaledVector(plane.normal, s * rnd(1.2, 2.2)).addScaledVector(push, rnd(1.2, 2.6)); v.y += rnd(0.8, 2.2); pt.setVel(v); }
      const nd = newDoll(cmp.pts, cmp.cons, cmp.parts);
      nd.stroke = sid; nd.cuts = d.cuts + 1; nd.scale = d.scale;
      out.push(nd);
    }
    for (const sd of [1, -1]) if (free[sd].length) {
      const g = chunkFrom(free[sd]);
      out.push(S.addRigid(g, plane.normal.clone().multiplyScalar(sd * rnd(1.5, 3)).addScaledVector(push, rnd(1.5, 3)).add(new V3(0, rnd(1.5, 3), 0)), new V3().randomDirection().multiplyScalar(rnd(3, 8)), sid));
    }
    for (const st of stumps) if (out.some(o => o.isDoll && o.pts.includes(st.pt))) S.bleed.push({ pt: st.pt, from: st.from, t: rnd(1.4, 2.2) });
    return out;
  }

  // ------------------------------------------------------------------ rigid chunks
  S.addRigid = (group, vel, ang, sid = -1) => {
    const sup = [], verts = [];
    for (const m of group.children) { const P = m.geometry.attributes.position.array; for (let i = 0; i < P.length; i += 3) verts.push(P[i], P[i + 1], P[i + 2]); }
    const dirs = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) dirs.push(new V3(x, y, z).normalize());
    for (const dv of dirs) {
      let best = -1e9, bi = 0;
      for (let i = 0; i < verts.length; i += 3) { const dd = verts[i] * dv.x + verts[i + 1] * dv.y + verts[i + 2] * dv.z; if (dd > best) { best = dd; bi = i; } }
      if (!sup.some(s => s.x === verts[bi] && s.y === verts[bi + 1] && s.z === verts[bi + 2])) sup.push(new V3(verts[bi], verts[bi + 1], verts[bi + 2]));
    }
    const size = group.userData.box.getSize(new V3());
    const R = Math.max(0.05, size.length() * 0.38);
    const b = { isDoll: false, group, v: vel, w: ang, sup, I: 0.4 * R * R, asleep: false, still: 0, age: 0, stroke: sid, cuts: 0, sink: 0, landed: false };
    for (const m of group.children) { m.castShadow = m.material !== MATS.glow; m.receiveShadow = true; }
    scene.add(group); S.rigids.push(b);
    return b;
  };
  const _r = new V3(), _vp = new V3(), _pw = new V3(), _t = new V3();
  function stepRigid(b, dt) {
    const g = b.group;
    b.v.y -= G * dt;
    g.position.addScaledVector(b.v, dt);
    const wl = b.w.length();
    if (wl > 1e-4) g.quaternion.premultiply(_q.setFromAxisAngle(_t.copy(b.w).divideScalar(wl), wl * dt)).normalize();
    g.updateMatrixWorld();
    let minY = 0, touching = false;
    for (const s of b.sup) {
      _pw.copy(s).applyMatrix4(g.matrixWorld);
      if (_pw.y >= 0) continue;
      touching = true; minY = Math.min(minY, _pw.y);
      _r.subVectors(_pw, g.position);
      _vp.copy(b.w).cross(_r).add(b.v);
      if (_vp.y >= 0) continue;
      if (_vp.y < -2.5 && !b.landed) { b.landed = true; fx.splat(_pw.x, _pw.z, Math.min(0.5, b.I * 2 + 0.15)); if (thudCD <= 0) { sfx.thud(Math.min(1, -_vp.y / 8)); thudCD = 0.1; } }
      const rn = _t.set(_r.z, 0, -_r.x);               // r × up
      const j = -(1 + 0.15) * _vp.y / (1 + rn.lengthSq() / b.I);
      b.v.y += j; b.w.addScaledVector(rn, j / b.I);
      // friction
      _vp.copy(b.w).cross(_r).add(b.v); _vp.y = 0;
      const vt = _vp.length();
      if (vt > 1e-4) {
        const jt = Math.min(vt / (1 + _r.lengthSq() / b.I), 0.6 * j);
        _vp.divideScalar(-vt);
        b.v.addScaledVector(_vp, jt); b.w.addScaledVector(_t.copy(_r).cross(_vp), jt / b.I);
      }
    }
    if (minY < 0) g.position.y -= minY;
    if (touching) b.w.multiplyScalar(0.985);
    const r = Math.hypot(g.position.x, g.position.z), Rw = W.explore ? 1e9 : W.bodyR + 0.6;
    if (r > Rw) { g.position.x *= Rw / r; g.position.z *= Rw / r; b.v.x *= -0.3; b.v.z *= -0.3; }
    if (touching && b.v.lengthSq() < 0.02 && b.w.lengthSq() < 0.05) { b.still += dt; if (b.still > 0.4) b.asleep = true; } else b.still = 0;
  }
  function removeRigid(b) { scene.remove(b.group); disposeChunk(b.group); S.rigids.splice(S.rigids.indexOf(b), 1); }
  function cutRigid(b, plane, push, sid) {
    const res = sliceChunk(b.group, plane);
    if (!res) return null;
    removeRigid(b);
    return res.map((g, i) => {
      const sd = i === 0 ? 1 : -1;
      const v = b.v.clone().multiplyScalar(0.5).addScaledVector(plane.normal, sd * rnd(1, 2.2)).addScaledVector(push, rnd(1, 2.5)).add(new V3(0, rnd(1, 2.5), 0));
      const nb = S.addRigid(g, v, new V3().randomDirection().multiplyScalar(rnd(3, 8)), sid);
      nb.cuts = b.cuts + 1;
      return nb;
    });
  }

  // ------------------------------------------------------------------ public
  S.cut = (b, plane, push, sid) => {
    const out = b.isDoll ? cutDoll(b, plane, push, sid) : cutRigid(b, plane, push, sid);
    if (out) for (const o of out) { o.stroke = sid; }
    return out;
  };
  S.all = () => [...S.dolls, ...S.rigids];
  const _bx = new THREE.Box3();
  S.bounds = (b) => {
    _bx.makeEmpty();
    if (b.isDoll) { for (const pt of b.pts) { _bx.expandByPoint(_a.copy(pt.p).addScalar(-pt.r * 1.3)); _bx.expandByPoint(_a.copy(pt.p).addScalar(pt.r * 1.3)); } if (b.merged || b.group.position.y) _bx.translate(_a.set(0, b.group.position.y, 0)); }
    else { b.group.updateMatrixWorld(); for (const s of b.sup) _bx.expandByPoint(_a.copy(s).applyMatrix4(b.group.matrixWorld)); }
    return _bx;
  };
  S.center = b => b.isDoll ? b.pts[0].p.clone() : b.group.position.clone();
  S.airborne = b => b.isDoll ? b.pts.every(p => p.p.y > p.r + 0.25) : b.group.position.y > 0.6 && !b.landed;
  S.clear = () => {
    for (const d of S.dolls.slice()) removeDoll(d);
    for (const b of S.rigids.slice()) removeRigid(b);
    S.bleed = [];
  };
  let acc = 0;
  const MAX_DOLLS = 34, MAX_RIGIDS = 60;
  S.update = (dt) => {
    thudCD -= dt;
    acc = Math.min(acc + dt, H * 4);   // under ~30 fps let ragdolls run slow rather than pile up substeps (spiral of lag)
    const awake = S.dolls.filter(d => !d.asleep);
    let steps = 0;
    const moves = new Map();
    while (acc >= H) { acc -= H; steps++; for (const d of awake) moves.set(d, Math.max(moves.get(d) || 0, stepDoll(d))); }
    for (const d of S.dolls.slice()) {
      d.age += dt;
      if (d.sink > 0) { d.sink += dt * (d.poof ? 4 : 1); d.group.position.y = -d.sink * 0.35; if (d.sink > 2.2) { removeDoll(d); } continue; }
      if (d.asleep) continue;
      for (const c of d.cons) if (!c.limit && c.carry) orient(c);
      placeParts(d);
      if (steps && (moves.get(d) || 0) < 0.0012) { d.still += dt; if (d.still > 0.6) {
        d.asleep = true; merge(d);
        if (!d.pooled) { d.pooled = true; const c = d.pts.reduce((s, p) => s.add(p.p), new V3()).divideScalar(d.pts.length); fx.splat(c.x, c.z, Math.min(0.95, 0.25 + d.parts.length * 0.04)); }
      } } else d.still = 0;
    }
    for (const b of S.rigids.slice()) {
      b.age += dt;
      if (b.sink > 0) { b.sink += dt * (b.poof ? 4 : 1); b.group.position.y -= dt * 0.35 * (b.poof ? 4 : 1); if (b.sink > 2.2) removeRigid(b); continue; }
      if (!b.asleep) stepRigid(b, dt);
    }
    // severed stumps keep pumping for a moment
    for (const bl of S.bleed.slice()) {
      bl.t -= dt;
      if (bl.t <= 0) { S.bleed.splice(S.bleed.indexOf(bl), 1); continue; }
      if (Math.random() < dt * 26 * Math.min(1, bl.t)) fx.spray(bl.pt.p, _a.subVectors(bl.pt.p, bl.from.p).normalize(), 1, 1.2 + bl.t);
    }
    // keep the battlefield readable: the oldest bodies sink away, but only once they have settled on the ground
    const sinkOld = (list, max) => { const live = list.filter(x => !x.sink); if (live.length <= max) return; const ok = live.filter(x => x.asleep || x.age > 8).sort((a, b) => b.age - a.age); for (const x of ok.slice(0, live.length - max)) { if (x.isDoll && !x.asleep) { x.asleep = true; merge(x); } x.sink = 0.001; } };
    sinkOld(S.dolls, MAX_DOLLS); sinkOld(S.rigids, MAX_RIGIDS);
    // family mode (Blood off): nothing lies around - once a body has settled it vanishes in a puff of ink smoke
    if (!fx.blood) for (const x of [...S.dolls, ...S.rigids]) {
      if (x.sink || x.age < 2.5 || !(x.asleep || x.age > 5)) continue;
      if (x.isDoll && !x.asleep) { x.asleep = true; merge(x); }
      const c = x.isDoll ? x.pts.reduce((s, p) => s.add(p.p), new V3()).divideScalar(x.pts.length) : x.group.position;
      fx.dust(c, 10, 0.7); x.sink = 0.001; x.poof = true;
    }
  };
  // wake a sleeping body (e.g. when stepped on or hit)
  S.wake = b => { if (b.isDoll && b.asleep) unmerge(b); else if (!b.isDoll) { b.asleep = false; b.still = 0; } };
  return S;
}
