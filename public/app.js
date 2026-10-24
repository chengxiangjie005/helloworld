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
