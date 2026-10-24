# Hello World 网站（Node.js 零依赖版）

> 浏览器显示「Hello World！我是【cxj】，我的第一个 AI 开发的网站」，并实时显示当前服务器时间。

## 一、项目结构

```text
helloworld-node/
├── package.json          # 项目描述、启动脚本（start / dev）
├── server.js             # 服务器入口：静态资源托管 + /api/time 接口
├── README.md             # 说明文档（本文件）
└── public/               # 前端静态资源目录
    ├── index.html        # 页面结构：Hello World + 服务器时间
    ├── style.css         # 页面样式（浅色卡片风、响应式）
    └── app.js            # 前端逻辑：拉取并实时显示服务器时间
```

## 二、运行命令

```bash
# 1. 进入项目目录
cd helloworld-node

# 2. 启动服务（无需 npm install，项目零依赖）
npm start
# 等价于：node server.js

# 3. 换端口启动
PORT=4000 node server.js        # macOS / Linux / Git Bash
```

Windows CMD / PowerShell 换端口：

```powershell
$env:PORT=4000; node server.js
```

打开浏览器访问 <http://localhost:3000>

## 三、接口说明

| 方法 | 路径          | 说明                     |
| ---- | ------------- | ------------------------ |
| GET  | `/`           | 首页（public/index.html） |
| GET  | `/api/time`   | 当前服务器时间（JSON）    |
| GET  | `/healthz`    | 健康检查                  |

`/api/time` 返回示例：

```json
{
  "success": true,
  "iso": "2026-10-22T08:56:44.499Z",
  "timestamp": 1792659404499,
  "date": "2026-10-22",
  "time": "16:56:44",
  "weekday": "星期四",
  "text": "2026-10-22 16:56:44 星期四",
  "timezone": "Asia/Shanghai",
  "tzOffsetMinutes": 480
}
```

## 四、实现要点

1. **零依赖**：只用 Node 内置的 `http` / `fs` / `path`，不需要 `npm install`，下载即可运行。
2. **服务器时间是"真服务器时间"**：前端每 5 秒请求一次 `/api/time`，用「请求往返中点」估算并记录 offset，之后每 1 秒本地推进显示，所以秒数是连续走动的，而不是每秒发一次请求。
3. **安全细节**：静态文件路径做了 `path.resolve` 越界校验，防止 `../` 目录穿越；只允许 GET / HEAD。
4. **容错**：接口失败时页面切换为「离线」状态提示，不会白屏；端口被占用会打印友好提示。

## 五、完整源码（逐文件，无省略）

### package.json

```json
{
  "name": "helloworld-node",
  "version": "1.0.0",
  "description": "我的第一个 AI 开发的网站 - Node.js Hello World",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "keywords": ["nodejs", "helloworld", "http"],
  "author": "cxj",
  "license": "MIT",
  "engines": {
    "node": ">=18"
  }
}
```

### server.js

```javascript
/**
 * server.js
 * ------------------------------------------------------------
 * 一个零依赖的 Node.js 静态网站 + 服务器时间接口
 *   - GET /            返回 public/index.html
 *   - GET /api/time    返回当前服务器时间（JSON）
 *   - 其余路径         从 public/ 目录读取静态文件
 *
 * 运行：node server.js   （或 npm start）
 * 访问：http://localhost:3000
 * ------------------------------------------------------------
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// ============ 基础配置 ============
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

// 常见静态文件的 Content-Type
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

/**
 * 把当前时间格式化成一个固定格式的字符串，方便前端直接展示
 * 例：2026-10-22 16:55:53 星期四
 */
function formatTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const weekNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

  return {
    date: datePart,
    time: timePart,
    weekday: weekNames[date.getDay()],
    text: `${datePart} ${timePart} ${weekNames[date.getDay()]}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tzOffsetMinutes: -date.getTimezoneOffset()
  };
}

/** 发送 JSON 响应 */
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

/** 发送纯文本响应（用于 404 / 500） */
function sendText(res, statusCode, text) {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

/**
 * 解析请求路径为 public 目录内的安全绝对路径
 * 防御 ../ 目录穿越攻击，越界一律返回 null
 */
function resolveSafePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const relative = decoded === '/' ? '/index.html' : decoded;
  const absolute = path.resolve(PUBLIC_DIR, '.' + path.normalize(relative));

  // 必须仍然位于 PUBLIC_DIR 之内
  if (absolute !== PUBLIC_DIR && !absolute.startsWith(PUBLIC_DIR + path.sep)) {
    return null;
  }
  return absolute;
}

/** 处理静态文件请求 */
async function serveStatic(req, res) {
  const filePath = resolveSafePath(req.url);

  if (!filePath) {
    sendText(res, 403, '403 Forbidden：非法的访问路径');
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    sendText(res, 404, `404 Not Found：找不到 ${req.url}`);
    return;
  }

  // 请求的是目录 -> 尝试目录下的 index.html
  let target = filePath;
  if (stat.isDirectory()) {
    target = path.join(filePath, 'index.html');
    try {
      stat = await fsp.stat(target);
    } catch {
      sendText(res, 404, `404 Not Found：目录下没有 index.html`);
      return;
    }
  }

  const ext = path.extname(target).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // 只对 GET / HEAD 返回正文
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('405 Method Not Allowed');
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  fs.createReadStream(target)
    .on('error', () => {
      // 读流中途出错时，如果还没发送响应头就补一个 500
      if (!res.headersSent) sendText(res, 500, '500 Internal Server Error');
      else res.destroy();
    })
    .pipe(res);
}

// ============ 创建服务器 ============
const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  try {
    // 1) 服务器时间接口
    if (url === '/api/time' || url.startsWith('/api/time?')) {
      const now = new Date();
      sendJson(res, 200, {
        success: true,
        iso: now.toISOString(),
        timestamp: now.getTime(),
        ...formatTime(now)
      });
      return;
    }

    // 2) 健康检查
    if (url === '/healthz') {
      sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
      return;
    }

    // 3) 静态资源
    await serveStatic(req, res);
  } catch (err) {
    console.error('[server error]', err);
    if (!res.headersSent) sendText(res, 500, '500 Internal Server Error');
    else res.destroy();
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ 端口 ${PORT} 已被占用，请换一个端口启动，例如：PORT=4000 node server.js\n`);
    process.exit(1);
  }
  console.error('[server error]', err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const local = formatTime(new Date()).text;
  console.log('');
  console.log('  ✅ Hello World 网站已启动');
  console.log('  ────────────────────────────────────────');
  console.log(`  本地访问:  http://localhost:${PORT}`);
  console.log(`  时间接口:  http://localhost:${PORT}/api/time`);
  console.log(`  启动时间:  ${local}`);
  console.log('  按 Ctrl + C 停止服务');
  console.log('  ────────────────────────────────────────');
  console.log('');
});

// 优雅退出
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n👋 正在关闭服务器...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
```

### public/index.html

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hello World！— cxj 的第一个 AI 网站</title>
  <meta name="description" content="Hello World！我是 cxj，这是我的第一个 AI 开发的网站。" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%91%8B%3C/text%3E%3C/svg%3E" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div class="bg-glow bg-glow--1" aria-hidden="true"></div>
  <div class="bg-glow bg-glow--2" aria-hidden="true"></div>

  <main class="card">
    <p class="badge">
      <span class="dot" aria-hidden="true"></span>
      Node.js · 已成功运行
    </p>

    <h1 class="title">Hello World！</h1>

    <p class="subtitle">
      我是<span class="name">【cxj】</span>，我的第一个 AI 开发的网站
    </p>

    <!-- 服务器时间 -->
    <section class="clock" aria-live="polite">
      <p class="clock__label">
        <svg class="clock__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
        当前服务器时间
      </p>

      <p class="clock__time" id="clock-time">--:--:--</p>
      <p class="clock__date" id="clock-date">正在获取服务器时间…</p>

      <div class="clock__meta">
        <span id="clock-timezone">时区 —</span>
        <span class="clock__status" id="clock-status">
          <i class="dot dot--small" aria-hidden="true"></i>
          每秒与服务器同步
        </span>
      </div>
    </section>

    <ul class="tags">
      <li>零依赖</li>
      <li>原生 HTTP 模块</li>
      <li>REST 接口 /api/time</li>
    </ul>

    <footer class="footer">
      由 <strong>WorkBuddy</strong> 与 <strong>cxj</strong> 一起打造 · 2026
    </footer>
  </main>

  <script src="/app.js"></script>
</body>
</html>
```

### public/style.css

```css
/* ============================================================
   style.css — 全部样式（浅色主题 / 居中卡片 / 响应式）
   ============================================================ */

:root {
  --bg: #f5f7fb;
  --card-bg: rgba(255, 255, 255, 0.82);
  --card-border: rgba(17, 24, 39, 0.08);
  --text: #101828;
  --text-soft: #5b6474;
  --text-faint: #8b94a3;
  --accent: #4f6bff;
  --accent-2: #22c1a8;
  --shadow: 0 24px 60px -20px rgba(16, 24, 40, 0.18), 0 8px 20px -12px rgba(16, 24, 40, 0.12);
  --radius: 26px;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}

* {
  box-sizing: border-box;
}

html,
body {
  height: 100%;
}

body {
  margin: 0;
  padding: 32px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

/* 背景光斑 */
.bg-glow {
  position: fixed;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.55;
  pointer-events: none;
  z-index: 0;
}

.bg-glow--1 {
  width: 520px;
  height: 520px;
  top: -180px;
  left: -140px;
  background: radial-gradient(circle, rgba(79, 107, 255, 0.45), transparent 70%);
}

.bg-glow--2 {
  width: 560px;
  height: 560px;
  right: -200px;
  bottom: -220px;
  background: radial-gradient(circle, rgba(34, 193, 168, 0.4), transparent 70%);
}

/* ===================== 卡片 ===================== */
.card {
  position: relative;
  z-index: 1;
  width: min(100%, 620px);
  padding: 44px 40px 32px;
  text-align: center;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(22px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 状态徽标 */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 22px;
  padding: 7px 14px;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: #16794a;
  background: rgba(34, 197, 126, 0.1);
  border: 1px solid rgba(34, 197, 126, 0.24);
  border-radius: 999px;
}

.dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: #22c37e;
  box-shadow: 0 0 0 0 rgba(34, 195, 126, 0.55);
  animation: pulse 2s ease-out infinite;
}

.dot--small {
  width: 6px;
  height: 6px;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 195, 126, 0.5);
  }
  70% {
    box-shadow: 0 0 0 7px rgba(34, 195, 126, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 195, 126, 0);
  }
}

/* 主标题 */
.title {
  margin: 0 0 14px;
  font-size: clamp(38px, 7vw, 58px);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.02em;
  background: linear-gradient(120deg, #2b3bd6 0%, #4f6bff 42%, #22c1a8 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* 副标题 */
.subtitle {
  margin: 0 auto 30px;
  max-width: 26em;
  font-size: clamp(15px, 2.2vw, 17.5px);
  line-height: 1.75;
  color: var(--text-soft);
}

.subtitle .name {
  font-weight: 700;
  color: var(--text);
  padding: 0 2px;
  background: linear-gradient(transparent 62%, rgba(79, 107, 255, 0.22) 62%);
}

/* ===================== 时间区 ===================== */
.clock {
  padding: 24px 20px 20px;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(79, 107, 255, 0.06), rgba(34, 193, 168, 0.05));
  border: 1px solid rgba(79, 107, 255, 0.13);
}

.clock__label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 10px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}

.clock__icon {
  width: 15px;
  height: 15px;
}

.clock__time {
  margin: 0;
  font-family: var(--mono);
  font-size: clamp(34px, 8vw, 50px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.01em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  transition: color 0.25s ease;
}

.clock__date {
  margin: 8px 0 0;
  font-size: 14.5px;
  color: var(--text-soft);
}

.clock__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 16px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed rgba(16, 24, 40, 0.1);
  font-size: 12px;
  color: var(--text-faint);
}

.clock__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 断开连接状态 */
.clock.is-offline .clock__time {
  color: #c2410c;
}

/* ===================== 标签 ===================== */
.tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin: 26px 0 0;
  padding: 0;
  list-style: none;
}

.tags li {
  padding: 5px 11px;
  font-size: 12px;
  color: var(--text-soft);
  background: rgba(16, 24, 40, 0.04);
  border: 1px solid rgba(16, 24, 40, 0.06);
  border-radius: 8px;
}

/* 页脚 */
.footer {
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px solid rgba(16, 24, 40, 0.07);
  font-size: 12.5px;
  color: var(--text-faint);
}

.footer strong {
  color: var(--text-soft);
  font-weight: 600;
}

/* ===================== 响应式 ===================== */
@media (max-width: 480px) {
  body {
    padding: 20px 14px;
  }

  .card {
    padding: 32px 22px 24px;
    border-radius: 22px;
  }

  .clock {
    padding: 20px 14px 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .dot {
    animation: none;
  }
}
```

### public/app.js

```javascript
/**
 * app.js
 * ------------------------------------------------------------
 * 1. 向 /api/time 请求服务器时间
 * 2. 计算出「服务器时间 - 本地时间」的差值 offset
 * 3. 之后每秒用 offset 本地推进，界面看起来是实时走动的服务器时间
 * 4. 每 5 秒重新校准一次；请求失败时显示离线状态
 * ------------------------------------------------------------
 */

(function () {
  'use strict';

  var API = '/api/time';
  var SYNC_INTERVAL = 5000; // 每 5 秒向服务器校准一次
  var TICK_INTERVAL = 1000; // 每 1 秒刷新界面

  var elTime = document.getElementById('clock-time');
  var elDate = document.getElementById('clock-date');
  var elTz = document.getElementById('clock-timezone');
  var elStatus = document.getElementById('clock-status');
  var elClock = document.querySelector('.clock');

  var pad = function (n) {
    return String(n).padStart(2, '0');
  };

  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  // offset（毫秒），以及服务器所在时区相对 UTC 的分钟偏移
  var offset = 0;
  var tzOffsetMinutes = -new Date().getTimezoneOffset();
  var hasSynced = false;

  /**
   * 把「服务器绝对时间戳」换算成服务器所在时区的墙上时间
   */
  function toServerDate(serverTimestamp) {
    return new Date(serverTimestamp + tzOffsetMinutes * 60 * 1000);
  }

  function render() {
    // 未同步成功时先显示本地时间占位，避免界面空白
    var now = Date.now() + (hasSynced ? offset : 0);
    var d = toServerDate(now);

    elTime.textContent =
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());

    elDate.textContent =
      d.getUTCFullYear() +
      ' 年 ' +
      (d.getUTCMonth() + 1) +
      ' 月 ' +
      d.getUTCDate() +
      ' 日 · ' +
      WEEK[d.getUTCDay()];
  }

  function setOnline() {
    elClock.classList.remove('is-offline');
    elStatus.innerHTML = '<i class="dot dot--small" aria-hidden="true"></i>每秒与服务器同步';
  }

  function setOffline() {
    elClock.classList.add('is-offline');
    elStatus.textContent = '⚠ 无法连接服务器，显示的是本地时间';
    elDate.textContent = '连接已断开，正在重试…';
  }

  function setTimezone(tz) {
    if (!tz) return;
    elTz.textContent = '时区 ' + tz + '（UTC' + (tzOffsetMinutes >= 0 ? '+' : '-') +
      pad(Math.floor(Math.abs(tzOffsetMinutes) / 60)) + ':' +
      pad(Math.abs(tzOffsetMinutes) % 60) + '）';
  }

  /**
   * 从服务器拉取时间并校准 offset
   */
  function sync() {
    var t0 = Date.now();

    fetch(API + '?t=' + t0, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var t1 = Date.now();
        var rtt = t1 - t0;
        // 用「请求往返的中点」估算，减少网络延迟带来的误差
        offset = data.timestamp + rtt / 2 - t1;
        tzOffsetMinutes =
          typeof data.tzOffsetMinutes === 'number' ? data.tzOffsetMinutes : tzOffsetMinutes;
        hasSynced = true;
        setOnline();
        setTimezone(data.timezone);
        render();
      })
      .catch(function (err) {
        console.warn('[time sync failed]', err);
        setOffline();
      });
  }

  // 首屏立即同步一次，然后进入定时循环
  sync();
  render();
  setInterval(render, TICK_INTERVAL);
  setInterval(sync, SYNC_INTERVAL);

  // 页面重新可见时立刻再校准一次（浏览器可能暂停了定时器）
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) sync();
  });
})();
```

## 六、自定义

- 改名字：编辑 `public/index.html` 中的 `<span class="name">【cxj】</span>`。
- 改配色：编辑 `public/style.css` 顶部 `:root` 里的 `--accent` 等变量。
- 改端口：启动时设置环境变量 `PORT`。
