# Bản 1.6.4 — bộ cài Piper độc lập

- Sửa lỗi ERR_MODULE_NOT_FOUND dotenv khi chạy setup-piper-windows.bat trên thư mục chưa npm install. Bộ cài Python/Piper chỉ dùng module tích hợp của Node, đọc .env bằng Node; không cần node_modules hoặc npm để cài riêng Piper.
- Tệp BAT kiểm tra Node >=22, kiểm tra đủ tệp nguồn, làm việc đúng thư mục kể cả tên có dấu/khoảng trắng. Chạy sau khi đã giải nén toàn bộ ZIP.
- Tự tìm Python 3.12 64-bit, sao lưu .venv cũ nếu không dùng được; giữ data/models. Khôi phục pip nếu thiếu. Nếu Piper 1.3.0 đã import được, chỉ kiểm tra doctor, không nâng pip/tải lại thư viện.
- Cần Windows 64-bit, Node.js >=22, Python 3.12 64-bit và Internet ở lần tải thư viện/model. Không bảo đảm chạy trên mọi cấu hình hoặc máy bị chính sách quản trị chặn; bộ cài sẽ báo thành phần thiếu/lỗi. Chưa chạy BAT trực tiếp trên Windows trong lượt này.

Cập nhật từ 1.6.3: tắt ứng dụng, chép đè mã nguồn mới nhưng giữ .env, data, models và .venv. Nhấp đúp setup-piper-windows.bat. Để cài toàn bộ ứng dụng, chạy setup-windows.bat; để mở ứng dụng, chạy start-windows.bat. Chưa cần tải giọng lại nếu giọng cũ đã hợp lệ.

# Cập nhật 1.6.2 — sửa lỗi .venv-tts ENOENT

npm run setup trước đây chỉ cài bộ render vào .venv, nhưng Piper lại tìm .venv-tts. Bản này dùng chung .venv và lệnh setup cài cả hai. Đường dẫn PIPER_PYTHON_PATH không còn tồn tại sẽ được bỏ qua; môi trường portable đi kèm EXE vẫn được ưu tiên. Không cần xóa data hoặc models.

## Chạy bằng CMD trên Windows

1. Đóng server cũ bằng Ctrl+C. Giải nén mã nguồn mới vào thư mục riêng; giữ .env hiện dùng, sao chép data và models cũ nếu muốn giữ dự án/giọng.
2. Mở CMD ở thư mục có package.json, chạy:

```bat
npm install
npm run setup
npm start
```

Cần Python 3.12 64-bit trên máy phát triển. Chờ tới dòng CAI DAT RENDER VA PIPER THANH CONG. Nếu chỉ sửa Piper có thể chạy npm run setup:tts. Không phải sửa PYTHON_PATH theo tên máy; không cần tạo .venv-tts thủ công. Setup cần mạng tải thư viện; tải giọng cũng cần mạng, tổng hợp sau khi tải chạy cục bộ.

3. Mở Quản lý / tải giọng, bấm Tải lại giọng từng lỗi. Giọng đã tải và dự án cũ được giữ.

Không chỉ copy file setup từ bản mới sang mã nguồn cũ; cần cập nhật cả src, scripts, public và views. Với bản EXE hãy build lại đầy đủ bằng npm run build:desktop.

---

# Thay đổi 1.3.0

`setup-piper-windows.bat` chỉ cài bộ Piper. Tải từng giọng trong **Quản lý / tải giọng**. Giọng đã tải được giữ nguyên. Các chỉ dẫn cũ về tự tải mọi model không còn áp dụng. Xem DESKTOP-HUONG-DAN.md cho bản portable.

# Cập nhật 1.2.0 — Đồng bộ và giọng nam

Tắt ứng dụng, chép đè `src`, `public`, `views`, `scripts`, `tests`, `package.json`, `package-lock.json`, `setup-piper-windows.bat` vào thư mục cũ. Giữ `.env`, `.venv`, `.venv-tts`, `models`, `data`. Chạy `npm install`, chạy lại `setup-piper-windows.bat` để tải bổ sung model, rồi `npm start`. Model cũ hợp lệ không tải lại. Cần tải bổ sung khoảng 140 MB model.

## Cách sử dụng đề xuất
1. Chọn **Việt — Nam Quang Huy** hoặc **Việt — Nữ Ngọc Lan**. Giữ được giọng VAIS1000 cũ. Tiếng Anh có thêm **Male HFC**.
2. Chọn tốc độ **0.85×**, nhịp **Thuyết minh** hoặc **Chậm rãi**. Thuyết minh chèn khoảng nghỉ 220 ms giữa các câu do Piper tách; Chậm rãi dùng 350 ms. Xuống dòng dùng khoảng nghỉ giữa đoạn (mặc định mới 450 ms).
3. Muốn đổi toàn dự án: bấm **Áp dụng giọng / nhịp cho mọi cảnh**, sau đó **Tạo lời đọc còn thiếu / đã sửa**. Chỉ những cảnh có thiết lập thay đổi mới cần tạo lại. Ảnh không bị tạo lại.
4. Chọn chế độ đồng bộ, xem dòng thời lượng gốc và thời lượng khi xuất dưới phần lời đọc. Trình nghe thử phát WAV gốc; **Xem trước thật** phát video đã đồng bộ.

## Ba chế độ đồng bộ
- **Cân bằng tự động** (mặc định): điều chỉnh âm thanh trong khoảng 0.85–1.10× bằng FFmpeg atempo để giữ cao độ; sau đó co/giãn cảnh theo tiếng thực tế. Không giữ cảnh dài dư như bản 1.1.0.
- **Cảnh theo lời đọc**: giữ nguyên tốc độ WAV, cảnh dài bằng tiếng + 0.5 giây nghỉ đầu/cuối.
- **Giữ thời gian cảnh**: co/giãn tiếng để khớp thời lượng gốc; chỉ chấp nhận tỷ lệ 0.70–1.20×. Nếu vượt giới hạn thì báo lỗi để chỉnh lời đọc, không cắt mất câu. Kéo chậm nhiều có thể làm giọng kém tự nhiên; nên ưu tiên Cân bằng.

Ví dụ cảnh 28.6 giây và WAV 20 giây: Cân bằng cho tiếng khoảng 23.53 giây, cảnh 24.03 giây; Cảnh theo lời đọc cho cảnh 20.5 giây; Giữ thời gian cảnh cho tiếng 28.1 giây và cảnh 28.6 giây.

Hiệu ứng vẽ và phụ đề được tính lại theo timeline xuất. Bản gốc vẫn giữ nguyên. Với cảnh có nhiều vùng vẽ, ứng dụng giữ thời lượng tối thiểu đủ 100 ms/vùng và khoảng nghỉ cuối; câu quá ngắn vẫn có thể có thêm thời gian để vẽ. Phụ đề chia theo độ dài văn bản, chưa căn chính xác từng từ.

WAV từ 1.1.0 vẫn dùng được để xuất với đồng bộ mới. Muốn áp dụng giọng hoặc nhịp mới cần tạo lại phần âm thanh. Piper chưa có điều khiển cảm xúc diễn xuất vui/buồn: các lựa chọn mới cải thiện tốc độ và ngắt nghỉ, không bảo đảm biểu cảm như giọng người thu.

---
Hướng dẫn cơ bản của bản 1.1.0 (các chế độ đồng bộ phía trên thay thế mô tả cũ):

# Whiteboard Studio 1.1.0 — Lời đọc Piper

## Cập nhật bản đang dùng trên Windows
1. Tắt ứng dụng (Ctrl+C trong cửa sổ server).
2. Chép đè các thư mục `src`, `public`, `views`, `scripts`, `tests` và các file `package.json`, `package-lock.json`, `setup-piper-windows.bat` từ bản ZIP mới vào thư mục dự án hiện tại.
3. Giữ nguyên `.env`, `.venv`, `data` của bạn. Không cần chạy lại setup bộ render đang hoạt động.
4. Trong thư mục dự án chạy `npm install`.
5. Bấm đúp `setup-piper-windows.bat` (hoặc chạy `npm run setup:tts`). Cần Internet lần đầu để tải thư viện và hai model (~126 MB tổng dung lượng model, chưa tính thư viện). Script tự tìm Python 3.12 64-bit và tạo `.venv-tts` riêng, không sửa `.venv` render.
6. Chờ thông báo `PIPER DA SAN SANG`, rồi chạy `npm start` hoặc `start-windows.bat`.

Nếu cài mới hoàn toàn: chạy `setup-windows.bat` để cài phần mềm/render, tiếp theo `setup-piper-windows.bat`, cuối cùng `start-windows.bat`.

## Tạo video có lời đọc
- Chọn một cảnh, tìm mục **Lời đọc Piper**.
- Nội dung đọc mặc định lấy từ lời kể. Có thể sửa riêng và chọn **Tiếng Việt — VAIS1000** hoặc **English (US) — Lessac**.
- Chỉnh tốc độ; xuống dòng để chia đoạn. Khoảng nghỉ (ms) được chèn giữa các đoạn xuống dòng. Dấu câu trong một đoạn do Piper xử lý; không phải mọi dấu phẩy đều nghỉ đúng một thời gian cố định.
- **Tạo / tạo lại lời đọc cảnh này** chỉ chạy cảnh đang chọn. **Tạo lời đọc còn thiếu / đã sửa** bỏ qua các cảnh có âm thanh khớp nội dung và thiết lập.
- Nghe thử bằng trình phát ở ngay dưới. Mỗi cảnh chọn một giọng/ngôn ngữ, chưa tự chuyển giọng trong câu song ngữ.
- Tại phần xuất video chọn **Lời đọc Piper theo cảnh**. Phải có lời đọc hợp lệ cho tất cả cảnh. Chọn **Tự giãn cảnh để đọc hết** (mặc định), hoặc **Giữ thời gian gốc** (báo lỗi nếu không đủ thời gian).
- Bấm **Xem trước thật** hoặc **Xuất MP4**. Video dùng âm thanh AAC.
- **Tải phụ đề SRT** sử dụng cùng nguồn âm thanh và chế độ thời lượng đang chọn. Với Piper, phụ đề được phân bổ theo độ dài văn bản; chưa căn theo từng từ bằng nhận dạng giọng nói.

## Cách lưu và phục hồi
Âm thanh WAV được lưu theo cảnh trong `data`. Kết quả thành công được giữ nguyên, lỗi một cảnh không chặn cảnh kế tiếp. Nút **Thử lại phần lỗi / chưa xong** tiếp tục phần chưa hoàn thành. Tạo lại thất bại giữ file cũ để nghe; nếu nội dung đã đổi thì không xuất bằng file cũ. Giọng mới cùng thiết lập nếu thất bại có thể vẫn dùng bản cũ còn hợp lệ.

Tự giãn chỉ áp dụng lên bản xuất: tăng thời lượng cảnh khi cần, dời cảnh sau và giãn hiệu ứng vẽ. Thời lượng gốc và vùng vẽ đã chỉnh vẫn được giữ. Mỗi cảnh có 150 ms đầu và ít nhất 350 ms cuối ngoài file lời đọc. Tổng video tối đa 10 phút.

Nếu đã tải lời đọc riêng lên, chọn **File lời đọc tải lên**. Nếu muốn video im lặng, chọn **Không âm thanh**. Hai nguồn không trộn với nhau.

## Khắc phục sự cố
- Chưa sẵn sàng Piper: chạy lại `setup-piper-windows.bat`, xem lỗi trong cửa sổ rồi khởi động lại ứng dụng.
- Mạng đứt khi tải model: chạy lại setup; model hợp lệ được giữ, file tải lỗi được tải lại và kiểm tra checksum.
- Không cần API key cho Piper. Sau khi cài xong, tạo giọng hoạt động offline trên CPU; tạo ảnh Agnes vẫn cần mạng.
- Không cần điền đường dẫn Python. `PIPER_PYTHON_PATH` chỉ dành cho cấu hình nâng cao khi muốn dùng môi trường khác.
- Piper không có chế độ cảm xúc kiểu vui/buồn. Sử dụng tốc độ, dấu câu, xuống dòng và nghe thử để chỉnh nhịp đọc.

## Kiểm thử
`npm test`: kiểm thử logic và UTF-8 (cần Python phần render cho kiểm thử UTF-8).
`npm run test:api`: API, render và tải video.
`npm run test:tts`: cần cài Piper/model; tạo giọng Việt và Anh thực, tái tạo riêng cảnh, giãn thời lượng, xuất MP4 và kiểm tra luồng AAC không im lặng.
