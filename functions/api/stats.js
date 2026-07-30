import { json, error, seedIfEmpty, service } from '../_lib.js';

export async function onRequestGet({ env }) {
  try {
    await seedIfEmpty(env);
    return json(await service.stats(env));
  } catch (e) {
    if (e && e.message === 'KV_NOT_BOUND') return error(500, 'CONFIG', 'KV 未绑定：请在 Cloudflare Pages 设置里绑定名为 NUMBERS_KV 的 KV 命名空间');
    return error(500, 'INTERNAL', '服务器内部错误');
  }
}
