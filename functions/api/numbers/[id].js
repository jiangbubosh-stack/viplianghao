import { json, error, seedIfEmpty, service } from '../../_lib.js';

export async function onRequestGet({ request, env, params }) {
  await seedIfEmpty(env);
  const item = await service.findById(env, params.id);
  if (!item) return error(404, 'NOT_FOUND', '号码不存在');
  if (item.onShelf === false) return error(404, 'OFF_SHELF', '号码已下架');
  // 顺便取几条推荐（同 tag 或 同 level，排除自己）
  const list = await service.list(env, { level: 'all', pageSize: 20, sort: 'new' });
  const recommend = list.data.filter((n) => n.id !== item.id && (n.tag === item.tag || n.level === item.level)).slice(0, 6);
  return json({ data: item, recommend });
}
