# LỊCH SỬ CẬP NHẬT HỆ THỐNG (CHANGELOG)
Hệ thống Đánh giá Hiệu quả Công việc (KPI) theo Quy định số 366-QĐ/TW & Hướng dẫn số 06-HD/BTCTU

---

## [Phiên bản 5.4] - 12/09/2026 - 09:10 (Bản phát hành mới nhất)
### Bổ sung Tính năng Xuất Báo cáo theo File Word (.docx) cho Toàn bộ các Trường Xuất Báo Cáo

- **Xuất file Word (.docx) cho Bản tự đánh giá (Mẫu 01-A cho CBQL, Mẫu 01-B cho CBNV):**
  - Tự động nhận diện đối tượng cán bộ (Lãnh đạo quản lý &rarr; Mẫu 01-A, Chuyên viên/Nhân viên &rarr; Mẫu 01-B).
  - Trình bày đầy đủ thể thức: Quốc hiệu, Tiêu ngữ, Cơ quan cấp trên, Tên cơ quan, Ngày tháng hành chính, Thông tin cán bộ và 17 tiêu chuẩn chính trị, đạo đức, tác phong (30 điểm).
  - Kèm bảng tổng hợp kết quả công việc (70 điểm) theo công thức Hướng dẫn 06-HD/BTCTU, điểm thưởng (+5%), danh sách chi tiết các nhiệm vụ trong quý, ý kiến nhận xét của cấp quản lý và phần chữ ký 2 bên.
- **Xuất file Word (.docx) Báo cáo kết quả thực hiện nhiệm vụ công việc:**
  - Trình bày phân nhóm chi tiết toàn bộ các nhiệm vụ theo 6 trục kết quả, thống kê số lượng nhiệm vụ thường xuyên / đột xuất, điểm quy đổi, điểm thưởng và trạng thái hoàn thành.
- **Xuất file Word (.docx) Báo cáo Mẫu 02 (Tổng hợp xếp loại toàn cơ quan):**
  - Định dạng khổ giấy **A4 nằm ngang (Landscape)** dàn đều 13 cột tiêu chuẩn, phân tách 3 khối đối tượng: *Khối Công chức, Khối Viên chức, Khối Người lao động*.
  - Bao gồm bảng tổng hợp tỷ lệ xếp loại theo từng khối đối tượng và kiểm soát trần khống chế **≤ 20%** Hoàn thành xuất sắc nhiệm vụ.
- **Tích hợp vào nút menu gộp "🖨️ In & Xuất Báo cáo ▾":**
  - Người dùng có thể dễ dàng chọn **"📝 Xuất Word (.docx)"** ngay cạnh các chức năng *In báo cáo, Xuất PDF, Xuất Excel*, tự động tải đúng mẫu biểu tương ứng với màn hình đang xem.

---

## [Phiên bản 5.3] - 12/09/2026 - 08:50
### Xuất File Excel Danh Sách Người Dùng, Tối Ưu Nút Báo Cáo & Định Dạng Khổ Giấy A4 Times New Roman 14pt, Chuẩn Hóa Tên Chức Năng Cấu Hình & Nhật Ký Hoạt Động (Logs)

- **Xuất file Excel danh sách người dùng & cán bộ nhân viên:** Hỗ trợ xuất đầy đủ 14 cột tiêu chuẩn thông tin cán bộ theo bộ lọc hiện hành.
- **Gộp tính năng Báo cáo & Chuẩn hóa Khổ A4 14pt:** Gộp nút In & Xuất Báo cáo với menu xổ xuống, dàn đều hàng ngang không tràn mép.
- **Chuẩn hóa Tên chức năng Cấu hình:** Quản lý đơn vị, Quản lý phân quyền, Quản lý chu kỳ đánh giá, Backup.
- **Nhật ký hoạt động (Logs):** Bổ sung phân hệ 5. Nhật ký hoạt động (Logs) cập nhật thời gian thực ● LIVE (3s).

---

## [Phiên bản 5.2] - 12/09/2026 - 00:20
### Cập nhật Trạng thái Hoàn thành Văn bản, Cơ chế Gán Quyền Văn thư, Khắc phục Phân quyền Động CBQL, Chuẩn hóa Danh mục theo Quý & Sắp xếp Cây Đơn vị Thứ bậc

- **Xử lý Hoàn thành văn bản sau khi kết thúc công việc:**
  - Bổ sung nút bấm **"Hoàn thành"** trực tiếp trên từng dòng danh sách văn bản, thẻ di động và trong Modal Xem chi tiết văn bản.
  - Hỗ trợ nhập ghi chú kết quả hoàn tất văn bản (tùy chọn) và tự động đồng bộ hoàn tất các lượt phân bổ liên quan của cán bộ.
  - Tích hợp trường chọn Trạng thái văn bản (*Chờ phân bổ, Đã trình Lãnh đạo, Đang xử lý, Hoàn thành*) ngay trong Modal Thêm mới và Chỉnh sửa văn bản; cho phép **"Mở lại"** văn bản bất cứ lúc nào khi cần bổ sung xử lý.
  - Cung cấp API `POST /api/documents/:id/complete` và `PUT /api/documents/:id/status`.

- **Cơ chế Phân quyền & Hướng dẫn gán quyền Cán bộ Văn thư:**
  - Khởi tạo vai trò chuẩn **Cán bộ Văn thư** (`role-van-thu`) sở hữu quyền đặc thù `can_submit_documents` (Trình văn bản cho Lãnh đạo).
  - Chỉ cán bộ có quyền Văn thư mới hiển thị nút và tính năng "Trình LĐ" tại phân hệ Quản lý & Phân bổ văn bản; đồng thời bảo vệ API backend `POST /api/documents/:id/submit-to-leader`.
  - **Cách gán quyền:** 
    - Cách 1: Quản trị viên vào **Quản lý người dùng** -> Chỉnh sửa tài khoản cán bộ -> Chọn Vai trò là **"Cán bộ Văn thư"**.
    - Cách 2: Vào **Cấu hình hệ thống** -> **Phân quyền vai trò** -> Bật quyền **"Trình văn bản cho Lãnh đạo"** cho vai trò tương ứng.

- **Khắc phục triệt để lỗi phân quyền động CBQL truy cập Quản lý người dùng & Cấu hình:**
  - Loại bỏ các rào cản kiểm tra tĩnh tại `UsersManagementTab` và `SystemConfigTab`; chuyển đổi thống nhất sang kiểm tra động theo `getUserPermissions(currentUser)`.
  - Khi Quản trị viên cấp thêm quyền `can_manage_users` hoặc `can_manage_system` cho vai trò CBQL, người dùng thuộc nhóm CBQL có quyền truy cập và thao tác ngay lập tức mà không gặp lỗi "Không đủ quyền" hoặc mã lỗi 403 Forbidden.
  - Tự động kích hoạt làm mới danh sách cán bộ và phân quyền hiện hành (`onReloadUsers`) ngay sau khi Quản trị viên lưu phân quyền vai trò.
  - Nâng cấp các API quản lý Đơn vị / Phòng ban (tạo, sửa, xóa, nhập Excel) tại backend từ `requireAdmin` sang `requireCanManageUsers` để cán bộ được giao quyền quản lý đơn vị/người dùng thao tác thuận tiện.

- **Danh mục công việc chuẩn áp dụng riêng biệt cho từng Quý:**
  - Chuẩn hóa dữ liệu toàn bộ 78 nhiệm vụ công việc chuẩn áp dụng riêng cho Quý III/2026 (`period_id = 'p-2'`).
  - Quý IV/2026 (`period_id = 'p-3'`) hiện chưa phát hành danh mục, hiển thị trạng thái thông báo trực quan, ngăn chặn việc hiển thị sai lệch hoặc tràn danh mục giữa các quý khác nhau.

- **Sắp xếp Cây Danh mục Đơn vị / Phòng ban theo thứ bậc từ cao xuống thấp:**
  - Tự động sắp xếp phân cấp theo hình cây (Topological Hierarchy): từ Đơn vị cao nhất (Thành ủy TP.HCM - Cấp 0) -> Đơn vị trực thuộc (Đảng ủy Phường An Đông - Cấp 1) -> Đơn vị cơ sở (Chi bộ Mầm non Hoàng Yến - Cấp 2).
  - Hiển thị thụt lề phân cấp trực quan, kèm nhãn cấp bậc trên cây quản lý cơ cấu tổ chức và danh mục phòng ban.

- **Phân định Thẩm quyền Phân công công việc & Bảo vệ Danh mục chuẩn:**
  - Chỉ người dùng có chức danh Lãnh đạo hoặc Cán bộ Quản lý (CBQL) mới có thẩm quyền phân công công việc tại phân hệ Giao việc (B1).
  - Cán bộ nhân viên (CBNV) bị khóa các nút sửa, xóa danh mục công việc chuẩn để bảo toàn tính toàn vẹn của danh mục chung.
  - Sau khi Lãnh đạo đã phân công công việc từ văn bản, nút "Phân công" tự động ẩn để tránh thao tác trùng lặp.

---

## [Phiên bản 5.1] - 11/09/2026 - 21:30
### Phân loại Đối tượng Công chức / Viên chức / Người Lao động, Tách Nhóm Báo cáo Mẫu 02, Cơ chế Phân quyền Động, Tối ưu Giao diện CBNV & Lọc Lãnh đạo Trực tiếp

- Phân loại Người dùng Công chức / Viên chức / Người lao động & Tách nhóm Báo cáo Mẫu 02.
- Phân định quyền hạn cho Cán bộ Nhân viên (CBNV) & Phân quyền động.
- Lọc Lãnh đạo trực tiếp theo Đơn vị công tác & Chuẩn hóa cấp bậc quản lý.
- Tinh gọn Hệ thống Báo cáo & Bảng Danh sách Đơn vị.

---

## [Phiên bản 5.0] - 11/09/2026 - 15:00
### Đổi tên Quản lý Người dùng, Cây Phân cấp Đơn vị & Hỗ trợ Đa chức vụ / Kiêm nhiệm

- Đổi tên phân hệ Quản lý phân quyền thành "Quản lý người dùng" đồng bộ trên toàn bộ giao diện.
- Quản lý người dùng theo Cây Phân Cấp Đơn vị (Hierarchical Unit Tree): hiển thị mã phân cấp chuẩn iCPV, lọc cán bộ theo đơn vị trực tiếp hoặc toàn bộ đơn vị con trực thuộc.
- Hỗ trợ Cán bộ Đa chức vụ / Kiêm nhiệm (Multi-position Support) tại một hoặc nhiều đơn vị theo chuẩn iCPV TP.HCM.

---

## [Phiên bản 4.9] - 11/09/2026 - 09:30
### Thiết kế Lại Giao diện Nộp Sản phẩm Công việc & Dự báo Điểm KPI Thời gian thực