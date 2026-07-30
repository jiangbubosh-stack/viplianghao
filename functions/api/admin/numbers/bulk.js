import { json, error, authenticate, service } from '../../../_lib.js';

// 批量操作：body = { action: 'onShelf'|'offShelf'|'recommend'|'unrecommend'|'special'|'unspecial'|'hot'|'unhot'|'sold'|'unsold'|'delete'|'clearPool', ids?: [], source?: '自有'|'公共' }
export async function onRequestPost({ request, env }) {
  if (!(await authenticate(request, env))) return error(401, 'UNAUTHORIZED', '请先登录');
  let body = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const { action, ids, source } = body || {};
  if (!action) return error(400, 'MISSING_ACTION', '缺少 action');

  try {
    if (action === 'clearPool') {
      if (!source) return error(400, 'MISSING_SOURCE', '清空号池时需指定 source');
      const r = await service.clearPool(env, source);
      return json(r);
    }
    if (action === 'delete') {
      let n = 0;
      for (const id of ids || []) {
        try { await service.deleteNumber(env, id); n++; } catch { /* skip */ }
      }
      return json({ deleted: n });
    }
    const patch = {};
    switch (action) {
      case 'onShelf': patch.onShelf = true; patch.status = 'available'; break;
      case 'offShelf': patch.onShelf = false; break;
      case 'recommend': patch.isRecommend = true; break;
      case 'unrecommend': patch.isRecommend = false; break;
      case 'special': patch.isSpecial = true; break;
      case 'unspecial': patch.isSpecial = false; break;
      case 'hot': patch.isHot = true; break;
      case 'unhot': patch.isHot = false; break;
      case 'sold': patch.isSold = true; patch.status = 'sold'; break;
      case 'unsold': patch.isSold = false; patch.status = 'available'; break;
      default: return error(400, 'UNKNOWN_ACTION', `未知操作: ${action}`);
    }
    const r = await service.bulkPatch(env, ids || [], patch);
    return json(r);
  } catch (e) {
    const status = e.status || 500;
    return error(status, e.code || 'INTERNAL', e.message || '未知错误');
  }
}
