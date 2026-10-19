# DANH MỤC KIỂM TRA DỰ ÁN HỆ THỐNG KPI

Quản lý danh sách các hạng mục công việc cập nhật hệ thống theo Công văn số 3818-CV/BTCTU ngày 10/10/2026 của Ban Tổ chức Thành ủy Thành phố Hồ Chí Minh.

---

## Bảng Theo Dõi Nhiệm Vụ

| Mã nhiệm vụ | Phân hệ / Thành phần | Nội dung công việc | Tiêu chí nghiệm thu | Trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| **NV-01** | Quản lý dự án | Khởi tạo tài liệu quản lý cốt lõi `index.md`, `21_NHAT_KY_DU_AN.md`, `22_DANH_MUC_KIEM_TRA.md` | Đầy đủ tệp, định dạng tiếng Việt chuẩn theo quy tắc | **Hoàn thành** |
| **NV-02** | Phân tích quy tắc | Phân tích toàn bộ 33 trang Công văn số 3818-CV/BTCTU và so khớp với mã nguồn hiện hữu | Bảng so sánh chi tiết cũ/mới, xác định các tệp mã nguồn bị ảnh hưởng | **Hoàn thành** |
| **NV-03** | Thiết kế giải pháp | Thiết kế chi tiết các thay đổi logic Backend, Frontend, Cơ sở dữ liệu và Báo cáo Excel/Word | Phương án kỹ thuật đầy đủ, không phá vỡ dự án, trình người dùng xác nhận | **Hoàn thành** |
| **NV-04** | Backend - Điểm chuẩn | Chuẩn hóa loại công việc thành "Thường xuyên", điểm chuẩn cố định 10 điểm cho mọi công việc | Không còn điểm chuẩn 12 hoặc loại đột xuất; điểm quy đổi tối đa = 10 × HSĐK | **Hoàn thành** |
| **NV-05** | Backend - Tiến độ & Chất lượng | Cập nhật 5 mức chất lượng (100%, 75%, 50%, 25%, 0%) và công thức: Điểm TH = 10 × (30% Tiến độ + 70% Kết quả) | Tính toán chính xác theo Phụ lục 5 Công văn số 3818-CV/BTCTU | **Hoàn thành** |
| **NV-06** | Backend - Xếp loại & Thống kê | Cập nhật ngưỡng xếp loại mới: Xuất sắc ($\ge 90$ + 30% vượt mức), Tốt ($70 - <90$), Hoàn thành ($50 - <70$), Không hoàn thành ($<50$) | Phân loại tự động chính xác trong bảng đánh giá và biểu đồ thống kê | **Hoàn thành** |
| **NV-07** | Frontend - Tự đánh giá | Cập nhật giao diện tự đánh giá (`ExecutionTab.jsx`): 5 mức chất lượng, công thức live preview theo chuẩn mới | Người dùng chọn 5 mức có mô tả rõ ràng, điểm dự kiến tính theo công thức mới | **Hoàn thành** |
| **NV-08** | Frontend - Chấm điểm CBQL | Cập nhật giao diện thẩm định chấm điểm (`GradingTab.jsx`): 5 mức chất lượng, hiển thị công thức chuẩn | Cán bộ quản lý chấm theo 5 mức, tính điểm thực tế và điểm thưởng chuẩn xác | **Hoàn thành** |
| **NV-09** | Báo cáo - Excel & Word | Cập nhật tiêu đề căn cứ văn bản và bảng tính điểm trong `excelService.js`, `docxService.js` | Xuất file Excel/Word ghi nhận căn cứ Công văn 3818-CV/BTCTU và đúng các cột theo Bảng 2 | **Hoàn thành** |
| **NV-10** | Kiểm thử & Nghiệm thu | Kiểm thử toàn diện các ca nghiệp vụ tính điểm, xếp loại và xuất báo cáo | Tất cả các ca kiểm thử đạt kết quả chuẩn xác theo ví dụ mẫu trong văn bản | **Hoàn thành** |
| **NV-11** | Tối ưu mã nguồn | Loại bỏ các tệp mẫu tĩnh `.xlsx`, `.pdf` và chuyển sang cơ chế sinh tệp mẫu Excel động bằng `exceljs` | Codebase sạch tệp nhị phân tĩnh; API tải mẫu hoạt động bình thường | **Hoàn thành** |
| **NV-12** | CSDL & Giao diện | Loại bỏ hoàn toàn loại công việc "Đột xuất" (12đ), chuẩn hóa 100% công việc thành "Thường xuyên" (10đ) | Toàn bộ 486 công việc trong DB đều là Thường xuyên; các modal không còn lựa chọn Đột xuất | **Hoàn thành** |
| **NV-13** | Phân hệ mới | Bổ sung Module "Công việc cần xử lý" (`TasksTodoTab.jsx`) theo đúng thiết kế Ảnh 1 | Đầy đủ 4 thẻ trạng thái, 7 sub-tabs, bảng dữ liệu 11 cột, phân trang 20/trang, modal giao việc nhanh và nút tác vụ nhanh (FAB) | **Hoàn thành** |
| **NV-14** | Danh mục đơn vị | Đổi tên "Danh mục công việc chuẩn" thành "Danh mục công việc đơn vị" và thêm 4 Thẻ thống kê theo Ảnh 2 | Breadcrumb, Header chuẩn tên mới; 4 thẻ thống kê: Tổng công việc, Chưa giao, Đã giao, Đã hoàn thành kèm nút thu gọn/mở rộng | **Hoàn thành** |
| **NV-15** | Header & Dashboard | Chuẩn hóa giao diện Header theo ảnh mẫu: đơn vị Trường Mầm non Hoàng Yến, ICPV - TP. HCM, đồng hồ thời gian thực và tài khoản Hiệu trưởng | Khớp 100% nhận diện thương hiệu và phong cách hiển thị trong các ảnh mẫu | **Hoàn thành** |
| **NV-16** | Đánh giá cán bộ | Quản lý kỳ đánh giá: Cho phép chỉnh sửa kỳ đánh giá đang mở | Modal sửa kỳ tích hợp trên Dashboard và Cấu hình; chỉ cho sửa khi `is_locked === 0`, khóa khi đã chốt sổ | **Hoàn thành** |
| **NV-17** | Nộp sản phẩm | Nộp sản phẩm minh chứng: Bổ sung chức năng "Giao cho cấp dưới" | Nút "Giao cấp dưới" kèm modal tại `ExecutionTab.jsx`; sinh task con, liên kết `inherited_from_task_id`, thông báo nhắc việc | **Hoàn thành** |
| **NV-18** | Phân hệ Nội nghiệp | Bổ sung Dashboard Hồ sơ Đảng viên (`PartyMembersDashboardTab.jsx`) | 4 thẻ KPI, biểu đồ chi bộ & độ tuổi, danh sách đảng viên chi tiết kèm bộ lọc và modal cập nhật hồ sơ | **Hoàn thành** |
| **NV-19** | Phân hệ Nội nghiệp | Bổ sung Dashboard Chỉnh lý số hóa tài liệu (`DigitizationDashboardTab.jsx`) | 4 thẻ KPI, biểu đồ nhóm tài liệu, bảng danh mục lưu trữ, modal thêm/sửa hồ sơ, tính tỷ lệ số hóa | **Hoàn thành** |
| **NV-20** | Quản trị đơn vị | Bổ sung chức năng Tạm ngưng hoạt động đơn vị | Nút bật/tắt `is_active` kèm badge trực quan trên cây đơn vị và danh sách phòng ban | **Hoàn thành** |

