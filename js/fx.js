// Pooled particle effects: blood/ink droplets, ground splats, sparks, slash flashes.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

function pool(scene, geo, mat, n) {
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < n; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.set(0xffffff)); }
  im.frustumCulled = false;
  scene.add(im);
  return { im, items: Array.from({ length: n }, () => ({ life: 0 })), next: 0 };
}
function take(P) { const it = P.items[P.next]; const i = P.next; P.next = (P.next + 1) % P.items.length; it.i = i; return it; }

// ink textures drawn once: a splatter blot and a dry-brush stroke
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const blotTex = () => canvasTex(128, 128, (g, w) => {
  g.fillStyle = '#fff';
  for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(w / 2 + rnd(-14, 14), w / 2 + rnd(-14, 14), rnd(14, 30), 0, 7); g.fill(); }
  for (let i = 0; i < 22; i++) { const a = rnd(0, 7), r = rnd(36, 60); g.beginPath(); g.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, rnd(1.5, 5), 0, 7); g.fill(); }
  for (let i = 0; i < 6; i++) { const a = rnd(0, 7); g.save(); g.translate(w / 2, w / 2); g.rotate(a); g.beginPath(); g.ellipse(34, 0, 16, 3, 0, 0, 7); g.fill(); g.restore(); }
});
const brushTex = () => canvasTex(512, 64, (g, w, h) => {
  for (let i = 0; i < 70; i++) {           // dry-brush bristle streaks inside a tapered stroke
    const y = h / 2 + rnd(-1, 1) * h * 0.42, x0 = rnd(0, w * 0.15), x1 = w - rnd(0, w * 0.2);
    g.strokeStyle = `rgba(255,255,255,${rnd(0.45, 1)})`; g.lineWidth = rnd(1.5, 4.5);
    g.beginPath(); g.moveTo(x0, h / 2 + (y - h / 2) * 0.3); g.quadraticCurveTo(w * 0.45, y, x1, h / 2 + (y - h / 2) * 0.15); g.stroke();
  }
});

export function makeFX(scene) {
  const drops = pool(scene, new THREE.TetrahedronGeometry(0.05), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }), 600);
  const splats = pool(scene, new THREE.PlaneGeometry(1.25, 1.25).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: blotTex(), alphaTest: 0.35, depthWrite: false, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, transparent: true, opacity: 0.92 }), 90);
  splats.im.receiveShadow = true;
  const dust = pool(scene, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x5e554c, roughness: 1, transparent: true, opacity: 0.32, depthWrite: false }), 120);
  const sparks = pool(scene, new THREE.BoxGeometry(0.018, 0.018, 0.16), new THREE.MeshBasicMaterial({ toneMapped: false }), 260);
  const flashGeo = new THREE.PlaneGeometry(1, 1), brush = brushTex();
  const flashes = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ map: brush, color: 0x120e0b, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.visible = false; m.frustumCulled = false; scene.add(m); flashes.push({ m, life: 0 });
  }
  let fi = 0;
  const F = { blood: true };

  // with Blood off (family mode) hits throw sakura petals and paper confetti instead of red ink
  const PETALS = [0xf2a7b8, 0xf7d3dc, 0xfff6ea, 0xe8c15a];
  F.burst = (pos, normal, count, power = 1, color) => {
    const base = color ?? (F.blood ? 0x9c0d14 : null);
    for (let k = 0; k < count; k++) {
      const it = take(drops);
      const side = k % 2 ? 1 : -1;
      it.p = pos.clone().add(new THREE.Vector3(rnd(-0.15, 0.15), rnd(-0.15, 0.15), rnd(-0.15, 0.15)));
      it.v = normal.clone().multiplyScalar(side * rnd(1, 4) * power).add(new THREE.Vector3(rnd(-1.5, 1.5), rnd(1, 4.5), rnd(-1.5, 1.5)).multiplyScalar(power));
      it.life = rnd(0.6, 1.3); it.s = rnd(0.5, 1.6); it.rot = rnd(0, 6);
      drops.im.setColorAt(it.i, base === null ? _c.set(PETALS[k % PETALS.length]) : _c.set(base).multiplyScalar(rnd(0.7, 1.25)));
    }
    drops.im.instanceColor.needsUpdate = true;
  };
  // directional spurt (severed stumps)
  F.spray = (pos, dir, count, speed = 2) => {
    if (!F.blood) return;
    for (let k = 0; k < count; k++) {
      const it = take(drops);
      it.p = pos.clone(); it.v = dir.clone().multiplyScalar(speed * rnd(0.6, 1.2)).add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(0, 0.8), rnd(-0.5, 0.5)));
      it.life = rnd(0.5, 1); it.s = rnd(0.4, 1); it.rot = rnd(0, 6);
      drops.im.setColorAt(it.i, _c.set(F.blood ? 0x9c0d14 : 0x150f22).multiplyScalar(rnd(0.7, 1.2)));
    }
    drops.im.instanceColor.needsUpdate = true;
  };
  // landing / footwork dust ring
  F.dust = (pos, count = 14, radius = 1) => {
    for (let k = 0; k < count; k++) {
      const it = take(dust), a = k / count * Math.PI * 2 + rnd(-0.2, 0.2);
      it.p = new THREE.Vector3(pos.x, 0.05, pos.z); it.v = new THREE.Vector3(Math.cos(a), rnd(0.2, 0.6), Math.sin(a)).multiplyScalar(rnd(1.5, 3) * radius);
      it.life = rnd(0.4, 0.75); it.max = it.life; it.s = rnd(0.12, 0.22) * radius;
    }
  };
  F.splat = (x, z, size) => {
    if (!F.blood) return;   // no pools in family mode
    const it = take(splats);
    it.x = x; it.z = z; it.s = size * rnd(0.6, 1.3); it.life = 14; it.r = rnd(0, 6); it.sx = rnd(0.7, 1.3);
    splats.im.setColorAt(it.i, _c.set(F.blood ? 0x5a0408 : 0x0d0a16));
    splats.im.instanceColor.needsUpdate = true;
  };
  F.sparks = (pos, count, color = 0xffc870, speed = 7) => {
    for (let k = 0; k < count; k++) {
      const it = take(sparks);
      it.p = pos.clone(); it.v = new THREE.Vector3().randomDirection().multiplyScalar(rnd(0.3, 1) * speed); it.v.y += 2;
      it.life = rnd(0.25, 0.6); it.max = it.life;
      sparks.im.setColorAt(it.i, _c.set(color).multiplyScalar(rnd(1.5, 3)));
    }
    sparks.im.instanceColor.needsUpdate = true;
  };
  // a bright streak lying in the cut plane, along the swipe direction
  F.flash = (pos, planeNormal, dir, len = 3, color = 0x120e0b) => {
    const f = flashes[fi]; fi = (fi + 1) % flashes.length;
    const d = dir.clone().sub(planeNormal.clone().multiplyScalar(dir.dot(planeNormal))).normalize();
    if (d.lengthSq() < 0.5) d.crossVectors(planeNormal, UP).normalize();
    const side = new THREE.Vector3().crossVectors(planeNormal, d);
    f.m.matrix.makeBasis(d, side, planeNormal);
    f.m.quaternion.setFromRotationMatrix(f.m.matrix);
    f.m.position.copy(pos); f.len = len; f.life = 0.38; f.m.visible = true;
    f.m.material.color.set(color);
  };

  F.update = (dt) => {
    for (const it of drops.items) {
      if (it.life <= 0) continue;
      it.life -= dt; it.v.y -= 16 * dt; it.p.addScaledVector(it.v, dt);
      if (it.p.y < 0.02) { if (Math.random() < 0.12) F.splat(it.p.x, it.p.z, rnd(0.15, 0.4)); it.life = 0; }
      if (it.life <= 0) { drops.im.setMatrixAt(it.i, ZERO); continue; }
      it.rot += dt * 8;
      _q.setFromAxisAngle(Z, it.rot);
      drops.im.setMatrixAt(it.i, _m.compose(it.p, _q, _s.setScalar(it.s * Math.min(1, it.life * 3))));
    }
    drops.im.instanceMatrix.needsUpdate = true;
    for (const it of splats.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      const k = it.life <= 0 ? 0 : Math.min(1, it.life / 3) * it.s * Math.min(1, (14 - it.life) * 12 + 0.2);
      _q.setFromAxisAngle(UP, it.r);
      splats.im.setMatrixAt(it.i, it.life <= 0 ? ZERO : _m.compose(_p.set(it.x, 0.02, it.z), _q, _s.set(k * it.sx, 1, k)));
    }
    splats.im.instanceMatrix.needsUpdate = true;
    for (const it of dust.items) {
      if (it.life <= 0) continue;
      it.life -= dt; it.v.multiplyScalar(1 - dt * 3.5); it.p.addScaledVector(it.v, dt);
      const k = it.life / it.max;
      dust.im.setMatrixAt(it.i, it.life <= 0 ? ZERO : _m.compose(it.p, _q.identity(), _s.setScalar(it.s * (1.8 - k))));
    }
    dust.im.instanceMatrix.needsUpdate = true;
    for (const it of sparks.items) {
      if (it.life <= 0) continue;
      it.life -= dt; it.v.y -= 12 * dt; it.p.addScaledVector(it.v, dt);
      if (it.p.y < 0.02) { it.p.y = 0.02; it.v.y *= -0.4; }
      if (it.life <= 0) { sparks.im.setMatrixAt(it.i, ZERO); continue; }
      _q.setFromUnitVectors(Z, _p.copy(it.v).normalize());
      sparks.im.setMatrixAt(it.i, _m.compose(it.p, _q, _s.set(1, 1, Math.min(2, it.v.length() * 0.15) * (it.life / it.max))));
    }
    sparks.im.instanceMatrix.needsUpdate = true;
    for (const f of flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.m.visible = false; continue; }
      const k = f.life / 0.38, grow = Math.min(1, (1 - k) * 6);     // ink stroke sweeps out fast, then fades
      f.m.scale.set(f.len * (0.5 + grow * 0.9), 0.2 + 0.1 * k, 1);
      f.m.material.opacity = Math.min(1, k * 1.6) * 0.92;
    }
  };
  return F;
}
