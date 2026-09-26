# BOX QR Manager v3

## Flow
- Home -> QR đơn / QR cặp
- Vào QR đơn/cặp trước tiên chỉ thấy danh sách file.
- "Quét file mới" -> đặt tên tự động hoặc tự đặt -> mới mở scanner.
- Tên tự động: `TSCYYMMDDHHmmss`, ví dụ `TSC260926123045`.
- QR đơn: export `SN`.
- QR cặp: export `oldBOX,newBOX`.
- File Manager cho phép chọn nhiều file, nhưng chỉ export các file cùng loại.

## Chống trùng
- QR đơn: unique `(session_id, sn)`.
- Pair: unique `(session_id, old_box)` và `(session_id, new_box)`.
- OldBOX != NewBOX.
- Có kiểm tra trước insert + unique constraint ở database.
- Có cảnh báo PASS/FAIL, beep/vibrate và danh sách mã vừa quét.

## Pair scanner
- Không tự bật camera.
- Bấm "Quét OldBOX" mới mở camera OldBOX.
- Sau khi có OldBOX, hệ thống hiển thị rõ `ĐANG QUÉT OldBOX`.
- NewBOX chỉ được bật sau khi OldBOX hợp lệ.
- Sau khi pair PASS, tự reset về chờ OldBOX tiếp theo.

## Setup
1. Supabase SQL Editor -> chạy toàn bộ `supabase/schema.sql`.
2. Authentication -> tạo user.
3. Điền URL + anon/publishable key vào `js/config.js`.
4. Mở `index.html` bằng web server (camera HTTPS hoặc localhost).

> Camera trên điện thoại cần HTTPS/localhost và quyền camera.
