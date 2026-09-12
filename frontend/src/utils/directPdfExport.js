import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Tự động dọn dẹp các lớp phủ hoặc container rác của html2canvas/html2pdf
 * để đảm bảo giao diện người dùng không bao giờ bị treo hoặc khóa click.
 */
export function cleanupPdfArtifacts() {
  try {
    const junkElements = document.querySelectorAll(
      '.html2pdf__overlay, .html2pdf__container, .html2canvas-container, [data-html2canvas-ignore="true"]'
    );
    junkElements.forEach(el => el.remove());

    if (document.body) {
      document.body.style.pointerEvents = '';
      document.body.style.overflow = '';
    }
    if (document.documentElement) {
      document.documentElement.style.pointerEvents = '';
      document.documentElement.style.overflow = '';
    }
  } catch (e) {
    console.warn('Lỗi dọn dẹp PDF artifacts:', e);
  }
}

/**
 * CÔNG CỤ XUẤT BÁO CÁO PDF TRỰC TIẾP (CLIENT-SIDE DIRECT PDF EXPORTER)
 * 
 * - Hoạt động độc lập 100% trong trình duyệt người dùng, không cần qua máy chủ phụ.
 * - Cô lập hoàn toàn khỏi các cú pháp màu Tailwind CSS v4 (oklch) gây lỗi parser.
 * - Tự động tính toán phân trang A4 ngang (Landscape) hoặc A4 dọc (Portrait).
 * - Kết xuất độ nét cao (scale 2), chữ Times New Roman 14pt chuẩn văn bản hành chính.
 * - Tải file .pdf trực tiếp về máy tính người dùng.
 */
export async function exportReportToPdfDirect(element, options = {}) {
  const {
    filename = 'Bao_cao.pdf',
    isLandscape = true,
    onProgress = () => {}
  } = options;

  if (!element) {
    throw new Error('Không tìm thấy phần tử nội dung báo cáo để xuất PDF.');
  }

  // Đảm bảo không còn lớp phủ cũ gây cản trở
  cleanupPdfArtifacts();

  onProgress('Đang chuẩn bị nội dung tài liệu...');

  const pageWidthMm = isLandscape ? 297 : 210;
  const pageHeightMm = isLandscape ? 210 : 297;
  const marginMm = isLandscape ? 8 : 12;
  const printableWidthMm = pageWidthMm - (marginMm * 2);
  const printableHeightMm = pageHeightMm - (marginMm * 2);

  try {
    onProgress('Đang chuyển đổi bảng biểu và phông chữ...');

    // Cấu hình html2canvas với bộ lọc CSS an toàn
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc, clonedElement) => {
        // 1. Loại bỏ tất cả style tag chứa hàm màu hiện đại (oklch) của Tailwind v4
        const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
        styles.forEach(s => {
          if (s.tagName === 'STYLE' && (s.textContent.includes('oklch') || s.textContent.includes('@theme'))) {
            s.remove();
          }
        });

        // 2. Tiêm stylesheet chuẩn hành chính thuần túy, an toàn 100%
        const safeStyle = clonedDoc.createElement('style');
        safeStyle.id = 'direct-pdf-safe-style';
        safeStyle.textContent = `
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body, html, .print-document, #report-print-content {
            background-color: #ffffff !important;
            color: #000000 !important;
            font-family: 'Times New Roman', Times, serif !important;
            font-size: 14pt !important;
            line-height: 1.35 !important;
            margin: 0 !important;
            padding: 8px !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .no-print, button, select, input, textarea {
            display: none !important;
          }
          table {
            width: 100% !important;
            max-width: 100% !important;
            border-collapse: collapse !important;
            font-family: 'Times New Roman', Times, serif !important;
            margin-top: 6px !important;
            margin-bottom: 6px !important;
          }
          th, td {
            border: 1px solid #000000 !important;
            color: #000000 !important;
            font-size: 14pt !important;
            padding: 3px 5px !important;
            vertical-align: middle !important;
            word-break: break-word !important;
          }
          th {
            background-color: #f1f5f9 !important;
            font-weight: bold !important;
            text-align: center !important;
          }
          .grid {
            display: grid !important;
          }
          .grid-cols-2 {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            width: 100% !important;
          }
          .text-center { text-align: center !important; }
          .text-right { text-align: right !important; }
          .text-left { text-align: left !important; }
          .font-bold, b, strong { font-weight: bold !important; }
          .font-semibold { font-weight: 600 !important; }
          .italic { font-style: italic !important; }
          .uppercase { text-transform: uppercase !important; }
          .bg-slate-100 { background-color: #f1f5f9 !important; }
          .bg-slate-50 { background-color: #f8fafc !important; }
          .bg-amber-100\\/70, .bg-amber-100 { background-color: #fef3c7 !important; }
          .text-red-800, .text-red-900, .text-red-700 { color: #991b1b !important; }
          .text-indigo-900, .text-indigo-800 { color: #3730a3 !important; }
          .text-emerald-800, .text-emerald-700 { color: #065f46 !important; }
          .text-rose-800, .text-rose-700 { color: #9f1239 !important; }
          .text-slate-600, .text-slate-700, .text-slate-800 { color: #334155 !important; }
          .border-black { border-color: #000000 !important; }
          .space-y-1 > * + * { margin-top: 4px !important; }
          .space-y-2 > * + * { margin-top: 8px !important; }
          .space-y-6 > * + * { margin-top: 20px !important; }
          .space-y-8 > * + * { margin-top: 28px !important; }
          .space-y-20 > * + * { margin-top: 60px !important; }
        `;
        clonedDoc.head.appendChild(safeStyle);

        clonedElement.style.width = isLandscape ? '1120px' : '800px';
        clonedElement.style.maxWidth = 'none';
        clonedElement.style.margin = '0 auto';
        clonedElement.style.boxShadow = 'none';
        clonedElement.style.border = 'none';
      }
    });

    onProgress('Đang tạo và phân trang tài liệu PDF...');

    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const pageCanvasHeight = (printableHeightMm / printableWidthMm) * canvasWidth;

    if (canvasHeight <= pageCanvasHeight) {
      const imgHeightMm = (canvasHeight * printableWidthMm) / canvasWidth;
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      pdf.addImage(imgData, 'JPEG', marginMm, marginMm, printableWidthMm, imgHeightMm);
    } else {
      let remainingHeight = canvasHeight;
      let sourceY = 0;
      let pageIndex = 0;

      while (remainingHeight > 0) {
        const currentSliceHeight = Math.min(pageCanvasHeight, remainingHeight);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvasWidth;
        pageCanvas.height = currentSliceHeight;
        const pctx = pageCanvas.getContext('2d');
        
        pctx.fillStyle = '#ffffff';
        pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        pctx.drawImage(
          canvas,
          0, sourceY, canvasWidth, currentSliceHeight,
          0, 0, canvasWidth, currentSliceHeight
        );

        const sliceHeightMm = (currentSliceHeight * printableWidthMm) / canvasWidth;
        const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.98);

        if (pageIndex > 0) {
          pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
        }

        pdf.addImage(pageImgData, 'JPEG', marginMm, marginMm, printableWidthMm, sliceHeightMm);

        sourceY += currentSliceHeight;
        remainingHeight -= currentSliceHeight;
        pageIndex++;
      }
    }

    onProgress('Đang tải file PDF về máy tính...');
    pdf.save(filename);
    return true;
  } finally {
    cleanupPdfArtifacts();
  }
}
