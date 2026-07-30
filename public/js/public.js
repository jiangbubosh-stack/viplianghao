'use strict';

const state = {
  q: '',
  operator: 'all',
  level: 'all',
  sort: 'new',
  page: 1,
  pageSize: 24,
  totalPages: 1,
};

const $ = (sel) => document.querySelector(sel);

// ---- Build digit row (11 inputs) ----
const digitRow = $('#digitRow');
for (let i = 0; i < 11; i++) {
  const input = document.createElement('input');
  input.maxLength = 1;
  input.inputMode = 'numeric';
  input.placeholder = '*';
  input.dataset.idx = i;
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 1);
    if (input.value && i < 10) digitRow.children[i + 1].focus();
  });
  digitRow.appendChild(input);
}

function collectQuery() {
  const digits = Array.from(digitRow.children).map((el) => el.value.trim());
  // Build a query string: '*' for empty, digit for filled. Collapse leading/trailing *? keep as-is for regex.
  const q = digits.map((d) => (d === '' ? '*' : d)).join('');
  // If all *, treat as empty (show all)
  return q.replace(/\*/g, '') === '' ? '' : q;
}

// ---- Marquee ----
async function loadMarquee() {
  try {
    const res = await fetch('/api/recent');
    const json = await res.json();
    const nums = json.data || [];
    if (!nums.length) return;
    const items = nums.map((n) => {
      const masked = n.slice(0, 3) + '****' + n.slice(7);
      return `<span>恭喜 客* 成功下单 ${masked}</span>`;
    });
    const track = $('#marqueeTrack');
    track.innerHTML = items.join('') + items.join('');
  } catch (e) {
    $('#marqueeTrack').innerHTML = '<span>平台担保交易，安全无忧</span>';
  }
}

// ---- Render grid ----
function renderCards(items) {
  const grid = $('#grid');
  if (!items.length) {
    grid.innerHTML = '<div class="empty"><div class="big">📭</div>没有找到匹配的号码，换个条件试试～</div>';
    return;
  }
  grid.innerHTML = items.map((it) => {
    const premium = it.level === '靓号';
    const masked = it.number; // show full; for privacy could mask, but this is a showcase
    const star = premium ? '<span class="star">★</span>' : '';
    return `
      <div class="card ${premium ? 'premium' : ''}">
        <div class="num">${star}${masked}</div>
        <div class="meta">
          <span class="tag op">${it.operator}</span>
          <span class="tag level">${it.tag}</span>
        </div>
        <div class="footer">
          <div class="price"><small>¥</small>${it.price || '面议'}</div>
          <span class="status ${it.status === 'available' ? 'available' : 'sold'}">
            ${it.status === 'available' ? '可售' : '已售'}
          </span>
        </div>
      </div>`;
  }).join('');
}

function renderPagination() {
  const el = $('#pagination');
  const total = state.totalPages;
  const cur = state.page;
  if (total <= 1) { el.innerHTML = ''; return; }
  let html = `<button ${cur === 1 ? 'disabled' : ''} data-page="${cur - 1}">‹</button>`;
  const range = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= cur - 2 && p <= cur + 2)) range.push(p);
    else if (range[range.length - 1] !== '…') range.push('…');
  }
  range.forEach((p) => {
    if (p === '…') html += `<span class="info">…</span>`;
    else html += `<button class="${p === cur ? 'active' : ''}" data-page="${p}">${p}</button>`;
  });
  html += `<button ${cur === total ? 'disabled' : ''} data-page="${cur + 1}">›</button>`;
  html += `<span class="info">第 ${cur}/${total} 页</span>`;
  el.innerHTML = html;
  el.querySelectorAll('button[data-page]').forEach((b) => {
    b.addEventListener('click', () => {
      const p = parseInt(b.dataset.page, 10);
      if (p >= 1 && p <= total) { state.page = p; load(); }
    });
  });
}

// ---- Load data ----
async function load() {
  const grid = $('#grid');
  grid.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  const params = new URLSearchParams({
    q: state.q,
    operator: state.operator,
    level: state.level,
    sort: state.sort,
    page: state.page,
    pageSize: state.pageSize,
  });
  try {
    const res = await fetch('/api/numbers?' + params.toString());
    const json = await res.json();
    state.totalPages = json.totalPages || 1;
    renderCards(json.data || []);
    renderPagination();
  } catch (e) {
    grid.innerHTML = '<div class="empty"><div class="big">⚠️</div>加载失败，请刷新重试</div>';
  }
}

// ---- Events ----
$('#searchBtn').addEventListener('click', () => {
  state.q = collectQuery();
  state.page = 1;
  load();
});
$('#resetBtn').addEventListener('click', () => {
  Array.from(digitRow.children).forEach((el) => (el.value = ''));
  state.q = '';
  state.page = 1;
  load();
});

$('#operatorFilter').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  $('#operatorFilter').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  state.operator = btn.dataset.operator;
  state.page = 1;
  load();
});

$('#levelFilter').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  $('#levelFilter').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  state.level = btn.dataset.level;
  state.page = 1;
  load();
});

$('#sortSelect').addEventListener('change', (e) => {
  state.sort = e.target.value;
  state.page = 1;
  load();
});

// ---- Init ----
loadMarquee();
load();

// ---- Real-time: 后台改完，前台无需手动刷新也会更新 ----
// 公告每 15s 刷新；列表每 20s 刷新（用户正在输入框打字时跳过，不打断操作）
setInterval(() => { loadMarquee(); }, 15000);
setInterval(() => {
  const active = document.activeElement;
  if (active && active.tagName === 'INPUT') return;
  load();
}, 20000);
