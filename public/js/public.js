'use strict';

const state = {
  q: '',
  operator: 'all',
  level: 'all',
  minPrice: '',
  maxPrice: '',
  notIn: '',          // 逗号分隔：3,4,7
  sort: 'new',
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const $ = (s) => document.querySelector(s);

// ---------- 工具 ----------
function darken(hex, f = 0.84) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#c1272d';
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

// ---------- 站点设置（后台可改，前台实时读取）----------
async function applySettings() {
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    document.title = s.siteName || '上海成霞通讯选号系统';
    if (s.siteName) { $('#siteName').textContent = s.siteName; $('#footerName').textContent = s.siteName; $('#pageTitle').textContent = s.siteName; }
    if (s.logoText) $('#brandMark').textContent = s.logoText;
    // 主题色
    if (s.themeColor) {
      document.documentElement.style.setProperty('--theme', s.themeColor);
      document.documentElement.style.setProperty('--theme-dark', darken(s.themeColor));
    }
    // Banner
    renderBanner(s.banners || []);
    // 公告
    renderNotice(s.noticeText || '平台担保交易，安全无忧');
    // 客服
    if (s.contactQrUrl) { $('#serviceQr').src = s.contactQrUrl; $('#serviceQrWrap').style.display = 'block'; }
    if (s.contactPhone) { const a = $('#servicePhone'); a.href = 'tel:' + s.contactPhone; a.textContent = s.contactPhone; }
    if (s.contactWechat) $('#serviceWechat').textContent = s.contactWechat;
  } catch (e) { /* 用默认值兜底 */ }
}

function renderBanner(banners) {
  const sw = $('#bannerSwiper');
  const dots = $('#bannerDots');
  if (!banners.length) {
    sw.innerHTML = `<div class="slide"><div class="cap"><div class="t">上海成霞通讯</div><div class="s">海量靓号 · 平台担保 · 极速交付</div></div></div>`;
    dots.innerHTML = '';
    return;
  }
  sw.innerHTML = banners.map((u) => `<div class="slide"><img src="${u}" alt="banner" onerror="this.style.display='none'"><div class="cap"><div class="t">上海成霞通讯</div><div class="s">海量靓号 · 平台担保 · 极速交付</div></div></div>`).join('');
  dots.innerHTML = banners.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('');
  let idx = 0;
  const total = banners.length;
  setInterval(() => {
    idx = (idx + 1) % total;
    sw.style.transform = `translateX(-${idx * 100}%)`;
    dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === idx));
  }, 3500);
}

function renderNotice(text) {
  const parts = String(text).split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  if (!parts.length) parts.push('平台担保交易，安全无忧');
  const html = parts.map((p) => `<span>📢 ${p}</span>`).join('');
  $('#noticeTrack').innerHTML = html + html;
}

// ---------- 数字键盘（精准搜号 11 位）----------
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

// ---------- 搜号模式切换 ----------
$('#searchTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  $('#searchTabs').querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  tab.classList.add('active');
  const mode = tab.dataset.mode;
  document.querySelectorAll('.search-pane').forEach((p) => { p.style.display = p.dataset.pane === mode ? 'block' : 'none'; });
});

// ---------- 搜索触发 ----------
function doSearch(q) { state.q = q; state.page = 1; load(); }

$('#searchBtn').addEventListener('click', () => {
  const digits = Array.from(digitRow.children).map((el) => el.value.trim());
  const q = digits.map((d) => (d === '' ? '*' : d)).join('');
  doSearch(q.replace(/\*/g, '') === '' ? '' : q);
});
$('#resetBtn').addEventListener('click', () => {
  Array.from(digitRow.children).forEach((el) => (el.value = ''));
  state.q = ''; state.page = 1; load();
});
$('#fuzzyBtn').addEventListener('click', () => {
  const v = $('#fuzzyInput').value.trim().replace(/\D/g, '');
  doSearch(v ? `*${v}*` : '');
});
$('#tailBtn').addEventListener('click', () => {
  const v = $('#tailInput').value.trim().replace(/\D/g, '');
  if (!v) { doSearch(''); return; }
  const stars = '*'.repeat(Math.max(0, 11 - v.length));
  doSearch(stars + v);
});

// ---------- 运营商入口 ----------
$('#entryRow').addEventListener('click', (e) => {
  const entry = e.target.closest('.entry[data-op]');
  if (!entry) return;
  e.preventDefault();
  const op = entry.dataset.op;
  state.operator = op;
  $('#filterBar').querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('active', c.dataset.f === 'operator'));
  openFilterPanel('operator');
  state.page = 1;
  load();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ---------- 筛选面板 ----------
const FILTERS = {
  operator: { title: '运营商', opts: [['all', '全部'], ['移动', '移动'], ['联通', '联通'], ['电信', '电信'], ['虚拟运营商', '虚拟运营商']], apply: (v) => { state.operator = v; } },
  type: { title: '号码类型', opts: [['all', '全部'], ['靓号', '靓号'], ['普通号', '普通号']], apply: (v) => { state.level = v; } },
  price: { title: '价格区间', opts: [['', '全部'], ['0-500', '500以下'], ['500-2000', '500-2000'], ['2000-5000', '2000-5000'], ['5000-', '5000以上']], apply: (v) => { const [a, b] = v.split('-'); state.minPrice = a || ''; state.maxPrice = b || ''; } },
  notin: { title: '不含数字（可多选）', multi: true, opts: [['3', '不含3'], ['4', '不含4'], ['7', '不含7']], apply: (vals) => { state.notIn = vals.join(','); } },
  sort: { title: '排序', opts: [['new', '最新上架'], ['price_desc', '价格高到低'], ['price_asc', '价格低到高']], apply: (v) => { state.sort = v; } },
};

$('#filterBar').addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  const f = chip.dataset.f;
  if ($('#filterPanel').dataset.f === f && $('#filterPanel').style.display !== 'none') {
    $('#filterPanel').style.display = 'none';
    return;
  }
  openFilterPanel(f);
});

function openFilterPanel(f) {
  const cfg = FILTERS[f];
  const panel = $('#filterPanel');
  panel.dataset.f = f;
  panel.style.display = 'block';
  if (cfg.multi) {
    const selected = state.notIn ? state.notIn.split(',') : [];
    panel.innerHTML = `<div class="fp-title">${cfg.title}</div><div class="fp-opts">` +
      cfg.opts.map(([v, label]) => `<div class="opt ${selected.includes(v) ? 'active' : ''}" data-v="${v}">${label}</div>`).join('') +
      `</div><div class="search-actions" style="margin-top:14px"><button class="btn ghost" data-act="close">完成</button></div>`;
    panel.querySelectorAll('.opt').forEach((o) => o.addEventListener('click', () => o.classList.toggle('active')));
  } else {
    const cur = currentValue(f);
    panel.innerHTML = `<div class="fp-title">${cfg.title}</div><div class="fp-opts">` +
      cfg.opts.map(([v, label]) => `<div class="opt ${cur === v ? 'active' : ''}" data-v="${v}">${label}</div>`).join('') +
      `</div>`;
    panel.querySelectorAll('.opt').forEach((o) => o.addEventListener('click', () => {
      cfg.apply(o.dataset.v);
      panel.style.display = 'none';
      syncChipActive();
      state.page = 1; load();
    }));
  }
  panel.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', () => {
    const vals = Array.from(panel.querySelectorAll('.opt.active')).map((o) => o.dataset.v);
    cfg.apply(vals); syncChipActive(); state.page = 1; load(); panel.style.display = 'none';
  }));
}

function currentValue(f) {
  if (f === 'operator') return state.operator;
  if (f === 'type') return state.level;
  if (f === 'sort') return state.sort;
  if (f === 'price') return (state.minPrice && state.maxPrice) ? `${state.minPrice}-${state.maxPrice}` : (state.minPrice ? `${state.minPrice}-` : (state.maxPrice ? `-${state.maxPrice}` : ''));
  return '';
}

function syncChipActive() {
  $('#filterBar').querySelectorAll('.filter-chip').forEach((c) => {
    const f = c.dataset.f; let on = false;
    if (f === 'operator') on = state.operator !== 'all';
    if (f === 'type') on = state.level !== 'all';
    if (f === 'sort') on = state.sort !== 'new';
    if (f === 'price') on = !!(state.minPrice || state.maxPrice);
    if (f === 'notin') on = !!state.notIn;
    c.classList.toggle('active', on);
  });
}

// ---------- 渲染列表 ----------
function renderCards(items) {
  const grid = $('#grid');
  if (!items.length) {
    grid.innerHTML = '<div class="empty"><div class="big">📭</div>没有找到匹配的号码，换个条件试试～</div>';
    return;
  }
  grid.innerHTML = items.map((it) => {
    const premium = it.level === '靓号';
    const star = premium ? '<span class="star">★</span>' : '';
    return `
      <div class="card ${premium ? 'premium' : ''}">
        <div class="num">${star}${it.number}</div>
        <div class="meta">
          <span class="tag op">${it.operator}</span>
          <span class="tag level">${it.tag}</span>
        </div>
        <div class="footer">
          <div class="price"><small>¥</small>${it.price || '面议'}</div>
          <span class="status ${it.status === 'available' ? 'available' : 'sold'}">${it.status === 'available' ? '可售' : '已售'}</span>
        </div>
      </div>`;
  }).join('');
}

function renderPagination() {
  const el = $('#pagination');
  const total = state.totalPages, cur = state.page;
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
  html += `<span class="info">${cur}/${total}页</span>`;
  el.innerHTML = html;
  el.querySelectorAll('button[data-page]').forEach((b) => b.addEventListener('click', () => {
    const p = parseInt(b.dataset.page, 10);
    if (p >= 1 && p <= total) { state.page = p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }));
}

async function load() {
  const grid = $('#grid');
  grid.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
  const params = new URLSearchParams({
    q: state.q, operator: state.operator, level: state.level,
    minPrice: state.minPrice, maxPrice: state.maxPrice, notIn: state.notIn,
    sort: state.sort, page: state.page, pageSize: state.pageSize,
  });
  try {
    const res = await fetch('/api/numbers?' + params.toString());
    const json = await res.json();
    state.totalPages = json.totalPages || 1;
    renderCards(json.data || []);
    renderPagination();
  } catch (e) {
    grid.innerHTML = '<div class="empty"><div class="big">⚠️</div>加载失败，请下拉刷新重试</div>';
  }
}

// ---------- 底部导航 ----------
document.querySelectorAll('.tabbar-item').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tabbar-item').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
}));

// ---------- 初始化 ----------
applySettings();
load();
// 实时刷新：列表 20s，设置 30s（避免打断输入）
setInterval(() => {
  const a = document.activeElement;
  if (a && a.tagName === 'INPUT') return;
  load();
}, 20000);
setInterval(() => { applySettings(); }, 30000);
