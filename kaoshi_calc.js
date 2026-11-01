/* 机考计算器：浮层、可拖动、支持键盘、带历史、能把结果填进当前格
   为什么单独写一份：机考的痛点是「算一长串、中途要回头改」，所以保留完整表达式而不是只显示结果。 */
(function () {
  'use strict';
  var Core = window.ExamCore;
  var el = null, disp, exprBox, keypad, histBox;
  var st = { expr: '', val: null, hist: [], vis: false };

  function h(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function pretty(s) { return s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−'); }
  function unpretty(s) { return s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-'); }

  function build() {
    el = h('div', 'kcalc');
    el.id = 'kcalc';
    el.innerHTML = '';
    var bar = h('div', 'kc-bar');
    bar.appendChild(h('span', 'kc-tt', '计算器'));
    var close = h('button', 'kc-x', '✕');
    close.title = '关闭（Alt+C）';
    close.setAttribute('data-kc', 'close');
    bar.appendChild(close);
    el.appendChild(bar);

    exprBox = h('div', 'kc-expr');
    disp = h('div', 'kc-disp', '0');
    histBox = h('div', 'kc-hist');
    el.appendChild(exprBox);
    el.appendChild(disp);
    el.appendChild(histBox);

    keypad = h('div', 'kc-keys');
    var keys = [
      ['hist', '历史', 'fn'], ['(', '(', 'fn'], [')', ')', 'fn'], ['del', '⌫', 'fn'],
      ['7', '7', ''], ['8', '8', ''], ['9', '9', ''], ['/', '÷', 'op'],
      ['4', '4', ''], ['5', '5', ''], ['6', '6', ''], ['*', '×', 'op'],
      ['1', '1', ''], ['2', '2', ''], ['3', '3', ''], ['-', '−', 'op'],
      ['0', '0', ''], ['.', '.', ''], ['C', 'C', 'fn'], ['+', '+', 'op'],
      ['=', '=', 'eq']          // 单独一行，占满整行
    ];
    keys.forEach(function (k) {
      var b = h('button', 'kc-k ' + (k[2] || ''), k[1]);
      b.setAttribute('data-k', k[0]);
      if (k[0] === 'fill') b.setAttribute('data-kc', 'fill');
      if (k[0] === '=') b.style.gridColumn = '1 / -1';
      keypad.appendChild(b);
    });
    var fillRow = h('div', 'kc-fillrow');
    var fb = h('button', 'kc-fillbtn', '填入当前格（把结果写进刚才点的格子）');
    fb.setAttribute('data-k', 'fill');
    fillRow.appendChild(fb);
    el.appendChild(keypad);
    el.appendChild(fillRow);
    var tip = h('div', 'kc-tip', '键盘直接敲数字和 + − * / ( )，Enter 算，Esc 关');
    el.appendChild(tip);

    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]');
      if (b) { press(b.dataset.k); return; }
      var c = e.target.closest('[data-kc]');
      if (c && c.dataset.kc === 'close') hide();
    });
    el.addEventListener('pointerdown', startDrag);
    document.body.appendChild(el);
  }

  function startDrag(e) {
    if (e.target.closest('button') || e.target.closest('.kc-hist')) return;
    var r = el.getBoundingClientRect();
    var dx = e.clientX - r.left, dy = e.clientY - r.top;
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    function mv(ev) {
      var x = Math.max(4, Math.min(window.innerWidth - r.width - 4, ev.clientX - dx));
      var y = Math.max(4, Math.min(window.innerHeight - 60, ev.clientY - dy));
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    }
    function up() {
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup', up);
    }
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
  }

  function paint() {
    if (!el) return;
    exprBox.textContent = pretty(st.expr);
    disp.textContent = st.val == null ? (st.expr ? '…' : '0') : String(st.val);
    // 预览：没按等号也能看到当前算式的结果，省一次按键
    if (st.val == null && st.expr) {
      var v = Core.evaluate(unpretty(st.expr));
      if (v != null) disp.textContent = String(v);
    }
    histBox.innerHTML = st.hist.slice(0, 4).map(function (x) { return Core.esc(x); }).join('\n');
    histBox.style.display = st.hist.length && st.histOn ? 'block' : 'none';
  }

  function press(k) {
    if (k === 'C') { st.expr = ''; st.val = null; paint(); return; }
    if (k === 'del') { st.expr = st.expr.slice(0, -1); st.val = null; paint(); return; }
    if (k === 'hist') { st.histOn = !st.histOn; paint(); return; }
    if (k === '=') {
      var v = Core.evaluate(unpretty(st.expr));
      if (v == null) { toast2('算式不完整'); return; }
      st.hist.unshift(pretty(st.expr) + ' = ' + v);
      st.hist = st.hist.slice(0, 20);
      st.expr = String(v);
      st.val = v;
      paint();
      return;
    }
    if (k === 'fill') { fill(); return; }
    st.expr += k;
    st.val = null;
    paint();
  }

  function toast2(m) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = m; t.classList.add('on');
    clearTimeout(toast2._t);
    toast2._t = setTimeout(function () { t.classList.remove('on'); }, 1600);
  }

  /* 结果填进「最后一次聚焦」的作答格；定位用选择器，换题重渲染后仍然有效 */
  function fill() {
    var sel = window.__lastField;
    var target = sel ? document.querySelector(sel) : null;
    if (!target) { toast2('先在题里点一下要填的格子'); return; }
    var v = Core.evaluate(unpretty(st.expr));
    if (v == null) { toast2('算式不完整，先按 ='); return; }
    target.value = String(v);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    toast2('已填入 ' + v);
  }

  function show() {
    if (!el) build();
    st.vis = true;
    el.classList.add('on');
    if (!el.style.left) {
      el.style.left = (window.innerWidth - 296) + 'px';
      el.style.top = '88px';
    }
    paint();
  }
  function hide() { st.vis = false; if (el) el.classList.remove('on'); }
  function toggle() { st.vis ? hide() : show(); }
  function isVisible() { return !!(el && st.vis); }

  /* 键盘：开着时先拦，任何焦点下都能直接敲；
     唯一例外——焦点在编辑器里且按了 Ctrl/⌘（复制粘贴、撤销），这时让给编辑器 */
  document.addEventListener('keydown', function (e) {
    if (!st.vis) {
      if (e.altKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); show(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); return; }
    if (e.altKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); hide(); return; }
    if (e.key === 'Enter') { e.preventDefault(); press('='); return; }
    if (/^[0-9.+\-*/()]$/.test(e.key)) { e.preventDefault(); press(e.key); return; }
    if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
  }, true);

  window.KCalc = { show: show, hide: hide, toggle: toggle, isVisible: isVisible, value: function () { return Core.evaluate(unpretty(st.expr)); } };
})();
