/* 标准速查 + 反向题 —— 依据官方理论题库实测与实操参考答案整理 */
(function () {
  'use strict';

  var D = null;
  var B = {}, Q = {};
  var KEY = 'ths_bz_v1';
  var ST = { tab: 'cards', done: {}, qi: 0, right: 0, wrong: [], picked: null, rev: [] };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* **粗体** → <b>，先转义再替换 */
  function md(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          if (o.done && typeof o.done === 'object') ST.done = o.done;
          if (Array.isArray(o.rev)) ST.rev = o.rev;
        }
      }
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ done: ST.done, rev: ST.rev })); } catch (e) {}
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function plusDays(n) {
    var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
  }
  function stdOf(id) {
    for (var i = 0; i < D.standards.length; i++) if (D.standards[i].id === id) return D.standards[i];
    return null;
  }

  /* ---------- 卡片 ---------- */
  function cardHtml(s) {
    var lv = s.level === 'A' ? '必背' : '认号';
    var cls = s.level === 'A' ? '' : ' b';
    var keys = (s.keys || []).map(function (k) { return '<li>' + md(k) + '</li>'; }).join('');
    return '' +
      '<div class="st' + (ST.done[s.id] ? ' done' : '') + '" data-std="' + esc(s.id) + '">' +
        '<div class="top">' +
          '<span class="code">' + esc(s.code) + '</span>' +
          '<span class="lv' + cls + '">' + lv + '</span>' +
        '</div>' +
        '<div class="nm">' + esc(s.name) + '</div>' +
        '<div class="nat">' + md(s.nature) + '</div>' +
        '<div class="body">' +
          '<dl>' +
            '<dt>管什么</dt><dd>' + md(s.scope) + '</dd>' +
            '<dt>必须记住的点</dt><dd><ul>' + keys + '</ul></dd>' +
            '<dt>什么时候选它</dt><dd>' + md(s.when) + '</dd>' +
          '</dl>' +
          '<div class="qn">出处：' + esc(s.qn || '—') + '</div>' +
          '<button class="mark" data-mark="' + esc(s.id) + '">' +
            (ST.done[s.id] ? '✓ 已掌握（再点取消）' : '标记为已掌握') +
          '</button>' +
        '</div>' +
      '</div>';
  }

  function viewCards() {
    var A = D.standards.filter(function (s) { return s.level === 'A'; });
    var Bs = D.standards.filter(function (s) { return s.level === 'B'; });
    var cheap = (D.cheap || []).map(function (c) {
      return '<div class="row"><b>' + esc(c.code) + '</b><span>' + esc(c.note) + '</span></div>';
    }).join('');
    var n = Object.keys(ST.done).length;
    return '' +
      '<div class="note">' + md(D.meta.note) + '<br>已掌握 <b id="cnt">' + n + '</b> / ' + D.standards.length + ' 个。' +
        '点卡片展开要点，背完点「标记为已掌握」。</div>' +
      '<div class="grp">A 级 · 必须能凭记忆写出（实操第 1 题就给这 5 分）</div>' +
      A.map(cardHtml).join('') +
      '<div class="grp">B 级 · 认得出编号、说清管什么</div>' +
      Bs.map(cardHtml).join('') +
      '<div class="grp">C 级 · 认得就行（理论只考「认号」）</div>' +
      '<div class="cheap">' + cheap + '</div>';
  }

  /* ---------- 反向题 ---------- */
  function quizHtml() {
    var qs = D.questions;
    if (!qs.length) return '<div class="empty">没有题目</div>';
    if (ST.qi >= qs.length) {
      return '<div class="empty"><b>这一轮做完了</b><br>答对 ' + ST.right + ' / ' + qs.length +
        (ST.wrong.length ? '<br>错 ' + ST.wrong.length + ' 题，已进复练队列' : '<br>全对，漂亮') +
        '</div>' +
        '<div class="btns"><button class="btn" data-act="again">再来一轮（只练错题）</button>' +
        '<button class="btn ghost" data-act="reset">从头做全部</button></div>';
    }
    var q = qs[ST.qi];
    var pickedStd = ST.picked ? stdOf(ST.picked) : null;
    var opts = q.o.map(function (id, i) {
      var s = stdOf(id);
      var cls = '';
      if (ST.picked) {
        if (id === q.a) cls = ' ok';
        else if (id === ST.picked) cls = ' bad';
      }
      return '<button class="opt' + cls + '" data-pick="' + esc(id) + '"' + (ST.picked ? ' disabled' : '') + '>' +
        '<span class="bx">' + 'ABCD'[i] + '</span>' +
        '<span><b>' + esc(s ? s.code : id) + '</b><br>' + esc(s ? s.name : '') + '</span>' +
      '</button>';
    }).join('');
    var why = '';
    if (ST.picked) {
      var ok = ST.picked === q.a;
      why = '<div class="why' + (ok ? '' : ' bad') + '"><b>' + (ok ? '✓ 对了' : '✗ 不对') + '</b>　' +
        md(q.why) + (ok ? '' : '<br>正确选项：<b>' + esc(stdOf(q.a).code) + '</b>') + '</div>' +
        '<div class="btns"><button class="btn" data-act="next">' +
          (ST.qi === qs.length - 1 ? '看结果' : '下一题') + '</button></div>';
    }
    return '' +
      '<div class="qhead"><div class="qn">第 ' + (ST.qi + 1) + ' / ' + qs.length + ' 题' +
        (ST.rev.length ? ' · 复练队列 ' + ST.rev.length + ' 个' : '') + '</div>' +
        '<div class="ask">' + esc(q.q) + '</div></div>' +
      '<div class="opts">' + opts + '</div>' + why;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    $$('#seg button').forEach(function (b, i) {
      var on = b.dataset.tab === ST.tab;
      b.classList.toggle('on', on);
      if (i === 0) b.textContent = '卡片 · ' + Object.keys(ST.done).length + '/' + D.standards.length;
      else {
        var answered = ST.qi + (ST.picked ? 1 : 0);
        b.textContent = answered ? '反向题 · ' + answered + '/' + D.questions.length
                              : '反向题 · ' + D.questions.length + ' 道';
      }
    });
    $('#pane').innerHTML = ST.tab === 'cards' ? viewCards() : quizHtml();
  }

  /* ---------- 交互 ---------- */
  function nextRound(list) {
    ST.qi = 0; ST.right = 0; ST.wrong = []; ST.picked = null;
    if (list && list.length) {
      /* 只练错题：把错题提到队首，其余清掉 */
      var byQ = D.questions.filter(function (q) { return list.indexOf(q.a) >= 0; });
      D.questions = byQ;
    }
  }

  function onPick(id) {
    if (ST.picked) return;
    ST.picked = id;
    var q = D.questions[ST.qi];
    if (id === q.a) {
      ST.right++;
      ST.rev = ST.rev.filter(function (r) { return r !== q.a; });
    } else {
      ST.wrong.push(q.a);
      if (ST.rev.indexOf(q.a) < 0) ST.rev.push(q.a);
    }
    save();
    render();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button, .st') : null;
    if (!t) return;

    if (t.dataset.tab) {
      ST.tab = t.dataset.tab;
      render();
      return;
    }
    if (t.dataset.mark) {
      var id = t.dataset.mark;
      if (ST.done[id]) delete ST.done[id]; else ST.done[id] = true;
      save();
      var card = t.closest('.st');
      var wasOpen = card && card.classList.contains('open');
      render();
      var again = $('[data-std="' + id + '"]');
      if (again && wasOpen) again.classList.add('open');
      return;
    }
    if (t.dataset.pick) { onPick(t.dataset.pick); return; }
    if (t.dataset.act === 'next') {
      ST.qi++; ST.picked = null; render(); return;
    }
    if (t.dataset.act === 'again') {
      var list = ST.wrong.slice();
      nextRound(list);
      render(); return;
    }
    if (t.dataset.act === 'reset') {
      window.location.reload(); return;
    }
    var st = t.closest('.st');
    if (st) st.classList.toggle('open');
  });

  /* 主题跟随主 App（不记录标签页，重开回卡片） */
  function theme() {
    try {
      var raw = localStorage.getItem('ths_store_v1');
      if (!raw) return;
      var o = JSON.parse(raw);
      var st = o && o.settings || {};
      if (st.theme) document.documentElement.setAttribute('data-theme', st.theme);
      if (st.font) document.documentElement.setAttribute('data-font', st.font);
    } catch (e) {}
  }

  function boot() {
    theme();
    load();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/biaozhun.json', true);
    xhr.onload = function () {
      if (xhr.status && xhr.status !== 200 && xhr.status !== 0) { fail(); return; }
      try { D = JSON.parse(xhr.responseText); } catch (e) { fail(); return; }
      if (!D.standards || !D.standards.length) { fail(); return; }
      D.questions = (D.questions || []).slice();
      B.msg = null;
      render();
    };
    xhr.onerror = fail;
    xhr.send();
  }
  function fail() {
    $('#pane').innerHTML = '<div class="empty">数据没加载出来：<br>data/biaozhun.json 缺失或损坏</div>';
  }

  window.__BZ_TEST__ = {
    get state() { return ST; },
    get data() { return D; },
    render: render,
    pick: function (i) { onPick(D.questions[ST.qi].o[i]); },
    next: function () { ST.qi++; ST.picked = null; render(); },
    md: md
  };

  boot();
})();
