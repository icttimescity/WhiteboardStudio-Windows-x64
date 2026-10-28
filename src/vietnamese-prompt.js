import {formatOf} from '../public/formats.js';
export const negativeVi = 'Nhân vật bị nhân đôi, người thừa, khuôn mặt/tóc/trang phục không nhất quán, thừa chi, hình mờ, chi tiết trang trí không liên quan.';
export function vietnameseScenePrompt(p, profile, s, {style, characters, environment, attachments, index, workflowNote, negative}) {
 const names=items=>items.map(c=>`${c.name || c.id} [${c.id}]: ${c.appearance}`).join('\n') || 'Chưa có hồ sơ.';
 const roster=(s.cast||[]).map(c=>`${profile.characters.find(x=>x.id===c.id)?.name||c.id}: ${c.count}`).join('; ');
 const level={primary:'Tiểu học',secondary:'THCS / THPT',adult:'Người lớn'}[p.audience]||'Tiểu học';
 return `Tạo MỘT ảnh minh họa mới, tỉ lệ ${p.aspectRatio||"16:9"}, cho cảnh ${index}/${p.scenes.length} của dự án “${p.title}”. Mã loạt ảnh: ${p.id}.
TỶ LỆ ƯU TIÊN: ${p.aspectRatio||"16:9"}. Nếu hồ sơ cũ có tỷ lệ khác, luôn dùng tỷ lệ ưu tiên này.
NGÔN NGỮ: Hiểu toàn bộ mô tả bằng tiếng Việt. Nếu cần chữ trong ảnh, giữ nguyên tiếng Việt có dấu và nội dung được trích dẫn; không tự dịch sang tiếng Anh.
MỤC TIÊU: ${p.contentMode==='explain'?'GIẢI THÍCH KIẾN THỨC':'KỂ CHUYỆN'}. Đối tượng: ${level}.
${p.contentMode==='explain'?'Minh họa chính xác ý trong lời kể bằng sơ đồ, quy trình, so sánh trước/sau, nguyên nhân/kết quả, cấu tạo hoặc mô hình đếm phù hợp. Bố cục theo thứ tự học, phân nhóm và mã màu rõ ràng; mũi tên phải có ý nghĩa. Giữ đúng số lượng, trình tự và quan hệ; không bịa kiến thức, phép tính, số liệu hoặc cấu tạo. Có thể lặp đồ vật để mô tả các bước hay trường hợp so sánh; không nhân đôi nhân vật. Chỉ dùng nhãn ngắn có nguyên văn trong lời kể, không thêm người dẫn chuyện nếu không cần.':'Một khoảnh khắc thống nhất, một bố cục liên tục. Minh họa hành động và cảm xúc đúng lời kể. Mỗi nhân vật riêng lẻ xuất hiện đúng một lần; không nhân bản khuôn mặt/cơ thể, chia khung truyện, ghép nhiều thời điểm, phản chiếu lặp nhân vật hoặc thêm người để lấp chỗ trống. Không thêm chữ vào ảnh.'}
PHONG CÁCH CỐ ĐỊNH:
${style}
HỒ SƠ NHÂN VẬT (chỉ xác định tạo hình, không yêu cầu tất cả cùng xuất hiện):
${characters||names(profile.characters)}
NHÂN VẬT XUẤT HIỆN TRONG CẢNH: ${Array.isArray(s.cast)?(roster||'Không có nhân vật.'): 'Chưa có danh sách; chỉ vẽ người/động vật cần cho lời kể cảnh này, không đưa toàn bộ hồ sơ vào ảnh.'}
Giữ nguyên khuôn mặt, tóc/lông, trang phục, màu sắc, tỷ lệ và dấu hiệu nhận diện. Hồ sơ cố định được ưu tiên nếu mô tả cảnh có tính từ mâu thuẫn.
BỐI CẢNH CỐ ĐỊNH:
${environment||names(profile.environments||[])}
Giữ kiến trúc, vị trí đồ vật chính, địa hình, thời điểm, ánh sáng và bảng màu của địa điểm lặp lại. Chỉ dùng địa điểm cần cho cảnh hiện tại; không gộp mọi địa điểm vào một ảnh. Chỉ thay đổi theo yêu cầu của lời kể.
MÔ TẢ CẢNH:
${s.prompt?.trim()||s.text}
LỜI KỂ CẦN MINH HỌA:
${s.text}
${s.visualPlan?`KẾ HOẠCH MINH HỌA: ${s.visualPlan.goal}. Nhãn được phép: ${(s.visualPlan.labels||[]).join('; ')||'Không có'}.`:''}
ẢNH THAM CHIẾU CẦN ĐÍNH KÈM:
${attachments.map(a=>`${a.file} — ${a.label} (${({character:'nhân vật',style:'phong cách',environment:'bối cảnh','identity/style anchor':'neo tạo hình/phong cách',continuity:'liên tục cảnh'})[a.role]||a.role})`).join('\n')||'Chưa có ảnh mẫu. Nên tạo và đính kèm ảnh mẫu đã duyệt trước.'}
Ảnh mẫu nhân vật chỉ khóa danh tính; ảnh phong cách khóa nét, màu và chất liệu; ảnh bối cảnh khóa kiến trúc, bố trí và ánh sáng. Không sao chép nguyên bố cục ảnh mẫu hoặc mang vào nhân vật vắng mặt. Luôn dùng lại ảnh mẫu gốc, ảnh cảnh trước chỉ bổ sung ngữ cảnh. ${workflowNote}
CẦN TRÁNH: ${negative||negativeVi}`;
}
