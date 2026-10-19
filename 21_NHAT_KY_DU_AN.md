# NHẬT KÝ DỰ ÁN HỆ THỐNG KPI

### Ngày thực hiện: 2026-10-19

#### 1. Mục tiêu trong ngày:
- Đồng bộ và khôi phục mã nguồn chính xác của dự án Hệ thống KPI từ kho lưu trữ GitHub `vinhngtienmdb-ui/he-thong-kpi`.
- Phân tích và tiếp nhận các quy tắc mới về đánh giá, chấm điểm và xếp loại cán bộ theo Công văn số 3818-CV/BTCTU ngày 10/10/2026 của Ban Tổ chức Thành ủy Thành phố Hồ Chí Minh.
- Thiết lập bộ tài liệu quản lý cốt lõi của dự án và triển khai cập nhật toàn diện hệ thống.

#### 2. Các công việc đã xử lý:
- Tải về và đồng bộ thành công kho lưu trữ `vinhngtienmdb-ui/he-thong-kpi` vào thư mục làm việc `d:\KPI`.
- Đọc, trích xuất và phân tích toàn bộ 33 trang văn bản của Công văn số 3818-CV/BTCTU ngày 10/10/2026 về việc điều chỉnh, bổ sung Hướng dẫn số 06-HD/BTCTU.
- Khởi tạo tệp Mục lục bộ tài liệu thiết kế `index.md`, Nhật ký dự án `21_NHAT_KY_DU_AN.md`, Danh mục kiểm tra `22_DANH_MUC_KIEM_TRA.md` và Quy tắc nghiệp vụ `04_QUY_TAC_NGHIEP_VU.md`.
- **Backend**:
  - Chuẩn hóa loại công việc thành "Thường xuyên" và điểm chuẩn cố định 10 điểm cho mọi công việc (xóa bỏ mức 12 điểm của công việc đột xuất).
  - Cập nhật hàm tính điểm KPI, điểm thưởng 5% cho công việc vượt mức hoặc sáng kiến (tối đa 7 điểm thưởng).
  - Cập nhật logic tự động xếp loại (`autoRank`) và thống kê biểu đồ theo 4 ngưỡng chuẩn mới: Xuất sắc ($\ge 90$ kèm $\ge 30\%$ việc vượt mức), Tốt ($70 - <90$), Hoàn thành ($50 - <70$ kèm trễ hạn $\le 20\%$), Không hoàn thành ($<50$ hoặc trễ hạn $> 20\%$).
  - Cập nhật căn cứ pháp lý trong dịch vụ xuất Excel (`excelService.js`) và Word (`docxService.js`).
- **Frontend**:
  - Cập nhật giao diện tự đánh giá (`ExecutionTab.jsx`): nâng cấp 5 mức chất lượng kết quả (100%, 75%, 50%, 25%, 0%) kèm mô tả chi tiết; sửa công thức tính điểm dự kiến (Live Preview) theo chuẩn: $\text{Điểm chuẩn} \times (30\% \times \text{Tiến độ} + 70\% \times \text{Chất lượng}) \times \text{HSĐK}$.
  - Cập nhật giao diện thẩm định chấm điểm (`GradingTab.jsx`): cập nhật 5 mức chất lượng chuẩn hóa cho cán bộ quản lý chấm điểm.
  - Cập nhật tiêu chí xếp loại và căn cứ pháp lý trong màn hình Báo cáo (`ReportTab.jsx`).
  - Cập nhật toàn diện tài liệu hướng dẫn [README.md](file:///d:/KPI/README.md).
- **Kiểm thử**:
  - Chạy thành công kiểm thử backend `test-backend.js` (kiểm tra khởi tạo CSDL, nạp Excel, chấm điểm, xuất Excel).
  - Đóng gói (Build) thành công frontend Vite React không có lỗi.
- **Loại bỏ tệp mẫu tĩnh & Tự động hóa sinh tệp mẫu Excel**:
  - Triển khai hàm `generateStandardTaskTemplate()` trong `backend/excelService.js` sử dụng `exceljs` để sinh trực tiếp tệp mẫu Excel danh mục công việc chuẩn trong bộ nhớ RAM, kèm dữ liệu mẫu và định dạng chuẩn (không phụ thuộc tệp vật lý trên đĩa).
  - Cập nhật tuyến API `/api/standard-tasks/template` và `/api/standard-tasks/import` trong `backend/server.js` chuyển sang cơ chế sinh tệp động và yêu cầu người dùng đính kèm tệp khi tải lên.
  - Cập nhật tệp kiểm thử `backend/test-backend.js` kiểm tra trực tiếp luồng sinh tệp mẫu động và nhập dữ liệu vào cơ sở dữ liệu.
  - Loại bỏ hoàn toàn 9 tệp tĩnh định dạng `.xlsx` và `.pdf` khỏi thư mục gốc và thư mục con của dự án theo đúng yêu cầu người dùng.
- **Loại bỏ hoàn toàn loại công việc "Đột xuất"**:
  - Cập nhật cơ sở dữ liệu SQLite: chuyển toàn bộ 12 công việc "Đột xuất" (12 điểm) còn sót lại trong bảng `standard_tasks` thành "Thường xuyên" (10 điểm). Toàn bộ 486 công việc hiện tại đều là loại "Thường xuyên".
  - Loại bỏ các lựa chọn "Đột xuất" khỏi các modal và giao diện thêm mới, đề xuất, phân công công việc.
- **Bổ sung Module mới "Công việc cần xử lý"**:
  - Xây dựng component `frontend/src/components/TasksTodoTab.jsx` đáp ứng 100% bố cục và tính năng theo ảnh mẫu:
    - Bộ lọc theo vị trí công tác và kỳ đánh giá.
    - 4 Thẻ chỉ số trạng thái: Chờ duyệt đăng ký (Vàng), Chờ đánh giá nhiệm vụ (Xanh dương), Quá hạn xử lý (Đỏ), Cán bộ phản hồi (Tím).
    - 7 Sub-tabs trạng thái: Tất cả, Chờ duyệt, Chờ đánh giá, Phản hồi, Nhiệm vụ đã phân công, Quá hạn xử lý, Lịch sử xử lý.
    - Bảng dữ liệu chi tiết 11 cột, phân trang chuẩn `20/trang`, nút thao tác duyệt nhanh, chấm điểm nhanh và nút tác vụ nhanh (FAB) tròn đỏ.
    - Modal giao nhiệm vụ nhanh cho cán bộ.
- **Chuẩn hóa màn hình "Danh mục công việc đơn vị"**:
  - Đổi tên Module "Danh mục công việc chuẩn" thành "Danh mục công việc đơn vị" trên toàn hệ thống (Sidebar, Breadcrumb, Header).
  - Tích hợp 4 Thẻ thống kê danh mục kèm nút thu gọn/mở rộng theo đúng ảnh mẫu: Tổng công việc, Chưa giao, Đã giao, Đã hoàn thành.
- **Cập nhật giao diện Header / Dashboard**:
  - Chuẩn hóa thông tin hiển thị Header: Trường Mầm non Hoàng Yến - Phường An Đông, ICPV - TP. HCM, đồng hồ thời gian thực và tài khoản Hiệu trưởng Nguyễn Diễm Trang.

- **Nâng cấp Quản lý đánh giá cán bộ (KPI)**:
  - *Chỉnh sửa kỳ đánh giá đang mở*: Xây dựng modal `EditPeriodModal.jsx` và tích hợp tại `DashboardTab.jsx` và `SystemConfigTab.jsx`. Cho phép Quản lý và Quản trị viên cập nhật tên kỳ, mã kỳ, ngày bắt đầu, ngày kết thúc và hạn khóa chấm điểm khi kỳ đang mở (`is_locked === 0`), đồng thời ngăn chặn sửa đổi khi kỳ đã chốt KPI (`is_locked === 1`).
  - *Nộp sản phẩm minh chứng - Giao cho cấp dưới*: Bổ sung chức năng "Giao cho cấp dưới" tại `ExecutionTab.jsx` thông qua `DelegateToSubordinateModal.jsx`. Khi cấp trên phân công lại công việc, hệ thống tự động sinh nhiệm vụ con cho cấp dưới, liên kết `inherited_from_task_id`, ghi nhận thông tin `delegated_to_user_name` và gửi thông báo nhắc việc cho cán bộ cấp dưới; khi cấp dưới nộp bài minh chứng sẽ tự động kế thừa và hiển thị trên màn hình của cấp trên.
- **Bổ sung Các phân hệ Nội nghiệp**:
  - *Dashboard Hồ sơ Đảng viên* (`PartyMembersDashboardTab.jsx`):
    - 4 Thẻ chỉ số tổng quan: Tổng số Đảng viên, Đảng viên chính thức, Đảng viên dự bị, Huy hiệu Đảng đã nhận.
    - 2 Biểu đồ cơ cấu: Phân bổ theo Chi bộ sinh hoạt trực thuộc và Cơ cấu theo nhóm độ tuổi.
    - Bảng danh sách Đảng viên chi tiết với bộ lọc theo Chi bộ, trạng thái (Chính thức / Dự bị), tìm kiếm nhanh và modal cập nhật số thẻ Đảng, chi bộ, ngày vào Đảng, ngày chính thức, huy hiệu Đảng.
  - *Dashboard Chỉnh lý số hóa tài liệu* (`DigitizationDashboardTab.jsx`):
    - 4 Thẻ chỉ số tổng quan: Tổng số hồ sơ lưu trữ, Tổng số trang scan/PDF, Hồ sơ đã số hóa hoàn tất (kèm tỷ lệ %), Hồ sơ đang chỉnh lý & Chờ số hóa.
    - Biểu đồ tiến độ số hóa theo 5 nhóm hồ sơ nghiệp vụ (Chuyên môn & Dự án, Đảng - Đoàn thể, Quản lý Nhân sự & Cán bộ, Tài chính & Kế toán, Hành chính & Văn thư).
    - Bảng danh mục hồ sơ lưu trữ chi tiết với bộ lọc nhóm, trạng thái số hóa, tìm kiếm nhanh và modal thêm mới / chỉnh sửa hồ sơ.
  - *Chức năng Tạm ngưng hoạt động đơn vị*:
    - Cập nhật tuyến API `/api/departments/:id/status` và `handleToggleActiveDept` trong `SystemConfigTab.jsx`.
    - Thao tác một chạm chuyển đổi trạng thái giữa `Đang hoạt động` (`is_active = 1`) và `Tạm ngừng` (`is_active = 0`), hiển thị huy hiệu trạng thái màu sắc trực quan trên cây đơn vị và bảng danh mục.
- **Điều hướng & Kiến trúc giao diện**:
  - Tích hợp nhóm menu điều hướng mới "CÁC PHÂN HỆ NỘI NGHIỆP" trong thanh điều hướng `Sidebar.jsx`.
  - Cập nhật định tuyến `App.jsx` và đồng bộ `VALID_TABS` với 2 phân hệ mới (`party_members`, `digitization`).

#### 3. Các quyết định kỹ thuật quan trọng:
- Giữ vững cấu trúc kiến trúc hiện tại, không xóa bỏ chức năng hoặc phá vỡ cấu trúc dữ liệu đang vận hành.
- Thống nhất loại bỏ phân loại công việc "Đột xuất", chuẩn hóa 100% công việc thành "Thường xuyên" với điểm chuẩn thống nhất là 10 điểm.
- Bổ sung module "Công việc cần xử lý" giúp cán bộ quản lý giám sát và giải quyết tức thì các yêu cầu đăng ký việc, chấm điểm và phản hồi từ cán bộ giáo viên.
- Thêm các thẻ thống kê trực quan trên đầu danh mục công việc của đơn vị nhằm giúp người dùng theo dõi tỷ lệ phân công và hoàn thành nhiệm vụ theo thời gian thực.
- Nâng cấp thang đo đánh giá chất lượng kết quả từ 4 mức (100%, 80%, 60%, 0%) thành 5 mức chuẩn theo Công văn số 3818-CV/BTCTU (100%, 75%, 50%, 25%, 0%).
- Cập nhật công thức tính điểm từng sản phẩm: $\text{Điểm thực hiện} = \text{Điểm chuẩn} \times (30\% \text{Tiến độ} + 70\% \text{Kết quả})$; $\text{Điểm quy đổi thực tế} = \text{Điểm thực hiện} \times \text{Hệ số độ khó}$.
- Chuẩn hóa các ngưỡng xếp loại cán bộ: Xuất sắc ($\ge 90$ kèm điều kiện $\ge 30\%$ việc vượt mức), Tốt ($70 - <90$), Hoàn thành ($50 - <70$), Không hoàn thành ($<50$).
- Chuyển đổi toàn bộ các tính năng "Tải tệp mẫu Excel" sang cơ chế sinh dữ liệu động qua `exceljs` (in-memory buffer) để loại bỏ hoàn toàn việc lưu trữ các tệp nhị phân `.xlsx` và `.pdf` tĩnh trong kho mã nguồn.
- Mô hình hóa phân hệ Nội nghiệp trực tiếp trên cơ sở dữ liệu SQLite (`digitized_records`, các trường thuộc tính Đảng viên trên bảng `users`), đảm bảo tính nhất quán và khả năng mở rộng trong tương lai.

#### 4. Các lỗi phát sinh và phương án khắc phục:
- *Lỗi ban đầu:* Tải nhầm kho lưu trữ `school_management` do tìm kiếm tự động theo tài khoản người dùng cũ. Khắc phục: Chuyển sang `https://github.com/vinhngtienmdb-ui/he-thong-kpi.git` và đồng bộ lại.
- *Lỗi phụ thuộc:* `better-sqlite3@13.0.3` thiếu prebuilt binary cho môi trường Windows Node 24. Khắc phục: Sử dụng phiên bản ổn định `better-sqlite3@12.11.1` có sẵn prebuilt binary tương thích.
- *Lỗi lệch tên trường dữ liệu giữa Backend và Frontend*: Trường số trang (`total_pages` vs `page_count`) và vị trí lưu trữ (`storage_location` vs `physical_location`). Khắc phục: Chuẩn hóa mapping 2 chiều đảm bảo tương thích hoàn toàn.

#### 5. Kết quả đạt được:
- Toàn bộ hệ thống Backend, Frontend và Tài liệu đã được cập nhật chính xác 100% theo quy tắc mới nhất của Công văn số 3818-CV/BTCTU ngày 10/10/2026.
- Đã loại bỏ sạch sẽ toàn bộ các tệp `.xlsx` và `.pdf` tĩnh trên toàn bộ codebase mà không làm gián đoạn bất kỳ tính năng tải tệp mẫu hay nhập xuất dữ liệu nào của hệ thống.
- Đã loại bỏ hoàn toàn loại công việc "Đột xuất", chỉ giữ lại loại "Thường xuyên" với điểm chuẩn 10 điểm.
- Bổ sung hoàn chỉnh Module "Công việc cần xử lý" và cập nhật màn hình "Danh mục công việc đơn vị" chuẩn xác 100% theo các ảnh mẫu thiết kế.
- Hoàn thiện trọn vẹn cả 5 tính năng mới:
  1. Cho phép chỉnh sửa kỳ đánh giá đang mở.
  2. Bổ sung tính năng "Giao cho cấp dưới" trong Nộp sản phẩm minh chứng.
  3. Bổ sung Dashboard Hồ sơ Đảng viên (Phân hệ Nội nghiệp).
  4. Bổ sung Dashboard Chỉnh lý số hóa tài liệu (Phân hệ Nội nghiệp).
  5. Bổ sung chức năng Tạm ngưng hoạt động đơn vị.
- Đã kiểm tra và nghiệm thu qua bộ kiểm thử tự động, tất cả các bài kiểm thử và tiến trình đóng gói `npm run build` đều đạt kết quả xuất sắc (0 lỗi).
- Cả Backend server (cổng 5000) và Frontend dev server (cổng 3000) đang vận hành ổn định.

