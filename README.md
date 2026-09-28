# BOX QR Manager v4

## Cấu trúc menu
Tổng quan · Quét (QR đơn / QR cặp) · File (xuất Excel, xóa) · Lịch sử · Cài đặt (giao diện, âm thanh, rung, đăng xuất).

## Quét
- Camera chỉ mở khi bấm **Bật camera**, tự tắt khi chuyển trang / ẩn tab, giữ màn hình sáng khi quét.
- Kết quả hiện to ngay trên khung camera: **xanh ✓ PASS** / **đỏ ✕ FAIL** + lý do, kèm âm thanh và rung.
- QR cặp: 1 camera duy nhất, tự chuyển OldBOX → NewBOX → lưu → quay lại OldBOX. Có nút "Quét lại OldBOX".
- Chống sai: trùng mã, trùng OldBOX/NewBOX, OldBOX = NewBOX, và (mặc định) box vừa là Old vừa là New ở cặp khác
  (tắt bằng `STRICT_CROSS_CHECK=false` trong `js/config.js`).
- Cùng một mã còn nằm trong khung hình sẽ không bị quét/ghi log lặp lại.

## Cài đặt
1. Supabase → SQL Editor → chạy `supabase/schema.sql` (chạy lại được, không xóa dữ liệu cũ).
2. Authentication → tạo user.
3. Điền URL + anon key vào `js/config.js`.
4. Chạy bằng HTTPS hoặc localhost (camera bắt buộc).

Lưu ý: iPhone/Safari không hỗ trợ rung từ web — vẫn có âm thanh và cảnh báo màu.
