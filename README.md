# Whiteboard Studio 1.9.2

Tạo video vẽ minh họa từ văn bản/SRT, ảnh tải lên và lời đọc Piper. Giao diện giữ thương hiệu Whiteboard Studio, không hiển thị nhãn thử nghiệm, phiên bản hoặc tên nhà cung cấp AI.

## Thay đổi Windows 1.9.2

- `.env` trong gói riêng này đã có khóa dịch vụ do người dùng cung cấp. `.env.example` vẫn để trống khóa. Khi cập nhật, dùng `.env` đi kèm hoặc giữ cấu hình phù hợp của máy đang chạy.
- **Đề xuất cảnh / prompt còn thiếu** sử dụng cùng đường xử lý một cảnh như nút đề xuất riêng: chờ toàn bộ phản hồi, kiểm tra và lưu xong cảnh hiện tại, nghỉ ngẫu nhiên **1–3 giây**, rồi mới bắt đầu cảnh sau. Khoảng nghỉ có thể hủy ngay; không dùng `setInterval` để gửi chồng yêu cầu. Bộ giới hạn tốc độ/Retry-After của dịch vụ vẫn được tôn trọng nên có thể chờ lâu hơn khi bị giới hạn.
- Kết quả từng cảnh được lưu ngay; lỗi một cảnh được ghi riêng, cảnh đã xong không gọi lại khi tiếp tục. Lỗi xác thực/kết nối cần khắc phục trước khi thử lại; khoảng nghỉ không bảo đảm dịch vụ bên ngoài không bao giờ lỗi.
- Trên ảnh, chọn **Khoanh vùng bằng tay**, giữ chuột và kéo quanh đối tượng rồi thả. Hoặc chọn **Đa giác**, bấm các đỉnh rồi **Khép đa giác**. Hủy nét đang khoanh để bỏ vùng chưa hoàn tất. Mỗi vùng mới tự được chia thời gian, có thể sửa thời gian/thứ tự và lưu như vùng chữ nhật.
- Chuyển về **Chọn / di chuyển / co giãn vùng** để kéo vùng hoặc góc dưới phải. Ô tọa độ cũng di chuyển/co giãn các đỉnh. Tối đa 20 vùng, 256 đỉnh/vùng; tránh đường tự cắt nhau. Vùng đa giác giới hạn phần ảnh được vẽ trong cả xem trước và MP4, đồng thời được trừ đúng hình dạng khỏi vùng trước đó. Giữ vùng toàn ảnh ở đầu để vẽ phần nền còn lại.
- **Theo đường nét** vẫn là chế độ bám các nét mực thực tế trong vùng. Khoanh tự do là chọn hình dạng vùng, không phải tự vẽ lại nội dung ảnh.

## Bản Windows 1.9.2

- Prompt đầy đủ, gói prompt từng cảnh và hướng dẫn tạo ảnh mẫu bằng tiếng Việt; có lựa chọn ChatGPT và Gemini. Hồ sơ AI mới yêu cầu tiếng Việt. Nội dung tự nhập/hồ sơ cũ được giữ nguyên để không làm sai tạo hình; có thể sửa các ô mô tả sang tiếng Việt trước khi sao chép.
- Ô **Giọng đã tải — áp dụng cho tất cả các cảnh** nằm phía trên thanh thao tác mục 3. Chọn giọng/người nói và bấm áp dụng; giữ tốc độ, nhịp và nội dung riêng từng cảnh. Vẫn đổi giọng từng cảnh trong Lời đọc Piper. Chọn **Tạo lời đọc còn thiếu / đã sửa** để tạo lại âm thanh sau khi đổi giọng. Nút Làm mới kiểm tra model trên máy, không tải giọng và không gọi AI.
- Tên tải MP4: `Video_<Ten_du_an_khong_dau>_<Do_phan_giai>.mp4`. Ví dụ `Video_Rua_va_Tho_FHD.mp4`; bản xem trước `Video_Rua_va_Tho_360p.mp4`. Các video mới lưu kích thước thực tế; video cũ dùng mức mặc định FHD/360p tương ứng.
- Chạy Windows bằng `setup-windows.bat`, rồi `start-windows.bat` (hoặc theo DESKTOP-HUONG-DAN.md để build EXE). Đây là ZIP đầy đủ mã nguồn, không phải gói portable đã kèm EXE/runtime. Giữ lại thư mục `data`, `models` và cấu hình `.env` của bản đang dùng; không chép môi trường Python từ máy khác.

## Build ứng dụng macOS

Bổ sung launcher AppKit/WebKit và bộ build `.app` riêng cho Apple Silicon/Intel, macOS 13.5+. Máy BUILD cần Node 22+, uv và Xcode Command Line Tools; chạy `npm run build:mac`. Máy NHẬN dùng app đã đóng runtime, không cần Node/Python/uv hoặc Chrome. Đóng cửa sổ/Cmd+Q dừng máy chủ 3000 và tiến trình của phiên; dữ liệu/giọng/.env ở `~/Library/Application Support/Whiteboard Studio`, không nằm trong .app.

Đọc **MACOS-HUONG-DAN.md** trước khi build, nhập khóa và phát hành. Source ZIP không phải `.app` đã biên dịch. Môi trường hiện tại chưa compile/test native trên macOS; cần chạy checklist Mac. Bản Windows vẫn dùng `npm run build:desktop` như trước.

## Sửa xuất MP4 ở bản 1.8.1

Chế độ Theo đường nét trước đây cấp phát/quét toàn bộ khung Full HD cho mỗi đoạn nét nhỏ. Bản này chỉ xử lý vùng bao quanh nét, tránh tô lại các pixel đã hoàn thành và giải phóng bộ đệm của cảnh trước. Giữ độ phân giải Full HD và cách vẽ theo đường nét.

Tiến độ cập nhật theo cảnh/vùng/bước phân tích, nét, tô màu và số khung đã viết; có heartbeat khi bước phân tích hoặc mã hóa mất thời gian. FFmpeg có giới hạn 15 phút mỗi lần gọi, xử lý vượt giới hạn tổng cũng báo lỗi rõ ràng thay vì lấy dòng tiến độ cuối làm lỗi. Nút Hủy vẫn dừng cây tiến trình. Tốc độ thực tế tùy độ dài/độ phức tạp ảnh và máy.

Khi nâng cấp, tắt phiên cũ rồi chạy lại và xuất lại video. Bản EXE cần build đầy đủ lại; không dùng -Resume từ gói cũ. Chạy `npm run test:render-progress` để kiểm hai cảnh nhiều chi tiết và tiến độ trên máy.

## Quy trình sử dụng

1. Tạo dự án từ văn bản hoặc SRT/VTT. Phần mềm tự nhận phụ đề theo nội dung, tách lời kể khỏi mốc thời gian/số thứ tự và giữ số trong lời kể. Có thể co/giãn thời lượng SRT.
2. Chọn mục tiêu kể chuyện/giải thích kiến thức, đối tượng và số cảnh. AI chia cảnh theo các đoạn nội dung gốc; kiểm tra không bỏ/lặp/đảo lời kể.
3. Bấm **Đề xuất cảnh / prompt còn thiếu**. AI lập hồ sơ phong cách, nhân vật và bối cảnh dùng chung, rồi tạo mô tả từng cảnh. Các cảnh đã xong được lưu để tiếp tục khi cần.
4. Vào **Hồ sơ / ảnh mẫu**, kiểm tra phong cách, nhân vật, bối cảnh cố định; tải ảnh mẫu nhân vật/phong cách/địa điểm. Bấm **Sao chép prompt cảnh** để lấy toàn bộ ràng buộc, không chỉ mô tả riêng của cảnh. Hoặc tải ZIP prompt và ảnh tham chiếu.
5. Dán prompt và đính kèm các ảnh mẫu đúng vai trò trong công cụ tạo ảnh bên ngoài. Tạo ảnh, kiểm tra và tải vào đúng cảnh. Dùng lại mẫu gốc, cùng mô hình/phong cách và bộ hồ sơ cho cả video; ảnh cảnh trước chỉ bổ sung ngữ cảnh. Prompt không thể bảo đảm giống tuyệt đối nếu công cụ bỏ qua ảnh mẫu.
6. Tải/chọn giọng Piper theo ngôn ngữ; bấm **Tạo lời đọc còn thiếu / đã sửa**. Có thể tạo lại riêng từng cảnh.
7. Xem trước hoặc xuất MP4. Mặc định tắt phụ đề và vẽ **Theo đường nét**. Màu nền riêng của ảnh được giữ khi render (có sai số mã hóa MP4); viền 16:9 của ảnh mới dùng màu nền ảnh.

**Bản này đã bỏ tạo ảnh trực tiếp qua API.** API/tác vụ `image`, `images` không còn được chấp nhận, tác vụ tạo ảnh cũ đang chờ được hủy khi khởi động. Ảnh, lời đọc và dự án đã lưu vẫn dùng được. Tính năng AI còn lại: chia cảnh, lập hồ sơ, đề xuất prompt, xem ảnh tải lên để đề xuất vùng vẽ. Có thể chỉnh vùng thủ công mà không cần AI.

Thanh thao tác mục 3 bám trên cùng khi cuộn; menu **Cảnh đang chọn** có thao tác prompt, lời đọc, tải ảnh, vùng vẽ và Hủy. Hộp hồ sơ cũng giữ các nút lưu/sao chép/tải gói ở trên khi cuộn.

## Chạy mã nguồn trên Windows

Cần Node.js 22+; Python 3.12 64-bit cho render/Piper. Chạy `setup-windows.bat` hoặc:

```cmd
npm install
npm run setup
npm start
```

Mở `http://localhost:3000`. `start-images-windows.bat` vẫn là lối tắt chạy phần Node (lập prompt, nhập ảnh); render/Piper cần Python đã thiết lập. Chỉ gói portable đã build mới đóng kèm runtime để máy người dùng không phải tự cài Node/Python.

## Khóa AI và xử lý lỗi

Giữ cấu hình máy chủ trong `.env`, dùng `.env.example` làm mẫu. Giữ tên biến `AGNES_API_KEY`, `AGNES_BASE_URL`, `AGNES_TEXT_MODEL` để tương thích cấu hình cũ. Không dán khóa vào prompt hoặc giao diện; máy chủ không trả khóa về trình duyệt. Sau khi đổi `.env`, khởi động lại ứng dụng. Các biến model ảnh cũ không còn điều khiển tính năng nào trong giao diện.

- Hàng đợi gọi tuần tự, giãn cách, giới hạn tổng thời gian và timeout cả headers/body; có heartbeat, Hủy và lưu tiến độ theo cảnh.
- Lỗi cấu trúc hồ sơ được yêu cầu sửa một lần; JSON sai được sửa định dạng tối đa một lần. Giới hạn token theo loại tác vụ để giảm phản hồi dài.
- Hồ sơ được kiểm tra và lưu dùng chung; không gửi ảnh vào bước lập hồ sơ văn bản. Không còn các lượt tạo/kiểm tra ảnh tự động.
- Không tự lặp lỗi khóa, quyền truy cập hoặc timeout như lỗi nội dung. Quá tải có thời hạn chờ/phục hồi hữu hạn; giữ phần đã xong để thử lại phần chưa xong. Không thể bảo đảm dịch vụ nhà cung cấp hoặc mạng luôn sẵn sàng.

## Build EXE

Trên Windows, chạy build đầy đủ (không `-Resume` khi cập nhật từ bản cũ):

```cmd
npm install
npm run build:desktop
```

Đầu ra: `release\WhiteboardStudio-Windows-x64\WhiteboardStudio.exe`. Giải nén/copy **toàn bộ** thư mục portable, không chỉ riêng EXE. Giữ `.env`, `data`, `models` khi nâng cấp. Chrome và vòng đời desktop được mô tả trong `DESKTOP-HUONG-DAN.md`.

## Kiểm tra

- `npm test`: logic, API transport, prompt/hồ sơ, phụ đề, giọng, queue và vòng đời desktop.
- `npm run test:features`: chia cảnh/prompt bằng AI giả lập, dự án/giọng/shutdown.
- `npm run test:background`: MP4 thật nhiều nền màu.
- `npm run test:render`: MP4, phụ đề, Full HD, audio.

Chi tiết phiên bản: `CHANGELOG.md`; phạm vi kiểm thử: `TEST_REPORT.md`; tạo ảnh bên ngoài: `VISUAL-HUONG-DAN.md`; giọng: `PIPER-HUONG-DAN.md`. Các tài liệu mang số phiên bản cũ mô tả lịch sử, không phải tính năng hiện tại.
