/* 资料库 — 把六份学习资料装进 App（离线可读）
   数据来自 data/ziliao.json（由 tools/build_ziliao.py 从 Markdown 编译而来）。 */
(function () {
  'use strict';

  var LS = 'ths_zl_v1';
  var THEME_LS = 'ths_store_v1';
  var state = { vol: null, read: {}, hits: [], q: '', scope: 'all', font: null };
  var data = null;
  var idx = [];          // 全文检索索引
  var pendingJump = null; // 深链待跳转

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // 行内标记：**粗**、`代码`、[文字](链接)
  function inl(s) {
    var h = esc(s);
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/\[([^\]]{1,60})\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return h;
  }
  function plain(b) {
    if (b.t === 'h' || b.t === 'p' || b.t === 'quote' || b.t === 'code') return b.x;
    if (b.t === 'ul' || b.t === 'ol') return b.items.join(' ');
    if (b.t === 'table') return b.head.join(' ') + ' ' + b.rows.map(function (r) { return r.join(' '); }).join(' ');
    return '';
  }

  var toastEl = $('#toast'), tTimer = null;
  function toast(m) {
    toastEl.textContent = m;
    toastEl.hidden = false;
    clearTimeout(tTimer);
    tTimer = setTimeout(function () { toastEl.hidden = true; }, 2000);
  }

  function applyTheme() {
    try {
      var raw = localStorage.getItem(THEME_LS);
      if (!raw) return;
      var st = (JSON.parse(raw).settings) || {};
      document.documentElement.setAttribute('data-theme', st.theme === 'dark' ? 'dark' : 'light');
      var f = st.font || 'md';
      if (['sm', 'md', 'lg', 'xl'].indexOf(f) < 0) f = 'md';
      document.documentElement.setAttribute('data-font', f);
    } catch (e) { /* 用默认 */ }
  }
  // 资料库可以单独调字号（只影响本页，不写回主 App 的设置）
  var FONTS = [['sm', '小'], ['md', '中'], ['lg', '大'], ['xl', '特大']];
  function applyOwnFont() {
    if (!state.font) return;
    document.documentElement.setAttribute('data-font', state.font);
    var lab = '中';
    FONTS.forEach(function (f) { if (f[0] === state.font) lab = f[1]; });
    var btn = $('#fs');
    if (btn) btn.textContent = '字号：' + lab;
  }

  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(LS) || '{}');
      if (o && typeof o === 'object') {
        if (o.read && typeof o.read === 'object') state.read = o.read;
        if (o.vol) state.vol = o.vol;
        if (o.font && FONTS.some(function (f) { return f[0] === o.font; })) state.font = o.font;
      }
    } catch (e) { /* 忽略 */ }
  }
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(LS, JSON.stringify({ vol: state.vol, read: state.read, font: state.font }));
      } catch (e) {}
    }, 200);
  }
  window.addEventListener('pagehide', function () {
    try { localStorage.setItem(LS, JSON.stringify({ vol: state.vol, read: state.read, font: state.font })); }
    catch (e) {}
  });

  function volById(id) {
    return data.vols.filter(function (v) { return v.id === id; })[0] || data.vols[0];
  }

  /* ---------- 顶部：卷 + 进度 ---------- */
  function renderChips() {
    var h = '';
    data.vols.forEach(function (v) {
      h += '<button data-v="' + v.id + '"' + (v.id === state.vol ? ' class="on"' : '') + '>' +
        (state.read[v.id] ? '<span class="dot"></span>' : '') + esc(v.title) + '</button>';
    });
    $('#volchips').innerHTML = h;
    var done = data.vols.filter(function (v) { return state.read[v.id]; }).length;
    $('#bar i').style.width = Math.round(done / data.vols.length * 100) + '%';
    $('#sub').textContent = data.vols.length + ' 卷 · ' + data.total_blocks + ' 段 · 已读 ' + done + '/' + data.vols.length;
  }

  /* ---------- 正文 ---------- */
  function renderBlock(b, i) {
    var id = 'b' + i;
    if (b.t === 'h') return '<div class="blk" id="' + id + '"><h' + b.l + '>' + inl(b.x) + '</h' + b.l + '></div>';
    if (b.t === 'p') return '<div class="blk" id="' + id + '"><p>' + inl(b.x) + '</p></div>';
    if (b.t === 'quote') return '<div class="blk" id="' + id + '"><blockquote>' + inl(b.x) + '</blockquote></div>';
    if (b.t === 'code') return '<div class="blk" id="' + id + '"><div class="code">' + esc(b.x) + '</div></div>';
    if (b.t === 'hr') return '<div class="blk" id="' + id + '"><hr></div>';
    if (b.t === 'ul' || b.t === 'ol') {
      var tag = b.t;
      return '<div class="blk" id="' + id + '"><' + tag + '>' +
        b.items.map(function (x) { return '<li>' + inl(x) + '</li>'; }).join('') +
        '</' + tag + '></div>';
    }
    if (b.t === 'table') {
      var h = '<div class="blk" id="' + id + '"><div class="tw"><table><thead><tr>';
      b.head.forEach(function (c) { h += '<th>' + inl(c) + '</th>'; });
      h += '</tr></thead><tbody>';
      b.rows.forEach(function (r) {
        h += '<tr>' + r.map(function (c) { return '<td>' + inl(c) + '</td>'; }).join('') + '</tr>';
      });
      h += '</tbody></table></div></div>';
      return h;
    }
    return '';
  }

  function renderVolume(scrollTo) {
    var v = volById(state.vol);
    state.vol = v.id;
    var hasTable = v.blocks.some(function (b) { return b.t === 'table'; });
    var h = '';
    h += '<div class="volhead"><div class="vn">' + esc(v.full || v.title) + '</div>' +
      '<div class="vd">' + esc(v.desc) + '</div>' +
      '<div class="vm"><span>' + esc(v.tag) + '</span><span>' + v.blocks.length + ' 段</span>' +
      (hasTable ? '<span>表格可左右滑</span>' : '') +
      '<span>' + (state.read[v.id] ? '已读 ✓' : '未读完') + '</span></div></div>';

    // 目录（只到三级标题）
    var toc = [];
    v.blocks.forEach(function (b, i) {
      if (b.t === 'h' && b.l <= 3) toc.push({ i: i, l: b.l, x: b.x });
    });
    if (toc.length) {
      h += '<details id="toc"' + (toc.length <= 10 ? ' open' : '') + '><summary>目录（' + toc.length + ' 节）</summary>';
      toc.forEach(function (t) {
        h += '<div class="ti l' + t.l + '" data-h="' + t.i + '">' + inl(t.x) + '</div>';
      });
      h += '</details>';
    }

    h += '<div id="body">';
    v.blocks.forEach(function (b, i) { h += renderBlock(b, i); });
    h += '</div>';

    var pos = data.vols.indexOf(v);
    h += '<div class="footnav">' +
      '<button class="btn ghost" data-c="prev"' + (pos <= 0 ? ' disabled' : '') + '>上一卷</button>' +
      '<button class="btn" data-c="read">' + (state.read[v.id] ? '取消已读' : '标记本卷已读') + '</button>' +
      '<button class="btn ghost" data-c="next"' + (pos >= data.vols.length - 1 ? ' disabled' : '') + '>下一卷</button>' +
      '</div>';
    $('#pane').innerHTML = h;
    renderChips();

    if (scrollTo !== undefined && scrollTo !== null) {
      var el = document.getElementById('b' + scrollTo);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        el.classList.add('hitflash');
        setTimeout(function () { el.classList.remove('hitflash'); }, 1700);
      }
    } else {
      window.scrollTo(0, 0);
    }
    save();
  }

  /* ---------- 全文检索 ---------- */
  function buildIndex() {
    idx = [];
    data.vols.forEach(function (v) {
      v.blocks.forEach(function (b, i) {
        var t = plain(b);
        if (t && t.trim()) idx.push({ v: v.id, vt: v.title, i: i, t: t, head: b.t === 'h' });
      });
    });
  }

  function doSearch(q) {
    state.q = q;
    q = (q || '').trim();
    if (q.length < 2) { $('#results').innerHTML = ''; return; }
    var ql = q.toLowerCase();
    var pool = state.scope === 'vol'
      ? idx.filter(function (it) { return it.v === state.vol; })
      : idx;
    var hits = [];
    for (var k = 0; k < pool.length; k++) {
      var it = pool[k];
      var pos = it.t.toLowerCase().indexOf(ql);
      if (pos < 0) continue;
      // 标题命中优先于正文命中
      hits.push({ v: it.v, vt: it.vt, i: it.i, head: it.head, pos: pos, t: it.t });
    }
    hits.sort(function (a, b) {
      if (a.head !== b.head) return a.head ? -1 : 1;
      if (a.v !== b.v) return a.v < b.v ? -1 : 1;
      return a.i - b.i;
    });
    hits = hits.slice(0, 40);
    state.hits = hits;
    var h = '';
    if (!hits.length) {
      h = '<div id="empty">没找到「' + esc(q) + '」' +
        (state.scope === 'vol' ? '（当前只搜本卷，可切到「全部卷」）' : '') +
        '。换个关键词试试，比如 <b>取舍准则</b>、<b>32151</b>、<b>绿证</b>。</div>';
    } else {
      h = '<div id="empty" style="background:transparent;padding:0 0 8px;text-align:left">找到 ' + hits.length +
        ' 处' + (state.scope === 'vol' ? '（仅本卷）' : '') + '，点一条跳过去</div>';
      hits.forEach(function (x, n) {
        h += '<div class="hit" data-hit="' + n + '"><div class="hv">' + esc(x.vt) +
          ' · 第 ' + (x.i + 1) + ' 段' + (x.head ? ' · 标题' : '') + '</div>' +
          '<div class="ht">' + snippet(x.t, q, x.pos) + '</div></div>';
      });
    }
    $('#results').innerHTML = h;
  }

  // 片段里把命中的词标黄（先转义再拼 <mark>，避免把内容当 HTML）
  function snippet(text, q, pos) {
    pos = (pos === undefined || pos < 0) ? text.toLowerCase().indexOf(q.toLowerCase()) : pos;
    if (pos < 0) return esc(text.slice(0, 60)) + '…';
    var from = Math.max(0, pos - 26);
    var to = Math.min(text.length, pos + q.length + 40);
    return esc((from > 0 ? '…' : '') + text.slice(from, pos)) +
      '<mark>' + esc(text.slice(pos, pos + q.length)) + '</mark>' +
      esc(text.slice(pos + q.length, to)) + '…';
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('#volchips button');
    if (chip) { state.vol = chip.dataset.v; renderVolume(null); return; }

    var ti = e.target.closest('#toc .ti');
    if (ti) {
      var el = document.getElementById('b' + ti.dataset.h);
      if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('hitflash');
        setTimeout(function () { el.classList.remove('hitflash'); }, 1700); }
      return;
    }

    var hit = e.target.closest('[data-hit]');
    if (hit) {
      var x = state.hits[+hit.dataset.hit];
      if (x) {
        state.vol = x.v;
        pendingJump = x.i;
        $('#results').innerHTML = '';
        $('#q').value = '';
        renderVolume(pendingJump);
        pendingJump = null;
      }
      return;
    }

    var b = e.target.closest('[data-c]');
    if (b) {
      var act = b.dataset.c;
      if (act === 'read') {
        var v = volById(state.vol);
        if (state.read[v.id]) { delete state.read[v.id]; toast('已取消「已读」'); }
        else { state.read[v.id] = true; toast('已标记：' + v.title + ' 已读'); }
        renderVolume(null);
      } else if (act === 'prev' || act === 'next') {
        var pos = data.vols.map(function (v) { return v.id; }).indexOf(state.vol);
        var np = act === 'prev' ? pos - 1 : pos + 1;
        if (np >= 0 && np < data.vols.length) { state.vol = data.vols[np].id; renderVolume(null); }
      }
      return;
    }

    if (e.target.id === 'recite') { location.href = 'beisong.html?v=' + encodeURIComponent(state.vol); return; }
    if (e.target.id === 'qclear') { $('#q').value = ''; $('#results').innerHTML = ''; }
    if (e.target.id === 'scope') {
      state.scope = state.scope === 'all' ? 'vol' : 'all';
      var sc = $('#scope');
      sc.textContent = '搜索范围：' + (state.scope === 'all' ? '全部卷' : '本卷');
      sc.classList.toggle('on', state.scope === 'vol');
      doSearch($('#q').value);
    }
    if (e.target.id === 'fs') {
      var cur = state.font || document.documentElement.getAttribute('data-font') || 'md';
      var ni = (FONTS.map(function (f) { return f[0]; }).indexOf(cur) + 1) % FONTS.length;
      state.font = FONTS[ni][0];
      applyOwnFont();
      save();
    }
  });

  var qTimer = null;
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'q') return;
    clearTimeout(qTimer);
    var val = e.target.value;
    qTimer = setTimeout(function () { doSearch(val); }, 160);
  });

  /* ---------- 启动 ---------- */
  load();
  applyTheme();
  applyOwnFont();

  fetch('data/ziliao.json').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (d) {
    data = d;
    buildIndex();
    if (!state.vol) state.vol = d.vols[0].id;
    var mm = /[?&]v=([0-9A-Za-z]+)/.exec(location.search);
    var hm = /[?&]h=(\d+)/.exec(location.search);
    if (mm && volById(mm[1])) state.vol = mm[1];
    renderVolume(hm ? +hm[1] : null);
  }).catch(function (err) {
    $('#pane').innerHTML = '<div id="empty">资料库没加载出来（' + esc(err.message) +
      '）。<br>如果你在电脑上直接双击打开 html，浏览器会禁止读取本地 JSON；' +
      '请用手机上的 PWA 版，或在本目录起一个本地服务器。</div>';
  });
})();
