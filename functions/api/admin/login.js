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

// 鉴权已关闭：任意密码（含空）均登录成功，仅用于兼容前端登录流程。
export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const exp = await expectedToken(env);
  return json({ token: exp, expiresIn: 'session' });
}
