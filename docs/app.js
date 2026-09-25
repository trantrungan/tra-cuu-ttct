'use strict';

/* ================= tiện ích ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function foldChar(ch) {
  return ch.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}
function fold(s) {
  let out = '';
  for (const ch of s) out += foldChar(ch);
  return out.replace(/\s+/g, ' ');
}
// fold có bản đồ vị trí để tô sáng trên chuỗi gốc
function foldMap(s) {
  let f = '', map = [];
  const chars = Array.from(s);
  let pos = 0;
  for (const ch of chars) {
    const fc = foldChar(ch);
    for (const x of fc) { f += x; map.push(pos); }
    pos += ch.length;
  }
  return { f, map };
}
function highlight(text, tokens, accented = []) {
  if (!tokens.length && !accented.length) return esc(text);
  const { f, map } = foldMap(text);
  const marks = new Array(text.length).fill(false);
  const low = variant(text.toLocaleLowerCase('vi'));
  if (low.length === text.length) {
    for (const w of accented) {
      let i = low.indexOf(w);
      while (i !== -1) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = low.indexOf(w, i + w.length); }
    }
  }
  for (const t of tokens) {
    let i = f.indexOf(t);
    while (i !== -1) {
      const a = map[i], b = (i + t.length < map.length) ? map[i + t.length] : text.length;
      for (let k = a; k < b; k++) marks[k] = true;
      i = f.indexOf(t, i + t.length);
    }
  }
  let out = '', open = false;
  for (let k = 0; k < text.length; k++) {
    if (marks[k] && !open) { out += '<mark>'; open = true; }
    if (!marks[k] && open) { out += '</mark>'; open = false; }
    out += esc(text[k]);
  }
  if (open) out += '</mark>';
  return out;
}
const num = x => {
  const s = (Math.round(x * 100) / 100).toString();
  return s.replace('.', ',');
};
const fix2 = h => (h / 100).toFixed(2).replace('.', ',');   // h: phần trăm tính bằng 1/100
// các cách viết tương đương trong văn bản (gẫy/gãy, thoái hoá/thoái hóa...)
const variant = s => s.replace(/gẫy/g, 'gãy').replace(/oá/g, 'óa').replace(/oà/g, 'òa').replace(/oả/g, 'ỏa').replace(/uỵ/g, 'ụy').replace(/uý/g, 'úy');
function sentence(s) {
  const low = s.toLocaleLowerCase('vi');
  return low.charAt(0).toLocaleUpperCase('vi') + low.slice(1);
}
function shortTitle(t) {
  return sentence(t.replace(/^TỶ LỆ PHẦN TRĂM TỔN THƯƠNG CƠ THỂ DO\s+/i, ''));
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2200);
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
};

/* ================= dữ liệu ================= */
let D, byId, kids, chapters, chapterKey;

function prepare(data) {
  D = data;
  byId = new Map(D.items.map(x => [x.id, x]));
  kids = new Map();
  for (const x of D.items) if (x.p) { if (!kids.has(x.p)) kids.set(x.p, []); kids.get(x.p).push(x); }
  chapters = new Map();          // "b-c" -> {b,c,title,short,notes}
  for (const b of D.bangs) {
    b.short = shortTitle(b.title);
    if (!D.chuongs.some(c => c.b === b.n)) {
      chapters.set(`${b.n}-0`, { b: b.n, c: 0, title: b.title, short: b.short, notes: b.notes });
    }
  }
  for (const c of D.chuongs) {
    chapters.set(`${c.b}-${c.n}`, { b: c.b, c: c.n, title: c.title, short: shortTitle(c.title), notes: c.notes });
  }
  chapterKey = x => `${x.b}-${x.c}`;
  for (const x of D.items) {
    const anc = ancestors(x);
    x.depth = anc.length;
    x.f = fold(`${x.code} ${x.t}`);
    const ch = chapters.get(chapterKey(x));
    x.fa = fold(anc.map(a => a.t).join(' ') + ' ' + (ch ? ch.short : '') + ' ' + D.bangs[x.b - 1].short);
    x.fp = fold(anc.map(a => a.t).join(' ') + ' ' + x.t);
    x.raw = variant((x.t + ' ' + anc.map(a => a.t).join(' ')).normalize('NFC').toLocaleLowerCase('vi'));
    x.rawOwn = variant(x.t.normalize('NFC').toLocaleLowerCase('vi'));
    x.wo = new Set(x.f.split(/[^a-z0-9]+/).filter(Boolean));
    x.wa = new Set(x.fa.split(/[^a-z0-9]+/).filter(Boolean));
  }
}
// điểm khớp của một từ khóa trong một vùng chữ: trọn từ > đầu từ > giữa từ
const OWN_W = [0, 1, 2.5, 6], ANC_W = [0, 0.5, 1, 3];
function tokenScore(t, words, text) {
  if (words.has(t)) return 3;
  if (text.startsWith(t) || text.includes(' ' + t) || text.includes('(' + t)) return 2;
  if (text.includes(t)) return 1;
  return 0;
}
function ancestors(x) {
  const out = [];
  let y = x;
  while (y.p) { y = byId.get(y.p); out.unshift(y); }
  return out;
}
function rateText(x) {
  if (x.lo === undefined) return '';
  return x.lo === x.hi ? `${num(x.lo)}%` : `${num(x.lo)}–${num(x.hi)}%`;
}
function where(x) {
  return x.c ? `Bảng ${x.b}, Chương ${x.c}` : `Bảng ${x.b}`;
}

/* ================= trạng thái tra cứu ================= */
const S = { q: '', b: '', c: '', min: '', max: '', r: false, limit: 60, focus: null };

function readHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const p = new URLSearchParams(qs || '');
  if (path.startsWith('/cong-lui')) return { view: 'calc' };
  if (path.startsWith('/van-ban')) return { view: 'doc' };
  const m = path.match(/^\/muc\/(\d+)/);
  if (m) return { view: 'search', focus: +m[1] };
  const mc = path.match(/^\/chuong\/(\d+)-(\d+)/);
  if (mc) return { view: 'search', b: mc[1], c: mc[2] === '0' ? '' : mc[2], q: '' };
  return {
    view: 'search', q: p.get('q') || '', b: p.get('b') || '', c: p.get('c') || '',
    min: p.get('min') || '', max: p.get('max') || '', r: p.get('r') === '1',
  };
}
function writeHash() {
  const p = new URLSearchParams();
  if (S.q) p.set('q', S.q);
  if (S.b) p.set('b', S.b);
  if (S.c) p.set('c', S.c);
  if (S.min) p.set('min', S.min);
  if (S.max) p.set('max', S.max);
  if (S.r) p.set('r', '1');
  const h = '#/' + (p.toString() ? '?' + p : '');
  if (location.hash !== h) history.replaceState(null, '', h);
}

/* ================= giao diện tra cứu ================= */
function fillBangSelect() {
  const sel = $('#fBang');
  for (const b of D.bangs) sel.add(new Option(`Bảng ${b.n} – ${b.short}`, b.n));
}
function fillChuongSelect() {
  const sel = $('#fChuong');
  sel.length = 1;
  const list = D.chuongs.filter(c => !S.b || String(c.b) === S.b);
  if (S.b && !list.length) {
    sel.options[0].text = 'Bảng này không chia Chương';
    sel.disabled = true;
    return;
  }
  sel.options[0].text = 'Tất cả Chương';
  sel.disabled = false;
  for (const c of list) {
    const label = (S.b ? '' : `B${c.b} · `) + `Chương ${c.n} – ${shortTitle(c.title)}`;
    sel.add(new Option(label, `${c.b}-${c.n}`));
  }
  sel.value = S.c ? `${S.b}-${S.c}` : '';
}
function syncControls() {
  $('#q').value = S.q;
  $('#qClear').hidden = !S.q;
  $('#fBang').value = S.b;
  fillChuongSelect();
  $('#fMin').value = S.min;
  $('#fMax').value = S.max;
  $('#fRated').checked = S.r;
}

function tokens() {
  return fold(S.q).split(' ').filter(Boolean);
}
function queryWords() {
  const words = variant(S.q.normalize('NFC').toLocaleLowerCase('vi')).split(/\s+/).filter(Boolean);
  return { plain: words.filter(w => fold(w) === w), accented: words.filter(w => fold(w) !== w) };
}
function passFilters(x) {
  if (S.b && String(x.b) !== S.b) return false;
  if (S.c && String(x.c) !== S.c) return false;
  const lo = S.min === '' ? null : +S.min, hi = S.max === '' ? null : +S.max;
  if (S.r || lo !== null || hi !== null) {
    if (x.lo === undefined) return false;
    if (lo !== null && x.hi < lo) return false;
    if (hi !== null && x.lo > hi) return false;
  }
  return true;
}
function search() {
  const tk = tokens();
  // từ khóa người dùng gõ có dấu -> ưu tiên mục chứa đúng từ có dấu đó
  const accented = variant(S.q.normalize('NFC').toLocaleLowerCase('vi')).split(/\s+/).filter(w => w && fold(w) !== w);
  const phrase = tk.join(' ');
  const res = [];
  for (const x of D.items) {
    if (!passFilters(x)) continue;
    let score = 0, ok = true, exact = 0;
    for (const t of tk) {
      const own = tokenScore(t, x.wo, x.f), anc = tokenScore(t, x.wa, x.fa);
      if (!own && !anc) { ok = false; break; }
      score += Math.max(OWN_W[own], ANC_W[anc]);
      if (own === 3 || anc === 3) exact++;
    }
    if (!ok) continue;
    if (exact === tk.length) score += 5;
    for (const w of accented) {
      if (x.rawOwn.includes(w)) score += 5;
      else if (x.raw.includes(w)) score += 2.5;
      else score -= 3;
    }
    if (tk.length > 1) {
      if (x.f.includes(phrase)) score += 8;
      else if (x.fp.includes(phrase)) score += 5;
    }
    if (x.lo !== undefined) score += 1.5;
    if (x.note) score -= 1;
    res.push([score, x]);
  }
  res.sort((a, b) => b[0] - a[0] || a[1].id - b[1].id);
  return res.map(r => r[1]);
}

function crumbHTML(x, withChapter = true) {
  const anc = ancestors(x);
  const parts = [];
  if (withChapter) {
    const key = `${x.b}-${x.c}`;
    parts.push(`<button type="button" data-chap="${key}">${where(x)}</button>`);
  }
  for (const a of anc) {
    const label = (a.code ? a.code + ' ' : '') + (a.t.length > 60 ? a.t.slice(0, 57) + '…' : a.t);
    parts.push(`<button type="button" data-item="${a.id}">${esc(label)}</button>`);
  }
  return parts.join(' › ');
}
function rateCol(x) {
  if (x.lo === undefined) return kids.has(x.id) ? '' : `<div class="rate-col"><span class="rate none">${x.sec ? '' : 'không có tỷ lệ riêng'}</span></div>`;
  return `<div class="rate-col"><span class="rate">${esc(rateText(x))}</span><button type="button" class="add-btn" data-add="${x.id}">+ Cộng lùi</button></div>`;
}
function itemText(x, qw) {
  const code = x.code ? `<span class="code">${esc(x.code)}</span>` : '';
  const t = x.t.split('<br>').map(s => qw ? highlight(s, qw.plain, qw.accented) : esc(s)).join('<br>');
  return code + t;
}
function descendants(x, depth = 0, out = []) {
  for (const k of kids.get(x.id) || []) {
    out.push([k, depth]);
    descendants(k, depth + 1, out);
  }
  return out;
}
function kidsHTML(x) {
  if (x.lo !== undefined || !kids.has(x.id)) return '';
  const list = descendants(x);
  const shown = list.slice(0, 12);
  return `<div class="kids">${shown.map(([k, d]) => `
    <div class="kid" style="--d:${d}">
      <div class="itext">${itemText(k)}</div>
      ${k.lo !== undefined ? `<span class="rate">${esc(rateText(k))}</span><button type="button" class="add-btn" data-add="${k.id}" aria-label="Thêm vào cộng lùi">+</button>` : ''}
    </div>`).join('')}
    ${list.length > shown.length ? `<a href="#/muc/${x.id}" class="kid-more">Xem đủ ${list.length} mục trong Chương →</a>` : ''}
  </div>`;
}

function renderSearch() {
  const box = $('#results');
  const info = $('#searchInfo');
  const browsing = !S.q && S.min === '' && S.max === '' && !S.r;
  if (browsing) {
    if (S.c || (S.b && !D.chuongs.some(c => String(c.b) === S.b))) {
      info.textContent = '';
      renderChapter(`${S.b}-${S.c || 0}`);
      return;
    }
    info.textContent = '';
    renderHome(S.b ? [D.bangs[+S.b - 1]] : D.bangs, !S.b);
    return;
  }
  const res = search();
  const qw = queryWords();
  info.textContent = res.length ? `${res.length} mục phù hợp` + (res.length > S.limit ? ` · hiển thị ${S.limit} mục đầu` : '') : '';
  if (!res.length) {
    box.innerHTML = `<div class="empty">Không tìm thấy mục phù hợp.<br>Thử bỏ bớt từ khóa, bỏ bộ lọc, hoặc dùng từ đồng nghĩa (ví dụ “gẫy” / “gãy”).</div>`;
    return;
  }
  box.innerHTML = res.slice(0, S.limit).map(x => `
    <article class="result">
      <div class="body">
        <div class="crumb">${crumbHTML(x)}</div>
        <div class="itext"><a href="#/muc/${x.id}" class="plain">${itemText(x, qw)}</a></div>
        ${kidsHTML(x)}
      </div>
      ${rateCol(x)}
    </article>`).join('') +
    (res.length > S.limit ? `<button type="button" class="btn ghost more-btn" id="more">Hiện thêm</button>` : '');
}

function renderHome(bangs, tips) {
  const box = $('#results');
  const tipHTML = tips ? `
    <div class="tips"><b>Cách tra cứu</b>
      <ul>
        <li>Gõ tên tổn thương, <b>có dấu hoặc không dấu</b> đều được: “gay xuong don”, “sẹo mặt”, “liệt”.</li>
        <li>Kết hợp với bộ lọc Bảng, Chương, khoảng tỷ lệ (ví dụ 21 đến 30%).</li>
        <li>Chọn một Chương (hoặc bấm vào dòng chữ nhỏ phía trên mỗi kết quả) để xem toàn bộ mục kèm “Nguyên tắc” của Chương.</li>
        <li>Bấm <b>+ Cộng lùi</b> để đưa tỷ lệ vào bảng tính tổng theo Điều 4.</li>
      </ul>
    </div>` : '';
  box.innerHTML = tipHTML + `<div class="home-grid">` + bangs.map(b => {
    const chs = D.chuongs.filter(c => c.b === b.n);
    const list = chs.length
      ? chs.map(c => `<li><button type="button" data-chap="${c.b}-${c.n}"><b>${c.n}.</b>${esc(shortTitle(c.title))}</button></li>`).join('')
      : `<li><button type="button" data-chap="${b.n}-0">Xem toàn bộ Bảng ${b.n}</button></li>`;
    return `<div class="bang-card"><h3>Bảng ${b.n}<small>${esc(b.short)}</small></h3><ul>${list}</ul></div>`;
  }).join('') + `</div>`;
}

function gridHTML(g) {
  const opts = g.rows.map((r, i) => `<option value="${i}">${esc(r[0])}</option>`).join('');
  return `<div class="grid-widget" data-g="${g.id}">
    <div class="pick">
      <label>Mắt thứ nhất <select data-axis="r">${opts}</select></label>
      <label>Mắt thứ hai <select data-axis="c">${opts}</select></label>
      <span class="out"></span>
      <button type="button" class="add-btn" data-grid-add="${g.id}">+ Cộng lùi</button>
    </div>
    <div class="table-scroll"><table class="vgrid">
      <thead><tr><th class="axis">Thị lực</th>${g.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${g.rows.map(r => `<tr><th>${esc(r[0])}</th>${r.slice(1).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
function updateGrid(w) {
  const g = D.grids.find(x => x.id === w.dataset.g);
  const r = +$('[data-axis=r]', w).value, c = +$('[data-axis=c]', w).value;
  const v = g.rows[r][c + 1];
  w.querySelectorAll('td.hit').forEach(td => td.classList.remove('hit'));
  w.querySelectorAll('tbody tr')[r].children[c + 1].classList.add('hit');
  $('.out', w).innerHTML = `Tỷ lệ chung hai mắt: <b class="rate">${esc(v)}%</b>`;
  return { g, r, c, v: +v };
}

function renderChapter(key) {
  const ch = chapters.get(key);
  const box = $('#results');
  if (!ch) { box.innerHTML = '<div class="empty">Không có Chương này.</div>'; return; }
  const items = D.items.filter(x => `${x.b}-${x.c}` === key);
  let notes = '';
  if (ch.notes.length) {
    const html = ch.notes.map(n => {
      const m = n.match(/^<div data-grid="(g\d+)"><\/div>$/);
      return m ? gridHTML(D.grids.find(g => g.id === m[1])) : n;
    }).join('');
    notes = `<details class="notes" open><summary>Nguyên tắc, ghi chú của ${ch.c ? 'Chương' : 'Bảng'}</summary>${html}</details>`;
  }
  box.innerHTML = `
    <div class="chapter-head">
      <div class="crumb">Bảng ${ch.b} – ${esc(D.bangs[ch.b - 1].short)}</div>
      <h2>${ch.c ? `Chương ${ch.c}. ` : ''}${esc(ch.short)}</h2>
    </div>
    ${notes}
    <div class="tree">${items.map(x => `
      <div class="row${x.sec ? ' sec' : ''}${x.note ? ' note' : ''}" id="m${x.id}" style="--d:${x.depth}">
        <div class="itext">${itemText(x)}</div>
        ${x.lo !== undefined ? rateCol(x) : ''}
      </div>`).join('')}
    </div>`;
  box.querySelectorAll('.grid-widget').forEach(updateGrid);
  $('#searchInfo').textContent = `${items.filter(x => x.lo !== undefined).length} mục có tỷ lệ trong ${ch.c ? 'Chương' : 'Bảng'} này`;
}

function focusItem(id) {
  const x = byId.get(id);
  if (!x) return;
  S.q = ''; S.min = ''; S.max = ''; S.r = false;
  S.b = String(x.b); S.c = x.c ? String(x.c) : '';
  syncControls();
  renderChapter(`${x.b}-${x.c}`);
  history.replaceState(null, '', `#/muc/${id}`);
  requestAnimationFrame(() => {
    const el = document.getElementById('m' + id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - $('.searchbar').offsetHeight - 80;
    window.scrollTo({ top, behavior: 'smooth' });
    el.classList.add('flash');
  });
}

/* ================= bộ tính cộng lùi ================= */
const FACTORS = [
  ['1', 'Không nhân hệ số'],
  ['3', '× 3 – sẹo phần mềm vùng mặt (Bảng 1, Chương 8)'],
  ['2', '× 2 – sẹo phần mềm vùng cổ (Bảng 1, Chương 8)'],
  ['0.5', '× 50%'],
  ['0.3', '× 30% – bộ phận đã mất chức năng nay bị tổn thương (Điều 3 khoản 7)'],
];
let C = store.get('ttct-calc', { sort: true, items: [] });
let uid = C.items.reduce((m, x) => Math.max(m, x.k), 0);

function saveCalc() {
  store.set('ttct-calc', C);
  const n = C.items.length;
  const b = $('#calcBadge');
  b.textContent = n;
  b.hidden = !n;
}
function addToCalc(entry) {
  C.items.push({ k: ++uid, f: '1', ...entry });
  saveCalc();
  toast(`Đã thêm vào Cộng lùi (${C.items.length} mục)`);
  if (currentView === 'calc') renderCalc();
}
function addItem(id) {
  const x = byId.get(id);
  const anc = ancestors(x).map(a => (a.code ? a.code + ' ' : '') + a.t);
  addToCalc({
    id, name: (x.code ? x.code + ' ' : '') + x.t.replace(/<br>.*/, ''), ctx: `${where(x)}${anc.length ? ' › ' + anc.join(' › ') : ''}`,
    lo: x.lo, hi: x.hi, v: x.lo,
  });
}
function effOf(it) {
  const v = +it.v || 0;
  return Math.round(v * (+it.f || 1) * 100);   // phần trăm × 100
}
function compute() {
  const list = C.items.map((it, i) => ({ it, i, e: effOf(it) }));
  if (C.sort) list.sort((a, b) => b.e - a.e || a.i - b.i);
  let rem = 10000, sum = 0;
  const steps = list.map((s, n) => {
    const before = rem;
    const t = Math.floor((rem * s.e + 5000) / 10000);   // làm tròn 2 chữ số thập phân
    rem -= t; sum += t;
    return { ...s, n: n + 1, before, t, sum };
  });
  const final = Math.floor((sum + 50) / 100);          // ≥ 0,5 thì làm tròn lên
  return { steps, sum, final };
}
function orderOf() {
  const { steps } = compute();
  const m = new Map();
  steps.forEach(s => m.set(s.it.k, s.n));
  return m;
}

function calcItemHTML(it, tn) {
  const hasRange = it.lo !== undefined && it.lo !== null;
  const fixed = hasRange && it.lo === it.hi;
  const step = hasRange && (!Number.isInteger(it.lo) || !Number.isInteger(it.hi)) ? '0.25' : '1';
  const v = +it.v;
  const e = effOf(it) / 100;
  const warns = [];
  if (hasRange && (v < it.lo || v > it.hi)) warns.push(`Giá trị ${num(v)}% nằm ngoài khung ${num(it.lo)}–${num(it.hi)}% của mục này.`);
  if (e >= 100) warns.push('Tỷ lệ sau khi nhân hệ số phải nhỏ hơn 100%.');
  const name = it.id
    ? `<div class="crumb">${esc(it.ctx || '')}</div><div class="itext">${esc(it.name)}</div>`
    : `<input type="text" data-k="${it.k}" data-f="name" value="${esc(it.name)}" placeholder="Tên tổn thương / kết luận (tự nhập)" aria-label="Tên mục">`;
  return `<div class="citem" data-k="${it.k}">
    <div class="tn">T${tn}</div>
    <div class="name">${name}</div>
    <div class="side">
      <button type="button" data-move="-1" title="Lên" aria-label="Chuyển lên"${C.sort ? ' hidden' : ''}>↑</button>
      <button type="button" data-move="1" title="Xuống" aria-label="Chuyển xuống"${C.sort ? ' hidden' : ''}>↓</button>
      <button type="button" data-del title="Xóa" aria-label="Xóa mục">✕</button>
    </div>
    <div class="ctrl">
      <div class="val">
        <input type="number" inputmode="decimal" step="any" min="0" max="99.99" data-k="${it.k}" data-f="v" value="${esc(it.v)}" aria-label="Tỷ lệ %"${fixed ? ' readonly' : ''}> %
        ${hasRange && !fixed ? `<input type="range" min="${it.lo}" max="${it.hi}" step="${step}" data-k="${it.k}" data-f="v" value="${esc(it.v)}" aria-label="Chọn tỷ lệ trong khung">
        <span class="muted">khung ${num(it.lo)}–${num(it.hi)}%</span>` : (fixed ? '<span class="muted">tỷ lệ cố định</span>' : '')}
      </div>
      <select data-k="${it.k}" data-f="f" aria-label="Hệ số">${FACTORS.map(([v, l]) => `<option value="${v}"${it.f === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      ${it.f !== '1' ? `<span class="eff">Tỷ lệ tính: <b>${num(e)}%</b></span>` : ''}
    </div>
    ${warns.map(w => `<div class="warn">${esc(w)}</div>`).join('')}
  </div>`;
}

function renderCalc() {
  $('#sortDesc').checked = C.sort;
  const list = $('#calcList');
  const out = $('#calcResult');
  if (!C.items.length) {
    list.innerHTML = `<div class="empty">Chưa có mục nào.<br>Vào <a href="#/">Tra cứu</a>, bấm <b>+ Cộng lùi</b> ở từng tổn thương, hoặc bấm “Tự nhập tỷ lệ”.</div>`;
    out.innerHTML = '';
    return;
  }
  const ord = orderOf();
  list.innerHTML = C.items.map(it => calcItemHTML(it, ord.get(it.k))).join('');
  if (C.sort) {
    // hiển thị theo thứ tự T1..Tn
    const nodes = [...list.children].sort((a, b) => ord.get(+a.dataset.k) - ord.get(+b.dataset.k));
    nodes.forEach(n => list.appendChild(n));
  }
  renderResult();
}
function renderResult() {
  const { steps, sum, final } = compute();
  const rows = steps.map(s => {
    const name = s.it.name || '(chưa đặt tên)';
    const formula = s.n === 1
      ? `T1 = ${num(s.e / 100)}`
      : `(100 − ${fix2(10000 - s.before)}) × ${num(s.e / 100)} / 100`;
    return `<tr><td>T${s.n}</td><td>${esc(name)}</td><td class="num">${num(s.e / 100)}%</td><td>${formula}</td><td class="num">${fix2(s.t)}%</td></tr>`;
  }).join('');
  $('#calcResult').innerHTML = `
    <div class="result-card">
      <div class="total"><span class="big">${final}%</span>
        <span class="raw">Tổng chưa làm tròn: ${fix2(sum)}% (${steps.map(s => fix2(s.t)).join(' + ')})</span></div>
      <div class="table-scroll"><table class="steps">
        <thead><tr><th>Tn</th><th>Tổn thương</th><th class="num">Tỷ lệ</th><th>Cách tính</th><th class="num">Kết quả</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td></td><td colspan="3">Tổng tỷ lệ % TTCT, làm tròn thành số nguyên</td><td class="num">${final}%</td></tr></tfoot>
      </table></div>
      <div class="actions">
        <button type="button" class="btn" id="copyCalc">Sao chép cách tính</button>
        <button type="button" class="btn ghost" id="printCalc">In</button>
      </div>
      <div class="fine">
        <p>Mỗi Tn lấy đến hai chữ số thập phân; tổng cuối làm tròn thành số nguyên, phần thập phân từ 0,5 trở lên làm tròn lên (Điều 3 khoản 4).</p>
        <p>Tổng tỷ lệ % TTCT của một người phải nhỏ hơn 100% (Điều 3 khoản 1). Tổn thương chi có nhiều tổn thương hỗn hợp mà tổng cao hơn tỷ lệ cắt cụt đoạn chi tương ứng thì tính bằng 95% tỷ lệ cắt cụt (Bảng 1, Chương 7, Nguyên tắc chung).</p>
        <p>Khi tổng hợp kết quả giám định pháp y và pháp y tâm thần (Điều 3 khoản 8), dùng “Tự nhập tỷ lệ” để thêm kết luận của tổ chức giám định kia.</p>
      </div>
    </div>`;
}
function calcText() {
  const { steps, sum, final } = compute();
  const lines = ['Tổng hợp tỷ lệ % TTCT theo phương pháp cộng (Điều 4 Thông tư 22/2019/TT-BYT):'];
  for (const s of steps) {
    const nm = s.it.name || '(chưa đặt tên)';
    const f = s.it.f !== '1' ? ` (${num(+s.it.v)}% × ${num(+s.it.f)})` : '';
    const calc = s.n === 1 ? `T1 = ${fix2(s.t)}%` : `T${s.n} = (100 − ${fix2(10000 - s.before)}) × ${num(s.e / 100)}/100 = ${fix2(s.t)}%`;
    lines.push(`- ${nm}: ${num(s.e / 100)}%${f} → ${calc}`);
  }
  lines.push(`Tổng tỷ lệ % TTCT = ${steps.map(s => fix2(s.t) + '%').join(' + ')} = ${fix2(sum)}%, làm tròn ${final}%.`);
  return lines.join('\n');
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* bỏ qua */ }
    ta.remove();
  }
  toast('Đã sao chép');
}

/* ================= văn bản ================= */
function renderDoc() {
  const m = D.meta;
  const date = s => s ? s.split('-').reverse().join('/') : '';
  const st = { con_hieu_luc: 'Còn hiệu lực', het_hieu_luc: 'Hết hiệu lực' }[m.tinh_trang] || 'Chưa rõ';
  $('#docBody').innerHTML = `
    <div class="doc-meta">
      <h2>Thông tư ${esc(m.so_ky_hieu)}</h2>
      <div>${esc(m.trich_yeu)}</div>
      <dl>
        <dt>Cơ quan ban hành</dt><dd>${esc(m.co_quan)}</dd>
        <dt>Ngày ban hành</dt><dd>${date(m.ngay_ban_hanh)}</dd>
        <dt>Ngày hiệu lực</dt><dd>${date(m.ngay_hieu_luc)}</dd>
        <dt>Tình trạng</dt><dd>${st}</dd>
        <dt>Người ký</dt><dd>${esc(m.nguoi_ky)} (KT. Bộ trưởng, Thứ trưởng)</dd>
      </dl>
    </div>
    <details class="dieu"><summary>Căn cứ ban hành</summary><div class="content">${D.can_cu.map(p => `<p>${p}</p>`).join('')}</div></details>
    ${D.dieu.map(d => `<details class="dieu"${/Điều [34]$/.test(d.n) ? ' open' : ''}><summary>${esc(d.n)}. ${esc(d.title)}</summary><div class="content">${d.paras.map(p => `<p>${p}</p>`).join('')}</div></details>`).join('')}
    <div class="home-grid" style="margin-top:12px">${D.bangs.map(b => `<div class="bang-card"><h3>Bảng ${b.n}<small>${esc(b.short)}</small></h3><ul><li><button type="button" data-chap="${b.n}-${D.chuongs.some(c => c.b === b.n) ? D.chuongs.find(c => c.b === b.n).n : 0}">Mở Bảng ${b.n}</button></li></ul></div>`).join('')}</div>`;
}

/* ================= điều hướng ================= */
let currentView = 'search';
function show(view) {
  currentView = view;
  for (const v of ['search', 'calc', 'doc']) $('#view-' + v).hidden = v !== view;
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === view));
}
function route() {
  const r = readHash();
  if (r.view !== currentView) window.scrollTo({ top: 0 });
  show(r.view);
  if (r.view === 'calc') { renderCalc(); return; }
  if (r.view === 'doc') { renderDoc(); return; }
  if (r.focus) { focusItem(r.focus); return; }
  Object.assign(S, { q: r.q, b: r.b, c: r.c, min: r.min || '', max: r.max || '', r: !!r.r, limit: 60 });
  syncControls();
  renderSearch();
}

function bind() {
  let t;
  $('#q').addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => {
      S.q = e.target.value.trim(); S.limit = 60;
      $('#qClear').hidden = !S.q;
      writeHash(); renderSearch();
    }, 120);
  });
  $('#qClear').addEventListener('click', () => { S.q = ''; syncControls(); writeHash(); renderSearch(); $('#q').focus(); });
  $('#fBang').addEventListener('change', e => { S.b = e.target.value; S.c = ''; S.limit = 60; fillChuongSelect(); writeHash(); renderSearch(); });
  $('#fChuong').addEventListener('change', e => {
    const v = e.target.value;
    if (v) { const [b, c] = v.split('-'); S.b = b; S.c = c; } else S.c = '';
    $('#fBang').value = S.b; S.limit = 60;
    fillChuongSelect(); writeHash(); renderSearch();
  });
  for (const id of ['fMin', 'fMax']) {
    $('#' + id).addEventListener('input', e => { S[id === 'fMin' ? 'min' : 'max'] = e.target.value; S.limit = 60; writeHash(); renderSearch(); });
  }
  $('#fRated').addEventListener('change', e => { S.r = e.target.checked; writeHash(); renderSearch(); });
  $('#fReset').addEventListener('click', () => { Object.assign(S, { b: '', c: '', min: '', max: '', r: false }); syncControls(); writeHash(); renderSearch(); });

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-add],[data-chap],[data-item],[data-grid-add],#more,#copyCalc,#printCalc');
    if (!el) return;
    if (el.dataset.add) { addItem(+el.dataset.add); return; }
    if (el.dataset.chap) {
      const [b, c] = el.dataset.chap.split('-');
      location.hash = `#/chuong/${b}-${c}`;
      window.scrollTo({ top: 0 });
      return;
    }
    if (el.dataset.item) { location.hash = `#/muc/${el.dataset.item}`; return; }
    if (el.dataset.gridAdd) {
      const w = el.closest('.grid-widget');
      const { g, r, c, v } = updateGrid(w);
      addToCalc({ id: null, name: `Giảm thị lực hai mắt: ${g.rows[r][0]} và ${g.cols[c]} (Bảng ${g.b}${g.c ? ', Chương ' + g.c : ''})`, lo: v, hi: v, v });
      return;
    }
    if (el.id === 'more') { S.limit += 100; renderSearch(); return; }
    if (el.id === 'copyCalc') { copy(calcText()); return; }
    if (el.id === 'printCalc') { window.print(); }
  });
  document.addEventListener('change', e => {
    if (e.target.matches('.grid-widget select')) updateGrid(e.target.closest('.grid-widget'));
  });

  // bộ tính
  $('#sortDesc').addEventListener('change', e => { C.sort = e.target.checked; saveCalc(); renderCalc(); });
  $('#addCustom').addEventListener('click', () => {
    addToCalc({ id: null, name: '', v: '' });
    renderCalc();
    const inputs = document.querySelectorAll('#calcList input[data-f=name]');
    inputs[inputs.length - 1]?.focus();
  });
  $('#clearCalc').addEventListener('click', () => {
    if (!C.items.length || !confirm('Xóa toàn bộ các mục trong bảng cộng lùi?')) return;
    C.items = []; saveCalc(); renderCalc();
  });
  const calcList = $('#calcList');
  calcList.addEventListener('input', e => {
    const k = +e.target.dataset.k, f = e.target.dataset.f;
    if (!k || !f) return;
    const it = C.items.find(x => x.k === k);
    it[f] = e.target.value;
    saveCalc();
    if (f === 'v') {
      const card = e.target.closest('.citem');
      card.querySelectorAll('[data-f=v]').forEach(inp => { if (inp !== e.target) inp.value = e.target.value; });
      if (e.target.type === 'range') { renderResult(); refreshOrder(); return; }
    }
    if (f === 'name') { renderResult(); return; }
    renderResult(); refreshOrder();
  });
  calcList.addEventListener('change', e => {
    if (e.target.dataset.f === 'f' || (e.target.dataset.f === 'v' && e.target.type === 'number')) renderCalc();
  });
  calcList.addEventListener('click', e => {
    const card = e.target.closest('.citem');
    if (!card) return;
    const k = +card.dataset.k;
    const i = C.items.findIndex(x => x.k === k);
    if (e.target.closest('[data-del]')) { C.items.splice(i, 1); saveCalc(); renderCalc(); return; }
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const j = i + (+mv.dataset.move);
      if (j < 0 || j >= C.items.length) return;
      [C.items[i], C.items[j]] = [C.items[j], C.items[i]];
      saveCalc(); renderCalc();
    }
  });

  window.addEventListener('hashchange', route);
}
function refreshOrder() {
  const ord = orderOf();
  document.querySelectorAll('#calcList .citem').forEach(c => { $('.tn', c).textContent = 'T' + ord.get(+c.dataset.k); });
}

/* ================= khởi động ================= */
(async function init() {
  saveCalc();
  bind();
  try {
    const res = await fetch('data/tt22.json');
    prepare(await res.json());
  } catch (err) {
    $('#results').innerHTML = `<div class="empty">Không tải được dữ liệu. Hãy mở trang qua máy chủ web (GitHub Pages) thay vì mở tệp trực tiếp.</div>`;
    show('search');
    return;
  }
  fillBangSelect();
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
