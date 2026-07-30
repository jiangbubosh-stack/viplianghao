import { json, error, authenticate, service } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!(await authenticate(request, env))) return error(401, 'UNAUTHORIZED', '请先登录');
  let body = {};
  try { body = await request.json(); } catch { /* ignore */ }
  try {
    const result = await service.bulkAdd(env, body && body.content);
    return json(result);
  } catch (e) {
    const status = e.status || 500;
    return error(status, e.code || 'INTERNAL', e.message || '未知错误');
  }
}
