# HỆ THỐNG QUẢN LÝ CÔNG VIỆC VÀ CHẤM ĐIỂM KPI HÀNG THÁNG / QUÝ
## (Chuẩn hóa theo Công văn số 3818-CV/BTCTU, Hướng dẫn số 06-HD/BTCTU & Quy định số 366-QĐ/TW)

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

## 📋 Các Tính năng & Quy trình Nghiệp vụ (Công văn số 3818-CV/BTCTU)

### 1. Nạp Danh mục Công việc Chuẩn (Import Excel)
- Hỗ trợ nạp trực tiếp file mẫu **`mau-import-new-san-pham-cong-viec-chuan.xlsx`** hoặc file Excel cập nhật của đơn vị.
- Tự động nhận diện:
  - Tên công việc & Kết quả đầu ra (báo cáo, công văn, tờ trình, kế hoạch...)
  - **Phân loại**: Thống nhất **chỉ còn loại công việc Thường xuyên** với **Điểm chuẩn = 10 điểm** (không còn loại công việc Đột xuất).
  - **Hệ số độ khó (HSĐK)**: 100% (1.0 - thông thường), 110% (1.1 - phối hợp nhiều đơn vị/khối lượng chuyên môn cao), 120% (1.2 - nhiệm vụ trọng tâm, then chốt, đặc biệt quan trọng).
  - **Điểm quy đổi tối đa** = Điểm chuẩn × Hệ số độ khó.
  - Tự động phân loại vào **6 Trục kết quả trọng tâm**.

### 2. Phân công Giao việc & Tự đăng ký việc
- **Cán bộ Quản lý (CBQL)**: Chọn nhân viên cấp dưới, chọn công việc từ danh mục chuẩn (hoặc nhập công việc mới phát sinh), thiết lập thời hạn, hệ số độ khó.
- **Cán bộ Nhân viên (CBNV)**: Chủ động chọn công việc chuẩn mình phụ trách hoặc đề xuất việc mới để đăng ký -> Gửi CBQL duyệt trong vòng 03 ngày.
- **Phê duyệt**: CBQL xem danh sách việc đăng ký, điều chỉnh hệ số độ khó và bấm Duyệt/Từ chối.

### 3. Thực hiện & Cập nhật Minh chứng
- Cán bộ cập nhật ngày hoàn thành thực tế. Hệ thống tự động so sánh với thời hạn (deadline) theo ngày làm việc để xác định:
  - *Đúng hoặc trước hạn*: Tiến độ = 100%
  - *Chậm 1 - 3 ngày làm việc*: Tiến độ = 80%
  - *Chậm 4 - 5 ngày làm việc*: Tiến độ = 60%
  - *Chậm > 5 ngày làm việc hoặc không hoàn thành*: Tiến độ = 0%
- Cán bộ tự đánh giá mức độ hoàn thành chất lượng kết quả theo 5 mức: 100%, 75%, 50%, 25%, 0%.
- Nhập số ký hiệu văn bản ban hành, báo cáo (Ví dụ: `1506-CV/BTCTU ngày 23/4/2026`).
- Tải lên tệp đính kèm minh chứng (PDF, Word, File scan có dấu đỏ...).

### 4. Chấm điểm KPI Chuẩn Hóa Theo Công Văn Số 3818-CV/BTCTU
- **Công thức tính điểm từng sản phẩm**:
  $$\text{Điểm thực hiện} = \text{Điểm chuẩn (10)} \times (30\% \times \text{Tiến độ \%} + 70\% \times \text{Kết quả \%})$$
  $$\text{Điểm quy đổi thực tế} = \text{Điểm thực hiện} \times \text{Hệ số độ khó}$$
  *(Điểm thực hiện tối đa 10 điểm; Điểm quy đổi thực tế không vượt quá Điểm quy đổi tối đa)*.

- **Điểm KPI công việc trong kỳ (Phần B, tối đa 70 điểm)**:
  $$\text{Điểm KPI công việc} = 70 \times \frac{B}{A}$$
  *(Trong đó: $A$ là Tổng điểm quy đổi tối đa theo kế hoạch đã lập đầu kỳ; $B$ là Tổng điểm quy đổi thực tế đạt được trong kỳ; Nếu $B > A$ thì Điểm KPI tính là 70 điểm)*.

- **Điểm thưởng (Phần C, tối đa 7 điểm)**:
  - Công việc có thành tích nổi trội, sáng kiến được tính thưởng bằng **5% điểm quy đổi thực tế** của công việc đó.
  - Tổng điểm thưởng tối đa không quá **7 điểm**.

- **Thang điểm 100 gồm 3 phần**:
  - **Phần A: Nhóm tiêu chí chung (30 điểm)**: Đánh giá theo Quy định 366-QĐ/TW.
  - **Phần B: Kết quả thực hiện nhiệm vụ (70 điểm)**: Tính theo công thức $70 \times \frac{B}{A}$.
  - **Phần C: Điểm thưởng (tối đa 7 điểm)**.
  - **Tổng điểm đạt được** = Phần A + Phần B + Điểm thưởng *(tối đa 100 điểm)*.

- **Tiêu chí Xếp loại (Khoản 7.2 Công văn 3818-CV/BTCTU)**:
  - $\ge 90$ điểm: **Hoàn thành xuất sắc nhiệm vụ** *(Điều kiện bắt buộc: Hoàn thành 100% nhiệm vụ đúng hạn, có ít nhất 30% nhiệm vụ hoàn thành vượt mức cả tiến độ và chất lượng)*.
  - $70 - <90$ điểm: **Hoàn thành tốt nhiệm vụ** *(Hoàn thành 100% nhiệm vụ đúng hạn, đảm bảo chất lượng)*.
  - $50 - <70$ điểm: **Hoàn thành nhiệm vụ** *(Số nhiệm vụ chưa bảo đảm tiến độ - tiến độ 0% không vượt quá 20%)*.
  - $< 50$ điểm: **Không hoàn thành nhiệm vụ** *(Tổng điểm dưới 50 hoặc số việc chậm tiến độ vượt quá 20% hoặc có vi phạm kỷ luật)*.

### 5. Xuất Báo cáo Excel chuẩn `DANH MỤC CBQL.xlsx` & Báo Cáo Word
- Bấm nút **"Xuất Báo cáo Excel (DANH MỤC CBQL.xlsx)"** trên giao diện để tải về file Excel hoàn chỉnh gồm 2 Sheet:
  1. **Sheet `BẢNG TÍNH ĐIỂM (3)`**: Bảng chi tiết toàn bộ công việc chia theo 6 trục, điểm chuẩn 10, HSĐK, tiến độ %, kết quả %, điểm thực hiện, điểm quy đổi thực tế, cột đánh dấu công việc vượt mức, dòng tổng điểm A, tổng điểm B và KPI % của từng trục.
  2. **Sheet `BẢN TỰ ĐÁNH GIÁ`**: Đầy đủ Quốc hiệu, Tiêu ngữ, Thông tin cá nhân, Bảng điểm Phần A (30 điểm), Bảng điểm Phần B (70 điểm), Điểm thưởng, Điểm tổng cộng, Đề xuất xếp loại, Nhận xét của cấp có thẩm quyền và khối chữ ký.
