/* 碳核算刷题 — 离线刷题 App（无框架、无后端、纯本地） */
(function () {
  'use strict';

  /* ================= 常量 ================= */
  var LS_KEY = 'ths_store_v1';
  var TYPE_NAME = { single: '单项选择题', double: '双项选择题', multi: '不定项选择题', judge: '判断题' };
  var PART_NAME = { 1: '第一部分 单项选择', 2: '第二部分 双项选择', 3: '第三部分 不定项选择', 4: '第四部分 判断' };
  var TAGS = ['重点', '疑问', '易错'];
  var TAG_CLS = { '重点': 't1', '疑问': 't2', '易错': 't3' };
  var PART_TYPE = { 1: '单选', 2: '双项', 3: '不定项', 4: '判断' };
  var LETTERS = 'ABCDEF';
  var JUDGE_OPTS = ['√', '×'];
  var WRONG_OUT_STREAK = 5;      // 错题连续答对 5 次移出
  var SIZE_CHOICES = [10, 20, 50, 100, 0];

  /* ================= 工具 ================= */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function shuffleArr(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function sameSet(a, b) { if (a.length !== b.length) return false; var s = {}; a.forEach(function (x) { s[x] = 1; }); return b.every(function (x) { return s[x]; }); }
  function pct(c, a) { return a ? Math.round(c / a * 100) : 0; }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 1900);
  }
  function vibrate(p) {
    if (!store.settings.vibrate) return;
    try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { }
  }

  /* ================= 存储 ================= */
  function defaultStore() {
    return {
      v: 1,
      settings: { shuffle: true, theme: 'light', font: 'md', instant: true, source: true, vibrate: true, showWrong: true },
      qstat: {},   // qid -> {a:作答次数,c:答对,w:答错,streak:连对,inWrong:是否在错题本,ts}
      fav: {},     // qid -> ['重点',...]
      daily: {},   // 'YYYY-MM-DD' -> {n,c}
      sessions: {} // key -> session
    };
  }
  var store = null;
  var saveTimer = null;

  function normalizeStore() {
    var d = defaultStore();
    if (!store || typeof store !== 'object') store = d;
    store.v = 1;
    store.settings = Object.assign(d.settings, store.settings || {});
    store.qstat = store.qstat || {};
    store.fav = store.fav || {};
    store.daily = store.daily || {};
    store.sessions = store.sessions || {};
    Object.keys(store.qstat).forEach(function (k) {
      var s = store.qstat[k];
      s.a = s.a || 0; s.c = s.c || 0; s.w = s.w || 0;
      s.streak = s.streak || 0; s.inWrong = !!s.inWrong;
      // 「对题本」字段：老数据没有这个字段时按历史成绩补一次
      // 与错题本互斥：仍在错题本里的题不算"做对收录"
      if (typeof s.inRight !== 'boolean') s.inRight = (s.c > 0 && !s.inWrong);
    });
  }
  function loadStore() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
    if (!raw) { store = defaultStore(); normalizeStore(); return; }
    var needSave = false;
    try {
      store = JSON.parse(raw);
      if (!store || store.v !== 1 || !store.settings || !store.qstat ||
        !store.fav || !store.daily || !store.sessions) needSave = true;   // 旧版本数据：读入后补全并回写
    } catch (e) {
      // 读不出来时：先把原始内容另存一份（不丢证据），再用空数据继续，并明确告知用户
      storeBroken = true;
      var keepKey = LS_KEY + '_broken_' + Date.now();
      try { localStorage.setItem(keepKey, raw); brokenKeepKey = keepKey; } catch (e2) { brokenKeepKey = ''; }
      store = defaultStore();
      needSave = true;
    }
    normalizeStore();
    if (needSave) saveNow();
  }
  var storageOK = true, storageWarned = false, storeBroken = false, brokenKeepKey = '', sessionsPruned = 0;

  /* 统一的顶部警示条 */
  function showBanner(html, btnId, btnText, onBtn) {
    try {
      var bar = document.createElement('div');
      bar.className = 'warnbar';
      bar.innerHTML = '<span>' + html + '</span><button id="' + btnId + '">' + (btnText || '知道了') + '</button>';
      document.body.insertBefore(bar, document.body.firstChild);
      var btn = document.getElementById(btnId);
      if (btn) btn.onclick = onBtn || function () { if (bar.parentNode) bar.parentNode.removeChild(bar); };
      return bar;
    } catch (e) { return null; }
  }

  /* 开机自检：本机到底能不能保存数据？不能就必须明确告诉用户，避免进度静默丢失 */
  function checkStorage() {
    try {
      var probe = '__ths_probe__';
      localStorage.setItem(probe, 'ok');
      var back = localStorage.getItem(probe) === 'ok';
      localStorage.removeItem(probe);
      return back;
    } catch (e) { return false; }
  }
  function storageFail() {
    storageOK = false;
    if (storageWarned) return;
    storageWarned = true;
    showBanner('⚠️ <b>进度可能无法保存</b>：本机浏览器不允许此页面存储数据。' +
      '请改用「添加到主屏幕」的版本，并到「设置 → 数据管理」导出备份。', 'warnClose');
  }
  /* 本地进度无法解析：绝不静默覆盖，先把原始内容另存一份再提示用户 */
  function storeCorruptFail(savedKey) {
    showBanner('⚠️ <b>本机保存的进度无法读取</b>（数据可能已损坏）。' +
      '原始内容已保留为 <code>' + esc(savedKey) + '</code>，' +
      '请到「设置 → 数据管理 → 从备份文件恢复」找回进度。', 'brokenClose');
  }

  function save() {
    clearTimeout(saveTimer);
    if (!storageOK) return;                       // 已知存不了，不再反复触发提示
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(store)); }
      catch (e) { storageFail(); }
    }, 60);
  }
  function saveNow() {
    if (!storageOK) { storageFail(); return; }
    try { localStorage.setItem(LS_KEY, JSON.stringify(store)); }
    catch (e) { storageFail(); }
  }

  function stat(id) { return store.qstat[id] || { a: 0, c: 0, w: 0, streak: 0, inWrong: false, inRight: false, ts: 0 }; }
  function statW(id) {
    if (!store.qstat[id]) store.qstat[id] = { a: 0, c: 0, w: 0, streak: 0, inWrong: false, inRight: false, ts: 0 };
    return store.qstat[id];
  }
  function favTags(id) { return store.fav[id] || []; }
  function isFav(id) { return favTags(id).length > 0; }

  /* ================= 数据 ================= */
  var DATA = null, QBYID = {}, BYPART = { 1: [], 2: [], 3: [], 4: [] }, ALL = [];

  function loadQuestionData() {
    if (window.QUESTION_DATA) return Promise.resolve(window.QUESTION_DATA);
    return fetch('data/questions.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function indexData(d) {
    DATA = d;
    ALL = d.questions.slice();
    QBYID = {};
    BYPART = { 1: [], 2: [], 3: [], 4: [] };
    ALL.forEach(function (q) {
      // 防御性规整：裁掉尾部空选项（不定项可能只有 A–E）
      if (q.type !== 'judge' && q.options && q.options.length) {
        while (q.options.length && !q.options[q.options.length - 1]) q.options.pop();
      }
      QBYID[q.id] = q; BYPART[q.part].push(q);
    });

    // 题库若发生变动，作废引用了已不存在题目的旧进度，避免「继续上次」时崩溃
    sessionsPruned = 0;
    Object.keys(store.sessions || {}).forEach(function (k) {
      var s = store.sessions[k];
      if (!s || !s.ids || !s.ids.length) { delete store.sessions[k]; return; }
      var kept = s.ids.filter(function (id) { return !!QBYID[id]; });
      if (kept.length === s.ids.length) return;
      sessionsPruned += s.ids.length - kept.length;
      if (!kept.length) { delete store.sessions[k]; return; }
      s.ids = kept;
      if (s.idx >= kept.length) s.idx = kept.length - 1;
      Object.keys(s.ans || {}).forEach(function (id) { if (!QBYID[id]) delete s.ans[id]; });
      Object.keys(s.perm || {}).forEach(function (id) { if (!QBYID[id]) delete s.perm[id]; });
      Object.keys(s.pick || {}).forEach(function (id) { if (!QBYID[id]) delete s.pick[id]; });
    });
    if (sessionsPruned) saveNow();
  }
  function labelOf(q) { return '第' + q.part + '部分·第' + q.no + '题'; }

  /* ================= 答题记录 =================
     两个题本互斥：
       答对 → 进「对题本」（若它还在错题本里，则先算错题本内的连对，不进对题本）
       答错 → 离开「对题本」，进「错题本」
     错题本连对满 WRONG_OUT_STREAK 次移出后，才转入「对题本」。 */
  function record(q, ok) {
    var s = statW(q.id);
    s.a++; s.ts = Date.now();
    if (ok) {
      s.c++;
      if (s.inWrong) {
        s.streak++;
        if (s.streak >= WRONG_OUT_STREAK) { s.inWrong = false; s.inRight = true; }   // 错题过关 → 转入对题本
      } else {
        s.inRight = true;
      }
    } else {
      s.w++; s.streak = 0; s.inWrong = true; s.inRight = false;
    }
    var d = todayStr();
    var day = store.daily[d] || (store.daily[d] = { n: 0, c: 0 });
    day.n++; if (ok) day.c++;
    save();
  }
  function toggleFav(id, tag) {
    var t = favTags(id).slice();
    var i = t.indexOf(tag);
    if (i >= 0) t.splice(i, 1); else t.push(tag);
    if (t.length) store.fav[id] = t; else delete store.fav[id];
    save();
  }
  function removeFromWrong(id) {
    var s = statW(id);
    s.inWrong = false; s.streak = 0;
    save();
  }
  function removeFromRight(id) {
    var s = statW(id);
    s.inRight = false;
    save();
  }
  function resetQuestion(id) {
    delete store.qstat[id];
    Object.keys(store.sessions).forEach(function (k) {
      var se = store.sessions[k];
      if (se.ans) delete se.ans[id];
    });
    save();
  }

  /* ================= 会话 ================= */
  var S = { tab: 'home', session: null, view: 'q', pick: {}, cardOpen: false };

  function sessKey(o) { return o.mode + (o.part ? ':' + o.part : ''); }
  function sessLabel(o) {
    var base = o.mode === 'wrong' ? '错题重做' : o.mode === 'right' ? '对题本重做' : o.mode === 'fav' ? '收藏重做'
      : (o.mode === 'rand' ? '随机练习' : '顺序练习');
    if (o.part) base += ' · 第' + o.part + '部分';
    return base;
  }
  function filterQuestions(list, filter) {
    if (filter === 'new') return list.filter(function (q) { return !stat(q.id).a; });
    if (filter === 'wrong') return list.filter(function (q) { return stat(q.id).inWrong; });
    if (filter === 'fav') return list.filter(function (q) { return isFav(q.id); });
    return list;
  }
  function buildIds(o) {
    var base;
    if (o.mode === 'wrong') base = ALL.filter(function (q) { return stat(q.id).inWrong; });
    else if (o.mode === 'right') base = ALL.filter(function (q) { return stat(q.id).inRight; });
    else if (o.mode === 'fav') base = ALL.filter(function (q) { return isFav(q.id); });
    else base = (o.part ? BYPART[o.part] : ALL).slice();
    base = filterQuestions(base, o.filter);
    if (o.mode === 'rand') shuffleArr(base);
    if (o.size) base = base.slice(0, o.size);
    return base.map(function (q) { return q.id; });
  }
  function createSession(o) {
    var key = sessKey(o);
    var ids = buildIds(o);
    var s = {
      key: key, mode: o.mode, part: o.part || 0, size: o.size || 0, filter: o.filter || 'all',
      label: sessLabel(o), ids: ids, idx: 0, perm: {}, pick: {}, ans: {}, revealed: false, ts: Date.now()
    };
    if (store.settings.shuffle) {
      ids.forEach(function (id) {
        var q = QBYID[id];
        if (q && q.type !== 'judge') {
          var p = q.options.map(function (_, i) { return i; });
          s.perm[id] = shuffleArr(p);
        }
      });
    }
    store.sessions[key] = s;
    save();
    return s;
  }
  function latestSession() {
    var best = null;
    Object.keys(store.sessions).forEach(function (k) {
      var s = store.sessions[k];
      if (!s || !s.ids || !s.ids.length) return;
      if (s.finished) return;                      // 已完成的一轮不再算“未完成”
      if (s.idx >= s.ids.length) return;           // 已完成
      if (!best || (s.ts || 0) > (best.ts || 0)) best = s;
    });
    return best;
  }
  function answeredCount(s) { return s.ids.filter(function (id) { return s.ans[id]; }).length; }
  function correctCount(s) {
    return s.ids.filter(function (id) { return s.ans[id] && s.ans[id].ok; }).length;
  }
  function isFinished(s) { return s.ids.every(function (id) { return !!s.ans[id]; }); }

  function startSession(o) {
    var key = sessKey(o);
    var old = store.sessions[key];
    var ids = buildIds(o);
    if (!ids.length) { toast('该范围内没有题目'); return; }
    if (old && !old.finished && old.ans && Object.keys(old.ans).length && old.idx < old.ids.length) {
      confirmSheet('发现未完成的进度', '「' + old.label + '」已经做到第 ' + (old.idx + 1) + '/' + old.ids.length + ' 题。',
        '继续上次', function () { openSession(key); },
        '重新开始', function () { S.session = createSession(o); S.view = 'q'; renderSession(); syncGuard(); });
      return;
    }
    S.session = createSession(o);
    S.view = 'q';
    renderSession();
    syncGuard();
  }
  function openSession(key) {
    var s = store.sessions[key];
    if (!s || !s.ids || !s.ids.length) { toast('没有可继续的题目'); return; }
    S.session = s;
    S.view = (s.finished || s.idx >= s.ids.length) ? 'result' : 'q';
    renderSession();
    syncGuard();
  }
  function closeSession() {
    var el = $('#session');
    var wasOpen = el && !el.classList.contains('hidden');
    S.session = null;
    el.classList.add('hidden');
    if (wasOpen) syncGuard();
    render();
  }

  /* ================= 判分 ================= */
  function dispChoices(q, disp) {
    if (q.type === 'judge') return JUDGE_OPTS.slice();
    return disp.map(function (i) { return q.options[i]; });
  }
  function correctPos(q, disp) {
    if (q.type === 'judge') return [q.answer[0] === '√' ? 0 : 1];
    var want = q.answer.map(function (L) { return LETTERS.indexOf(L); });
    var out = [];
    disp.forEach(function (orig, pos) { if (want.indexOf(orig) >= 0) out.push(pos); });
    return out;
  }
  function submitAnswer(q, sel) {
    var s = S.session;
    var disp = s.perm[q.id] || q.options.map(function (_, i) { return i; });
    var ok = sameSet(sel, correctPos(q, disp));
    s.ans[q.id] = { sel: sel.slice(), ok: ok };
    s.pick[q.id] = sel.slice();
    record(q, ok);
    vibrate(ok ? 12 : [14, 45, 14]);
    if (isFinished(s)) { s.revealed = true; s.finished = true; }
    save();
    renderSession();
    if (isFinished(s)) {
      // 延迟弹出结果页前必须校验会话身份，否则会把之后新开的会话错切到结果页
      setTimeout(function () { if (S.session === s) openResult(); }, 420);
    }
  }

  /* ================= 安卓返回键 / 浏览器后退：逐层关闭 =================
     思路：只在「从没有浮层 → 有浮层」这一刻压入一条历史记录当守卫，
     浮层之间互相切换（如关面板同时开练习）不碰历史，避免 back/push 竞态。
     用户按返回时按界面状态关掉最内层；界面里的关闭按钮则把守卫记录退掉。 */
  var guardActive = false;
  var suppressPop = 0;
  var syncTimer = null;

  function anyLayerOpen() {
    if (!$('#sheet').classList.contains('hidden')) return true;
    if (S.session) return true;
    return false;
  }
  function syncGuard() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      var want = anyLayerOpen();
      if (want && !guardActive) {
        guardActive = true;
        try { history.pushState({ ths: 1 }, ''); } catch (e) { guardActive = false; }
      } else if (!want && guardActive) {
        guardActive = false;
        // 只有当前确实停在我们压入的守卫记录上时才回退，
        // 否则（例如页面刷新过）贸然后退会把 App 整个退出
        try {
          if (history.state && history.state.ths) {
            suppressPop++;
            history.back();
          }
        } catch (e) { suppressPop--; }
      }
    }, 0);
  }
  window.addEventListener('popstate', function () {
    if (suppressPop > 0) { suppressPop--; return; }
    guardActive = false;                       // 这条守卫记录已被返回操作消费掉
    if (!$('#sheet').classList.contains('hidden')) { hideSheet(); }
    else if (S.session && document.querySelector('.cardgrid')) { S.view = 'q'; renderSession(); }  // 只关答题卡
    else if (S.session) { closeSession(); }
    // 若还有浮层（例如只关掉了答题卡），重新挂上守卫，保证下一次返回仍能逐层关闭
    syncGuard();
  });


  function showSheet(html) {
    var sh = $('#sheet');
    $('.sheet-body', sh).innerHTML = html;
    sh.classList.remove('hidden');
    syncGuard();
  }
  function hideSheet() {
    var sh = $('#sheet');
    var wasOpen = !sh.classList.contains('hidden');
    sh.classList.add('hidden');
    $('.sheet-body', sh).innerHTML = '';
    if (wasOpen) syncGuard();
  }
  function confirmSheet(title, text, okText, onOk, cancelText, onCancel) {
    var html = '<h3>' + esc(title) + '</h3><div class="muted" style="margin-bottom:16px">' + esc(text) + '</div>' +
      '<button class="btn block" id="cfmOk" style="margin-bottom:10px">' + esc(okText) + '</button>' +
      '<button class="btn line block" id="cfmNo">' + esc(cancelText || '取消') + '</button>';
    showSheet(html);
    $('#cfmOk').onclick = function () { hideSheet(); if (onOk) onOk(); };
    $('#cfmNo').onclick = function () {
      hideSheet();
      if (onCancel) onCancel(); else if (cancelText === '重新开始') { }
    };
  }

  /* ================= 路由 ================= */
  function setTab(t) {
    S.tab = t;
    $$('#tabbar button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
  }
  function render() {
    var v = $('#view');
    if (S.tab === 'home') v.innerHTML = viewHome();
    else if (S.tab === 'wrong') v.innerHTML = viewWrong();
    else if (S.tab === 'right') v.innerHTML = viewRight();
    else if (S.tab === 'fav') v.innerHTML = viewFav();
    else if (S.tab === 'stats') v.innerHTML = viewStats();
    else if (S.tab === 'settings') { v.innerHTML = viewSettings(); bindSettings(v); }
    v.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* ================= 首页 ================= */
  var startCfg = { mode: 'seq', part: 0, size: 0, filter: 'all' };

  function viewHome() {
    var done = Object.keys(store.qstat).filter(function (k) { return store.qstat[k].a > 0; }).length;
    var wrongN = ALL.filter(function (q) { return stat(q.id).inWrong; }).length;
    var rightN = ALL.filter(function (q) { return stat(q.id).inRight; }).length;
    var favN = ALL.filter(function (q) { return isFav(q.id); }).length;
    var last = latestSession();
    var total = ALL.length || 1050;
    var h = '';
    h += '<div class="hero">';
    h += '<div class="t">碳核算刷题</div>';
    h += '<div class="s">2026 江苏省碳排放核算员职业技能大赛 · 共 ' + total + ' 题</div>';
    if (last) {
      h += '<button class="go" id="goLast"><span>继续上次：' + esc(last.label) + '</span>' +
        '<b>第 ' + (last.idx + 1) + '/' + last.ids.length + ' 题 ›</b></button>';
    } else {
      h += '<div class="go" style="cursor:default"><span>今天想从哪开始？</span><b>' + done + '/' + total + ' 已做</b></div>';
    }
    h += '</div>';

    h += '<div class="card"><div class="spread" style="margin-bottom:8px"><b>总体进度</b>' +
      '<span class="muted">' + done + ' / ' + total + ' · ' + pct(done, total) + '%</span></div>' +
      '<div class="bar"><i style="width:' + pct(done, total) + '%"></i></div></div>';

    h += '<div class="grid2">';
    h += tile('seq', '☰', '顺序练习', '按题库原顺序');
    h += tile('rand', '⤨', '随机练习', '打乱顺序出题');
    h += tile('exam', '判', '实操演练', '8 题 · 90 分钟 · 全真模拟');
    h += tile('ziliao', '文', '资料库', '七卷考点全文');
    h += tile('beisong', '背', '背诵', '845 张卡 · 记忆曲线');
    h += tile('part', '⛭', '专项练习', '按部分/题型刷');
    h += tile('chai', '拆', '拆题教练', '先看懂再下笔');
    h += tile('wrong', '✗', '错题本', wrongN + ' 题待复习');
    h += tile('right', '✓', '对题本', rightN + ' 题已做对');
    h += tile('fav', '★', '收藏夹', favN + ' 题已收藏');
    h += tile('stats', '▤', '学习统计', '正确率与日历');
    h += '</div>';
    h += '<div class="foot-note">数据全部保存在本机 · 建议在「设置 → 数据管理」定期导出备份</div>';
    return h;
  }
  function tile(act, ico, nm, ds) {
    return '<button class="tile" data-act="' + act + '"><span class="ico">' + ico + '</span>' +
      '<span class="nm">' + nm + '</span><span class="ds">' + esc(ds) + '</span></button>';
  }

  function openStartSheet(mode, forcePart) {
    startCfg = { mode: mode, part: forcePart || 0, size: 0, filter: 'all' };
    var html = '<h3>' + (mode === 'rand' ? '随机练习' : '顺序练习') + '</h3>';
    if (!forcePart) {
      html += rowChips('范围', 'part', [{ v: 0, t: '全部题库' }].concat([1, 2, 3, 4].map(function (p) {
        return { v: p, t: PART_NAME[p] };
      })), 0);
    }
    html += rowChips('题量', 'size', SIZE_CHOICES.map(function (s) {
      return { v: s, t: s ? s + ' 题' : '全部' };
    }), 0);
    html += rowChips('筛选', 'filter', [
      { v: 'all', t: '全部' }, { v: 'new', t: '只看未做' },
      { v: 'wrong', t: '只看错题' }, { v: 'fav', t: '只看收藏' }
    ], 'all');
    html += '<button class="btn block" id="startGo" style="margin-top:6px">开始练习</button>';
    showSheet(html);
    $('#startGo').onclick = function () {
      hideSheet();
      startSession(startCfg);
    };
  }
  function rowChips(label, key, opts, cur) {
    var h = '<div class="opt-row"><div class="lb">' + label + '</div><div class="chips" data-key="' + key + '">';
    opts.forEach(function (o) {
      h += '<button class="c' + (o.v === cur ? ' on' : '') + '" data-v="' + o.v + '">' + esc(o.t) + '</button>';
    });
    return h + '</div></div>';
  }

  /* ================= 错题本 ================= */
  var wrongFilter = 0;
  function viewWrong() {
    var list = ALL.filter(function (q) { return stat(q.id).inWrong; });
    if (wrongFilter) list = list.filter(function (q) { return q.part === wrongFilter; });
    var h = '<div class="page-title">错题本</div>';
    h += '<div class="chipbar">' + chip(0, '全部 ' + ALL.filter(function (q) { return stat(q.id).inWrong; }).length) +
      [1, 2, 3, 4].map(function (p) {
        var n = ALL.filter(function (q) { return stat(q.id).inWrong && q.part === p; }).length;
        return chip(p, PART_TYPE[p] + ' ' + n);      // 按题型筛选：单选 / 双项 / 不定项 / 判断
      }).join('') + '</div>';
    if (!list.length) {
      h += '<div class="empty">错题本是空的 🎉<br><span class="muted">答错的题目会自动收进来；连续答对 ' + WRONG_OUT_STREAK + ' 次自动移出</span></div>';
      return h;
    }
    h += '<button class="btn block" data-act="redoWrong" style="margin-bottom:12px">开始重做错题（' + list.length + ' 题）</button>';
    list.slice(0, 300).forEach(function (q) {
      var s = stat(q.id);
      h += '<div class="item" data-qid="' + q.id + '">' +
        '<div class="mt"><span class="pill r">' + TYPE_NAME[q.type] + '</span>' + labelOf(q) +
        ' · 错 ' + s.w + ' 次 · 连对 ' + s.streak + '/' + WRONG_OUT_STREAK + '</div>' +
        '<div class="stem" style="margin-top:6px">' + esc(q.stem) + '</div>' +
        '<div class="row" style="margin-top:8px;gap:8px">' +
        '<button class="btn ghost" style="min-height:36px;padding:0 12px" data-act="openOne" data-qid="' + q.id + '">查看/重做</button>' +
        '<button class="btn line" style="min-height:36px;padding:0 12px" data-act="rmWrong" data-qid="' + q.id + '">移出错题本</button>' +
        '</div></div>';
    });
    if (list.length > 300) h += '<div class="muted" style="text-align:center;padding:10px">仅显示前 300 题</div>';
    return h;
  }
  function chip(v, t) { return '<button class="chip' + (wrongFilter === v ? ' on' : '') + '" data-wf="' + v + '">' + esc(t) + '</button>'; }

  /* ================= 对题本 =================
     收录"做对的题"，可以在这里再做一遍：
       再做一遍答对 → 继续留在对题本
       再做一遍答错 → 移出对题本，自动进入错题本 */
  var rightFilter = 0;
  function viewRight() {
    var all = ALL.filter(function (q) { return stat(q.id).inRight; });
    var list = rightFilter ? all.filter(function (q) { return q.part === rightFilter; }) : all;
    var h = '<div class="page-title">对题本</div>';
    h += '<div class="chipbar">' + chipR(0, '全部 ' + all.length) +
      [1, 2, 3, 4].map(function (p) {
        var n = all.filter(function (q) { return q.part === p; }).length;
        return chipR(p, PART_TYPE[p] + ' ' + n);
      }).join('') + '</div>';
    if (!list.length) {
      h += '<div class="empty">对题本还是空的<br><span class="muted">答对的题会自动收进来；在这里重做时若答错，会移到错题本</span></div>';
      return h;
    }
    h += '<button class="btn block" data-act="redoRight" style="margin-bottom:12px">在对题本中再做一遍（' + list.length + ' 题）</button>';
    h += '<div class="muted" style="margin:-4px 2px 10px">答对继续留在对题本；答错会自动移到错题本</div>';
    list.slice(0, 300).forEach(function (q) {
      var s = stat(q.id);
      h += '<div class="item" data-qid="' + q.id + '">' +
        '<div class="mt"><span class="pill g">' + TYPE_NAME[q.type] + '</span>' + labelOf(q) +
        ' · 做对 ' + s.c + ' 次</div>' +
        '<div class="stem" style="margin-top:6px">' + esc(q.stem) + '</div>' +
        '<div class="row" style="margin-top:8px;gap:8px">' +
        '<button class="btn ghost" style="min-height:36px;padding:0 12px" data-act="openOne" data-qid="' + q.id + '">查看/重做</button>' +
        '<button class="btn line" style="min-height:36px;padding:0 12px" data-act="rmRight" data-qid="' + q.id + '">移出对题本</button>' +
        '</div></div>';
    });
    if (list.length > 300) h += '<div class="muted" style="text-align:center;padding:10px">仅显示前 300 题</div>';
    return h;
  }
  function chipR(v, t) { return '<button class="chip' + (rightFilter === v ? ' on' : '') + '" data-rf="' + v + '">' + esc(t) + '</button>'; }

  /* ================= 收藏 ================= */
  var favFilter = 'all';
  function viewFav() {
    var list = ALL.filter(function (q) { return isFav(q.id); });
    if (favFilter !== 'all') list = list.filter(function (q) { return favTags(q.id).indexOf(favFilter) >= 0; });
    var h = '<div class="page-title">收藏夹</div>';
    h += '<div class="chipbar">' + ['all'].concat(TAGS).map(function (t) {
      var n = t === 'all' ? ALL.filter(function (q) { return isFav(q.id); }).length
        : ALL.filter(function (q) { return favTags(q.id).indexOf(t) >= 0; }).length;
      return '<button class="chip' + (favFilter === t ? ' on' : '') + '" data-ff="' + t + '">' +
        (t === 'all' ? '全部' : t) + ' ' + n + '</button>';
    }).join('') + '</div>';
    if (!list.length) {
      h += '<div class="empty">还没有收藏的题<br><span class="muted">答题时点「收藏」可标记为 重点 / 疑问 / 易错</span></div>';
      return h;
    }
    h += '<button class="btn block" data-act="redoFav" style="margin-bottom:12px">开始重做收藏题（' + list.length + ' 题）</button>';
    list.slice(0, 300).forEach(function (q) {
      h += '<div class="item" data-qid="' + q.id + '">' +
        '<div class="mt">' + favTags(q.id).map(function (t) { return '<span class="pill ' + (TAG_CLS[t] || '') + '">' + t + '</span>'; }).join('') +
        '<span class="muted">' + TYPE_NAME[q.type] + ' · ' + labelOf(q) + '</span></div>' +
        '<div class="stem" style="margin-top:6px">' + esc(q.stem) + '</div>' +
        '<div class="row" style="margin-top:8px"><button class="btn ghost" style="min-height:36px;padding:0 12px" data-act="openOne" data-qid="' + q.id + '">查看/重做</button></div>' +
        '</div>';
    });
    return h;
  }

  /* ================= 统计 ================= */
  function viewStats() {
    var total = ALL.length;
    var answered = 0, cSum = 0, aSum = 0;
    Object.keys(store.qstat).forEach(function (k) {
      var s = store.qstat[k];
      if (s.a > 0) { answered++; cSum += s.c; aSum += s.a; }
    });
    var wrongN = ALL.filter(function (q) { return stat(q.id).inWrong; }).length;
    var rightN = ALL.filter(function (q) { return stat(q.id).inRight; }).length;
    var h = '<div class="page-title">学习统计</div>';

    h += '<div class="card"><div class="row" style="gap:18px">' +
      '<div style="flex:1"><div class="stat-num">' + answered + '</div><div class="muted">已做题目 / ' + total + '</div></div>' +
      '<div style="flex:1"><div class="stat-num">' + pct(cSum, aSum) + '%</div><div class="muted">总体正确率</div></div>' +
      '<div style="flex:1"><div class="stat-num">' + wrongN + '</div><div class="muted">错题待复习</div></div>' +
      '</div><div style="margin-top:12px" class="bar"><i style="width:' + pct(answered, total) + '%"></i></div>' +
      '<div class="muted" style="margin-top:6px">题库剩余 ' + (total - answered) + ' 题 · 对题本 ' + rightN + ' 题</div></div>';

    h += '<div class="card"><h2>四部分掌握度</h2>';
    [1, 2, 3, 4].forEach(function (p) {
      var qs = BYPART[p], a = 0, c = 0;
      qs.forEach(function (q) { var s = stat(q.id); a += s.a; c += s.c; });
      var an = qs.filter(function (q) { return stat(q.id).a > 0; }).length;
      h += '<div style="margin-bottom:12px"><div class="spread"><span>' + PART_NAME[p] + '</span>' +
        '<span class="muted">' + an + '/' + qs.length + ' 题 · 正确率 ' + pct(c, a) + '%</span></div>' +
        '<div class="bar" style="margin-top:5px"><i style="width:' + pct(an, qs.length) + '%"></i></div></div>';
    });
    h += '</div>';

    h += '<div class="card"><h2>答题日历（近 12 周）</h2>' + heatmap() +
      '<div class="legend"><span>少</span><i class="heat-legend" style="display:inline-block;width:11px;height:11px;border-radius:2px;background:var(--line)"></i>' +
      '<i style="display:inline-block;width:11px;height:11px;border-radius:2px;background:var(--pri);opacity:.3"></i>' +
      '<i style="display:inline-block;width:11px;height:11px;border-radius:2px;background:var(--pri);opacity:.6"></i>' +
      '<i style="display:inline-block;width:11px;height:11px;border-radius:2px;background:var(--pri)"></i><span>多</span></div></div>';

    var wrongList = ALL.filter(function (q) { return stat(q.id).inWrong; })
      .sort(function (a, b) { return stat(b.id).w - stat(a.id).w; }).slice(0, 10);
    h += '<div class="card"><h2>待复习错题 Top ' + wrongList.length + '</h2>';
    if (!wrongList.length) h += '<div class="muted">暂无错题</div>';
    wrongList.forEach(function (q) {
      h += '<div class="kv" data-act="openOne" data-qid="' + q.id + '"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        esc(q.stem.slice(0, 26)) + '</span><span class="pill r">错' + stat(q.id).w + '次</span></div>';
    });
    h += '</div>';
    h += '<div class="foot-note">题库来源：2026 年江苏省碳排放核算员职业技能大赛理论知识题库（1050 题）</div>';
    return h;
  }
  function heatmap() {
    var days = [];
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    var dow = (d.getDay() + 6) % 7;              // 周一=0
    d.setDate(d.getDate() - dow);                 // 本周一
    d.setDate(d.getDate() - 7 * 11);              // 12 周前
    var maxN = 1;
    Object.keys(store.daily).forEach(function (k) { maxN = Math.max(maxN, store.daily[k].n); });
    for (var i = 0; i < 84; i++) {
      var key = todayStr(d);
      var rec = store.daily[key] || { n: 0, c: 0 };
      days.push({ key: key, n: rec.n });
      d.setDate(d.getDate() + 1);
    }
    var h = '<div class="heat">';
    days.forEach(function (x) {
      var cls = '';
      if (x.n > 0) {
        var r = x.n / maxN;
        cls = r <= .25 ? 'l1' : r <= .5 ? 'l2' : r <= .8 ? 'l3' : 'l4';
      }
      h += '<i class="' + cls + '" title="' + x.key + '：' + x.n + ' 题"></i>';
    });
    return h + '</div>';
  }

  /* ================= 设置 ================= */
  function viewSettings() {
    var st = store.settings;
    function sw(id, label, desc, on) {
      return '<div class="sw"><div><div class="lb">' + label + '</div><div class="ds">' + desc + '</div></div>' +
        '<button class="toggle' + (on ? ' on' : '') + '" data-set="' + id + '"></button></div>';
    }
    var h = '<div class="page-title">设置</div>';
    h += '<div class="card"><h2>答题</h2>' +
      sw('shuffle', '选项乱序', '打乱 A/B/C/D 顺序，防止记位置', st.shuffle) +
      sw('instant', '立即判分', '关闭后做完一轮再统一对答案', st.instant) +
      sw('source', '显示题号与来源', '如“第三部分·第 12 题”', st.source) +
      sw('showWrong', '显示每题历史错次', '答完后提示该题错过几次', st.showWrong) +
      sw('vibrate', '震动反馈', '答对/答错时轻微震动', st.vibrate) +
      '</div>';

    h += '<div class="card"><h2>外观</h2>' +
      segRow('theme', '主题', [{ v: 'light', t: '浅色' }, { v: 'dark', t: '深色' }], st.theme) +
      segRow('font', '字号', [{ v: 'sm', t: '小' }, { v: 'md', t: '中' }, { v: 'lg', t: '大' }, { v: 'xl', t: '特大' }], st.font) +
      '</div>';

    h += '<div class="card"><h2>数据管理</h2>' +
      '<button class="btn ghost block" data-act="export" style="margin-bottom:10px">导出备份到文件</button>' +
      '<button class="btn line block" data-act="import" style="margin-bottom:10px">从备份文件恢复</button>' +
      '<button class="btn line block" data-act="resetPart" style="margin-bottom:10px">重置某一部分的进度</button>' +
      '<button class="btn line block" data-act="clearWrong" style="margin-bottom:10px">清空错题（保留收藏与对题本）</button>' +
      '<button class="btn line block" data-act="clearRight" style="margin-bottom:10px">清空对题本（保留错题与收藏）</button>' +
      '<button class="btn danger block" data-act="clearAll">全部清空</button>' +
      '<div class="muted" style="margin-top:10px;line-height:1.8">数据只保存在这台手机上。清理浏览器数据、卸载浏览器或换手机都会丢失进度，建议每隔一段时间导出一次备份。</div>' +
      '</div>';

    h += '<div class="card"><h2>关于</h2>' +
      '<div class="kv"><span>题库</span><span class="muted">1050 题（单选 315 / 双项 315 / 不定项 157 / 判断 263）</span></div>' +
      '<div class="kv"><span>版本</span><span class="muted">v﻿1.7.4</span></div>' +
      '<div class="kv"><span>解析</span><span class="muted">考点与权威依据分批补充中</span></div>' +
      '<div class="muted" style="margin-top:10px;line-height:1.8">本 App 为个人备考自用工具，题库版权归原编制单位，请勿公开传播。</div>' +
      '</div>';
    return h;
  }
  function segRow(key, label, opts, cur) {
    return '<div class="sw"><div class="lb">' + label + '</div><div class="seg" data-seg="' + key + '">' +
      opts.map(function (o) {
        return '<button class="c' + (o.v === cur ? ' on' : '') + '" data-v="' + o.v + '">' + o.t + '</button>';
      }).join('') + '</div></div>';
  }

  /* ================= 答题界面 ================= */
  function renderSession() {
    var s = S.session;
    if (!s) return;
    var el = $('#session');
    el.classList.remove('hidden');
    if (S.view === 'result') { el.innerHTML = resultHTML(); bindSession(el); return; }

    var q = QBYID[s.ids[s.idx]];
    var rec = s.ans[q.id];
    var reveal = store.settings.instant || s.revealed;
    var disp = s.perm[q.id] || q.options.map(function (_, i) { return i; });
    var choices = dispChoices(q, disp);
    var corr = correctPos(q, disp);
    var pick = (rec ? rec.sel : (s.pick[q.id] || []));
    var answered = !!rec;
    var showRes = answered && reveal;
    var st = stat(q.id);
    var doneN = answeredCount(s), okN = correctCount(s);

    var h = '';
    h += '<div class="sess-top">' +
      '<button id="sessBack">‹ 退出</button>' +
      '<div class="title">' + esc(s.label) + '</div>' +
      '<button id="sessCard" class="strong">答题卡</button>' +
      '</div>';
    h += '<div class="sess-body">';
    h += '<div class="progress" style="margin-bottom:10px"><div class="bar"><i style="width:' +
      (s.ids.length ? Math.round((s.idx + 1) / s.ids.length * 100) : 0) + '%"></i></div></div>';
    h += '<div class="qmeta">第 ' + (s.idx + 1) + '/' + s.ids.length + ' 题';
    if (store.settings.source) h += ' · ' + TYPE_NAME[q.type] + ' · ' + labelOf(q);
    h += ' · 已答 ' + doneN + ' · 正确 ' + okN + '</div>';

    h += '<div class="stem">' + esc(q.stem) + '</div>';

    if (q.type === 'double' || q.type === 'multi') {
      h += '<div class="muted" style="margin-bottom:8px">' +
        (q.type === 'double' ? '本题恰有 2 个正确选项，选好后点「确认作答」' : '本题有 2 个及以上正确选项，选好后点「确认作答」') +
        '</div>';
    }

    var isJudge = (q.type === 'judge');
    if (isJudge) h += '<div class="judge-grid">';
    choices.forEach(function (text, pos) {
      var cls = ['opt'];
      if (isJudge) cls.push('judge-opt');          // 判断题：√ / × 两个大按钮，不带 A/B 字母
      if (pick.indexOf(pos) >= 0) cls.push('sel');
      if (showRes && corr.indexOf(pos) >= 0) cls.push('ok');
      if (showRes && pick.indexOf(pos) >= 0 && corr.indexOf(pos) < 0) cls.push('bad');
      h += '<button class="' + cls.join(' ') + '" data-pos="' + pos + '"' + (answered ? ' disabled' : '') + '>' +
        (isJudge ? '' : '<b>' + LETTERS[pos] + '</b>') +
        '<span>' + esc(text) + '</span></button>';
    });
    if (isJudge) h += '</div>';

    if (showRes) {
      h += '<div class="verdict ' + (rec.ok ? 'ok' : 'bad') + '">' +
        (rec.ok ? '✅ 回答正确' : '❌ 回答错误') +
        '　正确答案：' + corr.map(function (p) { return LETTERS[p]; }).join('') +
        (store.settings.showWrong && st.w > 0 ? '　（本题累计错过 ' + st.w + ' 次）' : '') +
        '</div>';
    } else if (answered) {
      h += '<div class="verdict" style="background:var(--pri-soft);color:var(--pri)">已作答，本轮结束后统一对答案</div>';
    }

    if (answered) {
      var ex = q.explanation || '';
      h += '<div class="explain"><div class="hd" id="exHd"><span>看解析与依据</span><span>▾</span></div>' +
        '<div class="bd hidden" id="exBd">' + explainHTML(q) + '</div></div>';
    }

    h += '<div class="tagrow">' + TAGS.map(function (t) {
      return '<button class="tag ' + TAG_CLS[t] + (favTags(q.id).indexOf(t) >= 0 ? ' on' : '') +
        '" data-tag="' + t + '">' + t + '</button>';
    }).join('') + '</div>';

    if (answered) {
      h += '<div style="margin-top:14px"><button class="btn line block" id="redoOne">重做本题（清除本题记录）</button></div>';
    }
    h += '</div>';

    h += '<div class="sess-foot">';
    h += '<button class="btn line" id="prevQ" style="flex:1"' + (s.idx === 0 ? ' disabled' : '') + '>上一题</button>';
    if ((q.type === 'double' || q.type === 'multi') && !answered) {
      h += '<button class="btn" id="confirmAns" style="flex:2"' + (pick.length ? '' : ' disabled') + '>确认作答' +
        (pick.length ? '（已选 ' + pick.length + ' 项）' : '') + '</button>';
    } else {
      h += '<button class="btn" id="nextQ" style="flex:2">' + (s.idx === s.ids.length - 1 ? '完成本轮' : '下一题') + '</button>';
    }
    h += '</div>';

    el.innerHTML = h;
    bindSession(el);
  }
  function explainHTML(q) {
    if (q.explanation) {
      var h = '<div>' + nl2br(esc(q.explanation)) + '</div>';
      if (q.basis) {
        var b = Array.isArray(q.basis) ? q.basis : [q.basis];
        h += '<div class="ref"><b>权威依据</b><br>' + b.map(function (x) { return '· ' + esc(x); }).join('<br>') + '</div>';
      }
      if (q.source) {
        var s = Array.isArray(q.source) ? q.source : [q.source];
        h += '<div class="ref"><b>来源</b><br>' + s.map(function (x) { return '· ' + esc(x); }).join('<br>') + '</div>';
      }
      return h;
    }
    return '<div class="muted">本题解析与权威依据正在分批补充中（计划按四个部分依次补全 1050 题）。</div>';
  }
  function nl2br(s) { return String(s).replace(/\n/g, '<br>'); }

  function resultHTML() {
    var s = S.session;
    var okN = correctCount(s), n = s.ids.length, done = answeredCount(s);
    var h = '<div class="sess-top"><button id="sessBack">‹ 退出</button><div class="title">本轮结果</div><span style="width:64px"></span></div>';
    h += '<div class="sess-body">';
    h += '<div class="card" style="text-align:center">' +
      '<div class="stat-num" style="font-size:40px">' + pct(okN, n) + '%</div>' +
      '<div class="muted">正确 ' + okN + ' / ' + n + ' 题' + (done < n ? '（未答 ' + (n - done) + ' 题）' : '') + '</div></div>';
    h += '<div class="card"><h2>逐题回顾</h2>';
    s.ids.forEach(function (id, i) {
      var q = QBYID[id], a = s.ans[id];
      var cls = !a ? '' : (a.ok ? 'ok' : 'bad');
      var mark = !a ? '未答' : (a.ok ? '✓' : '✗');
      h += '<div class="kv" data-jump="' + i + '"><span style="flex:0 0 34px" class="muted">' + (i + 1) + '</span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(q.stem.slice(0, 24)) + '</span>' +
        '<span class="pill ' + (cls === 'ok' ? 'g' : cls === 'bad' ? 'r' : '') + '">' + mark + '</span></div>';
    });
    h += '</div>';
    h += '<button class="btn block" id="againBtn" style="margin-bottom:10px">再练一轮</button>';
    h += '</div>';
    return h;
  }

  function bindSession(el) {
    var s = S.session;
    if (!s) return;
    var back = $('#sessBack', el); if (back) back.onclick = closeSession;
    var cardBtn = $('#sessCard', el); if (cardBtn) cardBtn.onclick = openCard;

    $$('.opt', el).forEach(function (b) {
      b.onclick = function () {
        var q = QBYID[s.ids[s.idx]];
        if (s.ans[q.id]) return;
        var pos = parseInt(b.dataset.pos, 10);
        if (q.type === 'double' || q.type === 'multi') {
          var arr = (s.pick[q.id] || []).slice();
          var i = arr.indexOf(pos);
          if (i >= 0) arr.splice(i, 1); else arr.push(pos);
          arr.sort(function (a, b2) { return a - b2; });
          s.pick[q.id] = arr;
          save();
          renderSession();
        } else {
          var one = [pos];
          s.pick[q.id] = one;
          submitAnswer(q, one);
        }
      };
    });
    var cf = $('#confirmAns', el);
    if (cf) cf.onclick = function () {
      var q = QBYID[s.ids[s.idx]];
      submitAnswer(q, (s.pick[q.id] || []).slice());
    };
    var pv = $('#prevQ', el);
    if (pv) pv.onclick = function () { if (s.idx > 0) { s.idx--; save(); renderSession(); } };
    var nx = $('#nextQ', el);
    if (nx) nx.onclick = function () {
      if (!s.ans[s.ids[s.idx]] && !store.settings.instant) { s.pick[s.ids[s.idx]] = s.pick[s.ids[s.idx]] || []; }
      if (s.idx >= s.ids.length - 1) { s.revealed = true; s.finished = true; save(); openResult(); return; }
      s.idx++; save(); renderSession();
    };
    var exHd = $('#exHd', el);
    if (exHd) exHd.onclick = function () { $('#exBd', el).classList.toggle('hidden'); };

    $$('[data-tag]', el).forEach(function (b) {
      b.onclick = function () {
        var q = QBYID[s.ids[s.idx]];
        toggleFav(q.id, b.dataset.tag);
        renderSession();
      };
    });
    var ro = $('#redoOne', el);
    if (ro) ro.onclick = function () {
      var q = QBYID[s.ids[s.idx]];
      confirmSheet('重做本题', '将清除这道题的作答记录与错题状态（收藏保留）。', '确定', function () {
        resetQuestion(q.id); renderSession(); toast('已清除本题记录');
      });
    };
    var ab = $('#againBtn', el);
    if (ab) ab.onclick = function () {
      var s2 = S.session;
      S.session = createSession({ mode: s2.mode, part: s2.part, size: s2.size, filter: s2.filter });
      S.view = 'q'; renderSession();
    };
    $$('[data-jump]', el).forEach(function (r) {
      r.onclick = function () { s.idx = parseInt(r.dataset.jump, 10); S.view = 'q'; renderSession(); };
    });
  }
  function openResult() { S.view = 'result'; renderSession(); }

  /* ================= 答题卡 ================= */
  function openCard() {
    var s = S.session;
    var h = '<div class="sess-top"><button id="cardBack">‹ 返回</button><div class="title">答题卡</div>' +
      '<button id="cardEnd" class="strong">结束本轮</button></div>';
    h += '<div class="cardgrid">';
    s.ids.forEach(function (id, i) {
      var a = s.ans[id];
      var cls = ['cell'];
      if (a) cls.push(a.ok ? 'ok' : 'bad');
      if (i === s.idx) cls.push('cur');
      if (isFav(id)) cls.push('star');
      h += '<button class="' + cls.join(' ') + '" data-jump2="' + i + '">' + (i + 1) + '</button>';
    });
    h += '</div><div class="legend"><span>绿=答对</span><span>红=答错</span><span>★=已收藏</span><span>灰=未做</span></div>';
    var el = $('#session');
    el.innerHTML = h;
    $('#cardBack').onclick = function () { renderSession(); };
    $('#cardEnd').onclick = function () {
      var s2 = S.session;
      var un = s2.ids.length - answeredCount(s2);
      if (un > 0) {
        confirmSheet('结束本轮', '还有 ' + un + ' 题未作答，确定结束并查看结果吗？', '结束并看结果', function () {
          s2.revealed = true; s2.finished = true; save(); openResult();
        });
      } else { s2.revealed = true; s2.finished = true; save(); openResult(); }
    };
    $$('[data-jump2]', el).forEach(function (b) {
      b.onclick = function () { s.idx = parseInt(b.dataset.jump2, 10); S.view = 'q'; save(); renderSession(); };
    });
  }

  /* ================= 单个题目查看（错题/收藏入口） ================= */
  function openSingle(qid) {
    var key = 'single';
    var s = {
      key: key, mode: 'single', part: 0, size: 0, filter: 'all', label: '单题查看',
      ids: [qid], idx: 0, perm: {}, pick: {}, ans: {}, revealed: true, ts: Date.now()
    };
    if (store.settings.shuffle) {
      var q = QBYID[qid];
      if (q.type !== 'judge') {
        var p = q.options.map(function (_, i) { return i; });
        s.perm[qid] = shuffleArr(p);
      }
    }
    S.session = s; S.view = 'q';
    renderSession();
    syncGuard();
  }

  /* ================= 设置项交互 ================= */
  function applySettings() {
    document.documentElement.setAttribute('data-theme', store.settings.theme);
    document.documentElement.setAttribute('data-font', store.settings.font);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', store.settings.theme === 'dark' ? '#0e1620' : '#0f766e');
  }

  /* 选项乱序开关改变后，立刻作用到「未完成会话中还没作答的题」。
     已作答的题保持原有映射不动——否则 recorded 的选项位置会对不上，颜色/判分会错乱。 */
  function reshuffleSessions() {
    var changed = 0;
    Object.keys(store.sessions).forEach(function (k) {
      var s = store.sessions[k];
      if (!s || !s.ids || s.finished) return;
      s.ids.forEach(function (id) {
        if (s.ans && s.ans[id]) return;                 // 已作答：保持原映射
        var q = QBYID[id];
        if (!q || q.type === 'judge') return;
        var identity = q.options.map(function (_, i) { return i; });
        if (store.settings.shuffle) {
          var np = shuffleArr(identity.slice());
          // 4 个选项时有 1/24 概率恰好与原序相同，会让人以为"没生效"；再打乱一次
          if (np.length > 1 && np.join() === identity.join()) np = shuffleArr(identity.slice());
          if ((s.perm[id] || []).join() !== np.join()) { s.perm[id] = np; changed++; }
        } else if (s.perm[id]) {
          delete s.perm[id]; changed++;                 // 关掉乱序 → 恢复原题顺序
        }
      });
    });
    if (changed) save();
    return changed;
  }

  function bindSettings(v) {
    $$('[data-set]', v).forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.set;
        store.settings[k] = !store.settings[k];
        if (k === 'shuffle') {
          var n = reshuffleSessions();
          if (S.session) renderSession();
          save(); render();
          toast(store.settings[k]
            ? '已开启选项乱序' + (n ? '（未作答的 ' + n + ' 题已重新打乱）' : '')
            : '已关闭选项乱序' + (n ? '（未作答的 ' + n + ' 题已恢复原顺序）' : ''));
          return;
        }
        save(); render();
      };
    });
    $$('[data-seg]', v).forEach(function (seg) {
      var k = seg.dataset.seg;
      $$('.c', seg).forEach(function (b) {
        b.onclick = function () {
          store.settings[k] = b.dataset.v;
          save(); applySettings(); render();
        };
      });
    });
    // 注意：[data-act] 统一由 #view 的事件委托处理，此处不再重复绑定，避免动作执行两次
  }

  function doAction(act, qid) {
    if (act === 'export') exportBackup();
    else if (act === 'import') importBackup();
    else if (act === 'clearWrong') {
      confirmSheet('清空错题', '将把所有题目移出错题本（收藏保留，作答记录保留）。', '确定清空', function () {
        Object.keys(store.qstat).forEach(function (k) { store.qstat[k].inWrong = false; store.qstat[k].streak = 0; });
        saveNow(); render(); toast('错题已清空');
      });
    } else if (act === 'clearRight') {
      confirmSheet('清空对题本', '将把所有题目移出对题本（错题与收藏保留，作答记录保留）。', '确定清空', function () {
        Object.keys(store.qstat).forEach(function (k) { store.qstat[k].inRight = false; });
        saveNow(); render(); toast('对题本已清空');
      });
    } else if (act === 'clearAll') {
      confirmSheet('全部清空', '将删除全部作答记录、错题、收藏与进度，且无法恢复。', '确认全部清空', function () {
        confirmSheet('最后确认', '真的要清空所有数据吗？此操作不可撤销。', '确认清空', function () {
          var keepSettings = store.settings;
          store = defaultStore();
          store.settings = keepSettings;      // 清空进度但保留你的偏好设置
          saveNow(); applySettings(); render(); toast('已全部清空');
        });
      });
    } else if (act === 'resetPart') {
      var html = '<h3>重置某一部分进度</h3><div class="muted" style="margin-bottom:14px">将清除该部分所有题目的作答记录与错题状态（收藏保留）。</div><div class="chips">' +
        [1, 2, 3, 4].map(function (p) { return '<button class="c" data-rp="' + p + '">' + PART_NAME[p] + '</button>'; }).join('') + '</div>';
      showSheet(html);
      $$('[data-rp]').forEach(function (b) {
        b.onclick = function () {
          var p = parseInt(b.dataset.rp, 10);
          hideSheet();
          confirmSheet('重置确认', '将重置「' + PART_NAME[p] + '」的 ' + BYPART[p].length + ' 道题记录。', '确定重置', function () {
            BYPART[p].forEach(function (q) { delete store.qstat[q.id]; });
            Object.keys(store.sessions).forEach(function (k) { delete store.sessions[k]; });
            saveNow(); render(); toast('已重置');
          });
        };
      });
    }
  }

  function exportBackup() {
    try {
      var blob = new Blob([JSON.stringify(store)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '碳核算刷题-备份-' + todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      toast('备份已导出到「下载」目录');
    } catch (e) { toast('导出失败，请用 Chrome 打开'); }
  }
  function importBackup() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var o = JSON.parse(r.result);
          if (!o || typeof o !== 'object' || !o.qstat) throw new Error('bad');
          confirmSheet('恢复备份', '将用备份文件覆盖当前全部进度、错题与收藏。', '确定恢复', function () {
            store = o; normalizeStore(); saveNow(); applySettings(); render(); toast('备份已恢复');
          });
        } catch (e) { toast('这个文件不是有效的备份'); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  /* ================= 事件绑定 ================= */
  function bindGlobal() {
    $$('#tabbar button').forEach(function (b) {
      b.onclick = function () { setTab(b.dataset.tab); render(); };
    });

    $('#view').addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act],[data-wf],[data-ff],[data-rf]') : null;
      if (!t) return;
      if (t.dataset.wf !== undefined) { wrongFilter = t.dataset.wf === 'all' ? 0 : parseInt(t.dataset.wf, 10); render(); return; }
      if (t.dataset.rf !== undefined) { rightFilter = t.dataset.rf === 'all' ? 0 : parseInt(t.dataset.rf, 10); render(); return; }
      if (t.dataset.ff !== undefined) { favFilter = t.dataset.ff; render(); return; }
      var act = t.dataset.act;
      if (act === 'seq' || act === 'rand') openStartSheet(act);
      else if (act === 'part') openPartSheet();
      else if (act === 'exam') {
        /* 单文件离线版（碳核算刷题.html）不含独立实操页，点了会 404 —— 明确告知，不给死链 */
        if (window.QUESTION_DATA) { toast('实操演练在 PWA 版里（单文件版不含这一页）'); }
        else { location.href = 'exam.html'; }
      }
      else if (act === 'chai') { location.href = 'chai.html'; }
      else if (act === 'ziliao') {
        if (window.QUESTION_DATA) { toast('资料库在 PWA 版里（单文件版不含这一页）'); }
        else { location.href = 'ziliao.html'; }
      }
      else if (act === 'beisong') {
        if (window.QUESTION_DATA) { toast('背诵在 PWA 版里（单文件版不含这一页）'); }
        else { location.href = 'beisong.html'; }
      }
      else if (act === 'wrong') { setTab('wrong'); render(); }
      else if (act === 'right') { setTab('right'); render(); }
      else if (act === 'fav') { setTab('fav'); render(); }
      else if (act === 'stats') { setTab('stats'); render(); }
      else if (act === 'redoWrong') startSession({ mode: 'wrong', size: 0, filter: 'all' });
      else if (act === 'redoRight') startSession({ mode: 'right', size: 0, filter: 'all' });
      else if (act === 'redoFav') startSession({ mode: 'fav', size: 0, filter: 'all' });
      else if (act === 'openOne') openSingle(t.dataset.qid);
      else if (act === 'rmWrong') { removeFromWrong(t.dataset.qid); render(); toast('已移出错题本'); }
      else if (act === 'rmRight') { removeFromRight(t.dataset.qid); render(); toast('已移出对题本'); }
      else if (act === 'export' || act === 'import' || act === 'clearWrong' || act === 'clearRight' ||
        act === 'clearAll' || act === 'resetPart') doAction(act, t.dataset.qid);
    });

    $('#view').addEventListener('click', function (e) {
      var g = e.target.closest ? e.target.closest('#goLast') : null;
      if (g) { var last = latestSession(); if (last) openSession(last.key); }
    });

    $('#sheet').addEventListener('click', function (e) {
      if (e.target.classList && e.target.classList.contains('sheet-mask')) { hideSheet(); return; }
      var c = e.target.closest ? e.target.closest('.chips .c') : null;
      if (c && c.parentNode.dataset.key) {
        var key = c.parentNode.dataset.key;
        var raw = c.dataset.v;
        var val = (key === 'filter') ? raw : (raw === 'all' ? 0 : parseInt(raw, 10));
        startCfg[key] = val;
        $$('.c', c.parentNode).forEach(function (x) { x.classList.remove('on'); });
        c.classList.add('on');
      }
    });
  }

  function openPartSheet() {
    var html = '<h3>专项练习 · 选择部分</h3><div class="muted" style="margin-bottom:12px">选一个部分（题型）单独刷</div>';
    [1, 2, 3, 4].forEach(function (p) {
      var n = BYPART[p].length;
      var an = BYPART[p].filter(function (q) { return stat(q.id).a > 0; }).length;
      html += '<button class="btn line block" data-p="' + p + '" style="margin-bottom:10px;justify-content:space-between">' +
        '<span>' + PART_NAME[p] + '</span><span class="muted">' + an + '/' + n + '</span></button>';
    });
    showSheet(html);
    $$('[data-p]').forEach(function (b) {
      b.onclick = function () { hideSheet(); openStartSheet('seq', parseInt(b.dataset.p, 10)); };
    });
  }

  /* ================= 启动 ================= */
  function boot() {
    if (!checkStorage()) storageFail();
    loadStore();
    applySettings();
    loadQuestionData().then(function (d) {
      indexData(d);
      setTab('home');
      render();
      bindGlobal();
      if (storeBroken) storeCorruptFail(brokenKeepKey || '（未能另存）');
      if (sessionsPruned) {
        showBanner('⚠️ 题库已更新，有 ' + sessionsPruned + ' 道题的旧进度已无法对应，已自动调整。', 'pruneClose');
      }
      if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
        try {
          navigator.serviceWorker.register('sw.js').then(function (reg) {
            // 从桌面图标打开时浏览器不会主动查更新，这里在「回到前台 / 获得焦点」时主动查一次
            var checkUpdate = function () { try { if (reg && reg.update) reg.update(); } catch (e) { } };
            document.addEventListener('visibilitychange', function () { if (!document.hidden) checkUpdate(); });
            window.addEventListener('focus', checkUpdate);
          }).catch(function () { });
          // 首次安装时新 SW 接管也会触发 controllerchange，那不算「更新」，要区分开
          var hadController = !!navigator.serviceWorker.controller;
          if (navigator.serviceWorker.addEventListener) {
            navigator.serviceWorker.addEventListener('controllerchange', function () {
              if (!hadController) { hadController = true; return; }
              showBanner('🚀 <b>已更新到新版本</b>（当前仍在使用旧版本）。点右侧按钮刷新即可用上最新版，进度不会丢。',
                'updateBtn', '刷新', function () { location.reload(); });
            });
          }
        } catch (e) { }
      }
    }).catch(function (e) {
      $('#view').innerHTML = '<div class="empty">题库加载失败：' + esc(e.message) +
        '<br><span class="muted">如果是单文件版，请确认文件完整；如果是 PWA 版，请确认 data/questions.json 已一起上传。</span></div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
