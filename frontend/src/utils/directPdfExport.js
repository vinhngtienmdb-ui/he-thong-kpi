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
  return str.replace(/(oklab|oklch|color|hwb)([^)]+)/g, (match) => {
    return convertColorToRgb(match);
  });
}

/**
 * Làm sạch toàn bộ nội dung file CSS để loại bỏ hoàn toàn oklab/oklch
 * nhưng giữ nguyên 100% quy tắc CSS, layout, grid, border, padding của ứng dụng
 */
export function sanitizeCssText(cssText) {
  if (!cssText || typeof cssText !== 'string') return '';
  if (!cssText.includes('oklab') && !cssText.includes('oklch') && !cssText.includes('color(') && !cssText.includes('hwb')) {
    return cssText;
  }
  return cssText.replace(/(oklab|oklch|color|hwb)([^)]+)/g, (match) => {
    return convertColorToRgb(match);
  });
}

/**
 * Thu thập toàn bộ stylesheet của ứng dụng và khử sạch các hàm màu không được html2canvas hỗ trợ
 */
async function collectAllAppStyles() {
  let combinedCss = '';

  // 1. Thu thập từ các thẻ <link rel="stylesheet">
  const linkTags = document.querySelectorAll('link[rel="stylesheet"]');
  for (const link of linkTags) {
    try {
      const res = await fetch(link.href);
      if (res.ok) {
        const text = await res.text();
        combinedCss += text + '\n';
      }
    } catch (e) {
      try {
        for (const sheet of document.styleSheets) {
          if (sheet.href === link.href) {
            for (const rule of sheet.cssRules) {
              combinedCss += rule.cssText + '\n';
            }
          }
        }
      } catch (_) {}
    }
  }

  // 2. Thu thập từ các thẻ <style> nội bộ
  const styleTags = document.querySelectorAll('style');
  for (const s of styleTags) {
    if (s.id !== 'direct-pdf-safe-style' && s.id !== 'report-print-override') {
      combinedCss += (s.textContent || '') + '\n';
    }
  }

  // 3. Khử hoàn toàn oklab/oklch trên toàn bộ CSS ứng dụng
  return sanitizeCssText(combinedCss);
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
 * - Xuất đúng 100% nguyên mẫu hiển thị trên màn hình báo cáo hiện hữu.
 * - Giữ trọn vẹn toàn bộ các cột, dữ liệu, bảng biểu, không bị cắt xén lề phải hoặc lề dưới.
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

  // 1. Xác định độ rộng tự nhiên đầy đủ nhất của báo cáo trên màn hình hiện hữu
  // để chứa trọn vẹn 100% tất cả các cột, không bị mất thông tin bên lề phải
  const tables = element.querySelectorAll('table');
  let maxTableWidth = 0;
  tables.forEach(tbl => {
    maxTableWidth = Math.max(maxTableWidth, tbl.scrollWidth, tbl.offsetWidth);
  });

  const naturalWidth = Math.max(
    element.scrollWidth,
    element.offsetWidth,
    maxTableWidth,
    1150
  );
  const naturalHeight = Math.max(element.scrollHeight, element.offsetHeight);

  onProgress('Đang chuẩn hóa giao diện báo cáo chuẩn Times New Roman...');
  const sanitizedAppCss = await collectAllAppStyles();

  // Bọc getComputedStyle của cửa sổ chính
  const restoreParentWindow = wrapComputedStyle(window);

  try {
    onProgress('Đang kết xuất hình ảnh báo cáo nguyên mẫu...');

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      width: naturalWidth,
      height: naturalHeight,
      windowWidth: naturalWidth + 60,
      windowHeight: naturalHeight + 100,
      onclone: (clonedDoc, clonedElement) => {
        // Bọc getComputedStyle của cửa sổ iframe clone
        wrapComputedStyle(clonedDoc.defaultView);

        // 1. Xóa style tag và link stylesheet ngoại lai để thay bằng sanitized stylesheet đầy đủ
        const oldLinks = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
        oldLinks.forEach(l => l.remove());
        const oldStyles = clonedDoc.querySelectorAll('style');
        oldStyles.forEach(s => s.remove());

        // 2. Tiêm toàn bộ stylesheet của ứng dụng đã được khử sạch oklab/oklch
        const appStyleTag = clonedDoc.createElement('style');
        appStyleTag.id = 'sanitized-app-styles';
        appStyleTag.textContent = sanitizedAppCss;
        clonedDoc.head.appendChild(appStyleTag);

        // 3. Tiêm stylesheet chuẩn hành chính: ép buộc Times New Roman & mở rộng hiển thị trọn vẹn
        const printOverrideTag = clonedDoc.createElement('style');
        printOverrideTag.id = 'report-print-override';
        printOverrideTag.textContent = `
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
            width: ${naturalWidth}px !important;
            min-width: ${naturalWidth}px !important;
          }

          .print-document, #report-print-content {
            background-color: #ffffff !important;
            background-image: none !important;
            color: #000000 !important;
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
            line-height: 1.35 !important;
            width: ${naturalWidth}px !important;
            min-width: ${naturalWidth}px !important;
            max-width: none !important;
            margin: 0 auto !important;
            padding: 24px !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
          }

          /* Không bao giờ để bất kỳ bảng hay container nào bị ẩn cuộn ngang */
          .overflow-x-auto, .overflow-y-auto, .overflow-hidden {
            overflow: visible !important;
            max-width: none !important;
            width: 100% !important;
          }

          /* Áp dụng triệt để font Times New Roman và cỡ chữ 14pt */
          p, span, div, td, th, li, a, label, strong, b, em, i, tr, thead, tbody {
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
            line-height: 1.35 !important;
          }

          /* Tiêu đề văn bản: 16pt đậm chữ hoa */
          h1 {
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 16pt !important;
            font-weight: bold !important;
            text-align: center !important;
            text-transform: uppercase !important;
            margin: 8px 0 !important;
            line-height: 1.3 !important;
          }

          h2, h3, h4 {
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
            font-weight: bold !important;
            margin: 6px 0 !important;
          }

          /* Bảng biểu hiển thị trọn vẹn */
          table {
            width: 100% !important;
            max-width: none !important;
            border-collapse: collapse !important;
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
          }

          th, td {
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: 14pt !important;
            border-color: #000000 !important;
          }

          th {
            background-color: #f1f5f9 !important;
            font-weight: bold !important;
          }
        `;
        clonedDoc.head.appendChild(printOverrideTag);

        // Đảm bảo clonedElement và các container con bung rộng đầy đủ
        clonedElement.style.width = `${naturalWidth}px`;
        clonedElement.style.minWidth = `${naturalWidth}px`;
        clonedElement.style.maxWidth = 'none';
        clonedElement.style.overflow = 'visible';
        clonedElement.style.height = 'auto';

        clonedElement.querySelectorAll('.overflow-x-auto, .overflow-y-auto, .overflow-hidden').forEach(el => {
          el.style.overflow = 'visible';
          el.style.maxWidth = 'none';
          el.style.width = '100%';
        });

        // Quét sạch các thuộc tính inline style chứa oklab/oklch
        clonedElement.querySelectorAll('*').forEach(el => {
          el.style.fontFamily = "'Times New Roman', Times, 'Liberation Serif', serif";
          const s = el.getAttribute('style');
          if (s && (s.includes('oklab') || s.includes('oklch') || s.includes('color(') || s.includes('hwb'))) {
            el.setAttribute('style', sanitizeColorString(s));
          }
        });
      }
    });

    onProgress('Đang phân trang tài liệu PDF chuẩn A4 ngang...');

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
