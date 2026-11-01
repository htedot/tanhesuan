/* 机考模拟客户端（桌面版）
   目标不是"再做一个刷题页"，而是让手先熟悉机考的操作形状：
   顶栏倒计时、左侧答题卡、右侧资料抽屉、键盘切题、交卷确认、交卷后锁定。
   说明：这是按常见机考形态做的模拟环境，不是官方客户端的复刻。 */
(function () {
  'use strict';

  var K = 'ths_kaoshi_v1';
  var TOTAL = 90 * 60;
  var Core = window.ExamCore;

  var D = null, AP = null;
  var ST = null;                 // 见 blank()
  var ticker = null, savedAt = 0;

  function blank() {
    return { startedAt: 0, q: 0, ans: {}, cells: {}, marks: {}, submitted: false, paper: null };
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var esc = Core.esc;

  function load() {
    try {
      var raw = localStorage.getItem(K);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.st ? o : null;
    } catch (e) { return null; }
  }
  function save(now) {
    try {
      localStorage.setItem(K, JSON.stringify({ st: ST }));
      savedAt = Date.now();
      var el = $('#saveState');
      if (el) el.textContent = '已自动保存 ' + new Date(savedAt).toLocaleTimeString('zh-CN', { hour12: false });
      if (now) { /* 立即保存时不必额外动作 */ }
    } catch (e) { /* 存不下就算了，不影响答题 */ }
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }
  function elapsed() { return ST && ST.startedAt ? Math.floor((Date.now() - ST.startedAt) / 1000) : 0; }
  function left() { return TOTAL - elapsed(); }

  /* ---------- 启动 ---------- */
  function boot() {
    AP = $('#app');
    var loadData = (window.__EXAM_DATA__)
      ? Promise.resolve(window.__EXAM_DATA__)                     // 单文件版：数据内嵌，file:// 直接可用
      : fetch('data/exam.json', { cache: 'no-cache' }).then(function (r) { return r.json(); });
    loadData
      .then(function (d) {
        D = d;
        var saved = load();
        if (saved && saved.st && !saved.st.submitted && saved.st.startedAt &&
            (Date.now() - saved.st.startedAt) < 1000 * 60 * 60 * 6) {
          ST = saved.st;
          renderExam();
          // 先提示再开表：万一已经超时，tick 里的「时间到」提示才不会被覆盖
          if (left() > 0) toast('已载入上次未完成的考试');
          tick();
          return;
        }
        if (saved && saved.st && saved.st.submitted && saved.st.paper) {
          ST = saved.st;
          renderResult();
          return;
        }
        ST = blank();
        renderStart();
      })
      .catch(function (e) {
        AP.innerHTML = '<div style="padding:40px;color:#b3261e">题目加载失败：' + esc(e.message) + '</div>';
      });
  }

  /* ---------- 入场须知 ---------- */
  function renderStart() {
    AP.innerHTML =
      topbarHTML(false) +
      '<div style="flex:1;overflow:auto;padding:34px 20px">' +
      '<div class="panel result" style="padding:26px 30px">' +
      '<h2 style="margin:0 0 6px;font-size:20px">技能操作 · 机考模拟</h2>' +
      '<p style="color:#5b6675;margin:0 0 18px">2026 年江苏省碳排放核算员职业技能大赛 · 学生组 · 模拟环境</p>' +
      '<ol style="margin:0;padding-left:20px;line-height:2;font-size:14px;color:#26303d">' +
      '<li><b>90 分钟</b>，到点自动交卷；中途关掉页面再打开可以接着答，<b>计时不停</b>。</li>' +
      '<li><b>8 道大题、共 100 分</b>：第 5 题是计算题（20 分），其余为文字作答。</li>' +
      '<li>右上「资料」可查 1–8 号附件表；<b>快捷键 Alt+D</b> 开关资料，<b>Alt+← / Alt+→</b> 切题，<b>Alt+M</b> 标记，<b>Alt+S</b> 交卷。</li>' +
      '<li><b>交卷前看不到任何答案与提示</b>；交卷后当次成绩锁定，可逐题看精讲。</li>' +
      '<li>这是按常见机考形态做的模拟界面，不是官方客户端；<b>真实考场的按钮位置、附件入口请以现场为准</b>。</li>' +
      '</ol>' +
      '<div style="margin-top:22px;display:flex;gap:12px">' +
      '<button id="btnStart" style="height:42px;padding:0 26px;border:0;border-radius:4px;background:#1e3a5f;color:#fff;font:inherit;font-weight:700;cursor:pointer">开始考试</button>' +
      '</div></div></div>';
    $('#btnStart').onclick = function () {
      ST = blank();
      ST.startedAt = Date.now();
      save(true);
      renderExam();
      tick();
    };
  }

  /* ---------- 顶栏 ---------- */
  function topbarHTML(running) {
    return '<div id="topbar">' +
      '<span class="title">技能操作（机考模拟）</span>' +
      '<span class="sub">满分 100 · 90 分钟</span>' +
      '<span class="sp"></span>' +
      '<span id="tm">' + (running ? Core.mmss(left()) : '90:00') + '</span>' +
      '<span class="who">考生：毕洪博<br>学生组</span>' +
      (running ? '<button id="btnCalc" title="计算器（Alt+C）">计算器</button>' : '') +
      '<button id="btnSubmit"' + (running ? '' : ' disabled') + '>交卷</button>' +
      '</div>';
  }

  /* ---------- 考试主界面 ---------- */
  function renderExam(keepScroll) {
    var q = D.qs[ST.q];
    var h = topbarHTML(true);
    h += '<div id="main">';

    /* 左栏 */
    h += '<div id="side">' +
      '<div class="cand"><b>毕洪博</b>学生组 · 河海大学</div>' +
      '<h3>答题卡（' + D.qs.length + ' 题）</h3><div id="navGrid">';
    D.qs.forEach(function (x, i) {
      var cls = [];
      if (answered(x)) cls.push('done');
      if (i === ST.q) cls.push('cur');
      if (ST.marks[x.id]) cls.push('marked');
      h += '<button data-q="' + i + '" class="' + cls.join(' ') + '">' + (i + 1) + '</button>';
    });
    h += '</div>' +
      '<div id="legend"><div><i class="l1"></i>已作答</div><div><i></i>未作答</div>' +
      '<div><i class="l2"></i>已标记</div></div>' +
      '<div id="markBar"><button id="mark" class="' + (ST.marks[q.id] ? 'on' : '') + '">' +
      (ST.marks[q.id] ? '取消标记' : '标记本题') + '</button></div>' +
      '</div>';

    /* 主区 */
    h += '<div id="stage"><div class="qhead">' +
      '<span class="no">第 ' + (ST.q + 1) + ' 题 / 共 ' + D.qs.length + ' 题</span>' +
      '<span class="pt">本题 ' + q.pt + ' 分</span>' +
      '<span class="sp"></span>' +
      '<button id="docbtn">资料（Alt+D）</button>' +
      '</div><div class="panel">' +
      '<div class="stem">' + esc(q.stem) + '</div>';

    q.subs.forEach(function (sub, si) {
      h += '<div class="sub"><div class="sa"><em>(' + (si + 1) + ')</em>' + esc(sub.ask) +
           '<span class="badge">' + sub.pt + ' 分</span></div>';
      if (q.cells) {
        var cs = q.cells.filter(function (c) { return c.sub === si; });
        if (cs.length) {
          h += '<div class="cells"><div class="hd"><span>作答项</span><span>你的答案</span><span>单位</span></div>';
          cs.forEach(function (c) {
            var idx = q.cells.indexOf(c);
            var key = q.id + '#' + idx;
            var v = ST.cells[key] == null ? '' : ST.cells[key];
            var unit = (c.label.match(/）\s*(.*)$/) || [])[1] || '';
            var name = c.label.replace(/（.*$/, '');
            h += '<div class="row"><span>' + esc(name) + '</span>' +
                 '<input data-cell="' + key + '" value="' + esc(v) + '" inputmode="decimal" placeholder="填数字">' +
                 '<span class="u">' + esc(unit || '—') + '</span></div>';
          });
          h += '</div>';
        }
      }
      var key2 = q.id + '#' + si;
      var tv = ST.ans[key2] == null ? '' : ST.ans[key2];
      h += '<textarea class="ans" data-in="' + key2 + '" rows="' + (sub.rows || 5) + '" ' +
           'placeholder="请按要点作答（机考直接打字，不用写作文）">' + esc(tv) + '</textarea></div>';
    });

    h += '</div></div></div>';   // panel / stage / main

    /* 底栏 */
    h += '<div id="footbar">' +
      '<button id="prev"' + (ST.q === 0 ? ' disabled' : '') + '>上一题</button>' +
      '<button id="next"' + (ST.q === D.qs.length - 1 ? ' disabled' : '') + '>下一题</button>' +
      '<span class="sp"></span>' +
      '<span id="saveState">已自动保存 ' +
      (savedAt ? new Date(savedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—') + '</span>' +
      '</div>';

    /* 资料抽屉 */
    h += '<div id="docpanel"><div class="ph">';
    D.docs.forEach(function (d, i) {
      h += '<button data-doc="' + i + '"' + (i === 0 ? ' class="on"' : '') + '>' + d.id + '号</button>';
    });
    h += '<button class="x" id="docclose">✕</button></div><div id="docbody"></div></div>';

    /* 交卷确认 */
    h += '<div id="modal"><div class="box" id="modalBox"></div></div>';

    AP.innerHTML = h;
    bindExam();
    showDoc(0);
    if (keepScroll) $('#stage').scrollTop = keepScroll;
  }

  function answered(q) {
    if (q.cells && q.cells.some(function (c, i) { return String(ST.cells[q.id + '#' + i] || '').trim(); })) return true;
    return q.subs.some(function (s, si) { return String(ST.ans[q.id + '#' + si] || '').trim(); });
  }

  function bindExam() {
    $('#stage').addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset.in) ST.ans[t.dataset.in] = t.value;
      else if (t.dataset.cell) ST.cells[t.dataset.cell] = t.value;
      else return;
      save(false);
      refreshNav();
    });
    $('#stage').addEventListener('focusin', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.cell) window.__lastField = '[data-cell="' + t.dataset.cell + '"]';
      else if (t.dataset && t.dataset.in) window.__lastField = '[data-in="' + t.dataset.in + '"]';
    });
    var bc = $('#btnCalc');
    if (bc) bc.onclick = function () { window.KCalc.toggle(); };

    $('#prev').onclick = function () { goto(ST.q - 1); };
    $('#next').onclick = function () { goto(ST.q + 1); };
    $('#mark').onclick = function () {
      var id = D.qs[ST.q].id;
      if (ST.marks[id]) delete ST.marks[id]; else ST.marks[id] = 1;
      save(false);
      renderExam($('#stage').scrollTop);
    };
    $('#docbtn').onclick = function () { $('#docpanel').classList.toggle('on'); };
    $('#docclose').onclick = function () { $('#docpanel').classList.remove('on'); };
    $$('#docpanel .ph button[data-doc]').forEach(function (b) {
      b.onclick = function () { showDoc(+b.dataset.doc); };
    });
    $('#navGrid').onclick = function (e) {
      var b = e.target.closest('button[data-q]');
      if (b) goto(+b.dataset.q);
    };
    $('#btnSubmit').onclick = askSubmit;
  }

  function refreshNav() {
    var cur = D.qs[ST.q];
    $$('#navGrid button').forEach(function (b, i) {
      b.classList.toggle('done', answered(D.qs[i]));
    });
    var mb = $('#mark');
    if (mb) {
      mb.classList.toggle('on', !!ST.marks[cur.id]);
      mb.textContent = ST.marks[cur.id] ? '取消标记' : '标记本题';
    }
  }

  function goto(i) {
    if (i < 0 || i >= D.qs.length) return;
    ST.q = i;
    save(false);
    renderExam(0);
  }

  /* ---------- 资料 ---------- */
  function showDoc(i) {
    var d = D.docs[i];
    if (!d) return;
    $$('#docpanel .ph button[data-doc]').forEach(function (b) {
      b.classList.toggle('on', +b.dataset.doc === i);
    });
    var h = '<h4>资料 ' + d.id + '　' + esc(d.name) + '</h4><table class="d"><thead><tr>';
    d.cols.forEach(function (c) { h += '<th>' + esc(c) + '</th>'; });
    h += '</tr></thead><tbody>';
    d.rows.forEach(function (r) {
      h += '<tr>';
      r.forEach(function (c) { h += '<td>' + esc(c) + '</td>'; });
      h += '</tr>';
    });
    h += '</tbody></table>';
    if (d.note) h += '<div class="dnote">' + esc(d.note) + '</div>';
    $('#docbody').innerHTML = h;
    $('#docbody').scrollTop = 0;
  }

  /* ---------- 交卷 ---------- */
  function askSubmit() {
    var blanks = [], marks = [];
    D.qs.forEach(function (q, i) {
      if (!answered(q)) blanks.push(i + 1);
      if (ST.marks[q.id]) marks.push(i + 1);
    });
    var box = $('#modalBox');
    box.innerHTML =
      '<h3>确认交卷？</h3>' +
      '<p>已用时间 <b>' + Core.mmss(elapsed()) + '</b>，剩余 <b>' + Core.mmss(left()) + '</b>。</p>' +
      (blanks.length
        ? '<p style="color:#b3261e">未作答：第 ' + blanks.join('、') + ' 题</p>'
        : '<p style="color:#137a4b">8 题都有作答记录。</p>') +
      (marks.length ? '<p>已标记待查：第 ' + marks.join('、') + ' 题</p>' : '') +
      '<p style="color:#5b6675">交卷后本次成绩锁定，不能再改答案。</p>' +
      '<div class="acts"><button id="mCancel">继续答题</button>' +
      '<button class="danger" id="mOk">确认交卷</button></div>';
    $('#modal').classList.add('on');
    $('#mCancel').onclick = function () { $('#modal').classList.remove('on'); };
    $('#mOk').onclick = function () { $('#modal').classList.remove('on'); doSubmit(); };
  }

  function doSubmit(auto) {
    if (window.KCalc) window.KCalc.hide();
    var r = Core.scoreAll(D, ST);
    ST.paper = {
      at: Date.now(), dur: elapsed(), score: r.score, calc: r.calc, text: r.text,
      per: r.per, ans: JSON.parse(JSON.stringify(ST.ans)), cells: JSON.parse(JSON.stringify(ST.cells))
    };
    ST.submitted = true;
    save(true);
    if (ticker) { clearInterval(ticker); ticker = null; }
    renderResult();
    toast(auto ? '时间到，已自动交卷' : '已交卷');
  }

  function tick() {
    if (ticker) clearInterval(ticker);
    function step() {
      var el = $('#tm');
      if (el) {
        el.textContent = Core.mmss(left());
        el.classList.toggle('warn', left() <= 300);
      }
      if (left() <= 0) {
        if (ticker) { clearInterval(ticker); ticker = null; }
        doSubmit(true);
      }
    }
    step();                       // 先判一次：续考时可能已经超时
    ticker = setInterval(step, 1000);
  }

  /* ---------- 成绩 ---------- */
  function renderResult() {
    var p = ST.paper;
    var h = topbarHTML(false);
    h += '<div style="flex:1;overflow:auto;padding:24px 20px"><div class="result panel" style="padding:24px 28px">';
    h += '<h2 style="margin:0;font-size:19px">交卷完成</h2>';
    h += '<div class="big"><b>' + p.score.toFixed(0) + '</b><span>/ 100　用时 ' + Core.mmss(p.dur) +
         '　' + new Date(p.at).toLocaleString('zh-CN', { hour12: false }) + '</span></div>';
    h += '<div class="split">' +
      '<div>计算题（机器严格判）<b>' + p.calc.toFixed(1) + ' / 20</b></div>' +
      '<div>文字题（采分点关键词判）<b>' + p.text.toFixed(1) + ' / 80</b></div></div>';
    h += '<p style="color:#5b6675;font-size:13px;margin:0 0 16px">文字题按「采分点里的关键词有没有出现」判，' +
         '不是老师阅卷；数字题严格比对。分数只说明你写了多少要点。</p>';
    p.per.forEach(function (x, i) {
      h += '<div class="qrow" data-rv="' + i + '"><span class="t">' + x.no + '. ' + esc(x.title) + '</span>' +
           '<span class="s' + (x.got < x.pt * 0.6 ? ' low' : '') + '">' + x.got + '</span>' +
           '<span style="color:#5b6675;font-size:12px">/' + x.pt + '</span></div>';
    });
    h += '<div style="margin-top:16px;display:flex;gap:10px">' +
         '<button id="again" style="height:40px;padding:0 20px;border:0;border-radius:4px;background:#1e3a5f;color:#fff;font:inherit;font-weight:700;cursor:pointer">再考一次</button>' +
         '</div></div></div>';
    AP.innerHTML = h;
    $('#again').onclick = function () {
      ST = blank(); save(true); renderStart();
    };
    $$('[data-rv]').forEach(function (el) {
      el.onclick = function () { renderReview(+el.dataset.rv); };
    });
  }

  /* ---------- 精讲 ---------- */
  function renderReview(i) {
    var p = ST.paper;
    var q = D.qs[i], x = p.per[i];
    var h = topbarHTML(false);
    h += '<div style="flex:1;overflow:auto;padding:24px 20px"><div class="result">';
    h += '<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px">' +
         '<button id="back" style="height:32px;padding:0 14px;border:1px solid #d7dde5;background:#fff;border-radius:4px;font:inherit;cursor:pointer">返回成绩</button>' +
         '<h2 style="margin:0;font-size:18px">第 ' + q.no + ' 题 · 精讲</h2>' +
         '<span style="color:#5b6675">得分 ' + x.got + ' / ' + q.pt + '</span></div>';

    h += '<div class="panel rv"><h3>你的答案</h3>';
    q.subs.forEach(function (s, si) {
      var a = (p.ans || {})[q.id + '#' + si] || '';
      var onlyCells = q.cells && q.cells.some(function (c) { return c.sub === si; });
      if (onlyCells && !String(a).trim()) return;
      h += '<div class="kv"><div class="k">(' + (si + 1) + ') ' + esc(s.ask) + '</div>' +
           (a ? '<div style="white-space:pre-wrap">' + esc(a) + '</div>' : '<div class="miss">（空白）</div>') + '</div>';
    });
    if (q.cells) {
      q.cells.forEach(function (c, ci) {
        var v = (p.cells || {})[q.id + '#' + ci];
        var ok = Core.cellOk(v, c);
        h += '<div class="kv"><div class="k">' + esc(c.label) + '</div>' +
             '<div class="' + (ok ? 'hit' : 'miss') + '">你的：' + esc(v == null || v === '' ? '（空白）' : v) +
             '　正确：' + c.ans + '</div></div>';
      });
    }
    h += '</div>';

    h += '<div class="panel rv"><h3>采分点逐条对账</h3>';
    q.keys.forEach(function (k) {
      if (k.noScore) return;
      var hit = Core.hitKey(k, (p.ans || {})[q.id + '#' + k.sub] || '');
      h += '<div class="kv"><span class="' + (hit ? 'hit' : 'miss') + '">' + (hit ? '✓' : '✗') + '</span> ' +
           esc(k.t) + (k.pt ? '　<span style="color:#5b6675;font-size:12px">' + k.pt + ' 分</span>' : '') + '</div>';
    });
    h += '</div>';

    h += '<div class="panel rv"><h3>参考答案</h3><div class="model">' + esc(q.model) + '</div></div>';
    h += '<div class="panel rv"><h3>这题考什么</h3><div class="model">' + esc(q.point) + '</div>' +
         '<div class="tip"><b>常见丢分：</b>' + esc(q.loss) + '</div></div>';
    h += '</div></div>';
    AP.innerHTML = h;
    $('#back').onclick = renderResult;
    window.scrollTo(0, 0);
  }

  /* ---------- 键盘 ---------- */
  document.addEventListener('keydown', function (e) {
    if (!ST || ST.submitted || !D) return;
    if (window.KCalc && window.KCalc.isVisible()) return;   // 计算器开着时把键盘让给它
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault(); goto(ST.q + (e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault(); if ($('#mark')) $('#mark').click();
    } else if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault(); if ($('#docpanel')) $('#docpanel').classList.toggle('on');
    } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault(); if ($('#btnSubmit') && !$('#btnSubmit').disabled) askSubmit();
    } else if (e.key === 'Escape') {
      var p = $('#docpanel'); if (p) p.classList.remove('on');
      var m = $('#modal'); if (m) m.classList.remove('on');
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (ST && ST.startedAt && !ST.submitted) {
      save(true);
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  boot();
})();
