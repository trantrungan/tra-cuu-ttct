#!/usr/bin/env python3
"""Sinh docs/data/tt22.json từ tệp Markdown của Thông tư 22/2019/TT-BYT.

Chạy lại mỗi khi sửa tệp .md:
    python3 scripts/build_data.py
"""
import hashlib
import html
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'TT_22-2019-TTBYT_ty-le-phan-tram-ton-thuong-co-the-giam-dinh-phap-y.md'
OUT = ROOT / 'docs' / 'data' / 'tt22.json'

ROMAN = re.compile(r'^[IVXL]+$')
RATE = re.compile(r'^(\d+(?:,\d+)?)(?:-(\d+(?:,\d+)?))?%?$')
CODE_2COL = re.compile(r'^((?:[IVXL]+|\d+)(?:\s?[.,]\s?\d+)*\.?)\s+(\S.*)$')


def nfc(s):
    return unicodedata.normalize('NFC', s)


def cells(line):
    return [c.strip() for c in line.strip().strip('|').split('|')]


def parse_rate(raw):
    r = raw.replace('–', '-').replace('—', '-').replace(' ', '')
    m = RATE.match(r)
    if not m:
        return None, None
    lo = float(m.group(1).replace(',', '.'))
    hi = float(m.group(2).replace(',', '.')) if m.group(2) else lo
    return lo, hi


def norm_code(code):
    c = re.sub(r'\s+', '', code).replace(',', '.')
    return c.rstrip('.')


def depth_of(code):
    if not code:
        return None
    if ROMAN.match(code):
        return 0
    return len([p for p in code.split('.') if p])


def md_inline(s):
    """Chuyển <br> và chữ thường sang HTML an toàn."""
    parts = s.split('<br>')
    return '<br>'.join(html.escape(p) for p in parts)


def main():
    lines = SRC.read_text(encoding='utf-8').split('\n')

    # ---- metadata (front matter) ----
    meta = {}
    if lines[0] == '---':
        end = lines.index('---', 1)
        for ln in lines[1:end]:
            m = re.match(r'^(\w+):\s*(.*)$', ln)
            if m and m.group(2) and not m.group(2).startswith('#'):
                meta[m.group(1)] = m.group(2).strip().strip('"')

    # ---- Điều 1..7 ----
    dieu = []
    cur = None
    in_body = False
    for ln in lines:
        if ln.startswith('###### Điều'):
            in_body = True
            m = re.match(r'^###### (Điều \d+)\.\s*(.*)$', ln)
            cur = {'n': m.group(1), 'title': m.group(2), 'paras': []}
            dieu.append(cur)
            continue
        if in_body and ln.startswith('## '):
            break
        if cur is not None and ln.strip():
            cur['paras'].append(html.escape(ln.strip()))

    # ---- Căn cứ ----
    can_cu = []
    grab = False
    for ln in lines:
        if ln.startswith('## Căn cứ ban hành'):
            grab = True
            continue
        if grab and ln.startswith('#'):
            break
        if grab and ln.strip():
            can_cu.append(html.escape(ln.strip()))

    # ---- Phụ lục: Bảng / Chương / mục ----
    bangs, chuongs, items, grids = [], [], [], []
    b = c = None           # current bảng / chương dict
    label = None           # nhãn in đậm ngoài bảng (XV., XXVI.)
    stack = []             # [(depth, item_id)]
    section = None         # id mục La Mã hiện tại
    started = False
    i = 0
    n = len(lines)

    def new_scope():
        nonlocal stack, section, label
        stack = []
        section = None
        label = None

    while i < n:
        ln = lines[i]
        if ln.startswith('## Phụ lục: Bảng'):
            started = True
            m = re.match(r'^## Phụ lục: Bảng (\d+)\.\s*(.*)$', ln)
            b = {'n': int(m.group(1)), 'title': m.group(2), 'kem': '', 'notes': []}
            bangs.append(b)
            c = None
            new_scope()
            i += 1
            continue
        if not started:
            i += 1
            continue
        if ln.startswith('## '):  # Ký ban hành, Nhật ký...
            break
        if ln.startswith('### Chương'):
            m = re.match(r'^### Chương (\d+)\.\s*(.*)$', ln)
            c = {'b': b['n'], 'n': int(m.group(1)), 'title': m.group(2), 'notes': []}
            chuongs.append(c)
            new_scope()
            i += 1
            continue
        if ln.startswith('**') and ln.endswith('**'):
            label = ln.strip('*').strip()
            (c or b)['notes'].append('<h4>' + html.escape(label) + '</h4>')
            i += 1
            continue
        if ln.startswith('|'):
            # gom cả bảng
            tbl = []
            while i < n and lines[i].startswith('|'):
                tbl.append(lines[i])
                i += 1
            header = cells(tbl[0])
            body = [cells(r) for r in tbl[2:]]
            if len(header) > 3:  # lưới thị lực
                grids.append({
                    'id': f'g{len(grids) + 1}',
                    'b': b['n'], 'c': c['n'] if c else 0,
                    'label': label or 'Bảng tỷ lệ % TTCT do giảm thị lực',
                    'cols': [h.replace('<br>', ' – ') for h in header[1:]],
                    'rows': [[r[0].replace('<br>', ' – ')] + r[1:] for r in body],
                })
                (c or b)['notes'].append(f'<div data-grid="g{len(grids)}"></div>')
                continue
            for r in body:
                if len(r) == 3:
                    code_raw, text, rate = r
                else:
                    first, rate = r[0], r[-1]
                    m = CODE_2COL.match(first)
                    if m:
                        code_raw, text = m.group(1), m.group(2)
                    else:
                        code_raw, text = '', first
                code = norm_code(code_raw)
                if code and not re.match(r'^([IVXL]+|\d+)(\.\d+)*$', code):
                    # không phải mã mục hợp lệ -> coi như phần của nội dung
                    text = (code_raw + ' ' + text).strip()
                    code = ''
                lo, hi = parse_rate(rate)
                d = depth_of(code)
                iid = len(items) + 1
                it = {
                    'id': iid, 'b': b['n'], 'c': c['n'] if c else 0,
                    'code': code_raw.strip(), 't': nfc(text), 'r': rate,
                }
                if lo is not None:
                    it['lo'], it['hi'] = lo, hi
                if d is None:
                    it['note'] = 1
                    parent = stack[-1][1] if stack else section
                elif d == 0:
                    section = iid
                    stack = []
                    parent = None
                    it['sec'] = 1
                else:
                    while stack and stack[-1][0] >= d:
                        stack.pop()
                    parent = stack[-1][1] if stack else section
                    stack.append((d, iid))
                if parent:
                    it['p'] = parent
                items.append(it)
            continue
        s = ln.strip()
        if s:
            if s.startswith('(Kèm theo'):
                b['kem'] = s
            else:
                (c or b)['notes'].append('<p>' + md_inline(s) + '</p>')
        i += 1

    data = {
        'meta': {
            'so_ky_hieu': meta.get('so_ky_hieu'),
            'trich_yeu': meta.get('trich_yeu'),
            'ngay_ban_hanh': meta.get('ngay_ban_hanh'),
            'ngay_hieu_luc': meta.get('ngay_hieu_luc'),
            'tinh_trang': meta.get('tinh_trang'),
            'co_quan': meta.get('co_quan_ban_hanh'),
            'nguoi_ky': meta.get('nguoi_ky'),
        },
        'can_cu': can_cu,
        'dieu': dieu,
        'bangs': bangs,
        'chuongs': chuongs,
        'items': items,
        'grids': grids,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    stamp_version()
    rated = sum(1 for x in items if 'lo' in x)
    print(f'{OUT.relative_to(ROOT)}: {len(bangs)} bảng, {len(chuongs)} chương, '
          f'{len(items)} mục ({rated} có tỷ lệ), {len(grids)} lưới thị lực, '
          f'{OUT.stat().st_size // 1024} KB')


def stamp_version():
    """Gắn mã phiên bản (theo nội dung) vào index.html và sw.js để máy người dùng tải bản mới."""
    docs = ROOT / 'docs'
    h = hashlib.sha1()
    for name in ('app.js', 'style.css', 'data/tt22.json'):
        h.update((docs / name).read_bytes())
    v = h.hexdigest()[:8]
    idx = docs / 'index.html'
    idx.write_text(re.sub(r'\?v=[\w]+', f'?v={v}', idx.read_text(encoding='utf-8')), encoding='utf-8')
    sw = docs / 'sw.js'
    sw.write_text(re.sub(r"const VERSION = '[^']*';", f"const VERSION = 'ttct-{v}';", sw.read_text(encoding='utf-8')), encoding='utf-8')
    print(f'phiên bản: {v}')


if __name__ == '__main__':
    main()
