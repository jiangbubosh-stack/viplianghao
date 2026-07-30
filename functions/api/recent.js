import { json, error, seedIfEmpty, readAll } from '../_lib.js';

export async function onRequestGet({ env }) {
  try {
    await seedIfEmpty(env);
    const items = await readAll(env);
    const recent = items
      .filter((it) => it.status === 'available')
      .slice(-12)
      .reverse()
      .map((it) => it.number);
    return json({ data: recent });
  } catch (e) {
    if (e && e.message === 'KV_NOT_BOUND') return error(500, 'CONFIG', 'KV 未绑定：请在 Cloudflare Pages 设置里绑定名为 NUMBERS_KV 的 KV 命名空间');
    return error(500, 'INTERNAL', '服务器内部错误');
  }
}
