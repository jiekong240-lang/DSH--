/* ============================================================
 * 贾维斯 · GPU 粒子系统
 * Three.js WebGL + 自定义 Shader，渲染在 GPU，仿真在 CPU（可控、可扩展）
 * 工程取舍：类型数组、资源复用、清晰生命周期、可配置参数
 * ============================================================ */
import * as THREE from 'three';

const CONFIG = {
  PARTICLE_COUNT: 8000,
  ATTRACTOR: { x: 0, y: 0.2, z: 0 },
  BASE_SPEED: 0.012,
  ACTIVITY_BOOST: 0.045,
  DAMPING: 0.965,
  POINT_SIZE: 2.8,
};

const canvas = document.getElementById('scene');
const messagesEl = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('input');
const statusEl = document.getElementById('status');
const pcountEl = document.getElementById('pcount');

let activity = 0;
let renderer, scene, camera, points, geometry, material;
let positions, velocities;

function init() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x01040c, 1);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 8);

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
    positions[i3] = (Math.random() - 0.5) * 12;
    positions[i3 + 1] = (Math.random() - 0.5) * 8;
    positions[i3 + 2] = (Math.random() - 0.5) * 4;
    velocities[i3] = (Math.random() - 0.5) * 0.02;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.02;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.01;
    sizes[i] = 0.6 + Math.random() * 1.4;
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
        float size = aSize * (1.0 + uActivity * 1.6);
        gl_PointSize = size * uPixelRatio * (180.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = 0.35 + uActivity * 0.5 + sin(uTime * 1.2 + aPhase) * 0.08;
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
        float soft = smoothstep(0.5, 0.15, d);
        vec3 color = mix(vec3(0.25, 0.55, 1.0), vec3(0.0, 0.9, 1.0), vActivity);
        gl_FragColor = vec4(color, soft * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);
}

function updateParticles(dt) {
  activity *= Math.pow(0.96, dt * 60);
  material.uniforms.uActivity.value = activity;
  material.uniforms.uTime.value += dt;

  const attract = CONFIG.ATTRACTOR;
  const boost = CONFIG.BASE_SPEED + activity * CONFIG.ACTIVITY_BOOST;
  const n = CONFIG.PARTICLE_COUNT;

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    const dx = attract.x - positions[i3];
    const dy = attract.y - positions[i3 + 1];
    const dz = attract.z - positions[i3 + 2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const force = boost * (1.0 - Math.min(1.0, dist / 6.0));

    velocities[i3] += (dx / dist) * force;
    velocities[i3 + 1] += (dy / dist) * force;
    velocities[i3 + 2] += (dz / dist) * force * 0.4;

    velocities[i3] *= CONFIG.DAMPING;
    velocities[i3 + 1] *= CONFIG.DAMPING;
    velocities[i3 + 2] *= CONFIG.DAMPING;

    positions[i3] += velocities[i3];
    positions[i3 + 1] += velocities[i3 + 1];
    positions[i3 + 2] += velocities[i3 + 2];

    // 边界软反弹
    if (positions[i3] < -7 || positions[i3] > 7) velocities[i3] *= -0.6;
    if (positions[i3 + 1] < -5 || positions[i3 + 1] > 5) velocities[i3 + 1] *= -0.6;
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

/* ---------- 聊天（与粒子解耦） ---------- */
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
  } catch (e) {
    addMsg('jarvis', '连接失败：' + (e.message || String(e)));
  }
  statusEl.textContent = '就绪';
  activity = Math.max(activity, 0.65);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  send(input.value);
});

addMsg('jarvis', '我是贾维斯。粒子渲染已切到 GPU。');

init();
