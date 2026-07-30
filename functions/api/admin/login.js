import { json, error, expectedToken, sha256Hex } from '../../_lib.js';

// 简易登录限流（按 IP，内存级；函数实例可能轮换，但能挡大部分暴力）
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (arr.length >= 10) return true;
  arr.push(now);
  attempts.set(ip, arr);
  return false;
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (rateLimited(ip)) return error(429, 'RATE_LIMIT', '登录尝试过于频繁，请稍后再试');

  let body = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const pwd = body && body.password ? String(body.password) : '';
  const exp = await expectedToken(env);
  if (!pwd || (await sha256Hex(pwd)) !== exp) {
    return error(401, 'UNAUTHORIZED', '密码错误');
  }
  return json({ token: exp, expiresIn: 'session' });
}
