// Procedural low-poly 3D rooms for each Silver Rain zone (three.js).
// These stand in until real 360° photos or 3D scans of the spa are ready.
import * as THREE from '/silver-rain/vendor/three.module.min.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });

function add(scene, geo, mat, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  scene.add(m);
  return m;
}
const box = (s, w, h, d, mat, x, y, z, ry) => add(s, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, ry);

/** A room shell: floor, ceiling and four walls (the camera stands inside). */
function room(s, w, d, h, floorMat, wallMat, ceilMat) {
  const f = add(s, new THREE.PlaneGeometry(w, d), floorMat); f.rotation.x = -Math.PI / 2;
  const c = add(s, new THREE.PlaneGeometry(w, d), ceilMat || wallMat, 0, h, 0); c.rotation.x = Math.PI / 2;
  const walls = [[0, h / 2, -d / 2, 0, w], [0, h / 2, d / 2, Math.PI, w], [-w / 2, h / 2, 0, Math.PI / 2, d], [w / 2, h / 2, 0, -Math.PI / 2, d]];
  for (const [x, y, z, ry, len] of walls) add(s, new THREE.PlaneGeometry(len, h), wallMat, x, y, z, ry);
}

/** A checker / plank texture drawn on a canvas. */
function tex(kind, a, b, rep = 4) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = b; g.lineWidth = 3;
  if (kind === 'tiles') { for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } }
  if (kind === 'planks') { g.lineWidth = 2; for (let i = 0; i <= 256; i += 21) { g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } }
  if (kind === 'marble') { g.lineWidth = 1.2; for (let i = 0; i < 26; i++) { g.beginPath(); let x = Math.random() * 256, y = 0; g.moveTo(x, y); while (y < 256) { x += (Math.random() - 0.5) * 30; y += 20; g.lineTo(x, y); } g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plant(s, x, z, h = 1.4) {
  box(s, 0.5, 0.45, 0.5, M(0x3a2d24), x, 0, z);
  for (let i = 0; i < 6; i++) {
    const leaf = add(s, new THREE.ConeGeometry(0.12, h, 5), M(0x2f6b3a, { roughness: 0.9 }), x + Math.sin(i) * 0.12, 0.45 + h / 2, z + Math.cos(i) * 0.12);
    leaf.rotation.z = (i - 2.5) * 0.18; leaf.rotation.x = Math.sin(i * 2) * 0.2;
  }
}

function lounger(s, x, z, ry = 0, cushion = 0xf1ece4) {
  const g = new THREE.Group();
  const wood = M(0x7a5236), cush = M(cushion, { roughness: 0.95 });
  const p = (w, h, d, m, px, py, pz) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mm.position.set(px, py, pz); g.add(mm); return mm; };
  p(0.7, 0.12, 1.9, wood, 0, 0.3, 0); p(0.62, 0.1, 1.3, cush, 0, 0.41, 0.25);
  const back = p(0.62, 0.1, 0.7, cush, 0, 0.62, -0.62); back.rotation.x = -0.9;
  for (const [lx, lz] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]]) p(0.06, 0.3, 0.06, wood, lx, 0.15, lz);
  g.position.set(x, 0, z); g.rotation.y = ry; s.add(g);
}

function lamp(s, x, y, z, color = 0xffd9a8, intensity = 6, dist = 9) {
  add(s, new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color }), x, y, z);
  const l = new THREE.PointLight(color, intensity, dist, 1.6); l.position.set(x, y - 0.1, z); s.add(l);
  return l;
}

/** Animated water surface (vertex waves). Returns an update(t) function. */
function water(s, w, d, y, color = 0x2bb3c7, segs = 40, round = false) {
  const geo = round ? new THREE.CircleGeometry(w / 2, 64) : new THREE.PlaneGeometry(w, d, segs, segs);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0, transparent: true, opacity: 0.94 });
  const m = add(s, geo, mat, 0, y, 0); m.rotation.x = -Math.PI / 2;
  const pos = geo.attributes.position, base = pos.array.slice();
  return { mesh: m, update(t) {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], yy = base[i * 3 + 1];
      pos.array[i * 3 + 2] = Math.sin(x * 2.1 + t * 1.6) * 0.025 + Math.cos(yy * 2.7 + t * 1.2) * 0.02;
    }
    pos.needsUpdate = true; geo.computeVertexNormals();
  } };
}

/* ── ZONES ── each returns { eye, target, update } */
const ZONES = {
  pool(s) {
    s.background = new THREE.Color(0x0e1416); s.fog = new THREE.Fog(0x0e1416, 14, 30);
    room(s, 16, 18, 5, M(0xe9e4da, { map: tex('tiles', '#e9e4da', '#d6cfc2', 8) }), M(0xd8d0c2), M(0x2a2622));
    // pool basin
    box(s, 8.4, 0.25, 10.4, M(0xcfc6b8), 0, 0, -1);
    box(s, 8.6, 0.4, 0.3, M(0xcfc6b8), 0, 0, -6.2); box(s, 8.6, 0.4, 0.3, M(0xcfc6b8), 0, 0, 4.2);
    box(s, 0.3, 0.4, 10.4, M(0xcfc6b8), -4.2, 0, -1); box(s, 0.3, 0.4, 10.4, M(0xcfc6b8), 4.2, 0, -1);
    const basin = M(0x3fa9c0, { map: tex('tiles', '#4fb5c9', '#3a97ab', 6) });
    box(s, 8, 0.22, 10, basin, 0, 0.02, -1);
    const wv = water(s, 7.9, 9.9, 0.34);
    wv.mesh.position.z = -1;
    for (let i = 0; i < 4; i++) lounger(s, -6.2, -5 + i * 2.4, Math.PI / 2);
    for (let i = 0; i < 4; i++) lounger(s, 6.2, -5 + i * 2.4, -Math.PI / 2);
    plant(s, -7.2, -8); plant(s, 7.2, -8); plant(s, -7.2, 7.5); plant(s, 7.2, 7.5);
    for (let i = -1; i <= 1; i++) for (let j = 0; j < 3; j++) lamp(s, i * 4.5, 4.8, -6 + j * 5, 0xfff1dd, 5, 12);
    s.add(new THREE.HemisphereLight(0xcfe8ff, 0x3a2f25, 0.9));
    return { eye: [0, 3.1, 8.2], target: [0, 0.2, -3], update: wv.update };
  },

  sauna(s) {
    s.background = new THREE.Color(0x140c06); s.fog = new THREE.Fog(0x140c06, 6, 14);
    const wood = M(0xb27a45, { map: tex('planks', '#b27a45', '#8d5c30', 2) });
    room(s, 5, 5, 2.8, M(0x8a5a33, { map: tex('planks', '#8a5a33', '#6c4424', 3) }), wood, wood);
    // tiered benches along the back and left wall
    box(s, 4.6, 0.45, 0.8, wood, 0, 0, -2.0); box(s, 4.6, 0.9, 0.7, wood, 0, 0, -2.4);
    box(s, 0.8, 0.45, 3.2, wood, -2.0, 0, 0.2);
    // stove with stones
    box(s, 0.8, 0.9, 0.7, M(0x2b2b2e, { metalness: 0.6, roughness: 0.4 }), 1.8, 0, 1.6);
    for (let i = 0; i < 16; i++) add(s, new THREE.DodecahedronGeometry(0.1 + Math.random() * 0.05), M(0x555, { roughness: 1 }), 1.8 + (Math.random() - 0.5) * 0.6, 0.98 + Math.random() * 0.12, 1.6 + (Math.random() - 0.5) * 0.5);
    const glow = lamp(s, 1.8, 1.1, 1.6, 0xff7a2e, 7, 6);
    lamp(s, -2.3, 2.4, -2.3, 0xffb066, 5, 7); lamp(s, 2.3, 2.4, -2.3, 0xffb066, 5, 7); lamp(s, 0, 2.5, 0.5, 0xffc080, 4, 7);
    // bucket
    add(s, new THREE.CylinderGeometry(0.17, 0.14, 0.28, 16), M(0x7a5236), 1.0, 0.14, 1.9);
    s.add(new THREE.HemisphereLight(0xffc28a, 0x2a160a, 0.5));
    return { eye: [1.3, 1.7, 2.2], target: [-0.9, 0.7, -2], update: (t) => { glow.intensity = 6 + Math.sin(t * 7) * 0.6 + Math.sin(t * 13) * 0.4; } };
  },

  hammam(s) {
    s.background = new THREE.Color(0x101113); s.fog = new THREE.Fog(0x101113, 8, 18);
    const marble = M(0xe8e6e1, { map: tex('marble', '#ecebe7', '#c9c6be', 2), roughness: 0.35 });
    room(s, 9, 9, 3.6, marble, M(0xd9d6cf, { map: tex('marble', '#dcd9d2', '#bfbbb2', 2) }), marble);
    // central heated slab
    add(s, new THREE.CylinderGeometry(1.7, 1.8, 0.55, 8), marble, 0, 0.27, -0.5);
    // dome with star lights
    const dome = add(s, new THREE.SphereGeometry(3.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M(0xcfccc4, { side: THREE.BackSide }), 0, 3.55, -0.5);
    dome.scale.y = 0.45;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.6;
      add(s, new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3d6 }), Math.cos(a) * r, 4.6 - r * 0.3, -0.5 + Math.sin(a) * r);
    }
    // wall basins (kurna)
    for (const [x, z, ry] of [[-4.3, -2, Math.PI / 2], [-4.3, 1.5, Math.PI / 2], [4.3, -2, -Math.PI / 2], [4.3, 1.5, -Math.PI / 2]]) {
      add(s, new THREE.CylinderGeometry(0.35, 0.25, 0.3, 20), marble, x, 0.8, z, ry);
      box(s, 0.12, 0.25, 0.12, M(0xc8a96b, { metalness: 0.8, roughness: 0.3 }), x + (x < 0 ? -0.1 : 0.1), 1.05, z);
    }
    lamp(s, 0, 3.0, -0.5, 0xfff0d8, 8, 12); lamp(s, -3, 2.6, 3, 0xffe2b8, 3, 8); lamp(s, 3, 2.6, 3, 0xffe2b8, 3, 8);
    s.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
    return { eye: [0.4, 1.8, 4.1], target: [0, 1.3, -3], update: () => {} };
  },

  relax(s) {
    s.background = new THREE.Color(0x0f0d0b); s.fog = new THREE.Fog(0x0f0d0b, 10, 22);
    room(s, 12, 12, 3.4, M(0x9b6f48, { map: tex('planks', '#9b6f48', '#7f5837', 5) }), M(0xd8cdbd), M(0x2b241e));
    for (let i = 0; i < 3; i++) { lounger(s, -3.5 + i * 3.5, -3.8, 0, 0xe6dccb); }
    for (let i = 0; i < 2; i++) { lounger(s, -5, 0 + i * 2.6, Math.PI / 2, 0xe6dccb); }
    // low table with tea
    add(s, new THREE.CylinderGeometry(0.6, 0.6, 0.06, 24), M(0x5b3b24), 0.5, 0.42, 0.5);
    add(s, new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), M(0x5b3b24), 0.5, 0.2, 0.5);
    add(s, new THREE.SphereGeometry(0.12, 16, 12), M(0xf2efe9, { roughness: 0.3 }), 0.4, 0.55, 0.45);
    // water wall
    box(s, 3.2, 2.6, 0.2, M(0x1d2b30, { roughness: 0.15, metalness: 0.3 }), 3.5, 0, -5.85);
    for (let i = 0; i < 7; i++) plant(s, -5.5 + i * 1.6, -5.5, 1.2 + (i % 3) * 0.3);
    plant(s, 5.4, 4.8, 1.8); plant(s, -5.4, 4.8, 1.8);
    for (const x of [-4, 0, 4]) lamp(s, x, 3.1, -1, 0xffcf96, 4, 9);
    s.add(new THREE.HemisphereLight(0xffe9cc, 0x2a2019, 0.55));
    return { eye: [1.8, 1.55, 5], target: [-1, 0.7, -3], update: () => {} };
  },

  massage(s) {
    s.background = new THREE.Color(0x0d0b0a); s.fog = new THREE.Fog(0x0d0b0a, 6, 14);
    room(s, 5.5, 5.5, 3, M(0x7d5a3e, { map: tex('planks', '#7d5a3e', '#62452f', 3) }), M(0xc9b9a3), M(0x221c17));
    // massage tables with towels
    for (const x of [-1.1, 1.1]) {
      box(s, 0.75, 0.72, 1.95, M(0xf3efe8, { roughness: 1 }), x, 0, -0.4);
      box(s, 0.8, 0.06, 0.6, M(0xb59a7a, { roughness: 1 }), x, 0.72, 0.1);
    }
    // candles
    for (let i = 0; i < 7; i++) {
      const x = -2.4 + i * 0.8, z = -2.45;
      add(s, new THREE.CylinderGeometry(0.06, 0.06, 0.18 + (i % 3) * 0.08, 12), M(0xf5ecdd), x, 0.85, z);
      if (i % 2 === 0) lamp(s, x, 1.05, z + 0.05, 0xffa45c, 1.6, 4);
    }
    box(s, 5.3, 0.75, 0.4, M(0x4a3222), 0, 0, -2.5);
    plant(s, 2.3, 2.2, 1.5); plant(s, -2.3, 2.2, 1.5);
    lamp(s, 0, 2.8, 0, 0xffc58a, 2.5, 7);
    s.add(new THREE.HemisphereLight(0xffd9b0, 0x1f160f, 0.35));
    return { eye: [0, 1.6, 2.4], target: [0, 0.6, -1.6], update: () => {} };
  },

  jacuzzi(s) {
    s.background = new THREE.Color(0x0b1012); s.fog = new THREE.Fog(0x0b1012, 7, 16);
    room(s, 7, 7, 3.2, M(0x2c3a3f, { map: tex('tiles', '#2f4046', '#24333a', 10) }), M(0x24343a, { map: tex('tiles', '#2a3b41', '#203036', 8) }), M(0x151d20));
    // open tub: outer wall, rim ring and an inner tiled basin (no lids over the water)
    const stone = M(0xe7e3db, { roughness: 0.4, side: THREE.DoubleSide });
    add(s, new THREE.CylinderGeometry(1.75, 1.8, 0.7, 48, 1, true), stone, 0, 0.35, -0.6);
    const rim = add(s, new THREE.RingGeometry(1.5, 1.75, 48), stone, 0, 0.7, -0.6); rim.rotation.x = -Math.PI / 2;
    add(s, new THREE.CylinderGeometry(1.5, 1.5, 0.6, 48, 1, true), M(0x3fb3c9, { side: THREE.DoubleSide }), 0, 0.4, -0.6);
    const floorDisk = add(s, new THREE.CircleGeometry(1.5, 48), M(0x2f9fb5), 0, 0.11, -0.6); floorDisk.rotation.x = -Math.PI / 2;
    const wv = water(s, 3, 3, 0.66, 0x46c1d6, 24, true); wv.mesh.position.z = -0.6;
    // rising bubbles
    const bubbles = [];
    const bMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.1 });
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 1.3;
      const b = add(s, new THREE.SphereGeometry(0.025 + Math.random() * 0.02, 6, 4), bMat, Math.cos(a) * r, 0.1 + Math.random() * 0.55, -0.6 + Math.sin(a) * r);
      b.userData.v = 0.2 + Math.random() * 0.35; bubbles.push(b);
    }
    lamp(s, 0, 0.55, -0.6, 0x5fe0ff, 3, 4);
    lamp(s, 0, 3, 0, 0xfff2dd, 4, 10);
    plant(s, 3, -3, 1.6); plant(s, -3, -3, 1.6);
    box(s, 1.6, 0.06, 0.6, M(0xffffff, { roughness: 1 }), 2.6, 0.45, 1.6);
    s.add(new THREE.HemisphereLight(0xbfe9ff, 0x1b2326, 0.9));
    return { eye: [0, 2.5, 4.3], target: [0, 0.3, -1.2], update: (t, dt) => {
      wv.update(t * 2.2);
      for (const b of bubbles) { b.position.y += b.userData.v * dt; if (b.position.y > 0.68) b.position.y = 0.05; }
    } };
  },

  vip(s) {
    const z = ZONES.jacuzzi(s);
    s.background = new THREE.Color(0x0d0b09); s.fog = new THREE.Fog(0x0d0b09, 8, 16);
    // sofa and table in front of the jacuzzi
    const gold = M(0xc8a96b, { metalness: 0.7, roughness: 0.35 });
    box(s, 2.6, 0.45, 0.9, M(0x2b2b30, { roughness: 0.9 }), -2.1, 0, 2.3, Math.PI / 2.4);
    box(s, 2.6, 0.5, 0.25, M(0x2b2b30, { roughness: 0.9 }), -2.45, 0.45, 2.15, Math.PI / 2.4);
    add(s, new THREE.CylinderGeometry(0.45, 0.45, 0.05, 24), gold, -0.9, 0.48, 2.2);
    add(s, new THREE.CylinderGeometry(0.05, 0.05, 0.46, 8), gold, -0.9, 0.23, 2.2);
    lamp(s, -2.6, 2.2, 3.0, 0xffc98a, 3, 6);
    return { ...z, eye: [2.9, 2.3, 3.3], target: [-1.2, 0.5, 0.6] };
  },
};

/**
 * Builds a zone into the scene and runs it on the canvas.
 * Drag (or tilt the phone, once allowed) to look around from the eye point.
 */
export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 80);
  let scene = null, zone = null, raf = 0, last = 0, t0 = 0;
  let yaw = 0, pitch = 0, baseYaw = 0, basePitch = 0, gyro = null;
  const eye = new THREE.Vector3(), from = new THREE.Vector3();

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // The info sheet covers the lower part of the screen, so centre the view
    // in the upper part: render the bottom of a taller virtual frame.
    // Field of view is set horizontally, so narrow portrait phones still see the room.
    const H = h * 1.4, hfov = (w < h ? 74 : 70) * Math.PI / 180;
    camera.fov = Math.min(130, 2 * Math.atan(Math.tan(hfov / 2) * H / w) * 180 / Math.PI);
    camera.setViewOffset(w, H, 0, h * 0.4, w, h);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  function load(kind) {
    scene = new THREE.Scene();
    zone = ZONES[kind](scene);
    eye.set(...zone.eye);
    const dir = new THREE.Vector3(...zone.target).sub(eye).normalize();
    baseYaw = Math.atan2(dir.x, -dir.z); basePitch = Math.asin(dir.y);
    yaw = 0; pitch = 0;
    from.set(eye.x * 0.3, eye.y + 6, eye.z + 6); // fly in from above, like stepping into the room
    t0 = performance.now(); resize();
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    const k = Math.min(1, (now - t0) / 1600), e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(from, eye, e);
    const y = baseYaw + yaw + (gyro ? gyro.yaw : 0), p = Math.max(-1.1, Math.min(1.1, basePitch + pitch + (gyro ? gyro.pitch : 0) - (1 - e) * 0.6));
    camera.lookAt(camera.position.x + Math.sin(y) * Math.cos(p), camera.position.y + Math.sin(p), camera.position.z - Math.cos(y) * Math.cos(p));
    zone.update && zone.update(now / 1000, dt);
    renderer.render(scene, camera);
  }

  // drag to look around
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw = drag.yaw - (e.clientX - drag.x) * 0.005;
    pitch = Math.max(-0.9, Math.min(0.9, drag.pitch + (e.clientY - drag.y) * 0.004));
  });
  const up = () => { drag = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  function onOrient(e) {
    if (e.alpha == null) return;
    if (!gyro) gyro = { a0: e.alpha, b0: e.beta, yaw: 0, pitch: 0 };
    gyro.yaw = -((e.alpha - gyro.a0) * Math.PI) / 180;
    gyro.pitch = ((e.beta - gyro.b0) * Math.PI) / 180 * 0.8;
  }
  async function enableGyro() {
    if (gyro) { removeEventListener('deviceorientation', onOrient); gyro = null; return false; }
    try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission(); } catch (_) {}
    addEventListener('deviceorientation', onOrient);
    return true;
  }

  function stop() { cancelAnimationFrame(raf); raf = 0; if (gyro) { removeEventListener('deviceorientation', onOrient); gyro = null; } }

  return { load, stop, enableGyro };
}
