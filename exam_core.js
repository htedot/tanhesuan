/* 实操判分内核：手机端（exam.html）和机考端（kaoshi.html）共用
   放在单独文件里，避免同一套判分规则写两遍后走样。 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 关键词比对用：去空白、全角转半角、去常见标点、统一小写
  function norm(s) {
    return String(s || '')
      .replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s\u3000]/g, '')
      .replace(/[，。、；：""''（）()【】\[\]《》,.;:]/g, '')
      .toLowerCase();
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function mmss(sec) {
    if (sec < 0) sec = 0;
    return pad(Math.floor(sec / 60)) + ':' + pad(Math.floor(sec % 60));
  }
  function hhmmss(sec) {
    if (sec < 0) sec = 0;
    return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor(sec % 3600 / 60)) + ':' + pad(Math.floor(sec % 60));
  }

  // 只支持 + − × ÷ ( ) 与数字，够核算用；返回 null 表示算式不合法
  function evaluate(expr) {
    var s = String(expr).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s/g, '');
    if (!s || !/^[0-9+\-*/().]+$/.test(s)) return null;
    var pos = 0;
    function num() {
      var m = /^\d+(\.\d+)?/.exec(s.slice(pos));
      if (!m) return NaN;
      pos += m[0].length;
      return parseFloat(m[0]);
    }
    function factor() {
      if (s[pos] === '(') { pos++; var v = add(); if (s[pos] === ')') pos++; return v; }
      if (s[pos] === '-') { pos++; return -factor(); }
      return num();
    }
    function mul() {
      var v = factor();
      while (s[pos] === '*' || s[pos] === '/') {
        var op = s[pos++]; var r = factor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function add() {
      var v = mul();
      while (s[pos] === '+' || s[pos] === '-') {
        var op = s[pos++]; var r = mul();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    var out = add();
    if (pos !== s.length || !isFinite(out)) return null;
    return Math.round(out * 1e6) / 1e6;
  }

  // 单个采分点是否命中：kw 里出现 need 个（默认 1 个）即算
  function hitKey(k, text) {
    var n = norm(text);
    if (!n) return false;
    var hits = (k.kw || []).filter(function (w) { return n.indexOf(norm(w)) >= 0; }).length;
    return hits >= (k.need || 1);
  }

  function cellOk(raw, c) {
    var v = parseFloat(String(raw == null ? '' : raw).replace(/[,，\s]/g, ''));
    return !isNaN(v) && Math.abs(v - c.ans) <= c.tol;
  }

  // st = {ans:{'q1#0':..}, cells:{'q5#7':..}}
  function scoreQuestion(q, st) {
    var got = 0, calcGot = 0, textGot = 0;
    (q.cells || []).forEach(function (c, i) {
      if (cellOk((st.cells || {})[q.id + '#' + i], c)) { got += c.pt; calcGot += c.pt; }
    });
    (q.keys || []).forEach(function (k) {
      if (k.noScore) return;
      if (hitKey(k, (st.ans || {})[q.id + '#' + k.sub] || '')) { got += k.pt; textGot += k.pt; }
    });
    return { id: q.id, no: q.no, title: q.title, pt: q.pt, got: +got.toFixed(2), calc: +calcGot.toFixed(2), text: +textGot.toFixed(2) };
  }

  function scoreAll(D, st) {
    var per = D.qs.map(function (q) { return scoreQuestion(q, st); });
    var total = per.reduce(function (s, x) { return s + x.got; }, 0);
    var calc = per.reduce(function (s, x) { return s + x.calc; }, 0);
    var text = per.reduce(function (s, x) { return s + x.text; }, 0);
    return {
      per: per,
      score: +total.toFixed(2),
      calc: +calc.toFixed(2),
      text: +text.toFixed(2)
    };
  }

  window.ExamCore = {
    esc: esc, norm: norm, mmss: mmss, hhmmss: hhmmss,
    evaluate: evaluate, hitKey: hitKey, cellOk: cellOk,
    scoreQuestion: scoreQuestion, scoreAll: scoreAll
  };
})();
