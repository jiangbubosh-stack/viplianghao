# 通过 Spaceship App Hosting（Hyperlift）部署 viplianghao.com

本指南对应「路线 A」：代码推到 GitHub → 在 Spaceship 后台用 App Hosting（Hyperlift）连仓库自动部署 → 绑定域名。
应用已具备部署条件：`package.json` 含 `engines.node>=18` 与 `npm start`，根目录有 `Procfile`，监听 `process.env.PORT`（平台自动注入），绑定 `0.0.0.0`。

---

## 前置条件
- 一个 **GitHub 账号**（免费）。Hyperlift 通过连接 GitHub 拉取代码构建部署。
- 本目录已是 git 仓库（分支 `main`，已提交，无密钥入库）。

---

## 第 1 步：把代码推到 GitHub

### 方式一：给我一个 GitHub Token，我替你建仓库并推送（最省事）
1. GitHub 网页 → 右上角头像 → **Settings** → 左侧 **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
2. 勾选 `repo`（整项）权限，过期选 7 天即可，点 Generate
3. 把生成的 token（格式 `ghp_xxxx`）发我
4. 我执行：建空仓库 + `git remote add origin` + `git push -u origin main`
> ⚠️ token 仅用于这一次推送，用完可立即在 GitHub 撤销（Revoke）。

### 方式二：你自己推（3 条命令）
1. GitHub 网页新建一个**空仓库**（不要勾 Add README / .gitignore）
2. 复制仓库的 HTTPS 地址（形如 `https://github.com/你的名/仓库名.git`）
3. 在本目录终端执行：
```bash
git remote add origin https://github.com/你的名/仓库名.git
git branch -M main
git push -u origin main
```

---

## 第 2 步：Spaceship 后台开通 Hyperlift 并连 GitHub
1. 登录 **spaceship.com** → 顶部/侧栏 **Hosting** → **App Hosting（Starlight Hyperlift）**
2. 点 **New App / Create App** → 选 **Deploy from GitHub**
3. 首次会跳 GitHub 授权，点 **Authorize Spaceship** 允许连接
4. 选择第 1 步推送的仓库
5. 构建/启动设置：
   - **Build command**：留空（无构建步骤）或填 `npm install`
   - **Start command**：`npm start`（Express 已内置，通常自动识别，填了更稳）
   - **Runtime**：Node.js（自动识别）
6. 点 **Deploy**，等构建完成（约 1–2 分钟），平台会给一个临时域名，如 `xxx.hyperlift.app`

> 若部署失败报「无法识别应用」，确认 Start command 已显式填 `npm start`，且仓库根目录有 `package.json`。

---

## 第 3 步：绑定 viplianghao.com
1. 在 Hyperlift 应用的 **Settings / Domains** 里点 **Add domain / Custom domain**，填 `viplianghao.com`
2. 按提示回 Spaceship 的 **DNS** 管理，添加平台要求的记录（一般是把 `viplianghao.com` 用 **CNAME** 指向 Hyperlift 提供的目标，或 Hyperlift 自动接管该域名的 DNS）
3. 等 DNS 生效（几分钟到几小时，取决于 TTL）
4. 在域名设置里开启 **HTTPS / SSL**（Spaceship 提供免费证书，自动签发）
5. 生效后访问：
   - 前台：`https://viplianghao.com/`
   - 后台：`https://viplianghao.com/admin`

---

## 第 4 步：设置管理员密码（务必做）
1. 在 Hyperlift 应用的 **Environment Variables / 环境变量** 里新增：
   - `ADMIN_PASSWORD` = 你的强密码（例如 `VipLh#2026$xK`）
2. 保存后 **Redeploy**（重新部署）使变量生效
3. 之后 `/admin` 用这个密码登录

> 不设置的话，默认密码是 `admin888`，任何人都能进后台删你号码。

---

## 第 5 步：上传号码并验证
1. 打开 `https://viplianghao.com/admin`，用上面的密码登录
2. 用「文件上传 / 粘贴文本 / 单条添加」录入号码（格式：`号码,运营商,类型,标签,价格`，留空自动识别）
3. 打开前台 `https://viplianghao.com/`，约 **20 秒**自动刷新出现你上传的号码（前台已做轮询）
4. 任何设备访问同一网址，看到的都是这份实时数据 ✅

---

## ⚠️ 持久化重要说明
Hyperlift 是**无状态应用主机**，文件系统默认在**每次重新部署（redeploy / 推新代码）时会重置**：
- 运行期间你在后台上传的号码，**在容器重启/重新部署前都在**；
- 一旦你改了代码重新部署，未持久化的 `data/numbers.json` 会被清空，回到内置的 20 个示例靓号。

若要做到「重部署也不丢数据」，二选一：
1. **升级到 Starlight VPS（路线 B）**：真实硬盘，数据天然持久（推荐长期用）；
2. **给 Hyperlift 挂持久卷**（若平台支持），并把 `DATA_DIR` 环境变量指向挂载的绝对路径。

> 当前已内置 20 个示例靓号，首次部署即使不传数据也有展示内容。

---

## 环境变量速查
| 变量 | 说明 | 建议值 |
|------|------|--------|
| `PORT` | 平台自动注入，无需手设 | — |
| `ADMIN_PASSWORD` | 后台登录密码（**必设**） | 你的强密码 |
| `DATA_DIR` | 数据目录，默认 `./data` | 挂持久卷时填绝对路径 |
| `ALLOWED_ORIGINS` | CORS 允许来源，默认 `*` | `https://viplianghao.com` |
| `HOST` | 监听地址，默认 `0.0.0.0` | 无需改 |

---

## 故障排查
- **页面打不开 / 502**：确认 Start command 是 `npm start`；看 Hyperlift 的 Build/Deploy 日志有无 `npm install` 报错。
- **后台密码不对**：确认 `ADMIN_PASSWORD` 已设且已 Redeploy 生效。
- **域名不生效**：检查 DNS 记录是否按 Hyperlift 提示添加，且 TTL 已过期（可用 `dig viplianghao.com` 看是否解析到新地址）。
- **上传的号码没了**：见上方「持久化说明」——是重新部署导致，改用 VPS 或挂持久卷解决。
