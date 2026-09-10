const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { db, initDatabase, getDepartmentDescendantIds, getAccessibleUserIds } = require('./database');
const { 
  importStandardTasksFromExcel, 
  generateUserImportTemplate,
  importUsersFromExcel,
  exportCBQLWorkbook, 
  exportMau02Workbook 
} = require('./excelService');

// Initialize database
initDatabase();

const app = express();
const PORT = process.env.PORT || 5000;

// Storage Module (Supports Cloudflare R2 and Local Disk Fallback)
const { upload, saveUploadedFile, deleteUploadedFile, isR2Configured, localUploadDir } = require('./storage');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(localUploadDir));

// Proxy route to view / download files from Cloudflare R2 (when R2_PUBLIC_URL is not set or for private bucket)
app.get(/^\/api\/storage\/(.+)$/, async (req, res) => {
  const key = req.params[0];
  if (!key) return res.status(404).send('Not found');
  try {
    const { s3Client, R2_BUCKET_NAME } = require('./storage');
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    if (!s3Client || !R2_BUCKET_NAME) {
      return res.status(500).send('R2 Storage not configured');
    }
    const command = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key });
    const response = await s3Client.send(command);
    if (response.ContentType) res.setHeader('Content-Type', response.ContentType);
    response.Body.pipe(res);
  } catch (e) {
    res.status(404).send('File not found in storage: ' + e.message);
  }
});

// Helper: Extract current viewer ID for data scoping
function getViewerId(req) {
  return req.headers['x-viewer-id'] || 
         req.headers['x-user-id'] || 
         req.query.viewer_id || 
         req.query.user_id || 
         req.body?.assigned_by || 
         req.body?.viewer_id || 
         req.body?.user_id || 
         null;
}

// Helper: Get viewer details from DB
function getViewer(req) {
  const viewerId = getViewerId(req);
  if (!viewerId) return null;
  const viewer = db.prepare(`
    SELECT u.*, r.code as role_code, r.permissions, r.data_scope
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.id = ?
  `).get(viewerId);
  return viewer || null;
}

// Check if viewer has System Admin permissions
function checkIsAdmin(viewer) {
  if (!viewer) return false;
  if (viewer.role === 'admin' || viewer.role_code === 'admin') return true;
  try {
    const perms = typeof viewer.permissions === 'string' 
      ? JSON.parse(viewer.permissions || '{}') 
      : (viewer.permissions || {});
    return perms.can_manage_system === true;
  } catch (e) {
    return false;
  }
}

// Check if user is a Leader/Manager eligible for management and voting
function isLeaderUser(u) {
  if (!u) return false;
  if (u.role === 'admin' || u.role === 'cbql') return true;
  if (u.target_role === 'cbql') return true;
  if (u.role_code && ['admin', 'cbql_phong', 'ld_coquan', 'to_truong', 'hieu_pho'].includes(u.role_code)) return true;
  if (u.data_scope && u.data_scope !== 'personal') return true;
  try {
    const perms = typeof u.permissions === 'string' 
      ? JSON.parse(u.permissions || '{}') 
      : (u.permissions || {});
    if (perms.can_manage_system === true || perms.can_assign_tasks === true || perms.can_grade_tasks === true || perms.can_conclude_evaluation === true) {
      return true;
    }
  } catch (e) {}
  const title = `${u.gov_title || ''} ${u.party_title || ''}`.toLowerCase();
  const leaderKeywords = [
    'hiệu trưởng', 'hiệu phó', 'phó hiệu trưởng', 'giám đốc', 'phó giám đốc', 
    'trưởng phòng', 'phó phòng', 'phó trưởng phòng', 'trưởng ban', 'phó ban', 
    'tổ trưởng', 'tổ phó', 'bí thư', 'phó bí thư', 'thường trực', 'thường vụ', 
    'cấp ủy', 'chi ủy', 'chủ tịch', 'phó chủ tịch', 'quản trị'
  ];
  return leaderKeywords.some(kw => title.includes(kw));
}

// Check if viewer is CBQL or Admin (Leader/Manager)
function checkIsManagerOrAdmin(viewer) {
  return isLeaderUser(viewer);
}

// Middleware: Require Admin access (Cấu hình hệ thống, quản lý tài khoản, phòng ban, vai trò)
function requireAdmin(req, res, next) {
  const viewer = getViewer(req);
  if (!viewer) {
    return res.status(401).json({ success: false, message: 'Yêu cầu xác thực tài khoản quản trị viên (x-viewer-id)' });
  }
  if (!checkIsAdmin(viewer)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Từ chối truy cập: Bạn không có quyền cấu hình hệ thống hoặc quản trị phân quyền. Vui lòng liên hệ Quản trị viên.' 
    });
  }
  req.viewer = viewer;
  next();
}

// Middleware: Require CBQL or Admin access (Giao việc, chấm điểm, duyệt việc, quản lý danh mục chuẩn)
function requireManagerOrAdmin(req, res, next) {
  const viewer = getViewer(req);
  if (!viewer) {
    return res.status(401).json({ success: false, message: 'Yêu cầu xác thực tài khoản (x-viewer-id)' });
  }
  if (!checkIsManagerOrAdmin(viewer)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Từ chối truy cập: Thao tác này chỉ dành cho Cán bộ Quản lý (CBQL) hoặc Quản trị viên.' 
    });
  }
  req.viewer = viewer;
  next();
}

// Helper: Format date into dd/mm/yyyy
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
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]}`;
  }
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[3].padStart(2, '0')}/${ymdMatch[2].padStart(2, '0')}/${ymdMatch[1]}`;
  }
  return str;
}

// Helper: Parse date (YYYY-MM-DD or DD/MM/YYYY) cleanly without timezone offset issues
function parseDateOnly(dateStr) {
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

// Helper: Count late working days (excluding Saturday & Sunday)
function countLateWorkingDays(deadlineStr, finishDateStr) {
  const d = parseDateOnly(deadlineStr);
  const f = parseDateOnly(finishDateStr);
  if (!d || !f || f <= d) return 0;

  let count = 0;
  let cur = new Date(d);
  cur.setDate(cur.getDate() + 1);
  while (cur <= f) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) { // Not Sunday (0) and Not Saturday (6)
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// -------------------------------------------------------------
// Helper: Calculate Progress Percentage according to Regulations
// + Hoàn thành đúng hoặc trước hạn: 100%
// + Hoàn thành chậm 1 – 3 ngày làm việc: 80%
// + Hoàn thành chậm 4 – 5 ngày làm việc: 60%
// + Hoàn thành chậm trên 5 ngày làm việc: 0%
// -------------------------------------------------------------
function calculateProgressPct(deadlineStr, finishDateStr) {
  if (!finishDateStr) return 0.0;
  const d = parseDateOnly(deadlineStr);
  const f = parseDateOnly(finishDateStr);
  if (!d || !f) return 1.0;

  if (f <= d) {
    return 1.0; // Hoàn thành đúng hoặc trước hạn: 100%
  }

  const lateWorkingDays = countLateWorkingDays(deadlineStr, finishDateStr);
  if (lateWorkingDays <= 3) return 0.8; // Hoàn thành chậm 1 – 3 ngày làm việc: 80%
  if (lateWorkingDays <= 5) return 0.6; // Hoàn thành chậm 4 – 5 ngày làm việc: 60%
  return 0.0;                          // Hoàn thành chậm trên 5 ngày làm việc: 0%
}

function calculateScores(standardScore, difficultyWeight, progressPct, qualityPct, isBonus = false) {
  // Chuẩn theo Hướng dẫn 06-HD/BTCTU:
  // Điểm thực hiện công việc = Điểm chuẩn * (30% Tiến độ + 70% Chất lượng)
  const executionScore = standardScore * (0.30 * progressPct + 0.70 * qualityPct);
  // Điểm quy đổi thực tế = Điểm thực hiện * Hệ số độ khó
  let convertedScore = Number((executionScore * difficultyWeight).toFixed(2));
  const maxConverted = Number((standardScore * difficultyWeight).toFixed(2));
  if (convertedScore > maxConverted) convertedScore = maxConverted;

  // Điểm thưởng (nếu có): 5% điểm KPI đạt được của công việc
  let bonusScore = 0;
  if (isBonus) {
    bonusScore = Number((convertedScore * 0.05).toFixed(2));
  }

  return {
    executionScore: Number(executionScore.toFixed(2)),
    convertedScore,
    bonusScore
  };
}

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu' });
  }

  const user = db.prepare(`
    SELECT u.*, r.code as role_code, r.name as role_name, r.permissions, r.data_scope
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE LOWER(TRIM(u.username)) = LOWER(TRIM(?))
  `).get(username);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
  }

  if (user.password !== password) {
    return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
  }

  if (user.is_active === 0) {
    return res.status(403).json({ success: false, message: 'Tài khoản này đã bị khóa hoặc ngưng hoạt động. Vui lòng liên hệ Quản trị viên.' });
  }

  const { password: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser, message: 'Đăng nhập thành công' });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Đã đăng xuất phiên làm việc an toàn' });
});

app.get('/api/auth/me', (req, res) => {
  const viewerId = getViewerId(req);
  if (!viewerId) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });

  const user = db.prepare(`
    SELECT u.*, r.code as role_code, r.name as role_name, r.permissions, r.data_scope
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.id = ?
  `).get(viewerId);

  if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin tài khoản' });
  const { password: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

// Self-change password for current authenticated user
app.post('/api/auth/change-password', (req, res) => {
  const viewerId = getViewerId(req);
  if (!viewerId) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn' });
  }

  const { current_password, new_password, confirm_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới' });
  }

  if (confirm_password !== undefined && new_password !== confirm_password) {
    return res.status(400).json({ success: false, message: 'Mật khẩu xác nhận không trùng khớp với mật khẩu mới' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin cán bộ' });
  }

  if (user.password !== current_password) {
    return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác' });
  }

  if (current_password === new_password) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại' });
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(new_password, viewerId);
  res.json({ success: true, message: 'Đổi mật khẩu thành công! Hãy sử dụng mật khẩu mới trong các lần đăng nhập tiếp theo.' });
});

// -------------------------------------------------------------
// 1. Periods, Departments, Users, Axes & Admin Management
// -------------------------------------------------------------
app.get('/api/periods', (req, res) => {
  const periods = db.prepare('SELECT * FROM periods ORDER BY start_date DESC').all();
  res.json(periods);
});

app.get('/api/departments', (req, res) => {
  const depts = db.prepare(`
    SELECT d.*, 
           p.name as parent_name,
           u.full_name as leader_name,
           (SELECT COUNT(*) FROM departments c WHERE c.parent_id = d.id AND (c.is_active IS NULL OR c.is_active = 1)) as sub_dept_count,
           (SELECT COUNT(*) FROM users m WHERE m.dept_id = d.id AND (m.is_active IS NULL OR m.is_active = 1)) as user_count
    FROM departments d
    LEFT JOIN departments p ON d.parent_id = p.id
    LEFT JOIN users u ON d.leader_id = u.id
    ORDER BY d.parent_id IS NOT NULL, d.code ASC
  `).all();
  res.json(depts);
});

// Admin: Create department
app.post('/api/departments', requireAdmin, (req, res) => {
  const { code, name, parent_id, leader_id, description, parent_agency, location_name } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, message: 'Thiếu mã hoặc tên đơn vị/phòng ban' });
  }
  const existing = db.prepare('SELECT id FROM departments WHERE code = ?').get(code);
  if (existing) {
    return res.status(400).json({ success: false, message: 'Mã đơn vị/phòng ban đã tồn tại' });
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO departments (id, code, name, parent_id, leader_id, description, is_active, parent_agency, location_name)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id, code, name, parent_id || null, leader_id || null, description || '',
    parent_agency || 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH',
    location_name || 'TP. Hồ Chí Minh'
  );

  res.json({ success: true, id, message: 'Đã tạo đơn vị/phòng ban mới thành công' });
});

// Admin: Update department
app.put('/api/departments/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { code, name, parent_id, leader_id, description, is_active, parent_agency, location_name } = req.body;
  const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  if (!dept) return res.status(404).json({ success: false, message: 'Không tìm thấy phòng ban' });

  if (parent_id !== undefined && parent_id === id) {
    return res.status(400).json({ success: false, message: 'Đơn vị cha không thể là chính đơn vị này' });
  }

  db.prepare(`
    UPDATE departments
    SET code = ?,
        name = ?,
        parent_id = ?,
        leader_id = ?,
        description = ?,
        is_active = ?,
        parent_agency = ?,
        location_name = ?
    WHERE id = ?
  `).run(
    code !== undefined ? code : dept.code,
    name !== undefined ? name : dept.name,
    parent_id !== undefined ? (parent_id || null) : dept.parent_id,
    leader_id !== undefined ? (leader_id || null) : dept.leader_id,
    description !== undefined ? description : dept.description,
    is_active !== undefined ? (is_active ? 1 : 0) : dept.is_active,
    parent_agency !== undefined ? parent_agency : dept.parent_agency,
    location_name !== undefined ? location_name : dept.location_name,
    id
  );

  res.json({ success: true, message: 'Đã cập nhật thông tin phòng ban thành công' });
});

// Admin: Delete department
app.delete('/api/departments/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE dept_id = ? AND (is_active IS NULL OR is_active = 1)').get(id).count;
  if (userCount > 0) {
    return res.status(400).json({ success: false, message: `Không thể xóa vì đơn vị đang có ${userCount} cán bộ nhân viên` });
  }
  const childCount = db.prepare('SELECT COUNT(*) as count FROM departments WHERE parent_id = ? AND (is_active IS NULL OR is_active = 1)').get(id).count;
  if (childCount > 0) {
    return res.status(400).json({ success: false, message: `Không thể xóa vì đang có ${childCount} đơn vị con trực thuộc` });
  }

  db.prepare('DELETE FROM departments WHERE id = ?').run(id);
  res.json({ success: true, message: 'Đã xóa đơn vị thành công' });
});

// -------------------------------------------------------------
// Dynamic Roles & Permissions Management
// -------------------------------------------------------------
app.get('/api/roles', (req, res) => {
  const roles = db.prepare(`
    SELECT r.*,
           (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND (u.is_active IS NULL OR u.is_active = 1)) as user_count
    FROM roles r
    ORDER BY r.is_system DESC, r.created_at ASC
  `).all();
  const formatted = roles.map(r => ({
    ...r,
    permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions || '{}') : (r.permissions || {})
  }));
  res.json(formatted);
});

app.post('/api/roles', requireAdmin, (req, res) => {
  const { code, name, description, data_scope, permissions } = req.body;
  if (!code || !name) return res.status(400).json({ success: false, message: 'Thiếu mã hoặc tên vai trò' });

  const existing = db.prepare('SELECT id FROM roles WHERE code = ?').get(code);
  if (existing) return res.status(400).json({ success: false, message: 'Mã vai trò đã tồn tại' });

  const id = uuidv4();
  const permStr = typeof permissions === 'object' ? JSON.stringify(permissions) : (permissions || '{}');
  db.prepare(`
    INSERT INTO roles (id, code, name, description, data_scope, permissions, is_system)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(id, code, name, description || '', data_scope || 'personal', permStr);

  res.json({ success: true, id, message: 'Đã tạo vai trò mới thành công' });
});

app.put('/api/roles/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { code, name, description, data_scope, permissions } = req.body;
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!role) return res.status(404).json({ success: false, message: 'Không tìm thấy vai trò' });

  const permStr = permissions !== undefined 
    ? (typeof permissions === 'object' ? JSON.stringify(permissions) : permissions)
    : role.permissions;

  db.prepare(`
    UPDATE roles
    SET code = COALESCE(?, code),
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        data_scope = COALESCE(?, data_scope),
        permissions = ?
    WHERE id = ?
  `).run(code, name, description, data_scope, permStr, id);

  res.json({ success: true, message: 'Đã cập nhật vai trò thành công' });
});

app.delete('/api/roles/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!role) return res.status(404).json({ success: false, message: 'Không tìm thấy vai trò' });
  if (role.is_system === 1) {
    return res.status(400).json({ success: false, message: 'Không thể xóa vai trò mặc định của hệ thống' });
  }
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id = ?').get(id).count;
  if (userCount > 0) {
    return res.status(400).json({ success: false, message: `Không thể xóa vì đang có ${userCount} cán bộ được gán vai trò này` });
  }

  db.prepare('DELETE FROM roles WHERE id = ?').run(id);
  res.json({ success: true, message: 'Đã xóa vai trò thành công' });
});

// -------------------------------------------------------------
// Users Management
// -------------------------------------------------------------
app.get('/api/users', (req, res) => {
  const viewerId = getViewerId(req);
  const accessibleUserIds = getAccessibleUserIds(viewerId);

  let query = `
    SELECT u.id, u.username, u.full_name, u.role, u.target_role, u.party_title, u.gov_title, u.dept_id,
           u.role_id, u.manager_id, u.management_role, u.final_evaluator_id,
           u.birth_date, u.gender, u.phone, u.email, COALESCE(u.is_active, 1) as is_active,
           d.name as dept_name,
           r.name as role_name, r.code as role_code, r.data_scope,
           mgr.full_name as manager_name,
           fe.full_name as final_evaluator_name
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN users mgr ON u.manager_id = mgr.id
    LEFT JOIN users fe ON u.final_evaluator_id = fe.id
    WHERE 1=1
  `;
  const params = [];

  if (req.query.filter_accessible === 'true' && accessibleUserIds !== null) {
    if (accessibleUserIds.length === 0) {
      return res.json([]);
    }
    const placeholders = accessibleUserIds.map(() => '?').join(',');
    query += ` AND u.id IN (${placeholders})`;
    params.push(...accessibleUserIds);
  }

  query += ` ORDER BY u.role DESC, u.full_name ASC`;
  const users = db.prepare(query).all(...params);
  res.json(users);
});

// Admin: Add new user
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { 
    username, password, full_name, role, target_role, role_id, manager_id,
    management_role, final_evaluator_id,
    party_title, gov_title, dept_id, birth_date, gender, phone, email 
  } = req.body;
  if (!username || !full_name) {
    return res.status(400).json({ success: false, message: 'Thiếu tên đăng nhập hoặc họ tên' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại trên hệ thống' });
  }

  const id = uuidv4();
  
  // Resolve legacy role and target_role from role_id if provided
  let effectiveRole = role || 'cbnv';
  let effectiveTargetRole = target_role || (effectiveRole === 'cbql' ? 'cbql' : 'cbnv');
  let effectiveRoleId = role_id;

  if (effectiveRoleId) {
    const r = db.prepare('SELECT * FROM roles WHERE id = ?').get(effectiveRoleId);
    if (r) {
      if (r.code === 'admin') { effectiveRole = 'admin'; effectiveTargetRole = 'cbql'; }
      else if (r.code === 'cbql_phong' || r.code === 'ld_coquan') { effectiveRole = 'cbql'; effectiveTargetRole = 'cbql'; }
      else { effectiveRole = 'cbnv'; effectiveTargetRole = 'cbnv'; }
    }
  } else {
    // find matching role
    const r = db.prepare('SELECT id FROM roles WHERE code = ?').get(effectiveRole);
    if (r) effectiveRoleId = r.id;
  }

  // Derive default management_role if not specified
  let effectiveMgmtRole = management_role;
  if (!effectiveMgmtRole) {
    if (effectiveRole === 'admin' || (gov_title && (gov_title.includes('Trưởng') || gov_title.includes('Giám đốc') || gov_title.includes('Bí thư')))) {
      effectiveMgmtRole = 'lanh_dao';
    } else if (effectiveRole === 'cbql') {
      effectiveMgmtRole = (gov_title && gov_title.includes('Tổ trưởng')) ? 'to_truong' : 'quan_ly';
    } else {
      effectiveMgmtRole = 'nhan_vien';
    }
  }

  db.prepare(`
    INSERT INTO users (id, username, password, full_name, role, target_role, role_id, manager_id, management_role, final_evaluator_id, party_title, gov_title, dept_id, birth_date, gender, phone, email, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, username, password || '123456', full_name, effectiveRole, effectiveTargetRole,
    effectiveRoleId || null, manager_id || null, effectiveMgmtRole || 'nhan_vien', final_evaluator_id || null,
    party_title || 'Đảng viên', gov_title || 'Chuyên viên', dept_id || null,
    birth_date || '1985-01-01', gender || 'Nam', phone || '', email || ''
  );

  res.json({ success: true, id, message: 'Đã thêm cán bộ nhân viên thành công' });
});

// Admin: Update user
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { 
    full_name, role, target_role, role_id, manager_id,
    management_role, final_evaluator_id,
    party_title, gov_title, dept_id, birth_date, gender, phone, email, is_active, password 
  } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });

  let effectiveRole = role || user.role;
  let effectiveTargetRole = target_role !== undefined ? target_role : user.target_role;
  let effectiveRoleId = role_id !== undefined ? role_id : user.role_id;

  if (role_id && role_id !== user.role_id) {
    const r = db.prepare('SELECT * FROM roles WHERE id = ?').get(role_id);
    if (r) {
      if (r.code === 'admin') { effectiveRole = 'admin'; effectiveTargetRole = 'cbql'; }
      else if (r.code === 'cbql_phong' || r.code === 'ld_coquan') { effectiveRole = 'cbql'; effectiveTargetRole = 'cbql'; }
      else { effectiveRole = 'cbnv'; effectiveTargetRole = 'cbnv'; }
    }
  }

  let updateQuery = `
    UPDATE users 
    SET full_name = ?, role = ?, target_role = ?, role_id = ?, manager_id = ?,
        management_role = ?, final_evaluator_id = ?,
        party_title = ?, gov_title = ?, dept_id = ?,
        birth_date = ?, gender = ?, phone = ?, email = ?, is_active = ?
  `;
  const params = [
    full_name || user.full_name, effectiveRole, effectiveTargetRole,
    effectiveRoleId || null, manager_id !== undefined ? manager_id : user.manager_id,
    management_role !== undefined ? management_role : (user.management_role || 'nhan_vien'),
    final_evaluator_id !== undefined ? final_evaluator_id : user.final_evaluator_id,
    party_title !== undefined ? party_title : user.party_title,
    gov_title !== undefined ? gov_title : user.gov_title, dept_id || user.dept_id,
    birth_date || user.birth_date, gender || user.gender, phone !== undefined ? phone : user.phone,
    email !== undefined ? email : user.email, is_active !== undefined ? is_active : user.is_active
  ];

  if (password) {
    updateQuery += ', password = ?';
    params.push(password);
  }

  updateQuery += ' WHERE id = ?';
  params.push(id);

  db.prepare(updateQuery).run(...params);
  res.json({ success: true, message: 'Đã cập nhật thông tin cán bộ thành công' });
});

// Admin: Delete or deactivate user
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
  res.json({ success: true, message: 'Đã ngừng kích hoạt tài khoản cán bộ' });
});

// Admin: Reset / Re-issue user password
app.post('/api/admin/users/:id/reset-password', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body || {};
  const passwordToSet = new_password && new_password.trim() ? new_password.trim() : '123456';

  if (passwordToSet.length < 6) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy cán bộ' });
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(passwordToSet, id);
  res.json({ 
    success: true, 
    message: `Đã cấp lại mật khẩu cho cán bộ "${user.full_name}" thành công!`, 
    new_password: passwordToSet 
  });
});

// Admin: Download Excel template for user import
app.get('/api/admin/users/template', async (req, res) => {
  try {
    const workbook = await generateUserImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mau_nhap_danh_sach_can_bo_KPI.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating user template:', err);
    res.status(500).json({ success: false, message: 'Lỗi tạo file mẫu: ' + err.message });
  }
});

// Admin: Import users from Excel
app.post('/api/admin/users/import', upload.single('file'), requireAdmin, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng đính kèm file Excel (.xlsx) danh sách cán bộ' });
    }

    const updateExisting = req.body?.update_existing === 'true' || req.body?.update_existing === true || req.body?.update_existing === '1';
    const result = await importUsersFromExcel(req.file.path, { updateExisting });

    // Clean up temporary uploaded file
    try {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (e) {}

    res.json({
      success: true,
      message: `Đã xử lý file thành công: Thêm mới ${result.importedCount} cán bộ, Cập nhật ${result.updatedCount} cán bộ, Bỏ qua ${result.skippedCount}`,
      ...result
    });
  } catch (error) {
    console.error('Import users error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin: Get system configs
app.get('/api/admin/configs', (req, res) => {
  const configs = db.prepare('SELECT * FROM system_configs').all();
  // Return as dictionary object for convenience
  const dict = {};
  configs.forEach(c => { dict[c.key] = c.value; });
  res.json(dict);
});

// Admin: Update system config
app.put('/api/admin/configs', requireAdmin, (req, res) => {
  const body = req.body;
  const updateStmt = db.prepare('INSERT OR REPLACE INTO system_configs (key, value, description) VALUES (?, ?, COALESCE((SELECT description FROM system_configs WHERE key = ?), ?))');

  const runTx = db.transaction(() => {
    if (body.configs && Array.isArray(body.configs)) {
      for (const c of body.configs) {
        updateStmt.run(c.key, String(c.value), c.key, c.description || '');
      }
    } else if (Array.isArray(body)) {
      for (const c of body) {
        updateStmt.run(c.key, String(c.value), c.key, c.description || '');
      }
    } else if (typeof body === 'object') {
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string' || typeof value === 'number') {
          updateStmt.run(key, String(value), key, '');
        }
      }
    }
  });

  runTx();
  res.json({ success: true, message: 'Đã cập nhật cấu hình hệ thống' });
});

// Admin: Create evaluation period
app.post('/api/admin/periods', requireAdmin, (req, res) => {
  const { code, name, start_date, end_date, grading_lock_date, is_active } = req.body;
  if (!code || !name) return res.status(400).json({ success: false, message: 'Thiếu mã hoặc tên kỳ' });
  const id = uuidv4();
  const activeVal = is_active !== undefined ? (is_active ? 1 : 0) : 1;
  db.prepare('INSERT INTO periods (id, code, name, start_date, end_date, grading_lock_date, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, code, name, start_date, end_date, grading_lock_date || null, activeVal);
  res.json({ success: true, id, message: 'Đã tạo kỳ đánh giá thành công' });
});

// Admin: Update evaluation period
app.put('/api/admin/periods/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { code, name, start_date, end_date, grading_lock_date, is_active } = req.body;
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
  if (!period) return res.status(404).json({ success: false, message: 'Không tìm thấy kỳ đánh giá' });

  db.prepare(`
    UPDATE periods 
    SET code = ?,
        name = ?,
        start_date = ?,
        end_date = ?,
        grading_lock_date = ?,
        is_active = ?
    WHERE id = ?
  `).run(
    code !== undefined ? code : period.code,
    name !== undefined ? name : period.name,
    start_date !== undefined ? start_date : period.start_date,
    end_date !== undefined ? end_date : period.end_date,
    grading_lock_date !== undefined ? grading_lock_date : period.grading_lock_date,
    is_active !== undefined ? (is_active ? 1 : 0) : period.is_active,
    id
  );

  res.json({ success: true, message: 'Đã cập nhật kỳ đánh giá thành công' });
});

// Leader / Admin: Finalize (Chốt KPI) toàn cơ quan/đơn vị
app.post('/api/admin/periods/:id/finalize', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { finalized_by, finalized_note } = req.body;
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
  if (!period) return res.status(404).json({ success: false, message: 'Không tìm thấy kỳ đánh giá' });

  const viewerId = getViewerId(req);
  const viewer = viewerId ? db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) : null;
  const leaderName = finalized_by || viewer?.full_name || 'Lãnh đạo cơ quan';
  const now = new Date().toISOString();

  // Transaction: Lock period and update evaluation statuses to finalized
  const finalizeTx = db.transaction(() => {
    db.prepare(`
      UPDATE periods 
      SET is_locked = 1, finalized_at = ?, finalized_by = ?, finalized_note = ?
      WHERE id = ?
    `).run(now, leaderName, finalized_note || 'Đã chốt KPI chính thức toàn đơn vị/cơ quan', id);

    db.prepare(`
      UPDATE evaluations
      SET status = 'approved', updated_at = CURRENT_TIMESTAMP
      WHERE period_id = ? AND (status IS NULL OR status = 'submitted' OR status = 'draft')
    `).run(id);
  });

  finalizeTx();

  res.json({ 
    success: true, 
    message: `Đã Chốt & Khóa Sổ KPI toàn đơn vị cho kỳ "${period.name}" thành công!`,
    finalized_at: now,
    finalized_by: leaderName
  });
});

// Leader / Admin: Unfinalize (Mở khóa KPI) toàn cơ quan/đơn vị
app.post('/api/admin/periods/:id/unfinalize', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
  if (!period) return res.status(404).json({ success: false, message: 'Không tìm thấy kỳ đánh giá' });

  db.prepare(`
    UPDATE periods 
    SET is_locked = 0, finalized_note = 'Mở khóa lúc ' || CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  res.json({ 
    success: true, 
    message: `Đã mở khóa KPI cho kỳ "${period.name}". Cán bộ có thể tiếp tục cập nhật!` 
  });
});

app.get('/api/axes', (req, res) => {
  const axes = db.prepare('SELECT * FROM axes ORDER BY code ASC').all();
  res.json(axes);
});

// -------------------------------------------------------------
// 2. Standard Tasks (Danh mục Công việc chuẩn)
// -------------------------------------------------------------
app.get('/api/standard-tasks', (req, res) => {
  const { period_id, axis_code, dept_code } = req.query;
  let query = 'SELECT * FROM standard_tasks WHERE 1=1';
  const params = [];

  if (period_id) {
    query += ' AND (period_id = ? OR period_id IS NULL)';
    params.push(period_id);
  }
  if (axis_code) {
    query += ' AND axis_code = ?';
    params.push(axis_code);
  }
  if (dept_code) {
    query += ' AND (dept_code = ? OR dept_code IS NULL)';
    params.push(dept_code);
  }
  query += ' ORDER BY axis_code, deadline ASC';

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// Download template for standard tasks import
app.get('/api/standard-tasks/template', (req, res) => {
  try {
    const templatePath = path.join(__dirname, '..', 'mau-import-new-san-pham-cong-viec-chuan.xlsx');
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ message: 'Không tìm thấy file mẫu trên máy chủ' });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mau_nhap_danh_muc_cong_viec_chuan.xlsx"');
    const fileStream = fs.createReadStream(templatePath);
    fileStream.pipe(res);
  } catch (err) {
    console.error('Error serving standard tasks template:', err);
    res.status(500).json({ message: 'Lỗi tải file mẫu: ' + err.message });
  }
});

// Import standard tasks from Excel
app.post('/api/standard-tasks/import', upload.single('file'), requireManagerOrAdmin, async (req, res) => {
  try {
    let filePath;
    if (req.file) {
      filePath = req.file.path;
    } else {
      // Use existing demo file if no file uploaded
      filePath = path.join(__dirname, '..', 'mau-import-new-san-pham-cong-viec-chuan.xlsx');
    }

    const { period_id } = req.body;
    const result = await importStandardTasksFromExcel(filePath, period_id);
    res.json({ success: true, message: `Đã nạp thành công ${result.importedCount} công việc chuẩn`, ...result });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create manual standard task
app.post('/api/standard-tasks', requireManagerOrAdmin, (req, res) => {
  const {
    period_id, dept_code, task_name, output_result, deadline,
    task_type, standard_score, difficulty_weight, expected_evidence, note, axis_code
  } = req.body;

  const id = uuidv4();
  const stdScore = parseFloat(standard_score) || (task_type === 'Đột xuất' ? 12 : 10);
  const diffWeight = parseFloat(difficulty_weight) || 1.0;
  const maxConv = Number((stdScore * diffWeight).toFixed(2));

  db.prepare(`
    INSERT INTO standard_tasks (
      id, period_id, dept_code, task_name, output_result, deadline,
      task_type, standard_score, difficulty_weight, max_converted_score,
      expected_evidence, note, axis_code, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Hoạt động')
  `).run(id, period_id, dept_code, task_name, output_result, deadline, task_type, stdScore, diffWeight, maxConv, expected_evidence || '', note || '', axis_code);

  res.json({ success: true, id, message: 'Đã thêm công việc chuẩn thành công' });
});

// Update standard task
app.put('/api/standard-tasks/:id', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const {
    task_name, output_result, deadline, task_type, standard_score,
    difficulty_weight, expected_evidence, note, axis_code, status
  } = req.body;

  const existing = db.prepare('SELECT * FROM standard_tasks WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy công việc chuẩn' });
  }

  const stdScore = standard_score !== undefined ? parseFloat(standard_score) : existing.standard_score;
  const diffWeight = difficulty_weight !== undefined ? parseFloat(difficulty_weight) : existing.difficulty_weight;
  const maxConv = Number((stdScore * diffWeight).toFixed(2));

  db.prepare(`
    UPDATE standard_tasks
    SET task_name = COALESCE(?, task_name),
        output_result = COALESCE(?, output_result),
        deadline = COALESCE(?, deadline),
        task_type = COALESCE(?, task_type),
        standard_score = ?,
        difficulty_weight = ?,
        max_converted_score = ?,
        expected_evidence = COALESCE(?, expected_evidence),
        note = COALESCE(?, note),
        axis_code = COALESCE(?, axis_code),
        status = COALESCE(?, status)
    WHERE id = ?
  `).run(
    task_name !== undefined ? task_name : null,
    output_result !== undefined ? output_result : null,
    deadline !== undefined ? deadline : null,
    task_type !== undefined ? task_type : null,
    stdScore,
    diffWeight,
    maxConv,
    expected_evidence !== undefined ? expected_evidence : null,
    note !== undefined ? note : null,
    axis_code !== undefined ? axis_code : null,
    status !== undefined ? status : null,
    id
  );

  res.json({ success: true, message: 'Đã cập nhật công việc chuẩn thành công' });
});

// Toggle status of standard task (Hoạt động <-> Tạm khóa)
app.put('/api/standard-tasks/:id/status', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body || {};
  const existing = db.prepare('SELECT * FROM standard_tasks WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy công việc chuẩn' });
  }

  const newStatus = status || (existing.status === 'Hoạt động' ? 'Tạm khóa' : 'Hoạt động');
  db.prepare(`
    UPDATE standard_tasks
    SET status = ?,
        note = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE note END
    WHERE id = ?
  `).run(newStatus, note || null, note || null, note || null, id);

  res.json({ success: true, status: newStatus, message: `Đã chuyển trạng thái sang ${newStatus}` });
});

// Delete standard task
app.delete('/api/standard-tasks/:id', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM standard_tasks WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy công việc chuẩn' });
  }

  db.prepare('DELETE FROM standard_tasks WHERE id = ?').run(id);
  res.json({ success: true, message: 'Đã xóa công việc chuẩn khỏi danh mục thành công' });
});

// -------------------------------------------------------------
// 3. Assigned Tasks (Giao việc & Tự đăng ký việc)
// -------------------------------------------------------------
app.get('/api/assigned-tasks', (req, res) => {
  const { period_id, user_id, status, axis_code, origin, assigned_by } = req.query;
  const viewerId = getViewerId(req);
  const accessibleUserIds = getAccessibleUserIds(viewerId);

  let query = `
    SELECT t.*, u.full_name as user_name, u.role as user_role, d.name as dept_name,
           assigner.full_name as assigner_name
    FROM assigned_tasks t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN users assigner ON t.assigned_by = assigner.id
    WHERE 1=1
  `;
  const params = [];

  // Data isolation: Lọc theo thẩm quyền của người xem (hoặc các nhiệm vụ do chính người xem giao việc)
  if (accessibleUserIds !== null) {
    if (accessibleUserIds.length === 0) {
      return res.json([]);
    }
    const placeholders = accessibleUserIds.map(() => '?').join(',');
    query += ` AND (t.user_id IN (${placeholders}) OR t.assigned_by = ?)`;
    params.push(...accessibleUserIds, viewerId);
  }

  if (period_id) {
    query += ' AND t.period_id = ?';
    params.push(period_id);
  }
  if (user_id) {
    // If specific user is requested, ensure user is within accessible scope
    if (accessibleUserIds !== null && !accessibleUserIds.includes(user_id) && user_id !== viewerId) {
      return res.json([]);
    }
    query += ' AND t.user_id = ?';
    params.push(user_id);
  }
  if (assigned_by) {
    query += ' AND t.assigned_by = ?';
    params.push(assigned_by);
  }
  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }
  if (axis_code) {
    query += ' AND t.axis_code = ?';
    params.push(axis_code);
  }
  if (origin) {
    query += ' AND t.origin = ?';
    params.push(origin);
  }
  query += ' ORDER BY t.deadline ASC, t.created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// Helper: Check duplicate tasks for user(s) in a given period (Không cho phép giao trùng cùng 1 đầu việc)
function checkTaskDuplicates({ period_id, user_ids, standard_task_id, task_name }) {
  if (!period_id || !user_ids || user_ids.length === 0) return [];
  const normName = (task_name || '').trim().toLowerCase();
  if (!normName && !standard_task_id) return [];

  const placeholders = user_ids.map(() => '?').join(',');
  let query = `
    SELECT t.id, t.user_id, t.task_name, t.standard_task_id, t.status, u.full_name as user_name
    FROM assigned_tasks t
    JOIN users u ON t.user_id = u.id
    WHERE t.period_id = ?
      AND t.user_id IN (${placeholders})
      AND t.status NOT IN ('rejected', 'cancelled')
  `;
  const params = [period_id, ...user_ids];

  if (standard_task_id && normName) {
    query += ` AND (t.standard_task_id = ? OR LOWER(TRIM(t.task_name)) = ?)`;
    params.push(standard_task_id, normName);
  } else if (standard_task_id) {
    query += ` AND t.standard_task_id = ?`;
    params.push(standard_task_id);
  } else {
    query += ` AND LOWER(TRIM(t.task_name)) = ?`;
    params.push(normName);
  }

  return db.prepare(query).all(...params);
}

// API Kiểm tra trùng lặp nhiệm vụ trước khi giao việc
app.post('/api/assigned-tasks/check-duplicates', requireManagerOrAdmin, (req, res) => {
  try {
    const { period_id, user_ids, user_id, standard_task_id, task_name, task_ids, tasks } = req.body;
    let targetUserIds = [];
    if (Array.isArray(user_ids) && user_ids.length > 0) {
      targetUserIds = [...new Set(user_ids.filter(Boolean))];
    } else if (user_id) {
      targetUserIds = [user_id];
    }

    if (!period_id || targetUserIds.length === 0) {
      return res.json({ has_duplicates: false, duplicates: [] });
    }

    let tasksToCheck = [];
    if (Array.isArray(tasks) && tasks.length > 0) {
      tasksToCheck = tasks;
    } else if (Array.isArray(task_ids) && task_ids.length > 0) {
      const placeholders = task_ids.map(() => '?').join(',');
      tasksToCheck = db.prepare(`SELECT * FROM standard_tasks WHERE id IN (${placeholders})`).all(...task_ids);
    } else if (standard_task_id || task_name) {
      tasksToCheck = [{ id: standard_task_id, standard_task_id, task_name }];
    }

    const duplicates = [];
    for (const t of tasksToCheck) {
      const dups = checkTaskDuplicates({
        period_id,
        user_ids: targetUserIds,
        standard_task_id: t.standard_task_id || t.id,
        task_name: t.task_name
      });
      duplicates.push(...dups);
    }

    res.json({
      has_duplicates: duplicates.length > 0,
      duplicates
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CBQL Giao việc (hỗ trợ giao cho 1 hoặc nhiều người cùng thực hiện - Kiểm tra trùng lặp)
app.post('/api/assigned-tasks/assign', requireManagerOrAdmin, (req, res) => {
  const {
    period_id, user_id, user_ids, standard_task_id, task_name, output_result,
    deadline, task_type, standard_score, difficulty_weight, axis_code, assigned_by
  } = req.body;

  let targetUserIds = [];
  if (Array.isArray(user_ids) && user_ids.length > 0) {
    targetUserIds = [...new Set(user_ids.filter(Boolean))];
  } else if (user_id) {
    targetUserIds = [user_id];
  }

  if (targetUserIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 cán bộ/nhân viên nhận việc' });
  }

  // Guard: Phân quyền giao việc trong phạm vi quản lý
  const viewerId = getViewerId(req) || assigned_by;
  const accessibleUserIds = getAccessibleUserIds(viewerId);
  if (accessibleUserIds !== null) {
    const unauthorized = targetUserIds.filter(uid => !accessibleUserIds.includes(uid));
    if (unauthorized.length > 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Bạn không có quyền giao việc cho cán bộ/nhân viên ngoài thẩm quyền quản lý của đơn vị' 
      });
    }
  }

  // Kiểm tra trùng lặp: Không cho phép giao trùng cùng 1 đầu việc cho cấp dưới
  const duplicates = checkTaskDuplicates({
    period_id,
    user_ids: targetUserIds,
    standard_task_id,
    task_name
  });

  if (duplicates.length > 0) {
    if (targetUserIds.length === 1) {
      const dup = duplicates[0];
      return res.status(400).json({
        success: false,
        is_duplicate: true,
        message: `Không thể giao việc: Cán bộ "${dup.user_name}" đã được giao nhiệm vụ "${dup.task_name}" trong kỳ đánh giá này. Hệ thống không cho phép giao trùng!`,
        duplicates
      });
    } else {
      const dupNames = [...new Set(duplicates.map(d => d.user_name))].join(', ');
      return res.status(400).json({
        success: false,
        is_duplicate: true,
        message: `Không thể giao việc: Các cán bộ sau đã được giao nhiệm vụ này trong kỳ đánh giá: ${dupNames}. Vui lòng bỏ chọn những cán bộ đã có nhiệm vụ để tiếp tục.`,
        duplicates
      });
    }
  }

  const stdScore = parseFloat(standard_score) || (task_type === 'Đột xuất' ? 12 : 10);
  const diffWeight = parseFloat(difficulty_weight) || 1.0;
  const maxConv = Number((stdScore * diffWeight).toFixed(2));
  const groupId = targetUserIds.length > 1 ? uuidv4() : null;

  const insertStmt = db.prepare(`
    INSERT INTO assigned_tasks (
      id, period_id, user_id, standard_task_id, task_name, output_result,
      deadline, task_type, standard_score, difficulty_weight, max_converted_score,
      axis_code, origin, status, assigned_by, group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?)
  `);

  const createdIds = [];
  const runTransaction = db.transaction(() => {
    for (const uid of targetUserIds) {
      const id = uuidv4();
      const initialStatus = (uid === (assigned_by || viewerId)) ? 'in_progress' : 'pending_acceptance';
      insertStmt.run(
        id, period_id, uid, standard_task_id || null, task_name, output_result,
        deadline, task_type, stdScore, diffWeight, maxConv, axis_code, initialStatus, assigned_by, groupId
      );
      createdIds.push(id);
    }
  });

  runTransaction();

  const count = targetUserIds.length;
  res.json({
    success: true,
    ids: createdIds,
    count,
    message: count > 1 
      ? `Đã giao việc thành công cho ${count} cán bộ/nhân viên cùng thực hiện!`
      : 'Đã giao việc thành công cho cán bộ nhân viên!'
  });
});

// Bulk Assign multiple tasks to multiple users (Loại bỏ các lượt trùng lặp)
app.post('/api/assigned-tasks/bulk-assign', requireManagerOrAdmin, (req, res) => {
  const {
    period_id,
    task_ids,
    tasks,
    user_ids,
    deadline,
    assigned_by
  } = req.body;

  if (!period_id) {
    return res.status(400).json({ success: false, message: 'Thiếu kỳ đánh giá (period_id)' });
  }

  let targetUserIds = [];
  if (Array.isArray(user_ids) && user_ids.length > 0) {
    targetUserIds = [...new Set(user_ids.filter(Boolean))];
  }
  if (targetUserIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 cán bộ nhận nhiệm vụ' });
  }

  // Guard: Phân quyền giao việc
  const viewerId = getViewerId(req) || assigned_by;
  const accessibleUserIds = getAccessibleUserIds(viewerId);
  if (accessibleUserIds !== null) {
    const unauthorized = targetUserIds.filter(uid => !accessibleUserIds.includes(uid));
    if (unauthorized.length > 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Bạn không có quyền giao việc cho cán bộ ngoài thẩm quyền quản lý của đơn vị' 
      });
    }
  }

  // Resolve tasks
  let tasksToAssign = [];
  if (Array.isArray(tasks) && tasks.length > 0) {
    tasksToAssign = tasks;
  } else if (Array.isArray(task_ids) && task_ids.length > 0) {
    const placeholders = task_ids.map(() => '?').join(',');
    tasksToAssign = db.prepare(`SELECT * FROM standard_tasks WHERE id IN (${placeholders})`).all(...task_ids);
  }

  if (tasksToAssign.length === 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 nhiệm vụ để phân công' });
  }

  // Kiểm tra trùng lặp từng cặp (nhiệm vụ, cán bộ)
  const validAssignments = [];
  const duplicatePairs = [];

  for (const t of tasksToAssign) {
    const stdId = t.standard_task_id || t.id || null;
    const taskName = t.task_name;
    const dups = checkTaskDuplicates({
      period_id,
      user_ids: targetUserIds,
      standard_task_id: stdId,
      task_name: taskName
    });
    const dupUserIds = new Set(dups.map(d => d.user_id));

    for (const uid of targetUserIds) {
      if (dupUserIds.has(uid)) {
        const found = dups.find(d => d.user_id === uid);
        duplicatePairs.push({
          user_id: uid,
          user_name: found?.user_name || 'Cán bộ',
          task_name: taskName,
          standard_task_id: stdId
        });
      } else {
        validAssignments.push({ user_id: uid, task: t });
      }
    }
  }

  if (validAssignments.length === 0) {
    return res.status(400).json({
      success: false,
      is_duplicate: true,
      message: 'Tất cả các lượt phân công được chọn đều đã được giao trước đó cho các cán bộ này trong kỳ đánh giá. Hệ thống không cho phép giao trùng!',
      duplicate_pairs: duplicatePairs
    });
  }

  const insertStmt = db.prepare(`
    INSERT INTO assigned_tasks (
      id, period_id, user_id, standard_task_id, task_name, output_result,
      deadline, task_type, standard_score, difficulty_weight, max_converted_score,
      axis_code, origin, status, assigned_by, group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?)
  `);

  const createdIds = [];
  const runTransaction = db.transaction(() => {
    for (const item of validAssignments) {
      const t = item.task;
      const uid = item.user_id;
      const stdScore = parseFloat(t.standard_score) || (t.task_type === 'Đột xuất' ? 12 : 10);
      const diffWeight = parseFloat(t.difficulty_weight) || 1.0;
      const maxConv = Number((stdScore * diffWeight).toFixed(2));
      const taskDeadline = deadline || t.deadline || '2026-09-30';
      const groupId = targetUserIds.length > 1 ? uuidv4() : null;
      const id = uuidv4();
      const initialStatus = (uid === (assigned_by || viewerId)) ? 'in_progress' : 'pending_acceptance';

      insertStmt.run(
        id,
        period_id,
        uid,
        t.standard_task_id || t.id || null,
        t.task_name,
        t.output_result || 'Văn bản/ Tài liệu',
        taskDeadline,
        t.task_type || 'Thường xuyên',
        stdScore,
        diffWeight,
        maxConv,
        t.axis_code || 'TRUC_1',
        initialStatus,
        assigned_by || viewerId,
        groupId
      );
      createdIds.push(id);
    }
  });

  runTransaction();

  const dupSummary = duplicatePairs.length > 0
    ? ` Đã tự động loại bỏ ${duplicatePairs.length} lượt trùng lặp do cán bộ đã có nhiệm vụ này trong kỳ (${duplicatePairs.slice(0, 3).map(d => `${d.user_name} - ${d.task_name}`).join('; ')}${duplicatePairs.length > 3 ? '...' : ''}).`
    : '';

  res.json({
    success: true,
    created_ids: createdIds,
    tasks_count: tasksToAssign.length,
    users_count: targetUserIds.length,
    total_assignments: createdIds.length,
    skipped_duplicates_count: duplicatePairs.length,
    message: `Đã phân công thành công ${createdIds.length} lượt nhiệm vụ.${dupSummary}`
  });
});

// CBNV Tự đăng ký việc (Kiểm tra trùng lặp)
app.post('/api/assigned-tasks/register', (req, res) => {
  const {
    period_id, user_id, standard_task_id, task_name, output_result,
    deadline, task_type, standard_score, difficulty_weight, axis_code
  } = req.body;

  // Kiểm tra trùng lặp
  const duplicates = checkTaskDuplicates({
    period_id,
    user_ids: [user_id],
    standard_task_id,
    task_name
  });
  if (duplicates.length > 0) {
    return res.status(400).json({
      success: false,
      is_duplicate: true,
      message: `Bạn đã có nhiệm vụ "${duplicates[0].task_name}" trong kỳ đánh giá này rồi. Không thể đăng ký trùng lặp!`
    });
  }

  const id = uuidv4();
  const stdScore = parseFloat(standard_score) || (task_type === 'Đột xuất' ? 12 : 10);
  const diffWeight = parseFloat(difficulty_weight) || 1.0;
  const maxConv = Number((stdScore * diffWeight).toFixed(2));

  db.prepare(`
    INSERT INTO assigned_tasks (
      id, period_id, user_id, standard_task_id, task_name, output_result,
      deadline, task_type, standard_score, difficulty_weight, max_converted_score,
      axis_code, origin, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered', 'pending_approval')
  `).run(id, period_id, user_id, standard_task_id || null, task_name, output_result, deadline, task_type, stdScore, diffWeight, maxConv, axis_code);

  res.json({ success: true, id, message: 'Đã đăng ký công việc, chờ CBQL phê duyệt' });
});

// CBQL Phê duyệt/Từ chối việc tự đăng ký
app.put('/api/assigned-tasks/:id/approve', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const isApproved = req.body.is_approved !== undefined 
    ? !!req.body.is_approved 
    : (req.body.approved !== undefined ? !!req.body.approved : true);
  const { cbql_comment, difficulty_weight, add_to_standard_tasks } = req.body;

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ message: 'Không tìm thấy công việc' });

  const newStatus = isApproved ? 'in_progress' : 'rejected';
  const diffWeight = difficulty_weight ? parseFloat(difficulty_weight) : task.difficulty_weight;
  const maxConv = Number((task.standard_score * diffWeight).toFixed(2));

  let newStandardTaskId = task.standard_task_id;

  // Nếu phê duyệt và cho phép ghi vào danh mục chung
  if (isApproved && add_to_standard_tasks) {
    const stdId = uuidv4();
    const taskType = task.task_type || 'Thường xuyên';
    const stdScore = parseFloat(task.standard_score) || (taskType === 'Đột xuất' ? 12 : 10);
    const maxStdConv = Number((stdScore * diffWeight).toFixed(2));

    db.prepare(`
      INSERT INTO standard_tasks (
        id, period_id, dept_code, task_name, output_result, deadline,
        task_type, standard_score, difficulty_weight, max_converted_score,
        expected_evidence, note, axis_code, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Hoạt động')
    `).run(
      stdId,
      task.period_id,
      null,
      task.task_name,
      task.output_result,
      task.deadline,
      taskType,
      stdScore,
      diffWeight,
      maxStdConv,
      '',
      'Được bổ sung vào danh mục chung từ nhiệm vụ tự đăng ký đã được Lãnh đạo phê duyệt',
      task.axis_code || 'TRUC_1'
    );
    newStandardTaskId = stdId;
  }

  db.prepare(`
    UPDATE assigned_tasks 
    SET status = ?, 
        cbql_comment = ?, 
        difficulty_weight = ?, 
        max_converted_score = ?, 
        standard_task_id = COALESCE(?, standard_task_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newStatus, cbql_comment || null, diffWeight, maxConv, newStandardTaskId, id);

  res.json({ 
    success: true, 
    message: isApproved 
      ? (add_to_standard_tasks 
          ? 'Đã phê duyệt nhiệm vụ và ghi nhận vào Danh mục công việc chung thành công!' 
          : 'Đã phê duyệt nhiệm vụ thành công!') 
      : 'Đã từ chối nhiệm vụ',
    added_to_standard_tasks: !!add_to_standard_tasks
  });
});

// Lấy danh sách kết quả / tệp minh chứng từ cấp dưới cho cùng nhiệm vụ
app.get('/api/assigned-tasks/:id/subordinate-evidences', (req, res) => {
  try {
    const { id } = req.params;
    const currentTask = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
    if (!currentTask) return res.status(404).json({ message: 'Không tìm thấy công việc' });

    const accessibleUserIds = getAccessibleUserIds(currentTask.user_id);

    // Lấy các nhiệm vụ của người khác trong cùng kỳ đã có tệp minh chứng
    const candidates = db.prepare(`
      SELECT t.id as task_id, t.task_name, t.user_id, t.status, t.actual_finish_date,
             t.evidence_text, t.evidence_file_url, t.evidence_file_name,
             t.standard_score, t.converted_score, t.created_at, t.group_id, t.document_id,
             t.standard_task_id, t.assigned_by,
             u.full_name as user_name, u.role as user_role, u.gov_title as user_title,
             d.name as dept_name
      FROM assigned_tasks t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN departments d ON u.dept_id = d.id
      WHERE t.period_id = ?
        AND t.user_id != ?
        AND t.evidence_file_url IS NOT NULL 
        AND t.evidence_file_url != ''
      ORDER BY t.actual_finish_date DESC, t.updated_at DESC
    `).all(currentTask.period_id, currentTask.user_id);

    const normCurrentName = (currentTask.task_name || '').toLowerCase().trim();
    const results = [];

    for (const c of candidates) {
      let matchType = null;
      let matchPriority = 0;

      if (currentTask.group_id && c.group_id && currentTask.group_id === c.group_id) {
        matchType = 'Cùng nhóm giao việc';
        matchPriority = 1;
      } else if (currentTask.document_id && c.document_id && currentTask.document_id === c.document_id) {
        matchType = 'Cùng văn bản chỉ đạo';
        matchPriority = 2;
      } else if (currentTask.standard_task_id && c.standard_task_id && currentTask.standard_task_id === c.standard_task_id) {
        matchType = 'Cùng nhiệm vụ chuẩn';
        matchPriority = 3;
      } else if (c.task_name && c.task_name.toLowerCase().trim() === normCurrentName) {
        matchType = 'Cùng tên nhiệm vụ';
        matchPriority = 4;
      } else if (c.assigned_by === currentTask.user_id) {
        matchType = 'Nhiệm vụ do bạn giao cho cấp dưới';
        matchPriority = 5;
      } else if (normCurrentName.length > 5 && c.task_name && (c.task_name.toLowerCase().includes(normCurrentName) || normCurrentName.includes(c.task_name.toLowerCase()))) {
        matchType = 'Nhiệm vụ tương đồng nội dung';
        matchPriority = 6;
      } else if (accessibleUserIds !== null && accessibleUserIds.includes(c.user_id)) {
        matchType = 'Cán bộ trực thuộc cùng phòng/ban';
        matchPriority = 7;
      }

      if (matchType) {
        results.push({
          ...c,
          match_type: matchType,
          match_priority: matchPriority
        });
      }
    }

    results.sort((a, b) => a.match_priority - b.match_priority);
    res.json(results);
  } catch (err) {
    console.error('Error fetching subordinate evidences:', err);
    res.status(500).json({ error: 'Lỗi lấy kết quả từ cấp dưới: ' + err.message });
  }
});

// CBNV Cập nhật Kết quả & Minh chứng (Hỗ trợ nộp file mới hoặc kế thừa từ cấp dưới)
app.post('/api/assigned-tasks/:id/evidence', upload.single('evidence_file'), async (req, res) => {
  const { id } = req.params;
  const { 
    actual_finish_date, 
    evidence_text, 
    self_quality_pct, 
    is_bonus_proposed, 
    bonus_reason,
    existing_file_url,
    existing_file_name,
    inherited_from_task_id,
    inherited_from_user_name
  } = req.body;

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ message: 'Không tìm thấy công việc' });

  let fileUrl = task.evidence_file_url;
  let fileName = task.evidence_file_name;
  if (req.file) {
    const saved = await saveUploadedFile(req.file, 'evidence');
    if (saved) {
      if (task.evidence_file_url && task.evidence_file_url !== existing_file_url) {
        await deleteUploadedFile(task.evidence_file_url);
      }
      fileUrl = saved.file_url;
      fileName = saved.file_name;
    }
  } else if (existing_file_url) {
    fileUrl = existing_file_url;
    fileName = existing_file_name || fileName || 'Tep_minh_chung';
  }

  // Calculate progress % based on finish date vs deadline
  const finishDate = actual_finish_date || new Date().toISOString().split('T')[0];
  const progressPct = calculateProgressPct(task.deadline, finishDate);
  const qualityPct = parseFloat(self_quality_pct) !== undefined ? parseFloat(self_quality_pct) : 1.0;
  const proposeBonus = is_bonus_proposed === 'true' || is_bonus_proposed === true || is_bonus_proposed === 1 ? 1 : 0;

  const scores = calculateScores(task.standard_score, task.difficulty_weight, progressPct, qualityPct, false);

  db.prepare(`
    UPDATE assigned_tasks
    SET actual_finish_date = ?, evidence_text = ?, evidence_file_url = ?, evidence_file_name = ?,
        progress_pct = ?, quality_pct = ?, execution_score = ?, converted_score = ?,
        is_bonus_proposed = ?, bonus_reason = ?,
        inherited_from_task_id = ?, inherited_from_user_name = ?,
        status = 'submitted', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    finishDate, evidence_text || '', fileUrl, fileName,
    progressPct, qualityPct, scores.executionScore, scores.convertedScore,
    proposeBonus, bonus_reason || '',
    inherited_from_task_id || null, inherited_from_user_name || null, id
  );

  res.json({ success: true, message: 'Đã nộp minh chứng thành công, chờ CBQL chấm điểm', ...scores, progressPct });
});

// CBQL Chấm điểm công việc (Grade / Approve Result)
app.put('/api/assigned-tasks/:id/grade', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { quality_pct, progress_pct, difficulty_weight, cbql_comment, is_bonus_approved } = req.body;

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ message: 'Không tìm thấy công việc' });

  // Guard: Tuyệt đối không được trực tiếp tự chấm điểm nhiệm vụ của bản thân
  const viewerId = getViewerId(req);
  if (viewerId && task.user_id === viewerId) {
    return res.status(403).json({
      success: false,
      message: 'Theo quy định, cán bộ quản lý không được trực tiếp tự chấm điểm nhiệm vụ của chính bản thân mình.'
    });
  }

  // Guard: Kiểm tra thẩm quyền chấm điểm cán bộ
  const accessibleUserIds = getAccessibleUserIds(viewerId);
  if (accessibleUserIds !== null && !accessibleUserIds.includes(task.user_id)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Bạn không có thẩm quyền chấm điểm/thẩm định công việc của cán bộ ngoài phạm vi quản lý' 
    });
  }

  // Guard: Kiểm tra kỳ đánh giá có bị chốt hoặc quá hạn khóa chấm điểm không
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(task.period_id);
  const viewer = viewerId ? db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) : null;
  const isAdmin = viewer?.role === 'admin';

  if (period?.is_locked === 1 && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: `Kỳ đánh giá "${period.name}" đã được Chốt KPI và khóa sổ toàn cơ quan. Không thể sửa đổi điểm!`
    });
  }

  if (period?.grading_lock_date && !isAdmin) {
    const todayStr = new Date().toISOString().split('T')[0];
    if (todayStr > period.grading_lock_date) {
      return res.status(403).json({
        success: false,
        message: `Đã quá thời điểm khóa chấm điểm KPI (${formatDateVN(period.grading_lock_date)}). Hệ thống đã tự động khóa quyền chấm điểm!`
      });
    }
  }

  const qPct = quality_pct !== undefined ? parseFloat(quality_pct) : task.quality_pct;
  const progPct = progress_pct !== undefined ? parseFloat(progress_pct) : task.progress_pct;
  const diffWeight = difficulty_weight !== undefined ? parseFloat(difficulty_weight) : (task.difficulty_weight || 1.0);
  const approveBonus = Boolean(is_bonus_approved);

  const scores = calculateScores(task.standard_score, diffWeight, progPct, qPct, approveBonus);

  db.prepare(`
    UPDATE assigned_tasks
    SET quality_pct = ?, progress_pct = ?, difficulty_weight = ?,
        execution_score = ?, converted_score = ?, bonus_score = ?,
        cbql_comment = ?, status = 'approved', is_returned = 0, return_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(qPct, progPct, diffWeight, scores.executionScore, scores.convertedScore, scores.bonusScore, cbql_comment || '', id);

  res.json({ success: true, message: 'Đã chấm điểm công việc thành công', ...scores });
});

// CBQL Trả về công việc yêu cầu cán bộ làm lại / nộp lại minh chứng
app.post('/api/assigned-tasks/:id/return', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { return_reason } = req.body;

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ message: 'Không tìm thấy công việc' });

  // Guard: Kiểm tra thẩm quyền
  const viewerId = getViewerId(req);
  const accessibleUserIds = getAccessibleUserIds(viewerId);
  if (accessibleUserIds !== null && !accessibleUserIds.includes(task.user_id)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Bạn không có thẩm quyền trả về công việc của cán bộ ngoài phạm vi quản lý' 
    });
  }

  const viewer = viewerId ? db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) : null;
  const returnerName = viewer?.full_name || 'Lãnh đạo đơn vị';
  const reasonText = return_reason ? String(return_reason).trim() : 'Yêu cầu rà soát, bổ sung và hoàn thiện lại minh chứng công việc.';

  db.prepare(`
    UPDATE assigned_tasks
    SET status = 'in_progress',
        is_returned = 1,
        return_reason = ?,
        cbql_comment = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reasonText, `[Trả về bởi ${returnerName}]: ${reasonText}`, id);

  res.json({ 
    success: true, 
    message: `Đã trả về công việc "${task.task_name}" yêu cầu cán bộ nộp lại minh chứng!` 
  });
});

// Cán bộ Xác nhận tiếp nhận nhiệm vụ (Bước 1 - Nhánh 2 theo tài liệu V6)
app.put('/api/assigned-tasks/:id/accept', (req, res) => {
  const { id } = req.params;
  const viewerId = getViewerId(req);
  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

  if (viewerId && task.user_id !== viewerId) {
    const viewer = db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId);
    if (viewer?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xác nhận nhiệm vụ của cán bộ khác' });
    }
  }

  db.prepare(`
    UPDATE assigned_tasks 
    SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(id);

  res.json({ success: true, message: 'Đã xác nhận tiếp nhận nhiệm vụ thành công!' });
});

// Cán bộ Phản hồi công việc chưa hợp lý (Bước 1 - Nhánh 2 theo tài liệu V6)
app.put('/api/assigned-tasks/:id/feedback', (req, res) => {
  const { id } = req.params;
  const { feedback_reason } = req.body;
  const viewerId = getViewerId(req);

  if (!feedback_reason || !feedback_reason.trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập lý do phản hồi công việc' });
  }

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

  if (viewerId && task.user_id !== viewerId) {
    const viewer = db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId);
    if (viewer?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền phản hồi nhiệm vụ của cán bộ khác' });
    }
  }

  // Ràng buộc quy định tài liệu V6: Mỗi nhiệm vụ cán bộ chỉ được phản hồi tối đa 1 lần
  const currentFeedbackCount = task.feedback_count || 0;
  if (currentFeedbackCount >= 1) {
    return res.status(400).json({ 
      success: false, 
      message: 'Theo quy định Hướng dẫn V6, mỗi nhiệm vụ cán bộ chỉ được phản hồi tối đa 1 lần!' 
    });
  }

  db.prepare(`
    UPDATE assigned_tasks 
    SET status = 'feedback_submitted', 
        feedback_reason = ?, 
        feedback_count = COALESCE(feedback_count, 0) + 1,
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(feedback_reason.trim(), id);

  res.json({ success: true, message: 'Đã gửi phản hồi về công việc cho Lãnh đạo xem xét thành công!' });
});

// Lãnh đạo Giao lại nhiệm vụ sau khi cấp dưới phản hồi (Bước 1 - Nhánh 2 theo tài liệu V6)
app.put('/api/assigned-tasks/:id/reassign', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { deadline, task_name, output_result, standard_score, difficulty_weight } = req.body;

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

  // Theo tài liệu V6: Khi lãnh đạo giao lại thì nhiệm vụ tự chuyển vào "Đã xác nhận" (in_progress) của cán bộ
  const stdScore = standard_score ? parseFloat(standard_score) : task.standard_score;
  const diffWeight = difficulty_weight ? parseFloat(difficulty_weight) : task.difficulty_weight;
  const maxConv = Number((stdScore * diffWeight).toFixed(2));

  db.prepare(`
    UPDATE assigned_tasks 
    SET status = 'in_progress',
        task_name = COALESCE(?, task_name),
        deadline = COALESCE(?, deadline),
        output_result = COALESCE(?, output_result),
        standard_score = ?,
        difficulty_weight = ?,
        max_converted_score = ?,
        reassigned_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    task_name ? task_name.trim() : null,
    deadline || null,
    output_result || null,
    stdScore,
    diffWeight,
    maxConv,
    id
  );

  res.json({ 
    success: true, 
    message: 'Đã điều chỉnh và giao lại nhiệm vụ thành công. Nhiệm vụ đã được chuyển vào danh sách thực hiện của cán bộ!' 
  });
});

// Cán bộ Phản hồi đánh giá nhiệm vụ cuối kỳ (Bước 4 theo tài liệu V6)
app.put('/api/assigned-tasks/:id/evaluation-feedback', (req, res) => {
  const { id } = req.params;
  const { evaluation_feedback } = req.body;
  const viewerId = getViewerId(req);

  if (!evaluation_feedback || !evaluation_feedback.trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung phản hồi đánh giá' });
  }

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

  if (viewerId && task.user_id !== viewerId) {
    const viewer = db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId);
    if (viewer?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền phản hồi đánh giá của cán bộ khác' });
    }
  }

  db.prepare(`
    UPDATE assigned_tasks 
    SET evaluation_feedback = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(evaluation_feedback.trim(), id);

  res.json({ success: true, message: 'Đã gửi phản hồi về mức đánh giá của Lãnh đạo thành công!' });
});

// -------------------------------------------------------------
// 4. KPI Evaluations & Common Criteria (Quy trình 6 bước HD.06)
// -------------------------------------------------------------
app.get('/api/evaluations', (req, res) => {
  const { period_id, user_id } = req.query;
  if (!period_id || !user_id) return res.status(400).json({ message: 'Thiếu period_id hoặc user_id' });

  const targetUser = db.prepare(`
    SELECT u.*, d.name as dept_name, d.parent_agency, d.location_name
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.id
    WHERE u.id = ?
  `).get(user_id);
  if (!targetUser) return res.status(404).json({ message: 'Không tìm thấy thông tin cán bộ' });

  // Get or initialize evaluation record
  let evaluation = db.prepare('SELECT * FROM evaluations WHERE period_id = ? AND user_id = ?').get(period_id, user_id);
  if (!evaluation) {
    const evalId = uuidv4();
    db.prepare(`
      INSERT INTO evaluations (id, period_id, user_id, part1_score, part2_score, bonus_score, total_score, rank_proposed, status, step)
      VALUES (?, ?, ?, 30, 0, 0, 30, 'Hoàn thành tốt nhiệm vụ', 'draft', 'step_1_register')
    `).run(evalId, period_id, user_id);
    evaluation = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId);
  }

  // Common Criteria tailored to role (Mẫu 01-A for CBQL vs Mẫu 01-B for CBNV)
  const roleFilter = targetUser.role === 'cbql' ? "('all', 'cbql')" : "('all', 'cbnv')";
  const criteria = db.prepare(`
    SELECT c.*, COALESCE(d.is_satisfied, 1) as is_satisfied, COALESCE(d.score, c.max_score) as score, d.note
    FROM common_criteria c
    LEFT JOIN evaluation_criteria_details d ON c.id = d.criteria_id AND d.evaluation_id = ?
    WHERE c.target_role IN ${roleFilter}
    ORDER BY c.group_no ASC, c.code ASC
  `).all(evaluation.id);

  // Axes & Tasks Breakdown
  const axes = db.prepare('SELECT * FROM axes ORDER BY code ASC').all();
  const allUserTasks = db.prepare(`
    SELECT * FROM assigned_tasks 
    WHERE period_id = ? AND user_id = ? AND status != 'rejected'
  `).all(period_id, user_id);

  const approvedTasks = allUserTasks.filter(t => t.status === 'approved');

  // Value A (Kế hoạch đầu kỳ): Tổng điểm quy đổi tối đa của danh mục công việc
  let planTotalMaxScore = 0;
  allUserTasks.forEach(t => {
    planTotalMaxScore += Number((t.max_converted_score || (t.standard_score * t.difficulty_weight)).toFixed(2));
  });
  planTotalMaxScore = Number(planTotalMaxScore.toFixed(2));

  // Value B (Thực tế hoàn thành): Tổng điểm quy đổi thực tế của các công việc đã được thẩm định
  let executedTotalConvScore = 0;
  let totalBonusScore = 0;
  let aheadOrOverCount = 0;

  approvedTasks.forEach(t => {
    executedTotalConvScore += Number((t.converted_score || 0).toFixed(2));
    totalBonusScore += Number((t.bonus_score || 0).toFixed(2));
    if ((t.progress_pct === 1.0 && t.actual_finish_date && t.actual_finish_date < t.deadline) || t.bonus_score > 0) {
      aheadOrOverCount++;
    }
  });
  executedTotalConvScore = Number(executedTotalConvScore.toFixed(2));
  totalBonusScore = Number(totalBonusScore.toFixed(2));

  // KPI Phần B (tối đa 70 điểm theo công thức HD.06: KPI = 70 * B / A)
  let part2Score = 0;
  if (planTotalMaxScore > 0) {
    part2Score = Number(Math.min(70, (executedTotalConvScore / planTotalMaxScore) * 70).toFixed(2));
  } else if (allUserTasks.length === 0) {
    part2Score = 70;
  }

  // Bonus score: tối đa 7 điểm (10% của 70 điểm)
  const cappedBonusScore = Number(Math.min(7, totalBonusScore).toFixed(2));

  // Sum Part 1 (30 pts criteria)
  let part1Score = 0;
  criteria.forEach(c => {
    part1Score += (c.is_satisfied === 1 ? c.max_score : 0);
  });

  // Grand Total (thang 100, tối đa 100 điểm)
  const grandTotal = Number(Math.min(100, part1Score + part2Score + cappedBonusScore).toFixed(2));

  // Over target percentage
  const totalTasksCount = allUserTasks.length;
  const aheadSchedulePct = totalTasksCount > 0 ? (aheadOrOverCount / totalTasksCount) : 0;
  const allTasksCompleted = totalTasksCount > 0 && approvedTasks.length === totalTasksCount;

  // Auto Rank (4 mức theo Hướng dẫn số 06-HD/BTCTU)
  let autoRank = 'Hoàn thành nhiệm vụ';
  if (grandTotal >= 90 && allTasksCompleted && aheadSchedulePct >= 0.30) {
    autoRank = 'Hoàn thành xuất sắc nhiệm vụ';
  } else if (grandTotal >= 70) {
    autoRank = 'Hoàn thành tốt nhiệm vụ';
  } else if (grandTotal >= 50) {
    autoRank = 'Hoàn thành nhiệm vụ';
  } else {
    autoRank = 'Không hoàn thành nhiệm vụ';
  }

  // Compute evaluation flow step if still default
  let currentStep = evaluation.step || 'step_1_register';
  if (currentStep === 'step_1_register' && allUserTasks.length > 0) {
    const hasSubmitted = allUserTasks.some(t => t.status === 'submitted' || t.status === 'approved');
    if (hasSubmitted) currentStep = 'step_2_evidence';
  }
  if (currentStep === 'step_2_evidence' && approvedTasks.length === allUserTasks.length && allUserTasks.length > 0) {
    currentStep = 'step_3_leader_eval_tasks';
  }

  // Axes summary for breakdown display
  const axesSummary = axes.map((ax) => {
    const axTasks = approvedTasks.filter(t => t.axis_code === ax.code);
    let sumStd = 0;
    let sumConv = 0;
    axTasks.forEach(t => {
      sumStd += t.standard_score || 0;
      sumConv += t.converted_score || 0;
    });
    const kpiRatio = sumStd > 0 ? Math.min(1.0, sumConv / sumStd) : 1.0;
    const axScore = Number((ax.max_score * kpiRatio).toFixed(2));
    return {
      axis_code: ax.code,
      axis_name: ax.name,
      max_score: ax.max_score,
      sum_standard_score: sumStd,
      sum_converted_score: Number(sumConv.toFixed(2)),
      kpi_pct: Number(kpiRatio.toFixed(4)),
      axis_score: axScore,
      tasks_count: axTasks.length
    };
  });

  // Update evaluation record with accurate calculations
  db.prepare(`
    UPDATE evaluations
    SET part1_score = ?, part2_score = ?, bonus_score = ?, total_score = ?,
        plan_total_max_score = ?, executed_total_conv_score = ?,
        rank_proposed = ?, step = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    part1Score, part2Score, cappedBonusScore, grandTotal,
    planTotalMaxScore, executedTotalConvScore,
    autoRank, currentStep, evaluation.id
  );

  res.json({
    user: targetUser,
    evaluation: {
      ...evaluation,
      part1_score: part1Score,
      part2_score: part2Score,
      bonus_score: cappedBonusScore,
      total_score: grandTotal,
      plan_total_max_score: planTotalMaxScore,
      executed_total_conv_score: executedTotalConvScore,
      rank_proposed: autoRank,
      step: currentStep
    },
    criteria,
    axesSummary,
    stats: {
      totalTasksCount,
      approvedTasksCount: approvedTasks.length,
      aheadScheduleCount: aheadOrOverCount,
      aheadSchedulePct: Number((aheadSchedulePct * 100).toFixed(1)),
      planTotalMaxScore: Number(planTotalMaxScore.toFixed(2)),
      executedTotalConvScore: Number(executedTotalConvScore.toFixed(2)),
      bonusScore: cappedBonusScore
    }
  });
});

// Transition workflow step
app.post('/api/evaluations/step', (req, res) => {
  const { evaluation_id, next_step } = req.body;
  if (!evaluation_id || !next_step) return res.status(400).json({ message: 'Thiếu evaluation_id hoặc next_step' });
  db.prepare('UPDATE evaluations SET step = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(next_step, evaluation_id);
  res.json({ success: true, step: next_step });
});

// Save Part 1 (30 pts) Criteria
app.post('/api/evaluations/part1', (req, res) => {
  const { evaluation_id, items } = req.body;
  if (!evaluation_id || !Array.isArray(items)) {
    return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
  }

  const deleteExisting = db.prepare('DELETE FROM evaluation_criteria_details WHERE evaluation_id = ?');
  const insertDetail = db.prepare(`
    INSERT INTO evaluation_criteria_details (id, evaluation_id, criteria_id, is_satisfied, score, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const runTransaction = db.transaction(() => {
    deleteExisting.run(evaluation_id);
    let totalPart1 = 0;
    for (const it of items) {
      const id = uuidv4();
      const score = it.is_satisfied ? it.max_score : 0;
      totalPart1 += score;
      insertDetail.run(id, evaluation_id, it.criteria_id, it.is_satisfied ? 1 : 0, score, it.note || '');
    }
    db.prepare('UPDATE evaluations SET part1_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(totalPart1, evaluation_id);
    return totalPart1;
  });

  const part1Score = runTransaction();
  res.json({ success: true, part1Score });
});

// Submit Self-Evaluation (CBNV nộp tự đánh giá -> chuyển sang bước CBQL chấm)
app.post('/api/evaluations/submit', (req, res) => {
  const { evaluation_id } = req.body;
  if (!evaluation_id) return res.status(400).json({ success: false, message: 'Thiếu evaluation_id' });

  const evalRec = db.prepare('SELECT e.*, p.is_locked, p.name as period_name FROM evaluations e LEFT JOIN periods p ON e.period_id = p.id WHERE e.id = ?').get(evaluation_id);
  if (!evalRec) return res.status(404).json({ success: false, message: 'Không tìm thấy bản tự đánh giá' });

  if (evalRec.is_locked === 1) {
    return res.status(403).json({ success: false, message: `Kỳ đánh giá "${evalRec.period_name}" đã Chốt KPI. Không thể nộp sửa đổi!` });
  }

  db.prepare(`
    UPDATE evaluations
    SET status = 'submitted',
        step = 'step_4_grading',
        submitted_at = CURRENT_TIMESTAMP,
        return_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(evaluation_id);

  res.json({ success: true, message: 'Đã nộp bản tự đánh giá thành công! Hồ sơ đã được chuyển cho Cán bộ Quản lý/Lãnh đạo thẩm định.' });
});

// Return Self-Evaluation (Lãnh đạo trả về yêu cầu cán bộ tự đánh giá lại)
app.post('/api/evaluations/return', requireManagerOrAdmin, (req, res) => {
  const { evaluation_id, return_reason } = req.body;
  if (!evaluation_id) return res.status(400).json({ success: false, message: 'Thiếu evaluation_id' });

  const evalRec = db.prepare('SELECT e.*, p.is_locked, p.name as period_name FROM evaluations e LEFT JOIN periods p ON e.period_id = p.id WHERE e.id = ?').get(evaluation_id);
  if (!evalRec) return res.status(404).json({ success: false, message: 'Không tìm thấy bản tự đánh giá' });

  const viewerId = getViewerId(req);
  const viewer = viewerId ? db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) : null;
  const returnerName = viewer?.full_name || 'Lãnh đạo đơn vị';
  const reasonText = return_reason ? String(return_reason).trim() : 'Yêu cầu rà soát, tự đánh giá lại các tiêu chí chưa đạt hoặc chưa đủ minh chứng.';

  // Guard: Không tự trả về bản đánh giá của chính mình
  if (viewerId && evalRec.user_id === viewerId) {
    return res.status(403).json({
      success: false,
      message: 'Không thể trả về bản tự đánh giá của chính bản thân mình.'
    });
  }

  db.prepare(`
    UPDATE evaluations
    SET status = 'returned',
        step = 'step_3_self_eval',
        return_reason = ?,
        returned_at = CURRENT_TIMESTAMP,
        returned_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(reasonText, returnerName, evaluation_id);

  res.json({ success: true, message: 'Đã trả về bản tự đánh giá yêu cầu cán bộ thực hiện lại thành công!' });
});

// Conclude / Superior remarks
app.post('/api/evaluations/conclude', requireManagerOrAdmin, (req, res) => {
  const { evaluation_id, superior_rank, superior_comment, status } = req.body;

  const evalRec = db.prepare('SELECT e.*, p.is_locked, p.grading_lock_date, p.name as period_name FROM evaluations e LEFT JOIN periods p ON e.period_id = p.id WHERE e.id = ?').get(evaluation_id);
  if (!evalRec) return res.status(404).json({ success: false, message: 'Không tìm thấy bản đánh giá' });

  const viewerId = getViewerId(req);
  const viewer = viewerId ? db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) : null;
  const isAdmin = viewer?.role === 'admin';

  // Guard: Tuyệt đối không được trực tiếp tự kết luận mức xếp loại cho bản thân
  if (viewerId && evalRec.user_id === viewerId) {
    return res.status(403).json({
      success: false,
      message: 'Theo quy định, cán bộ quản lý không được tự kết luận mức xếp loại cho chính bản thân mình. Hồ sơ của bạn phải do cấp trên trực tiếp hoặc lãnh đạo cơ quan đánh giá.'
    });
  }

  if (evalRec.is_locked === 1 && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: `Kỳ đánh giá "${evalRec.period_name}" đã được Chốt KPI toàn đơn vị. Không thể chỉnh sửa kết luận!`
    });
  }

  if (evalRec.grading_lock_date && !isAdmin) {
    const todayStr = new Date().toISOString().split('T')[0];
    if (todayStr > evalRec.grading_lock_date) {
      return res.status(403).json({
        success: false,
        message: `Đã quá thời điểm khóa chấm điểm KPI (${formatDateVN(evalRec.grading_lock_date)}). Hệ thống đã tự động khóa quyền kết luận xếp loại!`
      });
    }
  }

  db.prepare(`
    UPDATE evaluations
    SET superior_rank = ?, superior_comment = ?, status = ?, step = 'step_5_voting', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(superior_rank, superior_comment, status || 'approved', evaluation_id);

  res.json({ success: true, message: 'Đã lưu kết luận đánh giá của cấp có thẩm quyền thành công!' });
});

// Báo cáo Mẫu 02 (Toàn cơ quan / đơn vị theo HD.06)
app.get('/api/reports/mau-02', (req, res) => {
  const { period_id } = req.query;
  const pId = period_id || 'p-1';
  const viewerId = getViewerId(req);
  const accessibleUserIds = getAccessibleUserIds(viewerId);

  let query = `
    SELECT u.id as user_id, u.full_name, u.role, u.target_role, u.party_title, u.gov_title, u.dept_id, d.name as dept_name,
           e.id as evaluation_id, e.step, e.part1_score, e.part2_score, e.bonus_score, e.total_score,
           e.rank_proposed, e.superior_rank, e.summary_reason, e.cadre_proposal_note, e.superior_comment,
           (SELECT COUNT(*) FROM assigned_tasks t WHERE t.user_id = u.id AND t.period_id = ? AND t.status != 'rejected') as total_tasks,
           (SELECT COUNT(*) FROM assigned_tasks t WHERE t.user_id = u.id AND t.period_id = ? AND t.status = 'approved') as approved_tasks,
           (SELECT COUNT(*) FROM assigned_tasks t WHERE t.user_id = u.id AND t.period_id = ? AND t.status = 'approved' AND ((t.progress_pct = 1.0 AND t.actual_finish_date < t.deadline) OR t.bonus_score > 0)) as ahead_tasks
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN evaluations e ON e.user_id = u.id AND e.period_id = ?
    WHERE (u.is_active IS NULL OR u.is_active = 1)
  `;
  const params = [pId, pId, pId, pId];

  // Data isolation: Lọc danh sách cán bộ theo thẩm quyền của người xem
  if (accessibleUserIds !== null) {
    if (accessibleUserIds.length === 0) return res.json([]);
    const placeholders = accessibleUserIds.map(() => '?').join(',');
    query += ` AND u.id IN (${placeholders})`;
    params.push(...accessibleUserIds);
  }

  query += ` ORDER BY d.name ASC, u.role DESC, u.full_name ASC`;
  const list = db.prepare(query).all(...params);
  res.json(list);
});

// Lưu tóm tắt căn cứ lý do & đề xuất cán bộ cho Mẫu 02
app.post('/api/reports/mau-02/save', (req, res) => {
  const { evaluation_id, user_id, period_id, superior_rank, summary_reason, cadre_proposal_note } = req.body;
  
  let evalId = evaluation_id;
  if (!evalId && user_id && period_id) {
    let evalRec = db.prepare('SELECT id FROM evaluations WHERE period_id = ? AND user_id = ?').get(period_id, user_id);
    if (evalRec) {
      evalId = evalRec.id;
    } else {
      evalId = uuidv4();
      db.prepare(`
        INSERT INTO evaluations (id, period_id, user_id, part1_score, part2_score, bonus_score, total_score, rank_proposed, superior_rank, summary_reason, cadre_proposal_note, status)
        VALUES (?, ?, ?, 30, 0, 0, 30, 'Chưa tự đánh giá', ?, ?, ?, 'draft')
      `).run(evalId, period_id, user_id, superior_rank || 'Hoàn thành tốt nhiệm vụ', summary_reason || '', cadre_proposal_note || '');
      return res.json({ success: true, message: 'Đã lưu thông tin Báo cáo Mẫu 02 thành công' });
    }
  }

  if (!evalId) return res.status(400).json({ message: 'Thiếu evaluation_id hoặc user_id và period_id' });

  db.prepare(`
    UPDATE evaluations
    SET superior_rank = COALESCE(?, superior_rank),
        summary_reason = ?,
        cadre_proposal_note = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(superior_rank, summary_reason || '', cadre_proposal_note || '', evalId);

  res.json({ success: true, message: 'Đã lưu thông tin Báo cáo Mẫu 02 thành công' });
});

// -------------------------------------------------------------
// 5. Export Excel Report (Mẫu 01-A, Mẫu 01-B, Mẫu 02 theo HD.06)
// -------------------------------------------------------------
app.get('/api/reports/export-cbql', async (req, res) => {
  try {
    const { period_id, user_id } = req.query;
    if (!period_id || !user_id) {
      return res.status(400).send('Thiếu tham số period_id hoặc user_id');
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    const isCbnv = user && ((user.target_role === 'cbnv') || (user.role === 'cbnv' && user.target_role !== 'cbql'));
    const prefix = isCbnv ? 'Mau_01B_CBNV' : 'Mau_01A_CBQL';

    const workbook = await exportCBQLWorkbook(period_id, user_id);

    const safeName = user ? encodeURIComponent(user.full_name.replace(/\s+/g, '_')) : user_id;
    const filename = `${prefix}_${period_id}_${safeName}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).send(`Lỗi xuất báo cáo Excel: ${error.message}`);
  }
});

// Export Mẫu 02 (Toàn cơ quan / đơn vị)
app.get('/api/reports/export-mau-02', async (req, res) => {
  try {
    const { period_id } = req.query;
    const pId = period_id || 'p-1';

    const workbook = await exportMau02Workbook(pId);

    const filename = `Mau_02_Tong_hop_xep_loai_${pId}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export Mau 02 error:', error);
    res.status(500).send(`Lỗi xuất báo cáo Mẫu 02 Excel: ${error.message}`);
  }
});

// -------------------------------------------------------------
// 6. Overall Dashboard Stats
// -------------------------------------------------------------
app.get('/api/stats/dashboard', (req, res) => {
  const { period_id } = req.query;
  const pId = period_id || 'p-1';
  const viewerId = getViewerId(req);
  const accessibleUserIds = getAccessibleUserIds(viewerId);

  let userFilterClause = '';
  let paramsTasks = [pId];
  let paramsEvals = [pId];

  if (accessibleUserIds !== null) {
    if (accessibleUserIds.length === 0) {
      return res.json({
        totalTasks: 0,
        approvedTasks: 0,
        submittedTasks: 0,
        inProgressTasks: 0,
        pendingTasks: 0,
        avgScores: { avg_total: 0, avg_p1: 0, avg_p2: 0 }
      });
    }
    const placeholders = accessibleUserIds.map(() => '?').join(',');
    userFilterClause = ` AND user_id IN (${placeholders})`;
    paramsTasks.push(...accessibleUserIds);
    paramsEvals.push(...accessibleUserIds);
  }

  const totalTasks = db.prepare(`SELECT COUNT(*) as count FROM assigned_tasks WHERE period_id = ? ${userFilterClause}`).get(...paramsTasks).count;
  const approvedTasks = db.prepare(`SELECT COUNT(*) as count FROM assigned_tasks WHERE period_id = ? AND status = 'approved' ${userFilterClause}`).get(...paramsTasks).count;
  const submittedTasks = db.prepare(`SELECT COUNT(*) as count FROM assigned_tasks WHERE period_id = ? AND status = 'submitted' ${userFilterClause}`).get(...paramsTasks).count;
  const inProgressTasks = db.prepare(`SELECT COUNT(*) as count FROM assigned_tasks WHERE period_id = ? AND status = 'in_progress' ${userFilterClause}`).get(...paramsTasks).count;
  const pendingTasks = db.prepare(`SELECT COUNT(*) as count FROM assigned_tasks WHERE period_id = ? AND status = 'pending_approval' ${userFilterClause}`).get(...paramsTasks).count;

  // Average KPI score of users
  const avgScores = db.prepare(`
    SELECT AVG(total_score) as avg_total, AVG(part1_score) as avg_p1, AVG(part2_score) as avg_p2
    FROM evaluations WHERE period_id = ? ${userFilterClause}
  `).get(...paramsEvals);

  res.json({
    totalTasks,
    approvedTasks,
    submittedTasks,
    inProgressTasks,
    pendingTasks,
    avgScores: {
      avg_total: avgScores?.avg_total ? Number(avgScores.avg_total.toFixed(2)) : 0,
      avg_p1: avgScores?.avg_p1 ? Number(avgScores.avg_p1.toFixed(2)) : 0,
      avg_p2: avgScores?.avg_p2 ? Number(avgScores.avg_p2.toFixed(2)) : 0
    }
  });
});

// -------------------------------------------------------------
// BƯỚC 6: CƠ QUAN THAM MƯU TỔNG HỢP & TRÌNH BIỂU QUYẾT (Theo tài liệu V6)
// -------------------------------------------------------------
// 1. Lấy danh sách tổng hợp tham mưu
app.get('/api/advisory-summary', (req, res) => {
  const { period_id } = req.query;
  const pId = period_id || 'p-1';
  const viewerId = getViewerId(req);
  const accessibleUserIds = getAccessibleUserIds(viewerId);

  let userClause = '';
  const params = [pId, pId, pId];
  if (accessibleUserIds !== null) {
    if (accessibleUserIds.length === 0) return res.json([]);
    const placeholders = accessibleUserIds.map(() => '?').join(',');
    userClause = ` AND u.id IN (${placeholders})`;
    params.push(...accessibleUserIds);
  }

  const list = db.prepare(`
    SELECT u.id as user_id, u.full_name, u.role, u.target_role, u.party_title, u.gov_title, u.dept_id, d.name as dept_name,
           e.id as evaluation_id, e.step, e.part1_score, e.part2_score, e.bonus_score, e.total_score,
           e.rank_proposed, e.superior_rank, e.superior_comment, e.status as eval_status,
           e.advisory_rank, e.advisory_comment, e.is_advisory_submitted, e.advisory_submitted_at,
           adv_user.full_name as advisory_by_name,
           (SELECT COUNT(*) FROM assigned_tasks t WHERE t.user_id = u.id AND t.period_id = ? AND t.status != 'rejected') as total_tasks,
           (SELECT COUNT(*) FROM assigned_tasks t WHERE t.user_id = u.id AND t.period_id = ? AND t.evaluation_feedback IS NOT NULL AND t.evaluation_feedback != '') as task_feedback_count
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN evaluations e ON e.user_id = u.id AND e.period_id = ?
    LEFT JOIN users adv_user ON e.advisory_by = adv_user.id
    WHERE (u.is_active IS NULL OR u.is_active = 1) ${userClause}
    ORDER BY d.name ASC, u.full_name ASC
  `).all(...params);

  res.json(list);
});

// 2. Lưu ý kiến & đề xuất của Cơ quan tham mưu
app.put('/api/advisory-summary/save', (req, res) => {
  const { evaluation_id, user_id, period_id, advisory_rank, advisory_comment } = req.body;
  const viewerId = getViewerId(req);

  let evalId = evaluation_id;
  if (!evalId && user_id && period_id) {
    let evalRec = db.prepare('SELECT id FROM evaluations WHERE period_id = ? AND user_id = ?').get(period_id, user_id);
    if (evalRec) {
      evalId = evalRec.id;
    } else {
      evalId = uuidv4();
      db.prepare(`
        INSERT INTO evaluations (id, period_id, user_id, part1_score, part2_score, bonus_score, total_score, rank_proposed, status, step)
        VALUES (?, ?, ?, 30, 0, 0, 30, 'Chưa tự đánh giá', 'draft', 'step_6_advisory')
      `).run(evalId, period_id, user_id);
    }
  }

  if (!evalId) return res.status(400).json({ success: false, message: 'Thiếu evaluation_id hoặc user_id & period_id' });

  db.prepare(`
    UPDATE evaluations 
    SET advisory_rank = ?, advisory_comment = ?, advisory_by = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(advisory_rank || null, advisory_comment || null, viewerId || null, evalId);

  res.json({ success: true, message: 'Đã lưu ý kiến và đề xuất của Cơ quan tham mưu thành công!', evaluation_id: evalId });
});

// 3. Trình biểu quyết (chuyển sang Bước 7)
app.post('/api/advisory-summary/submit-voting', (req, res) => {
  const { evaluation_ids, items, period_id } = req.body;
  const viewerId = getViewerId(req);

  let targetEvalIds = [];
  if (Array.isArray(evaluation_ids) && evaluation_ids.length > 0) {
    targetEvalIds = [...evaluation_ids];
  } else if (Array.isArray(items) && items.length > 0) {
    // items: array of { user_id, evaluation_id }
    for (const it of items) {
      if (it.evaluation_id) {
        targetEvalIds.push(it.evaluation_id);
      } else if (it.user_id && period_id) {
        let evalRec = db.prepare('SELECT id FROM evaluations WHERE period_id = ? AND user_id = ?').get(period_id, it.user_id);
        if (evalRec) {
          targetEvalIds.push(evalRec.id);
        } else {
          const newId = uuidv4();
          db.prepare(`
            INSERT INTO evaluations (id, period_id, user_id, part1_score, part2_score, bonus_score, total_score, rank_proposed, status, step)
            VALUES (?, ?, ?, 30, 0, 0, 30, 'Chưa tự đánh giá', 'draft', 'step_6_advisory')
          `).run(newId, period_id, it.user_id);
          targetEvalIds.push(newId);
        }
      }
    }
  }

  if (targetEvalIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 hồ sơ để trình biểu quyết' });
  }

  const placeholders = targetEvalIds.map(() => '?').join(',');
  db.prepare(`
    UPDATE evaluations 
    SET is_advisory_submitted = 1,
        advisory_submitted_at = CURRENT_TIMESTAMP,
        advisory_by = COALESCE(?, advisory_by),
        step = 'step_7_voting',
        updated_at = CURRENT_TIMESTAMP 
    WHERE id IN (${placeholders})
  `).run(viewerId || null, ...targetEvalIds);

  res.json({ 
    success: true, 
    count: targetEvalIds.length, 
    message: `Đã trình biểu quyết thành công ${targetEvalIds.length} hồ sơ cho Tập thể Lãnh đạo!` 
  });
});

// -------------------------------------------------------------
// Voting (Biểu quyết xếp loại)
// -------------------------------------------------------------
// 1. Voting Progress & Council of Leaders stats
app.get('/api/voting/progress', (req, res) => {
  const { period_id } = req.query;
  const viewer = getViewer(req);
  const isViewerLeader = viewer ? isLeaderUser(viewer) : false;

  // Lấy tất cả người dùng đang hoạt động để đếm số cán bộ cần đánh giá
  const allActiveUsers = db.prepare(`
    SELECT u.id, u.full_name, u.role, u.target_role, u.gov_title, u.party_title, u.dept_id,
           r.code as role_code, r.permissions, r.data_scope, d.name as dept_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN departments d ON u.dept_id = d.id
    WHERE (u.is_active IS NULL OR u.is_active = 1)
    ORDER BY u.full_name ASC
  `).all();

  const totalCandidates = allActiveUsers.length;

  // Lọc danh sách Lãnh đạo / Quản lý có thẩm quyền biểu quyết
  const eligibleLeaders = allActiveUsers.filter(isLeaderUser);

  // Tiến độ bỏ phiếu của từng lãnh đạo
  const leadersProgress = eligibleLeaders.map(leader => {
    let votesCast = 0;
    let lastVotedAt = null;

    if (period_id) {
      const stats = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as cast_count, MAX(created_at) as last_voted
        FROM votes
        WHERE period_id = ? AND voter_id = ?
      `).get(period_id, leader.id);
      if (stats) {
        votesCast = stats.cast_count || 0;
        lastVotedAt = stats.last_voted || null;
      }
    }

    const isCompleted = totalCandidates > 0 && votesCast >= totalCandidates;
    const hasVoted = votesCast > 0;
    let status = 'not_started';
    if (isCompleted) status = 'completed';
    else if (hasVoted) status = 'in_progress';

    return {
      id: leader.id,
      full_name: leader.full_name,
      gov_title: leader.gov_title || 'Cán bộ Quản lý',
      party_title: leader.party_title || '',
      dept_name: leader.dept_name || 'Cơ quan',
      votes_cast: votesCast,
      total_candidates: totalCandidates,
      has_voted: hasVoted,
      is_completed: isCompleted,
      status: status,
      last_voted_at: lastVotedAt
    };
  });

  const totalLeaders = eligibleLeaders.length;
  const votedLeadersCount = leadersProgress.filter(l => l.has_voted).length;
  const completedLeadersCount = leadersProgress.filter(l => l.is_completed).length;
  const progressPct = totalLeaders > 0 ? Math.round((votedLeadersCount / totalLeaders) * 100) : 0;
  const totalVotesCast = leadersProgress.reduce((sum, l) => sum + l.votes_cast, 0);
  const maxPossibleVotes = totalLeaders * totalCandidates;
  const totalVotePct = maxPossibleVotes > 0 ? Math.round((totalVotesCast / maxPossibleVotes) * 100) : 0;

  res.json({
    total_leaders: totalLeaders,
    voted_leaders_count: votedLeadersCount,
    completed_leaders_count: completedLeadersCount,
    progress_pct: progressPct,
    total_vote_pct: totalVotePct,
    total_candidates: totalCandidates,
    is_viewer_eligible_leader: isViewerLeader,
    leaders: leadersProgress
  });
});

// 2. Voting Candidate List with breakdown of who voted
app.get('/api/voting', (req, res) => {
  const { period_id } = req.query;
  const viewer = getViewer(req);
  const viewerId = viewer?.id || getViewerId(req);
  const isViewerLeader = viewer ? isLeaderUser(viewer) : false;

  let accessibleUserIds = getAccessibleUserIds(viewerId);
  // Nếu là CBNV thường có đơn vị, cho phép xem kết quả biểu quyết của phòng ban mình
  if (!isViewerLeader && viewer?.dept_id) {
    const deptMembers = db.prepare(`SELECT id FROM users WHERE dept_id = ? AND (is_active IS NULL OR is_active = 1)`).all(viewer.dept_id);
    accessibleUserIds = deptMembers.map(m => m.id);
  }

  let userClause = '';
  const params = [period_id, viewerId || '', period_id, period_id, period_id, period_id, period_id, period_id];
  if (accessibleUserIds !== null) {
    if (accessibleUserIds.length === 0) return res.json([]);
    const placeholders = accessibleUserIds.map(() => '?').join(',');
    userClause = ` AND u.id IN (${placeholders})`;
    params.push(...accessibleUserIds);
  }

  const users = db.prepare(`
    SELECT u.id as user_id, u.full_name, u.role, u.target_role, u.gov_title, u.party_title, d.name as dept_name,
           e.total_score, e.part1_score, e.part2_score, e.bonus_score, e.superior_rank, e.superior_comment, e.rank_proposed,
           e.advisory_rank, e.advisory_comment, e.is_advisory_submitted, e.advisory_submitted_at,
           (SELECT vote_rank FROM votes v WHERE v.period_id = ? AND v.user_id = u.id AND v.voter_id = ?) as my_vote,
           (SELECT COUNT(*) FROM votes v WHERE v.period_id = ? AND v.user_id = u.id) as total_votes,
           (SELECT COUNT(*) FROM votes v WHERE v.period_id = ? AND v.user_id = u.id AND v.vote_rank = 'Hoàn thành xuất sắc nhiệm vụ') as votes_xuat_sac,
           (SELECT COUNT(*) FROM votes v WHERE v.period_id = ? AND v.user_id = u.id AND v.vote_rank = 'Hoàn thành tốt nhiệm vụ') as votes_tot,
           (SELECT COUNT(*) FROM votes v WHERE v.period_id = ? AND v.user_id = u.id AND v.vote_rank = 'Hoàn thành nhiệm vụ') as votes_hoan_thanh,
           (SELECT COUNT(*) FROM votes v WHERE v.period_id = ? AND v.user_id = u.id AND v.vote_rank = 'Không hoàn thành nhiệm vụ') as votes_khong_ht
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN evaluations e ON e.user_id = u.id AND e.period_id = ?
    WHERE (u.is_active IS NULL OR u.is_active = 1) ${userClause}
    ORDER BY u.full_name ASC
  `).all(...params);

  // Lấy chi tiết ai đã biểu quyết cho từng cán bộ ứng viên
  const candidateIds = users.map(u => u.user_id);
  const votesMap = {};
  if (period_id && candidateIds.length > 0) {
    const placeholders = candidateIds.map(() => '?').join(',');
    const detailedVotes = db.prepare(`
      SELECT v.user_id as candidate_id, v.voter_id, u.full_name as voter_name, u.gov_title, u.party_title,
             v.vote_rank, v.comment, v.created_at
      FROM votes v
      JOIN users u ON v.voter_id = u.id
      WHERE v.period_id = ? AND v.user_id IN (${placeholders})
      ORDER BY v.created_at DESC
    `).all(period_id, ...candidateIds);

    detailedVotes.forEach(dv => {
      if (!votesMap[dv.candidate_id]) votesMap[dv.candidate_id] = [];
      votesMap[dv.candidate_id].push({
        voter_id: dv.voter_id,
        voter_name: dv.voter_name,
        gov_title: dv.gov_title || 'Lãnh đạo',
        party_title: dv.party_title || '',
        vote_rank: dv.vote_rank,
        comment: dv.comment,
        created_at: dv.created_at
      });
    });
  }

  const enrichedUsers = users.map(u => ({
    ...u,
    voters_breakdown: votesMap[u.user_id] || []
  }));

  res.json(enrichedUsers);
});

// 3. Submit Vote (Strictly restricted to Leaders / Managers)
app.post('/api/voting', (req, res) => {
  const viewer = getViewer(req);
  const viewerId = viewer?.id || getViewerId(req);
  if (!viewerId) {
    return res.status(401).json({ success: false, message: 'Vui lòng xác định người biểu quyết (yêu cầu đăng nhập)' });
  }

  // Chặn nghiêm ngặt: Chỉ người có chức danh Lãnh đạo / Quản lý mới được biểu quyết
  if (!viewer || !isLeaderUser(viewer)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Từ chối quyền: Chỉ cán bộ có chức danh Lãnh đạo / Quản lý mới có quyền tham gia biểu quyết xếp loại!' 
    });
  }

  const { period_id, user_id, vote_rank, comment } = req.body;
  if (!period_id || !user_id || !vote_rank) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin biểu quyết' });
  }

  const existing = db.prepare('SELECT id FROM votes WHERE period_id = ? AND user_id = ? AND voter_id = ?').get(period_id, user_id, viewerId);
  if (existing) {
    db.prepare('UPDATE votes SET vote_rank = ?, comment = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?').run(vote_rank, comment || '', existing.id);
  } else {
    db.prepare('INSERT INTO votes (id, period_id, user_id, voter_id, vote_rank, comment) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), period_id, user_id, viewerId, vote_rank, comment || '');
  }

  res.json({ success: true, message: 'Đã ghi nhận kết quả biểu quyết thành công' });
});

// -------------------------------------------------------------
// Charts Statistics (Biểu đồ thống kê)
// -------------------------------------------------------------
app.get('/api/stats/charts', (req, res) => {
  const { period_id } = req.query;
  const viewerId = getViewerId(req);
  const accessibleUserIds = getAccessibleUserIds(viewerId);

  let userFilterClause = '';
  const paramsTasks = [period_id];
  const paramsEvals = [period_id];
  if (accessibleUserIds !== null) {
    if (accessibleUserIds.length === 0) {
      return res.json({ byAxis: [], onTimeStats: {}, scoreDistribution: [], rankDistribution: [] });
    }
    const placeholders = accessibleUserIds.map(() => '?').join(',');
    userFilterClause = ` AND user_id IN (${placeholders})`;
    paramsTasks.push(...accessibleUserIds);
    paramsEvals.push(...accessibleUserIds);
  }

  // 1. By Axis (6 trục)
  const byAxis = db.prepare(`
    SELECT a.code, a.name, COUNT(t.id) as task_count, 
           COALESCE(SUM(t.converted_score), 0) as total_converted_score,
           COALESCE(AVG(t.progress_pct), 0) as avg_progress,
           COALESCE(AVG(t.quality_pct), 0) as avg_quality
    FROM axes a
    LEFT JOIN assigned_tasks t ON t.axis_code = a.code AND t.period_id = ? ${userFilterClause}
    GROUP BY a.code, a.name
    ORDER BY a.code ASC
  `).all(...paramsTasks);

  // 2. On-Time vs Late
  const totalCompleted = db.prepare(`SELECT COUNT(*) as count FROM assigned_tasks WHERE period_id = ? AND actual_finish_date IS NOT NULL ${userFilterClause}`).get(...paramsTasks).count;
  const onTime = db.prepare(`SELECT COUNT(*) as count FROM assigned_tasks WHERE period_id = ? AND actual_finish_date IS NOT NULL AND actual_finish_date <= deadline ${userFilterClause}`).get(...paramsTasks).count;
  const late = totalCompleted - onTime;

  // 3. Score ranges
  const evals = db.prepare(`SELECT total_score, superior_rank, rank_proposed FROM evaluations WHERE period_id = ? ${userFilterClause}`).all(...paramsEvals);
  const scoreDist = [
    { range: 'Dưới 70 điểm (Không HT)', count: evals.filter(e => e.total_score < 70).length },
    { range: '70 - 79 điểm (Hoàn thành)', count: evals.filter(e => e.total_score >= 70 && e.total_score < 80).length },
    { range: '80 - 89 điểm (Hoàn thành tốt)', count: evals.filter(e => e.total_score >= 80 && e.total_score < 90).length },
    { range: '90 - 100 điểm (Xuất sắc)', count: evals.filter(e => e.total_score >= 90).length },
  ];

  // 4. Rank breakdown
  const rankDist = [
    { rank: 'Hoàn thành xuất sắc nhiệm vụ', count: evals.filter(e => (e.superior_rank || e.rank_proposed) === 'Hoàn thành xuất sắc nhiệm vụ').length },
    { rank: 'Hoàn thành tốt nhiệm vụ', count: evals.filter(e => (e.superior_rank || e.rank_proposed) === 'Hoàn thành tốt nhiệm vụ').length },
    { rank: 'Hoàn thành nhiệm vụ', count: evals.filter(e => (e.superior_rank || e.rank_proposed) === 'Hoàn thành nhiệm vụ').length },
    { rank: 'Không hoàn thành nhiệm vụ', count: evals.filter(e => (e.superior_rank || e.rank_proposed) === 'Không hoàn thành nhiệm vụ').length },
  ];

  res.json({
    byAxis,
    onTimeStats: { totalCompleted, onTime, late, onTimePct: totalCompleted > 0 ? Math.round((onTime / totalCompleted) * 100) : 100 },
    scoreDistribution: scoreDist,
    rankDistribution: rankDist,
    totalEvaluated: evals.length
  });
});

// -------------------------------------------------------------
// Reports & Excel Export Endpoints (Chuẩn Nghị định 30/2020/NĐ-CP)
// -------------------------------------------------------------


// Export CBQL / CBNV Workbook (query format)
app.get('/api/reports/export-cbql', async (req, res) => {
  try {
    const { period_id, user_id } = req.query;
    if (!period_id || !user_id) {
      return res.status(400).json({ error: 'Thiếu period_id hoặc user_id' });
    }
    const workbook = await exportCBQLWorkbook(period_id, user_id);
    const user = db.prepare('SELECT full_name FROM users WHERE id = ?').get(user_id);
    const safeName = user ? user.full_name.replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '_') : 'CanBo';
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Danh_gia_KPI_${safeName}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting CBQL workbook:', err);
    res.status(500).json({ error: 'Lỗi xuất Excel: ' + err.message });
  }
});

// Export CBQL / CBNV Workbook (REST format)
app.get('/api/reports/export/:periodId/:userId', async (req, res) => {
  try {
    const { periodId, userId } = req.params;
    const workbook = await exportCBQLWorkbook(periodId, userId);
    const user = db.prepare('SELECT full_name FROM users WHERE id = ?').get(userId);
    const safeName = user ? user.full_name.replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '_') : 'CanBo';
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Danh_gia_KPI_${safeName}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting CBQL workbook:', err);
    res.status(500).json({ error: 'Lỗi xuất Excel: ' + err.message });
  }
});

// Export Mẫu 02 Workbook (query format)
app.get('/api/reports/export-mau-02', async (req, res) => {
  try {
    const { period_id } = req.query;
    if (!period_id) {
      return res.status(400).json({ error: 'Thiếu period_id' });
    }
    const workbook = await exportMau02Workbook(period_id);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mau_02_Tong_hop_xep_loai.xlsx"');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting Mau 02 workbook:', err);
    res.status(500).json({ error: 'Lỗi xuất Excel Mẫu 02: ' + err.message });
  }
});

// Export Mẫu 02 Workbook (REST format)
app.get('/api/reports/export-mau-02/:periodId', async (req, res) => {
  try {
    const { periodId } = req.params;
    const workbook = await exportMau02Workbook(periodId);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Mau_02_Tong_hop_xep_loai.xlsx"');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting Mau 02 workbook:', err);
    res.status(500).json({ error: 'Lỗi xuất Excel Mẫu 02: ' + err.message });
  }
});

// ============================================================================
// DOCUMENT MANAGEMENT & DISPATCH MODULE (QUẢN LÝ & PHÂN BỔ VĂN BẢN)
// ============================================================================

// 1. Get Document Statistics
app.get('/api/documents/stats', (req, res) => {
  try {
    const viewer = getViewer(req);
    const isMgr = checkIsManagerOrAdmin(viewer);

    let scopeWhere = '1=1';
    const params = [];
    if (!isMgr && viewer) {
      scopeWhere = `(
        d.created_by = ? OR 
        d.id IN (
          SELECT document_id FROM document_dispatches 
          WHERE assigned_to_user_id = ? OR coordinating_user_ids LIKE ?
        )
      )`;
      params.push(viewer.id, viewer.id, `%"${viewer.id}"%`);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE ${scopeWhere}`).get(...params).count;
    const pendingDispatch = db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE ${scopeWhere} AND d.status = 'pending_dispatch'`).get(...params).count;
    const inProgress = db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE ${scopeWhere} AND d.status = 'in_progress'`).get(...params).count;
    const completed = db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE ${scopeWhere} AND d.status = 'completed'`).get(...params).count;
    const today = new Date().toISOString().split('T')[0];
    const overdue = db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE ${scopeWhere} AND d.deadline IS NOT NULL AND d.deadline < ? AND d.status != 'completed'`).get(...params, today).count;

    res.json({
      total,
      pending_dispatch: pendingDispatch,
      in_progress: inProgress,
      completed,
      overdue
    });
  } catch (err) {
    console.error('Error fetching document stats:', err);
    res.status(500).json({ error: 'Lỗi lấy thống kê văn bản: ' + err.message });
  }
});

// 2. Get Documents List with Filters & Scoping
app.get('/api/documents', (req, res) => {
  try {
    const viewer = getViewer(req);
    const isMgr = checkIsManagerOrAdmin(viewer);
    const { search, doc_type, field, status, urgency, from_date, to_date } = req.query;

    let conditions = ['1=1'];
    const params = [];

    if (!isMgr && viewer) {
      conditions.push(`(
        d.created_by = ? OR 
        d.id IN (
          SELECT document_id FROM document_dispatches 
          WHERE assigned_to_user_id = ? OR coordinating_user_ids LIKE ?
        )
      )`);
      params.push(viewer.id, viewer.id, `%"${viewer.id}"%`);
    }

    if (search) {
      conditions.push('(d.doc_number LIKE ? OR d.summary LIKE ? OR d.issuer LIKE ?)');
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }
    if (doc_type && doc_type !== 'all') {
      conditions.push('d.doc_type = ?');
      params.push(doc_type);
    }
    if (field && field !== 'all') {
      conditions.push('d.field = ?');
      params.push(field);
    }
    if (status && status !== 'all') {
      if (status === 'overdue') {
        const today = new Date().toISOString().split('T')[0];
        conditions.push('d.deadline IS NOT NULL AND d.deadline < ? AND d.status != "completed"');
        params.push(today);
      } else {
        conditions.push('d.status = ?');
        params.push(status);
      }
    }
    if (urgency && urgency !== 'all') {
      conditions.push('d.urgency = ?');
      params.push(urgency);
    }
    if (from_date) {
      conditions.push('d.doc_date >= ?');
      params.push(from_date);
    }
    if (to_date) {
      conditions.push('d.doc_date <= ?');
      params.push(to_date);
    }

    const whereClause = conditions.join(' AND ');
    const query = `
      SELECT d.*, 
             u.full_name as creator_name,
             (SELECT COUNT(*) FROM document_dispatches dd WHERE dd.document_id = d.id) as dispatches_count,
             (SELECT GROUP_CONCAT(u2.full_name, ', ') 
              FROM document_dispatches dd2 
              JOIN users u2 ON dd2.assigned_to_user_id = u2.id 
              WHERE dd2.document_id = d.id) as assigned_officers
      FROM documents d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE ${whereClause}
      ORDER BY d.created_at DESC
    `;

    const docs = db.prepare(query).all(...params);

    const todayStr = new Date().toISOString().split('T')[0];
    const enriched = docs.map(doc => {
      const isOverdue = doc.deadline && doc.deadline < todayStr && doc.status !== 'completed';
      return {
        ...doc,
        is_overdue: isOverdue,
        display_status: isOverdue ? 'overdue' : doc.status
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Lỗi tải danh sách văn bản: ' + err.message });
  }
});

// 3. Get Document Detail with Dispatches
app.get('/api/documents/:id', (req, res) => {
  try {
    const { id } = req.params;
    const doc = db.prepare(`
      SELECT d.*, u.full_name as creator_name
      FROM documents d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.id = ?
    `).get(id);

    if (!doc) {
      return res.status(404).json({ error: 'Không tìm thấy văn bản' });
    }

    const dispatches = db.prepare(`
      SELECT dd.*, 
             u.full_name as assigned_user_name,
             u.gov_title as assigned_user_title,
             dept.name as department_name,
             disp_u.full_name as dispatched_by_name,
             t.task_name,
             t.status as task_status,
             t.converted_score as task_score
      FROM document_dispatches dd
      LEFT JOIN users u ON dd.assigned_to_user_id = u.id
      LEFT JOIN departments dept ON dd.department_id = dept.id
      LEFT JOIN users disp_u ON dd.dispatched_by = disp_u.id
      LEFT JOIN assigned_tasks t ON dd.task_id = t.id
      WHERE dd.document_id = ?
      ORDER BY dd.dispatched_at DESC
    `).all(id);

    for (const d of dispatches) {
      if (d.coordinating_user_ids) {
        try {
          const ids = JSON.parse(d.coordinating_user_ids);
          if (Array.isArray(ids) && ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            const coUsers = db.prepare(`SELECT id, full_name FROM users WHERE id IN (${placeholders})`).all(...ids);
            d.coordinating_users = coUsers;
          } else {
            d.coordinating_users = [];
          }
        } catch (e) {
          d.coordinating_users = [];
        }
      } else {
        d.coordinating_users = [];
      }
    }

    res.json({
      ...doc,
      dispatches
    });
  } catch (err) {
    console.error('Error fetching document detail:', err);
    res.status(500).json({ error: 'Lỗi tải chi tiết văn bản: ' + err.message });
  }
});

// 4. Create Document (With File Upload)
app.post('/api/documents', upload.single('file'), async (req, res) => {
  try {
    const viewer = getViewer(req);
    const {
      doc_number,
      doc_date,
      arrival_date,
      arrival_number,
      issuer,
      doc_type,
      field,
      urgency = 'Thường',
      security_level = 'Thường',
      summary,
      deadline
    } = req.body;

    if (!doc_number || !summary || !issuer || !doc_type) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ Số hiệu, Cơ quan ban hành, Phân loại và Trích yếu nội dung văn bản!' });
    }

    const id = uuidv4();
    let fileUrl = null;
    let fileName = null;
    if (req.file) {
      const saved = await saveUploadedFile(req.file, 'documents');
      if (saved) {
        fileUrl = saved.file_url;
        fileName = saved.file_name;
      }
    }

    db.prepare(`
      INSERT INTO documents (
        id, doc_number, doc_date, arrival_date, arrival_number, issuer,
        doc_type, field, urgency, security_level, summary,
        file_url, file_name, deadline, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_dispatch', ?)
    `).run(
      id, doc_number.trim(), doc_date || null, arrival_date || null, arrival_number || null,
      issuer.trim(), doc_type.trim(), field ? field.trim() : 'Chuyên môn',
      urgency, security_level, summary.trim(),
      fileUrl, fileName, deadline || null, viewer ? viewer.id : null
    );

    const created = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    res.status(201).json({ success: true, document: created, message: 'Đã tiếp nhận và lưu văn bản thành công!' });
  } catch (err) {
    console.error('Error creating document:', err);
    res.status(500).json({ error: 'Lỗi tiếp nhận văn bản: ' + err.message });
  }
});

// 5. Update Document (With File Upload)
app.put('/api/documents/:id', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy văn bản' });
    }

    const {
      doc_number,
      doc_date,
      arrival_date,
      arrival_number,
      issuer,
      doc_type,
      field,
      urgency,
      security_level,
      summary,
      deadline,
      status
    } = req.body;

    let fileUrl = existing.file_url;
    let fileName = existing.file_name;
    if (req.file) {
      const saved = await saveUploadedFile(req.file, 'documents');
      if (saved) {
        if (existing.file_url) {
          await deleteUploadedFile(existing.file_url);
        }
        fileUrl = saved.file_url;
        fileName = saved.file_name;
      }
    }

    db.prepare(`
      UPDATE documents SET
        doc_number = COALESCE(?, doc_number),
        doc_date = COALESCE(?, doc_date),
        arrival_date = COALESCE(?, arrival_date),
        arrival_number = COALESCE(?, arrival_number),
        issuer = COALESCE(?, issuer),
        doc_type = COALESCE(?, doc_type),
        field = COALESCE(?, field),
        urgency = COALESCE(?, urgency),
        security_level = COALESCE(?, security_level),
        summary = COALESCE(?, summary),
        deadline = COALESCE(?, deadline),
        status = COALESCE(?, status),
        file_url = ?,
        file_name = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      doc_number ? doc_number.trim() : null,
      doc_date || null,
      arrival_date || null,
      arrival_number || null,
      issuer ? issuer.trim() : null,
      doc_type ? doc_type.trim() : null,
      field ? field.trim() : null,
      urgency || null,
      security_level || null,
      summary ? summary.trim() : null,
      deadline || null,
      status || null,
      fileUrl,
      fileName,
      id
    );

    const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    res.json({ success: true, document: updated, message: 'Đã cập nhật thông tin văn bản thành công!' });
  } catch (err) {
    console.error('Error updating document:', err);
    res.status(500).json({ error: 'Lỗi cập nhật văn bản: ' + err.message });
  }
});

// 6. Delete Document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy văn bản' });
    }

    if (existing.file_url) {
      await deleteUploadedFile(existing.file_url);
    }

    db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    res.json({ success: true, message: 'Đã xóa văn bản và lịch sử phân bổ thành công!' });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Lỗi xóa văn bản: ' + err.message });
  }
});

// 7. Dispatch Document (Phân bổ văn bản cho cán bộ & tùy chọn tạo KPI task)
app.post('/api/documents/:id/dispatch', (req, res) => {
  try {
    const viewer = getViewer(req);
    const { id } = req.params;
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!doc) {
      return res.status(404).json({ error: 'Không tìm thấy văn bản' });
    }

    const {
      department_id,
      assigned_to_user_id,
      coordinating_user_ids = [],
      instruction,
      deadline,
      create_kpi_task,
      period_id,
      axis_code = 'CHUYEN_MON',
      standard_score = 10,
      difficulty_weight = 1.0,
      output_result = 'Báo cáo / Kế hoạch'
    } = req.body;

    if (!assigned_to_user_id || !instruction) {
      return res.status(400).json({ error: 'Vui lòng chọn cán bộ phụ trách chính và nhập ý kiến chỉ đạo xử lý văn bản!' });
    }

    const dispatchId = uuidv4();
    let createdTaskId = null;

    const runTransaction = db.transaction(() => {
      // 1. If create_kpi_task is true and period_id is provided, create an assigned_task
      if (create_kpi_task && period_id) {
        createdTaskId = uuidv4();
        const stdScore = parseFloat(standard_score) || 10;
        const diffWeight = parseFloat(difficulty_weight) || 1.0;
        const maxConv = Number((stdScore * diffWeight).toFixed(2));
        const taskName = `[VB ${doc.doc_number}] ${instruction.length > 80 ? instruction.slice(0, 80) + '...' : instruction}`;

        db.prepare(`
          INSERT INTO assigned_tasks (
            id, period_id, user_id, task_name, output_result,
            deadline, task_type, standard_score, difficulty_weight, max_converted_score,
            axis_code, origin, status, assigned_by, document_id
          ) VALUES (?, ?, ?, ?, ?, ?, 'Đột xuất', ?, ?, ?, ?, 'assigned', 'in_progress', ?, ?)
        `).run(
          createdTaskId,
          period_id,
          assigned_to_user_id,
          taskName,
          output_result,
          deadline || doc.deadline || new Date().toISOString().split('T')[0],
          stdScore,
          diffWeight,
          maxConv,
          axis_code,
          viewer ? viewer.id : null,
          doc.id
        );
      }

      // 2. Insert dispatch record
      db.prepare(`
        INSERT INTO document_dispatches (
          id, document_id, department_id, assigned_to_user_id, coordinating_user_ids,
          instruction, deadline, task_id, status, dispatched_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?)
      `).run(
        dispatchId,
        doc.id,
        department_id || null,
        assigned_to_user_id,
        Array.isArray(coordinating_user_ids) ? JSON.stringify(coordinating_user_ids) : '[]',
        instruction.trim(),
        deadline || doc.deadline || null,
        createdTaskId,
        viewer ? viewer.id : null
      );

      // 3. Update document status to in_progress
      db.prepare(`
        UPDATE documents 
        SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND status = 'pending_dispatch'
      `).run(doc.id);
    });

    runTransaction();

    const dispatch = db.prepare('SELECT * FROM document_dispatches WHERE id = ?').get(dispatchId);
    res.status(201).json({
      success: true,
      dispatch,
      task_id: createdTaskId,
      message: createdTaskId 
        ? 'Đã phân bổ văn bản và tự động tạo Nhiệm vụ KPI thành công!' 
        : 'Đã phân bổ văn bản cho cán bộ xử lý thành công!'
    });
  } catch (err) {
    console.error('Error dispatching document:', err);
    res.status(500).json({ error: 'Lỗi phân bổ văn bản: ' + err.message });
  }
});

// 8. Complete Document Dispatch
app.put('/api/documents/dispatches/:dispatchId/complete', (req, res) => {
  try {
    const { dispatchId } = req.params;
    const { completion_note } = req.body;

    const dispatch = db.prepare('SELECT * FROM document_dispatches WHERE id = ?').get(dispatchId);
    if (!dispatch) {
      return res.status(404).json({ error: 'Không tìm thấy phân bổ văn bản' });
    }

    db.prepare(`
      UPDATE document_dispatches SET
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        completion_note = ?
      WHERE id = ?
    `).run(completion_note || 'Đã hoàn thành xử lý theo chỉ đạo.', dispatchId);

    const pendingDispatches = db.prepare(`
      SELECT COUNT(*) as count 
      FROM document_dispatches 
      WHERE document_id = ? AND status != 'completed'
    `).get(dispatch.document_id).count;

    if (pendingDispatches === 0) {
      db.prepare(`UPDATE documents SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(dispatch.document_id);
    }

    res.json({ success: true, message: 'Đã cập nhật hoàn tất xử lý văn bản thành công!' });
  } catch (err) {
    console.error('Error completing document dispatch:', err);
    res.status(500).json({ error: 'Lỗi cập nhật hoàn thành: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
