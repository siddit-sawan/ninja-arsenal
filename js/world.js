// Environment (sumi-e ink-wash look: ink on parchment, a red ink sun): circular shrine arena with 4 torii gates, bamboo forest, sakura, pagodas, mountains, themes.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
function canvasTex(w, h, draw, rep = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]); t.anisotropy = 8; return t;
}

// Every theme is ink on paper: paper tones for sky and fog, an ink-bleed sun/moon, ink greys that fade with distance.
export const THEMES = [
  { name: 'Red Dawn', top: 0xd8caa8, mid: 0xefe3c6, bot: 0xd6c8aa, sun: 0xc0261c, sunDir: [-0.4, 0.2, -1], sunSize: 55, fog: 0xe9dcbe, fogD: 0.02,
    light: 0xfff4e2, li: 1.5, hemiS: 0xfff6e6, hemiG: 0xb9ab8e, hi: 1.55, lantern: 0.35, stars: 0, exposure: 1.0, petals: 0x2a221c, blossom: 0x3a302a, ink: 0x26211c },
  { name: 'Moon Ink', top: 0xa29b8b, mid: 0xcbc3ae, bot: 0x948d7e, sun: 0xf6f0e0, sunDir: [0.4, 0.3, -1], sunSize: 75, fog: 0xbdb5a2, fogD: 0.022,
    light: 0xe9e6de, li: 1.0, hemiS: 0xe6e0d2, hemiG: 0x77705f, hi: 1.25, lantern: 1.0, stars: 0, exposure: 1.0, petals: 0x1a1816, blossom: 0x2e2a26, ink: 0x1d1a17, moon: true },
  { name: 'Sakura Scroll', top: 0xe4d0c0, mid: 0xf2e4d3, bot: 0xd6c4b2, sun: 0xb5302a, sunDir: [0.5, 0.26, -1], sunSize: 40, fog: 0xecdcc9, fogD: 0.019,
    light: 0xfff2e6, li: 1.5, hemiS: 0xfff3ea, hemiG: 0xbca893, hi: 1.55, lantern: 0.3, stars: 0, exposure: 1.0, petals: 0xb8505c, blossom: 0xc98a90, ink: 0x2a221e },
  { name: 'Blood Moon', top: 0xc6a585, mid: 0xe0c6a0, bot: 0xb39575, sun: 0xa8121a, sunDir: [-0.2, 0.28, -1], sunSize: 30, fog: 0xd8bb98, fogD: 0.021,
    light: 0xffe6d0, li: 1.4, hemiS: 0xffe8d4, hemiG: 0x9a7c60, hi: 1.45, lantern: 0.9, stars: 0, exposure: 1.0, petals: 0x7a0a0e, blossom: 0x5a1a18, ink: 0x2a1c18, moon: false },
];

export const ARENA_R = 24.5;          // wall radius
export function buildWorld(scene, renderer, quality) {
  const W = { arenaR: ARENA_R - 1.3, colliders: [], gates: [] };

  // ---------- sky
  const skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() },
    sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunSize: { value: 900 }, moon: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top, mid, bot, sunCol, sunDir; uniform float sunSize, moon; varying vec3 vD;
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){ vec3 d = normalize(vD); float h = d.y;
        vec3 c = h > 0. ? mix(mid, top, pow(clamp(h * 1.4, 0., 1.), 0.8)) : mix(mid, bot, clamp(-h * 5., 0., 1.));
        c *= 0.92 + 0.06 * n3(d * 7.) + 0.03 * n3(d * 70.);                         // paper blotches and fibres
        vec3 sd = normalize(sunDir); float s = dot(d, sd), r = 1.0 - 1.4 / sunSize;
        float edge = (n3(d * 45.) - 0.5) * 0.006 + (n3(d * 14.) - 0.5) * 0.01;
        float disc = smoothstep(r - 0.0015, r + 0.0015, s + edge);              // rough ink-bleed edge
        vec3 ink = sunCol * (0.86 + 0.18 * n3(d * 30.));
        c = mix(c, ink, disc * 0.93);
        c = mix(c, sunCol, smoothstep(r - 0.03, r, s) * (1. - disc) * 0.08 * (1. - moon)); // faint wash around it
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  W.sky = sky;

  const sp = []; for (let i = 0; i < 900; i++) { const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.9 + 0.05; v.normalize().multiplyScalar(450); sp.push(v.x, v.y, v.z); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; scene.add(stars);

  // ---------- lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  const sm = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 180 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  W.sun = sun;
  const fill = new THREE.DirectionalLight(0xffffff, 0.6); scene.add(fill, fill.target);   // opposite-side fill so backlit enemies stay readable
  const centreLight = new THREE.PointLight(0xffa050, 0, 34, 1.4); centreLight.position.set(0, 6, 0); scene.add(centreLight);

  scene.fog = new THREE.FogExp2(0x000000, 0.012);

  // ---------- ground
  const grass = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e3d6b9'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(40,32,24,${0.04 + Math.random() * 0.12})`; g.save(); g.translate(Math.random() * w, Math.random() * h); g.rotate((Math.random() - 0.5) * 0.6); g.fillRect(0, 0, 1 + Math.random(), 3 + Math.random() * 7); g.restore(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,70,45,${Math.random() * 0.05})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 0, 7); g.fill(); }
  }, [90, 90]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const stoneTex = (rep) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a8a72'; g.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const rh = 40 + Math.random() * 24; let x = -Math.random() * 60;
      while (x < w) {
        const rw = 50 + Math.random() * 60, l = 78 + Math.random() * 9;
        g.fillStyle = `hsl(40,${22 + Math.random() * 10}%,${l}%)`; g.fillRect(x + 2 + Math.random() * 2, y + 2 + Math.random() * 2, rw - 5, rh - 5);
        for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(60,45,30,${Math.random() * 0.07})`; g.fillRect(x + 3 + Math.random() * (rw - 8), y + 3 + Math.random() * (rh - 8), 2 + Math.random() * 6, 1 + Math.random() * 2); }
        x += rw;
      }
      y += rh;
    }
  }, rep);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 0.4, 72), new THREE.MeshStandardMaterial({ map: stoneTex([9, 9]), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; floor.receiveShadow = true; scene.add(floor);
  // inlaid ring + centre crest
  const inlay = new THREE.MeshStandardMaterial({ color: 0x2c2826, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  for (const [r0, r1] of [[7.6, 8.1], [15.6, 15.9]]) { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), inlay); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.receiveShadow = true; scene.add(m); }

  const flat = (c, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, flatShading: true });
  const add = (geo, mat, x, y, z, shadow = true, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
  const dm = new THREE.Object3D();

  // ---------- gates (N, E, S, W) and outer paths
  const GATE_HALF = Math.asin(4.3 / ARENA_R);
  const gateAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const red = flat(0xae2219, 0.6), black = flat(0x16120f, 0.6);
  function torii(parent) {
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.27, 0.32, 6.2, 12), red, sx * 3.6, 3.1, 0, true, parent);
      add(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 12), black, sx * 3.6, 0.25, 0, true, parent);
    }
    add(new THREE.BoxGeometry(8.6, 0.32, 0.34), red, 0, 4.9, 0, true, parent);
    add(new THREE.BoxGeometry(0.3, 0.9, 0.25), red, 0, 5.45, 0, true, parent);
    add(new THREE.BoxGeometry(10.4, 0.42, 0.66), black, 0, 6.15, 0, true, parent);
    add(new THREE.BoxGeometry(10.0, 0.3, 0.55), red, 0, 5.85, 0, true, parent);
    for (const sx of [-1, 1]) { const e = add(new THREE.BoxGeometry(1.2, 0.42, 0.66), black, sx * 5.5, 6.32, 0, true, parent); e.rotation.z = sx * 0.28; }
  }
  const pathMat = new THREE.MeshStandardMaterial({ map: stoneTex([1.5, 10]), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  for (const a of gateAngles) {
    const dx = Math.sin(a), dz = -Math.cos(a);      // direction from centre to gate (a=0 → north, -z)
    const g = new THREE.Group(); g.position.set(dx * (ARENA_R + 0.3), 0, dz * (ARENA_R + 0.3)); g.rotation.y = -a; scene.add(g); torii(g);
    const outer = new THREE.Group(); outer.position.set(dx * (ARENA_R + 16), 0, dz * (ARENA_R + 16)); outer.rotation.y = -a; scene.add(outer); torii(outer);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 60), pathMat); p.rotation.set(-Math.PI / 2, 0, -a); p.position.set(dx * (ARENA_R + 30), 0.02, dz * (ARENA_R + 30)); p.receiveShadow = true; scene.add(p);
    W.gates.push({ a, dx, dz, tx: -dz, tz: dx, ox: dx * (ARENA_R + 9), oz: dz * (ARENA_R + 9), ix: dx * (ARENA_R - 3.5), iz: dz * (ARENA_R - 3.5) });
    for (const sx of [-1, 1]) W.colliders.push({ x: dx * (ARENA_R + 0.3) - dz * 3.6 * sx, z: dz * (ARENA_R + 0.3) + dx * 3.6 * sx, r: 0.45 });
  }

  // ---------- low wall ring with tiled cap (skips the gates)
  const segLen = 2.0, segN = Math.ceil(2 * Math.PI * ARENA_R / segLen);
  const wallI = new THREE.InstancedMesh(new THREE.BoxGeometry(segLen + 0.08, 1.1, 0.7), flat(0xd9ceb6, 0.95), segN);
  const capI = new THREE.InstancedMesh(new THREE.BoxGeometry(segLen + 0.12, 0.2, 1.0), flat(0x2a2c33, 0.6), segN);
  let wi = 0;
  for (let i = 0; i < segN; i++) {
    const a = (i + 0.5) / segN * Math.PI * 2;
    const nearGate = gateAngles.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < GATE_HALF + 0.03);
    if (nearGate) continue;
    const x = Math.sin(a) * (ARENA_R + 0.35), z = -Math.cos(a) * (ARENA_R + 0.35);
    dm.position.set(x, 0.55, z); dm.rotation.set(0, -a, 0); dm.scale.set(1, 1, 1); dm.updateMatrix(); wallI.setMatrixAt(wi, dm.matrix);
    dm.position.y = 1.2; dm.updateMatrix(); capI.setMatrixAt(wi, dm.matrix); wi++;
  }
  wallI.count = capI.count = wi; wallI.castShadow = capI.castShadow = true; wallI.receiveShadow = capI.receiveShadow = true;
  scene.add(wallI, capI);

  // ---------- stone lanterns (obstacles inside, decoration outside)
  const stoneMat = flat(0x6c655b, 0.95);
  W.glowMat = new THREE.MeshBasicMaterial({ color: 0xffb35a, toneMapped: false });
  function lantern(x, z, s = 1, collide = false) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
    add(new THREE.CylinderGeometry(0.42, 0.5, 0.25, 6), stoneMat, 0, 0.12, 0, true, g);
    add(new THREE.CylinderGeometry(0.13, 0.17, 1.0, 6), stoneMat, 0, 0.75, 0, true, g);
    add(new THREE.CylinderGeometry(0.36, 0.3, 0.16, 6), stoneMat, 0, 1.32, 0, true, g);
    add(new THREE.BoxGeometry(0.42, 0.38, 0.42), stoneMat, 0, 1.58, 0, true, g);
    add(new THREE.BoxGeometry(0.44, 0.22, 0.3), W.glowMat, 0, 1.6, 0, false, g);
    add(new THREE.BoxGeometry(0.3, 0.22, 0.44), W.glowMat, 0, 1.6, 0, false, g);
    add(new THREE.ConeGeometry(0.62, 0.42, 6), stoneMat, 0, 1.98, 0, true, g);
    add(new THREE.SphereGeometry(0.09, 6, 4), stoneMat, 0, 2.24, 0, true, g);
    if (collide) W.colliders.push({ x, z, r: 0.55 * s });
  }
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; lantern(Math.sin(a) * 11.5, -Math.cos(a) * 11.5, 1.35, true); }
  for (const a of gateAngles) for (const sx of [-1, 1]) { const dx = Math.sin(a), dz = -Math.cos(a); for (const r of [ARENA_R + 6, ARENA_R + 22]) lantern(dx * r - dz * 4.6 * sx, dz * r + dx * 4.6 * sx); }

  // ---------- bamboo forest (outside the wall, clear of the gate paths)
  const stalkGeo = new THREE.CylinderGeometry(0.075, 0.09, 1, 7, 9, false).translate(0, 0.5, 0);
  { const p = stalkGeo.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const f = (y * 9) % 1; const band = f < 0.02 || f > 0.98; const v = band ? 0.55 : 0.85 + y * 0.15; col.push(v, v, v); }
    stalkGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); }
  const stalkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, color: 0xffffff });
  const leafGeo = new THREE.IcosahedronGeometry(1, 0), leafMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
  const N = quality === 'high' ? 760 : 420;
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, N), leaves = new THREE.InstancedMesh(leafGeo, leafMat, N * 3);
  const col = new THREE.Color(); let li = 0;
  for (let i = 0; i < N; i++) {
    const a = rnd(0, Math.PI * 2), r = ARENA_R + 4 + Math.pow(Math.random(), 1.6) * 55;
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    const onPath = gateAngles.some(g => { const dx = Math.sin(g), dz = -Math.cos(g); const along = x * dx + z * dz, side = Math.abs(-x * dz + z * dx); return along > 0 && side < 6.5; });
    if (onPath) { i--; continue; }
    const h = rnd(7, 14);
    dm.position.set(x, 0, z); dm.rotation.set(rnd(-0.06, 0.06), rnd(0, 6), rnd(-0.06, 0.06)); dm.scale.set(rnd(0.8, 1.25), h, rnd(0.8, 1.25)); dm.updateMatrix();
    stalks.setMatrixAt(i, dm.matrix);
    stalks.setColorAt(i, col.setHSL(0.09, 0.08, rnd(0.1, 0.26)));
    for (let k = 0; k < 3; k++) {
      dm.position.set(x + rnd(-0.9, 0.9), h * rnd(0.62, 1.0), z + rnd(-0.9, 0.9)); dm.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); dm.scale.set(rnd(0.9, 1.6), rnd(0.35, 0.6), rnd(0.9, 1.6)); dm.updateMatrix();
      leaves.setMatrixAt(li, dm.matrix); leaves.setColorAt(li++, col.setHSL(0.08, 0.06, rnd(0.06, 0.2)));
    }
  }
  stalks.castShadow = leaves.castShadow = true; stalks.receiveShadow = leaves.receiveShadow = true;
  scene.add(stalks, leaves);

  // ---------- sakura trees just outside the wall, between the gates
  const trunkMat = flat(0x221c18, 0.9), blossom = new THREE.MeshStandardMaterial({ color: 0x3a302a, flatShading: true, roughness: 0.9 });
  function sakura(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = rnd(0, 6); scene.add(g);
    const t = add(new THREE.CylinderGeometry(0.22, 0.35, 3, 7), trunkMat, 0, 1.5, 0, true, g); t.rotation.z = 0.12;
    for (let i = 0; i < 4; i++) { const b = add(new THREE.CylinderGeometry(0.08, 0.15, 2.2, 6), trunkMat, Math.cos(i * 1.7) * 0.6, 3.2, Math.sin(i * 1.7) * 0.6, true, g); b.rotation.set(Math.sin(i * 1.7) * 0.7, 0, -Math.cos(i * 1.7) * 0.7); }
    for (let i = 0; i < 9; i++) { const c = add(new THREE.IcosahedronGeometry(rnd(0.9, 1.5), 1), blossom, rnd(-1.8, 1.8), rnd(3.6, 5.2), rnd(-1.8, 1.8), true, g); c.scale.y = 0.75; }
  }
  for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4 + rnd(-0.12, 0.12), r = ARENA_R + rnd(3, 5); sakura(Math.sin(a) * r, -Math.cos(a) * r, rnd(1.1, 1.35)); }

  // ---------- pagodas, shrine
  function pagoda(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
    const wall = flat(0x3a332d, 0.8), roofM = flat(0x141210, 0.7), gold = flat(0x8a7a60, 0.6);
    roofM.side = THREE.DoubleSide;
    add(new THREE.BoxGeometry(7, 1.2, 7), flat(0x6e6a63), 0, 0.6, 0, true, g);
    let y = 1.2;
    for (let i = 0; i < 5; i++) {
      const w = 4.2 - i * 0.55;
      add(new THREE.BoxGeometry(w, 1.6, w), wall, 0, y + 0.8, 0, true, g);
      add(new THREE.CylinderGeometry(w * 0.25, w * 1.05, 0.9, 4, 1, true), roofM, 0, y + 1.9, 0, true, g).rotation.y = Math.PI / 4;
      y += 2.1;
    }
    add(new THREE.CylinderGeometry(0.06, 0.12, 3.2, 6), gold, 0, y + 1.2, 0, true, g);
  }
  pagoda(70, -70, 1.7); pagoda(-80, 55, 1.6); pagoda(-60, -95, 1.4);
  { const g = new THREE.Group(); g.position.set(0, 0, -(ARENA_R + 62)); scene.add(g);
    add(new THREE.BoxGeometry(14, 1.2, 9), flat(0x6e6a63), 0, 0.6, 0, true, g);
    add(new THREE.BoxGeometry(11, 4.2, 7), flat(0x3a332d, 0.8), 0, 3.3, 0, true, g);
    const r = add(new THREE.CylinderGeometry(3, 9.6, 3, 4), flat(0x232831, 0.6), 0, 6.9, 0, true, g); r.rotation.y = Math.PI / 4; r.scale.z = 0.7;
    add(new THREE.BoxGeometry(3, 3, 0.2), W.glowMat, 0, 2.8, 3.55, false, g); }

  // ---------- mountains all around
  const mountMat = new THREE.MeshBasicMaterial({ color: 0x8a8070, fog: false }), snow = new THREE.MeshBasicMaterial({ color: 0xf0e6d0, fog: false });
  const mountFar = new THREE.MeshBasicMaterial({ color: 0xb0a690, fog: false });
  for (let k = 0; k < 11; k++) {
    const a = k / 11 * Math.PI * 2 + rnd(-0.15, 0.15), d = rnd(300, 400), h = rnd(80, 190), r = h * rnd(0.8, 1.1);
    const x = Math.sin(a) * d, z = -Math.cos(a) * d;
    const geo = new THREE.ConeGeometry(r, h, 9, 3); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < h / 2 - 1) { p.setX(i, p.getX(i) * rnd(0.85, 1.12)); p.setZ(i, p.getZ(i) * rnd(0.85, 1.12)); }
    geo.computeVertexNormals();
    add(geo, d > 350 ? mountFar : mountMat, x, h / 2 - 2, z, false);
    add(new THREE.ConeGeometry(r * 0.3, h * 0.3, 9, 1), snow, x, h - h * 0.15 - 1.7, z, false);
  }

  // ---------- falling petals around the camera
  const PN = quality === 'high' ? 420 : 220;
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xf6b2c6, side: THREE.DoubleSide, roughness: 0.7, emissive: 0x401020, emissiveIntensity: 0.4 });
  const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.05), petalMat, PN);
  petals.frustumCulled = false;
  const pd = [];
  for (let i = 0; i < PN; i++) pd.push({ x: rnd(-18, 18), y: rnd(0, 9), z: rnd(-18, 18), s: rnd(0.6, 1.4), ph: rnd(0, 6.28), sp: rnd(0.6, 1.3) });
  scene.add(petals);

  // ---------- environment map for metals, built from the sky only
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const envSky = sky.clone(); envScene.add(envSky);
  const hemiEnv = new THREE.Mesh(new THREE.SphereGeometry(100, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.BackSide }));
  envScene.add(hemiEnv);
  let envRT = null;

  W.setTheme = (i) => {
    const T = THEMES[i];
    skyU.top.value.set(T.top); skyU.mid.value.set(T.mid); skyU.bot.value.set(T.bot); skyU.sunCol.value.set(T.sun);
    skyU.sunDir.value.set(...T.sunDir).normalize(); skyU.sunSize.value = T.sunSize; skyU.moon.value = T.moon ? 1 : 0;
    scene.fog.color.set(T.fog); scene.fog.density = T.fogD;
    const sd = new THREE.Vector3(...T.sunDir).normalize();
    sun.color.set(T.light); sun.intensity = T.li;
    sun.position.set(sd.x * 60, Math.max(30, sd.y * 120), sd.z * 60);
    fill.position.set(-sd.x * 40, 25, -sd.z * 40);
    fill.color.set(T.hemiS); fill.intensity = 0.45 + T.lantern * 0.35;
    hemi.color.set(T.hemiS); hemi.groundColor.set(T.hemiG); hemi.intensity = T.hi;
    W.glowMat.color.setRGB(1.0 * T.lantern + 0.4, 0.62 * T.lantern + 0.25, 0.25 * T.lantern + 0.1);
    centreLight.intensity = T.lantern * 12;
    starMat.opacity = T.stars;
    petalMat.color.set(T.petals);
    mountMat.color.set(T.fog).lerp(new THREE.Color(T.ink), 0.42); mountFar.color.set(T.fog).lerp(new THREE.Color(T.ink), 0.22); snow.color.set(T.mid);
    blossom.color.set(T.blossom);
    hemiEnv.material.color.set(T.hemiG);
    renderer.toneMappingExposure = T.exposure;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.02);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.7;
  };

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const wrap = (v, c, h) => v - c > h ? v - 2 * h : v - c < -h ? v + 2 * h : v;
  W.update = (dt, t, cam) => {
    for (let i = 0; i < PN; i++) {
      const p = pd[i];
      p.y -= dt * 0.55 * p.sp; p.x += dt * (0.5 + Math.sin(t * 0.7 + p.ph) * 0.6); p.z += dt * 0.25;
      if (p.y < 0.02) p.y = rnd(7, 10);
      p.x = wrap(p.x, cam.x, 18); p.z = wrap(p.z, cam.z, 18);
      _e.set(t * 2.1 * p.sp + p.ph, t * 1.3 + p.ph, Math.sin(t * 3 + p.ph));
      petals.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e), _s.setScalar(p.s)));
    }
    petals.instanceMatrix.needsUpdate = true;
  };
  return W;
}
