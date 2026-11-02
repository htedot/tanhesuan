/* 实操考场：一场 90 分钟的卷子，两个模式共用同一套题
   考场模式 = 资料在浮层、计时、交卷才判；学习模式 = 资料贴题、随时对账、一题一讲 */
(function () {
  'use strict';

  var K_EXAM = 'ths_exam_v1';
  var K_STUDY = 'ths_study_v1';
  var TOTAL_SEC = 90 * 60;

  var D = null;

  /* 判分与工具函数统一走 exam_core.js（手机端与机考端共用一套规则） */
  var Core = window.ExamCore;
  var esc = Core.esc, norm = Core.norm, mmss = Core.mmss, hitKey = Core.hitKey, evaluate = Core.evaluate;
  function scoreQuestion(q) { return Core.scoreQuestion(q, ST); }
  var APP = null;
  var ST = {
    mode: null,        // 'exam' | 'study'
    q: 0,              // 当前题序
    startedAt: 0,      // 开考/开学时间戳
    submitted: false,
    ans: {},           // 文字答案：qid#subIdx
    cells: {},         // 数字格：qid#cellIdx
    checked: {},       // 学习模式：已对账的题
    paper: null        // 交卷后的判分结果
  };
  var ticker = null;
  var lastTarget = null;   // {sel:'[data-cell="q5#7"]'} 之类的选择器

  /* ---------- 基础工具 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function store(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function load(k, dft) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : dft; } catch (e) { return dft; }
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }
  function theme() {
    try {
      var s = JSON.parse(localStorage.getItem('ths_store_v1') || '{}');
      var st = s.settings || {};
      document.documentElement.dataset.theme = st.theme || 'light';
      document.documentElement.dataset.font = st.font || 'md';
    } catch (e) {
      document.documentElement.dataset.theme = 'light';
      document.documentElement.dataset.font = 'md';
    }
  }

  /* ---------- 状态存取 ---------- */
  function persist() {
    store(K_EXAM, { cur: ST, attempts: (load(K_EXAM, {}).attempts || []) });
  }
  function attempts() { return load(K_EXAM, {}).attempts || []; }
  function studyStat() { return load(K_STUDY, {}); }
  function studyBump(qid, empty) {
    var s = studyStat();
    var o = s[qid] || { checks: 0, empty: 0, last: 0 };
    o.checks += 1;
    if (empty) o.empty += 1;
    o.last = Date.now();
    s[qid] = o;
    store(K_STUDY, s);
  }

  /* ---------- 启动 ---------- */
  function boot() {
    theme();
    APP = $('#app');
    // focusin 用 addEventListener（onfocusin 句柄属性在部分浏览器不生效）；只挂一次，靠事件冒泡
    APP.addEventListener('focusin', function (e) {
      var t = e.target;
      if (!t || !t.dataset) return;
      if (t.dataset.cell) lastTarget = { sel: '[data-cell="' + t.dataset.cell + '"]' };
      else if (t.dataset.in) lastTarget = { sel: '[data-in="' + t.dataset.in + '"]' };
    });
    fetch('data/exam.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        D = d;
        var m = (location.search.match(/[?&]m=([a-z]+)/) || [])[1];
        var saved = load(K_EXAM, {});
        var cur = saved.cur;
        if (cur && cur.mode && !cur.submitted && cur.startedAt && (Date.now() - cur.startedAt) < 1000 * 60 * 60 * 6) {
          if (m === 'exam' || m === 'study') {
            ST = cur;
            if (ST.mode === 'exam') { go('exam'); startTick(); }
            else go('study');
            return;
          }
          // 未完成的考试：回到首页并提示可继续
          ST = cur;
        }
        if (m === 'exam') { ST = { mode: 'exam', q: 0, startedAt: 0, submitted: false, ans: {}, cells: {}, checked: {}, paper: null }; go('brief'); }
        else if (m === 'study') { startStudy(); }
        else go('home');
      })
      .catch(function (e) {
        APP.innerHTML = '<div class="cardx"><h2>题目加载失败</h2><p>' + esc(e.message) + '</p></div>';
      });
  }

  function go(route, arg) {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (route === 'home') return renderHome();
    if (route === 'brief') return renderBrief();
    if (route === 'exam') return renderQuestion('exam');
    if (route === 'study') return renderQuestion('study');
    if (route === 'result') return renderResult();
    if (route === 'review') return renderReview(arg);
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    var as = attempts();
    var last = as.length ? as[as.length - 1] : null;
    var unfinished = ST && ST.mode === 'exam' && !ST.submitted && ST.startedAt;
    var h = '';
    h += '<div class="hd"><div><div class="tt">实操演练</div>' +
         '<div class="ts">技能操作 60% · 8 题 100 分 · 90 分钟</div></div></div>';

    h += '<div class="cardx"><h2>' + esc(D.meta.title) + '</h2>' +
         '<p>' + esc(D.meta.sub) + '　8 题 / 100 分 / 90 分钟</p>' +
         (unfinished
           ? '<button class="bigbtn" data-a="resume">继续上次的考试</button>' +
             '<button class="bigbtn ghost" data-a="giveup">放弃这次，重新开始</button>'
           : '<button class="bigbtn" data-a="exam">开始模拟考</button>' +
             '<button class="bigbtn ghost" data-a="study">学习模式</button>') +
         (last ? '<div class="lastline">上次模拟：<b>' + last.score.toFixed(0) + ' 分</b> · ' +
                 new Date(last.at).toLocaleDateString('zh-CN') + '　<a href="#review-0" data-a="last">看精讲</a></div>' : '') +
         '</div>';

    h += '<div class="cardx"><h2>机考模拟（电脑）</h2><p>' +
         '真实考场是机考：顶栏倒计时、左侧答题卡、右侧资料抽屉、键盘切题。' +
         '想练那个界面，用电脑打开下面这个页面（手机上也能开，但布局是给电脑做的）。</p>' +
         '<button class="bigbtn ghost" data-a="kaoshi">打开机考模拟</button></div>';

    h += '<div class="cardx"><h2>两个模式差在哪</h2><p>' +
         '<b>模拟考</b>：90 分钟倒计时、资料在顶部浮层里翻、交卷之前看不到任何答案、中途退出计时照跑。<br>' +
         '<b>学习模式</b>：不限时、本题要用的资料直接贴在题下、做完随时点「对账」看采分点和参考答案。' +
         '</p></div>';
    APP.innerHTML = h;
    bindHome();
  }

  function bindHome() {
    APP.onclick = function (e) {
      var b = e.target.closest('[data-a]');
      if (b && b.dataset.a === 'kaoshi') { location.href = 'kaoshi.html'; return; }
      if (!b) return;
      var a = b.dataset.a;
      if (a === 'exam') { ST = { mode: 'exam', q: 0, startedAt: 0, submitted: false, ans: {}, cells: {}, checked: {}, paper: null }; go('brief'); }
      else if (a === 'study') startStudy();
      else if (a === 'resume') { go('exam'); startTick(); }
      else if (a === 'giveup') { ST = { mode: 'exam', q: 0, startedAt: 0, submitted: false, ans: {}, cells: {}, checked: {}, paper: null }; persist(); go('brief'); }
      else if (a === 'last') { go('review', 0); }
    };
  }

  /* ---------- 考场须知 ---------- */
  function renderBrief() {
    var h = '';
    h += '<div class="hd"><a class="back" href="index.html">‹</a><div><div class="tt">考场须知</div>' +
         '<div class="ts">读一遍再进去，看完就开始计时</div></div></div>';
    h += '<div class="brief"><h3>' + esc(D.meta.title) + '</h3><ul>' +
      '<li><b>时长 90 分钟</b>，到点自动交卷；期间退出应用、锁屏、切后台，<b>计时照跑</b>。</li>' +
      '<li><b>8 道大题、100 分</b>：第 5 题为计算题（20 分），其余为文字作答。</li>' +
      '<li><b>闭卷</b>：资料在顶部「资料」按钮里，1–8 号表随用随翻，跟考场翻附件一样。</li>' +
      '<li><b>交卷前看不到任何答案、提示、采分点</b>。想放弃就退回首页，本次记为未完成。</li>' +
      '<li>文字题写要点即可，不用写作文；计算题填关键数字，单位和小数位按题面要求。</li>' +
      '</ul><button class="bigbtn" data-a="start">进入考场</button></div>';
    APP.innerHTML = h;
    APP.onclick = function (e) {
      if (e.target.closest('[data-a="start"]')) {
        ST.startedAt = Date.now();
        ST.q = 0;
        persist();
        go('exam');
        startTick();
      }
    };
  }

  /* ---------- 计时 ---------- */
  function startTick() {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(function () {
      var left = TOTAL_SEC - elapsed();
      var el = $('#tm');
      if (el) {
        el.textContent = mmss(left);
        el.classList.toggle('warn', left <= 300);
      }
      if (left <= 0) {
        clearInterval(ticker); ticker = null;
        submit(true);
      }
    }, 1000);
  }
  function elapsed() { return ST.startedAt ? Math.floor((Date.now() - ST.startedAt) / 1000) : 0; }

  /* ---------- 答题页 ---------- */
  function renderQuestion(mode) {
    var q = D.qs[ST.q];
    var isExam = mode === 'exam';
    var h = '';

    h += '<div class="bar">' +
      '<button data-a="back">‹</button>' +
      '<span class="no">第 ' + (ST.q + 1) + '/' + D.qs.length + ' 题</span>' +
      '<span class="sp"></span>' +
      '<span class="tm' + (isExam ? '' : '') + '" id="tm">' + (isExam ? mmss(TOTAL_SEC - elapsed()) : mmss(elapsed())) + '</span>' +
      (isExam ? '<button data-a="docs">资料</button>' : '<button data-a="check">对账</button>') +
      '<button data-a="card">答题卡</button>' +
      '</div>';

    h += '<div class="qwrap" data-qid="' + q.id + '">';
    h += '<div class="qhead"><span class="qn">' + q.no + '. ' + esc(q.title) + '</span>' +
         '<span class="qp">' + q.pt + ' 分</span></div>';
    h += '<div class="stem">' + esc(q.stem) + '</div>';

    // 学习模式：资料直接贴题
    if (!isExam) {
      h += (q.docs && q.docs.length)
        ? inlineDocs(q.docs)
        : '<div class="dnote" style="padding:10px 12px">本题不需要查资料，直接作答。</div>';
    }

    q.subs.forEach(function (sub, si) {
      h += '<div class="sub"><div class="sa"><em>(' + (si + 1) + ')</em>' + esc(sub.ask) +
           ' <span class="badge">' + sub.pt + ' 分</span></div>';
      if (q.cells) {
        var cs = q.cells.filter(function (c) { return c.sub === si; });
        cs.forEach(function (c, ci) {
          var key = q.id + '#' + q.cells.indexOf(c);
          var v = ST.cells[key] == null ? '' : ST.cells[key];
          h += '<div class="cellrow"><label>' + esc(c.label) + '</label>' +
               '<input class="cell" inputmode="decimal" data-cell="' + key + '" value="' + esc(v) + '" ' +
               'placeholder="填数字"></div>';
        });
      }
      var key2 = q.id + '#' + si;
      var tv = ST.ans[key2] == null ? '' : ST.ans[key2];
      h += '<textarea class="ans" data-in="' + key2 + '" rows="' + (sub.rows || 4) + '" ' +
           'placeholder="' + (isExam ? '按要点作答…' : '先自己写，写完点「对账」') + '">' + esc(tv) + '</textarea>';
      // 学习模式：已对账则展开采分点
      if (!isExam && ST.checked[q.id]) h += keyBlock(q, si);
      h += '</div>';
    });
    h += '</div>';

    // 学习模式：对账后整题的官方参考答案（一题只出一次）
    if (!isExam && ST.checked[q.id]) h += '<div class="ofwrap">' + officialHTML(q) + '</div>';

    h += '<div class="foot">' +
      '<button class="go" data-a="prev"' + (ST.q === 0 ? ' disabled' : '') + '>上一题</button>' +
      (isExam
        ? '<button class="sub2" data-a="submit">交卷</button>'
        : '<button class="go" data-a="next"' + (ST.q === D.qs.length - 1 ? ' disabled' : '') + '>下一题</button>') +
      (isExam ? '<button class="go" data-a="next"' + (ST.q === D.qs.length - 1 ? ' disabled' : '') + '>下一题</button>' : '') +
      '</div>';

    h += '<button class="calcbtn" data-a="calc">＝</button>';
    h += calcHTML();
    h += '<div class="xmask" id="xmask" data-a="closemask"></div>';
    h += '<div class="xsheet" id="xsheet"></div>';

    APP.innerHTML = h;
    bindQuestion(mode);
    if (isExam) { $('#tm').textContent = mmss(TOTAL_SEC - elapsed()); }
  }

  function inlineDocs(ids) {
    var h = '<details class="inline" open><summary>资料（本题用到的 ' + ids.length + ' 张表）</summary>';
    ids.forEach(function (id) {
      var d = D.docs.filter(function (x) { return x.id === id; })[0];
      if (!d) return;
      h += '<div class="dnote"><b>资料 ' + d.id + '　' + esc(d.name) + '</b></div>' + tableHTML(d);
    });
    h += '</details>';
    return h;
  }

  function tableHTML(d) {
    var h = '<table class="dtab"><thead><tr>';
    d.cols.forEach(function (c) { h += '<th>' + esc(c) + '</th>'; });
    h += '</tr></thead><tbody>';
    d.rows.forEach(function (r) {
      h += '<tr>';
      r.forEach(function (c) { h += '<td>' + esc(c) + '</td>'; });
      h += '</tr>';
    });
    h += '</tbody></table>';
    if (d.note) h += '<div class="dnote">' + esc(d.note) + '</div>';
    return h;
  }

  // 官方参考答案（附件 3 原文）
  function officialHTML(q) {
    var o = q.official;
    if (!o || !o.subs || !o.subs.length) return '';
    var h = '<div class="ofbox"><div class="ofhd">官方参考答案<span>原文，附件 3</span></div>';
    o.subs.forEach(function (s) {
      if (s.n || s.pt) {
        h += '<div class="ofn">' + esc(s.n || '') +
             (s.pt ? ' <span class="badge">' + s.pt + ' 分</span>' : '') + '</div>';
      }
      if (s.constraint) h += '<div class="ofc">评分约束：' + esc(s.constraint) + '</div>';
      (s.answer || []).forEach(function (a) {
        h += '<div class="ofa">' + esc(a) + '</div>';
      });
    });
    h += '</div>';
    return h;
  }

  // 采分点展示（学习模式用）
  function keyBlock(q, onlySub) {
    var h = '<div class="keybox"><div class="dnote"><b>采分点</b>（打勾＝你的答案里出现了这个要点）</div>';
    q.keys.forEach(function (k) {
      if (onlySub != null && k.sub !== onlySub) return;
      var text = ST.ans[q.id + '#' + k.sub] || '';
      var hit = hitKey(k, text);
      h += '<div class="kv" data-k="' + esc(k.t.slice(0, 12)) + '">' +
           '<span class="' + (hit ? 'hit' : 'miss') + '">' + (hit ? '✓' : '✗') + '</span> ' +
           esc(k.t) + (k.pt ? ' <span class="badge">' + k.pt + ' 分</span>' : '') + '</div>';
    });
    h += '</div>';
    return h;
  }

  function bindQuestion(mode) {
    var isExam = mode === 'exam';
    APP.oninput = function (e) {
      var t = e.target;
      if (t.dataset.in) { ST.ans[t.dataset.in] = t.value; }
      else if (t.dataset.cell) { ST.cells[t.dataset.cell] = t.value; }
      else return;
      if (t.dataset.cell) lastTarget = { sel: '[data-cell="' + t.dataset.cell + '"]' };
      else if (t.dataset.in) lastTarget = { sel: '[data-in="' + t.dataset.in + '"]' };
      persist();
    };

    APP.onclick = function (e) {
      var b = e.target.closest('[data-a]');
      var tabBtn = e.target.closest('[data-doc]');
      if (tabBtn) { showDoc(tabBtn.dataset.doc); return; }
      if (e.target.classList.contains('calc-k')) { calcKey(e.target.dataset.k); return; }
      if (!b) return;
      var a = b.dataset.a;
      if (a === 'back') {
        if (isExam) { if (confirm('退出后计时继续，确定退出？')) go('home'); }
        else go('home');
      } else if (a === 'prev') { if (ST.q > 0) { ST.q--; persist(); go(mode); } }
      else if (a === 'next') { if (ST.q < D.qs.length - 1) { ST.q++; persist(); go(mode); } }
      else if (a === 'docs') { openSheet('docs'); }
      else if (a === 'card') { openSheet('card'); }
      else if (a === 'closemask') { closeSheet(); }
      else if (a === 'check') {
        ST.checked[D.qs[ST.q].id] = true;
        var empty = !Object.keys(ST.ans).some(function (k) {
          return k.indexOf(D.qs[ST.q].id + '#') === 0 && String(ST.ans[k] || '').trim();
        });
        studyBump(D.qs[ST.q].id, empty);
        persist();
        go('study');
        var of = $('.ofbox');
        if (of) setTimeout(function () { of.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
      }
      else if (a === 'submit') { confirmSubmit(); }
      else if (a === 'calc') { $('#calc').classList.toggle('on'); }
      else if (a === 'jump') { ST.q = +b.dataset.i; closeSheet(); persist(); go(mode); }
      else if (a === 'calc-fill') { fillCalc(); }
      else if (a === 'calc-ret') { calcRet(); }
      else if (a === 'calc-c') { calcSet('0'); }
      else if (a === 'calc-h') { $('#calc .ch').classList.toggle('on'); }
      else if (a === 'calc-del') { calcDel(); }
    };
  }

  /* ---------- 浮层：资料 / 答题卡 ---------- */
  function openSheet(kind) {
    var s = $('#xsheet');
    var q = D.qs[ST.q];
    var h = '';
    if (kind === 'docs') {
      h += '<div class="st">';
      D.docs.forEach(function (d, i) {
        h += '<button data-doc="' + i + '"' + (i === 0 ? ' class="on"' : '') + '>' + d.id + ' 号</button>';
      });
      h += '<button class="x" data-a="closemask">✕</button></div><div id="docbody"></div>';
      s.innerHTML = h;
      showDoc(0);
    } else {
      h += '<div class="st"><span style="font-weight:800;font-size:14px;padding:6px 4px">答题卡</span>' +
           '<button class="x" data-a="closemask">✕</button></div><div class="gridcard">';
      D.qs.forEach(function (x, i) {
        var done = !!qsAnswered(x);
        h += '<button data-a="jump" data-i="' + i + '" class="' + (done ? 'done' : '') +
             (i === ST.q ? ' cur' : '') + '">' + (i + 1) + '</button>';
      });
      h += '</div>';
      s.innerHTML = h;
    }
    $('#xmask').classList.add('on');
    s.classList.add('on');
  }
  function showDoc(i) {
    var d = D.docs[+i];
    if (!d) return;
    $$('#xsheet .st button[data-doc]').forEach(function (b) {
      b.classList.toggle('on', +b.dataset.doc === +i);
    });
    var body = $('#docbody');
    if (body) body.innerHTML = '<div class="dnote"><b>资料 ' + d.id + '　' + esc(d.name) + '</b></div>' + tableHTML(d);
  }
  function closeSheet() {
    $('#xmask').classList.remove('on');
    $('#xsheet').classList.remove('on');
  }

  function qsAnswered(q) {
    if (q.cells && q.cells.some(function (c, i) { return String(ST.cells[q.id + '#' + i] || '').trim(); })) return true;
    return q.subs.some(function (s, si) { return String(ST.ans[q.id + '#' + si] || '').trim(); });
  }

  /* ---------- 计算器 ---------- */
  var CALC = { expr: '', disp: '0', hist: [] };
  function calcHTML() {
    var keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='];
    var h = '<div class="calc" id="calc"><div class="cd" id="cd">0</div><div class="ch" id="ch"></div>' +
            '<div class="ks" style="grid-template-columns:repeat(4,1fr);padding:10px;display:grid;gap:6px">';
    keys.forEach(function (k) {
      var cls = 'calc-k';
      if ('()÷×−+'.indexOf(k) >= 0) cls += ' op';
      if (k === '=') cls += ' eq';
      if (k === 'C') cls += ' op';
      h += '<button class="' + cls + '" data-k="' + k + '">' + k + '</button>';
    });
    h += '</div><div style="display:flex;gap:6px;padding:0 10px 10px">' +
         '<button class="calc-k" style="flex:1;height:38px;border:0;border-radius:10px;background:var(--pri-soft);color:var(--pri);font:inherit;font-weight:700;cursor:pointer" data-a="calc-ret">带回来</button>' +
         '<button class="fill" data-a="calc-fill" style="flex:1">填入当前格</button></div></div>';
    return h;
  }
  function calcSet(expr) {
    CALC.expr = expr;
    CALC.disp = expr || '0';
    var d = $('#cd'); if (d) d.textContent = CALC.disp;
  }
  function calcDel() { calcSet(CALC.expr.slice(0, -1)); }
  function calcKey(k) {
    if (k === 'C') return calcSet('');
    if (k === '⌫') return calcDel();
    if (k === '=') {
      var v = evaluate(CALC.expr);
      if (v == null) { toast('算式不完整'); return; }
      CALC.hist.unshift(CALC.expr + ' = ' + v);
      CALC.hist = CALC.hist.slice(0, 20);
      var ch = $('#ch');
      if (ch) { ch.innerHTML = CALC.hist.map(function (x) { return esc(x); }).join('<br>'); }
      calcSet(String(v));
      return;
    }
    calcSet(CALC.expr + k);
  }
  /* 把上一次的结果接进新算式：长式子分步算时，不用手抄中间数 */
  function calcRet() {
    var v = CALC.disp;
    if (v === '0' || v === '') { toast('还没有可接的结果'); return; }
    if (CALC.expr === v) { toast('已经在算式里了'); return; }
    calcSet(v);
    toast('已带入，接着输入运算号');
  }

  function fillCalc() {
    var v = CALC.disp;
    if (v === '0' || v === '') { toast('计算器里还没有结果'); return; }
    var el = lastTarget ? $(lastTarget.sel) : null;
    if (!el) { toast('先点一下要填的格子'); return; }
    el.value = v;
    if (el.dataset.cell) ST.cells[el.dataset.cell] = v;
    if (el.dataset.in) ST.ans[el.dataset.in] = v;
    persist();
    toast('已填入');
  }

  /* ---------- 判分 ---------- */
  function submit(auto) {
    var per = D.qs.map(scoreQuestion);
    var total = per.reduce(function (s, x) { return s + x.got; }, 0);
    var calc = per.reduce(function (s, x) { return s + x.calc; }, 0);
    var text = per.reduce(function (s, x) { return s + x.text; }, 0);
    var dur = elapsed();
    var paper = {
      at: Date.now(), mode: 'exam', dur: dur,
      score: +total.toFixed(2), calc: +calc.toFixed(2), text: +text.toFixed(2),
      per: per,
      ans: JSON.parse(JSON.stringify(ST.ans)),
      cells: JSON.parse(JSON.stringify(ST.cells))
    };
    var box = load(K_EXAM, {});
    box.attempts = (box.attempts || []).concat([paper]).slice(-20);
    box.cur = null;
    store(K_EXAM, box);
    ST.submitted = true;
    ST.paper = paper;
    if (ticker) { clearInterval(ticker); ticker = null; }
    go('result');
    toast(auto ? '时间到，已自动交卷' : '已交卷');
  }

  function confirmSubmit() {
    var blank = D.qs.filter(function (q) { return !qsAnswered(q); }).length;
    var left = mmss(TOTAL_SEC - elapsed());
    var msg = '还剩 ' + left + '，' + (blank ? '有 ' + blank + ' 题完全没答。' : '全部题目都有作答。') + '\n确定交卷？';
    if (confirm(msg)) submit(false);
  }

  /* ---------- 成绩 ---------- */
  function renderResult() {
    var p = ST.paper || (attempts()[attempts().length - 1]);
    if (!p) return go('home');
    var h = '';
    h += '<div class="hd"><a class="back" href="index.html">‹</a><div><div class="tt">成绩</div>' +
         '<div class="ts">用时 ' + mmss(p.dur) + ' · ' + new Date(p.at).toLocaleDateString('zh-CN') + '</div></div></div>';
    h += '<div class="score"><div class="n">' + p.score.toFixed(0) + '<small> / 100</small></div>' +
         '<div class="br"><div>计算题（机器判）<b>' + p.calc.toFixed(1) + ' / 20</b></div>' +
         '<div>文字题（关键词判）<b>' + p.text.toFixed(1) + ' / 80</b></div></div></div>';
    h += '<div class="dnote" style="padding:0 16px 6px">文字题是按「采分点里的关键词有没有出现」判的，不是老师阅卷；'
       + '数字题是严格比对。分数只说明你写了多少要点，不说明写得好不好。</div>';
    p.per.forEach(function (x, i) {
      h += '<div class="rowq" data-a="rv" data-i="' + i + '"><span class="t">' + x.no + '. ' + esc(x.title) + '</span>' +
           '<span class="s' + (x.got < x.pt * 0.6 ? ' low' : '') + '">' + x.got + '</span>' +
           '<span style="color:var(--tx2);font-size:12px">/' + x.pt + '</span></div>';
    });
    h += '<div style="padding:12px"><button class="bigbtn ghost" data-a="home">回到首页</button></div>';
    APP.innerHTML = h;
    APP.onclick = function (e) {
      var b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'rv') go('review', +b.dataset.i);
      else if (b.dataset.a === 'home') go('home');
    };
  }

  /* ---------- 逐题精讲 ---------- */
  function renderReview(i) {
    var p = ST.paper || attempts()[attempts().length - 1];
    if (!p) return go('home');
    var q = D.qs[i];
    var x = p.per[i];
    var h = '';
    h += '<div class="hd"><button class="back" data-a="result">‹</button><div><div class="tt">第 ' + q.no + ' 题 · 精讲</div>' +
         '<div class="ts">得分 ' + x.got + ' / ' + q.pt + '</div></div></div>';

    h += '<div class="review"><h4>你的答案</h4>';
    q.subs.forEach(function (s, si) {
      var a = (p.ans || {})[q.id + '#' + si] || '';
      // 纯计算的小问：没写字就不显示「空白」，数字在下面逐格列
      var onlyCells = q.cells && q.cells.some(function (c) { return c.sub === si; });
      if (onlyCells && !String(a).trim()) return;
      h += '<div class="kv"><div class="k">(' + (si + 1) + ') ' + esc(s.ask) + '</div>' +
           (a ? '<div style="white-space:pre-wrap">' + esc(a) + '</div>' : '<div class="miss">（空白）</div>') + '</div>';
    });
    if (q.cells) {
      q.cells.forEach(function (c, ci) {
        var v = (p.cells || {})[q.id + '#' + ci];
        var ok = !isNaN(parseFloat(v)) && Math.abs(parseFloat(v) - c.ans) <= c.tol;
        h += '<div class="kv"><div class="k">' + esc(c.label) + '</div>' +
             '<div class="' + (ok ? 'hit' : 'miss') + '">你的：' + esc(v == null || v === '' ? '（空白）' : v) +
             '　正确：' + c.ans + '</div></div>';
      });
    }
    h += '</div>';

    h += '<div class="review"><h4>采分点逐条对账</h4>';
    q.keys.forEach(function (k) {
      if (k.noScore) return;
      var hit = hitKey(k, (p.ans || {})[q.id + '#' + k.sub] || '');
      h += '<div class="kv"><span class="' + (hit ? 'hit' : 'miss') + '">' + (hit ? '✓' : '✗') + '</span> ' +
           esc(k.t) + (k.pt ? ' <span class="badge">' + k.pt + ' 分</span>' : '') + '</div>';
    });
    h += '</div>';

    h += '<div class="review"><h4>参考答案</h4>' + officialHTML(q) +
         (q.model ? '<details class="mn"><summary>我的一句话记法</summary><div class="model">' + esc(q.model) + '</div></details>' : '') +
         '</div>';
    h += '<div class="review"><h4>这题考什么</h4><div class="model">' + esc(q.point) + '</div>' +
         '<div class="tipbox"><b>常见丢分：</b>' + esc(q.loss) + '</div></div>';
    h += '<div style="padding:12px;display:flex;gap:8px">' +
         '<button class="bigbtn ghost" data-a="result">回成绩</button>' +
         '<button class="bigbtn" data-a="redo" data-i="' + i + '">这题重做</button></div>';

    APP.innerHTML = h;
    APP.onclick = function (e) {
      var b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'result') go('result');
      else if (b.dataset.a === 'redo') {
        ST = { mode: 'study', q: +b.dataset.i, startedAt: Date.now(), submitted: false, ans: {}, cells: {}, checked: {}, paper: null };
        persist();
        go('study');
      }
    };
  }

  /* ---------- 学习模式 ---------- */
  function startStudy() {
    ST = { mode: 'study', q: 0, startedAt: Date.now(), submitted: false, ans: {}, cells: {}, checked: {}, paper: null };
    persist();
    go('study');
    if (ticker) clearInterval(ticker);
    ticker = setInterval(function () {
      var el = $('#tm');
      if (el) el.textContent = mmss(elapsed());
    }, 1000);
  }

  window.addEventListener('beforeunload', function () {
    if (ST && ST.mode === 'exam' && !ST.submitted) persist();
  });

  boot();
})();
