# VocabMaster — 在 iPhone 上安装使用指南

## 方法一：PWA（推荐 — 最简单，无需任何额外工具）⭐

### 第 1 步：图标已就绪
PNG 图标（icon-180.png, icon-192.png, icon-512.png）已生成在 `icons/` 文件夹中。
如需自定义图标，打开 `icons/generate-icons.html` 重新生成。

### 第 2 步：通过 HTTPS 访问应用
PWA 需要 HTTPS（Service Worker 的安全要求）。有以下免费选项：

**选项 A — GitHub Pages（推荐）**
```bash
# 在项目目录中执行：
git init
git add -A
git commit -m "Initial commit"
# 在 GitHub 上创建仓库，然后：
git remote add origin https://github.com/你的用户名/vocabmaster.git
git branch -M main
git push -u origin main
# 然后在仓库 Settings → Pages → Source: main branch → Save
# 几分钟后即可通过 https://你的用户名.github.io/vocabmaster 访问
```

**选项 B — 本地局域网 + 自签名证书**
```bash
# 安装 local-web-server
npm install -g local-web-server
# 生成自签名证书（一次性）
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
# 启动 HTTPS 服务
ws --https --cert cert.pem --key key.pem -p 443
# 在 iPhone Safari 访问 https://你电脑的局域网IP
# 注意：需要先在 iPhone 上信任自签名证书
```

**选项 C — Cloudflare Tunnel（免费）**
```bash
# 安装 cloudflared
winget install cloudflare.cloudflared
# 创建隧道
cloudflared tunnel --url http://localhost:3000
# 会得到一个 https://xxx.trycloudflare.com 地址
# 先用 npx serve . -l 3000 启动本地服务，再开隧道
```

**选项 D — Netlify / Vercel Drop**
直接将整个文件夹拖到 https://app.netlify.com/drop 即可部署。

### 第 3 步：在 iPhone 上安装
1. 在 iPhone 上打开 **Safari**（必须是 Safari，Chrome 不行）
2. 访问你的 HTTPS 地址
3. 点击底部 **分享按钮**（⬆）
4. 滑动找到 **"Add to Home Screen"**（添加到主屏幕）
5. 点击 **"Add"**（添加）
6. ✨ 完成！VocabMaster 图标将出现在主屏幕上，作为独立 App 运行

> **好处**：无需 Apple 开发者账号、无需 Mac、无需越狱。独立窗口、全屏运行、支持离线使用。

---

## 🔄 跨设备数据同步

使用 **Supabase**（免费云数据库）实现 PC 网页版与 iPhone 之间的自动同步。

### 第 1 步：创建 Supabase 项目（一次性，2 分钟）
1. 打开 https://supabase.com → **Sign Up**（可用 GitHub 登录）
2. 点击 **"New project"**
3. 填写项目名称（如 `vocabmaster`）
4. 设置数据库密码（记下它）
5. Region 选择离你最近的（如 **Singapore** 或 **Tokyo**）
6. 点击 **"Create project"** → 等待 2 分钟初始化

### 第 2 步：创建同步表
1. 在 Supabase 项目中 → 左侧菜单 **SQL Editor**
2. 点击 **"New query"**
3. 将项目文件夹中的 `supabase-schema.sql` 内容粘贴进去
4. 点击 **Run**（右下角绿色按钮）

### 第 3 步：获取连接信息
1. 左侧菜单 → **Settings** → **API**
2. 复制 **Project URL**（如 `https://xxxxxxxxxxxx.supabase.co`）
3. 复制 **anon public** key（一长串字符）
4. 想一个 **Sync Passphrase**（如 `my-vocab-secret-2024`）

### 第 4 步：在 App 中配置同步
1. 打开 VocabMaster → 左下角 ⚙ **Settings**
2. 展开 **"🔄 Cross-Device Sync"** 区域
3. 填入 Supabase URL、Anon Key、Sync Passphrase
4. 点击 **Save Settings**
5. 点击 **"Sync Now"** 测试
6. 在另一台设备上重复以上步骤（填入**相同的** Supabase 信息和 Passphrase）

### 同步行为
- **启动时**：自动拉取远程数据（2 秒延迟）
- **修改后**：添加/删除单词、完成复习、打卡后自动推送（1.5 秒延迟）
- **手动**：点击 Settings 中的 **"Sync Now"** 按钮

### 合并策略
- 单词：按复习进度更优的版本保留
- 打卡：取并集
- 词书：按已释放单词数更多的版本保留
- API Key 等密钥：永远以本地为准（不会从远程覆盖）

---

## 方法二：Capacitor 打包为真正的 .ipa（需要 Mac）

### 前置条件
- 一台 **Mac**（或 MacStadium/MacInCloud 云 Mac）
- **Apple ID**（免费即可，用于个人签名，7 天有效）
- Xcode 16+

### 第 1 步：在 Mac 上安装依赖
```bash
# 将项目文件夹复制到 Mac，然后：
cd vocab-app
npm install
```

### 第 2 步：构建 www 目录并添加 iOS 平台
```bash
npm run build           # 复制文件到 www/
npx cap add ios         # 生成 iOS 项目
npm run cap:sync        # 同步 web 资源到 iOS 项目
npx cap open ios        # 在 Xcode 中打开
```

### 第 3 步：在 Xcode 中签名并构建
1. 在 Xcode 中，选择 **VocabMaster** target
2. **Signing & Capabilities** → Team 选择你的 Apple ID
3. 修改 Bundle Identifier（如 `com.yourname.vocabmaster`）
4. 连接 iPhone → 选择设备 → **Product → Run**（▶）

> **注意**：免费 Apple ID 签名的 App 每 **7 天**需要重新安装。到期后重新连接 Mac 运行一次即可。

### 通过 GitHub Actions 自动构建（高级）
如果你不想每次手动构建，可以在 `.github/workflows/` 中配置 CI 自动构建 IPA。

---

## 数据备份

VocabMaster 所有数据存储在浏览器的 `localStorage` 中。定期导出：
1. 打开 App → 点击左下角 **⚙ Settings**
2. 点击 **"Export Data"** 按钮
3. 保存 JSON 文件到 iCloud/其他云盘

导入时：在 Settings 中替换 localStorage 数据即可。
