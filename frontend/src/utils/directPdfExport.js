import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Canvas 2D phục vụ chuyển đổi màu sắc hiện đại (oklab, oklch, color) sang RGB chuẩn
let _colorCanvas = null;
let _colorCtx = null;

function getColorContext() {
  if (!_colorCtx && typeof document !== 'undefined') {
    _colorCanvas = document.createElement('canvas');
    _colorCanvas.width = 1;
    _colorCanvas.height = 1;
    _colorCtx = _colorCanvas.getContext('2d', { willReadFrequently: true });
  }
  return _colorCtx;
}

/**
 * Chuyển đổi một màu CSS (kể cả oklab, oklch, color()) sang chuỗi rgb() / rgba() chuẩn
 */
export function convertColorToRgb(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return '#000000';
  
  if (colorStr.includes('oklab') || colorStr.includes('oklch') || colorStr.includes('color(') || colorStr.includes('hwb')) {
    const ctx = getColorContext();
    if (ctx) {
      try {
        ctx.fillStyle = '#000000';
        ctx.fillStyle = colorStr;
        return ctx.fillStyle; // Trình duyệt tự động chuyển đổi sang rgb(...) hoặc #rrggbb
      } catch (e) {
        return '#000000';
      }
    }
    return '#000000';
  }
  return colorStr;
}

/**
 * Làm sạch một chuỗi CSS (như box-shadow, border, color) có chứa oklab/oklch
 */
export function sanitizeColorString(str) {
  if (!str || typeof str !== 'string') return str;
  if (!str.includes('oklab') && !str.includes('oklch') && !str.includes('color(') && !str.includes('hwb')) {
    return str;
  }
  return str.replace(/(oklab|oklch|color|hwb)\([^)]+\)/g, (match) => {
    return convertColorToRgb(match);
  });
}

/**
 * Bọc hàm getComputedStyle của cửa sổ để:
 * 1. Chặn đứng và chuyển đổi mọi giá trị màu oklab/oklch trước khi html2canvas đọc chúng.
 * 2. Ép buộc 100% phông chữ trả về phải là 'Times New Roman' cho mọi phần tử trong báo cáo.
 */
export function wrapComputedStyle(targetWindow) {
  if (!targetWindow || !targetWindow.getComputedStyle) return () => {};
  const original = targetWindow.getComputedStyle;
  
  targetWindow.getComputedStyle = function(el, pseudo) {
    const style = original.call(targetWindow, el, pseudo);
    return new Proxy(style, {
      get(target, prop) {
        // Luôn trả về Times New Roman cho mọi truy vấn font-family
        if (prop === 'fontFamily') {
          return "'Times New Roman', Times, 'Liberation Serif', serif";
        }
        const val = target[prop];
        if (typeof val === 'function') {
          if (prop === 'getPropertyValue') {
            return function(propName) {
              if (propName === 'font-family') {
                return "'Times New Roman', Times, 'Liberation Serif', serif";
              }
              const v = target.getPropertyValue(propName);
              return typeof v === 'string' ? sanitizeColorString(v) : v;
            };
          }
          return val.bind(target);
        }
        if (typeof val === 'string') {
          return sanitizeColorString(val);
        }
        return val;
      }
    });
  };
  
  return () => {
    targetWindow.getComputedStyle = original;
  };
}

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
 * - Khổ giấy: Chuẩn A4 Landscape (297 x 210 mm), lề 8mm.
 * - Phông chữ: Chuẩn 100% Times New Roman.
 * - Cỡ chữ: Chuẩn 14pt (tiêu đề chính 16pt đậm).
 * - Không bị co kéo, không bị vỡ cột, không bị treo trình duyệt.
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

  cleanupPdfArtifacts();

  onProgress('Đang chuẩn bị nội dung tài liệu...');

  // Đảm bảo phông chữ trình duyệt đã sẵn sàng
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (_) {}
  }

  const pageWidthMm = isLandscape ? 297 : 210;
  const pageHeightMm = isLandscape ? 210 : 297;
  const marginMm = isLandscape ? 8 : 12;
  const printableWidthMm = pageWidthMm - (marginMm * 2); // 281mm cho A4 landscape
  const printableHeightMm = pageHeightMm - (marginMm * 2); // 194mm cho A4 landscape

  // Tính toán chiều rộng pixel chuẩn theo tỷ lệ 96 DPI: 1 inch = 25.4mm
  // A4 Landscape 281mm tương đương chính xác 1062px
  const exactWidthPx = Math.round((printableWidthMm / 25.4) * 96);

  // Bọc getComputedStyle của cửa sổ chính
  const restoreParentWindow = wrapComputedStyle(window);

  try {
    onProgress('Đang chuẩn hóa phông chữ Times New Roman 14pt...');

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc, clonedElement) => {
        // 1. Bọc getComputedStyle của cửa sổ iframe clone
        wrapComputedStyle(clonedDoc.defaultView);

        // 2. Xóa sạch style tag và link stylesheet ngoại lai (loại bỏ hoàn toàn Tailwind v4 oklab/oklch)
        const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
        styles.forEach(s => s.remove());

        // 3. Tiêm stylesheet chuẩn hành chính thuần túy, an toàn 100%
        const safeStyle = clonedDoc.createElement('style');
        safeStyle.id = 'direct-pdf-safe-style';
        safeStyle.textContent = `
          * {
            box-sizing: border-box !important;
            box-shadow: none !important;
            text-shadow: none !important;
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          html, body {
            background-color: #ffffff !important;
            background-image: none !important;
            color: #000000 !important;
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
            line-height: 1.35 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }

          .print-document, #report-print-content {
            background-color: #ffffff !important;
            background-image: none !important;
            color: #000000 !important;
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
            line-height: 1.35 !important;
            margin: 0 auto !important;
            padding: 0px !important;
            border: none !important;
            box-shadow: none !important;
            width: ${exactWidthPx}px !important;
            max-width: ${exactWidthPx}px !important;
            min-width: ${exactWidthPx}px !important;
          }

          /* Áp dụng triệt để font Times New Roman và cỡ chữ 14pt */
          p, span, div, td, th, li, a, label, strong, b, em, i, tr, thead, tbody {
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
            line-height: 1.35 !important;
            color: #000000 !important;
          }

          /* Tiêu đề văn bản: 16pt đậm chữ hoa */
          h1 {
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 16pt !important;
            font-weight: bold !important;
            text-align: center !important;
            text-transform: uppercase !important;
            color: #000000 !important;
            margin: 8px 0 !important;
            line-height: 1.3 !important;
          }

          h2, h3, h4 {
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
            font-weight: bold !important;
            color: #000000 !important;
            margin: 6px 0 !important;
          }

          .no-print, button, select, input, textarea {
            display: none !important;
          }

          /* Định dạng bảng biểu chuẩn hành chính */
          table {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            border-collapse: collapse !important;
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
            margin-top: 6px !important;
            margin-bottom: 6px !important;
          }

          th, td {
            border: 1px solid #000000 !important;
            color: #000000 !important;
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
            padding: 4px 6px !important;
            vertical-align: middle !important;
            word-break: break-word !important;
            line-height: 1.3 !important;
          }

          th {
            background-color: #f1f5f9 !important;
            font-weight: bold !important;
            text-align: center !important;
          }

          /* Bảng Mẫu 02: cố định tỷ lệ cột và padding gọn gàng */
          .table-mau-02 {
            table-layout: fixed !important;
            width: 100% !important;
            max-width: 100% !important;
          }

          .table-mau-02 th, .table-mau-02 td {
            font-size: 14pt !important;
            padding: 2.5px 3.5px !important;
            word-break: break-word !important;
            line-height: 1.25 !important;
          }

          .table-mau-02 th span, .table-mau-02 th small {
            font-size: 11pt !important;
            font-weight: normal !important;
          }

          /* Bố cục Grid 2 cột (Quốc hiệu / Đơn vị và Chữ ký) */
          .grid {
            display: grid !important;
          }

          .grid-cols-2 {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            width: 100% !important;
          }

          /* Tiện ích căn lề và định dạng */
          .text-center { text-align: center !important; }
          .text-right { text-align: right !important; }
          .text-left { text-align: left !important; }
          .font-bold, b, strong { font-weight: bold !important; }
          .font-semibold { font-weight: 600 !important; }
          .italic { font-style: italic !important; }
          .uppercase { text-transform: uppercase !important; }

          /* Màu nền và đường kẻ */
          .bg-slate-100 { background-color: #f1f5f9 !important; }
          .bg-slate-50 { background-color: #f8fafc !important; }
          .bg-amber-100, .bg-amber-50 { background-color: #fef3c7 !important; }
          .bg-emerald-50 { background-color: #ecfdf5 !important; }
          .bg-blue-50 { background-color: #eff6ff !important; }

          .text-red-800, .text-red-900, .text-red-700 { color: #991b1b !important; }
          .text-indigo-900, .text-indigo-800 { color: #3730a3 !important; }
          .text-emerald-800, .text-emerald-700 { color: #065f46 !important; }
          .text-rose-800, .text-rose-700 { color: #9f1239 !important; }
          .text-slate-600, .text-slate-700, .text-slate-800 { color: #334155 !important; }

          .border-black { border-color: #000000 !important; }
          .border-b { border-bottom-width: 1px !important; }
          .border-t { border-top-width: 1px !important; }
          .border { border-width: 1px !important; }

          .w-full { width: 100% !important; }
          .w-24 { width: 96px !important; }
          .mx-auto { margin-left: auto !important; margin-right: auto !important; }

          .space-y-1 > * + * { margin-top: 4px !important; }
          .space-y-2 > * + * { margin-top: 8px !important; }
          .space-y-3 > * + * { margin-top: 12px !important; }
          .space-y-4 > * + * { margin-top: 16px !important; }
          .space-y-6 > * + * { margin-top: 20px !important; }
          .space-y-8 > * + * { margin-top: 28px !important; }
          .space-y-20 > * + * { margin-top: 60px !important; }
        `;
        clonedDoc.head.appendChild(safeStyle);

        // Đặt kích thước container đúng bằng độ rộng in ấn chuẩn A4 Landscape 1062px
        clonedElement.style.width = `${exactWidthPx}px`;
        clonedElement.style.minWidth = `${exactWidthPx}px`;
        clonedElement.style.maxWidth = `${exactWidthPx}px`;
        clonedElement.style.padding = '0px';
        clonedElement.style.margin = '0 auto';
        clonedElement.style.boxShadow = 'none';
        clonedElement.style.border = 'none';
        clonedElement.style.backgroundColor = '#ffffff';

        // 4. Quét từng phần tử để:
        // - Ép buộc inline font-family Times New Roman
        // - Phục hồi độ rộng cột từ các class Tailwind w-[...]
        // - Khử mọi giá trị màu oklab/oklch inline
        const allElements = clonedElement.querySelectorAll('*');
        allElements.forEach(el => {
          el.style.fontFamily = "'Times New Roman', Times, 'Liberation Serif', serif";

          if (el.tagName === 'H1') {
            el.style.fontSize = '16pt';
            el.style.fontWeight = 'bold';
          } else if (el.tagName === 'SPAN' && el.parentElement?.tagName === 'TH') {
            el.style.fontSize = '11pt';
          } else if (!['TABLE', 'THEAD', 'TBODY', 'TR'].includes(el.tagName)) {
            if (!el.classList.contains('text-[16pt]') && !el.classList.contains('text-[11.5pt]') && !el.classList.contains('text-[11pt]')) {
              el.style.fontSize = '14pt';
            }
          }

          // Phục hồi độ rộng từ class w-[...]
          if (el.className && typeof el.className === 'string') {
            const widthMatch = el.className.match(/\bw-\[([0-9.]+%|[0-9]+px)\]/);
            if (widthMatch) {
              el.style.width = widthMatch[1];
            }
          }

          // Xóa bỏ các min-width dạng pixel lớn ở bảng biểu để tránh phình trang
          if (el.tagName === 'TABLE') {
            el.style.width = '100%';
            el.style.maxWidth = '100%';
            el.style.minWidth = '100%';
          }
          if (el.tagName === 'TH' || el.tagName === 'TD') {
            el.style.minWidth = '0px';
          }

          const s = el.getAttribute('style');
          if (s && (s.includes('oklab') || s.includes('oklch') || s.includes('color(') || s.includes('hwb'))) {
            el.setAttribute('style', sanitizeColorString(s));
          }
        });
      }
    });

    onProgress('Đang phân trang tài liệu PDF...');

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
    restoreParentWindow();
    cleanupPdfArtifacts();
  }
}
