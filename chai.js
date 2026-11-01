/* 拆题教练：写 → 判 → 补 → 复练
   不是"看答案"，是每一格都真的填、真的判、错的进复练队列。 */
(function () {
  'use strict';
  var LS = 'ths_chai_v1';
  var D = null, pane = null, seg = null;
  var ST = {
    tab: 'list', item: null, guess: null,
    fill: {},            // 当前小问：slotIndex -> 用户输入
    judged: null,        // 判定结果 {hit:[bool], n, total}
    done: {},            // itemId -> 连续全对次数
    rev: [],             // 复练队列 [{item, slot, due, miss}]
    stat: { guess: 0, right: 0, slots: 0, hit: 0 }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function addDays(n) {
    var d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(LS) || '{}');
      if (o.done) ST.done = o.done;
      if (Array.isArray(o.rev)) ST.rev = o.rev;
      if (o.stat) ST.stat = { guess: o.stat.guess || 0, right: o.stat.right || 0, slots: o.stat.slots || 0, hit: o.stat.hit || 0 };
    } catch (e) {}
  }
  function save() {
    try {
      localStorage.setItem(LS, JSON.stringify({ done: ST.done, rev: ST.rev, stat: ST.stat }));
    } catch (e) {}
  }
  function toast(m) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = m; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 1700);
  }
  function themeFromApp() {
    try {
      var st = JSON.parse(localStorage.getItem('ths_store_v1') || '{}');
      if (st.settings) {
        if (st.settings.theme) document.documentElement.setAttribute('data-theme', st.settings.theme);
        if (st.settings.font) document.documentElement.setAttribute('data-font', st.settings.font);
      }
    } catch (e) {}
  }

  function typeOf(id) { for (var i = 0; i < D.types.length; i++) if (D.types[i].id === id) return D.types[i]; return null; }
  function itemOf(id) { for (var i = 0; i < D.items.length; i++) if (D.items[i].id === id) return D.items[i]; return null; }
  function idxOf(id) { for (var i = 0; i < D.items.length; i++) if (D.items[i].id === id) return i; return -1; }
  function dueRev() { var t = today(); return ST.rev.filter(function (r) { return r.due <= t; }); }

  /* ---------- 题库 ---------- */
  function renderList() {
    var due = dueRev();
    var master = 0;
    D.items.forEach(function (it) { if ((ST.done[it.id] || 0) >= 2) master++; });
    var h = '<div class="cardx"><h2>怎么练</h2><p>' +
      '每个小问：<b>先认问法</b> → <b>照骨架逐格填</b> → <b>提交判定</b>（命中关键词才算过）→ ' +
      '没过的格子进<b>复练队列</b>，明天再考你一次。<br>' +
      '掌握 ' + master + ' / ' + D.items.length + '　格命中 ' + ST.stat.hit + '/' + ST.stat.slots +
      '　认问法 ' + ST.stat.right + '/' + ST.stat.guess + '</p></div>';

    if (due.length) {
      h += '<div class="cardx" style="border-left:4px solid var(--bad)">' +
        '<h2>今天要复练：' + due.length + ' 格</h2>' +
        '<p>这些格子上次没写对。复练是短跑，一格一格来。</p>' +
        '<div class="btns" style="margin:12px 0 0"><button class="btn" data-a="review">开始复练</button></div></div>';
    }

    var curQ = 0;
    D.items.forEach(function (it) {
      if (it.q !== curQ) {
        if (curQ) h += '</div>';
        curQ = it.q;
        h += '<div class="cardx" style="padding:0;overflow:hidden"><div style="padding:12px 14px;background:var(--pri-soft);' +
             'color:var(--pri);font-weight:800;font-size:calc(var(--fs) - 1px)">第 ' + it.q + ' 题</div>';
      }
      var lv = ST.done[it.id] || 0;
      var mark = lv >= 2 ? '★' : (lv === 1 ? '◐' : (it.sub + 1));
      h += '<button class="item' + (lv >= 2 ? ' done' : '') + '" data-item="' + it.id + '">' +
        '<span class="no">' + mark + '</span><span class="tx">' + esc(it.ask) + '</span><span class="go">›</span></button>';
    });
    if (curQ) h += '</div>';
    pane.innerHTML = h;
  }

  /* ---------- 拆题 ---------- */
  function renderDrill() {
    var it = itemOf(ST.item);
    if (!it) { ST.tab = 'list'; return renderList(); }
    var t = typeOf(it.type);
    var idx = idxOf(it.id);
    var h = '';

    h += '<div class="qhead"><div class="qn">第 ' + it.q + ' 题 · 小问 ' + (it.sub + 1) +
         '　(' + (idx + 1) + '/' + D.items.length + ')</div><div class="ask">' + esc(it.ask) + '</div></div>';

    if (ST.guess === null) {
      h += '<div class="qtip">第一步：这题在问什么？</div><div class="opts" id="opts">';
      optsFor(it).forEach(function (o) {
        h += '<button class="opt" data-type="' + o.id + '"><span class="bx"></span><span>' + esc(o.name) +
             '　<span style="color:var(--tx2)">' + esc(o.cue) + '</span></span></button>';
      });
      h += '</div>';
      pane.innerHTML = h;
      return;
    }

    var right = ST.guess === it.type;
    h += '<div class="opts" id="opts">';
    optsFor(it).forEach(function (o) {
      var cls = 'opt';
      if (o.id === it.type) cls += ' ok';
      else if (o.id === ST.guess) cls += ' bad';
      h += '<button class="' + cls + '" disabled><span class="bx">' +
        (o.id === it.type ? '✓' : (o.id === ST.guess ? '✕' : '')) + '</span><span>' + esc(o.name) + '</span></button>';
    });
    h += '</div>';

    h += '<div class="trans"><b>' + (right ? '答对了：' : '这题是「' + esc(t.name) + '」：') + '</b>' + esc(it.translate) + '</div>';
    h += '<div class="cardx"><h2>骨架：' + esc(t.name) + '</h2><p>' + esc(t.frame) + '</p>' +
         '<p style="margin-top:8px;color:var(--ok)">' + esc(t.tips) + '</p></div>';
    h += '<div class="qtip">第二步：每格都要填（填关键词即可）。提交后才判，判完错的格会进复练队列。</div>';

    h += '<div class="slots">';
    it.skeleton.forEach(function (s, i) {
      var v = ST.fill[i] || '';
      var j = ST.judged;
      var cls = 'slot';
      if (j) cls += j.hit[i] ? ' ok' : ' bad';
      h += '<div class="' + cls + '" data-slot="' + i + '">' +
        '<div class="sl"><span class="n">' + (i + 1) + '</span><span>' + esc(s.slot) + '</span>' +
        (j ? '<span class="res">' + (j.hit[i] ? '✓' : '✗') + '</span>' : '') + '</div>' +
        '<input class="si" data-in="' + i + '" value="' + esc(v) + '" placeholder="填这一格的关键词"' +
        (j ? ' disabled' : '') + '>' +
        (j && !j.hit[i] ? '<div class="hh shown">该填：' + esc(s.hint) + '</div>' : '') +
        '<button class="hb" data-hint="' + i + '">提示</button>' +
        '<div class="hh">' + esc(s.hint) + '</div></div>';
    });
    h += '</div>';

    if (ST.judged) {
      var j = ST.judged;
      var perfect = j.hit.every(Boolean);
      h += '<div class="ans"><h3>' + (perfect ? '全对，这题算掌握一次' : '命中 ' + j.n + ' / ' + j.total + ' 格') + '</h3>' +
        '<p style="color:var(--tx2);font-size:calc(var(--fs) - 2px);line-height:1.7">' +
        (perfect ? '连续两次全对会标 ★。' : '没过的格子已排进复练队列，明天再来。') + '</p>' +
        '<div class="mdl" style="margin-top:10px">' + esc(it.model) + '</div>';
      if (it.traps && it.traps.length) {
        h += '<div class="tr"><h3>最容易丢分的地方</h3><ul>';
        it.traps.forEach(function (x) { h += '<li>' + esc(x) + '</li>'; });
        h += '</ul></div>';
      }
      h += '</div>';
    }

    h += '<div class="btns">' +
      (ST.judged ? '<button class="btn ghost" data-a="retry">再练一遍</button>'
                 : '<button class="btn" data-a="submit">提交判定</button>') +
      '<button class="btn ghost" data-a="list">回题库</button></div>';
    h += '<div class="btns">' +
      (idx > 0 ? '<button class="btn ghost" data-a="prev">上一小问</button>' : '') +
      (idx < D.items.length - 1 ? '<button class="btn ghost" data-a="next">下一小问</button>' : '') +
      '</div>';

    pane.innerHTML = h;
  }

  function optsFor(it) {
    var others = D.types.filter(function (t) { return t.id !== it.type; });
    var seed = idxOf(it.id);
    var pick = [];
    for (var i = 0; i < 3; i++) pick.push(others[(seed + i * 3) % others.length]);
    var list = pick.slice();
    list.splice(seed % 4, 0, typeOf(it.type));
    return list;
  }

  function judge(it) {
    var hit = [], n = 0;
    it.skeleton.forEach(function (s, i) {
      var txt = norm(ST.fill[i]);
      var ok = false;
      if (txt) ok = (s.acc || []).some(function (k) { return txt.indexOf(norm(k)) >= 0; });
      hit.push(ok);
      if (ok) n++;
      if (!ok) queueReview(it.id, i);
    });
    ST.stat.slots += hit.length;
    ST.stat.hit += n;
    ST.judged = { hit: hit, n: n, total: hit.length };
    var lv = ST.done[it.id] || 0;
    ST.done[it.id] = (n === hit.length) ? lv + 1 : 0;
    save();
    return n === hit.length;
  }

  function queueReview(item, slot) {
    for (var i = 0; i < ST.rev.length; i++) {
      if (ST.rev[i].item === item && ST.rev[i].slot === slot) {
        ST.rev[i].miss = (ST.rev[i].miss || 1) + 1;
        ST.rev[i].due = addDays(Math.min(7, ST.rev[i].miss));
        return;
      }
    }
    ST.rev.push({ item: item, slot: slot, due: addDays(1), miss: 1 });
  }
  function clearReview(item, slot) {
    ST.rev = ST.rev.filter(function (r) { return !(r.item === item && r.slot === slot); });
  }

  function goItem(id) {
    ST.item = id; ST.guess = null; ST.judged = null; ST.fill = {};
    renderDrill();
    window.scrollTo(0, 0);
  }

  function startReview() {
    var due = dueRev();
    if (!due.length) { toast('今天没有要复练的格子'); return; }
    goItem(due[0].item);
  }

  /* ---------- 问法速查 ---------- */
  function renderQuick() {
    var h = '<div class="cardx"><h2>10 个答题骨架</h2><p>考场上没时间组织语言，只能认出类型 → 调出骨架。</p></div>';
    D.types.forEach(function (t) {
      h += '<div class="typecard"><div class="tn">' + esc(t.name) + '</div>' +
        '<div class="tc">问法特征：' + esc(t.cue) + '</div>' +
        '<div class="tf">' + esc(t.frame) + '</div>' +
        '<div class="tp">' + esc(t.tips) + '</div></div>';
    });
    pane.innerHTML = h;
  }

  function setTab(t) {
    ST.tab = t;
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.p === t);
    });
    if (t === 'quick') renderQuick();
    else if (ST.item) renderDrill();
    else renderList();
  }

  function boot() {
    pane = document.getElementById('pane');
    seg = document.getElementById('seg');
    themeFromApp();
    load();

    fetch('data/chai.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        D = d;
        seg.onclick = function (e) {
          var b = e.target.closest('button[data-p]');
          if (!b) return;
          if (b.dataset.p === 'list') { ST.item = null; ST.guess = null; ST.judged = null; }
          setTab(b.dataset.p);
        };
        // 唯一一个委托处理器：无论当前在哪一屏都走这里，避免"回到题库后点了没反应"
        pane.oninput = function (e) {
          var inp = e.target.closest('[data-in]');
          if (inp) ST.fill[inp.dataset.in] = inp.value;
        };
        pane.onclick = function (e) {
          var hb = e.target.closest('[data-hint]');
          if (hb) {
            var slot = hb.closest('.slot');
            slot.classList.toggle('shown');
            hb.textContent = slot.classList.contains('shown') ? '收起' : '提示';
            return;
          }
          var item = e.target.closest('[data-item]');
          if (item) { goItem(item.dataset.item); return; }
          if (e.target.closest('[data-a="review"]')) { startReview(); return; }
          var op = e.target.closest('[data-type]');
          if (op) {
            ST.guess = op.dataset.type;
            ST.stat.guess++;
            if (ST.guess === itemOf(ST.item).type) ST.stat.right++;
            save();
            renderDrill();
            return;
          }
          var a = e.target.closest('[data-a]');
          if (!a) return;
          var act = a.dataset.a;
          var it = itemOf(ST.item);
          if (act === 'submit' && it) {
            var all = judge(it);
            if (all) {
              it.skeleton.forEach(function (s, i) { clearReview(it.id, i); });
              save();
            }
            renderDrill();
            toast(all ? '全对' : '没过的格子已进复练队列');
          } else if (act === 'retry') {
            ST.fill = {}; ST.judged = null; renderDrill();
          } else if (act === 'prev' || act === 'next') {
            goItem(D.items[idxOf(ST.item) + (act === 'next' ? 1 : -1)].id);
          } else if (act === 'list') {
            ST.item = null; ST.guess = null; ST.judged = null; ST.fill = {};
            renderList();
          }
        };
        if (ST.tab === 'quick') setTab('quick'); else renderList();
      })
      .catch(function () {
        pane.innerHTML = '<div class="cardx"><h2>数据没加载出来</h2><p>确认 data/chai.json 与页面在一起。</p></div>';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
