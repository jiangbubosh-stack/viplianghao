import { json, error, authenticate, seedIfEmpty, service } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  if (!(await authenticate(request, env))) return error(401, 'UNAUTHORIZED', '请先登录');
  try {
    await seedIfEmpty(env);
    const url = new URL(request.url);
    const result = await service.list(env, {
      q: url.searchParams.get('q') || '',
      operator: url.searchParams.get('operator') || 'all',
      level: url.searchParams.get('level') || 'all',
      status: url.searchParams.get('status') || 'all',
      sort: 'new',
      page: url.searchParams.get('page') || 1,
      pageSize: url.searchParams.get('pageSize') || 100,
    });
    return json(result);
  } catch (e) {
    return error(500, 'INTERNAL', '服务器内部错误');
  }
}

export async function onRequestPost({ request, env }) {
  if (!(await authenticate(request, env))) return error(401, 'UNAUTHORIZED', '请先登录');
  let body = {};
  try { body = await request.json(); } catch { /* ignore */ }
  try {
    const entry = await service.addNumber(env, body || {});
    return json(entry, 201);
  } catch (e) {
    const status = e.status || 500;
    return error(status, e.code || 'INTERNAL', e.message || '未知错误');
  }
}
