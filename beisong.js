(function () {
  'use strict';

  var LS = 'ths_bs_v1';          // 背诵进度（独立，不动题库 ths_store_v1）
  var THEME_LS = 'ths_store_v1';
  var INTERVALS = [0, 1, 3, 7, 15, 30, 60];   // box → 间隔天数
  var MAXBOX = 6;
var ovOpen = false;   // 当前是否停在总览页
const EXAM_DAY = '2026-11-07';   // 决赛日，用来算还剩几天

  var DATA = { cards: [], meta: {} };
  var byId = {};
  var st = { s: {}, day: {}, vol: 'all', goal: 30, mode: 'all' };
  var queue = [];
  var cur = null;
  var shown = false;
  var streak = 0;
  var todayDone = 0;
  var todayTotal = 0;

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function addDays(base, n) {
    var p = base.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ---------- 存储 ---------- */
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(LS) || '{}');
      if (o && typeof o === 'object') {
        if (o.s && typeof o.s === 'object') st.s = o.s;
        if (o.day && typeof o.day === 'object') st.day = o.day;
        if (o.vol) st.vol = o.vol;
        if (o.goal) st.goal = o.goal;
        if (o.mode) st.mode = o.mode;
      }
    } catch (e) { /* 忽略 */ }
  }
  var tm = null;
  function save() {
    clearTimeout(tm);
    tm = setTimeout(saveNow, 200);
  }
  function saveNow() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        s: st.s, day: st.day, vol: st.vol, goal: st.goal, mode: st.mode
      }));
    } catch (e) {}
  }
  window.addEventListener('pagehide', saveNow);

  function applyTheme() {
    try {
      var raw = localStorage.getItem(THEME_LS);
      if (!raw) return;
      var s = (JSON.parse(raw).settings) || {};
      document.documentElement.setAttribute('data-theme', s.theme === 'dark' ? 'dark' : 'light');
      var f = s.font || 'md';
      if (['sm', 'md', 'lg', 'xl'].indexOf(f) < 0) f = 'md';
      document.documentElement.setAttribute('data-font', f);
    } catch (e) {}
  }

  function toast(m) {
    var t = $('#toast');
    t.textContent = m;
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.hidden = true; }, 1800);
  }

  /* ---------- 队列 ---------- */
  function cardState(id) { return st.s[id] || null; }

  function buildQueue() {
    var t = todayStr();
    var pool = DATA.cards.filter(function (c) {
      return st.vol === 'all' || c.v === st.vol;
    });
    if (st.mode === 'hot') pool = pool.filter(function (c) { return c.pri === 1; });
    if (st.mode === 'core') pool = pool.filter(function (c) { return CORE_VOLS.indexOf(c.v) >= 0; });

    var rev = [], neu = [];
    pool.forEach(function (c) {
      var s = cardState(c.id);
      if (!s) neu.push(c);
      else if (s.d && s.d <= t) rev.push(c);
    });
    // 复习：box 小的（越不熟）越先来；新卡：高频在前
    rev.sort(function (a, b) { return (cardState(a.id).b || 0) - (cardState(b.id).b || 0); });
    neu.sort(function (a, b) { return (a.pri || 9) - (b.pri || 9); });

    var doneNew = (st.day[t] && st.day[t].n) || 0;
    var allowNew = Math.max(0, st.goal - doneNew);
    return rev.concat(neu.slice(0, allowNew));
  }

  /* ---------- 渲染 ---------- */
  function volName(v) {
    var m = { '00': '作战地图', A: 'GB/T 标准', C: 'ISO 国际', B: '国内政策', E: '十五五新政',
              D: '公式与因子', F: '实操零基础',
              UNIV: '通用知识', TPL: '可迁移模板', CASE: '算例验证' };
    return m[v] || v;
  }

  function fmtFront(s) {
    return esc(s).replace(/【____】/g, '<span class="blank">____</span>');
  }

  function renderStats() {
    var t = todayStr();
    var d = st.day[t] || { n: 0, r: 0 };
    $('#sNew').textContent = d.n || 0;
    $('#sGoal').textContent = st.goal;
    $('#sRev').textContent = d.r || 0;
    $('#sStreak').textContent = streak;
    $('#sLeft').textContent = queue.length ? ('还剩 ' + queue.length + ' 张') : '';
    var total = todayTotal || 1;
    var pct = Math.min(100, Math.round(todayDone * 100 / total));
    $('#prog').style.width = pct + '%';
  }

  function renderCard() {
    if (!cur) return renderDone();
    var head = '<div class="card" id="card" data-id="' + esc(cur.id) + '" data-pri="' + (cur.pri || 2) + '" data-kind="' + esc(cur.kind) + '">' +
      '<div class="top"><span class="k">' + esc(cur.tag || cur.kind) + '</span>' +
      '<span>' + esc(volName(cur.v)) + ' · 第 ' + (cur.bi + 1) + ' 段</span></div>' +
      '<div class="face" id="face">' + fmtFront(cur.front) + '</div>' +
      '<div class="ans" id="ans">' + esc(cur.back) + '</div>' +
      '<div class="src">出处：' + esc(cur.vt) + ' · 第 ' + (cur.bi + 1) + ' 段' +
      (cur.ctx ? '<span class="ctx">' + esc(cur.ctx) + '</span>' : '') + '</div>' +
      '</div>';

    var acts = '<div class="acts" id="acts">' +
      '<button class="btn reveal" data-a="reveal">想好了，看答案（空格）</button>' +
      '<button class="btn ghost" id="tts" data-a="tts">朗读</button>' +
      '</div>';

    var grade = '<div class="grade" id="grade">' +
      '<button class="g1" data-g="0">完全不会</button>' +
      '<button class="g2" data-g="1">模糊</button>' +
      '<button class="g3" data-g="2">背下来了</button>' +
      '</div>';

    $('#pane').innerHTML = head + acts + grade;
    ovOpen = false;
    document.body.classList.remove('ovmode');
    shown = false;
    renderStats();
  }

  /* ---------- 总览 ---------- */
  var CORE_VOLS = ['UNIV', 'TPL', 'CASE', 'F'];   // 实操四卷：技能操作 60% 的直接来源
  var OV_ORDER = ['UNIV', 'TPL', 'CASE', 'F', 'A', 'C', 'B', 'E', 'D', '00'];

  function dayDiff(a, b) {          // b - a，单位天
    var d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00');
    return Math.round((d2 - d1) / 86400000);
  }

  function ovSummary() {
    var t = todayStr();
    var byVol = {};
    var acc = {
      mastered: 0, learning: 0, untouched: 0, total: DATA.cards.length,
      box: [0, 0, 0, 0, 0, 0, 0]
    };
    DATA.cards.forEach(function (c) {
      var cs = cardState(c.id);
      var v = byVol[c.v] || (byVol[c.v] = { total: 0, done: 0, doing: 0 });
      v.total++;
      if (!cs) { acc.untouched++; return; }
      var b = cs.b || 0;
      acc.box[b] = (acc.box[b] || 0) + 1;
      if (b >= 3) { acc.mastered++; v.done++; } else { acc.learning++; v.doing++; }
    });

    // 未来 7 天（含今天）到期数量：某天到期 = due <= 那天
    var due = [];
    for (var i = 0; i < 7; i++) {
      var day = addDays(t, i);
      var n = 0;
      DATA.cards.forEach(function (c) {
        var cs = cardState(c.id);
        if (cs && cs.d && cs.d <= day) n++;
      });
      due.push({ day: day, n: n, label: i === 0 ? '今天' : ('+' + i) });
    }

    return {
      t: t, byVol: byVol, due: due, daysLeft: dayDiff(t, EXAM_DAY), box: acc.box,
      mastered: acc.mastered, learning: acc.learning, untouched: acc.untouched, total: acc.total
    };
  }

  function renderOverview() {
    var t = todayStr();
    var d0 = st.day[t] || { n: 0, r: 0 };
    var sum = ovSummary();
    var qn = buildQueue().length;

    var h = '<div class="ov">';

    // 三个总数
    h += '<div class="kpis">' +
      '<div class="kpi on"><b>' + sum.mastered + '</b><span>已掌握</span></div>' +
      '<div class="kpi mid"><b>' + sum.learning + '</b><span>在学</span></div>' +
      '<div class="kpi"><b>' + sum.untouched + '</b><span>没碰过</span></div>' +
      '</div>';

    // 今天的账
    h += '<div class="kpis" style="margin-top:8px">' +
      '<div class="kpi"><b>' + (d0.n || 0) + '/' + st.goal + '</b><span>今日新学</span></div>' +
      '<div class="kpi"><b>' + (d0.r || 0) + '</b><span>今日复习</span></div>' +
      '<div class="kpi"><b>' + streak + '</b><span>连对</span></div>' +
      '</div>';

    // 计划：赛前到底能不能背完，用数字说
    var days = sum.daysLeft;
    var cap = days > 0 ? st.goal * days : 0;
    var plan, extra = '';
    var CAPMAX = 90;                      // 单日上限天花板
    if (days > 0) {
      if (!sum.untouched) {
        plan = '距决赛还有 <b>' + days + '</b> 天。全部 <b>' + sum.total + '</b> 张都背过一遍了，' +
          '接下来只做复习：把「完全不会」的那几张再过一次就行。';
      } else if (sum.untouched <= cap) {
        plan = '距决赛还有 <b>' + days + '</b> 天。还剩 <b>' + sum.untouched + '</b> 张没碰过，' +
          '按每天 <b>' + st.goal + '</b> 张算，' + Math.ceil(sum.untouched / st.goal) + ' 天能过完（还有 ' + days + ' 天）。' +
          '平均每天新学 <b>' + Math.ceil(sum.untouched / days) + '</b> 张就够。';
      } else {
        var need = Math.ceil(sum.untouched / days);
        if (need <= CAPMAX) {
          var suggest = Math.ceil(need / 10) * 10;
          plan = '距决赛只有 <b>' + days + '</b> 天，还剩 <b>' + sum.untouched + '</b> 张没碰过。' +
            '按现在的 <b>' + st.goal + '</b> 张/天，赛前最多背 <b>' + cap + '</b> 张，差 <b>' +
            (sum.untouched - cap) + '</b> 张。把上限提到 <b>' + suggest + '</b> 张/天就能过完一轮。';
          extra = '<div style="margin-top:10px"><button class="btn ghost" data-goal="' + suggest +
            '">把每日上限调到 ' + suggest + ' 张</button></div>';
        } else {
          var core = 0;
          DATA.cards.forEach(function (c) {
            if (CORE_VOLS.indexOf(c.v) >= 0 && !cardState(c.id)) core++;
          });
          plan = '距决赛只有 <b>' + days + '</b> 天，还剩 <b>' + sum.untouched + '</b> 张没碰过——' +
            '<b>这个量背不完</b>（每天 90 张也还要 ' + Math.ceil(sum.untouched / CAPMAX) + ' 天）。别平均用力：' +
            '<b>先啃实操四卷</b>（通用知识 / 可迁移模板 / 算例验证 / 实操零基础），它们直接对应技能操作那 <b>60%</b>，' +
            '现在还剩 <b>' + core + '</b> 张，按每天 <b>' + Math.ceil(core / Math.max(1, days)) + '</b> 张，' + days + ' 天能背完。' +
            '其余六卷靠刷题带过，别在这一轮硬背。';
          extra = '<div style="margin-top:10px"><button class="btn ghost" data-mode="core">只背实操四卷（' + core + ' 张）</button>' +
            '<button class="btn ghost" style="margin-top:8px" data-goal="' + CAPMAX + '">把上限调到 ' + CAPMAX + ' 张（最大）</button></div>';
        }
      }
    } else if (days === 0) {
      plan = '今天就是比赛日：只看<b>已掌握</b>的那部分，别碰新卡。';
    } else {
      plan = '比赛日已过（' + EXAM_DAY + '）。';
    }
    h += '<h3>还剩几天</h3><div class="panel"><div class="plan">' + plan + '</div>' + extra + '<div style="margin-top:10px"><button class="btn ghost" data-mode="hot">只背高频（★ 采分点）</button></div></div>';

    // 各卷进度
    h += '<h3>各卷进度（已掌握 / 全部）</h3><div class="panel">';
    var seen = {};
    DATA.cards.forEach(function (c) { seen[c.v] = 1; });
    var vols = OV_ORDER.filter(function (v) { return seen[v]; });
    Object.keys(seen).forEach(function (v) { if (vols.indexOf(v) < 0) vols.push(v); });
    vols.forEach(function (v) {
      var x = sum.byVol[v] || { total: 0, done: 0 };
      var pc = x.total ? Math.round(x.done * 100 / x.total) : 0;
      h += '<div class="vrow' + (st.vol === v ? ' cur' : '') + '">' +
        '<span class="nm">' + esc(volName(v)) + '</span>' +
        '<span class="bb"><i style="width:' + pc + '%"></i></span>' +
        '<span class="pc">' + x.done + '/' + x.total + '</span></div>';
    });
    h += '</div>';

    // 未来 7 天
    var dueSum = 0;
    sum.due.forEach(function (x) { dueSum += x.n; });
    h += '<h3>未来 7 天要复习的量</h3><div class="panel">';
    if (!dueSum) {
      h += '<div class="plan">还没有到期的卡。背过的卡会按 <b>1 / 3 / 7 / 15 / 30 / 60</b> 天的间隔回来复习，' +
        '今天先把新卡背起来，明天这里就会长出第一根柱子。</div>';
    } else {
      var maxn = 1;
      sum.due.forEach(function (x) { if (x.n > maxn) maxn = x.n; });
      h += '<div class="due">';
      sum.due.forEach(function (x, i) {
        var hh = Math.max(4, Math.round(x.n * 62 / maxn));
        h += '<div class="d"><b>' + (x.n || '') + '</b>' +
          '<i class="' + (i === 0 ? 'on' : '') + '" style="height:' + hh + 'px"></i>' +
          '<span>' + x.label + '</span></div>';
      });
      h += '</div><div class="plan">柱子高度 = 那天到期要复习的张数，今天那根是实心的。' +
        '「完全不会」的卡当天会再出现一次，所以今天的数会边背边长。</div>';
    }
    h += '</div>';

    // 记忆档位
    h += '<h3>记忆档位（间隔 1 / 3 / 7 / 15 / 30 / 60 天）</h3><div class="panel"><div class="plan">';
    var names = ['刚背过', '1 天', '3 天', '7 天', '15 天', '30 天', '60 天'];
    var parts = [];
    sum.box.forEach(function (n, i) { if (n) parts.push(names[i] + ' <b>' + n + '</b>'); });
    h += parts.length ? parts.join(' · ') : '还没开始，背第一张就算起。';
    h += '</div></div>';

    // 行动
    h += '<div style="margin-top:18px"><button class="btn" data-a="start" style="min-height:48px;font-size:calc(var(--fs) + 1px)">' +
      (qn ? '开始背（队列 ' + qn + ' 张）' : '再背一轮') + '</button></div>';
    h += '<div class="plan" style="text-align:center">随时点右上角「总览」回来看这里</div>';
    h += '</div>';

    $('#pane').innerHTML = h;
    ovOpen = true;
    document.body.classList.add('ovmode');
    renderStats();
  }

  function renderDone() {
    var t = todayStr();
    var d = st.day[t] || { n: 0, r: 0 };
    var left = DATA.cards.filter(function (c) {
      var s = cardState(c.id);
      return !s || (s.d && s.d <= t);
    }).length;
    $('#pane').innerHTML = '<div class="done">' +
      '<span class="big">✓</span>' +
      '今天的队列清空了<br>' +
      '新学 <b>' + (d.n || 0) + '</b> 张 · 复习 <b>' + (d.r || 0) + '</b> 张 · 连对 <b>' + streak + '</b><br>' +
      (left ? ('还有 <b>' + left + '</b> 张排在这几天（明天再来，或现在加量）') : '所有到期卡片都过完了') +
      '<div style="margin-top:14px"><button class="btn" data-a="again" style="min-height:46px;padding:11px 22px">再背一轮</button></div>' +
      '<div style="margin-top:10px;font-size:12px;color:var(--tx2)">记忆是按 1/3/7/15/30/60 天递进的，别硬刷，明天复习更省力</div>' +
      '</div>';
    renderStats();
  }

  function startStudy() {
    if (!queue.length) { queue = buildQueue(); todayTotal = queue.length || 1; todayDone = 0; }
    next();
  }

  function next() {
    cur = queue.shift() || null;
    renderCard();
    if (cur) {
      window.scrollTo(0, 0);
      try { $('#acts').scrollIntoView({ block: 'nearest' }); } catch (e) {}
    }
  }

  function reveal() {
    if (!cur || shown) return;
    shown = true;
    $('#card').classList.add('open');
    $('#grade').style.display = 'flex';
    var r = $('[data-a="reveal"]');
    if (r) r.style.display = 'none';
  }

  function grade(res) {
    if (!cur) return;
    var t = todayStr();
    var s = st.s[cur.id] || { b: 0, d: '', n: 0, ok: 0, ng: 0, new: true };
    s.n = (s.n || 0) + 1;
    if (res === 2) {
      s.ok = (s.ok || 0) + 1;
      s.b = Math.min(MAXBOX, (s.b || 0) + 1);
      s.d = addDays(t, INTERVALS[s.b]);
      streak++;
    } else if (res === 1) {
      s.ng = (s.ng || 0) + 1;
      s.d = addDays(t, 1);
      streak = 0;
    } else {
      s.ng = (s.ng || 0) + 1;
      s.b = Math.max(0, (s.b || 0) - 1);
      s.d = t;                       // 今天还会再出现
      streak = 0;
    }
    if (!st.day[t]) st.day[t] = { n: 0, r: 0 };
    if (s.new) { st.day[t].n++; s.new = false; } else { st.day[t].r++; }
    st.s[cur.id] = s;
    save();
    todayDone++;
    if (res === 0) queue.push(cur);   // 不会的排到队尾，今天再过一遍
    next();
  }

  function speak() {
    if (!cur) return;
    if (!('speechSynthesis' in window)) return toast('这台设备的 WebView 不支持朗读');
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(cur.front.replace(/【____】/g, '。') + '。答案：' + cur.back);
      u.lang = 'zh-CN';
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) { toast('朗读失败'); }
  }

  /* ---------- 交互 ---------- */
  function bind() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-a],[data-g],[data-goal],[data-mode],[data-vol]') : null;
      if (!t) return;
      if (t.dataset.a === 'ov') { if (e.preventDefault) e.preventDefault(); return renderOverview(); }
    if (t.dataset.a === 'start') { return startStudy(); }
    if (t.dataset.a === 'reveal') return reveal();
      if (t.dataset.a === 'tts') return speak();
      if (t.dataset.a === 'again') { queue = buildQueue(); todayTotal = queue.length; todayDone = 0; return next(); }
      if (t.dataset.g !== undefined) return grade(+t.dataset.g);
      if (t.dataset.goal) {
        st.goal = +t.dataset.goal;
        $$('#segGoal button').forEach(function (b) { b.classList.toggle('on', +b.dataset.goal === st.goal); });
        save();
        queue = buildQueue(); todayTotal = queue.length; todayDone = 0;
        var subEl = $('#sub');
        if (subEl && DATA.cards.length) {
          subEl.textContent = DATA.cards.length + ' 张卡 · ' + Object.keys(DATA.meta.by_vol || {}).length +
            ' 卷 · 今日新学上限 ' + st.goal;
        }
        if (ovOpen) return renderOverview();   // 在总览里调上限，留在总览看新计划
        return next();
      }
      if (t.dataset.mode) {
        st.mode = t.dataset.mode;
        $$('#segMode button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === st.mode); });
        save();
        queue = buildQueue(); todayTotal = queue.length; todayDone = 0;
        if (ovOpen) {                 // 从总览点「只背高频」→ 直接开背
          if (st.mode === 'hot') toast('已切到「只看高频」，只背 ★ 采分点');
          if (st.mode === 'core') toast('只背实操四卷：技能操作 60% 的直接来源');
          return startStudy();
        }
        return next();
      }
      if (t.dataset.vol) {
        st.vol = t.dataset.vol;
        $$('#segVol button').forEach(function (b) { b.classList.toggle('on', b.dataset.vol === st.vol); });
        save();
        queue = buildQueue(); todayTotal = queue.length; todayDone = 0;
        return next();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (!shown) reveal(); else grade(2);
      } else if (shown && (e.key === '1' || e.key === '2' || e.key === '3')) {
        grade(+e.key - 1);
      }
    });

    // 手机上滑翻面（必须「没有在滚动」才算手势，否则往下滑页面会误判成翻面/下一张）
    var y0 = null, s0 = 0, p0 = 0, moved = 0;
    var pane = $('#pane');
    function scrollTopNow() {
      return (window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0);
    }
    pane.addEventListener('touchstart', function (e) {
      if (e.target && /^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { y0 = null; return; }
      y0 = e.touches[0].clientY;
      s0 = scrollTopNow();
      p0 = pane.scrollTop || 0;
      moved = 0;
    }, { passive: true });
    pane.addEventListener('touchmove', function (e) {
      var dy = e.changedTouches && e.changedTouches[0] ? (e.touches[0].clientY - y0) : 0;
      if (Math.abs(dy) > 8) moved = 1;
    }, { passive: true });
    pane.addEventListener('touchend', function (e) {
      if (y0 === null) return;
      var dy = e.changedTouches[0].clientY - y0;
      var scrolled = Math.abs(scrollTopNow() - s0) > 4 || Math.abs((pane.scrollTop || 0) - p0) > 4;
      y0 = null;
      if (scrolled || moved) return;          // 手指在滑页面，不是翻面手势
      if (dy < -70) { if (!shown) reveal(); else grade(2); }
    }, { passive: true });
  }

  /* ---------- 启动 ---------- */
  function volChips() {
    var seen = {};
    DATA.cards.forEach(function (c) { seen[c.v] = 1; });
    // 固定顺序：三层新卷在前，其余按内容优先级
    var ORDER = ['UNIV', 'TPL', 'CASE', 'F', 'A', 'C', 'B', 'E', 'D', '00'];
    var vols = ORDER.filter(function (v) { return seen[v]; });
    Object.keys(seen).forEach(function (v) { if (vols.indexOf(v) < 0) vols.push(v); });
    var h = '<button data-vol="all"' + (st.vol === 'all' ? ' class="on"' : '') + '>全部</button>';
    vols.forEach(function (v) {
      h += '<button data-vol="' + v + '"' + (st.vol === v ? ' class="on"' : '') + '>' + esc(volName(v)) + '</button>';
    });
    $('#segVol').innerHTML = h;
  }

  function boot() {
    load();
    applyTheme();
    var m = location.search.match(/[?&]v=([^&]+)/);
    if (m) st.vol = decodeURIComponent(m[1]);

    fetch('data/beisong.json').then(function (r) { return r.json(); }).then(function (d) {
      // 追加「实操必背」卷（40 张手写卡，独立文件，构建时不会覆盖）
      return fetch('data/beisong_sc.json').then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (sc) {
          if (sc && sc.cards && sc.cards.length) {
            d.cards = (d.cards || []).concat(sc.cards);
            d.meta = d.meta || {};
            d.meta.total = d.cards.length;
            d.meta.by_vol = d.meta.by_vol || {};
            var bv = (sc.meta && sc.meta.by_vol) || {};
            Object.keys(bv).forEach(function (k) {
              d.meta.by_vol[k] = (d.meta.by_vol[k] || 0) + bv[k];
            });
          }
          return d;
        });
    }).then(function (d) {
      DATA = d;
      (d.cards || []).forEach(function (c) { byId[c.id] = c; });
      // 指定卷没有卡（例如 00 作战地图不出卡）→ 回落到全部，别给一张空页
      if (st.vol !== 'all' && !(d.cards || []).some(function (c) { return c.v === st.vol; })) {
        st.vol = 'all';
      }
      volChips();
      $$('#segGoal button').forEach(function (b) { b.classList.toggle('on', +b.dataset.goal === st.goal); });
      $$('#segMode button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === st.mode); });
      var by = d.meta.by_vol || {};
      $('#sub').textContent = (d.meta.total || d.cards.length) + ' 张卡 · ' +
        Object.keys(by).length + ' 卷 · 今日新学上限 ' + st.goal;
      queue = buildQueue();
      todayTotal = queue.length;
      todayDone = 0;
      bind();
      next();
    }).catch(function (e) {
      $('#pane').innerHTML = '<div class="done">卡片加载失败：' + esc(e.message) +
        '<br><span style="font-size:12px">确认 data/beisong.json 已随包发布</span></div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
