# 手机靓号展示系统 + 上传后台

参考 `789.qwt365.com`（全国靓号选号系统）实现的展示前台 + 管理后台。

## 功能
- **前台展示** (`/`): 靓号大厅、滚动“恭喜下单”公告、11 位精准选号（支持 `*` 通配）、运营商/类型筛选、价格排序、分页。
- **管理后台** (`/admin`): 密码登录（Token 鉴权），支持三种上传方式：
  1. 文件上传（`.txt` / `.csv`，每行一个号码，或用逗号分隔 `号码,运营商,类型,标签,价格`）
  2. 粘贴文本批量导入
  3. 单个手动添加
  - 号码列表管理（删除）、实时统计。
- **自动识别**: 运营商按号段自动判定；靓号等级/标签按尾号规律自动分类（4连、3连、AABB、ABAB、顺子、倒顺、含888/666）。
- **安全**: 后台登录限流、CORS 限制、安全响应头、所有写入接口服务端校验、去重。

## 运行
```bash
npm install
npm start          # 默认 http://localhost:3000
```
环境变量（可选，见 `.env.example`）:
- `ADMIN_PASSWORD` 后台密码（**务必修改**，默认 `admin888`）
- `PORT` 端口（默认 3000）
- `ALLOWED_ORIGINS` 允许的来源，逗号分隔（默认 `*`）

## 接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/numbers` | 公开列表，支持 `q,operator,level,sort,page,pageSize` |
| GET | `/api/stats` | 公开统计 |
| GET | `/api/recent` | 滚动公告数据 |
| POST | `/api/admin/login` | 管理员登录，返回 token |
| POST | `/api/admin/numbers` | 单个添加（需鉴权） |
| POST | `/api/admin/upload` | 批量导入 `{content}`（需鉴权） |
| GET | `/api/admin/numbers` | 后台列表（需鉴权） |
| PUT | `/api/admin/numbers/:id` | 更新（需鉴权） |
| DELETE | `/api/admin/numbers/:id` | 删除（需鉴权） |

## 数据存储
号码保存在 `data/numbers.json`（JSON 文件，零原生依赖）。规模变大时可替换为 SQLite/数据库，仅需改动 `server.js` 中的 repository 层。

## 部署
纯 Node 服务，可直接部署到任意支持 Node 的平台（如 CloudStudio / 云服务器）。如需公网访问，建议放在 Nginx 反代后并启用 HTTPS。
