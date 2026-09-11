const ExcelJS = require('exceljs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('./database');

// Normalize Vietnamese string for robust column header / axis matching
function normalizeStr(s) {
  if (!s) return '';
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

// Extract raw or calculated value from ExcelJS cell
function extractCellValue(cell) {
  if (!cell) return null;
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val instanceof Date) return val;
    if (val.result !== undefined && val.result !== null) return val.result;
    if (val.text !== undefined && val.text !== null) return val.text;
    if (Array.isArray(val.richText)) {
      return val.richText.map(t => t.text || '').join('');
    }
    if (val.formula) return '';
  }
  return val;
}

// Extract string text from cell
function extractCellText(cell) {
  const val = extractCellValue(cell);
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString();
  return String(val).trim();
}

// Parse number from cell, handling formulas, %, and VN comma decimals
function parseExcelNumber(cell, fallback = 0) {
  if (!cell) return fallback;
  let val = extractCellValue(cell);
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  let str = String(val).trim();
  const isPercent = str.endsWith('%');
  if (isPercent) {
    str = str.slice(0, -1).trim();
  }
  str = str.replace(',', '.');
  let num = parseFloat(str);
  if (isNaN(num)) return fallback;
  if (isPercent) {
    num = num / 100;
  }
  return num;
}

// Normalize task type to DB constraint
function normalizeTaskType(val) {
  if (!val) return 'Thường xuyên';
  const s = normalizeStr(val);
  if (s.includes('dot xuat') || s === 'dx') return 'Đột xuất';
  return 'Thường xuyên';
}

// Helper to normalize axis text to axis_code
function parseAxisCode(axisText) {
  if (!axisText) return 'TRUC_1';
  if (typeof axisText === 'number') {
    if (axisText >= 1 && axisText <= 6) return `TRUC_${axisText}`;
  }
  const str = String(axisText).trim().toUpperCase();
  const norm = normalizeStr(axisText);
  if (str.includes('TRỤC 1') || str.includes('TRUC 1') || str.includes('TRỤC I ') || str === 'TRỤC I' || str === '1' || norm.includes('kinh te') || norm.includes('nhiem vu chinh tri') || str.includes('(1)')) return 'TRUC_1';
  if (str.includes('TRỤC 2') || str.includes('TRUC 2') || str.includes('TRỤC II') || str === '2' || norm.includes('the che') || norm.includes('phan cap') || str.includes('(2)')) return 'TRUC_2';
  if (str.includes('TRỤC 3') || str.includes('TRUC 3') || str.includes('TRỤC III') || str === '3' || norm.includes('khoa hoc') || norm.includes('cong nghe') || norm.includes('chuyen doi so') || str.includes('(3)')) return 'TRUC_3';
  if (str.includes('TRỤC 4') || str.includes('TRUC 4') || str.includes('TRỤC IV') || str === '4' || norm.includes('xay dung dang') || norm.includes('tham nhung') || str.includes('(4)')) return 'TRUC_4';
  if (str.includes('TRỤC 5') || str.includes('TRUC 5') || str.includes('TRỤC V ') || str === 'TRỤC V' || str === '5' || norm.includes('van hoa') || norm.includes('an sinh') || str.includes('(5)')) return 'TRUC_5';
  if (str.includes('TRỤC 6') || str.includes('TRUC 6') || str.includes('TRỤC VI') || str === '6' || norm.includes('quoc phong') || norm.includes('an ninh') || norm.includes('doi ngoai') || str.includes('(6)')) return 'TRUC_6';
  return 'TRUC_1';
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  const parts = str.split(/[/.-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return str;
}

function formatAdministrativeDate(locationName = 'TP. Hồ Chí Minh') {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${locationName || 'TP. Hồ Chí Minh'}, ngày ${d} tháng ${m} năm ${y}`;
}

function formatDateVN(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const str = String(val).trim();
  if (!str || str === 'null' || str === 'undefined' || str === '—') return '';
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]}`;
  }
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[3].padStart(2, '0')}/${ymdMatch[2].padStart(2, '0')}/${ymdMatch[1]}`;
  }
  const dmyDash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmyDash) {
    return `${dmyDash[1].padStart(2, '0')}/${dmyDash[2].padStart(2, '0')}/${dmyDash[3]}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const y = parsed.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return str;
}

function normalizeOutputResult(val) {
  if (!val) return 'Văn bản/ Tài liệu';
  const str = String(val).trim();
  const lower = str.toLowerCase();
  if (lower.includes('báo cáo')) return 'Báo cáo tổng hợp';
  if (lower.includes('tờ trình') || lower.includes('công văn') || lower.includes('văn bản') || lower.includes('tài liệu')) return 'Văn bản/ Tài liệu';
  if (lower.includes('quyết định') || lower.includes('chỉ thị')) return 'Quyết định/ Chỉ thị';
  if (lower.includes('kế hoạch')) return 'Kế hoạch thực hiện';
  if (lower.includes('phần mềm') || lower.includes('hệ thống') || lower.includes('ứng dụng') || lower.includes('dữ liệu')) return 'Sản phẩm phần mềm';
  if (lower.includes('hội nghị') || lower.includes('hội thảo') || lower.includes('tập huấn') || lower.includes('tọa đàm')) return 'Hội nghị/ Hội thảo';
  if (lower.includes('kiểm tra') || lower.includes('giám sát') || lower.includes('thanh tra')) return 'Kết quả kiểm tra giám sát';
  return str;
}

// Column matching helper for standard tasks
function findColumnMapping(rowCells) {
  const mapping = {};
  rowCells.forEach((text, colIndex) => {
    const s = normalizeStr(text);
    if (!s) return;
    if (!mapping.task_name && (s.includes('ten cong viec') || s.includes('ten nhiem vu') || s.includes('noi dung cong viec') || s.includes('noi dung cv') || s === 'cong viec' || s === 'nhiem vu' || s === 'ten san pham')) {
      mapping.task_name = colIndex;
    } else if (!mapping.dept_code && (s.includes('ma don vi') || s.includes('ma phong') || s.includes('don vi') || s.includes('phong ban'))) {
      mapping.dept_code = colIndex;
    } else if (!mapping.output_result && (s.includes('ket qua dau ra') || s.includes('san pham dau ra') || s.includes('ket qua') || s === 'san pham')) {
      mapping.output_result = colIndex;
    } else if (!mapping.deadline && (s.includes('thoi han') || s.includes('han hoan thanh') || s.includes('ngay hoan thanh') || s.includes('han chot') || s === 'han')) {
      mapping.deadline = colIndex;
    } else if (!mapping.task_type && (s.includes('loai viec') || s.includes('loai cong viec') || s.includes('loai cv') || s.includes('loai nhiem vu') || s === 'loai' || s.includes('phan loai'))) {
      mapping.task_type = colIndex;
    } else if (!mapping.standard_score && (s.includes('diem chuan') || s.includes('muc diem') || s.includes('diem dinh muc') || s === 'diem')) {
      mapping.standard_score = colIndex;
    } else if (!mapping.difficulty_weight && (s.includes('he so do kho') || s.includes('he so') || s.includes('do kho'))) {
      mapping.difficulty_weight = colIndex;
    } else if (!mapping.max_converted_score && (s.includes('diem quy doi') || s.includes('quy doi') || s.includes('toi da'))) {
      mapping.max_converted_score = colIndex;
    } else if (!mapping.expected_evidence && (s.includes('minh chung') || s.includes('tai lieu') || s.includes('ho so'))) {
      mapping.expected_evidence = colIndex;
    } else if (!mapping.note && (s.includes('ghi chu') || s.includes('luu y'))) {
      mapping.note = colIndex;
    } else if (!mapping.axis_code && (s.includes('truc ket qua') || s.includes('truc trong tam') || s.includes('truc'))) {
      mapping.axis_code = colIndex;
    } else if (!mapping.status && (s.includes('trang thai') || s.includes('tinh trang'))) {
      mapping.status = colIndex;
    } else if (!mapping.period && (s.includes('ky danh gia') || s.includes('ma ky') || s === 'ky')) {
      mapping.period = colIndex;
    }
  });
  return mapping;
}

// Find header row and column mapping in sheet
function findHeaderRowAndMapping(sheet) {
  let bestRowIndex = -1;
  let bestMapping = null;
  let maxMatchedCols = 0;

  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    const cells = [];
    row.eachCell({ includeEmpty: true }, (c, col) => {
      cells[col] = extractCellText(c);
    });

    const m = findColumnMapping(cells);
    const matchedCount = Object.keys(m).length;
    // Header row must at least identify task_name
    if (m.task_name && matchedCount > maxMatchedCols) {
      maxMatchedCols = matchedCount;
      bestRowIndex = r;
      bestMapping = m;
    }
  }

  // Fallback to standard template defaults if no named header matched
  if (!bestMapping || !bestMapping.task_name) {
    bestMapping = {
      dept_code: 2,
      task_name: 3,
      output_result: 4,
      deadline: 5,
      task_type: 6,
      standard_score: 7,
      difficulty_weight: 8,
      max_converted_score: 9,
      expected_evidence: 10,
      note: 11,
      axis_code: 12,
      status: 13,
      period: 14
    };
    bestRowIndex = 2;
  }

  return { headerRowIndex: bestRowIndex, mapping: bestMapping };
}

async function importStandardTasksFromExcel(fileOrPath, targetPeriodId = null, options = {}) {
  const updateExisting = options.updateExisting !== undefined ? Boolean(options.updateExisting) : true;
  const workbook = new ExcelJS.Workbook();
  if (Buffer.isBuffer(fileOrPath)) {
    await workbook.xlsx.load(fileOrPath);
  } else {
    await workbook.xlsx.readFile(fileOrPath);
  }

  // 1. Intelligent sheet selection
  let sheet = null;
  // A. Try exact or fuzzy sheet name match
  for (const ws of workbook.worksheets) {
    const nameNorm = normalizeStr(ws.name);
    if (nameNorm.includes('mau import') || nameNorm.includes('danh muc') || nameNorm.includes('cong viec') || nameNorm.includes('san pham')) {
      sheet = ws;
      break;
    }
  }

  // B. If not found by name, scan all sheets for one containing a task_name header
  if (!sheet) {
    for (const ws of workbook.worksheets) {
      const { headerRowIndex, mapping } = findHeaderRowAndMapping(ws);
      if (headerRowIndex !== -1 && mapping.task_name && Object.keys(mapping).length >= 2) {
        sheet = ws;
        break;
      }
    }
  }

  // C. Fallback to first sheet
  if (!sheet) {
    sheet = workbook.worksheets[0];
  }

  if (!sheet) {
    throw new Error('Không tìm thấy sheet dữ liệu danh mục công việc chuẩn trong file Excel');
  }

  // Pre-load periods and departments for row-level resolution
  const allPeriods = db.prepare('SELECT id, code, name FROM periods').all();
  const periodLookup = new Map();
  allPeriods.forEach(p => {
    periodLookup.set(p.id.toLowerCase(), p.id);
    if (p.code) periodLookup.set(p.code.toLowerCase().trim(), p.id);
    if (p.name) periodLookup.set(normalizeStr(p.name), p.id);
  });

  // 2. Resolve default period with DB existence validation
  let periodId = targetPeriodId;
  const targetExists = (periodId && typeof periodId === 'string' && periodId !== 'undefined' && periodId !== 'null' && periodId !== 'all')
    ? periodLookup.get(periodId.toLowerCase())
    : null;

  if (targetExists) {
    periodId = targetExists;
  } else {
    const defaultPeriod = db.prepare('SELECT id FROM periods WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
    periodId = defaultPeriod ? defaultPeriod.id : (allPeriods[0]?.id || 'p-1');
  }

  const allDepts = db.prepare('SELECT id, code, name FROM departments').all();
  const deptLookup = new Map();
  allDepts.forEach(d => {
    if (d.code) deptLookup.set(d.code.toLowerCase().trim(), d.code);
    if (d.name) deptLookup.set(normalizeStr(d.name), d.code);
    deptLookup.set(d.id.toLowerCase(), d.code || d.id);
  });

  // 3. Detect header row and column mapping
  const { headerRowIndex, mapping } = findHeaderRowAndMapping(sheet);

  const tasks = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const checkExisting = db.prepare(`
    SELECT id FROM standard_tasks 
    WHERE period_id = ? AND LOWER(TRIM(task_name)) = ? AND (deadline = ? OR (deadline IS NULL AND ? IS NULL))
    LIMIT 1
  `);

  const updateTask = db.prepare(`
    UPDATE standard_tasks SET
      dept_code = COALESCE(?, dept_code),
      output_result = ?,
      deadline = ?,
      task_type = ?,
      standard_score = ?,
      difficulty_weight = ?,
      max_converted_score = ?,
      expected_evidence = ?,
      note = ?,
      axis_code = ?,
      status = COALESCE(?, status)
    WHERE id = ?
  `);

  const insertTask = db.prepare(`
    INSERT INTO standard_tasks (
      id, period_id, dept_code, task_name, output_result, deadline,
      task_type, standard_score, difficulty_weight, max_converted_score,
      expected_evidence, note, axis_code, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const runImport = db.transaction(() => {
    sheet.eachRow((row, rowNumber) => {
      // Skip header and title rows
      if (rowNumber <= headerRowIndex) return;

      // Get task name
      const taskNameCell = mapping.task_name ? row.getCell(mapping.task_name) : null;
      const taskName = extractCellText(taskNameCell).trim();
      if (!taskName) return;

      // Skip numeric sub-header rows (e.g. Row 3: 1, 2, 3...) or repeated headers
      if (/^\d+$/.test(taskName)) return;
      const taskNameNorm = normalizeStr(taskName);
      if (taskNameNorm.includes('ten cong viec') || taskNameNorm.includes('ten nhiem vu') || taskNameNorm.includes('noi dung cong viec')) return;

      // Resolve row-level period if specified
      let rowPeriodId = periodId;
      if (mapping.period) {
        const periodCellText = extractCellText(row.getCell(mapping.period));
        if (periodCellText) {
          const matchedP = periodLookup.get(periodCellText.toLowerCase().trim()) || periodLookup.get(normalizeStr(periodCellText));
          if (matchedP) rowPeriodId = matchedP;
        }
      }
      if (!rowPeriodId || !allPeriods.some(p => p.id === rowPeriodId)) {
        rowPeriodId = periodId;
      }

      // Resolve dept_code
      let deptCode = '';
      if (mapping.dept_code) {
        const rawDept = extractCellText(row.getCell(mapping.dept_code)).trim();
        if (rawDept) {
          deptCode = deptLookup.get(rawDept.toLowerCase()) || deptLookup.get(normalizeStr(rawDept)) || rawDept;
        }
      }
      if (!deptCode && allDepts.length > 0) {
        deptCode = allDepts[0].code || 'A29.123.22';
      }

      // Output result
      const rawOutputResult = mapping.output_result ? extractCellText(row.getCell(mapping.output_result)).trim() : '';
      const outputResult = normalizeOutputResult(rawOutputResult);

      // Deadline
      const deadlineVal = mapping.deadline ? extractCellValue(row.getCell(mapping.deadline)) : null;
      const deadline = formatDate(deadlineVal) || '2026-09-30';

      // Task type
      const rawTaskType = mapping.task_type ? extractCellText(row.getCell(mapping.task_type)).trim() : '';
      const taskType = normalizeTaskType(rawTaskType);

      // Standard score
      const stdCell = mapping.standard_score ? row.getCell(mapping.standard_score) : null;
      let standardScore = parseExcelNumber(stdCell, taskType === 'Đột xuất' ? 12 : 10);
      if (standardScore <= 0) standardScore = (taskType === 'Đột xuất' ? 12 : 10);

      // Difficulty weight
      const diffCell = mapping.difficulty_weight ? row.getCell(mapping.difficulty_weight) : null;
      let difficultyWeight = parseExcelNumber(diffCell, 1.0);
      if (difficultyWeight > 10 && difficultyWeight <= 200) {
        difficultyWeight = difficultyWeight / 100;
      }
      if (difficultyWeight <= 0) difficultyWeight = 1.0;

      // Max converted score
      const maxCell = mapping.max_converted_score ? row.getCell(mapping.max_converted_score) : null;
      let maxConvertedScore = parseExcelNumber(maxCell, 0);
      if (maxConvertedScore <= 0) {
        maxConvertedScore = Math.round(standardScore * difficultyWeight * 100) / 100;
      }

      // Expected evidence, note, axis, status
      const expectedEvidence = mapping.expected_evidence ? extractCellText(row.getCell(mapping.expected_evidence)).trim() : '';
      const note = mapping.note ? extractCellText(row.getCell(mapping.note)).trim() : '';
      const axisCell = mapping.axis_code ? row.getCell(mapping.axis_code) : null;
      const axisText = extractCellValue(axisCell);
      const axisCode = parseAxisCode(axisText);
      const rawStatus = mapping.status ? extractCellText(row.getCell(mapping.status)).trim() : '';
      const status = rawStatus || 'Hoạt động';

      // Upsert task: Update if already exists in this period with same deadline, else Insert
      const existing = checkExisting.get(rowPeriodId, taskName.toLowerCase(), deadline, deadline);
      if (existing) {
        if (updateExisting) {
          updateTask.run(
            deptCode, outputResult, deadline, taskType, standardScore,
            difficultyWeight, maxConvertedScore, expectedEvidence, note,
            axisCode, status, existing.id
          );
          updatedCount++;
          tasks.push({ id: existing.id, taskName, standardScore, difficultyWeight, axisCode, isUpdated: true });
        } else {
          skippedCount++;
          tasks.push({ id: existing.id, taskName, standardScore, difficultyWeight, axisCode, isSkipped: true });
        }
      } else {
        const id = uuidv4();
        insertTask.run(
          id, rowPeriodId, deptCode, taskName, outputResult, deadline,
          taskType, standardScore, difficultyWeight, maxConvertedScore,
          expectedEvidence, note, axisCode, status
        );
        insertedCount++;
        tasks.push({ id, taskName, standardScore, difficultyWeight, axisCode, isInserted: true });
      }
    });
  });

  runImport();

  return {
    importedCount: insertedCount + updatedCount,
    insertedCount,
    updatedCount,
    skippedCount,
    sheetName: sheet.name,
    tasks
  };
}

// Generate Excel template for importing system users
async function generateUserImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hệ thống Đánh giá KPI';
  workbook.created = new Date();

  // Load departments and roles from DB for reference
  const depts = db.prepare('SELECT id, code, name FROM departments WHERE is_active = 1 OR is_active IS NULL ORDER BY code').all();
  const roles = db.prepare('SELECT id, code, name, description FROM roles ORDER BY is_system DESC, code').all();

  // Sheet 1: 01. Danh sách người dùng
  const ws = workbook.addWorksheet('01. Danh sách người dùng', {
    views: [{ showGridLines: true }]
  });

  // Title
  ws.mergeCells('A1:M1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'DANH SÁCH CÁN BỘ, CÔNG CHỨC, VIÊN CHỨC NHẬP VÀO HỆ THỐNG KPI';
  titleCell.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF991B1B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:M2');
  const subCell = ws.getCell('A2');
  subCell.value = 'Áp dụng theo Quy định số 366-QĐ/TW & Hướng dẫn số 06-HD/BTCTU (Các cột có dấu (*) là bắt buộc)';
  subCell.font = { name: 'Times New Roman', size: 11, italic: true, color: { argb: 'FF475569' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;

  // Header row at row 4
  const headers = [
    'STT',
    'Tên đăng nhập (*)',
    'Mật khẩu',
    'Họ và tên (*)',
    'Mã hoặc Tên Phòng/Ban (*)',
    'Vai trò hệ thống (*)',
    'Chức danh Đảng',
    'Chức vụ chính quyền',
    'Tên đăng nhập người quản lý',
    'Ngày sinh',
    'Giới tính',
    'Số điện thoại',
    'Email'
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 32;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' } // Dark blue
    };
    cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  // Set column widths
  ws.columns = [
    { width: 6 },   // STT
    { width: 22 },  // Tên đăng nhập
    { width: 14 },  // Mật khẩu
    { width: 26 },  // Họ và tên
    { width: 34 },  // Phòng ban
    { width: 22 },  // Vai trò
    { width: 20 },  // Chức danh Đảng
    { width: 24 },  // Chức vụ chính quyền
    { width: 26 },  // Tên đăng nhập người quản lý
    { width: 15 },  // Ngày sinh
    { width: 12 },  // Giới tính
    { width: 16 },  // SĐT
    { width: 28 }   // Email
  ];

  // Sample data rows
  const sampleDept = depts[0]?.code || 'BTC.TU';
  const sampleDeptName = depts[1]?.name || depts[0]?.name || 'Ban Tổ chức Thành ủy';
  const sampleData = [
    [1, 'nguyen_van_a', '123456', 'Nguyễn Văn A', sampleDept, 'cbql', 'Bí thư Chi bộ', 'Trưởng ban / Trưởng phòng', '', '15/05/1980', 'Nam', '0901234567', 'nguyenvana@tphcm.gov.vn'],
    [2, 'tran_thi_b', '123456', 'Trần Thị B', sampleDept, 'cbnv', 'Đảng viên', 'Chuyên viên chính', 'nguyen_van_a', '20/08/1988', 'Nữ', '0912345678', 'tranthib@tphcm.gov.vn'],
    [3, 'le_van_c', '123456', 'Lê Văn C', sampleDeptName, 'cbnv', 'Đảng viên', 'Chuyên viên', 'nguyen_van_a', '10/12/1992', 'Nam', '0987654321', 'levanc@tphcm.gov.vn']
  ];

  sampleData.forEach((r) => {
    const row = ws.addRow(r);
    row.height = 24;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Times New Roman', size: 11 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
      if (colNumber === 1 || colNumber === 10 || colNumber === 11 || colNumber === 12) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
  });

  // Sheet 2: 02. Hướng dẫn & Danh mục
  const refWs = workbook.addWorksheet('02. Hướng dẫn & Danh mục', {
    views: [{ showGridLines: true }]
  });

  refWs.mergeCells('A1:D1');
  const refTitle = refWs.getCell('A1');
  refTitle.value = 'HƯỚNG DẪN ĐIỀN DỮ LIỆU & DANH MỤC THAM CHIẾU HỆ THỐNG';
  refTitle.font = { name: 'Times New Roman', size: 13, bold: true, color: { argb: 'FF1E3A8A' } };
  refTitle.alignment = { horizontal: 'left', vertical: 'middle' };
  refWs.getRow(1).height = 25;

  // Instructions
  const instrs = [
    '1. Các cột có dấu (*) là bắt buộc phải điền thông tin (Tên đăng nhập, Họ và tên, Phòng/Ban, Vai trò).',
    '2. Tên đăng nhập viết liền không dấu, có thể dùng dấu gạch dưới (ví dụ: nguyen_van_a, vana, cbql_phong).',
    '3. Mật khẩu: nếu để trống thì hệ thống tự đặt mật khẩu mặc định là "123456". Cán bộ có thể đổi sau.',
    '4. Phòng/Ban: Có thể điền Mã phòng ban hoặc Tên phòng ban theo danh mục ở bảng bên dưới.',
    '5. Vai trò: Điền "cbnv" (Cán bộ nhân viên), "cbql" (Lãnh đạo, quản lý), hoặc "admin" (Quản trị viên).',
    '6. Tên đăng nhập người quản lý: Điền tên đăng nhập của lãnh đạo trực tiếp phụ trách để tự động phân cấp.',
    '7. Ngày sinh: Định dạng dd/mm/yyyy (ví dụ: 15/05/1985).'
  ];

  let curRow = 3;
  instrs.forEach(ins => {
    refWs.mergeCells(`A${curRow}:D${curRow}`);
    const cell = refWs.getCell(`A${curRow}`);
    cell.value = ins;
    cell.font = { name: 'Times New Roman', size: 10.5, italic: true };
    curRow++;
  });

  curRow += 1;
  refWs.mergeCells(`A${curRow}:B${curRow}`);
  const deptTitle = refWs.getCell(`A${curRow}`);
  deptTitle.value = 'DANH SÁCH PHÒNG BAN TRONG HỆ THỐNG';
  deptTitle.font = { name: 'Times New Roman', size: 11, bold: true };
  curRow++;

  const deptHRow = refWs.addRow(['Mã Phòng/Ban', 'Tên Phòng/Ban']);
  deptHRow.height = 22;
  deptHRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    c.font = { name: 'Times New Roman', size: 10.5, bold: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  depts.forEach(d => {
    const r = refWs.addRow([d.code, d.name]);
    r.eachCell(c => {
      c.font = { name: 'Times New Roman', size: 10.5 };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  curRow = refWs.lastRow.number + 2;
  refWs.mergeCells(`A${curRow}:C${curRow}`);
  const roleTitle = refWs.getCell(`A${curRow}`);
  roleTitle.value = 'DANH SÁCH VAI TRÒ HỆ THỐNG';
  roleTitle.font = { name: 'Times New Roman', size: 11, bold: true };
  curRow++;

  const roleHRow = refWs.addRow(['Mã vai trò', 'Tên vai trò', 'Mô tả']);
  roleHRow.height = 22;
  roleHRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    c.font = { name: 'Times New Roman', size: 10.5, bold: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  roles.forEach(r => {
    const row = refWs.addRow([r.code, r.name, r.description || '']);
    row.eachCell(c => {
      c.font = { name: 'Times New Roman', size: 10.5 };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  refWs.columns = [
    { width: 22 },
    { width: 42 },
    { width: 45 },
    { width: 25 }
  ];

  return workbook;
}

// Import multiple users from Excel file
async function importUsersFromExcel(fileOrPath, options = {}) {
  const workbook = new ExcelJS.Workbook();
  if (Buffer.isBuffer(fileOrPath)) {
    await workbook.xlsx.load(fileOrPath);
  } else {
    await workbook.xlsx.readFile(fileOrPath);
  }

  const sheet = workbook.getWorksheet('01. Danh sách người dùng') || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Không tìm thấy sheet danh sách người dùng trong file Excel');
  }

  // Load departments and roles for matching
  const depts = db.prepare('SELECT id, code, name FROM departments').all();
  const roles = db.prepare('SELECT id, code, name FROM roles').all();
  const existingUsers = db.prepare('SELECT id, username FROM users').all();

  // Mapping lookup
  const deptLookup = new Map();
  depts.forEach(d => {
    deptLookup.set(d.id.toLowerCase(), d.id);
    if (d.code) deptLookup.set(d.code.trim().toLowerCase(), d.id);
    if (d.name) deptLookup.set(d.name.trim().toLowerCase(), d.id);
  });

  const roleLookup = new Map();
  roles.forEach(r => {
    roleLookup.set(r.code.toLowerCase(), r);
    roleLookup.set(r.name.toLowerCase(), r);
  });

  const userLookup = new Map(); // username -> id
  existingUsers.forEach(u => {
    userLookup.set(u.username.toLowerCase(), u.id);
  });

  const updateExisting = options.updateExisting !== false; // default true
  let totalRows = 0;
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const errors = [];
  const pendingManagers = []; // { userId, managerUsername, rowNumber }

  const insertUserStmt = db.prepare(`
    INSERT INTO users (
      id, username, password, full_name, role, target_role, role_id, manager_id,
      management_role, final_evaluator_id,
      party_title, gov_title, dept_id, birth_date, gender, phone, email, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const updateUserStmt = db.prepare(`
    UPDATE users
    SET full_name = ?, role = ?, target_role = ?, role_id = ?,
        management_role = COALESCE(?, management_role),
        party_title = ?, gov_title = ?, dept_id = ?, birth_date = ?,
        gender = ?, phone = ?, email = ?
    WHERE id = ?
  `);

  sheet.eachRow((row, rowNumber) => {
    const cell1Text = String(row.getCell(1).text || '').trim();
    const cell2Text = String(row.getCell(2).text || '').trim();
    const cell4Text = String(row.getCell(4).text || '').trim();

    // Skip title or subtitle banners
    if (cell1Text.toUpperCase().includes('DANH SÁCH') || cell1Text.toUpperCase().includes('QUY ĐỊNH') || cell1Text.toUpperCase().includes('HƯỚNG DẪN')) return;

    // Skip table header row
    if (cell1Text.toUpperCase() === 'STT' || cell2Text.toLowerCase().includes('tên đăng nhập') || cell4Text.toLowerCase().includes('họ và tên')) return;

    const usernameRaw = cell2Text;
    if (!usernameRaw) return; // Skip blank lines
    if (usernameRaw.toLowerCase().includes('tên đăng nhập') || usernameRaw.toLowerCase() === 'username') return;

    totalRows++;
    const username = usernameRaw.toLowerCase().replace(/\s+/g, '_');
    const password = String(row.getCell(3).text || '').trim() || '123456';
    const fullName = String(row.getCell(4).text || '').trim();

    if (!fullName) {
      errors.push({ row: rowNumber, username, message: 'Thiếu họ và tên cán bộ' });
      return;
    }

    // Match department
    const deptInput = String(row.getCell(5).text || '').trim().toLowerCase();
    let deptId = deptLookup.get(deptInput) || null;
    if (!deptId && deptInput) {
      // Fuzzy search in departments
      const foundDept = depts.find(d => 
        (d.code && d.code.toLowerCase().includes(deptInput)) || 
        (d.name && d.name.toLowerCase().includes(deptInput))
      );
      if (foundDept) deptId = foundDept.id;
    }

    // Match role
    const roleInput = String(row.getCell(6).text || '').trim().toLowerCase();
    let matchedRole = roleLookup.get(roleInput);
    if (!matchedRole) {
      if (roleInput.includes('đơn vị') || roleInput.includes('admin_donvi')) {
        matchedRole = roles.find(r => r.code === 'admin_donvi');
      } else if (roleInput.includes('admin') || roleInput.includes('quản trị')) {
        matchedRole = roles.find(r => r.code === 'admin');
      } else if (roleInput.includes('ql') || roleInput.includes('lãnh đạo') || roleInput.includes('trưởng') || roleInput.includes('cbql')) {
        matchedRole = roles.find(r => r.code === 'cbql_phong' || r.code === 'cbql');
      } else {
        matchedRole = roles.find(r => r.code === 'cbnv');
      }
    }

    const isAdm = matchedRole?.code === 'admin' || matchedRole?.code === 'admin_donvi';
    const effectiveRole = isAdm ? 'admin' : (matchedRole?.code.includes('cbql') || matchedRole?.code.includes('ld') ? 'cbql' : 'cbnv');
    const effectiveTargetRole = isAdm ? 'admin' : (effectiveRole === 'cbql' ? 'cbql' : 'cbnv');
    const effectiveRoleId = matchedRole?.id || null;

    const partyTitle = String(row.getCell(7).text || '').trim() || 'Đảng viên';
    const govTitle = String(row.getCell(8).text || '').trim() || 'Chuyên viên';
    const managerUsername = String(row.getCell(9).text || '').trim().toLowerCase();

    // Birth date
    const birthVal = row.getCell(10).value;
    let birthDate = '1985-01-01';
    if (birthVal) {
      const parsedBirth = formatDate(birthVal);
      if (parsedBirth) birthDate = parsedBirth;
    }

    // Gender
    const genderRaw = String(row.getCell(11).text || '').trim().toLowerCase();
    const gender = genderRaw.includes('nữ') || genderRaw === 'f' ? 'Nữ' : 'Nam';

    const phone = String(row.getCell(12).text || '').trim();
    const email = String(row.getCell(13).text || '').trim();

    // Determine management role
    let managementRole = 'nhan_vien';
    if (effectiveRole === 'admin') {
      managementRole = 'lanh_dao';
    } else if (effectiveRole === 'cbql') {
      const lowerGov = govTitle.toLowerCase();
      const lowerRole = roleInput.toLowerCase();
      if (lowerGov.includes('trưởng ban') || lowerGov.includes('trưởng phòng') || lowerGov.includes('giám đốc') || lowerGov.includes('hiệu trưởng') || lowerGov.includes('chánh') || lowerRole.includes('trưởng') || lowerRole.includes('ld_coquan')) {
        managementRole = 'lanh_dao';
      } else {
        managementRole = 'quan_ly';
      }
    } else {
      if (govTitle.toLowerCase().includes('tổ trưởng') || govTitle.toLowerCase().includes('trưởng bộ phận')) {
        managementRole = 'to_truong';
      } else {
        managementRole = 'nhan_vien';
      }
    }

    try {
      const existingId = userLookup.get(username);
      if (existingId) {
        if (updateExisting) {
          updateUserStmt.run(
            fullName, effectiveRole, effectiveTargetRole, effectiveRoleId,
            managementRole,
            partyTitle, govTitle, deptId, birthDate,
            gender, phone, email, existingId
          );
          updatedCount++;
          if (managerUsername) {
            pendingManagers.push({ userId: existingId, managerUsername, rowNumber });
          }
        } else {
          skippedCount++;
        }
      } else {
        const newId = uuidv4();
        insertUserStmt.run(
          newId, username, password, fullName, effectiveRole, effectiveTargetRole,
          effectiveRoleId, null, managementRole, null, partyTitle, govTitle, deptId, birthDate,
          gender, phone, email
        );
        userLookup.set(username, newId);
        importedCount++;
        if (managerUsername) {
          pendingManagers.push({ userId: newId, managerUsername, rowNumber });
        }
      }
    } catch (err) {
      errors.push({ row: rowNumber, username, message: err.message });
    }
  });

  // Second pass: resolve manager_id
  const updateManagerStmt = db.prepare('UPDATE users SET manager_id = ? WHERE id = ?');
  for (const pm of pendingManagers) {
    const mgrId = userLookup.get(pm.managerUsername);
    if (mgrId && mgrId !== pm.userId) {
      try {
        updateManagerStmt.run(mgrId, pm.userId);
      } catch (e) {}
    }
  }

  return {
    totalRows,
    importedCount,
    updatedCount,
    skippedCount,
    errorCount: errors.length,
    errors
  };
}

// Helper to load system configs
function getSystemConfigs() {
  try {
    const configs = db.prepare('SELECT key, value FROM system_configs').all();
    const dict = {};
    configs.forEach(c => { dict[c.key] = c.value; });
    return dict;
  } catch (e) {
    return {};
  }
}

// Export strictly according to Mẫu 01-A (CBQL) or Mẫu 01-B (CBNV) and HD.06
async function exportCBQLWorkbook(periodId, userId) {
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(periodId);
  const user = db.prepare(`
    SELECT u.*, d.name as dept_name, d.parent_agency, d.location_name
    FROM users u 
    LEFT JOIN departments d ON u.dept_id = d.id 
    WHERE u.id = ?
  `).get(userId);

  if (!period || !user) {
    throw new Error('Không tìm thấy thông tin kỳ đánh giá hoặc cán bộ');
  }

  const sysConfigs = getSystemConfigs();
  const parentAgency = user.parent_agency || sysConfigs.PARENT_AGENCY_NAME || 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH';
  const unitName = user.dept_name ? user.dept_name.toUpperCase() : (sysConfigs.UNIT_NAME || 'BAN TỔ CHỨC THÀNH ỦY TP. HỒ CHÍ MINH');
  const locationName = user.location_name || sysConfigs.LOCATION_NAME || 'TP. Hồ Chí Minh';
  const leaderName = sysConfigs.LEADER_SIGNER_NAME || 'Thái Thị Bích Liên';
  const leaderTitle = sysConfigs.LEADER_SIGNER_TITLE || 'PHÓ TRƯỞNG BAN THƯỜNG TRỰC';
  const deptLeaderTitle = sysConfigs.DEPT_LEADER_TITLE || 'TRƯỞNG PHÒNG';

  const isCbnv = (user.target_role === 'cbnv') || (user.role === 'cbnv' && user.target_role !== 'cbql');
  const roleFilter = isCbnv ? 'cbnv' : 'cbql';

  // Fetch assigned tasks for user in this period
  const tasks = db.prepare(`
    SELECT * FROM assigned_tasks 
    WHERE period_id = ? AND user_id = ?
  `).all(periodId, userId);

  // Fetch axes
  const axes = db.prepare('SELECT * FROM axes ORDER BY code ASC').all();

  // Fetch evaluation
  const evaluation = db.prepare('SELECT * FROM evaluations WHERE period_id = ? AND user_id = ?').get(periodId, userId) || {
    part1_score: 0,
    part2_score: 0,
    bonus_score: 0,
    total_score: 0,
    rank_proposed: 'Chưa tự đánh giá',
    superior_rank: null,
    superior_comment: ''
  };

  // Fetch criteria details
  const criteriaList = db.prepare(`
    SELECT c.*, COALESCE(d.is_satisfied, 1) as is_satisfied, COALESCE(d.score, c.max_score) as score, d.note
    FROM common_criteria c
    LEFT JOIN evaluation_criteria_details d ON c.id = d.criteria_id AND d.evaluation_id = ?
    WHERE c.target_role = 'all' OR c.target_role = ? OR c.target_role IS NULL
    ORDER BY c.code ASC
  `).all(evaluation.id || '', roleFilter);

  // Calculate Part 2 according to HD.06
  let planTotalA = 0;
  let execTotalB = 0;
  let bonusTotal = 0;

  tasks.forEach(t => {
    const std = t.standard_score || 10;
    const diff = t.difficulty_weight || 1.0;
    planTotalA += Number((std * diff).toFixed(2));
    execTotalB += Number((t.converted_score || 0).toFixed(2));
    if (t.is_bonus_approved) {
      bonusTotal += Number((t.bonus_score || ((t.converted_score || 0) * 0.05)).toFixed(2));
    }
  });

  const part2Score = evaluation.part2_score !== undefined && evaluation.part2_score !== null 
    ? evaluation.part2_score 
    : (planTotalA > 0 ? Number(Math.min(70.0, 70.0 * (execTotalB / planTotalA)).toFixed(2)) : 0);
  const bonusScore = evaluation.bonus_score !== undefined && evaluation.bonus_score !== null 
    ? evaluation.bonus_score 
    : Number(Math.min(7.0, bonusTotal).toFixed(2));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${unitName} - Hệ thống quản lý công việc và chấm điểm hiệu suất`;
  workbook.created = new Date();

  // -----------------------------------------------------------------------------------
  // SHEET 1: MẪU 01-A (CBQL) / MẪU 01-B (CBNV)
  // -----------------------------------------------------------------------------------
  const sheetTitle = isCbnv ? 'MẪU 01-B (CBNV)' : '3 - MẪU TỰ ĐÁNH GIÁ LD, QL';
  const ws = workbook.addWorksheet(sheetTitle, {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 }
  });

  ws.columns = [
    { key: 'A', width: 7 },
    { key: 'B', width: 62 },
    { key: 'C', width: 12 },
    { key: 'D', width: 12 },
    { key: 'E', width: 15 },
    { key: 'F', width: 15 },
    { key: 'G', width: 14 },
    { key: 'H', width: 16 },
    { key: 'I', width: 18 }
  ];

  // Row 1: Mẫu Code
  const r1 = ws.getCell('H1');
  r1.value = isCbnv ? 'Mẫu 01-B' : 'Mẫu 01-A';
  r1.font = { name: 'Times New Roman', size: 14, bold: true };
  r1.alignment = { horizontal: 'right' };

  // Row 2: Organization & National Emblem
  ws.mergeCells('A2:D3');
  const orgCell = ws.getCell('A2');
  orgCell.value = `${parentAgency}\n${unitName}\n*`;
  orgCell.font = { name: 'Times New Roman', size: 14, bold: true };
  orgCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  ws.mergeCells('F2:I2');
  const nationCell = ws.getCell('F2');
  nationCell.value = 'ĐẢNG CỘNG SẢN VIỆT NAM';
  nationCell.font = { name: 'Times New Roman', size: 14, bold: true };
  nationCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3: Date
  ws.mergeCells('F3:I3');
  const dateCell = ws.getCell('F3');
  dateCell.value = formatAdministrativeDate(locationName);
  dateCell.font = { name: 'Times New Roman', size: 14, italic: true };
  dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 4: Title
  ws.mergeCells('A4:I4');
  const titleCell = ws.getCell('A4');
  titleCell.value = 'BẢN TỰ ĐÁNH GIÁ, XẾP LOẠI CỦA CÁ NHÂN';
  titleCell.font = { name: 'Times New Roman', size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 5: Role Subtitle & Period
  ws.mergeCells('A5:I5');
  const subTitleCell = ws.getCell('A5');
  subTitleCell.value = isCbnv 
    ? `(Dành cho công chức, viên chức không giữ chức vụ lãnh đạo, quản lý - ${period.name || 'Quý III/2026'})`
    : `(Dành cho cán bộ lãnh đạo, quản lý - ${period.name || 'Quý III/2026'})`;
  subTitleCell.font = { name: 'Times New Roman', size: 14, italic: true, bold: true };
  subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 6-10: Personnel info
  const setInfoRow = (rowNum, label, val) => {
    ws.mergeCells(`B${rowNum}:I${rowNum}`);
    const cell = ws.getCell(`B${rowNum}`);
    cell.value = `${label} ${val || ''}`;
    cell.font = { name: 'Times New Roman', size: 14 };
    cell.alignment = { vertical: 'middle' };
    ws.getRow(rowNum).height = 24;
  };
  const birthStr = formatDateVN(user.birth_date) || '10/04/1973';
  setInfoRow(6, 'Họ và tên:', `${user.full_name || ''}                                Ngày sinh: ${birthStr}`);
  setInfoRow(7, 'Chức vụ Đảng:', user.party_title || 'Đảng viên');
  setInfoRow(8, 'Chức vụ chính quyền:', user.gov_title || (isCbnv ? 'Chuyên viên' : 'Lãnh đạo'));
  setInfoRow(9, 'Chức vụ đoàn thể:', user.union_title || 'Không có');
  setInfoRow(10, 'Đơn vị công tác:', user.dept_name || '');

  // Row 11-12: Section Header
  ws.mergeCells('B11:I11');
  ws.getCell('B11').value = 'I. Tự đánh giá kết quả thực hiện nhiệm vụ';
  ws.getCell('B11').font = { name: 'Times New Roman', size: 14, bold: true };
  ws.getRow(11).height = 24;

  ws.mergeCells('B12:I12');
  ws.getCell('B12').value = 'Trên cơ sở nhiệm vụ được giao, cá nhân tự đánh giá về kết quả thực hiện nhiệm vụ theo quý như sau:';
  ws.getCell('B12').font = { name: 'Times New Roman', size: 14, italic: true };
  ws.getRow(12).height = 24;

  // Row 13: Group A Title
  ws.getCell('A13').value = 'A';
  ws.getCell('A13').font = { name: 'Times New Roman', size: 14, bold: true };
  ws.mergeCells('B13:I13');
  ws.getCell('B13').value = 'NHÓM TIÊU CHÍ CHUNG (30 ĐIỂM)';
  ws.getCell('B13').font = { name: 'Times New Roman', size: 14, bold: true };
  ws.getRow(13).height = 26;

  // Row 14: Header Table
  const tableHeader = ws.addRow([
    'TT', 'Tiêu chí / Nội dung', '', '',
    'Đảm bảo\n(Đánh dấu x)', 'Không\nđảm bảo\n(Đánh dấu x)', 'Điểm tối đa', 'Điểm đạt\n(Chấm tối đa nếu đảm bảo; Chấm 0 điểm nếu không đảm bảo)', 'Ghi chú'
  ]);
  tableHeader.font = { name: 'Times New Roman', size: 14, bold: true };
  tableHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  tableHeader.height = 44;
  ws.mergeCells(`B${tableHeader.number}:D${tableHeader.number}`);

  // Criteria Rows across 3 groups
  let sumPart1 = 0;
  
  // Group 1 Header
  const g1Row = ws.addRow(['1', 'Về phẩm chất chính trị, đạo đức, lối sống, thực hiện trách nhiệm nêu gương', '', '', '', '', 18, 18, '']);
  g1Row.font = { name: 'Times New Roman', size: 14, bold: true };
  g1Row.height = 28;
  ws.mergeCells(`B${g1Row.number}:D${g1Row.number}`);

  criteriaList.filter(c => c.group_no === 1).forEach(c => {
    const isSat = c.is_satisfied === 1;
    const score = isSat ? c.max_score : 0;
    sumPart1 += score;
    const r = ws.addRow([
      c.code, c.title, '', '',
      isSat ? 'x' : '', !isSat ? 'x' : '',
      c.max_score, score, c.note || ''
    ]);
    r.font = { name: 'Times New Roman', size: 14 };
    r.alignment = { vertical: 'middle', wrapText: true };
    r.height = 28;
    ws.mergeCells(`B${r.number}:D${r.number}`);
    r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  // Group 2 Header (Differentiated for CBQL vs CBNV)
  const g2Title = isCbnv 
    ? 'Tinh thần trách nhiệm, năng động, sáng tạo, đổi mới trong thực hiện nhiệm vụ'
    : 'Tư duy đổi mới, chiến lược, khát vọng cống hiến, dám nghĩ dám làm';
  const g2Row = ws.addRow(['2', g2Title, '', '', '', '', 4, 4, '']);
  g2Row.font = { name: 'Times New Roman', size: 14, bold: true };
  g2Row.height = 28;
  ws.mergeCells(`B${g2Row.number}:D${g2Row.number}`);

  criteriaList.filter(c => c.group_no === 2).forEach(c => {
    const isSat = c.is_satisfied === 1;
    const score = isSat ? c.max_score : 0;
    sumPart1 += score;
    const r = ws.addRow([
      c.code, c.title, '', '',
      isSat ? 'x' : '', !isSat ? 'x' : '',
      c.max_score, score, c.note || ''
    ]);
    r.font = { name: 'Times New Roman', size: 14 };
    r.alignment = { vertical: 'middle', wrapText: true };
    r.height = 28;
    ws.mergeCells(`B${r.number}:D${r.number}`);
    r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  // Group 3 Header
  const g3Row = ws.addRow(['3', 'Về tự phê bình và phê bình, tự soi, tự sửa, khắc phục hạn chế, khuyết điểm', '', '', '', '', 8, 8, '']);
  g3Row.font = { name: 'Times New Roman', size: 14, bold: true };
  g3Row.height = 28;
  ws.mergeCells(`B${g3Row.number}:D${g3Row.number}`);

  criteriaList.filter(c => c.group_no === 3).forEach(c => {
    const isSat = c.is_satisfied === 1;
    const score = isSat ? c.max_score : 0;
    sumPart1 += score;
    const r = ws.addRow([
      c.code, c.title, '', '',
      isSat ? 'x' : '', !isSat ? 'x' : '',
      c.max_score, score, c.note || ''
    ]);
    r.font = { name: 'Times New Roman', size: 14 };
    r.alignment = { vertical: 'middle', wrapText: true };
    r.height = 28;
    ws.mergeCells(`B${r.number}:D${r.number}`);
    r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    r.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  // Tổng (A)
  const totalARow = ws.addRow(['', 'Tổng (A) =', '', '', '', '', 30, sumPart1, '']);
  totalARow.font = { name: 'Times New Roman', size: 14, bold: true };
  totalARow.height = 28;
  ws.mergeCells(`B${totalARow.number}:D${totalARow.number}`);
  totalARow.getCell(7).alignment = { horizontal: 'right' };
  totalARow.getCell(8).alignment = { horizontal: 'right' };

  // Group B Title
  const bTitleRow = ws.addRow(['B', 'KẾT QUẢ THỰC HIỆN NHIỆM VỤ ĐƯỢC GIAO (70 ĐIỂM)']);
  bTitleRow.font = { name: 'Times New Roman', size: 14, bold: true };
  bTitleRow.height = 28;
  ws.mergeCells(`B${bTitleRow.number}:I${bTitleRow.number}`);

  const bDescRow = ws.addRow(['', 'Tập trung vào các trục kết quả trọng tâm: (1) Thực hiện mục tiêu phát triển kinh tế - xã hội và nhiệm vụ chính trị được giao; (2) Hoàn thiện thể chế, đẩy mạnh phân cấp, phân quyền gắn với kiểm tra, giám sát; (3) Thúc đẩy phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số; (4) Xây dựng Đảng và hệ thống chính trị trong sạch, vững mạnh; giữ gìn đoàn kết, thống nhất nội bộ; phòng, chống tham nhũng, lãng phí, tiêu cực; (5) Phát triển văn hóa, con người, bảo đảm an sinh xã hội, nâng cao đời sống nhân dân; (6) Củng cố quốc phòng, an ninh, giữ vững ổn định chính trị - xã hội, nâng cao hiệu quả đối ngoại và hội nhập quốc tế.', '', '', '', '', 70, Number(part2Score.toFixed(2)), '']);
  bDescRow.font = { name: 'Times New Roman', size: 14, italic: true };
  bDescRow.alignment = { vertical: 'middle', wrapText: true };
  ws.mergeCells(`B${bDescRow.number}:F${bDescRow.number}`);
  bDescRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
  bDescRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
  bDescRow.getCell(7).font = { bold: true };
  bDescRow.getCell(8).font = { bold: true };
  bDescRow.height = 85;

  // TỔNG (B) Row
  const totalBRow = ws.addRow(['', 'TỔNG (B) = Điểm KPI đã tính tại bảng tính điểm', '', '', '', '', 70, Number(part2Score.toFixed(2)), '']);
  totalBRow.font = { name: 'Times New Roman', size: 14, bold: true };
  totalBRow.height = 28;
  ws.mergeCells(`B${totalBRow.number}:F${totalBRow.number}`);
  totalBRow.getCell(7).alignment = { horizontal: 'right' };
  totalBRow.getCell(8).alignment = { horizontal: 'right' };

  // Điểm thưởng sáng tạo
  const bonusRow = ws.addRow(['', 'Điểm thưởng (nhiệm vụ sáng tạo, đổi mới, vượt mức - tối đa 7 điểm)', '', '', '', '', 7, Number(bonusScore.toFixed(2)), '']);
  bonusRow.font = { name: 'Times New Roman', size: 14, italic: true };
  bonusRow.height = 28;
  ws.mergeCells(`B${bonusRow.number}:F${bonusRow.number}`);
  bonusRow.getCell(7).alignment = { horizontal: 'right' };
  bonusRow.getCell(8).alignment = { horizontal: 'right' };

  // TỔNG (A + B + Thưởng)
  const grandTotal = Number((sumPart1 + part2Score + bonusScore).toFixed(2));
  const grandTotalRow = ws.addRow(['', 'TỔNG ĐIỂM ĐÁNH GIÁ (A + B + Thưởng) = ', '', '', '', '', 100, grandTotal, '']);
  grandTotalRow.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FFB91C1C' } };
  grandTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  grandTotalRow.height = 30;
  ws.mergeCells(`B${grandTotalRow.number}:F${grandTotalRow.number}`);
  grandTotalRow.getCell(7).alignment = { horizontal: 'right' };
  grandTotalRow.getCell(8).alignment = { horizontal: 'right' };

  // Apply table borders
  const startRowIdx = tableHeader.number;
  const endRowIdx = grandTotalRow.number;
  for (let r = startRowIdx; r <= endRowIdx; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
        right: { style: 'thin', color: { argb: 'FF94A3B8' } }
      };
    });
  }

  // II. Tự đề xuất xếp loại
  let rank = evaluation.superior_rank || evaluation.rank_proposed || 'Chưa xếp loại';
  const rProp = ws.addRow(['', `II. Tự đề xuất xếp loại mức chất lượng: ${rank}`]);
  rProp.font = { name: 'Times New Roman', size: 14, bold: true };
  rProp.height = 28;
  ws.mergeCells(`B${rProp.number}:I${rProp.number}`);

  const rPropNote1 = ws.addRow(['', '(Theo 04 mức: 1- Hoàn thành xuất sắc nhiệm vụ, 2- Hoàn thành tốt nhiệm vụ, 3- Hoàn thành nhiệm vụ và 4- Không hoàn thành nhiệm vụ)']);
  rPropNote1.font = { name: 'Times New Roman', size: 14, italic: true };
  rPropNote1.height = 26;
  ws.mergeCells(`B${rPropNote1.number}:I${rPropNote1.number}`);

  const rPropNote2 = ws.addRow(['', 'Tiêu chí đánh giá, xếp loại chất lượng thực hiện theo Hướng dẫn số 06-HD/BTCTU ngày 12/8/2026 của Ban Tổ chức Thành ủy; trong đó, trường hợp cá nhân “Hoàn thành xuất sắc nhiệm vụ” ngoài kết quả tổng điểm đạt từ 90 điểm trở lên, phải hoàn thành 100% nhiệm vụ được giao; trong đó có ít nhất 30% số nhiệm vụ hoàn thành vượt mức tiến độ hoặc chất lượng xuất sắc.']);
  rPropNote2.font = { name: 'Times New Roman', size: 14, italic: true };
  rPropNote2.alignment = { wrapText: true };
  ws.mergeCells(`B${rPropNote2.number}:I${rPropNote2.number}`);
  rPropNote2.height = 55;

  // Cá nhân tự đánh giá signature
  ws.addRow([]);
  const sigHead = ws.addRow(['', '', '', '', '', 'CÁ NHÂN TỰ ĐÁNH GIÁ']);
  sigHead.font = { name: 'Times New Roman', size: 14, bold: true };
  sigHead.getCell(6).alignment = { horizontal: 'center' };
  ws.mergeCells(`F${sigHead.number}:I${sigHead.number}`);

  const sigSub = ws.addRow(['', '', '', '', '', '(Ký, ghi rõ họ tên)']);
  sigSub.font = { name: 'Times New Roman', size: 14, italic: true };
  sigSub.getCell(6).alignment = { horizontal: 'center' };
  ws.mergeCells(`F${sigSub.number}:I${sigSub.number}`);

  ws.addRow([]);
  ws.addRow([]);

  const sigName = ws.addRow(['', '', '', '', '', user.full_name]);
  sigName.font = { name: 'Times New Roman', size: 14, bold: true };
  sigName.getCell(6).alignment = { horizontal: 'center' };
  ws.mergeCells(`F${sigName.number}:I${sigName.number}`);

  const sigRole = ws.addRow(['', '', '', '', '', user.gov_title || user.party_title || 'Cán bộ']);
  sigRole.font = { name: 'Times New Roman', size: 14, italic: true };
  sigRole.getCell(6).alignment = { horizontal: 'center' };
  ws.mergeCells(`F${sigRole.number}:I${sigRole.number}`);

  // III. Nhận xét, đánh giá của cấp có thẩm quyền
  ws.addRow([]);
  const rSup1 = ws.addRow(['', 'III. Nhận xét, đánh giá của cấp có thẩm quyền']);
  rSup1.font = { name: 'Times New Roman', size: 14, bold: true };
  rSup1.height = 28;
  ws.mergeCells(`B${rSup1.number}:I${rSup1.number}`);

  const rSup2 = ws.addRow(['', `- Chấm điểm: ${grandTotal} điểm`]);
  rSup2.font = { name: 'Times New Roman', size: 14 };
  rSup2.height = 26;
  ws.mergeCells(`B${rSup2.number}:I${rSup2.number}`);

  const rSup3 = ws.addRow(['', `- Đề xuất xếp loại: ${rank}`]);
  rSup3.font = { name: 'Times New Roman', size: 14 };
  rSup3.height = 26;
  ws.mergeCells(`B${rSup3.number}:I${rSup3.number}`);

  if (evaluation.superior_comment) {
    const rSup4 = ws.addRow(['', `- Ý kiến nhận xét: ${evaluation.superior_comment}`]);
    rSup4.font = { name: 'Times New Roman', size: 14, italic: true };
    rSup4.height = 28;
    ws.mergeCells(`B${rSup4.number}:I${rSup4.number}`);
  }

  // Xác nhận Ban Thường vụ / Tập thể Lãnh đạo
  ws.addRow([]);
  const confHead = ws.addRow(['', '', '', 'XÁC NHẬN CỦA BAN THƯỜNG VỤ CẤP ỦY\nHOẶC THỦ TRƯỞNG CƠ QUAN, ĐƠN VỊ']);
  confHead.font = { name: 'Times New Roman', size: 14, bold: true };
  confHead.alignment = { horizontal: 'center', wrapText: true };
  ws.mergeCells(`D${confHead.number}:I${confHead.number}`);

  const confSub = ws.addRow(['', '', '', '(Xác lập thời điểm, ký, ghi rõ họ tên và đóng dấu)']);
  confSub.font = { name: 'Times New Roman', size: 14, italic: true };
  confSub.alignment = { horizontal: 'center' };
  ws.mergeCells(`D${confSub.number}:I${confSub.number}`);

  const isUnitLeader = Boolean(
    (leaderName && user.full_name?.trim().toLowerCase() === leaderName.trim().toLowerCase()) ||
    (user.management_role === 'lanh_dao' && (!user.manager_id || user.role === 'admin')) ||
    (/\b(trưởng ban|giám đốc|hiệu trưởng|bí thư)\b/i.test(user.gov_title || '') && !/\bphó\b/i.test(user.gov_title || ''))
  );

  ws.addRow([]);
  ws.addRow([]);

  const confName = ws.addRow(['', '', '', isUnitLeader ? '' : leaderName]);
  confName.font = { name: 'Times New Roman', size: 14, bold: true };
  confName.alignment = { horizontal: 'center' };
  ws.mergeCells(`D${confName.number}:I${confName.number}`);

  const confTitle = ws.addRow(['', '', '', leaderTitle]);
  confTitle.font = { name: 'Times New Roman', size: 14, bold: true };
  confTitle.alignment = { horizontal: 'center' };
  ws.mergeCells(`D${confTitle.number}:I${confTitle.number}`);

  // -----------------------------------------------------------------------------------
  // Sheet 2: BÁO CÁO KẾT QUẢ THỰC HIỆN CÔNG VIỆC (BẢNG 1 - PHỤ LỤC 5 HD.06)
  // -----------------------------------------------------------------------------------
  const allUserTasks = db.prepare(`
    SELECT t.*, assigner.full_name as assigner_name
    FROM assigned_tasks t
    LEFT JOIN users assigner ON t.assigned_by = assigner.id
    WHERE t.period_id = ? AND t.user_id = ?
    ORDER BY t.axis_code ASC, t.deadline ASC
  `).all(periodId, userId);

  const wsTasks = workbook.addWorksheet('BÁO CÁO CÔNG VIỆC', {
    views: [{ showGridLines: true }]
  });

  // Setup column widths
  wsTasks.columns = [
    { width: 7 },  // STT
    { width: 22 }, // Nguồn việc
    { width: 26 }, // Người giao
    { width: 18 }, // Trục
    { width: 45 }, // Tên công việc
    { width: 30 }, // Kết quả đầu ra
    { width: 16 }, // Thời hạn
    { width: 16 }, // Ngày HT
    { width: 15 }, // Tiến độ %
    { width: 32 }, // Minh chứng
    { width: 14 }, // Điểm chuẩn
    { width: 14 }, // Hệ số ĐK
    { width: 16 }, // Điểm quy đổi
    { width: 18 }, // Điểm thưởng
    { width: 18 }, // Trạng thái
    { width: 30 }  // Ý kiến CBQL
  ];

  // Title block
  const t1 = wsTasks.addRow(['BÁO CÁO KẾT QUẢ THỰC HIỆN CÔNG VIỆC (BẢNG TÍNH ĐIỂM KPI CHI TIẾT)']);
  t1.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FF990000' } };
  t1.alignment = { horizontal: 'center' };
  wsTasks.mergeCells(`A1:P1`);

  const t2 = wsTasks.addRow([`(Theo Phụ lục 5 - Hướng dẫn 06-HD/BTCTU Ban Tổ chức Thành ủy)`]);
  t2.font = { name: 'Times New Roman', size: 14, italic: true };
  t2.alignment = { horizontal: 'center' };
  wsTasks.mergeCells(`A2:P2`);

  wsTasks.addRow([]);

  const rInfo1 = wsTasks.addRow([`Họ và tên cán bộ: ${user.full_name} (Ngày sinh: ${birthStr})`, '', '', '', '', `Chức vụ: ${user.gov_title || user.party_title || 'Cán bộ'}`, '', '', '', '', `Đơn vị: ${unitName}`]);
  rInfo1.font = { name: 'Times New Roman', size: 14, bold: true };
  wsTasks.mergeCells(`A4:E4`);
  wsTasks.mergeCells(`F4:J4`);
  wsTasks.mergeCells(`K4:P4`);

  const assignedCount = allUserTasks.filter(t => t.origin === 'assigned').length;
  const registeredCount = allUserTasks.filter(t => t.origin === 'registered').length;
  const rInfo2 = wsTasks.addRow([`Kỳ đánh giá: ${period.name}`, '', '', '', '', `Tổng số công việc: ${allUserTasks.length} (Lãnh đạo giao: ${assignedCount}, Tự đăng ký: ${registeredCount})`]);
  rInfo2.font = { name: 'Times New Roman', size: 14, italic: true };
  wsTasks.mergeCells(`A5:E5`);
  wsTasks.mergeCells(`F5:P5`);

  wsTasks.addRow([]);

  // Table header
  const taskHeader = wsTasks.addRow([
    'STT', 'Nguồn việc', 'Người giao việc', 'Trục kết quả',
    'Nội dung công việc', 'Sản phẩm đầu ra', 'Thời hạn',
    'Ngày hoàn thành', 'Tiến độ %', 'Minh chứng thực hiện',
    'Điểm chuẩn', 'Hệ số ĐK', 'Điểm quy đổi', 'Điểm thưởng (5%)', 'Trạng thái', 'Ý kiến CBQL'
  ]);
  taskHeader.font = { name: 'Times New Roman', size: 14, bold: true };
  taskHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  taskHeader.height = 42;

  for (let c = 1; c <= 16; c++) {
    const cell = taskHeader.getCell(c);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    };
  }

  let totalStdScore = 0;
  let totalConvScore = 0;
  let totalBonusScore = 0;

  allUserTasks.forEach((t, idx) => {
    totalStdScore += (t.standard_score || 0);
    totalConvScore += (t.converted_score || 0);
    const bSc = t.is_bonus_approved ? (t.bonus_score || ((t.converted_score || 0) * 0.05)) : 0;
    totalBonusScore += bSc;

    const originText = t.origin === 'assigned' ? 'Lãnh đạo giao' : 'Tự đăng ký';
    const assignerText = t.origin === 'assigned' ? (t.assigner_name || 'Lãnh đạo') : 'Cá nhân';
    const statusText = t.status === 'approved' ? 'Đã duyệt' :
                       t.status === 'submitted' ? 'Đã nộp MC' :
                       t.status === 'pending_approval' ? 'Chờ duyệt việc' :
                       t.status === 'rejected' ? 'Bị từ chối' : 'Đang làm';

    const evidenceText = [t.evidence_text, t.evidence_file_name].filter(Boolean).join(' | ');

    const row = wsTasks.addRow([
      idx + 1,
      originText,
      assignerText,
      t.axis_code,
      t.task_name,
      t.output_result,
      formatDateVN(t.deadline),
      formatDateVN(t.actual_finish_date),
      t.progress_pct !== null && t.progress_pct !== undefined ? `${Math.round(t.progress_pct * 100)}%` : '',
      evidenceText,
      t.standard_score || 10,
      t.difficulty_weight || 1.0,
      t.converted_score !== null && t.converted_score !== undefined ? Number(Number(t.converted_score).toFixed(2)) : 0,
      bSc > 0 ? Number(bSc.toFixed(2)) : '',
      statusText,
      t.cbql_comment || ''
    ]);

    row.font = { name: 'Times New Roman', size: 14 };
    row.alignment = { vertical: 'middle', wrapText: true };
    row.height = 32;

    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(15).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = 1; c <= 16; c++) {
      row.getCell(c).border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    }
  });

  // Summary row
  if (allUserTasks.length > 0) {
    const sumRow = wsTasks.addRow([
      '', 'TỔNG CỘNG', '', '', '', '', '', '', '', '',
      totalStdScore, '', Number(totalConvScore.toFixed(2)), Number(totalBonusScore.toFixed(2)), '', ''
    ]);
    sumRow.font = { name: 'Times New Roman', size: 14, bold: true };
    sumRow.alignment = { vertical: 'middle' };
    sumRow.height = 32;
    sumRow.getCell(2).alignment = { horizontal: 'center' };
    sumRow.getCell(11).alignment = { horizontal: 'right' };
    sumRow.getCell(13).alignment = { horizontal: 'right' };
    sumRow.getCell(14).alignment = { horizontal: 'right' };
    wsTasks.mergeCells(`B${sumRow.number}:J${sumRow.number}`);
    for (let c = 1; c <= 16; c++) {
      sumRow.getCell(c).border = {
        top: { style: 'thin' },
        bottom: { style: 'double' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
      sumRow.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' }
      };
    }
  }

  // Signatures for Sheet 2: BÁO CÁO CÔNG VIỆC
  wsTasks.addRow([]);
  const s2Date = wsTasks.addRow(['', '', '', '', '', '', '', '', '', '', '', '', '', '', formatAdministrativeDate(locationName)]);
  s2Date.font = { name: 'Times New Roman', size: 14, italic: true };
  wsTasks.mergeCells(`O${s2Date.number}:P${s2Date.number}`);
  s2Date.getCell(15).alignment = { horizontal: 'center' };

  const s2SigHead = wsTasks.addRow([
    '', 'NGƯỜI LẬP BIỂU', '', '', '', '', '', '', '', '', '', '',
    'THỦ TRƯỞNG CƠ QUAN, ĐƠN VỊ'
  ]);
  s2SigHead.font = { name: 'Times New Roman', size: 14, bold: true };
  wsTasks.mergeCells(`B${s2SigHead.number}:E${s2SigHead.number}`);
  wsTasks.mergeCells(`M${s2SigHead.number}:P${s2SigHead.number}`);
  s2SigHead.getCell(2).alignment = { horizontal: 'center' };
  s2SigHead.getCell(13).alignment = { horizontal: 'center' };

  const s2SigSub = wsTasks.addRow([
    '', '(Ký, ghi rõ họ tên)', '', '', '', '', '', '', '', '', '', '',
    '(Ký, ghi rõ họ tên và đóng dấu)'
  ]);
  s2SigSub.font = { name: 'Times New Roman', size: 14, italic: true };
  wsTasks.mergeCells(`B${s2SigSub.number}:E${s2SigSub.number}`);
  wsTasks.mergeCells(`M${s2SigSub.number}:P${s2SigSub.number}`);
  s2SigSub.getCell(2).alignment = { horizontal: 'center' };
  s2SigSub.getCell(13).alignment = { horizontal: 'center' };

  wsTasks.addRow([]);
  wsTasks.addRow([]);

  const s2SigNames = wsTasks.addRow([
    '', user.full_name, '', '', '', '', '', '', '', '', '', '',
    isUnitLeader ? '' : leaderName
  ]);
  s2SigNames.font = { name: 'Times New Roman', size: 14, bold: true };
  wsTasks.mergeCells(`B${s2SigNames.number}:E${s2SigNames.number}`);
  wsTasks.mergeCells(`M${s2SigNames.number}:P${s2SigNames.number}`);
  s2SigNames.getCell(2).alignment = { horizontal: 'center' };
  s2SigNames.getCell(13).alignment = { horizontal: 'center' };

  const s2SigTitles = wsTasks.addRow([
    '', user.gov_title || user.party_title || 'Cán bộ', '', '', '', '', '', '', '', '', '', '',
    leaderTitle
  ]);
  s2SigTitles.font = { name: 'Times New Roman', size: 14, italic: true };
  wsTasks.mergeCells(`B${s2SigTitles.number}:E${s2SigTitles.number}`);
  wsTasks.mergeCells(`M${s2SigTitles.number}:P${s2SigTitles.number}`);
  s2SigTitles.getCell(2).alignment = { horizontal: 'center' };
  s2SigTitles.getCell(13).alignment = { horizontal: 'center' };

  return workbook;
}

// Export strictly according to MẪU 02 (Bảng tổng hợp kết quả đánh giá, xếp loại toàn cơ quan)
async function exportMau02Workbook(periodId) {
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(periodId) || { name: 'Quý III/2026', id: periodId };

  const sysConfigs = getSystemConfigs();
  const topDept = db.prepare('SELECT parent_agency, location_name, name FROM departments WHERE is_active = 1 ORDER BY parent_id IS NULL DESC, code ASC LIMIT 1').get();
  const parentAgency = topDept?.parent_agency || sysConfigs.PARENT_AGENCY_NAME || 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH';
  const unitName = topDept?.name ? topDept.name.toUpperCase() : (sysConfigs.UNIT_NAME || 'BAN TỔ CHỨC THÀNH ỦY TP. HỒ CHÍ MINH');
  const locationName = topDept?.location_name || sysConfigs.LOCATION_NAME || 'TP. Hồ Chí Minh';
  const leaderName = sysConfigs.LEADER_SIGNER_NAME || 'Thái Thị Bích Liên';
  const leaderTitle = sysConfigs.LEADER_SIGNER_TITLE || 'PHÓ TRƯỞNG BAN THƯỜNG TRỰC';

  const rows = db.prepare(`
    SELECT u.id as user_id, u.full_name, u.role, u.target_role, u.party_title, u.gov_title, u.union_title, d.name as dept_name,
           e.id as evaluation_id, e.step, e.part1_score, e.part2_score, e.bonus_score, e.total_score,
           e.rank_proposed, e.superior_rank, e.summary_reason, e.cadre_proposal_note, e.superior_comment
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN evaluations e ON e.user_id = u.id AND e.period_id = ?
    WHERE u.is_active = 1 
      AND u.role NOT IN ('admin', 'admin_donvi')
      AND COALESCE(u.target_role, '') NOT IN ('admin', 'admin_donvi', 'none', 'exempt')
      AND COALESCE(u.role_id, '') NOT IN ('role-admin', 'role-admin-donvi')
    ORDER BY u.role DESC, u.full_name ASC
  `).all(periodId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${unitName} - Hệ thống quản lý công việc và chấm điểm hiệu suất`;
  workbook.created = new Date();

  const ws = workbook.addWorksheet('MẪU 02 - TỔNG HỢP XẾP LOẠI', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views: [{ showGridLines: true }]
  });

  ws.columns = [
    { width: 6 },  // STT
    { width: 25 }, // Họ và tên
    { width: 22 }, // Chức vụ
    { width: 22 }, // Đơn vị
    { width: 12 }, // Phần A (30đ)
    { width: 12 }, // Phần B (70đ)
    { width: 12 }, // Điểm thưởng
    { width: 13 }, // Tổng điểm (100đ)
    { width: 24 }, // Cá nhân tự đề xuất
    { width: 24 }, // Tập thể Lãnh đạo đề xuất
    { width: 32 }, // Tóm tắt căn cứ, lý do
    { width: 26 }, // Đề xuất công tác cán bộ
    { width: 16 }  // Ghi chú
  ];

  // Top header
  const rTop = ws.addRow(['', '', '', '', '', '', '', '', '', '', '', 'Mẫu 02', '']);
  rTop.getCell(12).font = { name: 'Times New Roman', size: 14, bold: true };
  rTop.getCell(12).alignment = { horizontal: 'right' };

  const rHead1 = ws.addRow([`${parentAgency}\n${unitName}`, '', '', '', '', '', '', 'ĐẢNG CỘNG SẢN VIỆT NAM']);
  rHead1.font = { name: 'Times New Roman', size: 14, bold: true };
  ws.mergeCells(`A2:D2`);
  ws.mergeCells(`H2:M2`);
  rHead1.getCell(1).alignment = { horizontal: 'center', wrapText: true };
  rHead1.getCell(8).alignment = { horizontal: 'center' };

  const rHead2 = ws.addRow(['***', '', '', '', '', '', '', formatAdministrativeDate(locationName)]);
  rHead2.font = { name: 'Times New Roman', size: 14, italic: true };
  ws.mergeCells(`A3:D3`);
  ws.mergeCells(`H3:M3`);
  rHead2.getCell(1).alignment = { horizontal: 'center' };
  rHead2.getCell(8).alignment = { horizontal: 'center' };

  ws.addRow([]);

  // Title
  const titleRow = ws.addRow(['BẢNG TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ, XẾP LOẠI VÀ ĐỀ XUẤT CÔNG TÁC CÁN BỘ']);
  titleRow.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FF990000' } };
  titleRow.alignment = { horizontal: 'center' };
  ws.mergeCells(`A5:M5`);

  const subRow = ws.addRow([`Kỳ đánh giá: ${period.name || 'Quý III, Năm 2026'}`]);
  subRow.font = { name: 'Times New Roman', size: 14, italic: true };
  subRow.alignment = { horizontal: 'center' };
  ws.mergeCells(`A6:M6`);

  ws.addRow([]);

  // Table header row 1 & 2
  const th1 = ws.addRow([
    'STT', 'Họ và tên', 'Chức vụ', 'Đơn vị công tác',
    'Điểm đánh giá chi tiết', '', '', '',
    'Kết quả xếp loại', '',
    'Tóm tắt căn cứ, lý do đề xuất xếp loại',
    'Đề xuất về công tác cán bộ', 'Ghi chú'
  ]);
  th1.font = { name: 'Times New Roman', size: 14, bold: true };
  th1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  th1.height = 36;

  const th2 = ws.addRow([
    '', '', '', '',
    'Phần A\n(30đ)', 'Phần B\n(70đ)', 'Thưởng\n(TĐ 7đ)', 'Tổng điểm\n(100đ)',
    'Cá nhân tự đề xuất', 'Lãnh đạo đề xuất',
    '', '', ''
  ]);
  th2.font = { name: 'Times New Roman', size: 14, bold: true };
  th2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  th2.height = 36;

  ws.mergeCells(`A${th1.number}:A${th2.number}`);
  ws.mergeCells(`B${th1.number}:B${th2.number}`);
  ws.mergeCells(`C${th1.number}:C${th2.number}`);
  ws.mergeCells(`D${th1.number}:D${th2.number}`);
  ws.mergeCells(`E${th1.number}:H${th1.number}`);
  ws.mergeCells(`I${th1.number}:J${th1.number}`);
  ws.mergeCells(`K${th1.number}:K${th2.number}`);
  ws.mergeCells(`L${th1.number}:L${th2.number}`);
  ws.mergeCells(`M${th1.number}:M${th2.number}`);

  for (let c = 1; c <= 13; c++) {
    const c1 = th1.getCell(c);
    const c2 = th2.getCell(c);
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    c1.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    c2.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  }

  // Data rows
  let countExcellent = 0;
  let countGood = 0;
  let countComplete = 0;
  let countFail = 0;

  rows.forEach((r, idx) => {
    const p1 = r.part1_score !== null && r.part1_score !== undefined ? Number(r.part1_score) : 30;
    const p2 = r.part2_score !== null && r.part2_score !== undefined ? Number(r.part2_score) : 0;
    const bonus = r.bonus_score !== null && r.bonus_score !== undefined ? Number(r.bonus_score) : 0;
    const total = r.total_score !== null && r.total_score !== undefined ? Number(r.total_score) : (p1 + p2 + bonus);

    const selfRank = r.rank_proposed || 'Chưa tự đánh giá';
    const finalRank = r.superior_rank || selfRank;

    if (finalRank.includes('xuất sắc')) countExcellent++;
    else if (finalRank.includes('tốt')) countGood++;
    else if (finalRank.includes('Không') || finalRank.includes('không')) countFail++;
    else countComplete++;

    const row = ws.addRow([
      idx + 1,
      r.full_name,
      r.gov_title || r.party_title || 'Cán bộ',
      r.dept_name || '',
      p1,
      p2,
      bonus > 0 ? bonus : '',
      total,
      selfRank,
      finalRank,
      r.summary_reason || '',
      r.cadre_proposal_note || '',
      ''
    ]);

    row.font = { name: 'Times New Roman', size: 14 };
    row.height = 30;
    row.alignment = { vertical: 'middle', wrapText: true };

    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(8).font = { name: 'Times New Roman', size: 14, bold: true };
    row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(10).font = { name: 'Times New Roman', size: 14, bold: true };

    for (let c = 1; c <= 13; c++) {
      row.getCell(c).border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    }
  });

  // Summary statistics box
  ws.addRow([]);
  const sHead = ws.addRow(['THỐNG KÊ KẾT QUẢ ĐÁNH GIÁ, XẾP LOẠI TOÀN CƠ QUAN:']);
  sHead.font = { name: 'Times New Roman', size: 14, bold: true };
  ws.mergeCells(`A${sHead.number}:G${sHead.number}`);

  const totalPersonnel = rows.length;
  const excPct = totalPersonnel > 0 ? ((countExcellent / totalPersonnel) * 100).toFixed(1) : 0;
  const goodPct = totalPersonnel > 0 ? ((countGood / totalPersonnel) * 100).toFixed(1) : 0;
  const compPct = totalPersonnel > 0 ? ((countComplete / totalPersonnel) * 100).toFixed(1) : 0;
  const failPct = totalPersonnel > 0 ? ((countFail / totalPersonnel) * 100).toFixed(1) : 0;

  const s1 = ws.addRow([`- Tổng số cán bộ, công chức, viên chức: ${totalPersonnel} người (100%)`]);
  s1.font = { name: 'Times New Roman', size: 14 };
  ws.mergeCells(`A${s1.number}:G${s1.number}`);

  const s2 = ws.addRow([`- Hoàn thành xuất sắc nhiệm vụ: ${countExcellent} người (${excPct}% - Quy định HD.06 tối đa không quá 20%): ${Number(excPct) <= 20 ? 'ĐẠT QUY ĐỊNH' : 'VƯỢT CHỈ TIÊU CHO PHÉP'}`]);
  s2.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: Number(excPct) <= 20 ? 'FF15803D' : 'FFB91C1C' } };
  ws.mergeCells(`A${s2.number}:G${s2.number}`);

  const s3 = ws.addRow([`- Hoàn thành tốt nhiệm vụ: ${countGood} người (${goodPct}%)`]);
  s3.font = { name: 'Times New Roman', size: 14 };
  ws.mergeCells(`A${s3.number}:G${s3.number}`);

  const s4 = ws.addRow([`- Hoàn thành nhiệm vụ: ${countComplete} người (${compPct}%)`]);
  s4.font = { name: 'Times New Roman', size: 14 };
  ws.mergeCells(`A${s4.number}:G${s4.number}`);

  const s5 = ws.addRow([`- Không hoàn thành nhiệm vụ: ${countFail} người (${failPct}%)`]);
  s5.font = { name: 'Times New Roman', size: 14 };
  ws.mergeCells(`A${s5.number}:G${s5.number}`);

  // Signatures for Mẫu 02
  ws.addRow([]);
  const m2Date = ws.addRow(['', '', '', '', '', '', '', '', '', '', formatAdministrativeDate(locationName)]);
  m2Date.font = { name: 'Times New Roman', size: 14, italic: true };
  ws.mergeCells(`K${m2Date.number}:M${m2Date.number}`);
  m2Date.getCell(11).alignment = { horizontal: 'center' };

  const sigRow1 = ws.addRow([
    '', 'NGƯỜI LẬP BIỂU', '', '', '', '',
    'LÃNH ĐẠO PHÒNG TỔ CHỨC CÁN BỘ', '', '',
    'THỦ TRƯỞNG CƠ QUAN, ĐƠN VỊ'
  ]);
  sigRow1.font = { name: 'Times New Roman', size: 14, bold: true };
  ws.mergeCells(`B${sigRow1.number}:D${sigRow1.number}`);
  ws.mergeCells(`G${sigRow1.number}:I${sigRow1.number}`);
  ws.mergeCells(`K${sigRow1.number}:M${sigRow1.number}`);
  sigRow1.getCell(2).alignment = { horizontal: 'center' };
  sigRow1.getCell(7).alignment = { horizontal: 'center' };
  sigRow1.getCell(11).alignment = { horizontal: 'center' };

  const sigRow2 = ws.addRow([
    '', '(Ký, ghi rõ họ tên)', '', '', '', '',
    '(Ký, ghi rõ họ tên)', '', '',
    '(Ký, ghi rõ họ tên và đóng dấu)'
  ]);
  sigRow2.font = { name: 'Times New Roman', size: 14, italic: true };
  ws.mergeCells(`B${sigRow2.number}:D${sigRow2.number}`);
  ws.mergeCells(`G${sigRow2.number}:I${sigRow2.number}`);
  ws.mergeCells(`K${sigRow2.number}:M${sigRow2.number}`);
  sigRow2.getCell(2).alignment = { horizontal: 'center' };
  sigRow2.getCell(7).alignment = { horizontal: 'center' };
  sigRow2.getCell(11).alignment = { horizontal: 'center' };

  ws.addRow([]);
  ws.addRow([]);

  const sigRow3 = ws.addRow([
    '', 'Cán bộ tổng hợp', '', '', '', '',
    'Trưởng phòng', '', '',
    leaderName
  ]);
  sigRow3.font = { name: 'Times New Roman', size: 14, bold: true };
  ws.mergeCells(`B${sigRow3.number}:D${sigRow3.number}`);
  ws.mergeCells(`G${sigRow3.number}:I${sigRow3.number}`);
  ws.mergeCells(`K${sigRow3.number}:M${sigRow3.number}`);
  sigRow3.getCell(2).alignment = { horizontal: 'center' };
  sigRow3.getCell(7).alignment = { horizontal: 'center' };
  sigRow3.getCell(11).alignment = { horizontal: 'center' };

  const sigRow4 = ws.addRow([
    '', '', '', '', '', '',
    '', '', '',
    leaderTitle
  ]);
  sigRow4.font = { name: 'Times New Roman', size: 14, italic: true };
  ws.mergeCells(`K${sigRow4.number}:M${sigRow4.number}`);
  sigRow4.getCell(11).alignment = { horizontal: 'center' };

  return workbook;
}

/**
 * Xuất Danh bạ liên hệ toàn hệ thống ra Excel
 */
async function exportDirectoryWorkbook(users, options = {}) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Danh bạ liên hệ', {
    pageSetup: { paperSize: 9, orientation: 'landscape' }
  });

  const title = options.title || 'DANH BẠ LIÊN HỆ NỘI BỘ';
  const subtitle = options.subtitle || `Thời điểm xuất: ${new Date().toLocaleDateString('vi-VN')}`;

  // Title
  const titleRow = ws.addRow([title]);
  titleRow.font = { name: 'Times New Roman', size: 16, bold: true, color: { argb: 'FF990000' } };
  titleRow.alignment = { horizontal: 'center' };
  ws.mergeCells('A1:J1');

  const subRow = ws.addRow([subtitle]);
  subRow.font = { name: 'Times New Roman', size: 12, italic: true };
  subRow.alignment = { horizontal: 'center' };
  ws.mergeCells('A2:J2');

  ws.addRow([]);

  // Headers
  const headers = [
    'STT',
    'Họ và tên',
    'Tên đăng nhập',
    'Đơn vị / Phòng ban',
    'Chức vụ Đảng',
    'Chức danh chính quyền',
    'Số điện thoại',
    'Email',
    'Cán bộ quản lý',
    'Phân loại'
  ];

  const hRow = ws.addRow(headers);
  hRow.font = { name: 'Times New Roman', size: 12, bold: true };
  hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  hRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E7FF' }
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Data rows
  users.forEach((u, idx) => {
    let classification = 'Toàn hệ thống';
    if (u.is_self) classification = 'Bản thân';
    else if (u.is_direct_subordinate) classification = 'Cán bộ trực thuộc';
    else if (u.is_in_my_dept) classification = 'Cùng đơn vị';

    const row = ws.addRow([
      idx + 1,
      u.full_name || '',
      u.username || '',
      u.dept_name || '',
      u.party_title || '',
      u.gov_title || '',
      u.phone || '',
      u.email || '',
      u.manager_name || '',
      classification
    ]);

    row.font = { name: 'Times New Roman', size: 12 };
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(10).alignment = { horizontal: 'center' };

    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // Adjust column widths
  ws.columns = [
    { width: 6 },   // STT
    { width: 26 },  // Họ tên
    { width: 16 },  // Username
    { width: 28 },  // Đơn vị
    { width: 20 },  // Chức vụ Đảng
    { width: 24 },  // Chức danh CQ
    { width: 16 },  // SĐT
    { width: 26 },  // Email
    { width: 24 },  // Quản lý
    { width: 20 }   // Phân loại
  ];

  return workbook;
}

module.exports = {
  importStandardTasksFromExcel,
  generateUserImportTemplate,
  importUsersFromExcel,
  exportCBQLWorkbook,
  exportMau02Workbook,
  exportDirectoryWorkbook
};

