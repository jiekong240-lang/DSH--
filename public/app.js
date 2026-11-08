/* ============================================================
 * 贾维斯 · GPU 粒子系统 + 流沙式形状成形
 * Three.js WebGL + 自定义 Shader
 * 对话识别主题 → CUDA 生成高精度点云 → 粒子流动堆积成形
 * 工程取舍：CUDA 优先 + 本地回退、类型数组、GPU 渲染
 * 色调：白底 + 高对比灰色粒子（科技感，形状可辨）
 * 形状：哈里发塔式分段收分
 * ============================================================ */
import * as THREE from 'three';

const CONFIG = {
  PARTICLE_COUNT: 12000,
  BASE_SPEED: 0.018,
  ACTIVITY_BOOST: 0.06,
  DAMPING: 0.97,
  SETTLE_DAMPING: 0.88,
  POINT_SIZE: 3.2,
};

const canvas = document.getElementById('scene');
const messagesEl = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('input');
const statusEl = document.getElementById('status');
const pcountEl = document.getElementById('pcount');

let activity = 0;
let currentShape = null;
let targetPoints = null;
let targetAssignments = null;
let renderer, scene, camera, points, geometry, material;
let positions, velocities;

/* ---------- 哈里发塔式局部回退生成 ---------- */
function generateBurjLocal(n = 2400) {
  const pts = new Float32Array(n * 3);
  let idx = 0;

  // 分段高度与半径（模拟哈里发塔收分）
  const sections = [
    { h0: -3.6, h1: -2.2, r: 1.15, twist: 0.0 },
    { h0: -2.2, h1: -1.0, r: 0.92, twist: 0.4 },
    { h0: -1.0, h1: 0.4,  r: 0.68, twist: 0.8 },
    { h0: 0.4,  h1: 1.6,  r: 0.46, twist: 1.2 },
    { h0: 1.6,  h1: 2.6,  r: 0.28, twist: 1.6 },
    { h0: 2.6,  h1: 3.4,  r: 0.14, twist: 2.0 },
    { h0: 3.4,  h1: 3.9,  r: 0.05, twist: 2.4 }, // 尖塔
  ];

  const perSection = Math.floor(n / sections.length);

  for (const s of sections) {
    for (let i = 0; i < perSection && idx < n; i++, idx++) {
      const t = i / perSection;
      const y = s.h0 + (s.h1 - s.h0) * t;
      const ang = t * Math.PI * 6 + s.twist + Math.random() * 0.5;
      const rr = s.r * (0.72 + Math.random() * 0.28);
      const i3 = idx * 3;
      pts[i3]     = Math.cos(ang) * rr;
      pts[i3 + 1] = y;
      pts[i3 + 2] = Math.sin(ang) * rr * 0.55;
    }
  }

  // 补齐剩余点
  while (idx < n) {
    const i3 = idx * 3;
    pts[i3] = 0;
    pts[i3 + 1] = 3.6 + Math.random() * 0.3;
    pts[i3 + 2] = 0;
    idx++;
  }

  return pts;
}

function generateSphereLocal(n = 1600) {
  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = 2.4 + (Math.random() - 0.5) * 0.3;
    pts[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pts[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.85;
    pts[i * 3 + 2] = r * Math.cos(phi);
  }
  return pts;
}

async function fetchCudaPoints(shape) {
  try {
    const r = await fetch('/api/cuda/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape, n: shape === 'tower' || shape === 'burj' ? 2800 : 1800 }),
    });
    const data = await r.json();
    if (data.ok && Array.isArray(data.points) && data.points.length > 0) {
      const flat = new Float32Array(data.points.length * 3);
      for (let i = 0; i < data.points.length; i++) {
        flat[i * 3] = data.points[i][0];
        flat[i * 3 + 1] = data.points[i][1];
        flat[i * 3 + 2] = data.points[i][2];
      }
      return { points: flat, cuda: !!data.cuda };
    }
  } catch { /* ignore */ }
  return null;
}

async function setShape(name) {
  if (!name) {
    currentShape = null;
    targetPoints = null;
    targetAssignments = null;
    return;
  }

  currentShape = name;
  statusEl.textContent = 'CUDA 生成中…';

  const cudaResult = await fetchCudaPoints(name);
  let pts;
  let usedCuda = false;

  if (cudaResult) {
    pts = cudaResult.points;
    usedCuda = cudaResult.cuda;
  } else {
    pts = (name === 'tower' || name === 'burj') ? generateBurjLocal() : generateSphereLocal();
  }

  targetPoints = pts;
  const tn = pts.length / 3;
  targetAssignments = new Uint16Array(CONFIG.PARTICLE_COUNT);
  for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
    targetAssignments[i] = Math.floor(Math.random() * tn);
  }
  activity = 1.0;
  statusEl.textContent = usedCuda ? 'CUDA 就绪' : '本地回退';
}

/* ---------- Three.js 初始化 ---------- */
function init() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0xf7f7f8, 1);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 9);

  createParticles();
  window.addEventListener('resize', onResize);
  animate();
  pcountEl.textContent = CONFIG.PARTICLE_COUNT.toLocaleString();
}

function createParticles() {
  const n = CONFIG.PARTICLE_COUNT;
  positions = new Float32Array(n * 3);
  velocities = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const phases = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 14;
    positions[i3 + 1] = (Math.random() - 0.5) * 10;
    positions[i3 + 2] = (Math.random() - 0.5) * 5;
    velocities[i3] = (Math.random() - 0.5) * 0.015;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.015;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.008;
    sizes[i] = 0.8 + Math.random() * 2.2;
    phases[i] = Math.random() * Math.PI * 2;
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uActivity: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uActivity;
      uniform float uPixelRatio;
      varying float vAlpha;
      varying float vActivity;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float size = aSize * (1.15 + uActivity * 1.6);
        gl_PointSize = size * uPixelRatio * (240.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = 0.62 + uActivity * 0.28 + sin(uTime * 0.9 + aPhase) * 0.06;
        vActivity = uActivity;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vActivity;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float soft = smoothstep(0.48, 0.08, d);
        vec3 color = mix(vec3(0.55, 0.56, 0.58), vec3(0.18, 0.19, 0.21), vActivity);
        gl_FragColor = vec4(color, soft * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);
}

function updateParticles(dt) {
  activity *= Math.pow(0.955, dt * 60);
  material.uniforms.uActivity.value = activity;
  material.uniforms.uTime.value += dt;

  const boost = CONFIG.BASE_SPEED + activity * CONFIG.ACTIVITY_BOOST;
  const n = CONFIG.PARTICLE_COUNT;
  const hasTarget = targetPoints && targetAssignments;

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    let tx = 0, ty = 0.2, tz = 0;

    if (hasTarget) {
      const ti = targetAssignments[i] * 3;
      tx = targetPoints[ti];
      ty = targetPoints[ti + 1];
      tz = targetPoints[ti + 2];
    }

    const dx = tx - positions[i3];
    const dy = ty - positions[i3 + 1];
    const dz = tz - positions[i3 + 2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const force = boost * (1.0 - Math.min(1.0, dist / 7.0));

    velocities[i3] += (dx / dist) * force;
    velocities[i3 + 1] += (dy / dist) * force;
    velocities[i3 + 2] += (dz / dist) * force * 0.55;

    const damp = dist < 0.35 ? CONFIG.SETTLE_DAMPING : CONFIG.DAMPING;
    velocities[i3] *= damp;
    velocities[i3 + 1] *= damp;
    velocities[i3 + 2] *= damp;

    positions[i3] += velocities[i3];
    positions[i3 + 1] += velocities[i3 + 1];
    positions[i3 + 2] += velocities[i3 + 2];

    if (positions[i3] < -8 || positions[i3] > 8) velocities[i3] *= -0.5;
    if (positions[i3 + 1] < -6 || positions[i3 + 1] > 6) velocities[i3 + 1] *= -0.5;
  }

  geometry.attributes.position.needsUpdate = true;
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
}

let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  updateParticles(dt);
  renderer.render(scene, camera);
}

/* ---------- 聊天 ---------- */
const history = [];
function addMsg(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  history.push({ role, text });
  if (history.length > 24) history.shift();
}

async function send(text) {
  if (!text.trim()) return;
  addMsg('user', text);
  input.value = '';
  statusEl.textContent = '思考中…';
  activity = 1.0;

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history.slice(-8) }),
    });
    const data = await r.json();
    addMsg('jarvis', data.reply || '（无回复）');
    if (data.shape) await setShape(data.shape);
  } catch (e) {
    addMsg('jarvis', '连接失败：' + (e.message || String(e)));
  }
  statusEl.textContent = '就绪';
  activity = Math.max(activity, 0.7);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  send(input.value);
});

addMsg('jarvis', '我是贾维斯。聊到哈里发塔或球体时，会优先用 CUDA 生成点云并堆积。');

init();
