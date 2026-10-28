# Whiteboard Studio 2.0 — Windows

## Bắt đầu

1. Với mã nguồn: cài Node 22+ và Python 3.12 x64, chạy `setup-windows.bat` theo hướng dẫn hiện có, rồi chạy ứng dụng. Với bản portable đã build: giải nén toàn bộ thư mục và mở `WhiteboardStudio.exe`.
2. Bấm **Tạo dự án**, chỉ nhập tên. Dự án trống được lưu ngay, chưa gọi AI.
3. Tab **Kịch bản**: nhập văn bản hoặc đọc TXT/SRT/VTT, chọn thể loại và đối tượng. Bản nháp tự lưu sau khi ngừng nhập; thời gian SRT không trở thành lời đọc. Bấm **Lưu kịch bản & tạo phân cảnh** để áp dụng. Nếu đã có cảnh, phần mềm yêu cầu xác nhận trước khi thay danh sách; bản cũ được lưu trong dữ liệu dự án ở `previousScenes`.
4. Tab **Phân cảnh & ảnh**: chọn tỷ lệ; nếu muốn, nhờ AI chia lại số cảnh. Đề xuất prompt còn thiếu chạy tuần tự và nghỉ 1–3 giây giữa các cảnh. Sao chép prompt tiếng Việt sang ChatGPT/Gemini và tải ảnh hoàn thành vào từng cảnh.
5. Tab **Lời đọc**: chọn Piper hoặc VieNeu, giọng chung hoặc đổi riêng cảnh. Nghe thử một câu rồi tạo lời đọc còn thiếu/đã sửa.
6. Tab **Hiệu ứng vẽ**: chỉnh vùng chữ nhật, khoanh tay hoặc đa giác; thứ tự, thời gian, bàn tay và kiểu nét. Các thay đổi tự lưu. Sau khi thêm vùng riêng, có thể chọn và xóa vùng toàn ảnh nếu chỉ muốn vẽ các đối tượng đã khoanh.
7. Tab **Xuất video**: chọn nguồn tiếng, đồng bộ thời gian và phụ đề; tạo bản xem trước rồi xuất MP4. Các lựa chọn xuất được lưu theo dự án. Tab không hủy tác vụ đang chạy; thanh tiến độ luôn dùng chung.

## Màu nền trơn từ đầu video

Mỗi ảnh có màu nền tự nhận diện từ biên ảnh; màu này đã hiện ngay từ khung đầu, trước khi các chi tiết được vẽ. Chọn **Màu nền thủ công** nếu tự nhận diện chưa đúng. Chọn màu sẽ tự chuyển sang thủ công. Đây là màu nền trơn, không phải tự tách bầu trời/cỏ/cây hay xóa nhân vật khỏi bối cảnh. Khi tô màu ảnh, màu giấy trơn được giữ cùng màu nền đã chọn; những chi tiết ngoài vùng vẽ không tự xuất hiện.

## Tỷ lệ và ảnh gốc

| Tỷ lệ | Khung chỉnh sửa | MP4 | Xem trước |
|---|---|---|---|
| 16:9 | 1280×720 | 1920×1080 | 640×360 |
| 9:16 | 720×1280 | 1080×1920 | 360×640 |
| 1:1 | 960×960 | 1080×1080 | 640×640 |
| 4:3 | 1280×960 | 1440×1080 | 640×480 |
| 3:4 | 960×1280 | 1080×1440 | 480×640 |

**Giữ trọn ảnh** thêm nền theo ảnh, không kéo méo. **Cắt đầy khung** có thể ưu tiên trên/dưới/trái/phải/giữa. Đổi bố cục yêu cầu xác nhận khi có ảnh và chuyển tọa độ vùng theo vị trí ảnh; hãy kiểm tra lại vùng sau khi cắt, nhất là vùng đã nằm ngoài khung. Ảnh mới tải được giữ bản gốc để đổi bố cục nhiều lần. Ảnh dự án 1.x chỉ có bản đã chuẩn hóa: phần chi tiết từng bị mất không thể khôi phục, nên tải lại bản gốc nếu cần.

Dự án cũ không có tỷ lệ được hiểu là 16:9. Lời đọc Piper cũ vẫn được dùng nếu nội dung/thiết lập chưa đổi. Khi đổi ảnh hoặc tỷ lệ, video cũ cần xuất lại; âm thanh không bị thay tự động.

Tên video 16:9 giữ dạng `Video_Rua_va_Tho_FHD.mp4`; tỷ lệ khác thêm kích thước, ví dụ `Video_Rua_va_Tho_9x16_1080x1920.mp4`.

## VieNeu tải thêm, tách biệt Piper/render

- Dùng SDK `vieneu==3.8.3`, model v3 Turbo. Giọng có sẵn, không có chức năng clone giọng trong đợt này.
- Mở tab Lời đọc, bấm **Cài / tải VieNeu CPU**. Bộ cài tạo Python riêng bằng uv có kiểm tra SHA256 và tải thư viện/model vào `data/vieneu`. Không cần cài Python hay uv trên máy nhận bản portable. Máy build/source vẫn cần môi trường của ứng dụng để render và xử lý tốc độ âm thanh.
- Lần đầu cần Internet và dung lượng cho Python, thư viện và model; quá trình có thông báo hoạt động. Chỉ báo sẵn sàng sau khi tải, đọc danh sách giọng và phát âm thử thành công. Có thể dừng cài; cài lại để tiếp tục nếu kết nối lỗi.
- CPU dùng ONNX fp32, tối đa 4 luồng. Piper vẫn là mặc định và là lựa chọn nên thử trước ở máy RAM 8 GB. Không tự bật int8 trên CPU chưa kiểm tra VNNI.
- GPU: chỉ hiện khả dụng khi phát hiện NVIDIA qua `nvidia-smi`. Bộ cài GPU cần driver CUDA tương thích và tải Torch CUDA riêng; vẫn phải kiểm tra thực tế VRAM/driver. Không tự đổi sang CPU hoặc Piper khi lỗi.
- CLI sau khi cài thư viện Node: `npm run setup:vieneu` (CPU), hoặc `node scripts/setup-vieneu.mjs cuda` (GPU).
- Sau khi chuẩn bị thành công, đọc offline. Một tiến trình model được dùng lại trong cả đợt tạo lời đọc, sau đó tắt để nhường bộ nhớ. Nút hủy dừng yêu cầu đang chạy. VieNeu không chạy đồng thời nhiều cảnh.
- Tốc độ âm thanh dùng FFmpeg giữ cao độ. Nhịp/liền mạch và khoảng nghỉ là điều khiển hậu xử lý/đoạn, không phải cam kết mô hình cảm xúc. Phong cách đọc tự nhiên phụ thuộc giọng có sẵn.
- Nếu chuyển/mang thư mục ứng dụng sang nơi khác khiến môi trường VieNeu mất đường dẫn, cài lại bộ VieNeu ở vị trí mới; giữ thư mục model để hạn chế tải lại. Không copy riêng Python venv giữa các máy.

## Build và dữ liệu

Chạy build đầy đủ: `npm install`, `npm run build:desktop`; không dùng `-Resume` từ bản 1.x. Kết quả trong `release/WhiteboardStudio-Windows-x64`. Bộ VieNeu không bị ép tải khi build, người dùng cài thêm trong ứng dụng. `data`, `models` và môi trường máy build không đưa vào ZIP portable phân phối. Gói mã nguồn riêng này giữ `.env` theo cấu hình/khóa bạn yêu cầu; `.env.example` vẫn là mẫu không có khóa.

Giữ toàn bộ dữ liệu dự án và model của bản đang dùng trước khi cập nhật. Nên thử trên bản sao thư mục rồi mở lại một dự án cũ, nghe thử và xuất video ngắn trước.

## Phạm vi kiểm tra

Đã kiểm tra logic/HTTP và UI trên Chromium trong Linux, xuất H.264 thật ở các tỷ lệ (có khung dọc 1080×1920), màu nền tự động/thủ công từ khung đầu, lưu vùng khoanh, chuyển hình và sự tồn tại của gói SDK 3.8.3. Adapter VieNeu được đối chiếu API trong wheel thực và kiểm tra giao tiếp/tái dùng model/hủy/WAV bằng SDK giả lập. Chưa tải và đo chất lượng model VieNeu thật hoặc chạy GPU NVIDIA; chưa build/chạy EXE Windows trực tiếp trong môi trường này. Bộ cài sẽ kiểm tra phát âm thật ngay trên máy cài trước khi báo sẵn sàng.

Nguồn kỹ thuật: https://github.com/pnnbao97/VieNeu-TTS ; https://docs.vieneu.io/docs/sdk/overview/ ; https://docs.vieneu.io/docs/sdk/standard-mode/ . VieNeu SDK Apache-2.0; giữ thông tin giấy phép và model card đi kèm thư viện/model khi phân phối.
