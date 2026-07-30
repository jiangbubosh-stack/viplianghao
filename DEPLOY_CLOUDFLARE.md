# 部署到 Cloudflare Pages（免费 · 无需服务器 · 无需信用卡）

本方案把网站部署到 **Cloudflare Pages**：前端展示页 + 管理后台 + 免费 KV 数据库。
效果与"买服务器"完全一致——后台改完，任何设备约 20 秒内自动更新，所有访客共享同一份数据。
**全程免费、免信用卡。**

---

## 一、准备（一次性）

1. 注册 Cloudflare 免费账号：https://dash.cloudflare.com/sign-up
2. 代码已经在 GitHub：`https://github.com/jiangbubosh-stack/viplianghao`
   （仓库已含 `public/` 前端、`functions/` 后端、`wrangler.toml`）

## 二、部署 Pages（连 GitHub）

1. 登录 Cloudflare 仪表盘 → 左侧 **Workers & Pages** → 右上 **Create** → 选 **Pages** → **Connect to Git**
2. 授权 GitHub，选择仓库 **`jiangbubosh-stack/viplianghao`**
3. 构建设置（基本会自动识别，确认一下）：
   - **Framework preset**：选 `None`（无框架）
   - **Build command**：**留空**
   - **Build output directory**：`public`
4. 点 **Save and Deploy**，等 1~2 分钟，会得到 `https://<项目名>.pages.dev` 临时域名

## 三、绑定 KV 数据库（最关键，否则后台报错）

Pages 部署完成后：

1. Cloudflare 仪表盘 → **Workers & Pages** → 你的项目 → **Settings** → **Functions**
2. 找到 **KV namespace bindings** → **Add binding**
   - **Variable name**：必须填 **`NUMBERS_KV`**（代码里写死了这个名字）
   - **KV namespace**：选 **Create new** 新建一个（随便起名，比如 `phone-numbers`）
3. 保存后，**回到项目首页点一次 Redeploy**（让绑定生效）

> 没绑定 KV 时，访问页面会提示"KV 未绑定"，绑定并重新部署后即正常，且会自动写入 20 个示例靓号。

## 四、设置后台密码（务必改）

1. 项目 → **Settings** → **Environment variables**（或 Variables）
2. 添加变量：
   - **Variable name**：`ADMIN_PASSWORD`
   - **Value**：你的强密码（例如 `Lianghao@2026!`）
3. 保存 → 再 **Redeploy** 一次
4. 之后后台用这个密码登录（`/admin`）

## 五、绑定自己的域名 viplianghao.com

1. 项目 → **Custom domains** → **Set up a custom domain** → 输入 `viplianghao.com`
2. Cloudflare 会提示去 Spaceship（你的域名注册商）改 DNS：
   - 登录 Spaceship → 域名 `viplianghao.com` → **DNS Records**
   - 添加一条 **CNAME**：主机名 `www` → 指向 `<项目名>.pages.dev`
   - 根域 `viplianghao.com` 用 **CNAME**（部分注册商支持）指向 `<项目名>.pages.dev`
     （Spaceship 若不支持根域 CNAME，可把 `www.viplianghao.com` 作为主域名，或开启 Cloudflare 的 CNAME flattening）
3. 等几分钟 SSL 证书自动签发，即可用 `https://viplianghao.com/` 访问

## 六、怎么用

- 展示页：`https://viplianghao.com/`（精准选号、筛选、滚动公告、20 秒自动刷新）
- 后台：`https://viplianghao.com/admin`（密码 = 上面设的 `ADMIN_PASSWORD`）
  - 文件上传 / 粘贴文本批量导入 / 单个添加 / 删除
- 后台改动后，回前台约 20 秒自动出现，**任何设备访问同一网址看到的都是这份实时数据**

## 七、数据会不会丢？

**不会。** 号码存在 Cloudflare 的免费 KV 数据库里，与"部署"解耦——重部署、改代码都不会清空。
（对比 Spaceship Hyperlift：它把数据写在容器磁盘，重部署会丢，必须额外挂卷。）

## 八、免费额度说明

- Pages 静态托管 + Functions：免费
- KV：免费额度足够小站点（每日十万级读、千级写）
- 注意：KV 是**最终一致性**，后台改完到访客看到通常几秒~最多约 1 分钟（前台每 20 秒轮询一次，体感很快）

## 九、改代码后如何更新

本仓库已推到 GitHub。在 Cloudflare 项目页点 **Redeploy** 即可拉取最新代码重新部署。
（若你在本地改了文件，先 `git push` 再 Redeploy。）
