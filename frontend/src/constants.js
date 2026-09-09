export const OUTPUT_RESULT_OPTIONS = [
  'Văn bản/ Tài liệu',
  'Báo cáo tổng hợp',
  'Quyết định/ Chỉ thị',
  'Kế hoạch thực hiện',
  'Sản phẩm phần mềm',
  'Hội nghị/ Hội thảo',
  'Kết quả kiểm tra giám sát',
  'Khác'
];

/**
 * Formats any date value into dd/mm/yyyy.
 * @param {Date|string|number} val
 * @param {string} fallback
 * @returns {string} e.g. "30/09/2026"
 */
export function formatDate(val, fallback = '—') {
  if (!val) return fallback;
  
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return fallback;
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}/${m}/${y}`;
  }

  const str = String(val).trim();
  if (!str || str === 'null' || str === 'undefined' || str === '—') return fallback;

  // Pattern 1: Already dd/mm/yyyy or d/m/yyyy
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${d}/${m}/${y}`;
  }

  // Pattern 2: yyyy-mm-dd or yyyy-m-d (with optional time)
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${d}/${m}/${y}`;
  }

  // Pattern 3: dd-mm-yyyy
  const dmyDashMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmyDashMatch) {
    const d = dmyDashMatch[1].padStart(2, '0');
    const m = dmyDashMatch[2].padStart(2, '0');
    const y = dmyDashMatch[3];
    return `${d}/${m}/${y}`;
  }

  // Fallback: parse via Date constructor
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const y = parsed.getFullYear();
    return `${d}/${m}/${y}`;
  }

  return str;
}

/**
 * Formats a timestamp/date into HH:mm dd/mm/yyyy.
 */
export function formatDateTime(val, fallback = '—') {
  if (!val) return fallback;
  const parsed = val instanceof Date ? val : new Date(val);
  if (isNaN(parsed.getTime())) return formatDate(val, fallback);

  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const y = parsed.getFullYear();
  return `${hours}:${minutes} ${d}/${m}/${y}`;
}

/**
 * Formats current date or given date into Vietnamese administrative text format:
 * "ngày dd tháng mm năm yyyy" with 2-digit padding for day and month.
 */
export function formatAdministrativeDate(date = new Date(), location = '') {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const dateStr = `ngày ${day} tháng ${month} năm ${year}`;
  return location ? `${location}, ${dateStr}` : dateStr;
}

/**
 * Converts any date representation to yyyy-MM-dd format required for HTML5 <input type="date">.
 */
export function toInputDateFormat(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const ymd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }
  return str;
}

/**
 * Safely parses a dd/mm/yyyy or yyyy-mm-dd string into a local Date object without timezone issues.
 */
export function parseDateOnly(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim().split('T')[0];
  if (str.includes('/')) {
    const p = str.split('/');
    if (p.length === 3) {
      return new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
    }
  }
  const parts = str.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  }
  return null;
}
