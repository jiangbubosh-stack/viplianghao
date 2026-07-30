// ----------------------------------------------------------------------------
// 共享库：业务逻辑 + Cloudflare KV 存储
// 该文件以下划线开头，Cloudflare Pages 不会把它当作路由，仅供其他函数 import。
// ----------------------------------------------------------------------------

// 默认后台密码（生产环境务必通过 Cloudflare 变量 ADMIN_PASSWORD 覆盖）
export const DEFAULT_ADMIN_PASSWORD = 'admin888';
const KV_KEY = 'numbers';

// ---- 响应助手 ----
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      ...headers,
    },
  });
}

export function error(status, code, detail) {
  return json({ title: code, status, detail }, status);
}

// ---- 鉴权（无状态：token = sha256(ADMIN_PASSWORD)）----
export async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getAdminPassword(env) {
  return (env && env.ADMIN_PASSWORD) || DEFAULT_ADMIN_PASSWORD;
}

export async function expectedToken(env) {
  return sha256Hex(getAdminPassword(env));
}

export async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  return token === (await expectedToken(env));
}

// ---- 号码工具（与 server.js 保持一致）----
export function detectOperator(number) {
  const seg = number.slice(0, 3);
  const two = number.slice(0, 2);
  if (['13', '15', '18', '14', '17', '16', '19'].includes(two)) {
    if (['162', '165', '167', '170', '171'].includes(seg)) return '虚拟运营商';
    if (['134', '135', '136', '137', '138', '139', '147', '150', '151', '152', '157', '158', '159', '172', '178', '182', '183', '184', '187', '188', '198'].includes(seg)) return '移动';
    if (['130', '131', '132', '145', '155', '156', '166', '175', '176', '185', '186', '196'].includes(seg)) return '联通';
    if (['133', '149', '153', '173', '174', '177', '180', '181', '189', '199'].includes(seg)) return '电信';
  }
  return '未知';
}

export function classifyNumber(number) {
  const tail = number.slice(-4);
  const digits = number.split('').map(Number);
  let tag = '';
  let level = '普通';

  if (/(\d)\1{3}$/.test(number)) {
    tag = `尾号${number[number.length - 1]}连`;
    level = '靓号';
  } else if (/(\d)\1{2}$/.test(number.slice(-3))) {
    tag = `尾号${number[number.length - 1]}连`;
    level = '靓号';
  } else if (tail[0] === tail[1] && tail[2] === tail[3] && tail[0] !== tail[2]) {
    tag = '对子号';
    level = '靓号';
  } else if (tail[0] === tail[2] && tail[1] === tail[3] && tail[0] !== tail[1]) {
    tag = '循环号';
    level = '靓号';
  } else if (digits.slice(-4).every((d, i, a) => i === 0 || d === a[i - 1] + 1)) {
    tag = '顺子号';
    level = '靓号';
  } else if (digits.slice(-4).every((d, i, a) => i === 0 || d === a[i - 1] - 1)) {
    tag = '倒顺号';
    level = '靓号';
  } else if (number.includes('888')) { tag = '含888'; level = '靓号'; } else if (number.includes('666')) { tag = '含666'; level = '靓号'; }

  return { level, tag };
}

export function normalizeNumber(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 11 || !digits.startsWith('1')) return null;
  return digits;
}

export function genId() {
  const u = (typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : String(Math.random());
  return 'n_' + u.replace(/-/g, '').slice(0, 12);
}

// ---- KV 存储（整个数组存一个 key；KV 跨部署持久，不会因重部署丢失）----
export async function readAll(env) {
  const kv = env && env.NUMBERS_KV;
  if (!kv) throw new Error('KV_NOT_BOUND');
  const raw = await kv.get(KV_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? dedupe(arr) : [];
  } catch {
    return [];
  }
}

export async function writeAll(env, items) {
  const kv = env && env.NUMBERS_KV;
  if (!kv) throw new Error('KV_NOT_BOUND');
  await kv.put(KV_KEY, JSON.stringify(items));
}

// 按手机号去重（保留最早一条），避免种子并发导致的重复
export function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it || !it.number || seen.has(it.number)) continue;
    seen.add(it.number);
    out.push(it);
  }
  return out;
}

const SEED = [
  { number: '17088880999', price: 8800, tag: '尾号4连' },
  { number: '13166668888', price: 12800, tag: '尾号4连' },
  { number: '18612345678', price: 3600, tag: '顺子号' },
  { number: '18900001111', price: 5200, tag: '尾号3连' },
  { number: '13322223333', price: 6800, tag: '对子号' },
  { number: '19876543210', price: 9800, tag: '倒顺号' },
  { number: '17788889999', price: 15800, tag: '尾号4连' },
  { number: '16512344321', price: 1200, tag: '循环号' },
  { number: '15011112222', price: 4200, tag: '尾号3连' },
  { number: '18199998888', price: 13800, tag: '尾号4连' },
  { number: '13800001357', price: 2600, tag: '普通号' },
  { number: '16755556666', price: 7600, tag: '尾号4连' },
  { number: '19912349876', price: 3200, tag: '倒顺号' },
  { number: '15566667777', price: 11200, tag: '尾号4连' },
  { number: '13288887777', price: 12600, tag: '尾号4连' },
  { number: '18011112233', price: 3900, tag: '对子号' },
  { number: '17122225555', price: 8800, tag: '尾号4连' },
  { number: '15933334444', price: 6400, tag: '尾号4连' },
  { number: '16244445555', price: 5400, tag: '尾号4连' },
  { number: '13456789876', price: 2900, tag: '倒顺号' },
];

export async function seedIfEmpty(env) {
  const items = await readAll(env);
  if (items.length > 0) return items;
  const existing = new Set(items.map((it) => it.number));
  const newEntries = [];
  for (const s of SEED) {
    const number = normalizeNumber(s.number);
    if (!number || existing.has(number)) continue;
    const cls = classifyNumber(number);
    newEntries.push({
      id: genId(),
      number,
      operator: s.operator || detectOperator(number),
      level: s.level || cls.level,
      tag: s.tag || cls.tag || '普通号',
      price: s.price || 0,
      status: 'available',
      createdAt: new Date().toISOString(),
    });
    existing.add(number);
  }
  if (newEntries.length) {
    items.push(...newEntries);
    await writeAll(env, items);
  }
  return items;
}

// ---- 业务方法（与 server.js 对齐）----
export const service = {
  async list(env, { q, operator, level, status, page = 1, pageSize = 24, sort = 'new' }) {
    let items = await readAll(env);
    if (q) {
      const pattern = q.replace(/\*/g, '.*');
      const re = new RegExp(pattern);
      items = items.filter((it) => re.test(it.number));
    }
    if (operator && operator !== 'all') items = items.filter((it) => it.operator === operator);
    if (level && level !== 'all') items = items.filter((it) => it.level === level);
    if (status && status !== 'all') items = items.filter((it) => it.status === status);

    if (sort === 'price_desc') items = items.slice().sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === 'price_asc') items = items.slice().sort((a, b) => (a.price || 0) - (b.price || 0));
    else items = items.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const total = items.length;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.max(1, parseInt(pageSize, 10) || 24);
    const start = (p - 1) * ps;
    const data = items.slice(start, start + ps);
    return { data, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };
  },

  async stats(env) {
    const items = await readAll(env);
    const byOperator = {};
    let available = 0;
    let premium = 0;
    for (const it of items) {
      byOperator[it.operator] = (byOperator[it.operator] || 0) + 1;
      if (it.status === 'available') available++;
      if (it.level === '靓号') premium++;
    }
    return { total: items.length, available, premium, byOperator };
  },

  async addNumber(env, input) {
    const number = normalizeNumber(input.number);
    if (!number) throw { status: 422, code: 'INVALID_NUMBER', message: '手机号格式不正确（应为11位、1开头的中国大陆手机号）' };
    const items = await readAll(env);
    if (items.some((it) => it.number === number)) {
      throw { status: 409, code: 'DUPLICATE', message: `号码 ${number} 已存在` };
    }
    const cls = classifyNumber(number);
    const entry = {
      id: genId(),
      number,
      operator: input.operator && input.operator !== 'auto' ? input.operator : detectOperator(number),
      level: input.level || cls.level,
      tag: input.tag || cls.tag || '普通号',
      price: Number(input.price) || 0,
      status: input.status || 'available',
      createdAt: new Date().toISOString(),
    };
    items.push(entry);
    await writeAll(env, items);
    return entry;
  },

  async bulkAdd(env, content) {
    if (typeof content !== 'string' || !content.trim()) {
      throw { status: 422, code: 'EMPTY', message: '上传内容为空' };
    }
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = await readAll(env);
    const existing = new Set(items.map((it) => it.number));
    const results = { inserted: 0, skipped: 0, errors: [] };
    const newEntries = [];

    for (const line of lines) {
      const delim = line.includes('\t') ? '\t' : line.includes('，') ? '，' : line.includes(',') ? ',' : line.includes(';') ? ';' : null;
      const fields = delim ? line.split(delim).map((s) => s.trim()) : [line];
      const number = normalizeNumber(fields[0]);
      if (!number) { results.errors.push({ line, reason: '无法识别为手机号' }); continue; }
      if (existing.has(number)) { results.skipped++; continue; }
      const cls = classifyNumber(number);
      const entry = {
        id: genId(),
        number,
        operator: fields[1] && ['移动', '联通', '电信', '虚拟运营商'].includes(fields[1]) ? fields[1] : detectOperator(number),
        level: fields[2] || cls.level,
        tag: fields[3] || cls.tag || '普通号',
        price: Number(fields[4]) || 0,
        status: 'available',
        createdAt: new Date().toISOString(),
      };
      existing.add(number);
      newEntries.push(entry);
      results.inserted++;
    }
    if (newEntries.length) {
      items.push(...newEntries);
      await writeAll(env, items);
    }
    return results;
  },

  async deleteNumber(env, id) {
    const items = await readAll(env);
    const idx = items.findIndex((it) => it.id === id);
    if (idx === -1) throw { status: 404, code: 'NOT_FOUND', message: '号码不存在' };
    const [removed] = items.splice(idx, 1);
    await writeAll(env, items);
    return removed;
  },
};
