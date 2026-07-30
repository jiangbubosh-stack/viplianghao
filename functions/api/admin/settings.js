import { json, error, authenticate, saveSettings } from '../../_lib.js';

// 后台保存站点设置（需登录；只允许更新白名单字段）
export async function onRequestPost({ request, env }) {
  if (!(await authenticate(request, env))) return error(401, 'UNAUTHORIZED', '未登录或登录已失效');

  let body = {};
  try {
    body = await request.json();
  } catch {
    return error(422, 'BAD_JSON', '请求体不是合法 JSON');
  }

  const allowed = ['siteName', 'logoText', 'contactQrUrl', 'contactPhone', 'contactWechat', 'banners', 'themeColor', 'noticeText'];
  const patch = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  // banners 支持数组或"每行一个 URL"的字符串
  if (patch.banners != null && !Array.isArray(patch.banners)) {
    patch.banners = String(patch.banners).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  try {
    const next = await saveSettings(env, patch);
    return json({ ok: true, settings: next });
  } catch (e) {
    if (e && e.message === 'KV_NOT_BOUND') return error(500, 'CONFIG', 'KV 未绑定：请先绑定 NUMBERS_KV');
    return error(500, 'INTERNAL', '保存失败');
  }
}
