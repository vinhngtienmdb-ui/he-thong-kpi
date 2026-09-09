# HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ CHẤM ĐIỂM KPI HÀNG THÁNG / QUÝ
## (Chuẩn hóa theo Biểu mẫu Ban Tổ chức Thành ủy & Quy định số 366-QĐ/TW)

Hệ thống số hóa toàn bộ quy trình: **Import Danh mục Chuẩn -> Phân công / Tự đăng ký việc -> Theo dõi thực hiện & Nộp minh chứng -> Chấm điểm thẩm định -> Xuất Báo cáo Excel chuẩn**.

---

## 🚀 Hướng dẫn Khởi chạy Nhanh

### Cách 1: Chạy bằng file `start.bat` (Khuyên dùng trên Windows)
- Nhấp đúp chuột vào file **`start.bat`** tại thư mục gốc `D:\KPI`.
- Hệ thống sẽ tự động mở đồng thời Backend API (Port 5000) và Frontend Web UI (Port 3000) rồi tự mở trình duyệt tại `http://localhost:3000`.

### Cách 2: Chạy bằng dòng lệnh Terminal
```bash
# Cửa sổ 1: Chạy Backend
cd d:\KPI\backend
node server.js

# Cửa sổ 2: Chạy Frontend
cd d:\KPI\frontend
npm run dev
```
Truy cập: **http://localhost:3000**

---

## 📋 Các Tính năng & Quy trình Nghiệp vụ

### 1. Nạp Danh mục Công việc Chuẩn (Import Excel)
- Hỗ trợ nạp trực tiếp file mẫu **`mau-import-new-san-pham-cong-viec-chuan.xlsx`** hoặc file Excel cập nhật của đơn vị.
- Tự động nhận diện:
  - Tên công việc & Kết quả đầu ra (báo cáo, công văn, tờ trình, kế hoạch...)
  - Phân loại: Thường xuyên (Điểm chuẩn = 10) / Đột xuất (Điểm chuẩn = 12)
  - Hệ số độ khó (HSĐK): 100% (1.0), 110% (1.1), 120% (1.2)
  - Điểm quy đổi tối đa = Điểm chuẩn × Hệ số độ khó
  - Tự động phân loại vào **6 Trục kết quả trọng tâm**.

### 2. Phân công Giao việc & Tự đăng ký việc
- **Cán bộ Quản lý (CBQL)**: Chọn nhân viên cấp dưới, chọn công việc từ danh mục chuẩn (hoặc nhập công việc mới phát sinh), thiết lập thời hạn, hệ số độ khó.
- **Cán bộ Nhân viên (CBNV)**: Chủ động chọn công việc chuẩn mình phụ trách hoặc đề xuất việc mới để đăng ký -> Gửi CBQL duyệt.
- **Phê duyệt**: CBQL xem danh sách việc đăng ký, điều chỉnh hệ số độ khó và bấm Duyệt/Từ chối.

### 3. Thực hiện & Cập nhật Minh chứng
- Cán bộ cập nhật ngày hoàn thành thực tế. Hệ thống tự động so sánh với thời hạn (deadline) để xác định:
  - *Đúng hoặc trước hạn*: Tiến độ = 100%
  - *Chậm 1 - 3 ngày*: Tiến độ = 80%
  - *Chậm 4 - 5 ngày*: Tiến độ = 60%
  - *Chậm > 5 ngày*: Tiến độ = 0%
- Nhập số ký hiệu văn bản ban hành, báo cáo (Ví dụ: `1506-CV/BTCTU ngày 23/4/2026`).
- Tải lên tệp đính kèm minh chứng (PDF, Word, File scan có dấu đỏ...).

### 4. Chấm điểm KPI theo Cách 3 (Cách tối ưu)
- **Công thức tính điểm từng sản phẩm**:
  $$\text{Lãnh đạo, điều hành \%} = \frac{\text{Số lượng \%} + \text{Tiến độ \%} + \text{Chất lượng \%}}{3}$$
  $$\text{Điểm thực hiện} = \text{Điểm chuẩn} \times (10\% \times \text{Số lượng} + 20\% \times \text{Tiến độ} + 60\% \times \text{Chất lượng} + 10\% \times \text{Lãnh đạo})$$
  $$\text{Điểm quy đổi} = \text{Điểm thực hiện} \times \text{Hệ số độ khó}$$

- **Thang điểm 100 gồm 2 phần**:
  - **Phần I: Nhóm tiêu chí chung (30 điểm)**: Đánh giá 17 tiêu chuẩn chính trị, đạo đức, lối sống, trách nhiệm nêu gương, tự soi tự sửa theo Quy định 366-QĐ/TW.
  - **Phần II: Kết quả thực hiện nhiệm vụ theo 6 trục (70 điểm)**: Tổng hợp từ điểm quy đổi các công việc thuộc từng trục.
  - **Tổng điểm** = Điểm Phần I + Điểm Phần II.

- **Điều kiện Xếp loại**:
  - $\ge 90$ điểm: **Hoàn thành xuất sắc nhiệm vụ** *(Hệ thống tự động kiểm tra điều kiện bắt buộc: phải có trên 30% nhiệm vụ vượt tiến độ)*.
  - $80 - <90$ điểm: **Hoàn thành tốt nhiệm vụ**.
  - $60 - <80$ điểm: **Hoàn thành nhiệm vụ**.
  - $< 60$ điểm: **Không hoàn thành nhiệm vụ**.

### 5. Xuất Báo cáo Excel chuẩn `DANH MỤC CBQL.xlsx`
- Bấm nút **"Xuất Báo cáo Excel (DANH MỤC CBQL.xlsx)"** trên giao diện để tải về file Excel hoàn chỉnh gồm 2 Sheet:
  1. **Sheet `BẢNG TÍNH ĐIỂM (3)`**: Bảng chi tiết toàn bộ công việc chia theo 6 trục, điểm chuẩn, HSĐK, các cột %, điểm thực hiện, điểm quy đổi, dòng tổng điểm A, tổng điểm B và KPI % của từng trục.
  2. **Sheet `BẢN TỰ ĐÁNH GIÁ`**: Đầy đủ Quốc hiệu, Tiêu ngữ, Thông tin cá nhân, Bảng điểm Phần I (30 điểm), Bảng điểm Phần II (70 điểm theo 6 trục), Điểm tổng cộng, Đề xuất xếp loại, Nhận xét của cấp có thẩm quyền và khối chữ ký.
