// 一次性导入接口：用 functions/_seed_raw.js 中的 Excel 数据，整体替换 KV 中的号码库。
// 用途：去掉原来的演示数据，补充真实号码。受后台密码保护。
// 用完后可删除本文件（通过 gh api DELETE）以降低风险。
import {
  authenticate, json, error,
  writeAll, classifyNumber, detectOperator, getLocation, getBrand, getHotline, genId,
} from '../../_lib.js';
import { RAW_NUMBERS } from '../../_seed_raw.js';

export async function onRequestPost({ request, env }) {
  if (!(await authenticate(request, env))) return error(401, 'UNAUTHORIZED', '请先登录');

  const raw = Array.isArray(RAW_NUMBERS) ? RAW_NUMBERS : [];
  if (!raw.length) return error(400, 'EMPTY', '种子数据为空');

  const items = [];
  const seen = new Set();
  for (const r of raw) {
    const number = String(r.number || '').replace(/\D/g, '');
    if (number.length !== 11 || !number.startsWith('1')) continue;
    if (seen.has(number)) continue;
    seen.add(number);

    const op = detectOperator(number);
    const [prov, city] = getLocation(number);
    const cls = classifyNumber(number);
    const onShelf = r.onShelf !== false;

    items.push({
      id: genId(),
      number,
      operator: op,
      brand: getBrand(number),
      province: prov,
      city,
      hotline: getHotline(op),
      level: r.level || '靓号',
      tag: r.tailType || cls.tag || '普通号',
      price: Number(r.deposit) || 0,
      originalPrice: Number(r.originalPrice) || 0,
      packageDetail: r.packageDetail
        || `月承诺通信费${Number(r.monthly) || 0}元，协议期${Number(r.period) || 0}个月`,
      installment: Number(r.installment) || 0,
      source: r.source || '自有',
      recommendLevel: r.recommendLevel || '',
      isHot: Boolean(r.isHot),
      isRecommend: Boolean(r.recommend),
      isSpecial: Boolean(r.isSpecial),
      onShelf,
      isSold: Boolean(r.isSold),
      status: onShelf ? (r.isSold ? 'sold' : 'available') : 'offline',
      createdAt: new Date().toISOString(),
    });
  }

  await writeAll(env, items);
  return json({ ok: true, count: items.length, removed: 'all-previous' });
}
