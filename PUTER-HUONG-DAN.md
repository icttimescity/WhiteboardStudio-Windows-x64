# Whiteboard Studio 2.2 — Gemini/GPT qua Puter

## Bắt đầu và lựa chọn

Dự án mới mặc định **Trên máy — không gọi API**. Không cần Puter, không tự bật đăng nhập. Chế độ này dùng JavaScript chia cảnh/prompt theo mẫu và Python/OpenCV để tìm vùng nét. Muốn dùng dịch vụ đã cấu hình, chọn **Agnes**; không cần đăng nhập Puter.

Để dùng AI qua Puter:

1. Tạo hoặc mở dự án, bấm **Mô hình AI** ngay phía trên **Quản lý / tải giọng** ở thanh bên. Trong hộp thoại, chọn Cơ chế chia cảnh / đề xuất → **AI qua Puter — Gemini / GPT / AI khác**.
2. Chờ bộ kết nối tải xong, bấm **Đăng nhập Puter**. Cho phép popup nếu trình duyệt chặn. Nếu hủy, giữ chế độ trước, không tự mở lại popup.
3. Chọn nhóm Gemini, GPT/ChatGPT hoặc AI khác; chọn **một model cụ thể**. Có thể Làm mới model hoặc Đổi tài khoản/Đăng xuất.
4. Bấm **Xong** để lưu và đóng hộp thoại; có thể mở từ bất kỳ tab nào. Bấm thao tác chia cảnh hoặc đề xuất prompt. Phần mềm ưu tiên model đó; không tự gọi model Puter khác. Nhóm GPT là các model API qua Puter, không phải đăng nhập ứng dụng ChatGPT.

Puter có tài khoản/hạn mức riêng. Gói Gemini Pro hoặc ChatGPT Plus cá nhân không được chuyển sang dùng cho các lệnh này. Thư viện được tải từ `https://js.puter.com/v2/` sau khi chọn Puter, cần Internet. Danh sách lấy từ `listModels()`; có tên không đảm bảo tài khoản đủ số dư hoặc model phản hồi thành công. Không gọi AI chỉ để thử tất cả model. Phí/hạn mức theo tài khoản Puter; xem dashboard Puter để biết chi tiết.

Lựa chọn engine/model/nhóm/dự phòng lưu trong bản nháp dự án. Phiên đăng nhập do SDK/trình duyệt quản lý, có thể cần đăng nhập lại khi chuyển máy/trình duyệt. Ứng dụng không đưa mật khẩu/token Puter vào `.env`, manifest dự án hoặc máy chủ Node. Không tự sao chép phiên đăng nhập sang máy khác.

## Khi có lỗi

Mặc định bật **Khi lỗi, tự chuyển Agnes → code trên máy**. Nếu chưa đăng nhập hoặc chưa chọn model khi bấm xử lý, dùng phương án dự phòng, không tự bật popup. Puter lỗi số dư/xác thực/model/cấu trúc phản hồi sẽ chuyển Agnes, rồi local nếu Agnes lỗi/chưa cấu hình. Thông báo và nhật ký ghi công cụ thực tế; kết quả prompt lưu nguồn local/Agnes/Puter và model khi phù hợp. Không lặp dịch vụ đã lỗi cho mọi cảnh trong cùng đợt.

Tắt dự phòng nếu chỉ muốn model đã chọn; cảnh lỗi được giữ trạng thái để thử lại, không ghi đè prompt cũ. Phản hồi JSON được kiểm tra trước khi lưu. Tác vụ đề xuất còn thiếu chỉ xử lý cảnh chưa xong; tạo lại riêng cảnh chỉ thay cảnh đó. Kịch bản gốc không bị AI viết lại khi chia cảnh.

- Puter 429: thử lại một lần sau khoảng nghỉ; các lỗi khác, đặc biệt timeout, không tự gửi lại cùng request. Lỗi ngữ nghĩa có thể yêu cầu model sửa cấu trúc một lần theo validator hiện có; các lần gọi có thể phát sinh sử dụng.
- Mỗi request Puter chờ tối đa khoảng 100 giây, có heartbeat khi chờ; Agnes dự phòng giới hạn 45 giây mỗi bước. Không bảo đảm dịch vụ dừng tính phí khi ứng dụng timeout/hủy; do đó không tự lặp các request có kết quả chưa rõ.
- **Hủy tác vụ** dừng mọi bước và không chuyển dự phòng. Kết quả đến muộn không được ghi vào cảnh.
- Model từ chối do nội dung bị chặn: cảnh lỗi để người dùng sửa, không chuyển dịch vụ để thử vượt bộ lọc.
- Giữ trang đang xử lý mở. Mất liên lạc với phiên trình duyệt khoảng 12–14 giây sẽ ngắt request và chuyển dự phòng nếu được bật. Khi đóng cả EXE, server cũng dừng; mở lại sẽ thấy tác vụ gián đoạn để tiếp tục.

Nếu phải chuyển local, prompt dùng mẫu từ lời kể, không có khả năng suy luận tương đương model AI. Hãy xem lại prompt và hồ sơ tạo hình trước khi copy sang công cụ tạo ảnh.

## Phạm vi

Puter dùng cho chia lại cảnh, đề xuất prompt còn thiếu, đề xuất riêng cảnh, hồ sơ phong cách/nhân vật/bối cảnh. Ảnh tham chiếu có thể được gửi cùng yêu cầu hồ sơ nếu dự án có ảnh và model hỗ trợ; model không hỗ trợ sẽ báo/chuyển dự phòng. Nội dung kịch bản/hồ sơ cần thiết được gửi đến dịch vụ đã chọn khi bấm xử lý, gồm Agnes nếu cho phép dự phòng.

Tìm vùng nét khi chọn Puter vẫn dùng OpenCV trên máy. Không phục hồi chức năng tạo ảnh AI hoặc đưa giọng online Puter vào app ở bản này. Piper/VieNeu và xuất video giữ như bản 2.1.3.

## Build/cập nhật

Đóng bản đang chạy. Giải nén nguồn vào thư mục mới, giữ dữ liệu `data`, `models` và cấu hình của bạn. Không copy runtime Python/node_modules từ máy khác. Trên Windows:

```cmd
npm install
npm run build:desktop
```

Mang toàn bộ `release\WhiteboardStudio-Windows-x64` sang máy nhận, không chỉ EXE. Source không kèm model/runtime; Puter cần Internet và trình duyệt cho phép popup. Chưa kiểm tra popup đăng nhập thực tế trong macOS WebKit.

## Phạm vi đã kiểm tra

123 bài Node và UI Chromium/server thật với **SDK Puter giả lập** đã đạt, gồm đổi model, quota, hủy và dự phòng. Chưa có tài khoản Puter thật để xác nhận đăng nhập/model/quota/thanh toán. SDK và model của dịch vụ có thể thay đổi. Đây là bản tích hợp nguồn cần kiểm chứng thêm với tài khoản thật trên Windows, không phải cam kết dịch vụ luôn chạy tốt.

Tài liệu đối chiếu: https://docs.puter.com/AI/chat/ , https://docs.puter.com/AI/listModels/ , https://docs.puter.com/Auth/signIn/ , https://docs.puter.com/user-pays-model/ .

## Đăng nhập và mã xác minh (2.2.2)

Đã bỏ nhãn/ô Tìm model, giữ nhóm AI và danh sách model. Bấm Đăng nhập khi phiên SDK vẫn hợp lệ chỉ làm mới thông tin, không gọi signIn lại; Đổi tài khoản vẫn mở chọn lại tài khoản.

EXE Windows trước đây tạo hồ sơ Chrome tạm rồi xóa mỗi lần đóng. Bản này dùng hồ sơ riêng cố định ở `%LOCALAPPDATA%\WhiteboardStudio\ChromeProfile-3000`, độc lập với hồ sơ Chrome cá nhân và thư mục giải nén. Cookies/phiên do Chrome và Puter quản lý có thể được tái sử dụng; không đảm bảo không cần xác minh lại khi dịch vụ yêu cầu. Hồ sơ này không được đóng trong source ZIP. Bấm Đăng xuất trong ứng dụng khi cần; để xóa toàn bộ dữ liệu trình duyệt riêng, đóng ứng dụng rồi xóa đúng thư mục ChromeProfile-3000 trên máy của bạn.

SDK signIn chỉ tài liệu hóa attempt_temp_user_creation/request_auth, không có tùy chọn ép Google hoặc tắt OTP. Trong popup chính thức có thể chọn Google nếu được Puter cung cấp, nhưng Google/Puter vẫn có thể yêu cầu SMS hoặc bước xác minh khác. Không có thay đổi vượt qua bước này. Không sử dụng token tài khoản chung hoặc tài khoản khách để né xác minh. Đăng nhập thật chưa được kiểm tra trong môi trường QA.

Tài liệu: https://docs.puter.com/Auth/signIn/ và https://support.google.com/accounts/answer/114129 .
