import { json, error, authenticate, service } from '../../../_lib.js';

export async function onRequestPut({ request, env, params }) {
  if (!(await authenticate(request, env))) return error(401, 'UNAUTHORIZED', '请先登录');
  let body = {};
  try { body = await request.json(); } catch { /* ignore */ }
  try {
    const updated = await service.updateNumber(env, params.id, body || {});
    return json(updated);
  } catch (e) {
    const status = e.status || 500;
    return error(status, e.code || 'INTERNAL', e.message || '未知错误');
  }
}

export async function onRequestDelete({ request, env, params }) {
  if (!(await authenticate(request, env))) return error(401, 'UNAUTHORIZED', '请先登录');
  try {
    const removed = await service.deleteNumber(env, params.id);
    return json({ deleted: removed.id });
  } catch (e) {
    const status = e.status || 500;
    return error(status, e.code || 'INTERNAL', e.message || '未知错误');
  }
}
