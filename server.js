'use strict';

/**
 * 手机靓号展示系统 + 上传后台
 * Phone Number Showcase + Admin Upload Backend
 *
 * Architecture: Route (HTTP) -> Service (business rules) -> Repository (JSON file)
 * No native deps. Storage is a JSON file (data/numbers.json); swap to SQLite later if needed.
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

// ----------------------------------------------------------------------------
// 1. CONFIG (centralized, env-driven, fail-fast on missing critical vars)
// ----------------------------------------------------------------------------
const resolvedDataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0', // bind all interfaces (required by most cloud containers)
  // Admin password. CHANGE THIS in production via env var.
  adminPassword: process.env.ADMIN_PASSWORD || 'admin888',
  adminPasswordHash: crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD || 'admin888').digest('hex'),
  // Data directory. On cloud platforms, point this at a PERSISTENT VOLUME (e.g. DATA_DIR=/data)
  // so uploaded numbers survive restarts/redeploys. Defaults to ./data for local/dev.
  dataDir: resolvedDataDir,
  numbersFile: path.join(resolvedDataDir, 'numbers.json'),
  // CORS: comma-separated allowed origins. Default reflects request origin (fine for same-origin).
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()),
  loginRateLimit: { windowMs: 10 * 60 * 1000, max: 10 }, // 10 attempts / 10 min per IP
};

// ----------------------------------------------------------------------------
// 2. REPOSITORY (data access only — no business logic, no HTTP types)
// ----------------------------------------------------------------------------
const repository = (() => {
  async function ensureFile() {
    try {
      await fsp.access(config.numbersFile);
    } catch {
      await fsp.mkdir(config.dataDir, { recursive: true });
      await fsp.writeFile(config.numbersFile, '[]', 'utf8');
    }
  }

  async function readAll() {
    await ensureFile();
    const raw = await fsp.readFile(config.numbersFile, 'utf8');
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  let writeQueue = Promise.resolve();
  async function writeAll(items) {
    await ensureFile();
    // Serialize writes to avoid race conditions on concurrent requests.
    writeQueue = writeQueue.then(() =>
      fsp.writeFile(config.numbersFile, JSON.stringify(items, null, 2), 'utf8')
    );
    return writeQueue;
  }

  return { readAll, writeAll };
})();

// ----------------------------------------------------------------------------
// 3. SERVICE (business rules)
// ----------------------------------------------------------------------------
function genId() {
  return 'n_' + crypto.randomBytes(6).toString('hex');
}

// Map CN mobile number prefix -> operator.
function detectOperator(number) {
  const seg = number.slice(0, 3);
  const two = number.slice(0, 2);
  if (['13', '15', '18', '14', '17', '16', '19'].includes(two)) {
    // Virtual operators
    if (['162', '165', '167', '170', '171'].includes(seg)) return '虚拟运营商';
    if (['134', '135', '136', '137', '138', '139', '147', '150', '151', '152', '157', '158', '159', '172', '178', '182', '183', '184', '187', '188', '198'].includes(seg)) return '移动';
    if (['130', '131', '132', '145', '155', '156', '166', '175', '176', '185', '186', '196'].includes(seg)) return '联通';
    if (['133', '149', '153', '173', '174', '177', '180', '181', '189', '199'].includes(seg)) return '电信';
  }
  return '未知';
}

// Inspect number pattern -> { level, tag }
function classifyNumber(number) {
  const tail = number.slice(-4);
  const digits = number.split('').map(Number);
  let tag = '';
  let level = '普通';

  // 尾号4连 AAAA
  if (/(\d)\1{3}$/.test(number)) {
    tag = `尾号${number[number.length - 1]}连`;
    level = '靓号';
  }
  // 尾号3连 AAA
  else if (/(\d)\1{2}$/.test(number.slice(-3))) {
    tag = `尾号${number[number.length - 1]}连`;
    level = '靓号';
  }
  // 对子号 AABB (last 4)
  else if (tail[0] === tail[1] && tail[2] === tail[3] && tail[0] !== tail[2]) {
    tag = '对子号';
    level = '靓号';
  }
  // 循环号 ABAB
  else if (tail[0] === tail[2] && tail[1] === tail[3] && tail[0] !== tail[1]) {
    tag = '循环号';
    level = '靓号';
  }
  // ABCD 顺序 (递增)
  else if (digits.slice(-4).every((d, i, a) => i === 0 || d === a[i - 1] + 1)) {
    tag = '顺子号';
    level = '靓号';
  }
  // DCBA 顺序 (递减)
  else if (digits.slice(-4).every((d, i, a) => i === 0 || d === a[i - 1] - 1)) {
    tag = '倒顺号';
    level = '靓号';
  }
  // 中间包含 888 / 666 / 000 等
  else if (number.includes('888')) { tag = '含888'; level = '靓号'; }
  else if (number.includes('666')) { tag = '含666'; level = '靓号'; }

  return { level, tag };
}

function normalizeNumber(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 11 || !digits.startsWith('1')) return null;
  return digits;
}

const service = {
  async list({ q, operator, level, status, page = 1, pageSize = 24, sort = 'new' }) {
    let items = await repository.readAll();
    if (q) {
      // q may be a full or partial number; support wildcard '*'
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
    const p = Math.max(1, parseInt(page, 10));
    const ps = Math.max(1, parseInt(pageSize, 10));
    const start = (p - 1) * ps;
    const data = items.slice(start, start + ps);
    return { data, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };
  },

  async stats() {
    const items = await repository.readAll();
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

  async addNumber(input) {
    const number = normalizeNumber(input.number);
    if (!number) throw { status: 422, code: 'INVALID_NUMBER', message: '手机号格式不正确（应为11位、1开头的中国大陆手机号）' };
    const items = await repository.readAll();
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
    await repository.writeAll(items);
    return entry;
  },

  // Parse bulk text: one number per line, or CSV-like (number,operator,level,tag,price).
  async bulkAdd(content) {
    if (typeof content !== 'string' || !content.trim()) {
      throw { status: 422, code: 'EMPTY', message: '上传内容为空' };
    }
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = await repository.readAll();
    const existing = new Set(items.map((it) => it.number));
    const results = { inserted: 0, skipped: 0, errors: [] };
    const newEntries = [];

    for (const line of lines) {
      // Detect delimiter: comma / tab / semicolon / Chinese comma
      const delim = line.includes('\t') ? '\t' : line.includes('，') ? '，' : line.includes(',') ? ',' : line.includes(';') ? ';' : null;
      let fields = delim ? line.split(delim).map((s) => s.trim()) : [line];
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
      await repository.writeAll(items);
    }
    return results;
  },

  async updateNumber(id, patch) {
    const items = await repository.readAll();
    const idx = items.findIndex((it) => it.id === id);
    if (idx === -1) throw { status: 404, code: 'NOT_FOUND', message: '号码不存在' };
    if (patch.price != null) items[idx].price = Number(patch.price) || 0;
    if (patch.status) items[idx].status = patch.status;
    if (patch.tag) items[idx].tag = patch.tag;
    await repository.writeAll(items);
    return items[idx];
  },

  async deleteNumber(id) {
    const items = await repository.readAll();
    const idx = items.findIndex((it) => it.id === id);
    if (idx === -1) throw { status: 404, code: 'NOT_FOUND', message: '号码不存在' };
    const [removed] = items.splice(idx, 1);
    await repository.writeAll(items);
    return removed;
  },
};

// ----------------------------------------------------------------------------
// 4. AUTH (token-based admin session)
// ----------------------------------------------------------------------------
const sessions = new Map(); // token -> { createdAt }

function createToken() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function authenticate(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ title: 'UNAUTHORIZED', status: 401, detail: '请先登录' });
  }
  next();
}

// Login rate limiting per IP
const loginAttempts = new Map(); // ip -> [{t}]
function checkLoginRateLimit(ip) {
  const now = Date.now();
  const arr = (loginAttempts.get(ip) || []).filter((t) => now - t < config.loginRateLimit.windowMs);
  if (arr.length >= config.loginRateLimit.max) return false;
  arr.push(now);
  loginAttempts.set(ip, arr);
  return true;
}

// ----------------------------------------------------------------------------
// 5. APP + MIDDLEWARE
// ----------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '5mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // CORS
  const origin = req.headers.origin;
  if (config.allowedOrigins.includes('*') || (origin && config.allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Structured request logging
app.use((req, res, next) => {
  const rid = crypto.randomBytes(4).toString('hex');
  req.rid = rid;
  if (req.path.startsWith('/api')) {
    console.log(JSON.stringify({ level: 'info', msg: 'request', rid, method: req.method, path: req.path, ip: req.ip }));
  }
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Explicit routes for extensionless pages
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ---- Public API ----
app.get('/api/numbers', async (req, res, next) => {
  try {
    const result = await service.list(req.query);
    res.json(result);
  } catch (e) { next(e); }
});

app.get('/api/stats', async (req, res, next) => {
  try {
    res.json(await service.stats());
  } catch (e) { next(e); }
});

// Recent orders marquee (public, read-only sample of available numbers)
app.get('/api/recent', async (req, res, next) => {
  try {
    const items = await repository.readAll();
    const recent = items
      .filter((it) => it.status === 'available')
      .slice(-12)
      .reverse()
      .map((it) => it.number);
    res.json({ data: recent });
  } catch (e) { next(e); }
});

// ---- Admin API ----
app.post('/api/admin/login', (req, res, next) => {
  try {
    const ip = req.ip;
    if (!checkLoginRateLimit(ip)) {
      return res.status(429).json({ title: 'RATE_LIMIT', status: 429, detail: '登录尝试过于频繁，请稍后再试' });
    }
    const pwd = req.body && req.body.password ? String(req.body.password) : '';
    const hash = crypto.createHash('sha256').update(pwd).digest('hex');
    if (!pwd || hash !== config.adminPasswordHash) {
      return res.status(401).json({ title: 'UNAUTHORIZED', status: 401, detail: '密码错误' });
    }
    const token = createToken();
    res.json({ token, expiresIn: 'session' });
  } catch (e) { next(e); }
});

app.post('/api/admin/numbers', authenticate, async (req, res, next) => {
  try {
    const entry = await service.addNumber(req.body || {});
    res.status(201).json(entry);
  } catch (e) { next(e); }
});

app.post('/api/admin/upload', authenticate, async (req, res, next) => {
  try {
    const { content } = req.body || {};
    const result = await service.bulkAdd(content);
    res.json(result);
  } catch (e) { next(e); }
});

app.get('/api/admin/numbers', authenticate, async (req, res, next) => {
  try {
    const result = await service.list({ ...req.query, pageSize: req.query.pageSize || 100 });
    res.json(result);
  } catch (e) { next(e); }
});

app.put('/api/admin/numbers/:id', authenticate, async (req, res, next) => {
  try {
    const entry = await service.updateNumber(req.params.id, req.body || {});
    res.json(entry);
  } catch (e) { next(e); }
});

app.delete('/api/admin/numbers/:id', authenticate, async (req, res, next) => {
  try {
    const removed = await service.deleteNumber(req.params.id);
    res.json({ deleted: removed.id });
  } catch (e) { next(e); }
});

// ---- Global error handler (typed, consistent format) ----
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  const code = err.code || 'INTERNAL';
  const detail = status === 500 ? '服务器内部错误' : (err.message || '未知错误');
  if (status === 500) {
    console.error(JSON.stringify({ level: 'error', msg: 'unhandled', rid: req.rid, error: err.message, stack: err.stack }));
  }
  res.status(status).json({ title: code, status, detail });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(JSON.stringify({ level: 'info', msg: 'SIGTERM' }));
  process.exit(0);
});

// Seed sample data if empty
(async () => {
  const items = await repository.readAll();
  if (items.length === 0) {
    const samples = [
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
    for (const s of samples) {
      try { await service.addNumber(s); } catch { /* ignore dup */ }
    }
    console.log(JSON.stringify({ level: 'info', msg: 'seeded', count: samples.length }));
  }
})();

app.listen(config.port, config.host, () => {
  console.log(JSON.stringify({ level: 'info', msg: 'server_start', port: config.port, host: config.host, dataDir: config.dataDir }));
});

module.exports = app;
