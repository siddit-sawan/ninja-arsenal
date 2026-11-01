// Cloth tails (the hero's headband and obi knot): a chain of points hanging from a pivot, simulated in world space.
// Gravity pulls them down and still air drags on them, so they stream out behind as the hero runs, flutter at
// speed, swing through turns and flips, and settle back when he stops. Each step follows the leader from the
// knot (fixed spacing), is pushed out of the head and back, and the chain is drawn as a flat, tapering strip.
import * as THREE from 'three';

const GRAV = 18, _d = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _a = new THREE.Vector3();

export class ClothTail {
  constructor(scene, { len, width, color, mat, segs = 8, drag = 1.5, follow = 7, taper = 0.55, flutter = 1 }) {
    this.n = segs + 1; this.seg = len / segs; this.width = width; this.taper = taper; this.drag = drag; this.flutter = flutter; this.follow = follow; this.av = new THREE.Vector3();
    this.p = Array.from({ length: this.n }, () => new THREE.Vector3());
    this.v = Array.from({ length: this.n }, () => new THREE.Vector3());
    this.x = Array.from({ length: this.n }, () => new THREE.Vector3()); this.d = Array.from({ length: this.n }, () => new THREE.Vector3());
    this.prevAnchor = new THREE.Vector3(); this.ready = false; this.scene = scene;
    const geo = new THREE.BufferGeometry(), V = this.n * 2;
    this.pos = new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.nrm = new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const col = new Float32Array(V * 3); for (let i = 0; i < V; i++) col.set([color.r, color.g, color.b], i * 3);
    const idx = []; for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setAttribute('position', this.pos); geo.setAttribute('normal', this.nrm); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    scene.add(this.mesh);
  }
  // hang straight down from the anchor (first frame, or after a teleport)
  reset(anchor, down) {
    for (let i = 0; i < this.n; i++) { this.p[i].copy(anchor).addScaledVector(down, this.seg * i); this.v[i].set(0, 0, 0); }
    this.prevAnchor.copy(anchor); this.ready = true;
  }
  // anchor: the knot in world space; side: the strip's width axis (the head's right); back: where the tails hang
  // when nothing moves; spheres: what to stay out of, [{ c, r }] or { out(p) } pushing a world point out; t: time
  update(dt, anchor, side, back, spheres, t) {
    if (!this.ready || this.prevAnchor.distanceToSquared(anchor) > 4) this.reset(anchor, _d.copy(back).multiplyScalar(0.3).add(_a.set(0, -1, 0)).normalize());
    if (dt > 0) {
      const steps = Math.min(4, Math.max(1, Math.ceil(dt * 90))), h = dt / steps, damp = Math.exp(-this.drag * h), fol = Math.exp(-this.follow * h);
      this.av.subVectors(anchor, this.prevAnchor).divideScalar(dt);   // how the knot is moving
      for (let s = 1; s <= steps; s++) {
        this.p[0].lerpVectors(this.prevAnchor, anchor, s / steps);
        // predict: gravity, a faint flutter, swinging relative to the head damped away, a slight trail in still air
        for (let i = 1; i < this.n; i++) {
          const v = this.v[i], f = Math.sin(t * 15 - i * 1.1) * Math.min(this.av.length(), 4) * 0.2 * this.flutter * (i / this.n);
          v.y -= GRAV * h; v.addScaledVector(side, f * h);
          v.sub(this.av).multiplyScalar(fol).add(this.av).multiplyScalar(damp);
          this.x[i].copy(this.p[i]).addScaledVector(v, h);
        }
        this.x[0].copy(this.p[0]);
        // follow the leader: each node is put back at its spacing from the one above (and out of the head and back)
        for (let i = 1; i < this.n; i++) {
          const x = this.x[i]; _a.copy(x);
          _d.subVectors(x, this.x[i - 1]); const L = _d.length() || 1e-6; x.copy(this.x[i - 1]).addScaledVector(_d, this.seg / L);
          for (const S of spheres) { if (S.out) { S.out(x); continue; } _d.subVectors(x, S.c); const r = _d.length(); if (r < S.r) x.addScaledVector(_d, (S.r - r) / (r || 1e-6)); }
          this.d[i].subVectors(x, _a);
        }
        // velocities from the move, minus most of the shove the node below took (dynamic follow-the-leader): without
        // that the corrections pile up as speed and the tip whips about
        for (let i = 1; i < this.n; i++) {
          this.v[i].subVectors(this.x[i], this.p[i]).divideScalar(h);
          if (i + 1 < this.n) this.v[i].addScaledVector(this.d[i + 1], -0.9 / h);
          this.p[i].copy(this.x[i]);
        }
      }
      this.prevAnchor.copy(anchor);
    }
    // the strip: two vertices per node, the width turned to stay across the strip and tapering to the tip
    for (let i = 0; i < this.n; i++) {
      const a = this.p[Math.max(0, i - 1)], b = this.p[Math.min(this.n - 1, i + 1)];
      _d.subVectors(b, a).normalize(); _s.copy(side).addScaledVector(_d, -side.dot(_d)).normalize();
      _n.crossVectors(_d, _s).normalize();
      const w = this.width * 0.5 * (1 - this.taper * i / (this.n - 1)), p = this.p[i];
      this.pos.setXYZ(i * 2, p.x - _s.x * w, p.y - _s.y * w, p.z - _s.z * w); this.pos.setXYZ(i * 2 + 1, p.x + _s.x * w, p.y + _s.y * w, p.z + _s.z * w);
      this.nrm.setXYZ(i * 2, _n.x, _n.y, _n.z); this.nrm.setXYZ(i * 2 + 1, _n.x, _n.y, _n.z);
    }
    this.pos.needsUpdate = this.nrm.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}
