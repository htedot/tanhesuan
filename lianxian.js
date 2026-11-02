/* 标准连线 —— 编号 ↔ 标准名称
 * 数据：data/lianxian.json（由 tools/build_lianxian.py 从背诵 UNIV 标准卡生成）
 * 规则：每轮 5 组；同一轮里不会出现同名标准（采标等同的那几对拆到不同轮）
 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  var PER = 5;              // 每轮几组
  var LS = 'ths_lx_v1';
  var DATA = null;
  var pairs = [];
  var rounds = [];
  var S = {
    ri: 0, hit: 0, miss: 0, started: 0, tick: null,
    sel: null,          // 已选中的左侧编号
    done: {},           // 本轮已配对的 编号->true
    wrong: [],          // 答错过的编号
    finished: false
  };

  /* ---------- 建轮：同轮不许同名 ---------- */
  function shuffle(a) {
    var x = a.slice();
    for (var i = x.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = x[i]; x[i] = x[j]; x[j] = t;
    }
    return x;
  }

  function buildRounds(list) {
    var pool = shuffle(list);
    var out = [];
    while (pool.length) {
      var round = [], used = {}, i = 0;
      while (i < pool.length && round.length < PER) {
        var p = pool[i];
        if (used[p.nm]) { i++; continue; }
        round.push(p); used[p.nm] = 1; pool.splice(i, 1);
      }
      out.push(round);
    }
    return out;
  }

  /* ---------- 计时 ---------- */
  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function startClock() {
    if (S.tick) return;
    S.started = Date.now();
    S.tick = setInterval(function () {
      $('#clk').textContent = fmt(Math.floor((Date.now() - S.started) / 1000));
    }, 250);
  }
  function stopClock() { clearInterval(S.tick); S.tick = null; }

  /* ---------- 渲染 ---------- */
  function renderHead() {
    $('#rnd').textContent = (S.ri + 1) + ' / ' + rounds.length;
    $('#hit').textContent = S.hit + ' / ' + pairs.length;
    $('#miss').textContent = S.miss;
  }

  function renderRound() {
    var round = rounds[S.ri];
    S.sel = null; S.done = {};

    var left = round.slice();
    var right = shuffle(round);

    var h = '<div class="cols"><div class="col" id="colL">' + left.map(function (p) {
      return '<div class="cell k" data-k="' + esc(p.k) + '">' + esc(p.k) + '</div>';
    }).join('') + '</div><div class="col" id="colR">' + right.map(function (p) {
      return '<div class="cell n" data-nm="' + esc(p.nm) + '">' + esc(p.nm) + '</div>';
    }).join('') + '</div></div>';

    $('#board').innerHTML = h;
    $('#fb').className = 'fb';
    $('#foot').innerHTML = '';
    renderHead();

    var leftOrder = left.map(function (p) { return p.k; });
    var rightOrder = right.map(function (p) { return p.nm; });
    window.__LX_TEST__ = {
      round: S.ri, left: leftOrder, right: rightOrder,
      answer: round.map(function (p) { return { k: p.k, nm: p.nm }; })
    };
  }

  function feedback(kind, text) {
    var el = $('#fb');
    el.className = 'fb show ' + kind;
    el.innerHTML = text;
  }

  function pairOf(code) {
    return rounds[S.ri].filter(function (p) { return p.k === code; })[0];
  }

  /* ---------- 交互 ---------- */
  function onLeft(el) {
    if (S.finished || el.classList.contains('ok')) return;
    $$('#colL .cell').forEach(function (c) { c.classList.remove('sel'); });
    el.classList.add('sel');
    S.sel = el.dataset.k;
    startClock();
  }

  function onRight(el) {
    if (S.finished || el.classList.contains('ok')) return;
    if (!S.sel) {
      feedback('err', '先在左边点一个编号。');
      return;
    }
    var p = pairOf(S.sel);
    var leftEl = $$('#colL .cell').filter(function (c) { return c.dataset.k === S.sel; })[0];

    if (p && p.nm === el.dataset.nm) {
      el.classList.add('ok', 'used');
      if (leftEl) { leftEl.classList.add('ok', 'used'); leftEl.classList.remove('sel'); }
      S.done[S.sel] = 1;
      S.hit++;
      S.sel = null;
      feedback('good', '<b>' + esc(p.k) + '</b> ＝ ' + esc(p.nm) +
        (p.hint ? '<br>' + esc(p.hint) : ''));
      renderHead();
      if (Object.keys(S.done).length === rounds[S.ri].length) roundDone();
    } else {
      S.miss++;
      if (S.wrong.indexOf(S.sel) < 0) S.wrong.push(S.sel);
      el.classList.add('bad');
      setTimeout(function () { el.classList.remove('bad'); }, 420);
      feedback('err', '这两个不是一对。再看看「' + esc(S.sel) + '」是管什么的。');
      renderHead();
    }
  }

  function roundDone() {
    stopClock();
    var last = (S.ri === rounds.length - 1);
    $('#foot').innerHTML = '<button class="btn" id="next">' +
      (last ? '看结果' : '下一轮（' + (S.ri + 2) + '/' + rounds.length + '）') + '</button>' +
      '<div class="muted2">这一轮用时已计入总计时，' +
      (last ? '共 ' + rounds.length + ' 轮。' : '下一轮换一组标准。') + '</div>';
    $('#next').addEventListener('click', function () {
      S.ri++;
      if (S.ri >= rounds.length) return finish();
      renderRound();
      startClock();
      $('#clk').textContent = fmt(Math.floor((Date.now() - S.started) / 1000));
    });
  }

  function finish() {
    stopClock();
    S.finished = true;
    var sec = Math.max(1, Math.round((Date.now() - S.started) / 1000));
    var best = '';
    try {
      var st = JSON.parse(localStorage.getItem(LS) || '{}');
      st.plays = (st.plays || 0) + 1;
      if (!st.best || sec < st.best) { st.best = sec; best = '新纪录！'; }
      localStorage.setItem(LS, JSON.stringify(st));
    } catch (e) { /* 存不了不影响玩 */ }

    $('#clk').textContent = fmt(sec);
    var tip = document.querySelector('.tip');
    if (tip) tip.style.display = 'none';
    var rate = Math.round(100 * pairs.length / Math.max(pairs.length + S.miss, 1));
    var h = '<div class="done">' +
      '<div class="big">' + fmt(sec) + '</div>' +
      '<div class="sub">' + pairs.length + ' 组全部连对 · 错 ' + S.miss + ' 次 · 一次对 ' + rate + '%' +
      (best ? ' · ' + best : '') + '</div>';

    if (!S.wrong.length) {
      h += '<div class="sub" style="margin-top:10px">一次没错，这 37 个编号可以放过自己了。</div>';
    } else {
      h += '<div class="miss"><b>错过的（用背诵的「只看没掌握」再刷一遍）</b>' +
        S.wrong.map(function (k) { return '<span>' + esc(k) + '</span>'; }).join('') + '</div>';
    }
    h += '</div>';
    h += '<div style="margin-top:14px"><button class="btn" id="again">再来一次（重新打乱）</button></div>';
    h += '<div style="margin-top:10px"><a class="btn ghost" href="biaozhun.html" style="display:block;text-align:center;text-decoration:none">回标准速查</a></div>';

    $('#board').innerHTML = h;
    $('#fb').className = 'fb';
    $('#foot').innerHTML = '';
    $('#rnd').textContent = rounds.length + ' / ' + rounds.length;
    $('#again').addEventListener('click', reset);
  }

  function reset() {
    stopClock();
    S = { ri: 0, hit: 0, miss: 0, started: 0, tick: null, sel: null, done: {}, wrong: [], finished: false };
    rounds = buildRounds(pairs);
    $('#clk').textContent = '00:00';
    renderRound();
  }

  /* ---------- 启动 ---------- */
  function boot() {
    fetch('data/lianxian.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        DATA = d;
        pairs = d.pairs || [];
        $('#sub').textContent = '共 ' + pairs.length + ' 个会考标准 · 每轮 ' + PER + ' 组';
        if (!pairs.length) { $('#board').innerHTML = '<div class="tip">没有可连的题目。</div>'; return; }
        rounds = buildRounds(pairs);
        renderRound();
        startClock();
      })
      .catch(function () {
        $('#board').innerHTML = '<div class="tip">数据没加载出来，刷新一次试试。</div>';
      });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('.cell') : null;
    if (!t) return;
    if (t.classList.contains('k')) onLeft(t);
    else if (t.classList.contains('n')) onRight(t);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
