# 部署就绪

- wrangler.toml 已移除（其中的 KV 占位符会导致 Functions 部署失败）
- KV 绑定请到 Cloudflare 控制台 Settings -> Functions -> KV namespace bindings，变量名填 NUMBERS_KV
- 本文件仅用于触发重新部署，对站点无功能影响