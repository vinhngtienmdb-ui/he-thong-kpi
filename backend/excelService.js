const ExcelJS = require('exceljs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('./database');
const { compareUsersByPositionAndName } = require('./userSorting');

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
    let consecutiveEmptyRows = 0;
    const maxRow = Math.min(sheet.rowCount || 0, 5000);

    for (let r = headerRowIndex + 1; r <= maxRow; r++) {
      const row = sheet.getRow(r);
      // Get task name
      const taskNameCell = mapping.task_name ? row.getCell(mapping.task_name) : null;
      const taskName = extractCellText(taskNameCell).trim();
      if (!taskName) {
        consecutiveEmptyRows++;
        if (consecutiveEmptyRows >= 25) break; // Dừng sớm khi hết dữ liệu, tránh quét hàng ngàn ô trống được format
        continue;
      }
      consecutiveEmptyRows = 0;

      // Skip numeric sub-header rows (e.g. Row 3: 1, 2, 3...) or repeated headers
      if (/^\d+$/.test(taskName)) continue;
      const taskNameNorm = normalizeStr(taskName);
      if (taskNameNorm.includes('ten cong viec') || taskNameNorm.includes('ten nhiem vu') || taskNameNorm.includes('noi dung cong viec')) continue;

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
          if (tasks.length < 100) tasks.push({ id: existing.id, taskName, standardScore, difficultyWeight, axisCode, isUpdated: true });
        } else {
          skippedCount++;
          if (tasks.length < 100) tasks.push({ id: existing.id, taskName, standardScore, difficultyWeight, axisCode, isSkipped: true });
        }
      } else {
        const id = uuidv4();
        insertTask.run(
          id, rowPeriodId, deptCode, taskName, outputResult, deadline,
          taskType, standardScore, difficultyWeight, maxConvertedScore,
          expectedEvidence, note, axisCode, status
        );
        insertedCount++;
        if (tasks.length < 100) tasks.push({ id, taskName, standardScore, difficultyWeight, axisCode, isInserted: true });
      }
    }
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

// Direct import standard tasks from structured data (e.g. from pasted spreadsheet rows)
async function importStandardTasksFromData(rawTasks = [], targetPeriodId = null, options = {}) {
  const updateExisting = options.updateExisting !== undefined ? Boolean(options.updateExisting) : true;
  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    return { importedCount: 0, insertedCount: 0, updatedCount: 0, skippedCount: 0, tasks: [] };
  }

  const allPeriods = db.prepare('SELECT id, code, name FROM periods').all();
  const periodLookup = new Map();
  allPeriods.forEach(p => {
    periodLookup.set(p.id.toLowerCase(), p.id);
    if (p.code) periodLookup.set(p.code.toLowerCase().trim(), p.id);
    if (p.name) periodLookup.set(normalizeStr(p.name), p.id);
  });

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

  const tasks = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const runImport = db.transaction(() => {
    for (const item of rawTasks) {
      const taskName = String(item.task_name || item['Tên công việc'] || item.taskName || '').trim();
      if (!taskName || /^\d+$/.test(taskName)) continue;
      const taskNameNorm = normalizeStr(taskName);
      if (taskNameNorm.includes('ten cong viec') || taskNameNorm.includes('ten nhiem vu')) continue;

      let rowPeriodId = periodId;
      const rawPeriod = item.period || item['Kỳ đánh giá'] || item.period_id;
      if (rawPeriod) {
        const matched = periodLookup.get(String(rawPeriod).toLowerCase().trim()) || periodLookup.get(normalizeStr(String(rawPeriod)));
        if (matched) rowPeriodId = matched;
      }

      let deptCode = '';
      const rawDept = item.dept_code || item['Mã đơn vị'] || item.department || '';
      if (rawDept) {
        deptCode = deptLookup.get(String(rawDept).toLowerCase().trim()) || deptLookup.get(normalizeStr(String(rawDept))) || String(rawDept).trim();
      }
      if (!deptCode && allDepts.length > 0) {
        deptCode = allDepts[0].code || 'A29.123.22';
      }

      const outputResult = normalizeOutputResult(item.output_result || item['Kết quả đầu ra'] || '');
      const deadline = formatDate(item.deadline || item['Thời hạn hoàn thành']) || '2026-09-30';
      const taskType = normalizeTaskType(item.task_type || item['Loại công việc'] || '');
      let standardScore = parseFloat(item.standard_score || item['Điểm chuẩn']) || (taskType === 'Đột xuất' ? 12 : 10);
      if (standardScore <= 0) standardScore = (taskType === 'Đột xuất' ? 12 : 10);

      let difficultyWeight = parseFloat(item.difficulty_weight || item['Hệ số độ khó']) || 1.0;
      if (difficultyWeight > 10 && difficultyWeight <= 200) difficultyWeight /= 100;
      if (difficultyWeight <= 0) difficultyWeight = 1.0;

      let maxConvertedScore = parseFloat(item.max_converted_score || item['Điểm quy đổi tối đa']) || 0;
      if (maxConvertedScore <= 0) {
        maxConvertedScore = Math.round(standardScore * difficultyWeight * 100) / 100;
      }

      const expectedEvidence = String(item.expected_evidence || item['Minh chứng'] || '').trim();
      const note = String(item.note || item['Ghi chú'] || '').trim();
      const axisCode = parseAxisCode(item.axis_code || item['Trục kết quả trọng tâm'] || item.axis || 'TRUC_1');
      const status = item.status || item['Trạng thái'] || 'Hoạt động';

      const existing = checkExisting.get(rowPeriodId, taskName.toLowerCase(), deadline, deadline);
      if (existing) {
        if (updateExisting) {
          updateTask.run(
            deptCode, outputResult, deadline, taskType, standardScore,
            difficultyWeight, maxConvertedScore, expectedEvidence, note,
            axisCode, status, existing.id
          );
          updatedCount++;
          if (tasks.length < 100) tasks.push({ id: existing.id, taskName, standardScore, difficultyWeight, axisCode, isUpdated: true });
        } else {
          skippedCount++;
          if (tasks.length < 100) tasks.push({ id: existing.id, taskName, standardScore, difficultyWeight, axisCode, isSkipped: true });
        }
      } else {
        const id = uuidv4();
        insertTask.run(
          id, rowPeriodId, deptCode, taskName, outputResult, deadline,
          taskType, standardScore, difficultyWeight, maxConvertedScore,
          expectedEvidence, note, axisCode, status
        );
        insertedCount++;
        if (tasks.length < 100) tasks.push({ id, taskName, standardScore, difficultyWeight, axisCode, isInserted: true });
      }
    }
  });

  runImport();

  return {
    importedCount: insertedCount + updatedCount,
    insertedCount,
    updatedCount,
    skippedCount,
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
  const nameLookup = new Map(); // fullName -> id
  existingUsers.forEach(u => {
    userLookup.set(u.username.toLowerCase(), u.id);
    if (u.full_name) nameLookup.set(u.full_name.trim().toLowerCase(), u.id);
  });

  const updateExisting = options.updateExisting !== false; // default true
  let totalRows = 0;
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const errors = [];
  const pendingManagers = []; // { userId, managerInput, rowNumber }

  // Detect header row and column mapping
  let headerRowIndex = -1;
  const colMap = {};

  sheet.eachRow((row, rowNumber) => {
    if (headerRowIndex !== -1 || rowNumber > 10) return;
    const cells = [];
    row.eachCell((cell, colNumber) => {
      cells.push({ colNumber, text: String(cell.text || '').trim().toLowerCase() });
    });

    const hasUsername = cells.some(c => c.text.includes('tên đăng nhập') || c.text === 'username' || c.text.includes('tài khoản'));
    const hasFullName = cells.some(c => c.text.includes('họ và tên') || c.text.includes('họ tên') || c.text === 'full_name');

    if (hasUsername || hasFullName) {
      headerRowIndex = rowNumber;
      cells.forEach(c => {
        const t = c.text;
        if (t.includes('họ và tên') || t.includes('họ tên') || t === 'full_name') colMap.fullName = c.colNumber;
        else if (t.includes('tên đăng nhập') || t === 'username' || t.includes('tài khoản')) colMap.username = c.colNumber;
        else if (t.includes('mật khẩu') || t === 'password') colMap.password = c.colNumber;
        else if (t.includes('phân loại đối tượng') || t.includes('đối tượng') || t.includes('loại cán bộ') || t === 'employee_type') colMap.employeeType = c.colNumber;
        else if (t.includes('đơn vị') || t.includes('phòng ban') || t.includes('chi bộ') || t === 'dept') colMap.dept = c.colNumber;
        else if (t.includes('chức vụ kiêm nhiệm') || t.includes('kiêm nhiệm')) colMap.secondaryPos = c.colNumber;
        else if (t.includes('chức danh đảng') || t.includes('chức vụ đảng') || (t.includes('đảng') && !t.includes('lãnh đạo'))) colMap.partyTitle = c.colNumber;
        else if (t.includes('đoàn thể') || t.includes('công đoàn')) colMap.unionTitle = c.colNumber;
        else if (t.includes('vị trí việc làm') || t.includes('chức vụ') || t.includes('chức danh')) colMap.govTitle = c.colNumber;
        else if (t.includes('lãnh đạo / cbql') || t.includes('cbql trực tiếp') || t.includes('người đánh giá') || t.includes('lãnh đạo trực tiếp')) colMap.manager = c.colNumber;
        else if (t.includes('vai trò hệ thống') || t.includes('vai trò') || t.includes('nhóm quyền')) colMap.role = c.colNumber;
        else if (t.includes('cấp bậc quản lý') || t.includes('cấp quản lý')) colMap.managementRole = c.colNumber;
        else if (t.includes('ngày sinh') || t.includes('năm sinh')) colMap.birthDate = c.colNumber;
        else if (t.includes('giới tính')) colMap.gender = c.colNumber;
        else if (t.includes('điện thoại / email') || t.includes('số điện thoại') || t.includes('điện thoại')) colMap.phoneOrContact = c.colNumber;
        else if (t.includes('email')) colMap.email = c.colNumber;
      });
    }
  });

  const insertUserStmt = db.prepare(`
    INSERT INTO users (
      id, username, password, full_name, role, target_role, role_id, manager_id,
      management_role, final_evaluator_id,
      party_title, is_party_member, union_title, employee_type,
      gov_title, dept_id, birth_date, gender, phone, email, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const updateUserStmt = db.prepare(`
    UPDATE users
    SET full_name = ?, role = ?, target_role = ?, role_id = ?,
        management_role = COALESCE(?, management_role),
        party_title = ?, is_party_member = ?,
        union_title = COALESCE(?, union_title),
        employee_type = COALESCE(?, employee_type),
        gov_title = ?, dept_id = ?, birth_date = ?,
        gender = ?, phone = ?, email = ?
    WHERE id = ?
  `);

  sheet.eachRow((row, rowNumber) => {
    // Skip before or at header row
    if (headerRowIndex !== -1 && rowNumber <= headerRowIndex) return;

    const cell1Text = String(row.getCell(1).text || '').trim();
    // Skip title or subtitle banners if header detection was bypassed
    if (cell1Text.toUpperCase().includes('DANH SÁCH') || cell1Text.toUpperCase().includes('QUY ĐỊNH') || cell1Text.toUpperCase().includes('HƯỚNG DẪN')) return;
    if (cell1Text.toUpperCase() === 'STT') return;

    const usernameRaw = colMap.username ? String(row.getCell(colMap.username).text || '').trim() : String(row.getCell(2).text || '').trim();
    if (!usernameRaw || usernameRaw.toLowerCase().includes('tên đăng nhập') || usernameRaw.toLowerCase() === 'username') return;

    const fullName = colMap.fullName ? String(row.getCell(colMap.fullName).text || '').trim() : String(row.getCell(4).text || '').trim();
    if (!fullName || fullName.toLowerCase().includes('họ và tên')) {
      return;
    }

    totalRows++;
    const username = usernameRaw.toLowerCase().replace(/\s+/g, '_');
    const password = (colMap.password ? String(row.getCell(colMap.password).text || '').trim() : String(row.getCell(3).text || '').trim()) || '123456';

    // Match department
    const deptInput = (colMap.dept ? String(row.getCell(colMap.dept).text || '').trim() : String(row.getCell(5).text || '').trim()).toLowerCase();
    let deptId = deptLookup.get(deptInput) || null;
    if (!deptId && deptInput) {
      const foundDept = depts.find(d => 
        (d.code && d.code.toLowerCase().includes(deptInput)) || 
        (d.name && d.name.toLowerCase().includes(deptInput))
      );
      if (foundDept) deptId = foundDept.id;
    }

    // Match role
    const roleInput = (colMap.role ? String(row.getCell(colMap.role).text || '').trim() : String(row.getCell(6).text || '').trim()).toLowerCase();
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

    // Phân loại đối tượng: vien_chuc, nguoi_lao_dong, cong_chuc
    const empTypeRaw = (colMap.employeeType ? String(row.getCell(colMap.employeeType).text || '').trim() : '').toLowerCase();
    let employeeType = 'vien_chuc';
    if (empTypeRaw.includes('lao động') || empTypeRaw.includes('nguoi_lao_dong')) {
      employeeType = 'nguoi_lao_dong';
    } else if (empTypeRaw.includes('công chức') || empTypeRaw.includes('cong_chuc')) {
      employeeType = 'cong_chuc';
    }

    // Chức danh Đảng: Trống nếu không phải Đảng viên, không gán nhãn "Quần chúng"
    const partyTitleRaw = (colMap.partyTitle ? String(row.getCell(colMap.partyTitle).text || '').trim() : String(row.getCell(7).text || '').trim());
    let partyTitle = '';
    let isPartyMember = 0;
    if (partyTitleRaw && !partyTitleRaw.toLowerCase().includes('quần chúng') && partyTitleRaw.toLowerCase() !== 'không') {
      partyTitle = partyTitleRaw;
      isPartyMember = 1;
    }

    const unionTitle = colMap.unionTitle ? String(row.getCell(colMap.unionTitle).text || '').trim() : '';
    const govTitle = (colMap.govTitle ? String(row.getCell(colMap.govTitle).text || '').trim() : String(row.getCell(8).text || '').trim()) || 'Chuyên viên';
    const managerInput = (colMap.manager ? String(row.getCell(colMap.manager).text || '').trim() : String(row.getCell(9).text || '').trim()).toLowerCase();

    // Birth date
    const birthVal = colMap.birthDate ? row.getCell(colMap.birthDate).value : row.getCell(10).value;
    let birthDate = '1985-01-01';
    if (birthVal) {
      const parsedBirth = formatDate(birthVal);
      if (parsedBirth) birthDate = parsedBirth;
    }

    // Gender
    const genderRaw = (colMap.gender ? String(row.getCell(colMap.gender).text || '').trim() : String(row.getCell(11).text || '').trim()).toLowerCase();
    const gender = genderRaw.includes('nữ') || genderRaw === 'f' ? 'Nữ' : 'Nam';

    // Phone & Email
    let phone = '';
    let email = '';
    if (colMap.phoneOrContact) {
      const contactText = String(row.getCell(colMap.phoneOrContact).text || '').trim();
      if (contactText.includes('@')) {
        const parts = contactText.split(/[-–—/,\s]+/).filter(Boolean);
        const emailPart = parts.find(p => p.includes('@'));
        if (emailPart) email = emailPart.trim();
        const phonePart = parts.find(p => /^0\d{8,11}$/.test(p.replace(/\D/g, '')));
        if (phonePart) phone = phonePart.trim();
      } else {
        phone = contactText;
      }
    } else {
      phone = String(row.getCell(12).text || '').trim();
      email = String(row.getCell(13).text || '').trim();
    }
    if (colMap.email) {
      const directEmail = String(row.getCell(colMap.email).text || '').trim();
      if (directEmail) email = directEmail;
    }

    // Determine management role
    let managementRole = 'nhan_vien';
    if (colMap.managementRole) {
      const mgmtRaw = String(row.getCell(colMap.managementRole).text || '').trim().toLowerCase();
      if (mgmtRaw.includes('lãnh đạo') || mgmtRaw.includes('trưởng') || mgmtRaw === 'lanh_dao') {
        managementRole = 'lanh_dao';
      } else if (mgmtRaw.includes('quản lý') || mgmtRaw.includes('phó') || mgmtRaw === 'quan_ly') {
        managementRole = 'quan_ly';
      } else if (mgmtRaw.includes('tổ trưởng') || mgmtRaw === 'to_truong') {
        managementRole = 'to_truong';
      }
    } else if (effectiveRole === 'admin') {
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
            partyTitle, isPartyMember, unionTitle, employeeType,
            govTitle, deptId, birthDate,
            gender, phone, email, existingId
          );
          nameLookup.set(fullName.toLowerCase(), existingId);
          updatedCount++;
          if (managerInput) {
            pendingManagers.push({ userId: existingId, managerInput, rowNumber });
          }
        } else {
          skippedCount++;
        }
      } else {
        const newId = uuidv4();
        insertUserStmt.run(
          newId, username, password, fullName, effectiveRole, effectiveTargetRole,
          effectiveRoleId, null, managementRole, null,
          partyTitle, isPartyMember, unionTitle, employeeType,
          govTitle, deptId, birthDate,
          gender, phone, email
        );
        userLookup.set(username, newId);
        nameLookup.set(fullName.toLowerCase(), newId);
        importedCount++;
        if (managerInput) {
          pendingManagers.push({ userId: newId, managerInput, rowNumber });
        }
      }
    } catch (err) {
      errors.push({ row: rowNumber, username, message: err.message });
    }
  });

  // Second pass: resolve manager_id by username or full_name
  const updateManagerStmt = db.prepare('UPDATE users SET manager_id = ? WHERE id = ?');
  for (const pm of pendingManagers) {
    const mgrId = userLookup.get(pm.managerInput) || nameLookup.get(pm.managerInput);
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
    SELECT u.*, d.name as dept_name, d.parent_agency, d.location_name,
           d.manager_title, d.leader_title,
           u_leader.full_name as dept_leader_name
    FROM users u 
    LEFT JOIN departments d ON u.dept_id = d.id 
    LEFT JOIN users u_leader ON d.leader_id = u_leader.id
    WHERE u.id = ?
  `).get(userId);

  if (!period || !user) {
    throw new Error('Không tìm thấy thông tin kỳ đánh giá hoặc cán bộ');
  }

  const sysConfigs = getSystemConfigs();
  const parentAgency = user.parent_agency || sysConfigs.PARENT_AGENCY_NAME || 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH';
  const unitName = user.dept_name ? user.dept_name.toUpperCase() : (sysConfigs.UNIT_NAME || 'BAN TỔ CHỨC THÀNH ỦY TP. HỒ CHÍ MINH');
  const locationName = user.location_name || sysConfigs.LOCATION_NAME || 'TP. Hồ Chí Minh';
  const leaderName = user.dept_leader_name || sysConfigs.LEADER_SIGNER_NAME || '';
  const leaderTitle = user.leader_title || sysConfigs.LEADER_SIGNER_TITLE || 'THỦ TRƯỞNG ĐƠN VỊ';
  const deptLeaderTitle = user.manager_title || sysConfigs.DEPT_LEADER_TITLE || 'TRƯỞNG ĐƠN VỊ';

  const isCbnv = (user.target_role === 'cbnv') || (user.role === 'cbnv' && user.target_role !== 'cbql');
  const roleFilter = isCbnv ? 'cbnv' : 'cbql';

  // Fetch assigned tasks for user in this period
  const tasks = db.prepare(`
    SELECT * FROM assigned_tasks 
    WHERE period_id = ? AND user_id = ? AND status NOT IN ('rejected', 'cancelled')
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
  const empTypeStr = user.employee_type === 'nguoi_lao_dong' ? 'Người lao động' : (user.employee_type === 'cong_chuc' ? 'Công chức' : 'Viên chức');
  setInfoRow(6, 'Họ và tên:', `${user.full_name || ''}                                Ngày sinh: ${birthStr}`);
  setInfoRow(7, 'Phân loại đối tượng:', empTypeStr);
  setInfoRow(8, 'Chức danh Đảng:', user.party_title || '');
  setInfoRow(9, 'Chức vụ / Vị trí việc làm:', user.gov_title || (isCbnv ? 'Chuyên viên' : 'Lãnh đạo'));
  setInfoRow(10, 'Chức vụ đoàn thể:', user.union_title || 'Không có');
  setInfoRow(11, 'Đơn vị công tác:', user.dept_name || '');

  // Row 12-13: Section Header
  ws.mergeCells('B12:I12');
  ws.getCell('B12').value = 'I. Tự đánh giá kết quả thực hiện nhiệm vụ';
  ws.getCell('B12').font = { name: 'Times New Roman', size: 14, bold: true };
  ws.getRow(12).height = 24;

  ws.mergeCells('B13:I13');
  ws.getCell('B13').value = 'Trên cơ sở nhiệm vụ được giao, cá nhân tự đánh giá về kết quả thực hiện nhiệm vụ theo quý như sau:';
  ws.getCell('B13').font = { name: 'Times New Roman', size: 14, italic: true };
  ws.getRow(13).height = 24;

  // Row 14: Group A Title
  ws.getCell('A14').value = 'A';
  ws.getCell('A14').font = { name: 'Times New Roman', size: 14, bold: true };
  ws.mergeCells('B14:I14');
  ws.getCell('B14').value = 'NHÓM TIÊU CHÍ CHUNG (30 ĐIỂM)';
  ws.getCell('B14').font = { name: 'Times New Roman', size: 14, bold: true };
  ws.getRow(14).height = 26;

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

  // Xác định người đánh giá Bước 4 (Chức danh & Họ tên)
  const isStep4Evaluated = Boolean(
    evaluation.superior_evaluator_id ||
    evaluation.superior_rank ||
    (evaluation.status === 'approved' && evaluation.step !== 'step_1_register' && evaluation.step !== 'step_2_evidence' && evaluation.step !== 'step_3_self_eval') ||
    evaluation.step === 'step_6_advisory' ||
    evaluation.step === 'step_7_voting'
  );
  let step4Evaluator = null;
  if (isStep4Evaluated) {
    if (evaluation.superior_evaluator_id) {
      step4Evaluator = db.prepare('SELECT full_name, gov_title, party_title, role, management_role FROM users WHERE id = ?').get(evaluation.superior_evaluator_id);
    }
    if (!step4Evaluator && user.manager_id) {
      step4Evaluator = db.prepare('SELECT full_name, gov_title, party_title, role, management_role FROM users WHERE id = ?').get(user.manager_id);
    }
  }
  const step4EvaluatorTitle = (step4Evaluator?.gov_title || step4Evaluator?.party_title || '').trim();
  const step4EvaluatorName = step4Evaluator?.full_name || '';

  if (isCbnv) {
    // MẪU 01-B (CBNV): 2 bên ký (Cá nhân tự đánh giá & Lãnh đạo/Quản lý trực tiếp)
    ws.addRow([]);
    const sigHead = ws.addRow(['', 'CÁ NHÂN TỰ ĐÁNH GIÁ', '', '', '', 'LÃNH ĐẠO / QUẢN LÝ ĐƠN VỊ TRỰC TIẾP']);
    sigHead.font = { name: 'Times New Roman', size: 14, bold: true };
    sigHead.getCell(2).alignment = { horizontal: 'center' };
    sigHead.getCell(6).alignment = { horizontal: 'center' };
    ws.mergeCells(`B${sigHead.number}:E${sigHead.number}`);
    ws.mergeCells(`F${sigHead.number}:I${sigHead.number}`);

    const sigSub = ws.addRow(['', '(Ký, ghi rõ họ tên)', '', '', '', '(Ký, ghi rõ họ tên)']);
    sigSub.font = { name: 'Times New Roman', size: 14, italic: true };
    sigSub.getCell(2).alignment = { horizontal: 'center' };
    sigSub.getCell(6).alignment = { horizontal: 'center' };
    ws.mergeCells(`B${sigSub.number}:E${sigSub.number}`);
    ws.mergeCells(`F${sigSub.number}:I${sigSub.number}`);

    ws.addRow([]);
    ws.addRow([]);

    if (step4EvaluatorTitle) {
      const sigTitle = ws.addRow(['', '', '', '', '', step4EvaluatorTitle.toUpperCase()]);
      sigTitle.font = { name: 'Times New Roman', size: 14, bold: true };
      sigTitle.getCell(6).alignment = { horizontal: 'center' };
      ws.mergeCells(`F${sigTitle.number}:I${sigTitle.number}`);
    }

    const sigName = ws.addRow(['', user.full_name, '', '', '', step4EvaluatorName || '']);
    sigName.font = { name: 'Times New Roman', size: 14, bold: true };
    sigName.getCell(2).alignment = { horizontal: 'center' };
    sigName.getCell(6).alignment = { horizontal: 'center' };
    ws.mergeCells(`B${sigName.number}:E${sigName.number}`);
    ws.mergeCells(`F${sigName.number}:I${sigName.number}`);
  } else {
    // Cá nhân tự đánh giá signature (Mẫu 01-A)
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
  }

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

  // Xác nhận Ban Thường vụ / Tập thể Lãnh đạo (Mẫu 01-A) hoặc Thủ trưởng cơ quan (Mẫu 01-B)
  ws.addRow([]);
  const confTitle = isCbnv
    ? 'THỦ TRƯỞNG CƠ QUAN, ĐƠN VỊ'
    : 'XÁC NHẬN CỦA BAN THƯỜNG VỤ CẤP ỦY\nHOẶC TẬP THỂ LÃNH ĐẠO CƠ QUAN, ĐƠN VỊ';

  const confHead = ws.addRow(['', '', '', confTitle]);
  confHead.font = { name: 'Times New Roman', size: 14, bold: true };
  confHead.alignment = { horizontal: 'center', wrapText: true };
  ws.mergeCells(`D${confHead.number}:I${confHead.number}`);

  const confSub = ws.addRow(['', '', '', '(Ký, ghi rõ họ tên và đóng dấu)']);
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

  const printedSignerName = isCbnv ? (isUnitLeader ? '' : leaderName) : '';
  const confName = ws.addRow(['', '', '', printedSignerName]);
  confName.font = { name: 'Times New Roman', size: 14, bold: true };
  confName.alignment = { horizontal: 'center' };
  ws.mergeCells(`D${confName.number}:I${confName.number}`);

  // -----------------------------------------------------------------------------------
  // Sheet 2: BÁO CÁO KẾT QUẢ THỰC HIỆN CÔNG VIỆC (BẢNG 1 - PHỤ LỤC 5 HD.06)
  // -----------------------------------------------------------------------------------
  const allUserTasks = db.prepare(`
    SELECT t.*, assigner.full_name as assigner_name
    FROM assigned_tasks t
    LEFT JOIN users assigner ON t.assigned_by = assigner.id
    WHERE t.period_id = ? AND t.user_id = ? AND t.status NOT IN ('rejected', 'cancelled')
    ORDER BY t.axis_code ASC, t.deadline ASC
  `).all(periodId, userId);

  const wsTasks = workbook.addWorksheet('BÁO CÁO CÔNG VIỆC', {
    views: [{ showGridLines: true }]
  });

  // Setup column widths
  wsTasks.columns = [
    { width: 7 },  // STT
    { width: 18 }, // Trục
    { width: 45 }, // Tên công việc
    { width: 18 }, // Loại công việc
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
  wsTasks.mergeCells(`A1:O1`);

  const t2 = wsTasks.addRow([`(Theo Phụ lục 5 - Hướng dẫn 06-HD/BTCTU Ban Tổ chức Thành ủy)`]);
  t2.font = { name: 'Times New Roman', size: 14, italic: true };
  t2.alignment = { horizontal: 'center' };
  wsTasks.mergeCells(`A2:O2`);

  wsTasks.addRow([]);

  const rInfo1 = wsTasks.addRow([`Họ và tên cán bộ: ${user.full_name} (Ngày sinh: ${birthStr})`, '', '', '', '', `Chức vụ: ${user.gov_title || user.party_title || 'Cán bộ'}`, '', '', '', '', `Đơn vị: ${unitName}`]);
  rInfo1.font = { name: 'Times New Roman', size: 14, bold: true };
  wsTasks.mergeCells(`A4:E4`);
  wsTasks.mergeCells(`F4:I4`);
  wsTasks.mergeCells(`J4:O4`);

  const assignedCount = allUserTasks.filter(t => t.origin === 'assigned').length;
  const registeredCount = allUserTasks.filter(t => t.origin === 'registered').length;
  const rInfo2 = wsTasks.addRow([`Kỳ đánh giá: ${period.name}`, '', '', '', '', `Tổng số công việc: ${allUserTasks.length} (Lãnh đạo giao: ${assignedCount}, Tự đăng ký: ${registeredCount})`]);
  rInfo2.font = { name: 'Times New Roman', size: 14, italic: true };
  wsTasks.mergeCells(`A5:E5`);
  wsTasks.mergeCells(`F5:O5`);

  wsTasks.addRow([]);

  // Table header
  const taskHeader = wsTasks.addRow([
    'STT', 'Trục kết quả', 'Nội dung công việc', 'Loại công việc', 'Sản phẩm đầu ra', 'Thời hạn',
    'Ngày hoàn thành', 'Tiến độ %', 'Minh chứng thực hiện',
    'Điểm chuẩn', 'Hệ số ĐK', 'Điểm quy đổi', 'Điểm thưởng (5%)', 'Trạng thái', 'Ý kiến CBQL'
  ]);
  taskHeader.font = { name: 'Times New Roman', size: 14, bold: true };
  taskHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  taskHeader.height = 42;

  for (let c = 1; c <= 15; c++) {
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

  let currentAxis = null;
  let axisTaskIdx = 0;

  allUserTasks.forEach((t) => {
    totalStdScore += (t.standard_score || 0);
    totalConvScore += (t.converted_score || 0);
    const bSc = t.is_bonus_approved ? (t.bonus_score || ((t.converted_score || 0) * 0.05)) : 0;
    totalBonusScore += bSc;

    if (t.axis_code !== currentAxis) {
      currentAxis = t.axis_code;
      axisTaskIdx = 0;
    }
    axisTaskIdx++;

    const statusText = t.status === 'approved' ? 'Đã duyệt' :
                       t.status === 'submitted' ? 'Đã nộp MC' :
                       t.status === 'pending_approval' ? 'Chờ duyệt việc' :
                       t.status === 'rejected' ? 'Bị từ chối' : 'Đang làm';

    const evidenceText = [t.evidence_text, t.detailed_result_note, t.evidence_file_name].filter(Boolean).join(' | ');

    const row = wsTasks.addRow([
      axisTaskIdx,
      t.axis_code,
      t.task_name,
      t.task_type || 'Chuyên môn',
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
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(14).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = 1; c <= 15; c++) {
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
      '', 'TỔNG CỘNG', '', '', '', '', '', '', '',
      totalStdScore, '', Number(totalConvScore.toFixed(2)), Number(totalBonusScore.toFixed(2)), '', ''
    ]);
    sumRow.font = { name: 'Times New Roman', size: 14, bold: true };
    sumRow.alignment = { vertical: 'middle' };
    sumRow.height = 32;
    sumRow.getCell(2).alignment = { horizontal: 'center' };
    sumRow.getCell(10).alignment = { horizontal: 'right' };
    sumRow.getCell(12).alignment = { horizontal: 'right' };
    sumRow.getCell(13).alignment = { horizontal: 'right' };
    wsTasks.mergeCells(`B${sumRow.number}:I${sumRow.number}`);
    for (let c = 1; c <= 15; c++) {
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
  wsTasks.mergeCells(`M${s2Date.number}:O${s2Date.number}`);
  s2Date.getCell(13).alignment = { horizontal: 'center' };

  const s2SigHead = wsTasks.addRow([
    '', 'CÁ NHÂN TỰ ĐÁNH GIÁ', '', '', '', '', '', '', '', '', '',
    'XÁC NHẬN CỦA BAN THƯỜNG VỤ CẤP ỦY\nHOẶC TẬP THỂ LÃNH ĐẠO CƠ QUAN, ĐƠN VỊ'
  ]);
  s2SigHead.font = { name: 'Times New Roman', size: 14, bold: true };
  wsTasks.mergeCells(`B${s2SigHead.number}:E${s2SigHead.number}`);
  wsTasks.mergeCells(`L${s2SigHead.number}:O${s2SigHead.number}`);
  s2SigHead.getCell(2).alignment = { horizontal: 'center' };
  s2SigHead.getCell(12).alignment = { horizontal: 'center', wrapText: true };

  const s2SigSub = wsTasks.addRow([
    '', '(Ký, ghi rõ họ tên)', '', '', '', '', '', '', '', '', '',
    '(Ký, ghi rõ họ tên và đóng dấu)'
  ]);
  s2SigSub.font = { name: 'Times New Roman', size: 14, italic: true };
  wsTasks.mergeCells(`B${s2SigSub.number}:E${s2SigSub.number}`);
  wsTasks.mergeCells(`L${s2SigSub.number}:O${s2SigSub.number}`);
  s2SigSub.getCell(2).alignment = { horizontal: 'center' };
  s2SigSub.getCell(12).alignment = { horizontal: 'center' };

  wsTasks.addRow([]);
  wsTasks.addRow([]);

  const s2SigNames = wsTasks.addRow([
    '', user.full_name, '', '', '', '', '', '', '', '', '',
    isUnitLeader ? '' : leaderName
  ]);
  s2SigNames.font = { name: 'Times New Roman', size: 14, bold: true };
  wsTasks.mergeCells(`B${s2SigNames.number}:E${s2SigNames.number}`);
  wsTasks.mergeCells(`L${s2SigNames.number}:O${s2SigNames.number}`);
  s2SigNames.getCell(2).alignment = { horizontal: 'center' };
  s2SigNames.getCell(12).alignment = { horizontal: 'center' };

  return workbook;
}

// Export strictly according to MẪU 02 (Bảng tổng hợp kết quả đánh giá, xếp loại toàn cơ quan)
async function exportMau02Workbook(periodId) {
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(periodId) || { name: 'Quý III/2026', id: periodId };

  const sysConfigs = getSystemConfigs();
  // Tìm đơn vị đang được đánh giá (đơn vị có cán bộ nhân viên trong đợt đánh giá)
  const evalDept = db.prepare(`
    SELECT d.id, d.parent_id, d.parent_agency, d.location_name, d.name, d.leader_title, d.manager_title,
           u_leader.full_name as leader_name,
           count(u.id) as active_user_count
    FROM departments d
    JOIN users u ON u.dept_id = d.id AND u.is_active = 1
    LEFT JOIN users u_leader ON d.leader_id = u_leader.id
    WHERE d.is_active = 1
      AND u.role NOT IN ('admin', 'admin_donvi')
    GROUP BY d.id
    ORDER BY active_user_count DESC
    LIMIT 1
  `).get() || db.prepare(`
    SELECT d.id, d.parent_id, d.parent_agency, d.location_name, d.name, d.leader_title, d.manager_title,
           u_leader.full_name as leader_name
    FROM departments d
    LEFT JOIN users u_leader ON d.leader_id = u_leader.id
    WHERE d.is_active = 1
    ORDER BY d.parent_id IS NOT NULL DESC, d.code ASC LIMIT 1
  `).get();

  const parentDept = evalDept?.parent_id ? db.prepare('SELECT name FROM departments WHERE id = ?').get(evalDept.parent_id) : null;
  const parentAgency = (evalDept?.parent_agency && evalDept.parent_agency.trim().toLowerCase() !== evalDept.name?.trim().toLowerCase())
    ? evalDept.parent_agency
    : (parentDept?.name || sysConfigs.PARENT_AGENCY_NAME || 'ĐẢNG BỘ CẤP TRÊN');
  const unitName = evalDept?.name ? evalDept.name.toUpperCase() : (sysConfigs.UNIT_NAME || 'ĐƠN VỊ ĐÁNH GIÁ');
  const locationName = evalDept?.location_name || sysConfigs.LOCATION_NAME || 'TP. Hồ Chí Minh';
  const leaderName = evalDept?.leader_name || sysConfigs.LEADER_SIGNER_NAME || '';
  const leaderTitle = evalDept?.leader_title || sysConfigs.LEADER_SIGNER_TITLE || 'THỦ TRƯỞNG ĐƠN VỊ';

  const rows = db.prepare(`
    SELECT u.id as user_id, u.full_name, u.role, u.target_role, u.management_role, u.party_title, u.gov_title, u.union_title, d.name as dept_name,
           COALESCE(u.employee_type, 'vien_chuc') as employee_type,
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
  rows.sort(compareUsersByPositionAndName);

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
    { width: 26 }, // Chức vụ / Vị trí việc làm
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
    'STT', 'Họ và tên', 'Chức vụ / Vị trí việc làm', 'Đơn vị công tác',
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

  // Group definitions according to employee_type
  const rawGroupDefs = [
    { type: 'cong_chuc', name: 'KHỐI CÔNG CHỨC', prefix: 'Công chức' },
    { type: 'vien_chuc', name: 'KHỐI VIÊN CHỨC', prefix: 'Viên chức' },
    { type: 'lao_dong', name: 'KHỐI NGƯỜI LAO ĐỘNG', prefix: 'Người lao động', altType: 'nguoi_lao_dong' }
  ];

  const romanNumerals = ['I', 'II', 'III', 'IV', 'V'];
  let grpIdx = 0;
  const groupDefs = [];

  rawGroupDefs.forEach(def => {
    const matchingRows = rows.filter(r => {
      const et = r.employee_type || 'vien_chuc';
      return et === def.type || (def.altType && et === def.altType);
    });
    if (matchingRows.length > 0) {
      groupDefs.push({
        ...def,
        label: `${romanNumerals[grpIdx++]}. ${def.name}`,
        groupRows: matchingRows
      });
    }
  });

  let overallExc = 0;
  let overallGood = 0;
  let overallComplete = 0;
  let overallFail = 0;
  let globalStt = 1;

  const groupStats = [];

  groupDefs.forEach((grp) => {
    const groupRows = grp.groupRows;

    // Group Header Row
    const grpHeader = ws.addRow([`${grp.label} (Tổng số: ${groupRows.length} người)`]);
    grpHeader.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
    grpHeader.height = 28;
    ws.mergeCells(`A${grpHeader.number}:M${grpHeader.number}`);
    grpHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    for (let c = 1; c <= 13; c++) {
      grpHeader.getCell(c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    }

    let grpExc = 0;
    let grpGood = 0;
    let grpComp = 0;
    let grpFail = 0;

    groupRows.forEach((r) => {
      const isEvaluated = Boolean((r.superior_rank && r.superior_rank !== 'Chưa xếp loại') || (r.rank_proposed && !['Chưa tự đánh giá', 'Chưa đánh giá', 'Chưa xếp loại'].includes(r.rank_proposed) && Number(r.total_score) > 0));
      const p1 = isEvaluated && r.part1_score !== null && r.part1_score !== undefined ? Number(r.part1_score) : 0;
      const p2 = isEvaluated && r.part2_score !== null && r.part2_score !== undefined ? Number(r.part2_score) : 0;
      const bonus = isEvaluated && r.bonus_score !== null && r.bonus_score !== undefined ? Number(r.bonus_score) : 0;
      const total = isEvaluated ? (r.total_score !== null && r.total_score !== undefined ? Number(r.total_score) : (p1 + p2 + bonus)) : 0;

      const selfRank = isEvaluated ? (r.rank_proposed || 'Chưa tự đánh giá') : 'Chưa đánh giá';
      const finalRank = r.superior_rank || selfRank;

      if (finalRank.includes('xuất sắc')) { grpExc++; overallExc++; }
      else if (finalRank.includes('tốt')) { grpGood++; overallGood++; }
      else if (finalRank.includes('Không') || finalRank.includes('không')) { grpFail++; overallFail++; }
      else if (finalRank.includes('Hoàn thành')) { grpComp++; overallComplete++; }

      const row = ws.addRow([
        globalStt++,
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

    const gTotal = groupRows.length;
    groupStats.push({
      label: grp.label,
      total: gTotal,
      exc: grpExc,
      good: grpGood,
      complete: grpComp,
      fail: grpFail,
      excPct: gTotal > 0 ? ((grpExc / gTotal) * 100).toFixed(1) : '0.0',
      goodPct: gTotal > 0 ? ((grpGood / gTotal) * 100).toFixed(1) : '0.0',
      compPct: gTotal > 0 ? ((grpComp / gTotal) * 100).toFixed(1) : '0.0',
      failPct: gTotal > 0 ? ((grpFail / gTotal) * 100).toFixed(1) : '0.0',
      checkExc: Number(gTotal > 0 ? ((grpExc / gTotal) * 100).toFixed(1) : 0) <= 20
    });
  });

  // Summary statistics box
  ws.addRow([]);
  const sHead = ws.addRow(['THỐNG KÊ TỶ LỆ XẾP LOẠI CHI TIẾT THEO TỪNG KHỐI ĐỐI TƯỢNG (Chuẩn Nghị định & Hướng dẫn 06-HD/TU):']);
  sHead.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  ws.mergeCells(`A${sHead.number}:M${sHead.number}`);

  groupStats.forEach(gs => {
    const rGHead = ws.addRow([`• ${gs.label}: Tổng số ${gs.total} người (100%)`]);
    rGHead.font = { name: 'Times New Roman', size: 14, bold: true };
    ws.mergeCells(`A${rGHead.number}:M${rGHead.number}`);

    const rGExc = ws.addRow([`   - Hoàn thành xuất sắc nhiệm vụ: ${gs.exc} người (${gs.excPct}% - Quy định tối đa ≤ 20%): ${gs.checkExc ? 'ĐẠT QUY ĐỊNH' : 'VƯỢT CHỈ TIÊU CHO PHÉP'}`]);
    rGExc.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: gs.checkExc ? 'FF15803D' : 'FFB91C1C' } };
    ws.mergeCells(`A${rGExc.number}:M${rGExc.number}`);

    const rGDetails = ws.addRow([`   - Hoàn thành tốt: ${gs.good} người (${gs.goodPct}%) | Hoàn thành: ${gs.complete} người (${gs.compPct}%) | Không hoàn thành: ${gs.fail} người (${gs.failPct}%)`]);
    rGDetails.font = { name: 'Times New Roman', size: 14 };
    ws.mergeCells(`A${rGDetails.number}:M${rGDetails.number}`);
  });

  const totalPersonnel = rows.length;
  const overallExcPct = totalPersonnel > 0 ? ((overallExc / totalPersonnel) * 100).toFixed(1) : '0.0';
  const overallGoodPct = totalPersonnel > 0 ? ((overallGood / totalPersonnel) * 100).toFixed(1) : '0.0';
  const overallCompPct = totalPersonnel > 0 ? ((overallComplete / totalPersonnel) * 100).toFixed(1) : '0.0';
  const overallFailPct = totalPersonnel > 0 ? ((overallFail / totalPersonnel) * 100).toFixed(1) : '0.0';

  const rAllHead = ws.addRow([`• TỔNG HỢP TOÀN CƠ QUAN / ĐƠN VỊ: ${totalPersonnel} cán bộ, công chức, viên chức, người lao động (100%)`]);
  rAllHead.font = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF990000' } };
  ws.mergeCells(`A${rAllHead.number}:M${rAllHead.number}`);

  const rAllDetails = ws.addRow([`   - Xuất sắc: ${overallExc} người (${overallExcPct}%) | Tốt: ${overallGood} người (${overallGoodPct}%) | Hoàn thành: ${overallComplete} người (${overallCompPct}%) | Không hoàn thành: ${overallFail} người (${overallFailPct}%)`]);
  rAllDetails.font = { name: 'Times New Roman', size: 14, bold: true };
  ws.mergeCells(`A${rAllDetails.number}:M${rAllDetails.number}`);

  // Signatures for Mẫu 02
  ws.addRow([]);
  const m2Date = ws.addRow(['', '', '', '', '', '', '', '', '', formatAdministrativeDate(locationName)]);
  m2Date.font = { name: 'Times New Roman', size: 14, italic: true };
  ws.mergeCells(`J${m2Date.number}:M${m2Date.number}`);
  m2Date.getCell(10).alignment = { horizontal: 'center' };

  const sigRow1 = ws.addRow([
    '', 'NGƯỜI LẬP BIỂU', '', '', '', '', '', '', '',
    'THỦ TRƯỞNG CƠ QUAN, ĐƠN VỊ'
  ]);
  sigRow1.font = { name: 'Times New Roman', size: 14, bold: true };
  ws.mergeCells(`B${sigRow1.number}:E${sigRow1.number}`);
  ws.mergeCells(`J${sigRow1.number}:M${sigRow1.number}`);
  sigRow1.getCell(2).alignment = { horizontal: 'center' };
  sigRow1.getCell(10).alignment = { horizontal: 'center' };

  const sigRow2 = ws.addRow([
    '', '(Ký, ghi rõ họ tên)', '', '', '', '', '', '', '',
    '(Ký, ghi rõ họ tên và đóng dấu)'
  ]);
  sigRow2.font = { name: 'Times New Roman', size: 14, italic: true };
  ws.mergeCells(`B${sigRow2.number}:E${sigRow2.number}`);
  ws.mergeCells(`J${sigRow2.number}:M${sigRow2.number}`);
  sigRow2.getCell(2).alignment = { horizontal: 'center' };
  sigRow2.getCell(10).alignment = { horizontal: 'center' };

  ws.addRow([]);
  ws.addRow([]);

  const sigRow3 = ws.addRow([
    '', '', '', '', '', '', '', '', '',
    leaderName
  ]);
  sigRow3.font = { name: 'Times New Roman', size: 14, bold: true };
  ws.mergeCells(`B${sigRow3.number}:E${sigRow3.number}`);
  ws.mergeCells(`J${sigRow3.number}:M${sigRow3.number}`);
  sigRow3.getCell(10).alignment = { horizontal: 'center' };

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
  const sortedUsers = [...users].sort(compareUsersByPositionAndName);
  sortedUsers.forEach((u, idx) => {
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

// Export users list for User Management Tab
async function exportUsersWorkbook(usersList = [], options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hệ thống Đánh giá KPI';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Danh sách cán bộ', {
    views: [{ showGridLines: true }]
  });

  // Title
  ws.mergeCells('A1:N1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'DANH SÁCH CÁN BỘ, CÔNG CHỨC, VIÊN CHỨC VÀ NGƯỜI LAO ĐỘNG';
  titleCell.font = { name: 'Times New Roman', size: 15, bold: true, color: { argb: 'FF991B1B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:N2');
  const subCell = ws.getCell('A2');
  const dateStr = new Date().toLocaleDateString('vi-VN');
  subCell.value = `Thời điểm xuất danh sách: ${dateStr} - Tổng số cán bộ: ${usersList.length}`;
  subCell.font = { name: 'Times New Roman', size: 11, italic: true, color: { argb: 'FF475569' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;

  ws.addRow([]); // Blank row

  const headers = [
    'STT',
    'Họ và tên',
    'Tên đăng nhập',
    'Phân loại đối tượng',
    'Đơn vị / Phòng ban',
    'Chức vụ / Vị trí việc làm',
    'Chức danh Đảng',
    'Chức danh Đoàn thể',
    'Vai trò hệ thống',
    'Cấp bậc quản lý',
    'Chức vụ kiêm nhiệm',
    'Lãnh đạo / CBQL trực tiếp',
    'Trạng thái tài khoản',
    'Số điện thoại / Email'
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 28;
  headerRow.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF991B1B' } // Red header
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  const empTypeLabels = {
    cong_chuc: 'Công chức',
    vien_chuc: 'Viên chức',
    nguoi_lao_dong: 'Người lao động'
  };

  const mgmtRoleLabels = {
    lanh_dao: 'Lãnh đạo đơn vị',
    quan_ly: 'Cán bộ quản lý (Phó)',
    to_truong: 'Tổ trưởng / Trưởng bộ phận',
    nhan_vien: 'Cán bộ nhân viên'
  };

  usersList.forEach((u, idx) => {
    const empType = empTypeLabels[u.employee_type] || (u.employee_type === 'cong_chuc' ? 'Công chức' : 'Viên chức');
    const mgmtRole = mgmtRoleLabels[u.management_role] || 'Cán bộ nhân viên';
    const status = (u.is_active === 0 || u.is_active === false) ? 'Tạm khóa' : 'Hoạt động';

    let secTitles = '';
    if (Array.isArray(u.positions)) {
      const secs = u.positions.filter(p => !p.is_primary);
      secTitles = secs.map(p => `${p.position_title || 'Cán bộ'} (${p.department_name || p.dept_name || 'Đơn vị khác'})`).join('; ');
    } else if (u.secondary_titles) {
      secTitles = u.secondary_titles;
    }

    const contact = [u.phone, u.email].filter(Boolean).join(' - ');

    const row = ws.addRow([
      idx + 1,
      u.full_name || '',
      u.username || '',
      empType,
      u.dept_name || u.department_name || '',
      u.gov_title || u.position_title || 'Cán bộ',
      u.party_title || '',
      u.union_title || '',
      u.role_name || (u.role === 'admin' ? 'Quản trị viên' : (u.role === 'cbql' ? 'Cán bộ quản lý' : 'Cán bộ nhân viên')),
      mgmtRole,
      secTitles,
      u.manager_name || '',
      status,
      contact
    ]);

    row.height = 22;
    row.font = { name: 'Times New Roman', size: 11 };
    row.alignment = { vertical: 'middle' };

    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(13).alignment = { horizontal: 'center', vertical: 'middle' };

    const isEven = idx % 2 === 0;
    row.eachCell((cell) => {
      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  ws.columns = [
    { width: 6 },   // STT
    { width: 26 },  // Họ tên
    { width: 16 },  // Username
    { width: 18 },  // Phân loại
    { width: 28 },  // Đơn vị
    { width: 24 },  // Chức vụ chính
    { width: 20 },  // Chức danh Đảng
    { width: 20 },  // Chức danh Đoàn thể
    { width: 20 },  // Vai trò hệ thống
    { width: 24 },  // Cấp bậc quản lý
    { width: 30 },  // Kiêm nhiệm
    { width: 24 },  // Quản lý
    { width: 16 },  // Trạng thái
    { width: 26 }   // Liên hệ
  ];

  return workbook;
}

module.exports = {
  importStandardTasksFromExcel,
  importStandardTasksFromData,
  generateUserImportTemplate,
  importUsersFromExcel,
  exportCBQLWorkbook,
  exportMau02Workbook,
  exportDirectoryWorkbook,
  exportUsersWorkbook
};

