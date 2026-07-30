import { json, error, seedIfEmpty, service } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  try {
    await seedIfEmpty(env);
    const url = new URL(request.url);
    const result = await service.list(env, {
      q: url.searchParams.get('q') || '',
      operator: url.searchParams.get('operator') || 'all',
      level: url.searchParams.get('level') || 'all',
      sort: url.searchParams.get('sort') || 'new',
      page: url.searchParams.get('page') || 1,
      pageSize: url.searchParams.get('pageSize') || 24,
    });
    return json(result);
  } catch (e) {
    if (e && e.message === 'KV_NOT_BOUND') return error(500, 'CONFIG', 'KV 未绑定：请在 Cloudflare Pages 设置里绑定名为 NUMBERS_KV 的 KV 命名空间');
    return error(500, 'INTERNAL', '服务器内部错误');
  }
}
