# Tra cứu tỷ lệ % TTCT – Thông tư 22/2019/TT-BYT

Web app tra cứu tỷ lệ phần trăm tổn thương cơ thể (TTCT) dùng trong giám định pháp y và giám định pháp y tâm thần, theo **Thông tư 22/2019/TT-BYT** (hiệu lực từ 01/11/2019). Có kèm bộ tính tổng tỷ lệ theo phương pháp cộng lùi (Điều 4).

Dùng được trên máy tính và điện thoại. Có thể "Thêm vào màn hình chính" để dùng như ứng dụng, kể cả khi không có mạng.

## Tính năng

- **Tra cứu**: gõ có dấu hoặc không dấu; kết hợp lọc theo Bảng, Chương, khoảng tỷ lệ %; mục cha hiện luôn các mục con kèm tỷ lệ.
- **Duyệt theo Chương**: xem toàn bộ mục của một Chương kèm phần "Nguyên tắc" và ghi chú.
- **Bảng thị lực**: chọn thị lực hai mắt để ra tỷ lệ chung (Bảng 1 Chương 10, Bảng 2 Chương 11).
- **Tổng tỷ lệ** (nút **Tính %** ở mỗi mục): thêm tổn thương từ kết quả tra cứu, chọn tỷ lệ trong khung, nhân hệ số (sẹo mặt ×3, sẹo cổ ×2, 30% theo Điều 3 khoản 7…), tự tính T1…Tn và làm tròn theo Điều 3 khoản 4; sao chép hoặc in cách tính.
- **Văn bản**: nội dung Điều 1–7 và căn cứ ban hành.

## Cấu trúc thư mục

```
TT_22-2019-TTBYT_...md   Văn bản gốc dạng Markdown (nguồn dữ liệu duy nhất)
scripts/build_data.py    Sinh dữ liệu web từ tệp .md
docs/                    Web app (GitHub Pages phục vụ thư mục này)
  index.html, app.js, style.css, sw.js, manifest.webmanifest, icon*
  data/tt22.json         Dữ liệu sinh tự động, không sửa tay
```

## Cập nhật nội dung

1. Sửa tệp `.md` và ghi một dòng vào mục "Nhật ký hiệu đính".
2. Chạy `python3 scripts/build_data.py` (sinh lại `docs/data/tt22.json` và cập nhật mã phiên bản để điện thoại tải bản mới).
3. Commit và push lên GitHub; trang tự cập nhật sau 1–2 phút.

## Chạy thử trên máy

```
python3 -m http.server 8765 --directory docs
```
rồi mở http://localhost:8765

## Lưu ý

Công cụ hỗ trợ tra cứu, không thay thế văn bản gốc. Khi kết luận giám định cần đối chiếu Thông tư 22/2019/TT-BYT.
