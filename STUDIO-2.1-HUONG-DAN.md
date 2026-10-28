# Whiteboard Studio 2.1 — Xử lý trên máy và thư viện VieNeu

## Chia cảnh và tạo prompt không cần API

Trong tab Kịch bản, **Xử lý cảnh / prompt → Trên máy** là mặc định. Cách này dùng JavaScript, không cần khóa API, Python, tải mô hình ngôn ngữ hoặc kết nối Internet để chia cảnh/tạo prompt. Các nút tạo prompt còn thiếu, tạo lại riêng cảnh và chia lại cảnh đều dùng cùng lựa chọn này. Dự án cũ chưa có lựa chọn cũng dùng trên máy; có thể chọn lại AI trực tuyến khi muốn.

Chia cảnh giữ nguyên thứ tự và từng từ trong lời kể, cân bằng thời lượng và ưu tiên dấu kết câu/ranh giới phụ đề. Mốc SRT gốc vẫn lưu trong dự án. Khi chia lại, có thể tách bên trong một câu phụ đề dài bằng ước lượng theo số từ; đây không phải nhận dạng chính xác thời điểm phát âm. Nếu không đủ mốc để tạo đủ cảnh tối thiểu một giây, chương trình yêu cầu giảm số cảnh trước khi thay dữ liệu.

Prompt tiếng Việt được dựng từ nguyên văn lời kể, tỷ lệ ảnh và hồ sơ dùng chung. Nhập nhân vật theo dạng `Tên: ngoại hình, quần áo...`, mỗi nhân vật một dòng, trong thiết lập hình ảnh bên ngoài. Giữ hồ sơ này và dùng ảnh tham chiếu khi tạo ảnh ở ChatGPT/Gemini để tăng tính nhất quán. Công cụ bên ngoài quyết định ảnh cuối cùng, phần mềm không bảo đảm nhân vật giống tuyệt đối.

Đây là thuật toán và mẫu mô tả, không phải LLM hiểu cốt truyện: hãy xem lại hành động, điểm ngắt cảnh, bố cục trước khi copy prompt. Với giải thích kiến thức, phần mềm chọn mẫu bố cục theo từ khóa; không tự bịa nhãn hoặc số liệu. Chế độ AI trực tuyến giữ cơ chế xử lý từng cảnh, timeout/retry/hủy và lưu kết quả riêng, nhưng vẫn phụ thuộc dịch vụ, mạng và hạn mức API.

Trong tab Vùng vẽ, **Tự tìm vùng nét trên máy** dùng OpenCV đã có trong bộ Python render. Nó nhóm nét theo màu nền và khoảng cách, không nhận biết người/vật theo nghĩa. Kiểm tra, đổi thứ tự hoặc khoanh đa giác thủ công nếu ảnh nhiều chi tiết, nền phức tạp hoặc các vật chạm nhau.

## Cài và quản lý VieNeu

Mở **Quản lý / tải giọng → VieNeu**. Thư viện hiển thị 25 giọng có sẵn trong catalog của SDK VieNeu 3.8.3, tìm theo tên/mô tả và lọc Có sẵn/Đã clone. Giọng gốc dùng chung mô hình; không cần tải 25 bộ riêng. Tên chuẩn lấy từ SDK, các tên tương thích cũ vẫn được chấp nhận.

Chọn CPU hoặc GPU NVIDIA, bấm **Cài / tải bộ CPU/GPU** và chờ báo sẵn sàng. Lần cài đầu cần Internet và dung lượng cho môi trường riêng cùng model. Chỉ dùng GPU khi máy có NVIDIA phù hợp; CPU cũng hỗ trợ clone nhưng có thể chậm. Không sao chép môi trường Python từ máy khác. Gói ZIP nguồn chưa kèm các model/runtime này.

## Clone và dùng lại giọng

1. Cài xong bộ VieNeu đang chọn, mở **Clone giọng từ âm thanh mẫu và lưu vào danh sách**.
2. Đặt tên riêng và tải mẫu một người nói rõ, không nhạc nền. Dùng giọng của bạn hoặc giọng được phép sử dụng. Khuyến nghị 3–8 giây; tối đa 20 MB. Với tệp dài, chọn mốc bắt đầu; chương trình chuyển WAV mono và lấy tối đa 8 giây. Mẫu dưới 3 giây hoặc gần như im lặng sẽ bị từ chối.
3. Bấm **Clone & lưu giọng**. Lần đầu có thể tải thêm mô hình trích đặc trưng. Âm thanh mẫu được xử lý bằng SDK trên máy, không gửi đến Agnes. Có trạng thái và nút hủy. Giọng chỉ được đưa vào danh sách khi lưu hồ sơ và tạo mẫu nghe thử thành công; lỗi/hủy sẽ xóa phần lưu dở của tác vụ.
4. Nghe thử, bấm **Dùng cho cảnh**. Trong tab Lời đọc có thể áp dụng giọng này cho tất cả cảnh; vẫn thay giọng riêng từng cảnh được. Sau khi đổi giọng cần tạo lại lời đọc trước khi xuất video.

Hồ sơ, âm thanh tham chiếu và mẫu nghe lưu ở `data/vieneu/clones` (bản desktop dùng thư mục dữ liệu của ứng dụng). Giữ toàn bộ thư mục dữ liệu khi nâng cấp; mở lại ứng dụng sẽ đọc lại danh sách đã clone. Giọng trong dự án đang dùng sẽ không được xóa; hãy đổi giọng các cảnh/giọng chung trước. Không sửa bộ giọng gốc của SDK khi thêm giọng mới.

## Cập nhật và build Windows

Đóng phiên cũ, giải nén ZIP vào thư mục mới. Giữ/copy `data`, `models` và cấu hình của bản đang dùng; không copy `node_modules` hoặc môi trường Python cũ. Chạy `setup-windows.bat` rồi `start-windows.bat` cho chế độ mã nguồn. Build EXE bằng `npm run build:desktop` trên Windows theo `DESKTOP-HUONG-DAN.md`; copy toàn bộ thư mục portable sau build.

Đây là ZIP đầy đủ mã nguồn 2.1.0, không phải EXE đã build. Các kiểm tra Linux xác nhận luồng UI/API/FFmpeg và adapter clone bằng SDK giả lập, chưa xác nhận độ giống giọng/chất lượng phát âm với weights VieNeu thật hoặc GPU/EXE Windows. Cần thử mẫu giọng thật trên máy đích trước khi dùng sản xuất.

Tài liệu SDK đối chiếu: https://docs.vieneu.io/docs/sdk/voice-cloning/ . Adapter ghim VieNeu 3.8.3; catalog chỉ lưu ID/tên/mô tả, không đóng weights hoặc embedding của giọng gốc trong source. Giấy phép mô hình/SDK cần được xem tại nguồn trước khi phân phối sản phẩm.
