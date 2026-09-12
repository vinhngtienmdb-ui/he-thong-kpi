import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Canvas 2D phục vụ chuyển đổi màu sắc hiện đại (oklab, oklch, color, color-mix, lab, lch, hwb) sang RGB chuẩn
let _colorCanvas = null;
let _colorCtx = null;
const _colorCache = new Map();

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
 * Chuyển đổi bất kỳ màu CSS nào (kể cả oklab, oklch, color(), color-mix(), lab, lch, hwb)
 * thành chuỗi rgb(...) hoặc rgba(...) chuẩn bằng cách render điểm ảnh 1x1 trên canvas thực tế.
 * Phương pháp này hoạt động chuẩn xác 100% trên mọi trình duyệt hiện đại (kể cả Chrome 120+ nơi
 * mà ctx.fillStyle không tự động chuyển đổi oklab về rgb).
 */
export function convertColorToRgb(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return '#000000';
  
  const trimmed = colorStr.trim();
  if (!trimmed.includes('oklab') && !trimmed.includes('oklch') && !trimmed.includes('color') && !trimmed.includes('lab') && !trimmed.includes('hwb')) {
    return colorStr;
  }

  if (_colorCache.has(trimmed)) {
    return _colorCache.get(trimmed);
  }

  const ctx = getColorContext();
  if (!ctx) return '#000000';

  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000000';
    ctx.fillStyle = trimmed;
    ctx.fillRect(0, 0, 1, 1);

    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const alpha = a / 255;
    const res = alpha === 1 
      ? `rgb(${r}, ${g}, ${b})` 
      : `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;

    _colorCache.set(trimmed, res);
    return res;
  } catch (e) {
    _colorCache.set(trimmed, '#000000');
    return '#000000';
  }
}

/**
 * Quét và thay thế tất cả các hàm màu hiện đại trong chuỗi CSS (hỗ trợ cả các hàm lồng nhau như color-mix)
 */
function replaceColorFunctions(str) {
  if (!str || typeof str !== 'string') return str;
  if (!str.includes('oklab') && !str.includes('oklch') && !str.includes('color') && !str.includes('lab') && !str.includes('hwb')) {
    return str;
  }

  const regex = /\b(color-mix|oklab|oklch|color|lab|lch|hwb)\(/gi;
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(str)) !== null) {
    result += str.substring(lastIndex, match.index);
    const startIndex = match.index;
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < str.length && depth > 0) {
      if (str[i] === '(') depth++;
      else if (str[i] === ')') depth--;
      i++;
    }
    const colorFunc = str.substring(startIndex, i);
    result += convertColorToRgb(colorFunc);
    lastIndex = i;
    regex.lastIndex = i;
  }
  result += str.substring(lastIndex);
  return result;
}

/**
 * Làm sạch một chuỗi CSS (như box-shadow, border, color, background) có chứa oklab/oklch/color-mix
 */
export function sanitizeColorString(str) {
  if (!str || typeof str !== 'string') return str;
  if (!str.includes('oklab') && !str.includes('oklch') && !str.includes('color') && !str.includes('lab') && !str.includes('hwb')) {
    return str;
  }
  return replaceColorFunctions(str);
}

/**
 * Làm sạch toàn bộ nội dung file CSS để loại bỏ hoàn toàn oklab/oklch/color-mix
 * nhưng giữ nguyên 100% quy tắc CSS, layout, grid, border, padding của ứng dụng
 */
export function sanitizeCssText(cssText) {
  if (!cssText || typeof cssText !== 'string') return '';
  return replaceColorFunctions(cssText);
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
 * 1. Chặn đứng và chuyển đổi mọi giá trị màu oklab/oklch sang rgb/rgba trước khi html2canvas đọc chúng.
 * 2. Ép buộc 100% phông chữ trả về phải là 'Times New Roman' cho mọi phần tử trong báo cáo.
 */
export function wrapComputedStyle(targetWindow) {
  if (!targetWindow || !targetWindow.getComputedStyle) return () => {};
  const original = targetWindow.getComputedStyle;
  
  targetWindow.getComputedStyle = function(el, pseudo) {
    const style = original.call(targetWindow, el, pseudo);
    return new Proxy(style, {
      get(target, prop) {
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
 * - Cỡ chữ trên giấy in: Chuẩn 14pt (tiêu đề chính 16pt đậm), tự động bù tỷ lệ co giãn để đúng chuẩn 14pt.
 * - Cắt trang thông minh theo DOM: Tuyệt đối không cắt ngang dòng bảng <tr> hay chia đôi dòng chữ.
 * - Không bị co kéo, không bị đè chữ, không bị treo trình duyệt.
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

  // 1. Độ rộng pixel chuẩn A4 ở 96 DPI: 281mm = 1062px
  const baseA4Width = Math.round((printableWidthMm / 25.4) * 96); // 1062px

  const tables = element.querySelectorAll('table');
  let maxTableWidth = 0;
  tables.forEach(tbl => {
    maxTableWidth = Math.max(maxTableWidth, tbl.scrollWidth || 0, tbl.offsetWidth || 0);
  });

  // Nếu bảng yêu cầu độ rộng lớn hơn (ví dụ Mẫu 02 nhiều cột), lấy theo độ rộng bảng nhưng tối thiểu bằng A4
  const naturalWidth = Math.max(
    element.scrollWidth || 0,
    element.offsetWidth || 0,
    maxTableWidth,
    baseA4Width
  );

  // 2. Tính toán tỷ lệ co giãn (scaleFactor) để khi đưa vào PDF, cỡ chữ trên giấy in ĐÚNG 100% LÀ 14pt và 16pt
  const scaleFactor = naturalWidth / baseA4Width;
  const bodyFontSizePt = Number((14 * scaleFactor).toFixed(2));
  const titleFontSizePt = Number((16 * scaleFactor).toFixed(2));
  const subHeaderSizePt = Number((14 * scaleFactor).toFixed(2));
  const smallFontSizePt = Number((11 * scaleFactor).toFixed(2));
  const cellPaddingV = Number((6 * scaleFactor).toFixed(1));
  const cellPaddingH = Number((8 * scaleFactor).toFixed(1));

  onProgress('Đang chuẩn hóa giao diện báo cáo chuẩn Times New Roman...');
  const sanitizedAppCss = await collectAllAppStyles();

  // Bọc getComputedStyle của cửa sổ chính
  const restoreParentWindow = wrapComputedStyle(window);

  // Danh sách các điểm ngắt trang an toàn đo từ DOM
  let domBreakpoints = [];

  try {
    onProgress('Đang kết xuất hình ảnh báo cáo nguyên mẫu...');

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: naturalWidth + 60,
      windowHeight: 25000,
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

        // 3. Tiêm stylesheet chuẩn hành chính: ép buộc Times New Roman & bù kích thước font chuẩn 14pt
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
            font-size: ${bodyFontSizePt}pt !important;
            margin: 0 !important;
            padding: 0 !important;
            width: ${naturalWidth}px !important;
            min-width: ${naturalWidth}px !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
          }

          .print-document, #report-print-content {
            background-color: #ffffff !important;
            background-image: none !important;
            color: #000000 !important;
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: ${bodyFontSizePt}pt !important;
            width: ${naturalWidth}px !important;
            min-width: ${naturalWidth}px !important;
            max-width: none !important;
            margin: 0 auto !important;
            padding: ${Math.round(20 * scaleFactor)}px ${Math.round(24 * scaleFactor)}px !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
          }

          /* Không bao giờ để bất kỳ bảng hay container nào bị ẩn hoặc giới hạn cuộn */
          .overflow-x-auto, .overflow-y-auto, .overflow-hidden {
            overflow: visible !important;
            max-width: none !important;
            max-height: none !important;
            width: 100% !important;
          }

          /* Áp dụng chuẩn Times New Roman và cỡ chữ 14pt (bù tỷ lệ) cho văn bản */
          /* TUYỆT ĐỐI KHÔNG ĐƯA tr, thead, tbody VÀO ĐÂY */
          p, span, div, li, a, label, strong, b, em, i {
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: ${bodyFontSizePt}pt !important;
            line-height: 1.4 !important;
            color: #000000 !important;
          }

          /* Tiêu đề văn bản: 16pt đậm chữ hoa */
          h1 {
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: ${titleFontSizePt}pt !important;
            font-weight: bold !important;
            text-align: center !important;
            text-transform: uppercase !important;
            margin: ${Math.round(10 * scaleFactor)}px 0 !important;
            line-height: 1.3 !important;
            color: #000000 !important;
          }

          h2, h3, h4 {
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: ${subHeaderSizePt}pt !important;
            font-weight: bold !important;
            margin: ${Math.round(8 * scaleFactor)}px 0 !important;
            line-height: 1.3 !important;
            color: #000000 !important;
          }

          /* Bảng biểu hiển thị trọn vẹn, từng ô có viền đen rõ nét */
          table {
            width: 100% !important;
            max-width: 100% !important;
            border-collapse: collapse !important;
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: ${bodyFontSizePt}pt !important;
            margin: ${Math.round(8 * scaleFactor)}px 0 !important;
          }

          tr {
            background-color: transparent !important;
          }

          th, td {
            border: 1px solid #000000 !important;
            color: #000000 !important;
            font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
            font-size: ${bodyFontSizePt}pt !important;
            line-height: 1.35 !important;
            padding: ${cellPaddingV}px ${cellPaddingH}px !important;
            vertical-align: middle !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
            box-sizing: border-box !important;
          }

          th {
            background-color: #f1f5f9 !important;
            font-weight: bold !important;
            text-align: center !important;
          }

          /* Bảng Mẫu 02 với 17 cột */
          .table-mau-02 th, .table-mau-02 td {
            padding: ${Math.round(3.5 * scaleFactor)}px ${Math.round(4.5 * scaleFactor)}px !important;
            font-size: ${bodyFontSizePt}pt !important;
          }

          .table-mau-02 th span, .table-mau-02 th small {
            font-size: ${smallFontSizePt}pt !important;
            font-weight: normal !important;
          }

          .table-mau-02 {
            table-layout: fixed !important;
            width: 100% !important;
          }

          /* Đảm bảo Tiêu ngữ và Chữ ký hiển thị thành 2 cột đều đặn */
          .grid {
            display: table !important;
            width: 100% !important;
          }

          .grid-cols-2 {
            display: table !important;
            width: 100% !important;
          }

          .grid-cols-2 > div {
            display: table-cell !important;
            width: 50% !important;
            vertical-align: top !important;
          }

          /* Đảm bảo các khối chữ ký không bị chia cắt */
          .signature-block, .stats-summary-container {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Ẩn triệt để nút bấm, thanh điều hướng và input */
          .no-print, button, select, input, textarea {
            display: none !important;
          }
        `;
        clonedDoc.head.appendChild(printOverrideTag);

        // Đảm bảo clonedElement và các container con bung rộng đầy đủ tự nhiên
        clonedElement.style.width = `${naturalWidth}px`;
        clonedElement.style.minWidth = `${naturalWidth}px`;
        clonedElement.style.maxWidth = 'none';
        clonedElement.style.overflow = 'visible';
        clonedElement.style.height = 'auto';
        clonedElement.style.minHeight = 'auto';
        clonedElement.style.maxHeight = 'none';

        clonedElement.querySelectorAll('.overflow-x-auto, .overflow-y-auto, .overflow-hidden').forEach(el => {
          el.style.overflow = 'visible';
          el.style.maxWidth = 'none';
          el.style.maxHeight = 'none';
          el.style.width = '100%';
        });

        // Quét sạch các thuộc tính inline style chứa oklab/oklch
        clonedElement.querySelectorAll('*').forEach(el => {
          el.style.fontFamily = "'Times New Roman', Times, 'Liberation Serif', serif";
          const s = el.getAttribute('style');
          if (s && (s.includes('oklab') || s.includes('oklch') || s.includes('color') || s.includes('lab') || s.includes('hwb'))) {
            el.setAttribute('style', sanitizeColorString(s));
          }
        });

        // ====================================================================
        // THU THẬP TỌA ĐỘ RANH GIỚI HÀNG (TR) VÀ CÁC KHỐI ĐỂ CẮT TRANG CHUẨN XÁC 100%
        // ====================================================================
        const clonedRect = clonedElement.getBoundingClientRect();
        const rawBreakpoints = [];

        // 1. Ranh giới dưới của tất cả các dòng <tr> trong mọi bảng
        const allRows = clonedElement.querySelectorAll('tr');
        allRows.forEach(row => {
          const r = row.getBoundingClientRect();
          const bottom = r.bottom - clonedRect.top;
          if (bottom > 0) {
            rawBreakpoints.push({ y: bottom, type: 'tr' });
          }
        });

        // 2. Ranh giới trên và dưới của các khối nội dung, chữ ký, thống kê
        const allBlocks = clonedElement.querySelectorAll('h1, h2, h3, h4, p, .signature-block, .stats-summary-container, .grid');
        allBlocks.forEach(el => {
          const r = el.getBoundingClientRect();
          const top = r.top - clonedRect.top;
          const bottom = r.bottom - clonedRect.top;
          if (top > 0) rawBreakpoints.push({ y: top, type: 'block-top' });
          if (bottom > 0) rawBreakpoints.push({ y: bottom, type: 'block-bottom' });
        });

        rawBreakpoints.sort((a, b) => a.y - b.y);
        domBreakpoints = rawBreakpoints;
      }
    });

    onProgress('Đang phân trang tài liệu PDF chuẩn A4 ngang...');

    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const canvasScale = 2; // Khớp với scale: 2 của html2canvas
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const pageCanvasHeight = Math.floor((printableHeightMm / printableWidthMm) * canvasWidth);

    if (canvasHeight <= pageCanvasHeight) {
      const imgHeightMm = (canvasHeight * printableWidthMm) / canvasWidth;
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      pdf.addImage(imgData, 'JPEG', marginMm, marginMm, printableWidthMm, imgHeightMm);
    } else {
      let remainingHeight = canvasHeight;
      let sourceY = 0;
      let pageIndex = 0;

      while (remainingHeight > 0) {
        const idealCutY = sourceY + pageCanvasHeight;
        let currentSliceHeight = Math.min(pageCanvasHeight, remainingHeight);

        // Nếu còn trang tiếp theo, tìm điểm cắt thông minh chuẩn theo DOM (giữa các hàng <tr>)
        if (idealCutY < canvasHeight) {
          // Vùng tìm kiếm: từ (sourceY + 60% chiều cao trang) đến idealCutY
          const minAllowedY = sourceY + Math.floor(pageCanvasHeight * 0.60);
          const candidates = domBreakpoints
            .map(bp => Math.round(bp.y * canvasScale))
            .filter(bpY => bpY <= idealCutY && bpY >= minAllowedY);

          if (candidates.length > 0) {
            // Lấy điểm ngắt hợp lệ lớn nhất (sát đáy trang nhất) mà không vượt quá trang
            const bestCutY = Math.max(...candidates);
            currentSliceHeight = bestCutY - sourceY;
          } else {
            // Dự phòng pixel scan nếu không có điểm ngắt DOM
            const mainCtx = canvas.getContext('2d');
            const scanWindow = Math.min(Math.floor(pageCanvasHeight * 0.20), 350);
            const scanStartY = idealCutY - scanWindow;
            try {
              const imgDataObj = mainCtx.getImageData(0, scanStartY, canvasWidth, scanWindow);
              const data = imgDataObj.data;
              const maxBorderNoise = Math.ceil(canvasWidth / 120);

              let bestY = -1;
              for (let r = scanWindow - 1; r >= 0; r--) {
                let darkPixels = 0;
                const rowOffset = r * canvasWidth * 4;
                for (let x = 0; x < canvasWidth; x += 4) {
                  const i = rowOffset + (x * 4);
                  if (data[i] < 160 && data[i + 1] < 160 && data[i + 2] < 160) {
                    darkPixels++;
                  }
                }
                if (darkPixels <= maxBorderNoise) {
                  bestY = r;
                  break;
                }
              }
              if (bestY !== -1 && bestY > 20) {
                currentSliceHeight = (scanStartY + bestY) - sourceY;
              }
            } catch (e) {
              console.warn('Lỗi quét điểm cắt pixel dự phòng:', e);
            }
          }
        }

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
        remainingHeight = canvasHeight - sourceY;
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
