/* ============================================================
 * 贾维斯 · 实时对话粒子界面
 * 粒子响应对话活动，聊天为主，不是监控动画
 * ============================================================ */
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const messagesEl = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('input');
const statusEl = document.getElementById('status');
const pcountEl = document.getElementById('pcount');

let w = 0, h = 0;
function resize() {
  w = canvas.width = innerWidth;
  h = canvas.height = innerHeight;
}
resize();
addEventListener('resize', resize);

/* ---------- 粒子系统 ---------- */
const N = 600;
const particles = [];
for (let i = 0; i < N; i++) {
  particles.push({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.6,
    vy: (Math.random() - 0.5) * 0.6,
    life: Math.random(),
  });
}

let activity = 0; // 0..1 对话活动强度
function tick() {
  activity *= 0.985;
  ctx.fillStyle = 'rgba(1,4,12,0.25)';
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5, cy = h * 0.42;
  for (const p of particles) {
    const dx = cx - p.x, dy = cy - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const pull = (0.0008 + activity * 0.004) * (1 - Math.min(1, dist / 400));
    p.vx += dx * pull;
    p.vy += dy * pull;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0 || p.x > w) p.vx *= -1;
    if (p.y < 0 || p.y > h) p.vy *= -1;

    const alpha = 0.25 + activity * 0.55 + Math.sin(p.life * 6) * 0.1;
    const size = 1.2 + activity * 2.2;
    ctx.fillStyle = activity > 0.4
      ? `rgba(0,229,255,${alpha})`
      : `rgba(100,180,255,${alpha * 0.7})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    p.life += 0.01;
  }
  pcountEl.textContent = N;
  requestAnimationFrame(tick);
}
tick();

/* ---------- 聊天 ---------- */
const history = [];
function addMsg(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  history.push({ role, text });
  if (history.length > 20) history.shift();
}

async function send(text) {
  if (!text.trim()) return;
  addMsg('user', text);
  input.value = '';
  statusEl.textContent = '思考中…';
  activity = 1;

  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history.slice(-8) }),
    });
    const data = await r.json();
    const reply = data.reply || '（无回复）';
    addMsg('jarvis', reply);
  } catch (e) {
    addMsg('jarvis', '连接失败：' + (e.message || e));
  }
  statusEl.textContent = '就绪';
  activity = 0.7;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  send(input.value);
});

addMsg('jarvis', '我是贾维斯。直接说你要做什么。');
