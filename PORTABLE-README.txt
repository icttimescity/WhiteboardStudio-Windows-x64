WHITEBOARD STUDIO — WINDOWS PORTABLE 2.2.2

1. Giải nén TOÀN BỘ thư mục portable vào nơi có quyền ghi. Không chỉ chép riêng EXE.
2. Chạy WhiteboardStudio.exe. EXE tự tìm Google Chrome và mở cửa sổ ứng dụng riêng tại http://127.0.0.1:3000.
3. Đóng cửa sổ Whiteboard Studio: máy chủ local và nhóm tiến trình của ứng dụng tự tắt sau vài giây, giải phóng cổng 3000. Chrome thông thường đang dùng cho việc khác không bị tắt.
4. Muốn dùng tiếp, mở lại WhiteboardStudio.exe. Nhấp EXE khi ứng dụng đang mở sẽ đưa cửa sổ hiện tại lên trước.
5. Có thể chọn Thoát tại biểu tượng khay hệ thống để đóng toàn bộ phiên ứng dụng.

Yêu cầu Windows 10/11 64-bit, đã có Google Chrome. Bản portable có sẵn Node/Python/FFmpeg; người dùng không cần cài các runtime này.
Chrome được tìm từ thư mục cài theo người dùng/toàn máy, PATH và Windows App Paths. Cài ở chỗ riêng có thể đặt CHROME_PATH trong .env, ví dụ:
CHROME_PATH='D:\Ứng dụng\Chrome\Application\chrome.exe'

Dự án, ảnh và lời đọc đã lưu nằm trong data; model giọng nằm trong models. Giữ .env, data và models khi cập nhật. Hồ sơ Chrome riêng được giữ ở %LOCALAPPDATA%\WhiteboardStudio\ChromeProfile-3000 để tái sử dụng phiên đăng nhập. Không dùng hồ sơ Chrome cá nhân.
Nếu đóng khi đang tạo ảnh/giọng/video, tác vụ sẽ dừng; kết quả đã lưu được giữ để thử tiếp sau khi mở lại.
Nếu cổng 3000 bị chiếm, ứng dụng báo lỗi và không giết tiến trình lạ. Đóng bản chạy bằng CMD hoặc chương trình đang chiếm cổng rồi mở lại EXE.
Nếu không tìm thấy Chrome, cài Google Chrome hoặc cấu hình đường dẫn đúng. Không dùng trình duyệt mặc định thay thế một cách âm thầm.
Log: data/desktop.log. Một số máy do quản trị viên kiểm soát có thể chặn profile Chrome riêng hoặc Windows Job Object; cần kiểm tra chính sách máy nếu log báo lỗi.

Bản 1.8.0: ảnh được tạo bằng công cụ bên ngoài. Dùng Đề xuất cảnh / prompt, Sao chép prompt cảnh và Hồ sơ / ảnh mẫu; tải ảnh hoàn thành vào từng cảnh. Các ảnh và dự án đã lưu được giữ.

Bản 1.8.1: tối ưu vẽ đường nét Full HD, cập nhật tiến độ trong từng cảnh và giới hạn chờ FFmpeg. Tắt phiên cũ, mở lại bản cập nhật rồi xuất lại video.

VieNeu là bộ tải thêm trong tab Lời đọc. Lần đầu cài cần Internet, tải runtime Python riêng và model. Không cài đè thư viện của Piper/render. Dữ liệu VieNeu được giữ trong data/vieneu; gói ZIP portable phân phối không mang dữ liệu/model cá nhân.
