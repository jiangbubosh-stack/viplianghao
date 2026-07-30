'use strict';

const $ = (s) => document.querySelector(s);
const tokenKey = 'phone_admin_token';
let token = localStorage.getItem(tokenKey) || '';
let adminPage = 1;
const adminPageSize = 20;

function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => { el.className = 'toast ' + type; }, 2600);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    // token invalid/expired
    localStorage.removeItem(tokenKey);
    token = '';
    showLogin();
    throw new Error('登录已失效，请重新登录');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || '请求失败');
  return body;
}

function showLogin() {
  $('#loginView').style.display = 'grid';
  $('#dashView').style.display = 'none';
}
function showDash() {
  $('#loginView').style.display = 'none';
  $('#dashView').style.display = 'block';
}

// ---- Login ----
$('#loginBtn').addEventListener('click', doLogin);
$('#pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  const pwd = $('#pwd').value;
  $('#loginErr').textContent = '';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    const body = await res.json();
    if (!res.ok) { $('#loginErr').textContent = body.detail || '登录失败'; return; }
    token = body.token;
    localStorage.setItem(tokenKey, token);
    $('#pwd').value = '';
    showDash();
    refresh();
  } catch (e) {
    $('#loginErr').textContent = '网络错误，请重试';
  }
}

$('#logoutBtn').addEventListener('click', () => {
  localStorage.removeItem(tokenKey);
  token = '';
  showLogin();
});

// ---- Tabs ----
document.querySelectorAll('.tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tabs .tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => (p.style.display = 'none'));
    tab.classList.add('active');
    document.querySelector(`.tab-pane[data-pane="${tab.dataset.tab}"]`).style.display = 'block';
  });
});

// ---- File upload (read client-side, send as text) ----
let pendingFileText = null;
$('#fileDrop').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingFileText = reader.result;
    $('#fileInfo').textContent = `已选择：${file.name}（${file.size} 字节）`;
  };
  reader.readAsText(file, 'utf-8');
});

$('#uploadFileBtn').addEventListener('click', async () => {
  if (!pendingFileText) { toast('请先选择文件', 'err'); return; }
  try {
    const r = await api('/api/admin/upload', { method: 'POST', body: JSON.stringify({ content: pendingFileText }) });
    toast(`导入成功：新增 ${r.inserted} 条，跳过重复 ${r.skipped} 条${r.errors.length ? '，失败 ' + r.errors.length : ''}`, 'ok');
    pendingFileText = null;
    $('#fileInfo').textContent = '';
    $('#fileInput').value = '';
    refresh();
  } catch (e) { toast(e.message, 'err'); }
});

$('#uploadPasteBtn').addEventListener('click', async () => {
  const content = $('#pasteArea').value;
  if (!content.trim()) { toast('请输入号码', 'err'); return; }
  try {
    const r = await api('/api/admin/upload', { method: 'POST', body: JSON.stringify({ content }) });
    toast(`导入成功：新增 ${r.inserted} 条，跳过 ${r.skipped} 条${r.errors.length ? '，失败 ' + r.errors.length : ''}`, 'ok');
    $('#pasteArea').value = '';
    refresh();
  } catch (e) { toast(e.message, 'err'); }
});

$('#addSingleBtn').addEventListener('click', async () => {
  const number = $('#sNumber').value.trim();
  if (!number) { toast('请输入手机号', 'err'); return; }
  const payload = {
    number,
    operator: $('#sOperator').value,
    tag: $('#sTag').value.trim(),
    price: $('#sPrice').value.trim() || 0,
  };
  try {
    await api('/api/admin/numbers', { method: 'POST', body: JSON.stringify(payload) });
    toast('添加成功', 'ok');
    $('#sNumber').value = ''; $('#sTag').value = ''; $('#sPrice').value = '';
    refresh();
  } catch (e) { toast(e.message, 'err'); }
});

// ---- Stats ----
async function loadStats() {
  try {
    const s = await api('/api/stats');
    $('#statRow').innerHTML = `
      <div class="stat"><div class="v">${s.total}</div><div class="k">号码总数</div></div>
      <div class="stat"><div class="v">${s.available}</div><div class="k">可售</div></div>
      <div class="stat"><div class="v">${s.premium}</div><div class="k">靓号</div></div>`;
  } catch (e) { /* handled */ }
}

// ---- List ----
async function loadList() {
  try {
    const params = new URLSearchParams({ page: adminPage, pageSize: adminPageSize });
    const r = await api('/api/admin/numbers?' + params.toString());
    $('#listCount').textContent = `共 ${r.total} 条`;
    const body = $('#listBody');
    if (!r.data.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#9aa3af;padding:24px">暂无号码，先上传吧</td></tr>';
    } else {
      body.innerHTML = r.data.map((it) => `
        <tr>
          <td class="num">${it.number}</td>
          <td>${it.operator}</td>
          <td>${it.tag}</td>
          <td>${it.price ? '¥' + it.price : '面议'}</td>
          <td>${it.status === 'available' ? '可售' : '已售'}</td>
          <td><button class="del" data-id="${it.id}">删除</button></td>
        </tr>`).join('');
      body.querySelectorAll('.del').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('确定删除该号码？')) return;
          try {
            await api('/api/admin/numbers/' + b.dataset.id, { method: 'DELETE' });
            toast('已删除', 'ok');
            refresh();
          } catch (e) { toast(e.message, 'err'); }
        });
      });
    }
    renderAdminPagination(r.totalPages, r.page);
  } catch (e) { /* handled */ }
}

function renderAdminPagination(total, cur) {
  const el = $('#adminPagination');
  if (total <= 1) { el.innerHTML = ''; return; }
  let html = `<button ${cur === 1 ? 'disabled' : ''} data-page="${cur - 1}">‹</button>`;
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= cur - 1 && p <= cur + 1))
      html += `<button class="${p === cur ? 'active' : ''}" data-page="${p}">${p}</button>`;
    else if (html.slice(-1) !== '…') html += '<span class="info">…</span>';
  }
  html += `<button ${cur === total ? 'disabled' : ''} data-page="${cur + 1}">›</button>`;
  el.innerHTML = html;
  el.querySelectorAll('button[data-page]').forEach((b) => {
    b.addEventListener('click', () => { adminPage = parseInt(b.dataset.page, 10); loadList(); });
  });
}

async function refresh() {
  await loadStats();
  await loadList();
}

// ---- Init ----
if (token) {
  // verify token works
  api('/api/stats').then(() => { showDash(); refresh(); })
    .catch(() => { showLogin(); });
} else {
  showLogin();
}
