'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const tokenKey = 'phone_admin_token';
let token = localStorage.getItem(tokenKey) || '';

let curRoute = 'home';        // 当前路由
let curSource = '自有';        // 当前号池
let curPage = 1;
const curPageSize = 10;
let curFilters = {};
let curTotalPages = 1;
let curTotal = 0;
let editingId = null;

// ---------- API ----------
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    localStorage.removeItem(tokenKey); token = ''; showLogin();
    throw new Error('登录已失效');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || '请求失败');
  return body;
}

// ---------- Toast ----------
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => { el.className = 'toast ' + type; }, 2600);
}

// ---------- Login ----------
function showLogin() { $('#loginView').style.display = 'grid'; $('#dashView').style.display = 'none'; }
function showDash() { $('#loginView').style.display = 'none'; $('#dashView').style.display = 'flex'; }

$('#loginBtn').addEventListener('click', doLogin);
$('#pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  $('#loginErr').textContent = '';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('#pwd').value }),
    });
    const body = await res.json();
    if (!res.ok) { $('#loginErr').textContent = body.detail || '登录失败'; return; }
    token = body.token; localStorage.setItem(tokenKey, token);
    $('#pwd').value = ''; showDash(); goto('home');
  } catch (e) { $('#loginErr').textContent = '网络错误，请重试'; }
}
$('#logoutBtn').addEventListener('click', () => { localStorage.removeItem(tokenKey); token = ''; showLogin(); });

// ---------- 路由 ----------
const ROUTE_BREADCRUMB = {
  home: '我的桌面',
  company: '公司管理 / 公司信息',
  'numbers-ziyou': '号码管理 / 自有号码',
  'numbers-gonggong': '号码管理 / 公共号池',
  fengshui: '号码管理 / 风水号',
  orders: '订单管理',
  promo: '推广管理',
  finance: '财务管理',
  marketing: '营销工具',
  settings: '系统配置 / 站点设置',
  banner: '系统配置 / 首页 banner',
  nav: '系统配置 / 首页导航',
  middlead: '系统配置 / 中部广告',
  bottomnav: '系统配置 / 底部菜单',
  poster: '系统配置 / 海报管理',
  share: '系统配置 / 分享管理',
  profile: '个人信息',
  complaint: '投诉建议',
};

function goto(route) {
  curRoute = route;
  // 侧栏高亮
  $$('.sb-item').forEach((el) => el.classList.remove('active'));
  const sel = document.querySelector(`.sb-item[data-route="${route}"]`);
  if (sel) sel.classList.add('active');
  // 面包屑
  $('#topBreadcrumb').innerHTML = '<span>🏠 我的桌面</span> <span class="sep">/</span> <span>' + (ROUTE_BREADCRUMB[route] || route) + '</span>';
  // 切换视图
  $$('.view').forEach((v) => { v.style.display = v.dataset.view === route || (route === 'numbers-ziyou' && v.dataset.view === 'numbers') || (route === 'numbers-gonggong' && v.dataset.view === 'numbers') ? '' : 'none'; });
  // 特殊：号码管理
  if (route === 'numbers-ziyou' || route === 'numbers-gonggong') {
    curSource = route === 'numbers-gonggong' ? '公共' : '自有';
    curPage = 1;
    loadList();
  }
  // 站点设置
  if (route === 'settings') loadSettings();
  // 风水号
  if (route === 'fengshui') loadFengshuiList();
  // 我的桌面
  if (route === 'home') loadHome();
}

// 侧栏点击
document.addEventListener('click', (e) => {
  const it = e.target.closest('.sb-item');
  if (!it) return;
  if (it.classList.contains('sb-parent')) {
    const grp = it.closest('.sb-group');
    grp.classList.toggle('open');
    const arrow = it.querySelector('.sb-arrow');
    arrow.textContent = grp.classList.contains('open') ? '▾' : '▸';
    return;
  }
  const r = it.dataset.route;
  if (r) goto(r);
});

// ---------- 我的桌面 ----------
async function loadHome() {
  try {
    const s = await api('/api/stats');
    $('#statGrid').innerHTML = `
      <div class="stat-box"><div class="k">今日新增订单数</div><div class="v">${(s.todayOrders||0)}</div></div>
      <div class="stat-box"><div class="k">今日新增交易金额</div><div class="v">¥ ${(s.todayMoney||0)}</div></div>
      <div class="stat-box"><div class="k">昨日新增订单数</div><div class="v">${(s.yestOrders||0)}</div></div>
      <div class="stat-box"><div class="k">待邮寄订单数</div><div class="v">${(s.waitMail||0)}</div></div>
      <div class="stat-box"><div class="k">待开卡订单数</div><div class="v">${(s.waitCard||0)}</div></div>
      <div class="stat-box"><div class="k">待结算订单数</div><div class="v">${(s.waitSettle||0)}</div></div>
    `;
    drawChart('chartMoney', fakeSeries(12, 0.4, 800), '#e4393c');
    drawChart('chartView', fakeSeries(24, 0.5, 120), '#3b82f6');
  } catch (e) { /* handled */ }
}
function fakeSeries(n, jitter, base) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push(Math.max(0, base * (0.5 + Math.random()) + (Math.random() - 0.5) * base * jitter));
  }
  return arr;
}
function drawChart(id, data, color) {
  const el = document.getElementById(id);
  if (!el) return;
  const max = Math.max(...data, 1);
  const w = el.clientWidth || 400;
  const h = 200;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * (h - 20) - 10}`);
  const area = `0,${h} ` + pts.join(' ') + ` ${w},${h}`;
  el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">
      <polygon points="${area}" fill="${color}" fill-opacity="0.12" />
      <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" />
    </svg>
    <div class="chart-axis">
      <span>1月</span><span>${Math.round(data.length/2)}月</span><span>${data.length}月</span>
    </div>`;
}

// ---------- 号码列表 ----------
async function loadList() {
  const params = new URLSearchParams({
    source: curSource,
    page: curPage,
    pageSize: curPageSize,
    q: curFilters.q || '',
    operator: curFilters.operator || 'all',
    level: curFilters.level || 'all',
    brand: curFilters.brand || 'all',
    province: curFilters.province || 'all',
    city: curFilters.city || 'all',
    recommendLevel: curFilters.recommendLevel || 'all',
    onShelf: curFilters.onShelf || 'all',
    isSold: curFilters.isSold || 'all',
  });
  if (curFilters.tag) params.set('tag', curFilters.tag);
  try {
    const r = await api('/api/admin/numbers?' + params.toString());
    curTotal = r.total; curTotalPages = r.totalPages;
    renderTable(r.data);
    renderPager();
    populateBrandFilter(r.data);
  } catch (e) { toast(e.message, 'err'); }
}

function populateBrandFilter(items) {
  const sel = $('#fBrand');
  const cur = sel.value;
  const brands = Array.from(new Set(items.map(x => x.brand).filter(Boolean))).sort();
  const merged = ['<option value="all">所有品牌</option>']
    .concat(brands.map(b => `<option value="${b}">${b}</option>`));
  sel.innerHTML = merged.join('');
  sel.value = cur;
}

function renderTable(items) {
  const body = $('#listBody');
  if (!items.length) {
    body.innerHTML = `<tr><td colspan="14" style="text-align:center;color:#9aa3af;padding:30px">暂无号码，先上传吧</td></tr>`;
    return;
  }
  body.innerHTML = items.map((it) => {
    const opBg = it.operator === '移动' ? '#3b82f6' : it.operator === '联通' ? '#f97316' : it.operator === '电信' ? '#22c55e' : '#a855f7';
    return `
      <tr data-id="${it.id}">
        <td class="cb"><input type="checkbox" class="cb-row" value="${it.id}" /></td>
        <td class="num-cell">${it.number}</td>
        <td>${it.province || ''}<br><small>${it.city || ''}</small></td>
        <td>${it.brand || ''}</td>
        <td><span class="op-pill" style="background:${opBg}">${it.operator || ''}</span></td>
        <td>${it.originalPrice ? '¥' + it.originalPrice : '—'}</td>
        <td><b>¥ ${it.price || 0}</b></td>
        <td>${it.installment || 0}</td>
        <td>${it.recommendLevel ? `<span class="rec-pill rec-${it.recommendLevel}">${it.recommendLevel}</span>` : ''}</td>
        <td>${it.tag || ''}</td>
        <td>${it.source || ''}</td>
        <td>
          <label class="switch sm">
            <input type="checkbox" data-toggle="onShelf" ${it.onShelf !== false ? 'checked' : ''} />
            <span>${it.onShelf !== false ? '上架' : '下架'}</span>
          </label>
        </td>
        <td>
          <label class="switch sm">
            <input type="checkbox" data-toggle="isSold" ${it.isSold ? 'checked' : ''} />
            <span>${it.isSold ? '已售' : '在售'}</span>
          </label>
        </td>
        <td class="ops">
          <a class="op-link blue" href="/detail?id=${encodeURIComponent(it.id)}" target="_blank">查看</a>
          <a class="op-link" data-act="edit">编辑</a>
          <a class="op-link red" data-act="del">删除</a>
        </td>
      </tr>`;
  }).join('');

  body.querySelectorAll('[data-act="edit"]').forEach((b) => b.addEventListener('click', () => openModal(b.closest('tr').dataset.id)));
  body.querySelectorAll('[data-act="del"]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('tr').dataset.id;
    if (!confirm('确定删除该号码？')) return;
    try { await api('/api/admin/numbers/' + id, { method: 'DELETE' }); toast('已删除', 'ok'); loadList(); } catch (e) { toast(e.message, 'err'); }
  }));
  body.querySelectorAll('input[data-toggle]').forEach((el) => el.addEventListener('change', async () => {
    const tr = el.closest('tr');
    const id = tr.dataset.id;
    const key = el.dataset.toggle;
    const value = el.checked;
    try {
      await api('/api/admin/numbers/' + id, { method: 'PUT', body: JSON.stringify({ [key]: value }) });
      const span = el.nextElementSibling;
      if (key === 'onShelf') span.textContent = value ? '上架' : '下架';
      if (key === 'isSold') span.textContent = value ? '已售' : '在售';
      toast('已更新', 'ok');
    } catch (e) { toast(e.message, 'err'); el.checked = !value; }
  }));
}

function renderPager() {
  const el = $('#pager');
  const cur = curPage, total = curTotalPages;
  if (total <= 1 && curTotal < curPageSize) {
    el.innerHTML = `<span class="pager-info">共 ${curTotal} 条</span>`;
    return;
  }
  let html = `<span class="pager-info">共 ${curTotal} 条</span>`;
  html += `<button class="pg-btn" ${cur === 1 ? 'disabled' : ''} data-page="${cur - 1}">上一页</button>`;
  // 简易分页：最多 5 个
  const start = Math.max(1, cur - 2);
  const end = Math.min(total, start + 4);
  for (let p = start; p <= end; p++) {
    html += `<button class="pg-btn ${p === cur ? 'active' : ''}" data-page="${p}">${p}</button>`;
  }
  if (end < total) html += `<span class="pg-info">...</span><button class="pg-btn" data-page="${total}">${total}</button>`;
  html += `<button class="pg-btn" ${cur === total ? 'disabled' : ''} data-page="${cur + 1}">下一页</button>`;
  html += `<span class="pg-size">每页 <select id="pgSize">${[10,20,50,100].map(n => `<option ${n===curPageSize?'selected':''}>${n}</option>`).join('')}</select> 条</span>`;
  html += `<span class="pg-jump">跳转到 <input id="pgGo" type="number" min="1" max="${total}" value="${cur}" /> 页 <button class="pg-btn" id="pgGoBtn">确定</button></span>`;
  el.innerHTML = html;
  el.querySelectorAll('button[data-page]').forEach((b) => b.addEventListener('click', () => {
    const p = parseInt(b.dataset.page, 10);
    if (p >= 1 && p <= total) { curPage = p; loadList(); }
  }));
  el.querySelector('#pgSize')?.addEventListener('change', (e) => { curPageSize = parseInt(e.target.value, 10); curPage = 1; loadList(); });
  el.querySelector('#pgGoBtn')?.addEventListener('click', () => {
    const p = parseInt($('#pgGo').value, 10) || 1;
    if (p >= 1 && p <= total) { curPage = p; loadList(); } else toast('页码无效', 'err');
  });
}

// ---------- 筛选 ----------
$('#fSearch').addEventListener('click', () => {
  curFilters = {
    q: $('#fNumber').value.trim() || ($('#fPrefix').value.trim() ? $('#fPrefix').value.trim() + '*' : ''),
    operator: $('#fOperator').value,
    level: $('#fLevel').value,
    brand: $('#fBrand').value,
    province: $('#fProvince').value,
    city: $('#fCity').value,
    recommendLevel: 'all',
    onShelf: $('#fOnShelf').value,
    isSold: $('#fIsSold').value,
    tag: $('#fRule').value,
  };
  curPage = 1; loadList();
});

// ---------- 全选 ----------
$('#cbAll').addEventListener('change', (e) => {
  $$('.cb-row').forEach((cb) => cb.checked = e.target.checked);
});

function getSelectedIds() {
  return Array.from($$('.cb-row:checked')).map((cb) => cb.value);
}

// ---------- 批量操作 ----------
$$('.bulk-btn').forEach((b) => b.addEventListener('click', () => doBulk(b.dataset.act)));
async function doBulk(act) {
  if (act === 'add') { openModal(); return; }
  if (act === 'import') { $('#importModal').style.display = 'flex'; return; }
  if (act === 'export') { doExport(false); return; }
  if (act === 'export-all') { doExport(true); return; }
  if (act === 'clearGonggong') {
    if (!confirm('确定清空「公共号池」所有号码？此操作不可恢复！')) return;
    try { const r = await api('/api/admin/numbers/bulk', { method: 'POST', body: JSON.stringify({ action: 'clearPool', source: '公共' }) }); toast(`已清空 ${r.removed} 条`, 'ok'); curPage = 1; loadList(); } catch (e) { toast(e.message, 'err'); }
    return;
  }
  if (act === 'clearZiyou') {
    if (!confirm('确定清空「自有号码」所有号码？此操作不可恢复！')) return;
    try { const r = await api('/api/admin/numbers/bulk', { method: 'POST', body: JSON.stringify({ action: 'clearPool', source: '自有' }) }); toast(`已清空 ${r.removed} 条`, 'ok'); curPage = 1; loadList(); } catch (e) { toast(e.message, 'err'); }
    return;
  }
  if (act === 'protect') { toast('号码保护功能下一期上线', ''); return; }
  if (act === 'clearTags') { toast('请在编辑弹窗里逐个清除标签', ''); return; }

  const ids = getSelectedIds();
  if (!ids.length && act !== 'export') { toast('请先勾选号码', 'err'); return; }
  const labels = { onShelf: '上架', offShelf: '下架', recommend: '推荐', special: '特价', hot: '热门', delete: '删除' };
  if (act === 'delete') {
    if (!confirm(`确定删除选中的 ${ids.length} 条号码？`)) return;
  } else if (!confirm(`确定对选中的 ${ids.length} 条执行【${labels[act]}】操作？`)) return;
  try {
    const r = await api('/api/admin/numbers/bulk', { method: 'POST', body: JSON.stringify({ action: act, ids }) });
    toast(`${labels[act]}完成：影响 ${r.updated || r.deleted || 0} 条`, 'ok');
    loadList();
  } catch (e) { toast(e.message, 'err'); }
}

async function doExport(all) {
  try {
    const ids = all ? null : getSelectedIds();
    let url = '/api/admin/numbers?pageSize=1000';
    if (ids && ids.length) url = '/api/admin/numbers?pageSize=1000';
    const r = await api(url);
    const rows = ids ? r.data.filter(x => ids.includes(x.id)) : r.data;
    if (!rows.length) { toast('无数据可导出', 'err'); return; }
    const headers = ['手机号','运营商','品牌','省','市','底价','优惠价','套餐详情','号码来源','推荐级别','上架','已售'];
    const csv = '\uFEFF' + [headers.join(',')].concat(rows.map(x => [
      x.number, x.operator, x.brand, x.province, x.city, x.price, x.originalPrice,
      `"${(x.packageDetail || '').replace(/"/g, '""')}"`, x.source, x.recommendLevel,
      x.onShelf !== false ? '是' : '否', x.isSold ? '是' : '否'
    ].join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `靓号导出_${curSource}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast(`已导出 ${rows.length} 条`, 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- 单条添加/编辑 弹窗 ----------
const modal = $('#numberModal');
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]') || e.target.classList.contains('modal')) {
    modal.style.display = 'none';
    $('#importModal').style.display = 'none';
  }
});

function openModal(id) {
  editingId = id || null;
  $('#modalTitle').textContent = id ? '编辑号码' : '添加号码';
  $('#mNumber').value = '';
  $('#mNumber').disabled = !!id;
  $('#mOperator').value = 'auto';
  $('#mPrice').value = '';
  $('#mOrig').value = '';
  $('#mSource').value = curSource;
  $('#mRec').value = '';
  $('#mBrand').value = '';
  $('#mTag').value = '';
  $('#mPkg').value = '';
  $('#mOnShelf').checked = true;
  $('#mIsSold').checked = false;
  $('#mIsHot').checked = false;
  $('#mIsRec').checked = false;
  $('#mIsSpe').checked = false;
  if (id) loadToModal(id);
  modal.style.display = 'flex';
}

async function loadToModal(id) {
  try {
    const r = await api('/api/numbers/' + encodeURIComponent(id));
    const n = r.data;
    $('#mNumber').value = n.number;
    $('#mOperator').value = n.operator;
    $('#mPrice').value = n.price;
    $('#mOrig').value = n.originalPrice || '';
    $('#mSource').value = n.source || '自有';
    $('#mRec').value = n.recommendLevel || '';
    $('#mBrand').value = n.brand || '';
    $('#mTag').value = n.tag || '';
    $('#mPkg').value = n.packageDetail || '';
    $('#mOnShelf').checked = n.onShelf !== false;
    $('#mIsSold').checked = !!n.isSold;
    $('#mIsHot').checked = !!n.isHot;
    $('#mIsRec').checked = !!n.isRecommend;
    $('#mIsSpe').checked = !!n.isSpecial;
  } catch (e) { toast('读取号码失败', 'err'); }
}

$('#mSave').addEventListener('click', async () => {
  const payload = {
    number: $('#mNumber').value.trim(),
    operator: $('#mOperator').value,
    price: Number($('#mPrice').value) || 0,
    originalPrice: Number($('#mOrig').value) || 0,
    source: $('#mSource').value,
    recommendLevel: $('#mRec').value,
    brand: $('#mBrand').value.trim(),
    tag: $('#mTag').value.trim(),
    packageDetail: $('#mPkg').value.trim(),
    onShelf: $('#mOnShelf').checked,
    isSold: $('#mIsSold').checked,
    isHot: $('#mIsHot').checked,
    isRecommend: $('#mIsRec').checked,
    isSpecial: $('#mIsSpe').checked,
  };
  if (!payload.number) { toast('请输入手机号', 'err'); return; }
  try {
    if (editingId) {
      await api('/api/admin/numbers/' + editingId, { method: 'PUT', body: JSON.stringify(payload) });
      toast('已保存', 'ok');
    } else {
      await api('/api/admin/numbers', { method: 'POST', body: JSON.stringify(payload) });
      toast('已添加', 'ok');
    }
    modal.style.display = 'none';
    loadList();
  } catch (e) { toast(e.message, 'err'); }
});

// ---------- 批量导入 ----------
$('#impFile').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => { $('#impText').value = reader.result; };
  reader.readAsText(f, 'utf-8');
});
$('#impSubmit').addEventListener('click', async () => {
  const content = $('#impText').value.trim();
  if (!content) { toast('请输入或选择文件', 'err'); return; }
  try {
    const r = await api('/api/admin/upload', { method: 'POST', body: JSON.stringify({ content }) });
    toast(`导入完成：新增 ${r.inserted}，跳过 ${r.skipped}，失败 ${r.errors.length}`, 'ok');
    $('#impText').value = ''; $('#impFile').value = '';
    $('#importModal').style.display = 'none';
    loadList();
  } catch (e) { toast(e.message, 'err'); }
});

// ---------- 站点设置 ----------
const colorInput = $('#setThemeColor');
const colorHex = $('#setThemeColorHex');
colorInput.addEventListener('input', () => { colorHex.value = colorInput.value; });
colorHex.addEventListener('input', () => {
  if (/^#[0-9a-fA-F]{6}$/.test(colorHex.value)) colorInput.value = colorHex.value;
});

async function loadSettings() {
  try {
    const s = await (await fetch('/api/settings')).json();
    $('#setSiteName').value = s.siteName || '';
    $('#setLogoText').value = s.logoText || '';
    const tc = s.themeColor || '#e4393c';
    colorInput.value = /^#[0-9a-fA-F]{6}$/.test(tc) ? tc : '#e4393c';
    colorHex.value = colorInput.value;
    $('#setContactQrUrl').value = s.contactQrUrl || '';
    $('#setContactPhone').value = s.contactPhone || '';
    $('#setContactWechat').value = s.contactWechat || '';
    $('#setBanners').value = (s.banners || []).join('\n');
    $('#setNoticeText').value = (s.noticeText || '').split(/\r?\n/).join('\n');
  } catch (e) { toast('读取设置失败', 'err'); }
}

$('#saveSettingsBtn').addEventListener('click', async () => {
  const payload = {
    siteName: $('#setSiteName').value.trim(),
    logoText: $('#setLogoText').value.trim(),
    themeColor: colorHex.value.trim(),
    contactQrUrl: $('#setContactQrUrl').value.trim(),
    contactPhone: $('#setContactPhone').value.trim(),
    contactWechat: $('#setContactWechat').value.trim(),
    banners: $('#setBanners').value.trim(),
    noticeText: $('#setNoticeText').value.trim(),
  };
  try {
    await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(payload) });
    toast('站点设置已保存，前台实时生效', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

// ---------- 初始化 ----------
if (token) {
// ---------- 风水号管理 ----------
let fsPage = 1;
const fsPageSize = 10;
let fsTotalPages = 1;
let fsTotal = 0;
let fsCurFilters = {};

async function loadFengshuiList() {
  const params = new URLSearchParams({
    isFengshui: 'yes',
    page: fsPage,
    pageSize: fsPageSize,
    q: fsCurFilters.q || '',
  });
  try {
    const r = await api('/api/admin/numbers?' + params.toString());
    fsTotal = r.total; fsTotalPages = r.totalPages;
    renderFsTable(r.data);
    renderFsPager();
  } catch (e) { toast(e.message, 'err'); }
}

function renderFsTable(items) {
  const body = $('#fsListBody');
  if (!items.length) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#9aa3af;padding:30px">暂无风水号，点击「添加风水号」录入</td></tr>`;
    return;
  }
  body.innerHTML = items.map((it) => {
    const opBg = it.operator === '移动' ? '#3b82f6' : it.operator === '联通' ? '#f97316' : it.operator === '电信' ? '#22c55e' : '#a855f7';
    return `
      <tr data-id="${it.id}">
        <td class="num-cell">${it.number}</td>
        <td><span class="op-pill" style="background:${opBg}">${it.operator || ''}</span></td>
        <td><b>¥ ${it.price || 0}</b></td>
        <td>${it.tag || ''}</td>
        <td>${it.packageDetail ? it.packageDetail.slice(0, 24) + (it.packageDetail.length > 24 ? '…' : '') : '—'}</td>
        <td>
          <label class="switch sm">
            <input type="checkbox" data-toggle="onShelf" ${it.onShelf !== false ? 'checked' : ''} />
            <span>${it.onShelf !== false ? '上架' : '下架'}</span>
          </label>
        </td>
        <td class="ops">
          <a class="op-link" data-act="edit">编辑</a>
          <a class="op-link red" data-act="del">删除</a>
        </td>
      </tr>`;
  }).join('');

  body.querySelectorAll('[data-act="edit"]').forEach((b) => b.addEventListener('click', () => openFsModal(b.closest('tr').dataset.id)));
  body.querySelectorAll('[data-act="del"]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('tr').dataset.id;
    if (!confirm('确定删除该风水号？')) return;
    try { await api('/api/admin/numbers/' + id, { method: 'DELETE' }); toast('已删除', 'ok'); loadFengshuiList(); } catch (e) { toast(e.message, 'err'); }
  }));
  body.querySelectorAll('input[data-toggle]').forEach((el) => el.addEventListener('change', async () => {
    const id = el.closest('tr').dataset.id;
    const key = el.dataset.toggle;
    try {
      await api('/api/admin/numbers/' + id, { method: 'PUT', body: JSON.stringify({ [key]: el.checked, isFengshui: true }) });
      const span = el.nextElementSibling;
      if (key === 'onShelf') span.textContent = el.checked ? '上架' : '下架';
      toast('已更新', 'ok');
    } catch (e) { toast(e.message, 'err'); el.checked = !el.checked; }
  }));
}

function renderFsPager() {
  const el = $('#fsPager');
  const cur = fsPage, total = fsTotalPages;
  if (total <= 1 && fsTotal < fsPageSize) { el.innerHTML = `<span class="pager-info">共 ${fsTotal} 条</span>`; return; }
  let html = `<span class="pager-info">共 ${fsTotal} 条</span>`;
  html += `<button class="pg-btn" ${cur === 1 ? 'disabled' : ''} data-page="${cur - 1}">上一页</button>`;
  const start = Math.max(1, cur - 2);
  const end = Math.min(total, start + 4);
  for (let p = start; p <= end; p++) html += `<button class="pg-btn ${p === cur ? 'active' : ''}" data-page="${p}">${p}</button>`;
  if (end < total) html += `<span class="pg-info">...</span><button class="pg-btn" data-page="${total}">${total}</button>`;
  html += `<button class="pg-btn" ${cur === total ? 'disabled' : ''} data-page="${cur + 1}">下一页</button>`;
  el.innerHTML = html;
  el.querySelectorAll('button[data-page]').forEach((b) => b.addEventListener('click', () => {
    const p = parseInt(b.dataset.page, 10);
    if (p >= 1 && p <= total) { fsPage = p; loadFengshuiList(); }
  }));
}

const fsModal = $('#fsModal');
let fsEditingId = null;

function openFsModal(id) {
  fsEditingId = id || null;
  $('#fsNumber').value = '';
  $('#fsNumber').disabled = !!id;
  $('#fsOperator').value = 'auto';
  $('#fsPrice').value = '';
  $('#fsTag').value = '';
  $('#fsPkg').value = '';
  $('#fsOnShelf').checked = true;
  if (id) {
    api('/api/numbers/' + encodeURIComponent(id)).then((r) => {
      const n = r.data;
      $('#fsNumber').value = n.number;
      $('#fsOperator').value = n.operator;
      $('#fsPrice').value = n.price;
      $('#fsTag').value = n.tag || '';
      $('#fsPkg').value = n.packageDetail || '';
      $('#fsOnShelf').checked = n.onShelf !== false;
    }).catch(() => toast('读取失败', 'err'));
  }
  fsModal.style.display = 'flex';
}

$('#fsAddBtn').addEventListener('click', () => openFsModal());
$('#fsSave').addEventListener('click', async () => {
  const payload = {
    number: $('#fsNumber').value.trim(),
    operator: $('#fsOperator').value,
    price: Number($('#fsPrice').value) || 0,
    tag: $('#fsTag').value.trim(),
    packageDetail: $('#fsPkg').value.trim(),
    onShelf: $('#fsOnShelf').checked,
    source: '风水号',
    isFengshui: true,
  };
  if (!payload.number) { toast('请输入手机号', 'err'); return; }
  try {
    if (fsEditingId) {
      await api('/api/admin/numbers/' + fsEditingId, { method: 'PUT', body: JSON.stringify(payload) });
      toast('已保存', 'ok');
    } else {
      await api('/api/admin/numbers', { method: 'POST', body: JSON.stringify(payload) });
      toast('已添加风水号', 'ok');
    }
    fsModal.style.display = 'none';
    loadFengshuiList();
  } catch (e) { toast(e.message, 'err'); }
});

$('#fsSearchBtn').addEventListener('click', () => {
  fsCurFilters = { q: $('#fsSearch').value.trim() };
  fsPage = 1; loadFengshuiList();
});

$('#fsClearBtn').addEventListener('click', async () => {
  if (!confirm('确定清空所有风水号？此操作不可恢复！')) return;
  try {
    const r = await api('/api/admin/numbers/bulk', { method: 'POST', body: JSON.stringify({ action: 'clearPool', source: '风水号' }) });
    toast(`已清空 ${r.removed} 条`, 'ok'); fsPage = 1; loadFengshuiList();
  } catch (e) { toast(e.message, 'err'); }
});

// ---------- 初始化 ----------
if (token) {
  api('/api/stats').then(() => { showDash(); goto('home'); }).catch(() => showLogin());
} else {
  showLogin();
}
