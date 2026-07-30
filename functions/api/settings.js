import { json, error, getSettings, DEFAULT_SETTINGS } from '../_lib.js';

// 公开读取站点设置（前台渲染品牌名/Banner/公告/客服方式/主题色）
export async function onRequestGet({ env }) {
  try {
    const settings = await getSettings(env);
    return json(settings);
  } catch (e) {
    if (e && e.message === 'KV_NOT_BOUND') return error(500, 'CONFIG', 'KV 未绑定：请在 Cloudflare Pages 设置里绑定名为 NUMBERS_KV 的 KV 命名空间');
    return json({ ...DEFAULT_SETTINGS });
  }
}
