import { json, error, seedIfEmpty, service } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  await seedIfEmpty(env);
  const url = new URL(request.url);
  try {
    const result = await service.list(env, {
      q: url.searchParams.get('q') || '',
      operator: url.searchParams.get('operator') || 'all',
      level: url.searchParams.get('level') || 'all',
      status: url.searchParams.get('status') || 'all',
      brand: url.searchParams.get('brand') || 'all',
      province: url.searchParams.get('province') || 'all',
      city: url.searchParams.get('city') || 'all',
      source: url.searchParams.get('source') || 'all',
      recommendLevel: url.searchParams.get('recommendLevel') || 'all',
      onShelf: url.searchParams.get('onShelf') || 'all',
      isSold: url.searchParams.get('isSold') || 'all',
      isHot: url.searchParams.get('isHot') || 'all',
      isRecommend: url.searchParams.get('isRecommend') || 'all',
      isSpecial: url.searchParams.get('isSpecial') || 'all',
      isFengshui: url.searchParams.get('fengshui') || url.searchParams.get('isFengshui') || 'all',
      minPrice: url.searchParams.get('minPrice') || '',
      maxPrice: url.searchParams.get('maxPrice') || '',
      notIn: url.searchParams.get('notIn') || '',
      sort: url.searchParams.get('sort') || 'new',
      page: url.searchParams.get('page') || 1,
      pageSize: url.searchParams.get('pageSize') || 24,
    });
    return json(result);
  } catch (e) {
    return error(500, 'INTERNAL', '服务器内部错误');
  }
}
