import { json, error, authenticate, service } from '../../../_lib.js';

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
