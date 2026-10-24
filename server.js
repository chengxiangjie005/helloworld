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
