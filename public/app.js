/* ============================================================
 * 数字孪生 · 本地监控中枢 — 前端主程序
 * Three.js 3D 场景 + HUD 数据渲染 + 每3分钟数据同步
 * ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------------- 配置 ---------------- */
const qs = new URLSearchParams(location.search);
const SYNC_INTERVAL = Math.max(5, parseFloat(qs.get('interval') || '180')) * 1000; // 默认 180s = 3分钟
const HIST_MAX = 24;
const CITY_MAX = 48; // 代码城市最多渲染的楼宇数

/* ---------------- 工具 ---------------- */
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtBps = (v) =>
  v >= 2 ** 30 ? (v / 2 ** 30).toFixed(2) + ' GB/s'
  : v >= 2 ** 20 ? (v / 2 ** 20).toFixed(2) + ' MB/s'
  : v >= 1024 ? (v / 1024).toFixed(1) + ' KB/s'
  : Math.round(v) + ' B/s';
const timeStr = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmtUptime = (s) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + '天 ' : '') + h + '小时' + m + '分';
};
const loadStateText = (p) =>
  p < 30 ? '低载 IDLE' : p < 60 ? '正常 NOMINAL' : p < 85 ? '高载 HIGH' : '满载 SATURATED';

/* ---------------- 全局状态 ---------------- */
const state = {
  booted: false, syncing: false,
  nextSyncAt: 0, lastSyncAt: 0,
  metrics: null, focus: null,
  hist: { cpu: [], rx: [], tx: [] },
};

/* ============================ 3D 场景 ============================ */
let renderer = null, scene, camera, controls, composer, bloomPass;
let coreGroup, coreInner, shellA, shellB, haloSprite, ringA, ringB, ringC, coreLight;
let waves = [], cubes = null, cubeData = [], haloGroup, dust, dustGeo, dustData = [];
let cityGeo = null, cityEdgeGeo = null, focusSprite = null;
const city = { map: new Map(), bodies: [], spiral: [], occupied: new Set() };
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
let pointerClient = { x: 0, y: 0 };
let hoveredKey = null;
const clock = new THREE.Clock();
let frames = 0, fpsAt = performance.now();

const cLow = new THREE.Color(0x00ffa3), cMid = new THREE.Color(0x00e5ff),
      cHigh = new THREE.Color(0xffb300), cCrit = new THREE.Color(0xff3b5c),
      WHITE = new THREE.Color(0xffffff);
const _c = new THREE.Color();
function loadColor(p) {
  if (p < 40) return _c.copy(cLow).lerp(cMid, p / 40);
  if (p < 70) return _c.copy(cMid).lerp(cHigh, (p - 40) / 30);
  return _c.copy(cHigh).lerp(cCrit, Math.min(1, (p - 70) / 25));
}
const cssColor = (p) => '#' + loadColor(p).getHexString();

function glowTexture(inner, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, 'rgba(0,180,255,0.28)');
  gr.addColorStop(1, 'rgba(0,40,80,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function initThree() {
  const canvas = $('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  $('glver').textContent = 'WEBGL' + (renderer.capabilities.isWebGL2 ? '2' : '1');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010409);
  scene.fog = new THREE.FogExp2(0x02060f, 0.015);

  camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);
  camera.position.set(17, 12, 20);

  controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2.2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.minDistance = 9;
  controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.saveState();

  /* 灯光 */
  scene.add(new THREE.HemisphereLight(0x2a5a8c, 0x020408, 0.7));
  coreLight = new THREE.PointLight(0x00e5ff, 100, 0, 2);
  coreLight.position.set(0, 2.8, 0);
  scene.add(coreLight);
  const dl = new THREE.DirectionalLight(0x7fb8ff, 1.1);
  dl.position.set(14, 22, 10);
  scene.add(dl);

  /* ---- 中央能量核心 ---- */
  coreGroup = new THREE.Group();
  coreGroup.position.y = 2.6;
  scene.add(coreGroup);

  coreInner = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.15, 3),
    new THREE.MeshBasicMaterial({ color: 0x0899b8 })
  );
  coreGroup.add(coreInner);

  shellA = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.9, 1),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true, transparent: true, opacity: 0.5 })
  );
  coreGroup.add(shellA);
  shellB = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.35, 0),
    new THREE.MeshBasicMaterial({ color: 0x3b82f6, wireframe: true, transparent: true, opacity: 0.22 })
  );
  coreGroup.add(shellB);

  const mkRing = (r, color, op) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.022, 8, 128),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op })
    );
    coreGroup.add(m);
    return m;
  };
  ringA = mkRing(2.9, 0x00e5ff, 0.85);
  ringB = mkRing(3.4, 0x3b82f6, 0.5);
  ringC = mkRing(3.9, 0xff2fb3, 0.4);

  haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(0,229,255,0.85)'), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  haloSprite.scale.setScalar(8);
  coreGroup.add(haloSprite);

  /* ---- 地面 ---- */
  const grid1 = new THREE.GridHelper(64, 52, 0x0a4a66, 0x072a3d);
  grid1.material.transparent = true;
  grid1.material.opacity = 0.5;
  scene.add(grid1);

  const polar = new THREE.PolarGridHelper(11, 16, 6, 72, 0x00e5ff, 0x0a5577);
  polar.material.transparent = true;
  polar.material.opacity = 0.26;
  polar.position.y = 0.01;
  scene.add(polar);

  const stage = new THREE.Mesh(
    new THREE.CircleGeometry(5.4, 64),
    new THREE.MeshBasicMaterial({
      map: glowTexture('rgba(0,229,255,0.55)', 512), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35,
    })
  );
  stage.rotation.x = -Math.PI / 2;
  stage.position.y = 0.05;
  scene.add(stage);

  /* ---- 代码城市几何资源 + 中央聚焦文件名 ---- */
  cityGeo = new THREE.BoxGeometry(0.9, 1, 0.9);
  cityGeo.translate(0, 0.5, 0);
  cityEdgeGeo = new THREE.EdgesGeometry(cityGeo);
  focusSprite = textSprite('CODE CITY', { w: 512, h: 96, font: 'bold 46px Consolas' });
  focusSprite.scale.set(5.6, 1.05, 1);
  focusSprite.position.set(0, 7.1, 0);
  scene.add(focusSprite);

  /* ---- 悬浮立方体光环 (数据环) ---- */
  const CN = 120;
  cubes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.16),
    new THREE.MeshBasicMaterial(), CN
  );
  cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < CN; i++) {
    cubeData.push({
      a: (i / CN) * Math.PI * 2,
      sp: 0.5 + Math.random() * 0.9,
      ph: Math.random() * Math.PI * 2,
    });
    cubes.setColorAt(i, new THREE.Color(i % 9 === 0 ? 0xff2fb3 : i % 3 === 0 ? 0x3b82f6 : 0x59d9ff));
  }
  haloGroup = new THREE.Group();
  haloGroup.add(cubes);
  haloGroup.position.y = 2.6;
  haloGroup.rotation.x = 0.38;
  scene.add(haloGroup);

  /* ---- 漂浮尘埃粒子 ---- */
  const DN = 1000;
  dustGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(DN * 3);
  for (let i = 0; i < DN; i++) {
    dustData.push({
      r: 6 + Math.random() * 24,
      a: Math.random() * Math.PI * 2,
      y: Math.random() * 16,
      sp: 0.15 + Math.random() * 0.5,
    });
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0x66d9ff, size: 0.07, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(dust);

  /* ---- 远景星幕 ---- */
  const SN = 800;
  const sp = new Float32Array(SN * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < SN; i++) {
    v.randomDirection().multiplyScalar(150 + Math.random() * 130);
    sp[i * 3] = v.x; sp[i * 3 + 1] = Math.abs(v.y) * 0.7 + 10; sp[i * 3 + 2] = v.z;
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sgeo, new THREE.PointsMaterial({
    color: 0x8fd4ff, size: 0.9, transparent: true, opacity: 0.5, depthWrite: false,
  })));

  /* ---- 后处理: 泛光 ---- */
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.55, 0.25);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  /* ---- 交互 ---- */
  canvas.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    pointerClient = { x: e.clientX, y: e.clientY };
  });
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && hoveredKey) setFocusFile(hoveredKey, true);
    downAt = null;
  });
  canvas.addEventListener('dblclick', () => {
    controls.reset();
    toast('视角已复位 VIEW RESET');
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });
}

/* ---- 代码城市: 文件注册表的 3D 数字孪生 ----
 * 每个被智能体触达的文件 = 一座楼宇:
 *   楼高 ~ 文件大小, 颜色/亮度 ~ 最近修改时间,
 *   编辑事件 -> 该楼脉冲 + 长高 + 射向核心的数据光束 + 中央显示文件名 */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function buildSpiral() {
  city.spiral.length = 0;
  for (let i = 0; i < 460; i++) {
    const a = i * 2.399963; /* 黄金角: 均匀散射不重叠 */
    const r = 5.2 + 1.12 * Math.sqrt(i);
    city.spiral.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
}
function slotFor(key) {
  let idx = hashStr(key) % city.spiral.length;
  while (city.occupied.has(idx)) idx = (idx + 1) % city.spiral.length;
  city.occupied.add(idx);
  return city.spiral[idx];
}
const heightFor = (fi) => 1.1 + Math.min(4.0, Math.log10((fi.bytes || 0) + 1) * 1.0);
const fmtBytes = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : (n || 0) + ' B';

const _cc = new THREE.Color();
function recencyColor(ms) {
  if (ms < 30e3) return _cc.set(0xd9ffff);
  if (ms < 120e3) return _cc.set(0x00e5ff);
  if (ms < 600e3) return _cc.set(0x2b8fd8);
  return _cc.set(0x22659c);
}

function textSprite(text, { w = 256, h = 64, font = 'bold 30px Consolas', color = '#cfffff' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.userData.canvas = c;
  sp.userData.tex = tex;
  sp.userData.font = font;
  sp.userData.color = color;
  drawTextSprite(sp, text);
  return sp;
}
function drawTextSprite(sp, text) {
  const c = sp.userData.canvas;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = sp.userData.font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,229,255,.9)';
  g.shadowBlur = 12;
  g.fillStyle = sp.userData.color;
  g.fillText(text, c.width / 2, c.height / 2);
  sp.userData.tex.needsUpdate = true;
}

function createBuilding(fi) {
  const slot = slotFor(fi.key);
  const g = new THREE.Group();
  g.position.set(slot[0], 0, slot[1]);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x03141f, emissive: 0x00e5ff, emissiveIntensity: 0.25,
    metalness: 0.55, roughness: 0.4,
    transparent: !fi.exists, opacity: fi.exists ? 1 : 0.4,
  });
  const body = new THREE.Mesh(cityGeo, mat);
  body.userData.key = fi.key;
  const edges = new THREE.LineSegments(
    cityEdgeGeo,
    new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.55 })
  );
  edges.scale.setScalar(1.002);
  body.add(edges);
  const baseRing = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.92, 32),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
  );
  baseRing.rotation.x = -Math.PI / 2;
  baseRing.position.y = 0.02;
  const label = textSprite(fi.name);
  label.scale.set(3.0, 0.75, 1);
  label.position.y = 1.3;
  g.add(body, baseRing, label);
  scene.add(g);
  return {
    key: fi.key, info: { ...fi }, group: g, body, edges, label, mat,
    curH: 0.1, targetH: heightFor(fi), flash: 0, beam: null, beamT: undefined,
  };
}

function disposeBuilding(b) {
  scene.remove(b.group);
  b.label.userData.tex.dispose();
  b.label.material.dispose();
  b.body.material.dispose();
  b.edges.material.dispose();
  const bi = city.bodies.indexOf(b.body);
  if (bi >= 0) city.bodies.splice(bi, 1);
  city.map.delete(b.key);
}

function upsertBuilding(fi, live) {
  if (!renderer || !fi || !fi.key) return;
  let b = city.map.get(fi.key);
  if (!b) {
    if (city.map.size >= CITY_MAX) {
      let oldest = null, oldTs = Infinity;
      for (const x of city.map.values()) {
        const ts = x.info.lastTs || 0;
        if (ts < oldTs) { oldTs = ts; oldest = x; }
      }
      if (oldest) disposeBuilding(oldest);
    }
    b = createBuilding(fi);
    city.map.set(fi.key, b);
    city.bodies.push(b.body);
  } else {
    Object.assign(b.info, fi);
  }
  b.targetH = heightFor(b.info);
  if (live) {
    b.info.lastTs = fi.lastTs || Date.now();
    b.flash = 1;
    flashBeam(b);
    drawTextSprite(b.label, b.info.name + (b.info.edits > 1 ? ' ×' + b.info.edits : ''));
    setFocusFile(b.key, false);
  }
}

function flashBeam(b) {
  if (!b.beam) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 2.6, 0)]);
    b.beam = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0 }));
    scene.add(b.beam);
  }
  b.beam.visible = true;
  b.beamT = 0;
}

function initCity() {
  buildSpiral();
  fetch('/api/files', { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => {
      for (const f of ((d && d.files) || []).slice(0, CITY_MAX)) upsertBuilding(f, false);
      const top = ((d && d.files) || [])[0];
      setFocusFile(top ? top.key : null, false);
      /* 恢复最近一次真实代码 diff */
      const withDiff = ((d && d.files) || []).find((f) => f.lastDiff);
      if (withDiff) renderDiff({ file: withDiff, diff: withDiff.lastDiff, tool: '恢复 RESTORED', ts: withDiff.lastTs });
    })
    .catch(() => {});
}

/* ---- 同步冲击波 ---- */
function spawnWave(color, delay = 0) {
  if (!renderer) return;
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1.0, 96),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.12;
  scene.add(m);
  waves.push({ m, t: -delay });
}

/* ---- 每帧渲染 ---- */
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v3 = new THREE.Vector3();
const _s3 = new THREE.Vector3();
const tip = () => $('tooltip');

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (renderer) {
    controls.update();

    /* 核心 */
    const avg = state.metrics ? state.metrics.cpu.avgPct : 0;
    coreGroup.scale.setScalar(1 + Math.sin(t * 2.1) * 0.045 + (avg / 100) * 0.3);
    coreInner.rotation.y = t * 0.5;
    coreInner.rotation.z = t * 0.23;
    shellA.rotation.y = -t * 0.35;
    shellA.rotation.x = t * 0.18;
    shellB.rotation.y = t * 0.22;
    shellB.rotation.z = -t * 0.12;
    ringA.rotation.x = t * 0.7; ringA.rotation.y = t * 0.3;
    ringB.rotation.x = -t * 0.45; ringB.rotation.z = t * 0.5;
    ringC.rotation.x = t * 0.3; ringC.rotation.z = -t * 0.6;
    haloSprite.material.opacity = 0.28 + Math.sin(t * 2.1) * 0.08 + (avg / 100) * 0.3;
    coreLight.intensity = 40 + avg * 1.1 + Math.sin(t * 2.1) * 8 + activity.heat * 35;
    if (bloomPass) bloomPass.strength = 0.5 + activity.heat * 0.18;

    /* 代码城市: 楼宇呼吸/冷却/脉冲/光束 */
    const nowMs = Date.now();
    for (const b of city.map.values()) {
      b.flash *= Math.exp(-dt * 2.2);
      b.curH += (b.targetH - b.curH) * (1 - Math.exp(-dt * 3));
      b.body.scale.y = Math.max(0.06, b.curH);
      b.label.position.y = b.curH + 0.62;
      const rec = nowMs - (b.info.lastTs || 0);
      const base = rec < 30e3 ? 1.05 : rec < 120e3 ? 0.7 : rec < 600e3 ? 0.45 : 0.34;
      b.body.material.emissiveIntensity =
        base + b.flash * 2.4 +
        (b.key === state.focus ? 0.55 : 0) +
        Math.sin(t * 2.4 + (hashStr(b.key) % 97)) * 0.04;
      b.edges.material.color.copy(recencyColor(rec)).lerp(WHITE, 0.25 + Math.min(0.5, b.flash * 0.5));
      b.label.material.opacity = Math.min(1, 0.6 + b.flash * 0.4);
      if (b.beamT !== undefined && b.beam) {
        b.beamT += dt;
        if (b.beamT > 1.2) { b.beam.visible = false; b.beamT = undefined; }
        else {
          b.beam.material.opacity = Math.sin(Math.PI * (b.beamT / 1.2)) * 0.85;
          const arr = b.beam.geometry.attributes.position.array;
          arr[0] = b.group.position.x;
          arr[1] = b.curH;
          arr[2] = b.group.position.z;
          b.beam.geometry.attributes.position.needsUpdate = true;
        }
      }
      if (b.card && b.cardT !== undefined) {
        b.cardT += dt;
        b.card.position.set(b.group.position.x, b.curH + 2.5, b.group.position.z);
        if (b.cardT > 8) b.card.material.opacity = Math.max(0, 1 - (b.cardT - 8) / 1.5);
        if (b.cardT > 9.5) { b.card.visible = false; b.cardT = undefined; }
      }
    }
    focusSprite.position.y = 7.1 + Math.sin(t * 1.6) * 0.15;

    /* 冲击波 */
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.t += dt;
      if (w.t <= 0) { w.m.visible = false; continue; }
      w.m.visible = true;
      w.m.scale.setScalar(1 + w.t * 16);
      w.m.material.opacity = Math.max(0, 0.9 - w.t * 0.5);
      if (w.m.material.opacity <= 0) {
        scene.remove(w.m);
        w.m.geometry.dispose();
        w.m.material.dispose();
        waves.splice(i, 1);
      }
    }

    /* 数据环立方体 */
    for (let i = 0; i < cubeData.length; i++) {
      const d = cubeData[i];
      const y = Math.sin(t * d.sp + d.ph) * 0.45;
      _e.set(t * 0.8 + d.ph, t * 0.6, 0);
      _q.setFromEuler(_e);
      _v3.set(Math.cos(d.a) * 9.3, y, Math.sin(d.a) * 9.3);
      _s3.setScalar(0.7 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7)));
      _m4.compose(_v3, _q, _s3);
      cubes.setMatrixAt(i, _m4);
    }
    cubes.instanceMatrix.needsUpdate = true;
    haloGroup.rotation.y = t * (0.12 + activity.heat * 0.55);

    /* 尘埃上浮 */
    const dp = dustGeo.attributes.position.array;
    for (let i = 0; i < dustData.length; i++) {
      const d = dustData[i];
      d.y += d.sp * dt;
      if (d.y > 16) d.y = 0.1;
      dp[i * 3] = Math.cos(d.a + t * 0.03) * d.r;
      dp[i * 3 + 1] = d.y;
      dp[i * 3 + 2] = Math.sin(d.a + t * 0.03) * d.r;
    }
    dustGeo.attributes.position.needsUpdate = true;

    /* 悬停拾取: 文件楼宇 */
    if (city.map.size) {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(city.bodies, false);
      const key = hits.length ? hits[0].object.userData.key : null;
      if (key !== hoveredKey) {
        hoveredKey = key;
        renderer.domElement.style.cursor = key ? 'pointer' : 'default';
      }
      const el = tip();
      if (hoveredKey) {
        const b = city.map.get(hoveredKey);
        if (b) {
          const ago = Math.max(0, Math.round((nowMs - (b.info.lastTs || 0)) / 1000));
          el.style.display = 'block';
          el.style.left = Math.min(pointerClient.x + 16, innerWidth - 280) + 'px';
          el.style.top = Math.max(pointerClient.y - 12, 10) + 'px';
          el.innerHTML = `<b>${esc(b.info.name)}</b> · ${b.info.edits} 次修改 · ${fmtBytes(b.info.bytes)} · ${ago}s 前${b.info.exists ? '' : ' · 未落盘'}`;
        }
      } else el.style.display = 'none';
    }

    composer.render();
  }

  processTweens(now);
  tickCountdown();
  updateMode(now);

  frames++;
  if (now - fpsAt > 500) {
    $('fps').textContent = Math.round((frames * 1000) / (now - fpsAt));
    frames = 0;
    fpsAt = now;
  }
}

/* ============================ HUD ============================ */
function toast(msg, isErr = false) {
  const d = document.createElement('div');
  d.className = 'toast' + (isErr ? ' err' : '');
  d.textContent = msg;
  $('toasts').appendChild(d);
  setTimeout(() => d.classList.add('out'), 3600);
  setTimeout(() => d.remove(), 4200);
}

function setSvc(s) {
  const el = $('svc');
  el.textContent = s;
  el.className = s === 'ONLINE' ? 'ok' : s === 'SYNCING' ? 'warn' : 'err';
}

/* 数字缓动 */
const tweens = [];
function tweenNum(el, to, dec = 0, fmt = null, dur = 900) {
  const from = el._v !== undefined ? el._v : 0;
  el._v = to;
  tweens.push({ el, from, to, dec, fmt, start: performance.now(), dur });
}
function processTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    let k = (now - tw.start) / tw.dur;
    if (k >= 1) { k = 1; tweens.splice(i, 1); }
    const v = tw.from + (tw.to - tw.from) * (1 - Math.pow(1 - k, 3));
    tw.el.textContent = tw.fmt ? tw.fmt(v) : v.toFixed(tw.dec);
  }
}

function setGauge(arcEl, pct) {
  const p = Math.min(100, Math.max(0, pct));
  arcEl.style.strokeDasharray = `${p} 100`;
  arcEl.style.stroke = p >= 88 ? 'url(#gradCrit)' : p >= 70 ? 'url(#gradWarn)' : 'url(#gradCyan)';
}

/* CPU 核心柱 */
function buildCoreBars(n) {
  const box = $('coreBars');
  if (box.childElementCount === n) return;
  box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'cbar';
    d.innerHTML = `<div class="track"><div class="fill"></div></div><em>${pad(i + 1)}</em>`;
    box.appendChild(d);
  }
}
function updateCoreBars(cpu) {
  buildCoreBars(cpu.coresPct.length);
  const bars = $('coreBars').children;
  for (let i = 0; i < bars.length; i++) {
    const p = cpu.coresPct[i] ?? 0;
    const fill = bars[i].querySelector('.fill');
    fill.style.height = p + '%';
    fill.style.setProperty('--c', cssColor(p));
    bars[i].title = `CORE ${pad(i + 1)} — ${p}% · ${loadStateText(p)}`;
    bars[i].classList.toggle('focus', i === state.focus);
  }
}

/* 磁盘条 */
const diskNodes = new Map();
function renderDisks(disks) {
  const box = $('diskBars');
  const seen = new Set();
  for (const d of disks) {
    seen.add(d.drive);
    let n = diskNodes.get(d.drive);
    if (!n) {
      n = document.createElement('div');
      n.className = 'dbar';
      n.innerHTML = `<div class="dl"><span>${d.drive} 卷</span><b></b></div><div class="dt"><div class="df"></div></div>`;
      box.appendChild(n);
      diskNodes.set(d.drive, n);
    }
    n.querySelector('b').textContent = `${d.usedGB.toFixed(1)} / ${d.totalGB.toFixed(0)} GB · ${d.pct}%`;
    const f = n.querySelector('.df');
    f.style.width = d.pct + '%';
    f.style.setProperty('--c', cssColor(d.pct));
  }
  for (const [k, n] of diskNodes) {
    if (!seen.has(k)) { n.remove(); diskNodes.delete(k); }
  }
}

/* 折线图 */
function drawLine(cv, series, opts = {}) {
  const dpr = Math.min(devicePixelRatio, 2);
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);

  g.strokeStyle = 'rgba(0,229,255,0.10)';
  g.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(0, (H * i) / 4);
    g.lineTo(W, (H * i) / 4);
    g.stroke();
  }

  const n = Math.max(...series.map((s) => s.data.length), 2);
  const max = opts.max || Math.max(1, ...series.flatMap((s) => s.data)) * 1.15;

  for (const s of series) {
    if (!s.data.length) continue;
    const pts = s.data.map((v, i) => [
      (i / (n - 1)) * (W - 2) + 1,
      H - 3 - (v / max) * (H - 8),
    ]);
    if (opts.fill) {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, s.color + '30');
      grad.addColorStop(1, s.color + '00');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(pts[0][0], H);
      pts.forEach((p) => g.lineTo(p[0], p[1]));
      g.lineTo(pts[pts.length - 1][0], H);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = s.color;
    g.lineWidth = 1.6;
    g.shadowColor = s.color;
    g.shadowBlur = 6;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
    g.shadowBlur = 0;
    const lp = pts[pts.length - 1];
    g.fillStyle = s.color;
    g.beginPath();
    g.arc(lp[0], lp[1], 2.2, 0, 7);
    g.fill();
  }

  g.fillStyle = 'rgba(160,220,255,0.5)';
  g.font = '9px Consolas';
  g.fillText(opts.fmt ? opts.fmt(max) : Math.round(max) + (opts.unit || ''), 4, 10);
}

function drawCharts() {
  drawLine($('cpuHist'), [{ data: state.hist.cpu, color: '#00e5ff' }], { max: 100, unit: '%' });
  drawLine($('netChart'), [
    { data: state.hist.rx, color: '#00e5ff' },
    { data: state.hist.tx, color: '#ff2fb3' },
  ], { fmt: fmtBps, fill: true });
}

/* 滚动信息条 */
function buildTicker(m) {
  const items = [
    `主机 HOST ${m.sys.hostname}`,
    `系统 OS ${m.sys.platform} · ${m.sys.arch}`,
    `CPU ${m.sys.cpuModel} × ${m.sys.cores}`,
    `GPU ${m.sys.gpu}`,
    `内存 MEM ${m.mem.usedGB.toFixed(1)}/${m.mem.totalGB.toFixed(1)}GB (${m.mem.pct}%)`,
    ...m.disks.map((d) => `磁盘 ${d.drive} ${d.pct}%`),
    `网络 NET ↓${fmtBps(m.net.rxBps)} ↑${fmtBps(m.net.txBps)}`,
    `IP ${m.sys.ips.join(' / ') || '无外部地址'}`,
    `运行 UPTIME ${fmtUptime(m.sys.uptimeSec)}`,
    `采样周期 CYCLE ${SYNC_INTERVAL / 1000}s`,
  ];
  const html = items.map((s) => `<span>${s}</span>`).join('<i>◆</i>');
  $('tickerTrack').innerHTML = html + '<i>◆</i>' + html + '<i>◆</i>';
}

/* ---------------- 编码活动通道 (DSH / ZCODE 实时上报) ---------------- */
const activity = {
  list: [],
  counts: { code: 0, exec: 0, scan: 0, error: 0, task: 0, other: 0 },
  heat: 0, lastAt: 0, lastKind: '',
};
const KIND_ICON = { code: '✎', exec: '▶', scan: '⌕', task: '◆', error: '✖', idle: '◌', session: '⏻', tool: '◇' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function addActivity(e, silent = false) {
  const ev = {
    ts: e.ts || Date.now(), kind: e.kind || 'tool', tool: e.tool || '',
    target: e.target || '', source: e.source || '',
    file: e.file || null, diff: e.diff || null,
  };
  activity.list.unshift(ev);
  if (activity.list.length > 40) activity.list.pop();
  if (Object.prototype.hasOwnProperty.call(activity.counts, ev.kind)) activity.counts[ev.kind]++;
  else activity.counts.other++;
  activity.lastAt = ev.ts;
  activity.lastKind = ev.kind;
  const now = Date.now();
  activity.heat = Math.min(1, activity.list.filter((x) => now - x.ts < 60000).length / 30);
  renderFeed();
  if (ev.diff && (ev.diff.del || ev.diff.ins)) renderDiff(ev);
  if (silent) return;
  /* 3D 联动反应 */
  if (ev.kind === 'code' && ev.file) {
    upsertBuilding(ev.file, true);
    if (ev.diff && (ev.diff.del || ev.diff.ins)) {
      const b = city.map.get(ev.file.key);
      if (b) drawDiffCard(b, ev);
    }
  } else if (ev.kind === 'exec') spawnWave(0xffb300);
  else if (ev.kind === 'error') spawnWave(0xff3b5c);
  else if (ev.kind === 'task') { spawnWave(0x00ffa3); toast('新任务下达 NEW TASK INBOUND'); }
}

/* ---------------- 真实代码 diff 上屏 ---------------- */
function renderDiff(e) {
  const fileEl = $('diffFile');
  const body = $('diffBody');
  if (!body || !e || !e.diff) return;
  const insN = String(e.diff.ins || '').split('\n').length;
  const delN = String(e.diff.del || '').split('\n').filter((s) => s !== '').length;
  fileEl.className = 'diffFile';
  fileEl.innerHTML = `<b>${esc((e.file && e.file.name) || e.target || '变更')}</b><span>+${insN} −${delN} · ${esc(e.tool || '')} · ${timeStr(e.ts || Date.now())}</span>`;
  const rows = [];
  for (const l of String(e.diff.del || '').split('\n').slice(0, 8)) rows.push(`<div class="dl-del">− ${esc(l) || ' '}</div>`);
  for (const l of String(e.diff.ins || '').split('\n').slice(0, 10)) rows.push(`<div class="dl-ins">+ ${esc(l) || ' '}</div>`);
  body.innerHTML = rows.join('');
  body.scrollTop = 0;
}

/* 3D 楼宇上方的真实代码变更卡片 */
function drawDiffCard(b, e) {
  if (!b.card) {
    b.card = textSprite('', { w: 512, h: 288, font: '20px Consolas', color: '#d9f6ff' });
    b.card.scale.set(4.8, 2.7, 1);
    scene.add(b.card);
  }
  const c = b.card.userData.canvas;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 288);
  g.fillStyle = 'rgba(2,14,26,.92)';
  g.fillRect(0, 0, 512, 288);
  g.strokeStyle = 'rgba(0,229,255,.65)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 510, 286);
  g.font = 'bold 22px Consolas';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.fillStyle = '#7fe9ff';
  g.fillText((b.info.name || '').slice(0, 30), 14, 10);
  let y = 44;
  for (const l of String(e.diff.del || '').split('\n').slice(0, 5)) {
    g.fillStyle = '#ff8b9d';
    g.fillText('− ' + l.slice(0, 46), 14, y);
    y += 24;
  }
  for (const l of String(e.diff.ins || '').split('\n').slice(0, 6)) {
    g.fillStyle = '#7dffc8';
    g.fillText('+ ' + l.slice(0, 46), 14, y);
    y += 24;
  }
  b.card.userData.tex.needsUpdate = true;
  b.card.visible = true;
  b.card.material.opacity = 1;
  b.cardT = 0;
}

function renderFeed() {
  const box = $('feedList');
  if (!box) return;
  box.innerHTML = activity.list.slice(0, 9).map((e) => {
    const d = new Date(e.ts);
    return `<div class="fitem k-${esc(e.kind)}"><span class="t">${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</span><span class="k">${KIND_ICON[e.kind] || '◇'}</span><span class="tg" title="${esc(e.tool)} ${esc(e.target)}">${esc(e.tool || e.kind)}${e.target ? ' · ' + esc(e.target) : ''}</span><span class="src">${esc(e.source)}</span></div>`;
  }).join('');
  $('cntCode').textContent = activity.counts.code;
  $('cntExec').textContent = activity.counts.exec;
  $('cntScan').textContent = activity.counts.scan;
  $('cntErr').textContent = activity.counts.error;
}

function initActivityStream() {
  fetch('/api/events', { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => {
      for (const e of (d.events || []).slice(-14)) addActivity(e, true);
      renderFeed();
    })
    .catch(() => {});
  /* 自动化/无头环境不开 SSE 长连接(会挂住虚拟时间调度), 只拉一次历史 */
  if (navigator.webdriver || qs.has('nostream')) return;
  try {
    const es = new EventSource('/api/stream');
    es.onmessage = (m) => {
      try {
        const d = JSON.parse(m.data);
        if (d.type === 'event' && d.event) addActivity(d.event);
        else if (d.type === 'sentinel' && d.s) renderSentinel(d.s);
        else if (d.type === 'sentinel_toast') toast((d.urgent ? '⚠ ' : '🛡 ') + d.msg, !!d.urgent);
      } catch { /* 脏帧忽略 */ }
    };
  } catch { /* EventSource 不可用则跳过 */ }
}

let modeAt = 0;
function updateMode(now) {
  if (now - modeAt < 500) return;
  modeAt = now;
  const el = $('agentMode');
  const led = $('feedLed');
  const ago = activity.lastAt ? now - activity.lastAt : Infinity;
  let m, cls;
  if (ago < 9000) {
    switch (activity.lastKind) {
      case 'code': m = '编码中 CODING'; cls = 'coding'; break;
      case 'exec': m = '调试中 DEBUGGING'; cls = 'debug'; break;
      case 'error': m = '排障中 FIXING'; cls = 'fault'; break;
      case 'task': m = '规划中 PLANNING'; cls = 'coding'; break;
      default: m = '检索中 SCANNING'; cls = 'scan';
    }
  } else if (ago < 60000) { m = '活跃 ACTIVE'; cls = 'scan'; }
  else { m = '待机 IDLE'; cls = 'idle'; }
  if (el.textContent !== m) {
    el.textContent = m;
    el.className = cls;
    if (led) led.className = 'led ' + (cls === 'fault' ? 'err' : 'ok');
  }
}

/* ---------------- 事件范围过滤 ---------------- */
let eventFilterRequestId = 0;
function applyEventFilter() {
  const fromRaw = String($('filterFrom').value || '').trim();
  const toRaw = String($('filterTo').value || '').trim();
  const from = fromRaw === '' ? null : Number(fromRaw);
  const to = toRaw === '' ? null : Number(toRaw);
  if (fromRaw !== '' && !Number.isFinite(from)) { alert('from 必须是有效的毫秒数'); return Promise.resolve(false); }
  if (toRaw !== '' && !Number.isFinite(to)) { alert('to 必须是有效的毫秒数'); return Promise.resolve(false); }
  if (from !== null && to !== null && from > to) { alert('from 不能大于 to'); return Promise.resolve(false); }
  const params = new URLSearchParams();
  if (from !== null) params.set('from', String(from));
  if (to !== null) params.set('to', String(to));
  const requestId = ++eventFilterRequestId;
  return fetch('/api/events?' + params.toString(), { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then((d) => {
      if (requestId !== eventFilterRequestId) return false;
      const list = $('feedList');
      if (!list) return false;
      if (!Array.isArray(d.events)) throw new Error('事件响应没有 events 数组');
      activity.list = (d.events || []).map((e) => ({
        ts: e.ts, kind: e.kind, tool: e.tool, target: e.target, source: e.source,
        file: e.file, diff: e.diff,
      }));
      // render the last 14 events
      const recent = (d.events || []).slice(-14);
      list.innerHTML = recent.map((e) => {
        const date = new Date(e.ts);
        return `<div class="fitem k-${esc(e.kind)}"><span class="t">${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}</span><span class="k">${KIND_ICON[e.kind] || '◇'}</span><span class="tg" title="${esc(e.tool)} ${esc(e.target)}">${esc(e.tool || e.kind)}${e.target ? ' · ' + esc(e.target) : ''}</span><span class="src">${esc(e.source)}</span></div>`;
      }).join('');
      const counts = d.filteredCounts || d.counts || {};
      $('cntCode').textContent = counts.code || 0;
      $('cntExec').textContent = counts.exec || 0;
      $('cntScan').textContent = counts.scan || 0;
      $('cntErr').textContent = counts.error || 0;
      return true;
    })
    .catch((e) => { if (requestId === eventFilterRequestId) console.error('事件过滤错误:', e); return false; });
}

$('filterBtn').addEventListener('click', applyEventFilter);

/* 按 Enter 错也触发过滤 */
$('filterFrom').addEventListener('keypress', (e) => { if (e.key === 'Enter') applyEventFilter(); });
$('filterTo').addEventListener('keypress', (e) => { if (e.key === 'Enter') applyEventFilter(); });

/* ---------------- 指标渲染 ---------------- */
function applyMetrics(m) {
  state.metrics = m;
  const { cpu, mem, sys, disks, net } = m;

  /* 仪表 */
  tweenNum($('cpuPct'), cpu.avgPct, 1);
  setGauge($('cpuArc'), cpu.avgPct);
  tweenNum($('memPct'), mem.pct, 1);
  setGauge($('memArc'), mem.pct);
  $('memUsed').textContent = mem.usedGB.toFixed(1) + ' GB';
  $('memTotal').textContent = mem.totalGB.toFixed(1) + ' GB';
  $('memFree').textContent = mem.freeGB.toFixed(1) + ' GB';

  updateCoreBars(cpu);

  $('cpuModel').textContent = sys.cpuModel;
  $('cpuModel').title = sys.cpuModel;
  $('cpuCores').textContent = sys.cores + ' 核心';
  $('cpuClock').textContent = cpu.speedMhz ? (cpu.speedMhz / 1000).toFixed(2) + ' GHz' : '--';

  renderDisks(disks);

  tweenNum($('rxBps'), net.rxBps, 0, fmtBps);
  tweenNum($('txBps'), net.txBps, 0, fmtBps);

  $('hostName').textContent = sys.hostname;
  $('osInfo').textContent = sys.platform;
  $('archInfo').textContent = sys.arch;
  $('gpuInfo').textContent = sys.gpu;
  $('gpuInfo').title = sys.gpu;
  $('ipInfo').textContent = sys.ips.join(' / ') || '无外部地址';
  $('ipInfo').title = sys.ips.join(' / ');
  $('upTime').textContent = fmtUptime(sys.uptimeSec);

  /* 历史 */
  state.hist.cpu.push(cpu.avgPct);
  state.hist.rx.push(net.rxBps);
  state.hist.tx.push(net.txBps);
  for (const k of ['cpu', 'rx', 'tx']) if (state.hist[k].length > HIST_MAX) state.hist[k].shift();
  drawCharts();

  buildTicker(m);
}

function setFocusFile(key, toastIt = true) {
  state.focus = key;
  const b = key ? city.map.get(key) : null;
  const el = $('focusFile');
  if (b) {
    drawTextSprite(focusSprite, b.info.name);
    el.textContent = `${b.info.name} · ${b.info.edits} 次修改`;
    el.className = 'ok';
    if (toastIt) toast(`已聚焦 ${b.info.name}`);
  } else {
    drawTextSprite(focusSprite, 'CODE CITY');
    el.textContent = '— 点击3D文件楼宇 —';
    el.className = 'dim';
  }
}

/* ---------------- 数据同步 (每3分钟) ---------------- */
async function doSync(manual = false) {
  if (state.syncing) return;
  state.syncing = true;
  setSvc('SYNCING');
  $('syncState').textContent = '同步中 SYNCING...';
  $('syncState').className = 'dim';
  try {
    const r = await fetch('/api/metrics', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const m = await r.json();
    if (m.error) throw new Error(m.error);
    applyMetrics(m);
    state.lastSyncAt = Date.now();
    setSvc('ONLINE');
    $('lastSyncTime').textContent = timeStr(state.lastSyncAt);
    $('syncState').textContent = '同步成功 OK';
    $('syncState').className = 'ok';
    if (manual) spawnWave(0xff2fb3);
    spawnWave(0x00e5ff);
    spawnWave(0x3b82f6, 0.25);
    toast((manual ? '手动同步完成 MANUAL' : '数据同步完成 DATA SYNCED') + ' · ' + timeStr(state.lastSyncAt));
  } catch (e) {
    setSvc('OFFLINE');
    $('syncState').textContent = '同步失败 FAILED';
    $('syncState').className = 'err';
    toast('数据同步失败: ' + e.message + ' · 15s 后重试', true);
    setTimeout(() => {
      state.syncing = false;
      state.nextSyncAt = Date.now();
    }, 15000);
    return;
  }
  state.syncing = false;
  state.nextSyncAt = Date.now() + SYNC_INTERVAL;
}

function tickCountdown() {
  if (!state.nextSyncAt) return;
  const rem = Math.max(0, state.nextSyncAt - Date.now());
  const frac = 1 - rem / SYNC_INTERVAL;
  $('syncArc').style.strokeDasharray = `${(frac * 100).toFixed(2)} 100`;
  const s = Math.ceil(rem / 1000);
  const txt = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const cd = $('countdown');
  if (cd.textContent !== txt) cd.textContent = txt;
  if (rem === 0 && !state.syncing && state.booted) doSync();
}

/* ---------------- 哨兵智能体 (感知→大脑→权限闸门→影子提案) ---------------- */
const sentinelView = { nextAt: 0 };
function setGateLv(n, on) {
  const el = document.querySelector(`#sentinelPanel .gLv.lv${n}`);
  if (el) el.classList.toggle('on', on);
}
function renderSentinel(s) {
  if (!s || !s.dbCounts) return;
  $('sentCycles').textContent = s.cycles ?? 0;
  $('sentPeriod').textContent = (s.intervalSec || 180) + 's';
  $('sentLlm').textContent = `${(s.brain && s.brain.llmToday) || 0} 次/今日`;
  $('sentBudget').textContent = s.budget ? `${s.budget.toastLeft}/${s.budget.toastLimit}` : '--';
  const mode = $('sentMode');
  mode.textContent = s.shadowMode ? '影子 SHADOW' : '在线 LIVE';
  mode.className = 'modeTag' + (s.shadowMode ? '' : ' live');
  const bt = $('sentBrain');
  if (s.state === 'DEGRADED_RULES') { bt.textContent = '降级·固定规则'; bt.className = 'brainTag degraded'; }
  else if (s.brain && s.brain.lastGood) { bt.textContent = `免费档 ${s.brain.lastGood.split('/')[0]}`; bt.className = 'brainTag'; }
  else { bt.textContent = '待命'; bt.className = 'brainTag'; }
  /* 闸门灯: L0/L1 常开(影子只记录), L2 无授权, L3 红线禁用 */
  setGateLv(0, true); setGateLv(1, true); setGateLv(2, false); setGateLv(3, false);
  if (s.nextRunAt) sentinelView.nextAt = s.nextRunAt;
  const p = (s.recentProposals || [])[0];
  const box = $('sentProp');
  if (p) {
    const d = new Date(p.ts.endsWith('Z') ? p.ts : p.ts + 'Z');
    $('sentPropAgo').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const urgent = /urgent|紧急/.test(p.reason || '') || Number(p.action_level) >= 1 && /旁路/.test(p.reason || '');
    box.className = 'propCard' + (urgent ? ' urgent' : '');
    const blocked = /BLOCKED|NOT_IMPLEMENTED/.test(p.verdict);
    const gateCls = blocked ? 'gate blocked' : 'gate';
    const pending = s.pendingApproval && s.pendingApproval.proposalId === p.id;
    const approveBtn = pending
      ? `<button id="sentApprove" class="btn sent-approve" title="L3 一次性批准 · ${s.pendingApproval.expiresInSec}s 内有效">⚡ 批准本次 ${esc(s.pendingApproval.tool)} (${s.pendingApproval.expiresInSec}s)</button>`
      : '';
    box.innerHTML =
      `<div class="pf">${esc(p.fact)}</div>` +
      `<div class="pr">${esc(p.reason)}</div>` +
      `<div class="pm"><span class="lv">L${p.action_level}·${esc(p.action_tool)}</span>` +
      `<span class="${gateCls}">${esc(p.verdict)}</span>` +
      `<span>置信 ${esc(p.confidence)}</span>` +
      `<span>${p.executed ? '已执行' : '仅记录'}</span>` +
      `<span>${esc(p.brain || '')}</span></div>` + approveBtn;
    if (pending) {
      const btn = $('sentApprove');
      if (btn) btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await fetch('/api/sentinel/approve', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proposalId: s.pendingApproval.proposalId }),
          }).then((x) => x.json());
          toast(r.ok ? `已批准并执行: ${r.tool}` : `批准失败: ${r.error || r.verdict}`, !r.ok);
        } catch (e) { toast('批准请求失败: ' + e.message, true); }
      });
    }
  }
  if (s.dshUrl) {
    const box2 = $('sentProp');
    /* 自愈地址常驻显示, 点击复制 */
    if (!/dshUrl/.test(box2.innerHTML)) {
      box2.innerHTML += `<div class="pm"><span class="gate">DSH: <a href="${esc(s.dshUrl)}" target="_blank" style="color:#7dffc8">${esc(s.dshUrl.slice(0, 34))}…</a></span></div>`;
    }
  }
  const led = $('sentLed');
  if (led) led.className = 'led ' + (s.state === 'ERROR' ? 'err' : 'ok');
}
function initSentinel() {
  fetch('/api/sentinel/state', { cache: 'no-store' })
    .then((r) => r.json()).then(renderSentinel).catch(() => {});
  /* 无 SSE 环境(自动化)用轮询兜底 */
  if (navigator.webdriver || qs.has('nostream')) {
    setInterval(() => {
      fetch('/api/sentinel/state', { cache: 'no-store' })
        .then((r) => r.json()).then(renderSentinel).catch(() => {});
    }, 15000);
  }
  /* 哨兵下轮倒计时 */
  setInterval(() => {
    if (!sentinelView.nextAt) return;
    const rem = Math.max(0, Math.round((sentinelView.nextAt - Date.now()) / 1000));
    const txt = rem >= 3600
      ? `${Math.floor(rem / 3600)}h${pad(Math.floor((rem % 3600) / 60))}m`
      : `${pad(Math.floor(rem / 60))}:${pad(rem % 60)}`;
    const el = $('sentNext');
    if (el && el.textContent !== txt) el.textContent = txt;
  }, 1000);
}

/* ---------------- 启动引导 ---------------- */
const bootLines = [
  '▸ DIGITAL TWIN OPS CORE v2.6 — BOOT SEQUENCE',
  '▸ [ OK ] 渲染内核 WEBGL2 RENDERER .......... READY',
  '▸ [ OK ] 后处理管线 BLOOM PIPELINE ......... ACTIVE',
  '▸ [ OK ] 交互系统 ORBIT / RAYCAST .......... ONLINE',
  '▸ [SYNC] 连接本地数据服务 /api/metrics ...... LINKED',
  `▸ [DATA] 采样周期 SAMPLING PERIOD .......... ${SYNC_INTERVAL / 1000}s`,
  '▸ [SENT] 哨兵智能体 SHADOW MODE ............ 巡查中',
  '▸ ✓ 系统就绪 SYSTEM ONLINE — 数据周期性自动同步',
];
async function runBoot() {
  const log = $('bootlog');
  for (let i = 0; i < bootLines.length; i++) {
    log.textContent += bootLines[i] + '\n';
    const pct = Math.round(((i + 1) / bootLines.length) * 100);
    $('bootbarFill').style.width = pct + '%';
    $('bootPct').textContent = pct + '%';
    await sleep(150 + Math.random() * 160);
  }
  await sleep(350);
  $('boot').classList.add('done');
  setTimeout(() => $('boot').remove(), 900);
  state.booted = true;
  toast('系统上线 SYSTEM ONLINE');
}

/* ---------------- 初始化 ---------------- */
function initClock() {
  const tick = () => {
    const d = new Date();
    $('clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    $('date').textContent = `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 · 星期${'日一二三四五六'[d.getDay()]}`;
  };
  tick();
  setInterval(tick, 250);
}

window.addEventListener('error', (e) => toast('运行错误: ' + e.message, true));

initClock();
try {
  initThree();
} catch (e) {
  $('glver').textContent = '不支持';
  toast('3D 渲染初始化失败: ' + e.message, true);
}
$('histSpan').textContent = `最近 ${Math.max(1, Math.round((HIST_MAX * SYNC_INTERVAL) / 60000))} 分钟`;
$('cycleInfo').textContent = SYNC_INTERVAL >= 60000
  ? `${SYNC_INTERVAL / 1000}s / ${Math.round(SYNC_INTERVAL / 60000)}min`
  : `${SYNC_INTERVAL / 1000}s`;
$('syncNow').addEventListener('click', () => {
  if (!state.syncing) doSync(true);
});
animate();
runBoot();
doSync();
initActivityStream();
initCity();
initSentinel();
