# 部署成「多端共享数据库 + 后台改完全网实时生效」的公网网站

本目录是 **Node.js + Express** 服务端版本：所有访客和后台**读写同一份数据文件**（`data/numbers.json`），
后台上传/删除后，前台每 ~20 秒自动刷新一次，**无需手动刷新即可全网生效**，多台设备看到的是同一份数据。

> 这是上一版「纯静态单文件」做不到的——静态版数据在各自浏览器里，互不相通。

---

## ⚠️ 最重要的一件事：数据持久化

云平台默认的文件系统是**临时**的：重启或重新部署后，没挂「持久卷」的数据会被清空。
所以必须做下面两件事之一：

1. **挂持久卷**：把 `DATA_DIR` 指向一个持久卷（推荐，见下方 Railway 步骤）。
2. **用 VPS**：自己的服务器文件系统是持久的，直接跑即可。

> 切勿在「不提供持久磁盘的免费 Node 平台」直接裸跑，否则每次部署号码全没。

---

## 方式一：Railway（最省心，托管 + 持久卷）

1. 注册 https://railway.app （可用 GitHub 登录）。
2. New Project → Deploy from GitHub repo（先把本目录推到 GitHub 私有仓库）。
3. Railway 会自动识别 Node 项目，`npm install` + `npm start`（`start` 脚本已配好）。
4. **设置环境变量**（Project → Variables）：
   - `ADMIN_PASSWORD` = 你自己的后台密码（**必改**）
   - `DATA_DIR` = `/data`（稍后挂的卷路径）
5. **挂载持久卷**（保证数据不丢）：
   - Project → Volumes → New Volume，挂载路径填 `/data`。
   - 这样 `DATA_DIR=/data` 指向持久盘，号码永久保存。
6. 部署完成后，Railway 会给你一个 `https://xxx.up.railway.app` 网址：
   - 前台：`https://xxx.up.railway.app/`
   - 后台：`https://xxx.up.railway.app/admin`（用上面设的密码登录）
7. 自定义域名（可选）：Project → Settings → Domains，绑定你的 `www.xxx.com`。

---

## 方式二：VPS（Oracle Always Free / 阿里云 / 腾讯云，最稳）

任意一台 Linux 服务器（Oracle 有永久免费机），完全持久，无厂商限制。

```bash
# 1. 装 Node 18+（已装可跳过）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 把项目传上去（scp / git clone 都行），进目录安装
cd phone-number-showcase
npm install --production

# 3. 设密码（务必改！）
export ADMIN_PASSWORD='你的强密码'

# 4. 用 pm2 守护进程（重启不挂）
sudo npm i -g pm2
pm2 start server.js --name phone-showcase
pm2 save && pm2 startup

# 5. 可选：用 nginx 反代 + HTTPS（域名访问 + 证书）
```

- 前台：`http://服务器IP:3000/`，后台：`http://服务器IP:3000/admin`
- 如需域名 + HTTPS，nginx 反代 3000 端口并配 Let's Encrypt 证书即可。

---

## 环境变量速查

| 变量 | 说明 | 默认 |
|------|------|------|
| `ADMIN_PASSWORD` | **后台密码，必改** | `admin888` |
| `DATA_DIR` | 数据目录，云上指向持久卷（如 `/data`） | `./data` |
| `PORT` | 监听端口（云平台自动注入） | `3000` |
| `HOST` | 绑定地址 | `0.0.0.0` |
| `ALLOWED_ORIGINS` | 跨域白名单，逗号分隔 | `*` |

---

## 本地自测

```bash
npm install
ADMIN_PASSWORD=你的密码 npm start
# 前台 http://localhost:3000/   后台 http://localhost:3000/admin
```

## 上线后怎么用

1. 打开 `/admin` 用密码登录。
2. 上传 / 粘贴 / 单个添加手机号码。
3. 回到 `/` 前台，约 20 秒内自动出现新号码（已加自动刷新）。
4. 任何设备、任何人访问该网址，看到的都是同一份实时数据。

## 隐私合规提醒

公开展示的手机号请确保是**自有或已授权**的号源，避免上传他人真实号码造成合规风险。
