const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function findBrowserBinary() {
  const candidates = [
    // Windows paths
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // Linux / Cloud container paths
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/lib/chromium/chromium',
    '/app/.apt/usr/bin/google-chrome',
    // macOS paths
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Environment overrides
    process.env.CHROME_BIN,
    process.env.EDGE_BIN,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH
  ].filter(Boolean);

  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

async function renderHtmlToPdf(html, options = {}) {
  const browserBin = findBrowserBinary();
  if (!browserBin) {
    throw new Error('Không tìm thấy trình duyệt Chrome hoặc Edge trên máy chủ để kết xuất PDF');
  }

  const isLandscape = Boolean(options.isLandscape);
  const id = crypto.randomBytes(8).toString('hex');
  const tmpDir = os.tmpdir();
  const tmpHtml = path.join(tmpDir, `kpi_pdf_${id}.html`);
  const tmpPdf = path.join(tmpDir, `kpi_pdf_${id}.pdf`);

  const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Báo cáo</title>
  <style>
    @page {
      size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'};
      margin: ${isLandscape ? '8mm 8mm 8mm 8mm' : '15mm 15mm 15mm 20mm'};
    }
    *, *::before, *::after {
      box-sizing: border-box;
      font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
    }
    body, html {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
      font-size: 14pt !important;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-document, #report-print-content {
      background-color: #ffffff !important;
      color: #000000 !important;
      font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
      font-size: 14pt !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
      border: none !important;
      width: 100% !important;
    }
    p, span, div, td, th, li, a, label, strong, b, em, i, tr, thead, tbody {
      font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
      font-size: 14pt !important;
      line-height: 1.35 !important;
      color: #000000 !important;
    }
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
    }
    .no-print, button, select, input, textarea {
      display: none !important;
    }
    table {
      width: 100% !important;
      max-width: 100% !important;
      border-collapse: collapse !important;
      font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
      font-size: 14pt !important;
      page-break-inside: auto;
    }
    .table-mau-02 {
      table-layout: fixed !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    thead {
      display: table-header-group !important;
    }
    tbody {
      display: table-row-group !important;
    }
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    th, td {
      border: 1px solid #000000 !important;
      color: #000000 !important;
      padding: 3px 5px !important;
      font-size: 14pt !important;
      line-height: 1.25 !important;
      word-break: break-word !important;
      overflow-wrap: break-word !important;
      font-family: 'Times New Roman', Times, 'Liberation Serif', serif !important;
    }
    .table-mau-02 th, .table-mau-02 td {
      padding: 2.5px 3.5px !important;
      font-size: 14pt !important;
    }
    .table-mau-02 th span, .table-mau-02 th small {
      font-size: 11pt !important;
      font-weight: normal !important;
    }
    th {
      background-color: #f1f5f9 !important;
      font-weight: bold !important;
      text-align: center !important;
    }
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
    .text-center { text-align: center !important; }
    .text-right { text-align: right !important; }
    .text-left { text-align: left !important; }
    .font-bold, b, strong { font-weight: bold !important; }
    .font-semibold { font-weight: 600 !important; }
    .italic { font-style: italic !important; }
    .uppercase { text-transform: uppercase !important; }
    .w-24 { width: 96px !important; }
    .mx-auto { margin-left: auto !important; margin-right: auto !important; }
    .border-b { border-bottom-width: 1px !important; }
    .border-black { border-color: #000000 !important; }
    .signature-block, .stats-summary-container {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

  fs.writeFileSync(tmpHtml, fullHtml, 'utf8');

  try {
    await new Promise((resolve, reject) => {
      execFile(
        browserBin,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-sandbox',
          '--no-pdf-header-footer',
          `--print-to-pdf=${tmpPdf}`,
          tmpHtml
        ],
        { timeout: 35000 },
        (error) => {
          if (error) return reject(error);
          resolve();
        }
      );
    });

    if (!fs.existsSync(tmpPdf)) {
      throw new Error('Không thể tạo file PDF');
    }

    return fs.readFileSync(tmpPdf);
  } finally {
    try { if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml); } catch (_) {}
    try { if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf); } catch (_) {}
  }
}

module.exports = {
  findBrowserBinary,
  renderHtmlToPdf
};
