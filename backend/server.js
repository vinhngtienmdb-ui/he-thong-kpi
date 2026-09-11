const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { 
  db, 
  dbPath, 
  backupDir, 
  checkpointDatabase, 
  createBackup, 
  initDatabase, 
  getDepartmentDescendantIds, 
  getAccessibleUserIds 
} = require('./database');
const { 
  importStandardTasksFromExcel, 
  generateUserImportTemplate,
  importUsersFromExcel,
  exportCBQLWorkbook, 
  exportMau02Workbook,
  exportDirectoryWorkbook
} = require('./excelService');
const { compareUsersByPositionAndName } = require('./userSorting');
const { 
  getSupabaseStatus, 
  pushToSupabase, 
  pullFromSupabase, 
  isSupabaseConfigured,
  triggerBackgroundSupabaseSync,
  syncDirectUserToSupabase,
  syncDirectRoleToSupabase,
  syncWithSupabaseOnStartup,
  autoRestoreFromSupabaseIfFresh,
  deleteStandardTasksFromSupabase,
  deleteAssignedTasksFromSupabase,
  deleteUserFromSupabase,
  resetAllEvaluationsFromSupabase
} = require('./supabaseSync');

// Initialize database
initDatabase();

// Tự động đồng bộ hai chiều khi khởi động: nếu Supabase có dữ liệu thì kéo về, nếu trống thì đẩy lên
syncWithSupabaseOnStartup().catch(err => {
  console.error('[Supabase Startup Sync] Khởi chạy đồng bộ Supabase thất bại:', err.message);
});

const app = express();
const PORT = process.env.PORT || 5000;

// Storage Module (Supports Cloudflare R2 and Local Disk Fallback)
const { upload, saveUploadedFile, deleteUploadedFile, isR2Configured, localUploadDir } = require('./storage');

const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-viewer-id', 'x-user-id', 'x-requested-with', 'Accept', 'Origin']
};
app.use(cors(corsOptions));
app.use(express.json());

// Continuous Live Sync Middleware:
// Tự động kích hoạt đồng bộ nền lên Supabase Cloud cho MỌI thao tác thay đổi dữ liệu thành công (POST, PUT, PATCH, DELETE)
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.path.startsWith('/api/')) {
    if (!req.path.startsWith('/api/supabase/') && !req.path.startsWith('/api/backup/')) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          triggerBackgroundSupabaseSync(300);
        }
      });
    }
  }
  next();
});

app.use('/uploads', express.static(localUploadDir));

// Serve frontend production build if available
const frontendDistCandidates = [
  path.join(__dirname, '..', 'frontend', 'dist'),
  path.join(__dirname, 'dist'),
  path.join(process.cwd(), 'frontend', 'dist'),
  path.join(process.cwd(), 'dist')
];
const frontendDist = frontendDistCandidates.find(p => fs.existsSync(p));
if (frontendDist) {
  console.log(`[Frontend] Serving static frontend build from: ${frontendDist}`);
  app.use(express.static(frontendDist));
}

// Health check endpoints (for Render health check, uptime monitors & anti-sleep pings)
app.get(['/api/health', '/health'], (req, res) => {
  try {
    const row = db.prepare('SELECT 1 as alive').get();
    const uptime = process.uptime();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(uptime),
      uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
      database: row && row.alive === 1 ? 'connected' : 'unknown',
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024))
      },
      keepAlive: true,
      service: 'kpi-crm-system'
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});

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

// Check if user is exempt from KPI evaluation (System Admin, Unit Admin / functional accounts)
function isExemptFromEvaluation(u) {
  if (!u) return false;
  if (u.role === 'admin' || u.role === 'admin_donvi') return true;
  if (u.role_code === 'admin' || u.role_code === 'admin_donvi' || u.role_id === 'role-admin-donvi') return true;
  if (u.target_role === 'admin' || u.target_role === 'admin_donvi' || u.target_role === 'none' || u.target_role === 'exempt') return true;
  try {
    const perms = typeof u.permissions === 'string' 
      ? JSON.parse(u.permissions || '{}') 
      : (u.permissions || {});
    if (perms.is_exempt_from_evaluation === true || perms.is_functional_admin === true) {
      return true;
    }
  } catch (e) {}
  return false;
}

// Check if viewer has System Admin permissions (Cấu hình toàn hệ thống)
function checkIsAdmin(viewer) {
  if (!viewer) return false;
  // Tài khoản Quản trị đơn vị không phải là Quản trị toàn hệ thống
  if (viewer.role_code === 'admin_donvi' || viewer.role_id === 'role-admin-donvi') return false;
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

// Check if viewer has User Management permissions (Quản trị hệ thống HOẶC Quản trị đơn vị)
function checkCanManageUsers(viewer) {
  if (!viewer) return false;
  if (checkIsAdmin(viewer)) return true;
  if (viewer.role === 'admin' || viewer.role_code === 'admin_donvi' || viewer.role_id === 'role-admin-donvi') return true;
  try {
    const perms = typeof viewer.permissions === 'string' 
      ? JSON.parse(viewer.permissions || '{}') 
      : (viewer.permissions || {});
    return perms.can_manage_users === true || perms.can_manage_system === true;
  } catch (e) {
    return false;
  }
}

// Check if user is a Leader/Manager eligible for general management
function isLeaderUser(u) {
  if (!u) return false;
  if (u.role_code === 'admin_donvi' || u.role_id === 'role-admin-donvi') return false;
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
    'cấp ủy', 'chi ủy', 'chủ tịch', 'phó chủ tịch'
  ];
  return leaderKeywords.some(kw => title.includes(kw));
}

// Kiểm tra thành viên Hội đồng Lãnh đạo biểu quyết: TUYỆT ĐỐI LOẠI BỎ TẤT CẢ TÀI KHOẢN CHỨC NĂNG / ADMIN / ĐƠN VỊ
function isVotingCouncilMember(u) {
  if (!u) return false;
  // 1. Loại bỏ tất cả tài khoản admin, admin đơn vị, chức năng kỹ thuật
  if (u.role === 'admin' || u.role === 'admin_donvi') return false;
  if (u.role_code === 'admin' || u.role_code === 'admin_donvi') return false;
  if (u.role_id === 'role-admin' || u.role_id === 'role-admin-donvi') return false;
  if (u.target_role === 'admin' || u.target_role === 'admin_donvi' || u.target_role === 'exempt' || u.target_role === 'none') return false;
  
  const uname = String(u.username || '').toLowerCase();
  if (['admin', 'quantri', 'quantrihethong', 'admin_donvi', 'vanthu', 'mnhy.andong'].includes(uname)) return false;

  // Loại bỏ các tài khoản mang tên cơ quan/đơn vị/trường/phòng/ban/quản trị (không phải cá nhân lãnh đạo)
  const fname = String(u.full_name || '').toLowerCase();
  const orgKeywords = ['trường ', 'phòng ', 'ban ', 'cơ quan', 'ủy ban', 'quản trị', 'văn thư', 'hệ thống', 'đơn vị'];
  if (orgKeywords.some(kw => fname.startsWith(kw) || fname.includes('quản trị viên') || fname.includes('tài khoản chức năng'))) {
    return false;
  }

  try {
    const perms = typeof u.permissions === 'string' 
      ? JSON.parse(u.permissions || '{}') 
      : (u.permissions || {});
    if (perms.is_exempt_from_evaluation || perms.is_functional_admin) return false;
  } catch (e) {}

  // 2. Phải có chức danh Lãnh đạo thực tế (Hiệu trưởng, Phó Hiệu trưởng, Trưởng/Phó phòng, Giám đốc, Bí thư...)
  const title = `${u.gov_title || ''} ${u.party_title || ''}`.toLowerCase();
  const leaderKeywords = [
    'hiệu trưởng', 'hiệu phó', 'phó hiệu trưởng', 'giám đốc', 'phó giám đốc', 
    'trưởng phòng', 'phó phòng', 'phó trưởng phòng', 'trưởng ban', 'phó ban', 
    'bí thư', 'phó bí thư', 'thường trực', 'thường vụ', 'chủ tịch', 'phó chủ tịch'
  ];
  const hasLeaderTitle = leaderKeywords.some(kw => title.includes(kw));
  if (!hasLeaderTitle) return false;

  if (u.management_role === 'lanh_dao' || u.management_role === 'quan_ly') return true;
  if (u.role === 'cbql' || u.target_role === 'cbql') return true;
  if (u.role_code && ['cbql_phong', 'ld_coquan', 'hieu_pho'].includes(u.role_code)) return true;

  return true;
}

// Check if viewer is CBQL or Admin (Leader/Manager)
function checkIsManagerOrAdmin(viewer) {
  if (!viewer) return false;
  if (
    viewer.role === 'admin' || 
    viewer.role_code === 'admin' || 
    viewer.role_id === 'role-admin' || 
    viewer.role_id === 'role-admin-donvi' || 
    viewer.target_role === 'admin_donvi' || 
    viewer.target_role === 'admin' || 
    viewer.username === 'admin' || 
    viewer.username === 'mnhy.andong'
  ) {
    return true;
  }
  return isLeaderUser(viewer);
}

// Middleware: Require Admin access (Cấu hình hệ thống, phòng ban, vai trò hệ thống)
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

// Middleware: Require User Management access (Quản trị viên Hệ thống HOẶC Quản trị đơn vị)
function requireCanManageUsers(req, res, next) {
  const viewer = getViewer(req);
  if (!viewer) {
    return res.status(401).json({ success: false, message: 'Yêu cầu xác thực tài khoản quản trị (x-viewer-id)' });
  }
  if (!checkCanManageUsers(viewer)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Từ chối truy cập: Bạn không có quyền quản lý người dùng/cán bộ. Vui lòng liên hệ Quản trị viên.' 
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
           (SELECT COUNT(DISTINCT m.id) FROM users m 
            LEFT JOIN user_positions up ON up.user_id = m.id
            WHERE (m.dept_id = d.id OR up.dept_id = d.id) AND (m.is_active IS NULL OR m.is_active = 1)) as user_count
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

app.post('/api/roles', requireAdmin, async (req, res) => {
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

  const createdRole = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  await syncDirectRoleToSupabase(createdRole);

  res.json({ success: true, id, message: 'Đã tạo vai trò mới thành công' });
});

app.put('/api/roles/:id', requireAdmin, async (req, res) => {
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

  const updatedRole = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  await syncDirectRoleToSupabase(updatedRole);

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
// Users Management & Positions
// -------------------------------------------------------------
function attachPositionsToUsers(users) {
  if (!Array.isArray(users) || users.length === 0) return users;
  const userIds = users.map(u => u.id).filter(Boolean);
  if (userIds.length === 0) return users;

  const placeholders = userIds.map(() => '?').join(',');
  const allPositions = db.prepare(`
    SELECT p.*, d.name as dept_name, d.code as dept_code, r.name as role_name
    FROM user_positions p
    LEFT JOIN departments d ON p.dept_id = d.id
    LEFT JOIN roles r ON p.role_id = r.id
    WHERE p.user_id IN (${placeholders})
    ORDER BY p.is_primary DESC, p.created_at ASC
  `).all(...userIds);

  const posMap = {};
  for (const p of allPositions) {
    if (!posMap[p.user_id]) posMap[p.user_id] = [];
    posMap[p.user_id].push(p);
  }

  for (const u of users) {
    u.positions = posMap[u.id] || [];
  }
  return users;
}

app.get('/api/users', (req, res) => {
  const viewerId = getViewerId(req);
  const accessibleUserIds = getAccessibleUserIds(viewerId);

  let query = `
    SELECT u.id, u.username, u.full_name, u.role, u.target_role, u.party_title, u.gov_title, u.union_title, u.dept_id,
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

  const viewer = getViewer(req);
  const isSysAdmin = checkIsAdmin(viewer);

  if ((req.query.filter_accessible === 'true' || !isSysAdmin) && accessibleUserIds !== null) {
    if (accessibleUserIds.length === 0) {
      return res.json([]);
    }
    const placeholders = accessibleUserIds.map(() => '?').join(',');
    query += ` AND u.id IN (${placeholders})`;
    params.push(...accessibleUserIds);
  }

  // Lọc theo phân cấp đơn vị (hỗ trợ cả đơn vị trực tiếp và các chức vụ kiêm nhiệm)
  const { dept_id, include_children } = req.query;
  if (dept_id && dept_id !== 'ALL') {
    if (include_children === 'true') {
      const descendantDeptIds = getDepartmentDescendantIds(dept_id);
      const deptPlaceholders = descendantDeptIds.map(() => '?').join(',');
      query += ` AND (u.dept_id IN (${deptPlaceholders}) OR EXISTS (SELECT 1 FROM user_positions up WHERE up.user_id = u.id AND up.dept_id IN (${deptPlaceholders})))`;
      params.push(...descendantDeptIds, ...descendantDeptIds);
    } else {
      query += ` AND (u.dept_id = ? OR EXISTS (SELECT 1 FROM user_positions up WHERE up.user_id = u.id AND up.dept_id = ?))`;
      params.push(dept_id, dept_id);
    }
  }

  query += ` ORDER BY u.role DESC, u.full_name ASC`;
  const users = db.prepare(query).all(...params);
  attachPositionsToUsers(users);
  users.sort(compareUsersByPositionAndName);
  res.json(users);
});

// -------------------------------------------------------------
// Directory (Danh bạ liên hệ toàn hệ thống & Quản lý cán bộ trực thuộc)
// -------------------------------------------------------------
app.get('/api/directory', (req, res) => {
  const viewerId = getViewerId(req);
  const viewer = viewerId ? db.prepare(`
    SELECT u.*, r.code as role_code, r.data_scope, d.name as dept_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN departments d ON u.dept_id = d.id
    WHERE u.id = ?
  `).get(viewerId) : null;

  const accessibleUserIds = viewerId ? getAccessibleUserIds(viewerId) : null;
  const accessibleSet = accessibleUserIds ? new Set(accessibleUserIds) : null;

  // Cây phòng ban do viewer quản lý (nếu là lãnh đạo hoặc có thẩm quyền đơn vị)
  const managedDeptIds = new Set();
  if (viewer?.dept_id) {
    managedDeptIds.add(viewer.dept_id);
    try {
      getDepartmentDescendantIds(viewer.dept_id).forEach(id => managedDeptIds.add(id));
    } catch (e) {}
  }
  if (viewerId) {
    try {
      const leaderDepts = db.prepare('SELECT id FROM departments WHERE leader_id = ?').all(viewerId);
      leaderDepts.forEach(d => {
        managedDeptIds.add(d.id);
        getDepartmentDescendantIds(d.id).forEach(id => managedDeptIds.add(id));
      });
    } catch (e) {}
  }

  const isManagerOrAdmin = Boolean(
    viewer?.role === 'admin' ||
    viewer?.role_code === 'admin_donvi' ||
    viewer?.role === 'cbql' ||
    viewer?.target_role === 'cbql' ||
    ['admin', 'admin_donvi', 'cbql_phong', 'ld_coquan', 'to_truong', 'hieu_pho'].includes(viewer?.role_code) ||
    viewer?.management_role ||
    (accessibleSet && accessibleSet.size > 1)
  );

  let query = `
    SELECT u.id, u.username, u.full_name, u.role, u.target_role, u.party_title, u.gov_title, u.union_title, u.dept_id,
           u.role_id, u.manager_id, u.management_role, u.final_evaluator_id,
           u.birth_date, u.gender, u.phone, u.email, COALESCE(u.is_active, 1) as is_active,
           d.name as dept_name, d.code as dept_code, d.location_name as dept_location,
           r.name as role_name, r.code as role_code,
           mgr.full_name as manager_name,
           fe.full_name as final_evaluator_name
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN users mgr ON u.manager_id = mgr.id
    LEFT JOIN users fe ON u.final_evaluator_id = fe.id
    WHERE COALESCE(u.is_active, 1) = 1
  `;
  const params = [];

  const { search, dept_id, scope } = req.query;

  if (dept_id) {
    query += ` AND u.dept_id = ?`;
    params.push(dept_id);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ` AND (u.full_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR u.username LIKE ? OR u.gov_title LIKE ? OR u.party_title LIKE ? OR u.union_title LIKE ? OR d.name LIKE ?)`;
    params.push(term, term, term, term, term, term, term, term);
  }

  query += ` ORDER BY d.id ASC, u.role DESC, u.full_name ASC`;
  const rawUsers = db.prepare(query).all(...params);

  // Gắn cờ quan hệ so với người xem
  const allAnnotatedUsers = rawUsers.map(u => {
    const isSelf = viewerId ? u.id === viewerId : false;
    const isDirectSubordinate = viewerId ? (u.manager_id === viewerId || u.final_evaluator_id === viewerId) : false;
    const isInMyDept = viewer?.dept_id ? (u.dept_id === viewer.dept_id || managedDeptIds.has(u.dept_id)) : false;
    const isSubordinate = isDirectSubordinate || (accessibleSet ? (accessibleSet.has(u.id) && !isSelf) : false);

    return {
      ...u,
      is_self: isSelf,
      is_direct_subordinate: isDirectSubordinate,
      is_in_my_dept: isInMyDept,
      is_subordinate: isSubordinate,
      can_assign: isManagerOrAdmin && (isSubordinate || isInMyDept || viewer?.role === 'admin')
    };
  });
  allAnnotatedUsers.sort(compareUsersByPositionAndName);

  // Lọc phạm vi hiển thị nếu có chỉ định scope
  let filteredUsers = allAnnotatedUsers;
  if (scope === 'subordinates') {
    filteredUsers = allAnnotatedUsers.filter(u => u.is_subordinate);
  } else if (scope === 'my_unit') {
    filteredUsers = allAnnotatedUsers.filter(u => u.is_in_my_dept);
  }

  // Thống kê tổng quan
  const subordinatesCount = allAnnotatedUsers.filter(u => u.is_subordinate).length;
  const myDeptCount = allAnnotatedUsers.filter(u => u.is_in_my_dept).length;

  const departments = db.prepare(`
    SELECT d.*, u.full_name as leader_name,
           (SELECT COUNT(*) FROM users WHERE dept_id = d.id AND COALESCE(is_active, 1) = 1) as user_count
    FROM departments d
    LEFT JOIN users u ON d.leader_id = u.id
    WHERE COALESCE(d.is_active, 1) = 1
    ORDER BY d.name ASC
  `).all();

  res.json({
    success: true,
    users: filteredUsers,
    departments,
    viewer: viewer ? {
      id: viewer.id,
      full_name: viewer.full_name,
      dept_id: viewer.dept_id,
      dept_name: viewer.dept_name,
      role: viewer.role,
      role_code: viewer.role_code,
      is_manager: isManagerOrAdmin
    } : null,
    stats: {
      total: allAnnotatedUsers.length,
      subordinatesCount,
      myDeptCount,
      departmentsCount: departments.length
    }
  });
});

// Xuất file Excel Danh bạ nội bộ
app.get('/api/directory/export', async (req, res) => {
  try {
    const viewerId = getViewerId(req);
    const viewer = viewerId ? db.prepare(`
      SELECT u.*, r.code as role_code, d.name as dept_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.dept_id = d.id
      WHERE u.id = ?
    `).get(viewerId) : null;

    const accessibleUserIds = viewerId ? getAccessibleUserIds(viewerId) : null;
    const accessibleSet = accessibleUserIds ? new Set(accessibleUserIds) : null;

    let query = `
      SELECT u.id, u.username, u.full_name, u.role, u.target_role, u.party_title, u.gov_title, u.union_title, u.dept_id,
             u.birth_date, u.gender, u.phone, u.email, COALESCE(u.is_active, 1) as is_active,
             d.name as dept_name, mgr.full_name as manager_name
      FROM users u
      LEFT JOIN departments d ON u.dept_id = d.id
      LEFT JOIN users mgr ON u.manager_id = mgr.id
      WHERE COALESCE(u.is_active, 1) = 1
    `;
    const params = [];
    const { search, dept_id, scope } = req.query;

    if (dept_id) {
      query += ` AND u.dept_id = ?`;
      params.push(dept_id);
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (u.full_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR u.username LIKE ? OR u.gov_title LIKE ? OR u.party_title LIKE ? OR u.union_title LIKE ? OR d.name LIKE ?)`;
      params.push(term, term, term, term, term, term, term, term);
    }

    query += ` ORDER BY d.id ASC, u.role DESC, u.full_name ASC`;
    let list = db.prepare(query).all(...params);

    list = list.map(u => {
      const isSelf = viewerId ? u.id === viewerId : false;
      const isDirectSubordinate = viewerId ? (u.manager_id === viewerId || u.final_evaluator_id === viewerId) : false;
      const isInMyDept = viewer?.dept_id ? (u.dept_id === viewer.dept_id) : false;
      const isSubordinate = isDirectSubordinate || (accessibleSet ? (accessibleSet.has(u.id) && !isSelf) : false);
      return { ...u, is_self: isSelf, is_direct_subordinate: isDirectSubordinate, is_in_my_dept: isInMyDept, is_subordinate: isSubordinate };
    });

    if (scope === 'subordinates') {
      list = list.filter(u => u.is_subordinate);
    } else if (scope === 'my_unit') {
      list = list.filter(u => u.is_in_my_dept);
    }
    list.sort(compareUsersByPositionAndName);

    let subtitleScope = 'Toàn hệ thống';
    if (scope === 'subordinates') subtitleScope = 'Danh sách cán bộ trực thuộc';
    else if (scope === 'my_unit') subtitleScope = `Đơn vị: ${viewer?.dept_name || 'Cơ quan'}`;

    const workbook = await exportDirectoryWorkbook(list, {
      title: 'DANH BẠ LIÊN HỆ NỘI BỘ',
      subtitle: `Phạm vi: ${subtitleScope} - Thời điểm xuất: ${new Date().toLocaleDateString('vi-VN')}`
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="danh-ba-lien-he-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting directory:', error);
    res.status(500).json({ success: false, message: 'Lỗi khi xuất danh bạ ra Excel: ' + error.message });
  }
});

// Admin / Unit Admin: Add new user
app.post('/api/admin/users', requireCanManageUsers, async (req, res) => {
  const { 
    username, password, full_name, role, target_role, role_id, manager_id,
    management_role, final_evaluator_id,
    party_title, gov_title, union_title, dept_id, birth_date, gender, phone, email 
  } = req.body;
  if (!username || !full_name) {
    return res.status(400).json({ success: false, message: 'Thiếu tên đăng nhập hoặc họ tên' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại trên hệ thống' });
  }

  const viewer = req.viewer || getViewer(req);
  const isSysAdmin = checkIsAdmin(viewer);

  // Phân quyền tạo cán bộ: Quản trị đơn vị chỉ được tạo cán bộ trong đơn vị mình quản lý
  if (!isSysAdmin && viewer?.dept_id && dept_id) {
    const allowedDepts = new Set(getDepartmentDescendantIds(viewer.dept_id));
    if (!allowedDepts.has(dept_id)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền tạo cán bộ thuộc đơn vị ngoài phạm vi quản lý của mình.' });
    }
  }

  const id = uuidv4();
  
  // Resolve legacy role and target_role from role_id if provided
  let effectiveRole = role || 'cbnv';
  let effectiveTargetRole = target_role || (effectiveRole === 'cbql' ? 'cbql' : 'cbnv');
  let effectiveRoleId = role_id;

  if (effectiveRoleId) {
    const r = db.prepare('SELECT * FROM roles WHERE id = ?').get(effectiveRoleId);
    if (r) {
      if (r.code === 'admin' || r.code === 'admin_donvi') {
        // Quản trị đơn vị không được tự nâng quyền thành Quản trị hệ thống
        if (!isSysAdmin && r.code === 'admin') {
          return res.status(403).json({ success: false, message: 'Chỉ Quản trị viên Hệ thống mới có quyền phân quyền Quản trị viên Hệ thống.' });
        }
        effectiveRole = 'admin';
        effectiveTargetRole = 'admin'; // Miễn đánh giá KPI
      } else if (r.code === 'cbql_phong' || r.code === 'ld_coquan' || r.code === 'hieu_pho' || r.data_scope === 'dept_tree' || r.data_scope === 'all') {
        effectiveRole = 'cbql';
        effectiveTargetRole = target_role || 'cbql';
      } else if (r.code === 'to_truong' || r.data_scope === 'subordinates') {
        effectiveRole = 'cbql';
        effectiveTargetRole = target_role || 'cbnv';
      } else {
        effectiveRole = 'cbnv';
        effectiveTargetRole = target_role || 'cbnv';
      }
    }
  } else {
    // find matching role
    const r = db.prepare('SELECT id, code FROM roles WHERE code = ?').get(effectiveRole);
    if (r) {
      effectiveRoleId = r.id;
      if (r.code === 'admin' || r.code === 'admin_donvi') {
        effectiveRole = 'admin';
        effectiveTargetRole = 'admin';
      }
    }
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
    INSERT INTO users (id, username, password, full_name, role, target_role, role_id, manager_id, management_role, final_evaluator_id, party_title, gov_title, union_title, dept_id, birth_date, gender, phone, email, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, username, password || '123456', full_name, effectiveRole, effectiveTargetRole,
    effectiveRoleId || null, manager_id || null, effectiveMgmtRole || 'nhan_vien', final_evaluator_id || null,
    party_title || 'Đảng viên', gov_title || 'Chuyên viên', union_title || '', dept_id || null,
    birth_date || '1985-01-01', gender || 'Nam', phone || '', email || ''
  );

  const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  // Khởi tạo các chức vụ cho cán bộ mới
  if (Array.isArray(req.body.positions) && req.body.positions.length > 0) {
    const insertPos = db.prepare(`
      INSERT INTO user_positions (id, user_id, dept_id, position_title, position_type, is_primary, management_role, role_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let hasPrimary = false;
    for (const pos of req.body.positions) {
      if (pos.dept_id && pos.position_title) {
        const isPrim = (pos.is_primary && !hasPrimary) ? 1 : 0;
        if (isPrim) hasPrimary = true;
        insertPos.run(
          pos.id || uuidv4(),
          id,
          pos.dept_id,
          pos.position_title,
          pos.position_type || 'chinh_quyen',
          isPrim,
          pos.management_role || effectiveMgmtRole || 'nhan_vien',
          pos.role_id || effectiveRoleId || null
        );
      }
    }
    if (!hasPrimary) {
      const firstPos = db.prepare('SELECT id, dept_id, position_title FROM user_positions WHERE user_id = ? LIMIT 1').get(id);
      if (firstPos) {
        db.prepare('UPDATE user_positions SET is_primary = 1 WHERE id = ?').run(firstPos.id);
        db.prepare('UPDATE users SET dept_id = ?, gov_title = ? WHERE id = ?').run(firstPos.dept_id, firstPos.position_title, id);
      }
    }
  } else if (dept_id) {
    db.prepare(`
      INSERT INTO user_positions (id, user_id, dept_id, position_title, position_type, is_primary, management_role, role_id)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      uuidv4(),
      id,
      dept_id,
      gov_title || party_title || union_title || 'Cán bộ',
      gov_title ? 'chinh_quyen' : (party_title ? 'dang' : 'doan_the'),
      effectiveMgmtRole || 'nhan_vien',
      effectiveRoleId || null
    );
  }

  await syncDirectUserToSupabase(newUser);

  res.json({ success: true, id, message: 'Đã thêm cán bộ nhân viên thành công' });
  triggerBackgroundSupabaseSync(300);
});

// Admin / Unit Admin: Update user
app.put('/api/admin/users/:id', requireCanManageUsers, async (req, res) => {
  const { id } = req.params;
  const { 
    full_name, role, target_role, role_id, manager_id,
    management_role, final_evaluator_id,
    party_title, gov_title, union_title, dept_id, birth_date, gender, phone, email, is_active, password, positions 
  } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });

  const viewer = req.viewer || getViewer(req);
  const isSysAdmin = checkIsAdmin(viewer);
  const accessibleUserIds = getAccessibleUserIds(viewer?.id);

  // Phân quyền quản lý cán bộ: Quản trị đơn vị chỉ được sửa cán bộ trong đơn vị của mình
  if (!isSysAdmin && accessibleUserIds !== null && !accessibleUserIds.includes(id)) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa cán bộ ngoài đơn vị quản lý.' });
  }

  let effectiveRole = role || user.role;
  let effectiveTargetRole = target_role !== undefined ? target_role : user.target_role;
  let effectiveRoleId = role_id !== undefined ? role_id : user.role_id;

  if (effectiveRoleId) {
    const r = db.prepare('SELECT * FROM roles WHERE id = ?').get(effectiveRoleId);
    if (r) {
      if (r.code === 'admin' || r.code === 'admin_donvi') {
        if (!isSysAdmin && r.code === 'admin') {
          return res.status(403).json({ success: false, message: 'Chỉ Quản trị viên Hệ thống mới có quyền phân quyền Quản trị viên Hệ thống.' });
        }
        effectiveRole = 'admin';
        effectiveTargetRole = 'admin';
      } else if (r.code === 'cbql_phong' || r.code === 'ld_coquan' || r.code === 'hieu_pho' || r.data_scope === 'dept_tree' || r.data_scope === 'all') {
        effectiveRole = 'cbql';
        effectiveTargetRole = target_role !== undefined ? target_role : (user.target_role || 'cbql');
      } else if (r.code === 'to_truong' || r.data_scope === 'subordinates') {
        effectiveRole = 'cbql';
        effectiveTargetRole = target_role !== undefined ? target_role : (user.target_role || 'cbnv');
      } else {
        effectiveRole = 'cbnv';
        effectiveTargetRole = target_role !== undefined ? target_role : (user.target_role || 'cbnv');
      }
    }
  } else if (effectiveRole === 'admin' || effectiveRole === 'admin_donvi') {
    effectiveRole = 'admin';
    effectiveTargetRole = 'admin';
  }

  // Quản lý danh sách chức vụ kiêm nhiệm / đa chức vụ nếu client truyền lên
  let targetDeptId = dept_id || user.dept_id;
  let targetGovTitle = gov_title !== undefined ? gov_title : user.gov_title;
  let targetMgmtRole = management_role !== undefined ? management_role : (user.management_role || 'nhan_vien');

  if (Array.isArray(positions) && positions.length > 0) {
    db.prepare('DELETE FROM user_positions WHERE user_id = ?').run(id);
    const insertPos = db.prepare(`
      INSERT INTO user_positions (id, user_id, dept_id, position_title, position_type, is_primary, management_role, role_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let primaryFound = false;
    for (const pos of positions) {
      if (pos.dept_id && pos.position_title) {
        const isPrim = (pos.is_primary && !primaryFound) ? 1 : 0;
        if (isPrim) {
          primaryFound = true;
          targetDeptId = pos.dept_id;
          targetGovTitle = pos.position_title;
          targetMgmtRole = pos.management_role || targetMgmtRole;
        }
        insertPos.run(
          pos.id || uuidv4(),
          id,
          pos.dept_id,
          pos.position_title,
          pos.position_type || 'chinh_quyen',
          isPrim,
          pos.management_role || targetMgmtRole,
          pos.role_id || effectiveRoleId || null
        );
      }
    }
    if (!primaryFound) {
      const firstPos = db.prepare('SELECT id, dept_id, position_title, management_role FROM user_positions WHERE user_id = ? LIMIT 1').get(id);
      if (firstPos) {
        db.prepare('UPDATE user_positions SET is_primary = 1 WHERE id = ?').run(firstPos.id);
        targetDeptId = firstPos.dept_id;
        targetGovTitle = firstPos.position_title;
        targetMgmtRole = firstPos.management_role || targetMgmtRole;
      }
    }
  } else if (dept_id || gov_title) {
    // Nếu cập nhật đơn lẻ, cập nhật bản ghi chức vụ chính tương ứng
    const primPos = db.prepare('SELECT id FROM user_positions WHERE user_id = ? AND is_primary = 1').get(id);
    if (primPos) {
      db.prepare(`
        UPDATE user_positions
        SET dept_id = COALESCE(?, dept_id),
            position_title = COALESCE(?, position_title),
            management_role = COALESCE(?, management_role),
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(dept_id, gov_title, management_role, primPos.id);
    } else if (dept_id) {
      db.prepare(`
        INSERT INTO user_positions (id, user_id, dept_id, position_title, position_type, is_primary, management_role)
        VALUES (?, ?, ?, ?, 'chinh_quyen', 1, ?)
      `).run(uuidv4(), id, dept_id, gov_title || 'Cán bộ', targetMgmtRole);
    }
  }

  let updateQuery = `
    UPDATE users 
    SET full_name = ?, role = ?, target_role = ?, role_id = ?, manager_id = ?,
        management_role = ?, final_evaluator_id = ?,
        party_title = ?, gov_title = ?, union_title = ?, dept_id = ?,
        birth_date = ?, gender = ?, phone = ?, email = ?, is_active = ?
  `;
  const params = [
    full_name || user.full_name, effectiveRole, effectiveTargetRole,
    effectiveRoleId || null, manager_id !== undefined ? manager_id : user.manager_id,
    targetMgmtRole,
    final_evaluator_id !== undefined ? final_evaluator_id : user.final_evaluator_id,
    party_title !== undefined ? party_title : user.party_title,
    targetGovTitle,
    union_title !== undefined ? union_title : user.union_title,
    targetDeptId,
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

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  await syncDirectUserToSupabase(updatedUser);

  res.json({ success: true, message: 'Đã cập nhật thông tin cán bộ và chức vụ thành công' });
  triggerBackgroundSupabaseSync(300);
});

// -------------------------------------------------------------
// User Positions Direct Management API
// -------------------------------------------------------------
app.get('/api/users/:id/positions', (req, res) => {
  const { id } = req.params;
  const positions = db.prepare(`
    SELECT p.*, d.name as dept_name, d.code as dept_code, r.name as role_name
    FROM user_positions p
    LEFT JOIN departments d ON p.dept_id = d.id
    LEFT JOIN roles r ON p.role_id = r.id
    WHERE p.user_id = ?
    ORDER BY p.is_primary DESC, p.created_at ASC
  `).all(id);
  res.json(positions);
});

app.post('/api/users/:id/positions', requireCanManageUsers, (req, res) => {
  const { id } = req.params;
  const { dept_id, position_title, position_type, is_primary, management_role, role_id, notes } = req.body;
  if (!dept_id || !position_title) {
    return res.status(400).json({ success: false, message: 'Thiếu đơn vị hoặc chức danh công việc' });
  }
  const posId = uuidv4();
  if (is_primary) {
    db.prepare('UPDATE user_positions SET is_primary = 0 WHERE user_id = ?').run(id);
    db.prepare('UPDATE users SET dept_id = ?, gov_title = ? WHERE id = ?').run(dept_id, position_title, id);
  }
  db.prepare(`
    INSERT INTO user_positions (id, user_id, dept_id, position_title, position_type, is_primary, management_role, role_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(posId, id, dept_id, position_title, position_type || 'chinh_quyen', is_primary ? 1 : 0, management_role || 'nhan_vien', role_id || null, notes || '');
  
  res.json({ success: true, id: posId, message: 'Đã thêm chức vụ thành công' });
});

app.put('/api/users/:id/positions/:posId', requireCanManageUsers, (req, res) => {
  const { id, posId } = req.params;
  const { dept_id, position_title, position_type, is_primary, management_role, role_id, notes } = req.body;
  const existing = db.prepare('SELECT * FROM user_positions WHERE id = ? AND user_id = ?').get(posId, id);
  if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy chức vụ' });

  if (is_primary) {
    db.prepare('UPDATE user_positions SET is_primary = 0 WHERE user_id = ?').run(id);
    db.prepare('UPDATE users SET dept_id = ?, gov_title = ? WHERE id = ?').run(dept_id || existing.dept_id, position_title || existing.position_title, id);
  }
  db.prepare(`
    UPDATE user_positions
    SET dept_id = COALESCE(?, dept_id),
        position_title = COALESCE(?, position_title),
        position_type = COALESCE(?, position_type),
        is_primary = COALESCE(?, is_primary),
        management_role = COALESCE(?, management_role),
        role_id = COALESCE(?, role_id),
        notes = COALESCE(?, notes),
        updated_at = datetime('now', 'localtime')
    WHERE id = ? AND user_id = ?
  `).run(dept_id, position_title, position_type, is_primary !== undefined ? (is_primary ? 1 : 0) : existing.is_primary, management_role, role_id, notes, posId, id);

  res.json({ success: true, message: 'Đã cập nhật chức vụ thành công' });
});

app.delete('/api/users/:id/positions/:posId', requireCanManageUsers, (req, res) => {
  const { id, posId } = req.params;
  const count = db.prepare('SELECT COUNT(*) as count FROM user_positions WHERE user_id = ?').get(id).count;
  if (count <= 1) {
    return res.status(400).json({ success: false, message: 'Không thể xóa chức vụ duy nhất của cán bộ' });
  }
  const target = db.prepare('SELECT is_primary FROM user_positions WHERE id = ? AND user_id = ?').get(posId, id);
  if (target?.is_primary) {
    return res.status(400).json({ success: false, message: 'Không thể xóa chức vụ chính. Vui lòng gán chức vụ chính khác trước khi xóa.' });
  }
  db.prepare('DELETE FROM user_positions WHERE id = ? AND user_id = ?').run(posId, id);
  res.json({ success: true, message: 'Đã xóa chức vụ kiêm nhiệm thành công' });
});

// Admin / Unit Admin: Delete or deactivate user
app.delete('/api/admin/users/:id', requireCanManageUsers, async (req, res) => {
  const { id } = req.params;
  const viewer = req.viewer || getViewer(req);
  const isSysAdmin = checkIsAdmin(viewer);
  const accessibleUserIds = getAccessibleUserIds(viewer?.id);

  if (viewer?.id === id) {
    return res.status(400).json({ success: false, message: 'Bạn không thể tự vô hiệu hoá hoặc xoá tài khoản của chính mình.' });
  }

  if (!isSysAdmin && accessibleUserIds !== null && !accessibleUserIds.includes(id)) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thao tác trên tài khoản cán bộ ngoài đơn vị quản lý.' });
  }

  const isPermanent = req.query.permanent === 'true' || req.body?.permanent === true;

  if (isPermanent) {
    // Xoá vĩnh viễn (Hard delete): Dọn dẹp ràng buộc khoá ngoại và xoá triệt để
    const deleteSqlite = db.transaction(() => {
      db.prepare('DELETE FROM evaluation_criteria_details WHERE evaluation_id IN (SELECT id FROM evaluations WHERE user_id = ?)').run(id);
      db.prepare('DELETE FROM evaluations WHERE user_id = ? OR returned_by = ?').run(id, id);
      db.prepare('DELETE FROM assigned_tasks WHERE user_id = ? OR assigned_by = ?').run(id, id);
      db.prepare('DELETE FROM votes WHERE user_id = ? OR voter_id = ?').run(id, id);
      db.prepare('UPDATE users SET manager_id = NULL WHERE manager_id = ?').run(id);
      db.prepare('UPDATE users SET final_evaluator_id = NULL WHERE final_evaluator_id = ?').run(id);
      db.prepare('UPDATE departments SET leader_id = NULL WHERE leader_id = ?').run(id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    deleteSqlite();

    // Xoá đồng bộ tức thì trên Supabase Cloud
    await deleteUserFromSupabase(id);

    return res.json({ success: true, message: 'Đã xóa vĩnh viễn tài khoản cán bộ và dọn dẹp các dữ liệu liên quan thành công.' });
  }

  // Xoá mềm / Ngừng kích hoạt (Khoá tài khoản)
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
  const deactivatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (deactivatedUser) await syncDirectUserToSupabase(deactivatedUser);

  res.json({ success: true, message: 'Đã ngừng kích hoạt tài khoản cán bộ' });
  triggerBackgroundSupabaseSync(300);
});

// Admin / Unit Admin: Kích hoạt lại hoặc khoá tài khoản cán bộ
app.put('/api/admin/users/:id/status', requireCanManageUsers, async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body || {};
  const viewer = req.viewer || getViewer(req);
  const isSysAdmin = checkIsAdmin(viewer);
  const accessibleUserIds = getAccessibleUserIds(viewer?.id);

  if (viewer?.id === id) {
    return res.status(400).json({ success: false, message: 'Bạn không thể thay đổi trạng thái tài khoản của chính mình.' });
  }

  if (!isSysAdmin && accessibleUserIds !== null && !accessibleUserIds.includes(id)) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thao tác trên tài khoản cán bộ ngoài đơn vị quản lý.' });
  }

  const newStatus = is_active ? 1 : 0;
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, id);
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (updatedUser) await syncDirectUserToSupabase(updatedUser);

  res.json({ 
    success: true, 
    message: newStatus === 1 ? 'Đã mở khoá và kích hoạt lại tài khoản cán bộ thành công' : 'Đã khoá tài khoản cán bộ thành công',
    is_active: newStatus 
  });
  triggerBackgroundSupabaseSync(300);
});

// Admin / Unit Admin: Reset / Re-issue user password
app.post('/api/admin/users/:id/reset-password', requireCanManageUsers, async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body || {};
  const passwordToSet = new_password && new_password.trim() ? new_password.trim() : '123456';

  if (passwordToSet.length < 6) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  }

  const viewer = req.viewer || getViewer(req);
  const isSysAdmin = checkIsAdmin(viewer);
  const accessibleUserIds = getAccessibleUserIds(viewer?.id);

  if (!isSysAdmin && accessibleUserIds !== null && !accessibleUserIds.includes(id)) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền cấp lại mật khẩu cho cán bộ ngoài đơn vị quản lý.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy cán bộ' });
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(passwordToSet, id);
  const updatedUserWithPass = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (updatedUserWithPass) await syncDirectUserToSupabase(updatedUserWithPass);

  res.json({ 
    success: true, 
    message: `Đã cấp lại mật khẩu cho cán bộ "${user.full_name}" thành công!`, 
    new_password: passwordToSet 
  });
  triggerBackgroundSupabaseSync(300);
});

// Admin / Unit Admin: Download Excel template for user import
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

// Admin / Unit Admin: Import users from Excel
app.post('/api/admin/users/import', upload.single('file'), requireCanManageUsers, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng đính kèm file Excel (.xlsx) danh sách cán bộ' });
    }

    const updateExisting = req.body?.update_existing === 'true' || req.body?.update_existing === true || req.body?.update_existing === '1';
    const fileSource = req.file.buffer || req.file.path;
    const result = await importUsersFromExcel(fileSource, { updateExisting });

    // Clean up temporary uploaded file if on disk
    try {
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (e) {}

    res.json({
      success: true,
      message: `Đã xử lý file thành công: Thêm mới ${result.importedCount} cán bộ, Cập nhật ${result.updatedCount} cán bộ, Bỏ qua ${result.skippedCount}`,
      ...result
    });
    triggerBackgroundSupabaseSync();
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
  const { period_id, axis_code, dept_code, include_proposals } = req.query;
  const viewer = getViewer(req);
  const isManager = viewer ? checkIsManagerOrAdmin(viewer) : false;

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
    query += ' AND (dept_code = ? OR dept_code IS NULL OR dept_code = "")';
    params.push(dept_code);
  }

  // Quản lý hiển thị trạng thái đề xuất:
  // - Nếu là CBQL/Admin hoặc yêu cầu include_proposals: hiển thị tất cả
  // - Nếu là CBNV: hiển thị các nhiệm vụ Hoạt động/Khoá DÙNG CHUNG TOÀN CƠ QUAN, VÀ các đề xuất của chính CBNV đó
  if (include_proposals === 'true' || isManager) {
    // Show all
  } else if (viewer?.id) {
    query += " AND (status != 'pending_approval' OR proposed_by = ?)";
    params.push(viewer.id);
  } else {
    query += " AND (status IS NULL OR status = 'Hoạt động' OR status = 'Tạm khóa' OR status = 'Khoá')";
  }

  query += ' ORDER BY axis_code, deadline ASC';

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// CBNV gửi đề xuất Thêm mới hoặc Sửa công việc chuẩn
app.post('/api/standard-tasks/propose', (req, res) => {
  const {
    period_id, dept_code, task_name, output_result, deadline,
    task_type, standard_score, difficulty_weight, expected_evidence, note, axis_code,
    proposal_type, proposal_note, original_task_id
  } = req.body;

  const viewer = getViewer(req);
  const viewerId = viewer?.id || getViewerId(req);
  const proposerName = viewer?.full_name || 'Cán bộ';

  if (!task_name || !task_name.trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên công việc chuẩn' });
  }

  const id = uuidv4();
  const stdScore = parseFloat(standard_score) || (task_type === 'Đột xuất' ? 12 : 10);
  const diffWeight = parseFloat(difficulty_weight) || 1.0;
  const maxConv = Number((stdScore * diffWeight).toFixed(2));

  db.prepare(`
    INSERT INTO standard_tasks (
      id, period_id, dept_code, task_name, output_result, deadline,
      task_type, standard_score, difficulty_weight, max_converted_score,
      expected_evidence, note, axis_code, status,
      proposed_by, proposed_by_name, proposal_type, proposal_note, original_task_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?, ?, ?, ?)
  `).run(
    id, period_id || null, dept_code || null, task_name.trim(), output_result || null, deadline || null,
    task_type || 'Thường xuyên', stdScore, diffWeight, maxConv,
    expected_evidence || '', note || '', axis_code || null,
    viewerId, proposerName, proposal_type || 'add', proposal_note || '', original_task_id || null
  );

  triggerBackgroundSupabaseSync();

  res.json({
    success: true,
    id,
    message: proposal_type === 'edit'
      ? 'Đã gửi đề xuất sửa đổi công việc chuẩn đến Lãnh đạo phê duyệt thành công!'
      : 'Đã gửi đề xuất thêm công việc chuẩn mới đến Lãnh đạo phê duyệt thành công!'
  });
});

// Lãnh đạo / CBQL / Admin phê duyệt đề xuất công việc chuẩn
app.put('/api/standard-tasks/:id/approve-proposal', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const viewer = getViewer(req);
  const viewerId = viewer?.id || getViewerId(req);

  const proposal = db.prepare('SELECT * FROM standard_tasks WHERE id = ?').get(id);
  if (!proposal) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất công việc chuẩn' });
  }

  if (proposal.proposal_type === 'edit' && proposal.original_task_id) {
    // Cập nhật công việc gốc
    db.prepare(`
      UPDATE standard_tasks
      SET task_name = ?,
          output_result = ?,
          deadline = ?,
          task_type = ?,
          standard_score = ?,
          difficulty_weight = ?,
          max_converted_score = ?,
          expected_evidence = ?,
          note = ?,
          axis_code = ?,
          status = 'Hoạt động'
      WHERE id = ?
    `).run(
      proposal.task_name,
      proposal.output_result,
      proposal.deadline,
      proposal.task_type,
      proposal.standard_score,
      proposal.difficulty_weight,
      proposal.max_converted_score,
      proposal.expected_evidence,
      proposal.note,
      proposal.axis_code,
      proposal.original_task_id
    );

    // Xóa bản ghi đề xuất tạm sau khi đã merge vào bản gốc
    db.prepare('DELETE FROM standard_tasks WHERE id = ?').run(id);
  } else {
    // Đề xuất thêm mới: chuyển thành Hoạt động
    db.prepare(`
      UPDATE standard_tasks
      SET status = 'Hoạt động',
          approved_by = ?,
          approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(viewerId, id);
  }

  triggerBackgroundSupabaseSync();

  res.json({ success: true, message: 'Đã phê duyệt đề xuất thành công! Công việc đã được cập nhật vào Danh mục chuẩn chung.' });
});

// Lãnh đạo từ chối đề xuất
app.put('/api/standard-tasks/:id/reject-proposal', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { rejection_reason } = req.body;
  const viewer = getViewer(req);
  const viewerId = viewer?.id || getViewerId(req);

  const proposal = db.prepare('SELECT * FROM standard_tasks WHERE id = ?').get(id);
  if (!proposal) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
  }

  db.prepare(`
    UPDATE standard_tasks
    SET status = 'rejected',
        rejection_reason = ?,
        approved_by = ?,
        approved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(rejection_reason || 'Không phù hợp với tiêu chuẩn chung của đơn vị', viewerId, id);

  triggerBackgroundSupabaseSync();

  res.json({ success: true, message: 'Đã từ chối đề xuất công việc chuẩn.' });
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
    let fileSource;
    if (req.file) {
      fileSource = req.file.buffer || req.file.path;
    } else {
      // Use existing demo file if no file uploaded
      const candidates = [
        path.join(__dirname, 'mau-import-new-san-pham-cong-viec-chuan.xlsx'),
        path.join(__dirname, '..', 'mau-import-new-san-pham-cong-viec-chuan.xlsx'),
        path.join(process.cwd(), 'mau-import-new-san-pham-cong-viec-chuan.xlsx'),
        path.join(process.cwd(), 'backend', 'mau-import-new-san-pham-cong-viec-chuan.xlsx')
      ];
      fileSource = candidates.find(p => fs.existsSync(p)) || candidates[0];
    }

    const { period_id } = req.body || {};
    const updateExisting = req.body?.update_existing !== undefined
      ? (req.body.update_existing === 'true' || req.body.update_existing === true || req.body.update_existing === '1')
      : true;

    const result = await importStandardTasksFromExcel(fileSource, period_id, { updateExisting });

    // Clean up temporary uploaded file if on disk
    try {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (e) {}

    // Dereference buffer/file immediately to free memory on 512MB RAM containers like Render
    fileSource = null;
    if (req.file) {
      req.file.buffer = null;
      req.file = null;
    }

    if (result.importedCount === 0 && (result.skippedCount || 0) === 0) {
      return res.status(400).json({
        success: false,
        importedCount: 0,
        message: `Không tìm thấy dòng công việc hợp lệ nào trong file Excel (Sheet: "${result.sheetName || 'Mặc định'}"). Vui lòng kiểm tra cột "Tên công việc" hoặc tải file mẫu chuẩn để đối chiếu.`
      });
    }

    let detailMsg = `Đã nạp thành công ${result.importedCount} công việc chuẩn`;
    if (result.insertedCount > 0 && result.updatedCount > 0) {
      detailMsg += ` (Thêm mới ${result.insertedCount}, Cập nhật ${result.updatedCount}${result.skippedCount > 0 ? `, Bỏ qua ${result.skippedCount}` : ''})`;
    } else if (result.updatedCount > 0) {
      detailMsg += ` (Đã cập nhật ${result.updatedCount} công việc có sẵn${result.skippedCount > 0 ? `, Bỏ qua ${result.skippedCount}` : ''})`;
    } else if (result.insertedCount > 0) {
      detailMsg += ` (Thêm mới ${result.insertedCount}${result.skippedCount > 0 ? `, Bỏ qua ${result.skippedCount}` : ''})`;
    } else if (result.skippedCount > 0) {
      detailMsg = `Đã bỏ qua ${result.skippedCount} công việc do đã tồn tại trong danh mục`;
    }

    res.json({ success: true, message: detailMsg, ...result });
    triggerBackgroundSupabaseSync();
  } catch (error) {
    console.error('Import error:', error);
    let userMsg = error.message;
    if (error.message && (error.message.includes("Can't find end of central directory") || error.message.includes('invalid zip') || error.message.includes('corrupted'))) {
      userMsg = 'Định dạng file không hợp lệ hoặc bị lỗi. Vui lòng đảm bảo file có định dạng Excel (.xlsx) chuẩn.';
    }
    res.status(500).json({ success: false, message: userMsg });
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
  deleteStandardTasksFromSupabase([id]);
  triggerBackgroundSupabaseSync();
  res.json({ success: true, message: 'Đã xóa công việc chuẩn khỏi danh mục thành công' });
});

// Bulk delete standard tasks (Xóa nhiều công việc chuẩn cùng lúc)
app.post('/api/standard-tasks/bulk-delete', requireManagerOrAdmin, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất một công việc chuẩn để xóa' });
  }

  // Transactionally delete from SQLite
  const runBulkDelete = db.transaction(() => {
    const placeholders = ids.map(() => '?').join(', ');
    const stmt = db.prepare(`DELETE FROM standard_tasks WHERE id IN (${placeholders})`);
    return stmt.run(...ids);
  });

  const result = runBulkDelete();

  // Async delete from Supabase Cloud and trigger background sync
  deleteStandardTasksFromSupabase(ids);
  triggerBackgroundSupabaseSync();

  res.json({ 
    success: true, 
    deletedCount: result.changes, 
    message: `Đã xóa thành công ${result.changes} công việc chuẩn khỏi danh mục` 
  });
});

// -------------------------------------------------------------
// 3. Assigned Tasks (Giao việc & Tự đăng ký việc)
// -------------------------------------------------------------

// Helper xác định người đánh giá/chấm điểm nhiệm vụ:
// - Việc do CBQL giao: Mặc định là Người giao việc (assigned_by)
// - Việc tự đăng ký / không có người giao: Mặc định là Lãnh đạo đơn vị
// - Việc đã được Lãnh đạo đơn vị ủy quyền: Gán cho Quản lý được chỉ định
function resolveTaskEvaluator(task, db) {
  if (!task) return { evaluator_id: null, evaluator_type: 'assigner' };

  // 1. Nếu đã có người được chỉ định hoặc ủy quyền:
  if (task.evaluator_id) {
    return { 
      evaluator_id: task.evaluator_id, 
      evaluator_type: task.evaluator_type || (task.delegated_by ? 'delegated_manager' : 'assigner') 
    };
  }

  // 2. Nếu là việc do người khác giao (có assigned_by và khác user_id):
  if (task.assigned_by && task.assigned_by !== task.user_id) {
    return { evaluator_id: task.assigned_by, evaluator_type: 'assigner' };
  }

  // 3. Nếu là việc tự đăng ký hoặc không có người giao cụ thể: Tự động gửi đến Lãnh đạo đơn vị
  const taskUser = db.prepare('SELECT * FROM users WHERE id = ?').get(task.user_id);
  let leaderId = null;

  if (taskUser?.dept_id) {
    const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(taskUser.dept_id);
    if (dept?.leader_id && dept.leader_id !== task.user_id) {
      leaderId = dept.leader_id;
    }
    if (!leaderId) {
      const deptLeader = db.prepare(`
        SELECT id FROM users 
        WHERE dept_id = ? AND management_role = 'lanh_dao' AND id != ?
        LIMIT 1
      `).get(taskUser.dept_id, task.user_id);
      if (deptLeader) leaderId = deptLeader.id;
    }
  }

  if (!leaderId && taskUser?.final_evaluator_id && taskUser.final_evaluator_id !== task.user_id) {
    leaderId = taskUser.final_evaluator_id;
  }
  if (!leaderId && taskUser?.manager_id && taskUser.manager_id !== task.user_id) {
    leaderId = taskUser.manager_id;
  }
  if (!leaderId) {
    const anyLeader = db.prepare(`
      SELECT id FROM users 
      WHERE management_role = 'lanh_dao' AND id != ?
      LIMIT 1
    `).get(task.user_id);
    if (anyLeader) leaderId = anyLeader.id;
  }

  return { evaluator_id: leaderId, evaluator_type: 'leader' };
}

app.get('/api/assigned-tasks', (req, res) => {
  const { period_id, user_id, status, axis_code, origin, assigned_by, evaluator_id } = req.query;
  const viewerId = getViewerId(req);
  const accessibleUserIds = getAccessibleUserIds(viewerId);

  let query = `
    SELECT t.*, u.full_name as user_name, u.role as user_role, d.name as dept_name,
           assigner.full_name as assigner_name,
           mgr.full_name as manager_name,
           fe.full_name as final_evaluator_name,
           ext_rev.full_name as extension_reviewed_by_name,
           eval_u.full_name as evaluator_name,
           eval_u.gov_title as evaluator_title,
           eval_u.role as evaluator_role,
           eval_u.management_role as evaluator_management_role,
           del_by.full_name as delegated_by_name,
           CASE 
             WHEN eval_u.full_name IS NOT NULL THEN eval_u.full_name
             WHEN t.origin = 'assigned' AND assigner.full_name IS NOT NULL THEN assigner.full_name
             WHEN t.origin = 'assigned' THEN 'Người giao việc'
             ELSE COALESCE(fe.full_name, mgr.full_name, 'Lãnh đạo đơn vị')
           END as grader_name
    FROM assigned_tasks t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN users assigner ON t.assigned_by = assigner.id
    LEFT JOIN users mgr ON u.manager_id = mgr.id
    LEFT JOIN users fe ON u.final_evaluator_id = fe.id
    LEFT JOIN users ext_rev ON t.extension_reviewed_by = ext_rev.id
    LEFT JOIN users eval_u ON t.evaluator_id = eval_u.id
    LEFT JOIN users del_by ON t.delegated_by = del_by.id
    WHERE 1=1
  `;
  const params = [];

  // Data isolation: Lọc theo thẩm quyền của người xem (hoặc các nhiệm vụ do chính người xem giao việc, hoặc được ủy quyền đánh giá)
  if (accessibleUserIds !== null) {
    if (accessibleUserIds.length === 0) {
      return res.json([]);
    }
    const placeholders = accessibleUserIds.map(() => '?').join(',');
    query += ` AND (t.user_id IN (${placeholders}) OR t.assigned_by = ? OR t.evaluator_id = ?)`;
    params.push(...accessibleUserIds, viewerId, viewerId);
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
  if (evaluator_id) {
    query += ' AND t.evaluator_id = ?';
    params.push(evaluator_id);
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
  query += ` ORDER BY 
    CASE WHEN t.axis_code IS NULL OR t.axis_code = '' THEN 'ZZZ' ELSE t.axis_code END ASC,
    CASE WHEN t.deadline IS NULL OR t.deadline = '' THEN '9999-12-31' ELSE t.deadline END ASC,
    t.created_at DESC`;

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// Lấy thông tin chi tiết 1 nhiệm vụ theo ID
app.get('/api/assigned-tasks/:id', (req, res) => {
  const { id } = req.params;
  const task = db.prepare(`
    SELECT t.*, u.full_name as user_name, u.role as user_role, u.gov_title as user_title, d.name as dept_name,
           assigner.full_name as assigner_name,
           mgr.full_name as manager_name,
           fe.full_name as final_evaluator_name,
           ext_rev.full_name as extension_reviewed_by_name,
           eval_u.full_name as evaluator_name,
           eval_u.gov_title as evaluator_title,
           eval_u.role as evaluator_role,
           eval_u.management_role as evaluator_management_role,
           del_by.full_name as delegated_by_name
    FROM assigned_tasks t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN users assigner ON t.assigned_by = assigner.id
    LEFT JOIN users mgr ON u.manager_id = mgr.id
    LEFT JOIN users fe ON u.final_evaluator_id = fe.id
    LEFT JOIN users ext_rev ON t.extension_reviewed_by = ext_rev.id
    LEFT JOIN users eval_u ON t.evaluator_id = eval_u.id
    LEFT JOIN users del_by ON t.delegated_by = del_by.id
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy nhiệm vụ!' });
  }
  res.json({ success: true, data: task });
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

  // Guard: Không giao việc KPI cho tài khoản admin / quản trị đơn vị nghiệp vụ (miễn đánh giá)
  const exemptUsers = db.prepare(`
    SELECT id, full_name, role, target_role, role_id 
    FROM users 
    WHERE id IN (${targetUserIds.map(() => '?').join(',')}) 
      AND (role IN ('admin', 'admin_donvi') OR target_role IN ('admin', 'admin_donvi', 'none', 'exempt') OR role_id = 'role-admin-donvi')
  `).all(...targetUserIds);
  if (exemptUsers.length > 0) {
    return res.status(400).json({ 
      success: false, 
      message: `Tài khoản (${exemptUsers.map(u => u.full_name).join(', ')}) là tài khoản quản trị chức năng / miễn đánh giá, không áp dụng giao việc KPI cá nhân.` 
    });
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
  } else if (req.body.group_id) {
    const groupMembers = db.prepare('SELECT user_id FROM user_group_members WHERE group_id = ?').all(req.body.group_id);
    targetUserIds = groupMembers.map(gm => gm.user_id);
  } else if (Array.isArray(req.body.job_titles) && req.body.job_titles.length > 0) {
    const placeholders = req.body.job_titles.map(() => '?').join(',');
    const foundUsers = db.prepare(`SELECT id FROM users WHERE (gov_title IN (${placeholders}) OR party_title IN (${placeholders})) AND COALESCE(is_active, 1) = 1`).all(...req.body.job_titles, ...req.body.job_titles);
    targetUserIds = foundUsers.map(u => u.id);
  }

  if (targetUserIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Không tìm thấy cán bộ nào trong nhóm hoặc chức danh đã chọn' });
  }

  // Guard: Không giao việc KPI cho tài khoản admin / quản trị đơn vị nghiệp vụ (miễn đánh giá)
  const exemptUsers = db.prepare(`
    SELECT id, full_name, role, target_role, role_id 
    FROM users 
    WHERE id IN (${targetUserIds.map(() => '?').join(',')}) 
      AND (role IN ('admin', 'admin_donvi') OR target_role IN ('admin', 'admin_donvi', 'none', 'exempt') OR role_id = 'role-admin-donvi')
  `).all(...targetUserIds);
  if (exemptUsers.length > 0) {
    return res.status(400).json({ 
      success: false, 
      message: `Tài khoản (${exemptUsers.map(u => u.full_name).join(', ')}) là tài khoản quản trị chức năng / miễn đánh giá, không áp dụng giao việc KPI cá nhân.` 
    });
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

  // Guard: Không áp dụng đăng ký công việc cá nhân cho tài khoản admin/chức năng
  const targetUser = db.prepare(`
    SELECT u.*, r.code as role_code, r.permissions 
    FROM users u 
    LEFT JOIN roles r ON u.role_id = r.id 
    WHERE u.id = ?
  `).get(user_id);
  if (isExemptFromEvaluation(targetUser)) {
    return res.status(400).json({
      success: false,
      message: 'Tài khoản Quản trị viên / Chức năng là tài khoản nghiệp vụ kỹ thuật, không áp dụng tự đăng ký KPI cá nhân.'
    });
  }

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

// CBNV Cập nhật Kết quả & Minh chứng (Hỗ trợ nộp file mới hoặc kế thừa từ cấp dưới, lưu nháp hoặc gửi đánh giá)
app.post('/api/assigned-tasks/:id/evidence', upload.single('evidence_file'), async (req, res) => {
  const { id } = req.params;
  const { 
    actual_finish_date, 
    evidence_text, 
    detailed_result_note,
    result_note,
    document_number,
    document_date,
    self_quality_pct, 
    is_bonus_proposed, 
    bonus_reason,
    is_draft,
    action,
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
  const noteContent = detailed_result_note !== undefined ? detailed_result_note : (result_note || '');

  const isDraft = is_draft === 'true' || is_draft === true || action === 'draft';
  const targetStatus = isDraft ? (task.status === 'approved' ? 'approved' : 'in_progress') : 'submitted';

  const scores = calculateScores(task.standard_score, task.difficulty_weight, progressPct, qualityPct, false);

  const { evaluator_id: defaultEvalId, evaluator_type: defaultEvalType } = resolveTaskEvaluator(task, db);
  const effectiveEvaluatorId = task.evaluator_id || defaultEvalId;
  const effectiveEvaluatorType = task.evaluator_type || defaultEvalType;

  db.prepare(`
    UPDATE assigned_tasks
    SET actual_finish_date = ?, evidence_text = ?, detailed_result_note = ?, evidence_file_url = ?, evidence_file_name = ?,
        document_number = ?, document_date = ?,
        progress_pct = ?, quality_pct = ?, execution_score = ?, converted_score = ?,
        is_bonus_proposed = ?, bonus_reason = ?,
        inherited_from_task_id = ?, inherited_from_user_name = ?,
        evaluator_id = COALESCE(evaluator_id, ?),
        evaluator_type = COALESCE(evaluator_type, ?),
        submitted_for_eval_at = CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE submitted_for_eval_at END,
        status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    finishDate, evidence_text || '', noteContent || '', fileUrl, fileName,
    document_number || '', document_date || '',
    progressPct, qualityPct, scores.executionScore, scores.convertedScore,
    proposeBonus, bonus_reason || '',
    inherited_from_task_id || null, inherited_from_user_name || null,
    effectiveEvaluatorId, effectiveEvaluatorType,
    targetStatus, targetStatus, id
  );

  // Gửi thông báo đến người nhận đánh giá chỉ khi KHÔNG PHẢI lưu nháp
  if (!isDraft && effectiveEvaluatorId && effectiveEvaluatorId !== task.user_id) {
    const taskUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(task.user_id);
    createNotification({
      userId: effectiveEvaluatorId,
      title: 'Nhiệm vụ hoàn thành chờ đánh giá',
      message: `Cán bộ ${taskUser?.full_name || 'Cán bộ'} đã hoàn thành và gửi đánh giá công việc: "${task.task_name}".`,
      type: 'task_submitted',
      taskId: id,
      tab: 'grading'
    });
  }

  triggerBackgroundSupabaseSync();

  const evaluatorUser = effectiveEvaluatorId ? db.prepare('SELECT full_name, gov_title FROM users WHERE id = ?').get(effectiveEvaluatorId) : null;
  const evaluatorDesc = evaluatorUser 
    ? `${evaluatorUser.full_name}${evaluatorUser.gov_title ? ` (${evaluatorUser.gov_title})` : ''}`
    : (effectiveEvaluatorType === 'leader' ? 'Lãnh đạo đơn vị' : 'Người giao việc');

  const returnMessage = isDraft 
    ? 'Đã lưu bản nháp minh chứng và kết quả thực hiện thành công!'
    : `Đã cập nhật kết quả và gửi đánh giá thành công đến ${evaluatorDesc}!`;

  res.json({ 
    success: true, 
    message: returnMessage, 
    ...scores, 
    progressPct,
    isDraft,
    status: targetStatus,
    evaluator_id: effectiveEvaluatorId,
    evaluator_name: evaluatorUser?.full_name || evaluatorDesc,
    evaluator_type: effectiveEvaluatorType
  });
});

// CBNV Xác nhận hoàn thành và Gửi đánh giá cho từng nhiệm vụ (Per-task evaluation submit)
app.post('/api/assigned-tasks/:id/submit-for-eval', (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = getViewerId(req);
    const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
    if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    if (viewerId && task.user_id !== viewerId) {
      const viewer = db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId);
      if (viewer?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền gửi đánh giá công việc của cán bộ khác' });
      }
    }

    const { evaluator_id: defaultEvalId, evaluator_type: defaultEvalType } = resolveTaskEvaluator(task, db);
    const effectiveEvaluatorId = task.evaluator_id || defaultEvalId;
    const effectiveEvaluatorType = task.evaluator_type || defaultEvalType;

    const finishDate = task.actual_finish_date || new Date().toISOString().split('T')[0];
    const progressPct = calculateProgressPct(task.deadline, finishDate);
    const qualityPct = task.quality_pct !== undefined && task.quality_pct !== null ? task.quality_pct : 1.0;
    const scores = calculateScores(task.standard_score, task.difficulty_weight, progressPct, qualityPct, false);

    db.prepare(`
      UPDATE assigned_tasks
      SET status = 'submitted',
          actual_finish_date = COALESCE(actual_finish_date, ?),
          progress_pct = ?,
          execution_score = ?,
          converted_score = ?,
          evaluator_id = COALESCE(evaluator_id, ?),
          evaluator_type = COALESCE(evaluator_type, ?),
          submitted_for_eval_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(finishDate, progressPct, scores.executionScore, scores.convertedScore, effectiveEvaluatorId, effectiveEvaluatorType, id);

    if (effectiveEvaluatorId && effectiveEvaluatorId !== task.user_id) {
      const taskUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(task.user_id);
      createNotification({
        userId: effectiveEvaluatorId,
        title: 'Nhiệm vụ hoàn thành chờ đánh giá',
        message: `Cán bộ ${taskUser?.full_name || 'Cán bộ'} đã hoàn thành và gửi đánh giá công việc: "${task.task_name}".`,
        type: 'task_submitted',
        taskId: id,
        tab: 'grading'
      });
    }

    triggerBackgroundSupabaseSync();

    const evaluatorUser = effectiveEvaluatorId ? db.prepare('SELECT full_name, gov_title FROM users WHERE id = ?').get(effectiveEvaluatorId) : null;
    const evaluatorDesc = evaluatorUser 
      ? `${evaluatorUser.full_name}${evaluatorUser.gov_title ? ` (${evaluatorUser.gov_title})` : ''}`
      : (effectiveEvaluatorType === 'leader' ? 'Lãnh đạo đơn vị' : 'Người giao việc');

    res.json({
      success: true,
      message: `Đã gửi đánh giá công việc thành công! Hệ thống đã chuyển đến: ${evaluatorDesc}`,
      evaluator_id: effectiveEvaluatorId,
      evaluator_name: evaluatorUser?.full_name || evaluatorDesc,
      evaluator_type: effectiveEvaluatorType
    });
  } catch (err) {
    console.error('[Submit For Eval] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi gửi đánh giá: ' + err.message });
  }
});

// Lãnh đạo đơn vị Chuyển quyền đánh giá công việc cho Quản lý (Delegation of Evaluation Authority)
app.post('/api/assigned-tasks/:id/delegate-evaluator', requireManagerOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { target_manager_id, delegation_note } = req.body;
    const viewerId = getViewerId(req);
    const viewer = viewerId ? db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) : null;

    if (!target_manager_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn Cán bộ Quản lý nhận chuyển quyền đánh giá' });
    }

    const task = db.prepare(`
      SELECT t.*, u.full_name as user_name, u.dept_id
      FROM assigned_tasks t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(id);
    if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    // Kiểm tra thẩm quyền của người chuyển quyền: Phải là Lãnh đạo đơn vị, Admin, hoặc Trưởng phòng ban
    const dept = task.dept_id ? db.prepare('SELECT * FROM departments WHERE id = ?').get(task.dept_id) : null;
    const isDeptLeader = dept?.leader_id && dept.leader_id === viewerId;
    const isLeaderRole = viewer?.management_role === 'lanh_dao' || viewer?.role === 'admin';
    const isCurrentEvaluator = task.evaluator_id === viewerId;

    if (!isLeaderRole && !isDeptLeader && !isCurrentEvaluator) {
      return res.status(403).json({
        success: false,
        message: 'Chỉ Lãnh đạo đơn vị hoặc người được phân công đánh giá mới có quyền chuyển quyền đánh giá công việc này'
      });
    }

    // Kiểm tra người nhận chuyển quyền (target_manager_id): Phải tồn tại và không phải chính người thực hiện
    const targetManager = db.prepare('SELECT * FROM users WHERE id = ?').get(target_manager_id);
    if (!targetManager) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin Cán bộ Quản lý được chỉ định' });
    }

    if (targetManager.id === task.user_id) {
      return res.status(400).json({
        success: false,
        message: 'Không thể chuyển quyền đánh giá công việc cho chính cán bộ thực hiện nhiệm vụ!'
      });
    }

    // Cập nhật CSDL
    db.prepare(`
      UPDATE assigned_tasks
      SET evaluator_id = ?,
          evaluator_type = 'delegated_manager',
          delegated_by = ?,
          delegated_at = CURRENT_TIMESTAMP,
          delegation_note = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(targetManager.id, viewerId, delegation_note || '', id);

    // Gửi thông báo đến Quản lý được phân công
    createNotification({
      userId: targetManager.id,
      title: 'Được chuyển quyền đánh giá công việc',
      message: `Lãnh đạo đơn vị (${viewer?.full_name || 'Lãnh đạo'}) đã chuyển quyền thẩm định & đánh giá công việc "${task.task_name}" của cán bộ ${task.user_name} cho bạn.${delegation_note ? ` Ghi chú: ${delegation_note}` : ''}`,
      type: 'eval_delegated',
      taskId: id,
      tab: 'grading'
    });

    triggerBackgroundSupabaseSync();

    res.json({
      success: true,
      message: `Đã chuyển quyền đánh giá công việc "${task.task_name}" cho Cán bộ Quản lý ${targetManager.full_name} thành công!`,
      evaluator_id: targetManager.id,
      evaluator_name: targetManager.full_name,
      evaluator_type: 'delegated_manager',
      delegated_by_name: viewer?.full_name || 'Lãnh đạo đơn vị'
    });
  } catch (err) {
    console.error('[Delegate Evaluator] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi chuyển quyền đánh giá: ' + err.message });
  }
});

// Lãnh đạo đơn vị Chuyển quyền đánh giá hàng loạt (Bulk Delegation)
app.post('/api/assigned-tasks/bulk-delegate-evaluator', requireManagerOrAdmin, (req, res) => {
  try {
    const { task_ids, target_manager_id, delegation_note } = req.body;
    const viewerId = getViewerId(req);
    const viewer = viewerId ? db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) : null;

    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất một nhiệm vụ để chuyển quyền' });
    }
    if (!target_manager_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn Cán bộ Quản lý nhận chuyển quyền' });
    }

    const targetManager = db.prepare('SELECT * FROM users WHERE id = ?').get(target_manager_id);
    if (!targetManager) return res.status(404).json({ success: false, message: 'Không tìm thấy Quản lý được chỉ định' });

    const isLeaderRole = viewer?.management_role === 'lanh_dao' || viewer?.role === 'admin';
    if (!isLeaderRole) {
      return res.status(403).json({ success: false, message: 'Chỉ Lãnh đạo đơn vị hoặc Quản trị viên mới có quyền chuyển quyền đánh giá hàng loạt' });
    }

    let updatedCount = 0;
    const updateStmt = db.prepare(`
      UPDATE assigned_tasks
      SET evaluator_id = ?,
          evaluator_type = 'delegated_manager',
          delegated_by = ?,
          delegated_at = CURRENT_TIMESTAMP,
          delegation_note = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id != ?
    `);

    db.transaction(() => {
      for (const taskId of task_ids) {
        const result = updateStmt.run(targetManager.id, viewerId, delegation_note || '', taskId, targetManager.id);
        updatedCount += result.changes;
      }
    })();

    createNotification({
      userId: targetManager.id,
      title: 'Được chuyển quyền đánh giá nhiệm vụ',
      message: `Lãnh đạo đơn vị (${viewer?.full_name || 'Lãnh đạo'}) đã chuyển quyền đánh giá ${updatedCount} nhiệm vụ cho bạn.`,
      type: 'eval_delegated',
      tab: 'grading'
    });

    triggerBackgroundSupabaseSync();

    res.json({
      success: true,
      message: `Đã chuyển quyền đánh giá thành công ${updatedCount} nhiệm vụ cho Cán bộ Quản lý ${targetManager.full_name}!`,
      updatedCount
    });
  } catch (err) {
    console.error('[Bulk Delegate Evaluator] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi chuyển quyền hàng loạt: ' + err.message });
  }
});

// Lãnh đạo đơn vị Thu hồi quyền đánh giá công việc (Revoke Delegation)
app.post('/api/assigned-tasks/:id/revoke-delegation', requireManagerOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = getViewerId(req);
    const viewer = viewerId ? db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) : null;

    const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
    if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

    const isLeaderRole = viewer?.management_role === 'lanh_dao' || viewer?.role === 'admin';
    const isDelegator = task.delegated_by === viewerId;

    if (!isLeaderRole && !isDelegator) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền thu hồi quyền đánh giá nhiệm vụ này' });
    }

    db.prepare(`
      UPDATE assigned_tasks
      SET evaluator_id = ?,
          evaluator_type = 'leader',
          delegated_by = NULL,
          delegated_at = NULL,
          delegation_note = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(viewerId, id);

    triggerBackgroundSupabaseSync();

    res.json({
      success: true,
      message: `Đã thu hồi quyền đánh giá nhiệm vụ "${task.task_name}" về cho Lãnh đạo đơn vị thành công!`
    });
  } catch (err) {
    console.error('[Revoke Delegation] Error:', err);
    res.status(500).json({ success: false, message: 'Lỗi thu hồi quyền: ' + err.message });
  }
});

// CBQL Chấm điểm công việc (Grade / Approve Result)
app.put('/api/assigned-tasks/:id/grade', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { quality_pct, progress_pct, difficulty_weight, cbql_comment, is_bonus_approved } = req.body;

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ message: 'Không tìm thấy công việc' });

  // Guard: Không chấm điểm cho tài khoản admin / chức năng kỹ thuật
  const taskAssignee = db.prepare(`
    SELECT u.*, r.code as role_code, r.permissions 
    FROM users u 
    LEFT JOIN roles r ON u.role_id = r.id 
    WHERE u.id = ?
  `).get(task.user_id);
  if (isExemptFromEvaluation(taskAssignee)) {
    return res.status(400).json({
      success: false,
      message: 'Tài khoản Quản trị viên / Chức năng là tài khoản nghiệp vụ kỹ thuật, không tham gia đánh giá/chấm điểm KPI cá nhân.'
    });
  }

  // Guard: Tuyệt đối không được trực tiếp tự chấm điểm nhiệm vụ của bản thân
  const viewerId = getViewerId(req);
  if (viewerId && task.user_id === viewerId) {
    return res.status(403).json({
      success: false,
      message: 'Theo quy định, cán bộ quản lý không được trực tiếp tự chấm điểm nhiệm vụ của chính bản thân mình.'
    });
  }

  // Guard: Kiểm tra thẩm quyền chấm điểm cán bộ (Việc ai giao thì người đó chấm; người được Lãnh đạo ủy quyền; hoặc Lãnh đạo đơn vị)
  const accessibleUserIds = getAccessibleUserIds(viewerId);
  const viewer = viewerId ? db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) : null;
  const isTaskAssigner = task.assigned_by && task.assigned_by === viewerId;
  const isTaskEvaluator = task.evaluator_id && task.evaluator_id === viewerId;
  const isLeader = viewer?.management_role === 'lanh_dao' || viewer?.role === 'admin';

  if (!isTaskAssigner && !isTaskEvaluator && !isLeader && accessibleUserIds !== null && !accessibleUserIds.includes(task.user_id)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Bạn không có thẩm quyền chấm điểm/thẩm định công việc này' 
    });
  }

  // Guard: Kiểm tra kỳ đánh giá có bị chốt hoặc quá hạn khóa chấm điểm không
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(task.period_id);
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

  triggerBackgroundSupabaseSync();

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

  triggerBackgroundSupabaseSync();

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

  triggerBackgroundSupabaseSync();

  res.json({ success: true, message: 'Đã gửi phản hồi về công việc cho Lãnh đạo xem xét thành công!' });
});

// Cán bộ Trả lại công việc cho Lãnh đạo / Người giao việc
app.put('/api/assigned-tasks/:id/return-to-assigner', (req, res) => {
  const { id } = req.params;
  const { return_reason } = req.body;
  const viewerId = getViewerId(req);

  if (!return_reason || !return_reason.trim()) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập lý do trả lại công việc' });
  }

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

  // Kiểm tra quyền: chỉ người được giao hoặc admin mới được trả lại việc
  if (viewerId && task.user_id !== viewerId) {
    const viewer = db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId);
    if (viewer?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền trả lại nhiệm vụ của cán bộ khác' });
    }
  }

  if (task.status === 'approved') {
    return res.status(400).json({ success: false, message: 'Công việc đã được thẩm định chấm điểm phê duyệt, không thể trả lại' });
  }

  const viewer = viewerId ? db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId) : null;
  const userName = viewer?.full_name || 'Cán bộ';

  db.prepare(`
    UPDATE assigned_tasks 
    SET status = 'returned', 
        return_reason = ?, 
        is_returned = 1,
        cbql_comment = ?,
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(return_reason.trim(), `[Cán bộ ${userName} trả lại việc]: ${return_reason.trim()}`, id);

  triggerBackgroundSupabaseSync();

  res.json({ success: true, message: 'Đã trả lại công việc cho Lãnh đạo/Người giao thành công!' });
});

// Lãnh đạo Giao lại nhiệm vụ sau khi cấp dưới phản hồi hoặc trả lại
app.put('/api/assigned-tasks/:id/reassign', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const { deadline, task_name, output_result, standard_score, difficulty_weight, new_user_id, note } = req.body;

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

  const stdScore = standard_score ? parseFloat(standard_score) : task.standard_score;
  const diffWeight = difficulty_weight ? parseFloat(difficulty_weight) : task.difficulty_weight;
  const maxConv = Number((stdScore * diffWeight).toFixed(2));

  // Nếu giao cho cán bộ khác
  const targetUserId = (new_user_id && new_user_id !== task.user_id) ? new_user_id : task.user_id;
  const newStatus = (new_user_id && new_user_id !== task.user_id) ? 'pending_acceptance' : 'in_progress';

  db.prepare(`
    UPDATE assigned_tasks 
    SET status = ?,
        user_id = ?,
        task_name = COALESCE(?, task_name),
        deadline = COALESCE(?, deadline),
        output_result = COALESCE(?, output_result),
        standard_score = ?,
        difficulty_weight = ?,
        max_converted_score = ?,
        is_returned = 0,
        cbql_comment = COALESCE(?, cbql_comment),
        reassigned_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    newStatus,
    targetUserId,
    task_name ? task_name.trim() : null,
    deadline || null,
    output_result || null,
    stdScore,
    diffWeight,
    maxConv,
    note ? `[Lãnh đạo chỉ đạo khi giao lại]: ${note.trim()}` : task.cbql_comment,
    id
  );

  triggerBackgroundSupabaseSync();

  res.json({ 
    success: true, 
    message: (new_user_id && new_user_id !== task.user_id)
      ? 'Đã chuyển giao nhiệm vụ cho cán bộ mới thành công!' 
      : 'Đã điều chỉnh và giao lại nhiệm vụ thành công!' 
  });
});

// Lãnh đạo / Admin xóa hoặc hủy nhiệm vụ đã giao hoặc bị trả lại
app.delete('/api/assigned-tasks/:id', requireManagerOrAdmin, (req, res) => {
  const { id } = req.params;
  const viewer = getViewer(req);
  const viewerId = viewer?.id || getViewerId(req);
  const isAdmin = Boolean(
    viewer && (
      viewer.role === 'admin' || 
      viewer.target_role === 'admin' || 
      viewer.target_role === 'admin_donvi' || 
      viewer.role_id === 'role-admin' || 
      viewer.role_id === 'role-admin-donvi' || 
      viewer.management_role === 'lanh_dao' ||
      viewer.username === 'admin' || 
      viewer.username === 'mnhy.andong'
    )
  );

  const task = db.prepare('SELECT * FROM assigned_tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc' });

  // Nếu không phải Admin thì không được xóa công việc đã chấm điểm phê duyệt
  if (!isAdmin && task.status === 'approved') {
    return res.status(400).json({ success: false, message: 'Công việc đã được chấm điểm phê duyệt, không thể xóa' });
  }

  // Kiểm tra quyền đối với CBQL thông thường (không phải admin)
  if (!isAdmin) {
    const accessibleUserIds = getAccessibleUserIds(viewerId);
    if (accessibleUserIds !== null && !accessibleUserIds.includes(task.user_id) && task.assigned_by !== viewerId) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa nhiệm vụ này' });
    }
  }

  // Cập nhật ngắt liên kết dispatch (nếu có) và xóa khỏi SQLite
  db.prepare('UPDATE document_dispatches SET task_id = NULL WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM assigned_tasks WHERE id = ?').run(id);

  // Xóa trực tiếp khỏi Supabase Cloud để ngăn ngừa hồi sinh dữ liệu khi restart/pull
  deleteAssignedTasksFromSupabase([id]).catch(err => {
    console.error('[Supabase Delete Task Error]:', err.message);
  });
  triggerBackgroundSupabaseSync();

  res.json({ success: true, message: `Đã xóa nhiệm vụ "${task.task_name}" thành công!` });
});

// Admin / Lãnh đạo xóa nhiều nhiệm vụ đã giao cùng lúc
app.post('/api/assigned-tasks/bulk-delete', requireManagerOrAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'Danh sách ID công việc không hợp lệ' });
  }

  const viewer = getViewer(req);
  const viewerId = viewer?.id || getViewerId(req);
  const isAdmin = Boolean(
    viewer && (
      viewer.role === 'admin' || 
      viewer.target_role === 'admin' || 
      viewer.target_role === 'admin_donvi' || 
      viewer.role_id === 'role-admin' || 
      viewer.role_id === 'role-admin-donvi' || 
      viewer.management_role === 'lanh_dao' ||
      viewer.username === 'admin' || 
      viewer.username === 'mnhy.andong'
    )
  );

  const placeholders = ids.map(() => '?').join(',');
  let deleteQuery = `DELETE FROM assigned_tasks WHERE id IN (${placeholders})`;
  let params = [...ids];

  if (!isAdmin) {
    deleteQuery += " AND status != 'approved'";
    const accessibleUserIds = getAccessibleUserIds(viewerId);
    if (accessibleUserIds !== null) {
      const userPlaceholders = accessibleUserIds.map(() => '?').join(',');
      deleteQuery += ` AND (user_id IN (${userPlaceholders}) OR assigned_by = ?)`;
      params.push(...accessibleUserIds, viewerId);
    }
  }

  // Ngắt liên kết task_id trong document_dispatches
  const unlinkPlaceholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE document_dispatches SET task_id = NULL WHERE task_id IN (${unlinkPlaceholders})`).run(...ids);

  const result = db.prepare(deleteQuery).run(...params);

  // Xóa trực tiếp các IDs khỏi Supabase Cloud
  deleteAssignedTasksFromSupabase(ids).catch(err => {
    console.error('[Supabase Bulk Delete Error]:', err.message);
  });
  triggerBackgroundSupabaseSync();

  res.json({ 
    success: true, 
    deletedCount: result.changes,
    message: `Đã xóa thành công ${result.changes} nhiệm vụ!` 
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

// =============================================================
// THÔNG BÁO HỆ THỐNG & GIA HẠN THỜI HẠN NHIỆM VỤ (V4.1)
// =============================================================

function createNotification({ userId, title, message, type = 'system', taskId = null, tab = 'assignment' }) {
  if (!userId || !title || !message) return null;
  try {
    // Sanitize any YYYY-MM-DD in message to Vietnamese administrative standard DD/MM/YYYY
    const formattedMessage = typeof message === 'string'
      ? message.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1')
      : message;

    const id = 'notif-' + uuidv4();
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, task_id, tab, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(id, userId, title, formattedMessage, type, taskId, tab);
    return id;
  } catch (err) {
    console.error('[Notification] Error creating notification:', err);
    return null;
  }
}

// 1. CBNV yêu cầu gia hạn thời gian hoàn thành công việc
// RÀNG BUỘC NGHIỆP VỤ: Chỉ cho phép gửi khi công việc ĐÃ ĐẾN HẠN hoặc QUÁ HẠN (deadline <= today)
app.post('/api/assigned-tasks/:id/request-extension', (req, res) => {
  try {
    const { id } = req.params;
    const { requested_deadline, reason } = req.body;
    const viewerId = getViewerId(req);

    if (!requested_deadline || !reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn thời hạn mới và nhập lý do xin gia hạn!' });
    }

    const task = db.prepare(`
      SELECT t.*, u.full_name as user_name
      FROM assigned_tasks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhiệm vụ!' });
    }

    if (task.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Nhiệm vụ đã được chấm điểm phê duyệt, không thể xin gia hạn!' });
    }

    // Kiểm tra quyền: Chỉ người được giao nhiệm vụ hoặc Admin mới được xin gia hạn
    if (viewerId && task.user_id !== viewerId) {
      const viewer = db.prepare('SELECT * FROM users WHERE id = ?').get(viewerId);
      if (viewer?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xin gia hạn cho nhiệm vụ của cán bộ khác!' });
      }
    }

    // RÀNG BUỘC BẮT BUỘC: Chỉ hiển thị & cho phép khi việc đã đến hạn hoặc quá hạn
    const todayStr = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
    if (task.deadline && task.deadline > todayStr) {
      return res.status(400).json({
        success: false,
        message: `Theo quy định, chỉ được gửi yêu cầu gia hạn khi công việc đã đến hạn hoặc quá hạn! (Hạn hiện tại: ${task.deadline}, Hôm nay: ${todayStr})`
      });
    }

    // Hạn chót mới phải sau hạn chót hiện tại
    if (requested_deadline <= task.deadline) {
      return res.status(400).json({
        success: false,
        message: 'Thời hạn hoàn thành mới phải sau thời hạn hiện tại của công việc!'
      });
    }

    const originalDeadline = task.original_deadline || task.deadline;

    db.prepare(`
      UPDATE assigned_tasks
      SET original_deadline = ?,
          requested_deadline = ?,
          extension_reason = ?,
          extension_status = 'pending',
          extension_requested_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(originalDeadline, requested_deadline, reason.trim(), id);

    // Gửi thông báo đến Lãnh đạo / Người giao việc
    let targetLeaderId = task.assigned_by;
    if (!targetLeaderId || targetLeaderId === task.user_id) {
      const user = db.prepare('SELECT manager_id, dept_id FROM users WHERE id = ?').get(task.user_id);
      targetLeaderId = user?.manager_id;
      if (!targetLeaderId && user?.dept_id) {
        targetLeaderId = db.prepare('SELECT leader_id FROM departments WHERE id = ?').get(user.dept_id)?.leader_id;
      }
      if (!targetLeaderId) {
        targetLeaderId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()?.id;
      }
    }

    if (targetLeaderId) {
      createNotification({
        userId: targetLeaderId,
        title: '🔔 Cán bộ yêu cầu xin gia hạn công việc',
        message: `Cán bộ ${task.user_name || 'nhân sự'} đề xuất gia hạn nhiệm vụ "${task.task_name}" đến ngày ${formatDateVN(requested_deadline)}. Lý do: ${reason.trim()}`,
        type: 'extension_requested',
        taskId: id,
        tab: 'assignment'
      });
    }

    triggerBackgroundSupabaseSync();

    res.json({
      success: true,
      message: 'Đã gửi yêu cầu xin gia hạn đến Lãnh đạo phê duyệt thành công!'
    });
  } catch (err) {
    console.error('Error requesting task extension:', err);
    res.status(500).json({ success: false, message: 'Lỗi gửi yêu cầu gia hạn: ' + err.message });
  }
});

// 2. Lãnh đạo Phê duyệt hoặc Từ chối yêu cầu gia hạn
app.put('/api/assigned-tasks/:id/review-extension', requireManagerOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { action, reject_reason, new_deadline } = req.body; // action: 'approve' | 'reject'
    const viewer = getViewer(req);
    const viewerId = viewer?.id || getViewerId(req);

    const task = db.prepare(`
      SELECT t.*, u.full_name as user_name
      FROM assigned_tasks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhiệm vụ!' });
    }

    if (task.extension_status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Nhiệm vụ này hiện không có yêu cầu gia hạn nào đang chờ duyệt!' });
    }

    if (action === 'approve') {
      const newDeadline = new_deadline || task.requested_deadline;
      if (!newDeadline) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy thông tin hạn đề xuất mới!' });
      }

      db.prepare(`
        UPDATE assigned_tasks
        SET deadline = ?,
            extension_status = 'approved',
            extension_reviewed_by = ?,
            extension_reviewed_at = CURRENT_TIMESTAMP,
            extension_count = COALESCE(extension_count, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `).run(newDeadline, viewerId, id);

      createNotification({
        userId: task.user_id,
        title: '✅ Yêu cầu gia hạn đã được phê duyệt',
        message: `Lãnh đạo đã phê duyệt gia hạn nhiệm vụ "${task.task_name}". Thời hạn mới: ${formatDateVN(newDeadline)}.`,
        type: 'extension_approved',
        taskId: id,
        tab: 'execution'
      });

      triggerBackgroundSupabaseSync();
      return res.json({
        success: true,
        message: `Đã phê duyệt gia hạn nhiệm vụ đến ngày ${formatDateVN(newDeadline)} thành công!`
      });
    } else if (action === 'reject') {
      const reason = reject_reason ? reject_reason.trim() : 'Không chấp thuận gia hạn';
      db.prepare(`
        UPDATE assigned_tasks
        SET extension_status = 'rejected',
            extension_reject_reason = ?,
            extension_reviewed_by = ?,
            extension_reviewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reason, viewerId, id);

      createNotification({
        userId: task.user_id,
        title: '❌ Yêu cầu gia hạn bị từ chối',
        message: `Lãnh đạo đã từ chối yêu cầu gia hạn nhiệm vụ "${task.task_name}". Lý do: ${reason}`,
        type: 'extension_rejected',
        taskId: id,
        tab: 'execution'
      });

      triggerBackgroundSupabaseSync();
      return res.json({
        success: true,
        message: 'Đã từ chối yêu cầu gia hạn nhiệm vụ.'
      });
    } else {
      return res.status(400).json({ success: false, message: 'Hành động không hợp lệ (approve hoặc reject)!' });
    }
  } catch (err) {
    console.error('Error reviewing task extension:', err);
    res.status(500).json({ success: false, message: 'Lỗi khi duyệt gia hạn: ' + err.message });
  }
});

// 3. Lãnh đạo chủ động gia hạn thời gian hoàn thành công việc
app.put('/api/assigned-tasks/:id/extend-deadline', requireManagerOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { new_deadline, reason } = req.body;
    const viewer = getViewer(req);
    const viewerId = viewer?.id || getViewerId(req);

    if (!new_deadline) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn thời hạn hoàn thành mới!' });
    }

    const task = db.prepare(`
      SELECT t.*, u.full_name as user_name
      FROM assigned_tasks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = ?
    `).get(id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhiệm vụ!' });
    }

    const originalDeadline = task.original_deadline || task.deadline;
    const reasonText = reason ? reason.trim() : 'Lãnh đạo điều chỉnh tiến độ';

    db.prepare(`
      UPDATE assigned_tasks
      SET original_deadline = ?,
          deadline = ?,
          extension_status = 'approved',
          extension_reason = ?,
          extension_reviewed_by = ?,
          extension_reviewed_at = CURRENT_TIMESTAMP,
          extension_count = COALESCE(extension_count, 0) + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(originalDeadline, new_deadline, reasonText, viewerId, id);

    createNotification({
      userId: task.user_id,
      title: '📅 Nhiệm vụ được Lãnh đạo gia hạn',
      message: `Lãnh đạo đã điều chỉnh hạn hoàn thành nhiệm vụ "${task.task_name}" đến ngày ${formatDateVN(new_deadline)}.${reason ? ` Lý do: ${reason.trim()}` : ''}`,
      type: 'extension_approved',
      taskId: id,
      tab: 'execution'
    });

    triggerBackgroundSupabaseSync();

    res.json({
      success: true,
      message: `Đã gia hạn nhiệm vụ đến ngày ${formatDateVN(new_deadline)} thành công!`
    });
  } catch (err) {
    console.error('Error extending task deadline:', err);
    res.status(500).json({ success: false, message: 'Lỗi gia hạn thời hạn: ' + err.message });
  }
});

// 4. Lấy danh sách thông báo của người dùng
app.get('/api/notifications', (req, res) => {
  try {
    const viewerId = getViewerId(req);
    const userId = req.query.user_id || viewerId;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Thiếu user_id' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const notifications = db.prepare(`
      SELECT *
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit);

    const unreadCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = ? AND is_read = 0
    `).get(userId)?.count || 0;

    res.json({
      success: true,
      data: notifications,
      unread_count: unreadCount
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ success: false, message: 'Lỗi tải thông báo: ' + err.message });
  }
});

// 5. Đánh dấu 1 thông báo là đã đọc
app.put('/api/notifications/:id/read', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    res.json({ success: true, message: 'Đã đánh dấu đã đọc' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Đánh dấu đọc tất cả thông báo của người dùng
app.put('/api/notifications/read-all', (req, res) => {
  try {
    const viewerId = getViewerId(req);
    const userId = req.body?.user_id || req.query?.user_id || viewerId;
    if (!userId) return res.status(400).json({ success: false, message: 'Thiếu user_id' });

    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
    res.json({ success: true, message: 'Đã đánh dấu đọc tất cả thông báo' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Xóa thông báo
app.delete('/api/notifications/clear', (req, res) => {
  try {
    const viewerId = getViewerId(req);
    const userId = req.query.user_id || viewerId;
    if (!userId) return res.status(400).json({ success: false, message: 'Thiếu user_id' });

    const deleteOnlyRead = req.query.read_only === 'true';
    if (deleteOnlyRead) {
      db.prepare('DELETE FROM notifications WHERE user_id = ? AND is_read = 1').run(userId);
    } else {
      db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
    }
    res.json({ success: true, message: 'Đã xóa thông báo thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================
// QUÉT TỰ ĐỘNG ĐỊNH KỲ HÀNG NGÀY: CÔNG VIỆC SẮP ĐẾN HẠN & QUÁ HẠN
// =============================================================
function runDailyDeadlineScan() {
  try {
    const todayStr = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
    const todayDate = new Date(todayStr);

    console.log(`[Daily Scan] Bắt đầu quét kiểm tra hạn công việc ngày ${todayStr}...`);

    const tasks = db.prepare(`
      SELECT t.id, t.task_name, t.deadline, t.user_id, t.status, u.full_name as user_name
      FROM assigned_tasks t
      JOIN users u ON t.user_id = u.id
      WHERE t.status NOT IN ('approved', 'rejected', 'cancelled')
        AND t.deadline IS NOT NULL AND t.deadline != ''
    `).all();

    let createdNotifs = 0;

    for (const task of tasks) {
      const taskDeadlineDate = new Date(task.deadline);
      const diffMs = taskDeadlineDate - todayDate;
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      // 1. Đã quá hạn (diffDays < 0)
      if (diffDays < 0) {
        const overdueDays = Math.abs(diffDays);
        const existing = db.prepare(`
          SELECT id FROM notifications
          WHERE user_id = ? AND task_id = ? AND type = 'deadline_warning'
            AND title LIKE '%quá hạn%'
            AND DATE(created_at) = ?
        `).get(task.user_id, task.id, todayStr);

        if (!existing) {
          createNotification({
            userId: task.user_id,
            title: '⚠️ Cảnh báo: Công việc đã quá hạn',
            message: `Nhiệm vụ "${task.task_name}" đã quá hạn ${overdueDays} ngày (Hạn chót: ${formatDateVN(task.deadline)}). Vui lòng khẩn trương nộp minh chứng hoàn thành hoặc gửi yêu cầu gia hạn!`,
            type: 'deadline_warning',
            taskId: task.id,
            tab: 'execution'
          });
          createdNotifs++;
        }
      }
      // 2. Đến hạn hôm nay hoặc sắp đến hạn trong vòng 1-3 ngày tới (0 <= diffDays <= 3)
      else if (diffDays >= 0 && diffDays <= 3) {
        const existing = db.prepare(`
          SELECT id FROM notifications
          WHERE user_id = ? AND task_id = ? AND type = 'deadline_warning'
            AND (title LIKE '%hạn hôm nay%' OR title LIKE '%sắp đến hạn%')
            AND DATE(created_at) = ?
        `).get(task.user_id, task.id, todayStr);

        if (!existing) {
          const title = diffDays === 0
            ? '⏰ Nhắc nhở: Công việc đến hạn hôm nay'
            : `⏰ Nhắc nhở: Công việc sắp đến hạn (còn ${diffDays} ngày)`;
          const message = diffDays === 0
            ? `Nhiệm vụ "${task.task_name}" có hạn chót là HÔM NAY (${formatDateVN(task.deadline)}). Vui lòng nộp sản phẩm đúng hạn!`
            : `Nhiệm vụ "${task.task_name}" sẽ đến hạn vào ngày ${formatDateVN(task.deadline)} (còn ${diffDays} ngày). Vui lòng hoàn thành đúng tiến độ!`;

          createNotification({
            userId: task.user_id,
            title,
            message,
            type: 'deadline_warning',
            taskId: task.id,
            tab: 'execution'
          });
          createdNotifs++;
        }
      }
    }

    if (createdNotifs > 0) {
      console.log(`[Daily Scan] Hoàn tất quét kiểm tra hạn. Đã tạo ${createdNotifs} thông báo mới.`);
      triggerBackgroundSupabaseSync();
    } else {
      console.log(`[Daily Scan] Hoàn tất quét kiểm tra hạn. Không có thông báo mới cần tạo.`);
    }
  } catch (err) {
    console.error('[Daily Scan] Lỗi trong quá trình quét hạn định kỳ:', err);
  }
}

// Khởi chạy quét ngay khi khởi động sau 3 giây
setTimeout(runDailyDeadlineScan, 3000);

// Lên lịch kiểm tra mỗi giờ, nếu phát hiện sang ngày mới sẽ thực hiện quét
let lastScanDayStr = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
setInterval(() => {
  const currentDayStr = new Date(Date.now() + 7 * 3600000).toISOString().split('T')[0];
  if (currentDayStr !== lastScanDayStr) {
    lastScanDayStr = currentDayStr;
    runDailyDeadlineScan();
  }
}, 60 * 60 * 1000);

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

  // Guard: Tài khoản Admin / Quản trị đơn vị là tài khoản chức năng, không áp dụng KPI cá nhân
  if (isExemptFromEvaluation(targetUser)) {
    return res.json({
      is_admin_account: true,
      is_exempt_account: true,
      message: 'Tài khoản Quản trị chức năng là tài khoản nghiệp vụ kỹ thuật, không tham gia đánh giá chấm điểm KPI cá nhân.',
      user: targetUser,
      evaluation: {
        id: null,
        period_id,
        user_id,
        part1_score: 0,
        part2_score: 0,
        bonus_score: 0,
        total_score: 0,
        rank_proposed: 'Tài khoản Quản trị chức năng (Miễn đánh giá)',
        step: 'step_1_register'
      },
      criteria: [],
      axesSummary: [],
      stats: {
        totalTasksCount: 0,
        approvedTasksCount: 0,
        aheadScheduleCount: 0,
        aheadSchedulePct: 0,
        planTotalMaxScore: 0,
        executedTotalConvScore: 0,
        bonusScore: 0
      }
    });
  }

  // Get or initialize evaluation record
  let evaluation = db.prepare('SELECT * FROM evaluations WHERE period_id = ? AND user_id = ?').get(period_id, user_id);
  if (!evaluation) {
    const evalId = uuidv4();
    db.prepare(`
      INSERT INTO evaluations (id, period_id, user_id, part1_score, part2_score, bonus_score, total_score, rank_proposed, status, step)
      VALUES (?, ?, ?, 0, 0, 0, 0, 'Chưa tự đánh giá', 'draft', 'step_1_register')
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

  // Sum tasks for Part 2 calculation
  let planTotalMaxScore = 0;
  let executedTotalConvScore = 0;
  let totalBonusScore = 0;
  let aheadOrOverCount = 0;

  allUserTasks.forEach(t => {
    const std = t.standard_score || 0;
    const diff = t.difficulty_weight || 1.0;
    planTotalMaxScore += (std * diff);
  });
  planTotalMaxScore = Number(planTotalMaxScore.toFixed(2));

  approvedTasks.forEach(t => {
    executedTotalConvScore += (t.converted_score || 0);
    if (t.is_bonus_approved) {
      totalBonusScore += (t.bonus_score || ((t.converted_score || 0) * 0.05));
    }
    const isAhead = t.actual_finish_date && t.deadline && t.actual_finish_date < t.deadline;
    const isOver = t.progress_pct > 1.0 || t.quality_pct > 1.0;
    if (isAhead || isOver) {
      aheadOrOverCount++;
    }
  });
  executedTotalConvScore = Number(executedTotalConvScore.toFixed(2));
  totalBonusScore = Number(totalBonusScore.toFixed(2));

  // KPI Phần B (tối đa 70 điểm theo công thức HD.06: KPI = 70 * B / A)
  let part2Score = 0;
  if (planTotalMaxScore > 0) {
    part2Score = Number(Math.min(70, (executedTotalConvScore / planTotalMaxScore) * 70).toFixed(2));
  } else {
    part2Score = 0;
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
  let autoRank = 'Chưa xếp loại';
  if (totalTasksCount === 0 || approvedTasks.length === 0) {
    autoRank = evaluation.rank_proposed && evaluation.rank_proposed !== 'Hoàn thành tốt nhiệm vụ' 
      ? evaluation.rank_proposed 
      : 'Chưa tự đánh giá';
  } else if (grandTotal >= 90 && allTasksCompleted && aheadSchedulePct >= 0.30) {
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

  // Axes summary for breakdown display: Không giới hạn điểm tối đa đối với mỗi trục công việc
  // Điểm tối đa của mỗi trục = Tổng điểm các công việc được giao thuộc trục đó.
  // Điểm tính KPI chung vẫn theo cách tính hiện hữu (Phần A: 30đ, Phần B: 70đ, Thưởng: 7đ, Thang: 100đ).
  const axesSummary = axes.map((ax) => {
    const assignedInAxis = allUserTasks.filter(t => {
      const code = (t.axis_code === 'CHUYEN_MON' || !t.axis_code) ? 'TRUC_1' : t.axis_code;
      return code === ax.code;
    });
    const approvedInAxis = approvedTasks.filter(t => {
      const code = (t.axis_code === 'CHUYEN_MON' || !t.axis_code) ? 'TRUC_1' : t.axis_code;
      return code === ax.code;
    });

    let sumStd = 0;
    let axPlanMaxScore = 0;
    assignedInAxis.forEach(t => {
      const std = t.standard_score || 0;
      const diff = t.difficulty_weight || 1.0;
      sumStd += std;
      axPlanMaxScore += (std * diff);
    });
    axPlanMaxScore = Number(axPlanMaxScore.toFixed(2));
    sumStd = Number(sumStd.toFixed(2));

    let axExecutedConvScore = 0;
    approvedInAxis.forEach(t => {
      axExecutedConvScore += (t.converted_score || 0);
    });
    axExecutedConvScore = Number(axExecutedConvScore.toFixed(2));

    const kpiRatio = axPlanMaxScore > 0 ? (axExecutedConvScore / axPlanMaxScore) : 0;

    return {
      axis_code: ax.code,
      axis_name: ax.name,
      max_score: axPlanMaxScore, // Điểm tối đa là tổng điểm các công việc được giao thuộc trục
      sum_standard_score: sumStd,
      sum_converted_score: axExecutedConvScore,
      kpi_pct: Number(kpiRatio.toFixed(4)),
      axis_score: axExecutedConvScore, // Điểm đạt được của trục là tổng điểm quy đổi hoàn thành
      tasks_count: assignedInAxis.length,
      approved_tasks_count: approvedInAxis.length
    };
  });

  // Update evaluation record:
  // Nếu cán bộ chưa nộp tự đánh giá (status === 'draft' hoặc 'returned'),
  // total_score trong CSDL phải giữ bằng 0 và rank_proposed là 'Chưa tự đánh giá'
  // để không làm sai lệch Bảng giám sát KPI và Báo cáo Mẫu 02
  const isEvaluated = evaluation.status === 'submitted' || evaluation.status === 'approved';
  const savedTotalScore = isEvaluated ? grandTotal : 0;
  const savedRankProposed = isEvaluated ? autoRank : (evaluation.rank_proposed && evaluation.rank_proposed !== 'Hoàn thành tốt nhiệm vụ' && evaluation.rank_proposed !== 'Hoàn thành xuất sắc nhiệm vụ' && evaluation.rank_proposed !== 'Hoàn thành nhiệm vụ' && evaluation.rank_proposed !== 'Không hoàn thành nhiệm vụ' ? evaluation.rank_proposed : 'Chưa tự đánh giá');
  const savedPart1Score = isEvaluated || (evaluation.part1_score && evaluation.part1_score > 0) ? part1Score : 0;

  db.prepare(`
    UPDATE evaluations
    SET part1_score = ?, part2_score = ?, bonus_score = ?, total_score = ?,
        plan_total_max_score = ?, executed_total_conv_score = ?,
        rank_proposed = ?, step = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    savedPart1Score, part2Score, cappedBonusScore, savedTotalScore,
    planTotalMaxScore, executedTotalConvScore,
    savedRankProposed, currentStep, evaluation.id
  );

  res.json({
    user: targetUser,
    evaluation: {
      ...evaluation,
      part1_score: part1Score,
      part2_score: part2Score,
      bonus_score: cappedBonusScore,
      total_score: isEvaluated ? grandTotal : 0,
      preview_total_score: grandTotal,
      plan_total_max_score: planTotalMaxScore,
      executed_total_conv_score: executedTotalConvScore,
      rank_proposed: isEvaluated ? autoRank : 'Chưa tự đánh giá',
      preview_rank: autoRank,
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

  const evalRec = db.prepare('SELECT e.*, p.is_locked, p.name as period_name, u.role as user_role FROM evaluations e LEFT JOIN periods p ON e.period_id = p.id LEFT JOIN users u ON e.user_id = u.id WHERE e.id = ?').get(evaluation_id);
  if (!evalRec) return res.status(404).json({ success: false, message: 'Không tìm thấy bản tự đánh giá' });

  if (evalRec.user_role === 'admin') {
    return res.status(400).json({ success: false, message: 'Tài khoản Quản trị viên là tài khoản nghiệp vụ kỹ thuật, không áp dụng tự đánh giá KPI cá nhân.' });
  }

  if (evalRec.is_locked === 1) {
    return res.status(403).json({ success: false, message: `Kỳ đánh giá "${evalRec.period_name}" đã Chốt KPI. Không thể nộp sửa đổi!` });
  }

  // Calculate submitted total_score and autoRank
  const p1 = Number(evalRec.part1_score || 0);
  const p2 = Number(evalRec.part2_score || 0);
  const bonus = Number(evalRec.bonus_score || 0);
  const submittedTotal = Number(Math.min(100, p1 + p2 + bonus).toFixed(2));

  let submittedRank = 'Chưa xếp loại';
  if (submittedTotal >= 90) submittedRank = 'Hoàn thành xuất sắc nhiệm vụ';
  else if (submittedTotal >= 70) submittedRank = 'Hoàn thành tốt nhiệm vụ';
  else if (submittedTotal >= 50) submittedRank = 'Hoàn thành nhiệm vụ';
  else submittedRank = 'Không hoàn thành nhiệm vụ';

  db.prepare(`
    UPDATE evaluations
    SET status = 'submitted',
        total_score = ?,
        rank_proposed = ?,
        step = 'step_4_grading',
        submitted_at = CURRENT_TIMESTAMP,
        return_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(submittedTotal, submittedRank, evaluation_id);

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
        total_score = 0,
        rank_proposed = 'Chưa tự đánh giá',
        superior_rank = NULL,
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

  const evalRec = db.prepare('SELECT e.*, p.is_locked, p.grading_lock_date, p.name as period_name, u.role as user_role FROM evaluations e LEFT JOIN periods p ON e.period_id = p.id LEFT JOIN users u ON e.user_id = u.id WHERE e.id = ?').get(evaluation_id);
  if (!evalRec) return res.status(404).json({ success: false, message: 'Không tìm thấy bản đánh giá' });

  if (evalRec.user_role === 'admin') {
    return res.status(400).json({ success: false, message: 'Tài khoản Quản trị viên là tài khoản nghiệp vụ kỹ thuật, không áp dụng đánh giá xếp loại KPI cá nhân.' });
  }

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

  // Điều kiện chuyển lên Bước 5: Cán bộ đã nộp tự đánh giá cuối kỳ
  if (evalRec.status !== 'submitted' && evalRec.status !== 'approved') {
    return res.status(400).json({
      success: false,
      message: 'Cán bộ chưa hoàn tất nộp bản tự đánh giá cuối kỳ (Bước 3). Chưa đủ điều kiện kết luận xếp loại Bước 5!'
    });
  }

  // Điều kiện chuyển lên Bước 5: Cán bộ đã hoàn tất nộp tất cả sản phẩm công việc (Bước 2)
  const unsubmitted = db.prepare(`
    SELECT COUNT(*) as count 
    FROM assigned_tasks 
    WHERE user_id = ? AND period_id = ? AND status NOT IN ('submitted', 'approved', 'rejected')
  `).get(evalRec.user_id, evalRec.period_id);

  if (unsubmitted && unsubmitted.count > 0) {
    return res.status(400).json({
      success: false,
      message: `Cán bộ còn ${unsubmitted.count} nhiệm vụ chưa nộp sản phẩm/minh chứng (Bước 2). Cán bộ phải hoàn tất nộp toàn bộ sản phẩm công việc thì mới đủ điều kiện chuyển lên Bước 5!`
    });
  }

  db.prepare(`
    UPDATE evaluations
    SET superior_rank = ?, superior_comment = ?, status = ?, step = 'step_6_advisory', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(superior_rank, superior_comment, status || 'approved', evaluation_id);

  res.json({ success: true, message: 'Đã lưu kết luận đánh giá Bước 5 thành công! Hồ sơ đã được chuyển tiếp lên Bước 6 (Tổng hợp tham mưu).' });
});

// Báo cáo Mẫu 02 (Toàn cơ quan / đơn vị theo HD.06)
app.get('/api/reports/mau-02', (req, res) => {
  const { period_id } = req.query;
  const pId = period_id || 'p-1';
  const viewerId = getViewerId(req);
  const accessibleUserIds = getAccessibleUserIds(viewerId);

  let query = `
    SELECT u.id as user_id, u.full_name, u.role, u.target_role, u.management_role, u.party_title, u.gov_title, u.union_title, u.dept_id, d.name as dept_name,
           e.id as evaluation_id, e.status as evaluation_status, e.step,
           CASE WHEN e.status IN ('submitted', 'approved') THEN e.part1_score ELSE 0 END as part1_score,
           CASE WHEN e.status IN ('submitted', 'approved') THEN e.part2_score ELSE 0 END as part2_score,
           CASE WHEN e.status IN ('submitted', 'approved') THEN e.bonus_score ELSE 0 END as bonus_score,
           CASE WHEN e.status IN ('submitted', 'approved') THEN e.total_score ELSE 0 END as total_score,
           CASE WHEN e.status IN ('submitted', 'approved') THEN e.rank_proposed ELSE 'Chưa tự đánh giá' END as rank_proposed,
           e.superior_rank, e.summary_reason, e.cadre_proposal_note, e.superior_comment,
           (SELECT COUNT(*) FROM assigned_tasks t WHERE t.user_id = u.id AND t.period_id = ? AND t.status != 'rejected') as total_tasks,
           (SELECT COUNT(*) FROM assigned_tasks t WHERE t.user_id = u.id AND t.period_id = ? AND t.status = 'approved') as approved_tasks,
           (SELECT COUNT(*) FROM assigned_tasks t WHERE t.user_id = u.id AND t.period_id = ? AND t.status = 'approved' AND ((t.progress_pct = 1.0 AND t.actual_finish_date < t.deadline) OR t.bonus_score > 0)) as ahead_tasks
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN evaluations e ON e.user_id = u.id AND e.period_id = ?
    WHERE (u.is_active IS NULL OR u.is_active = 1)
      AND u.role NOT IN ('admin', 'admin_donvi')
      AND COALESCE(u.target_role, '') NOT IN ('admin', 'admin_donvi', 'none', 'exempt')
      AND COALESCE(u.role_id, '') NOT IN ('role-admin', 'role-admin-donvi')
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
  list.sort(compareUsersByPositionAndName);
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
      `).run(evalId, period_id, user_id, superior_rank || null, summary_reason || '', cadre_proposal_note || '');
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

  // Average KPI score of users (chỉ tính cán bộ đã nộp tự đánh giá hoặc đã thẩm định)
  const avgScores = db.prepare(`
    SELECT AVG(total_score) as avg_total, AVG(part1_score) as avg_p1, AVG(part2_score) as avg_p2
    FROM evaluations WHERE period_id = ? AND status IN ('submitted', 'approved') ${userFilterClause}
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
    WHERE (u.is_active IS NULL OR u.is_active = 1)
      AND u.role NOT IN ('admin', 'admin_donvi')
      AND COALESCE(u.target_role, '') NOT IN ('admin', 'admin_donvi', 'none', 'exempt')
      AND COALESCE(u.role_id, '') NOT IN ('role-admin', 'role-admin-donvi') ${userClause}
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
  const isViewerLeader = viewer ? isVotingCouncilMember(viewer) : false;

  // Lấy tất cả người dùng hợp lệ cần được biểu quyết (LOẠI BỎ TÀI KHOẢN ADMIN/CHỨC NĂNG)
  const candidates = db.prepare(`
    SELECT u.id, u.full_name, u.role, u.target_role, u.gov_title, u.party_title, u.dept_id,
           r.code as role_code, r.permissions, r.data_scope, d.name as dept_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN departments d ON u.dept_id = d.id
    WHERE (u.is_active IS NULL OR u.is_active = 1)
      AND u.role NOT IN ('admin', 'admin_donvi')
      AND COALESCE(u.target_role, '') NOT IN ('admin', 'admin_donvi', 'none', 'exempt')
      AND COALESCE(u.role_id, '') NOT IN ('role-admin', 'role-admin-donvi')
      AND LOWER(u.username) NOT IN ('admin', 'quantri', 'quantrihethong', 'admin_donvi', 'vanthu', 'mnhy.andong')
      AND LOWER(u.full_name) NOT LIKE 'trường%'
      AND LOWER(u.full_name) NOT LIKE 'phòng%'
      AND LOWER(u.full_name) NOT LIKE 'ban %'
      AND LOWER(u.full_name) NOT LIKE 'cơ quan%'
      AND LOWER(u.full_name) NOT LIKE 'quản trị%'
    ORDER BY u.full_name ASC
  `).all();

  const totalCandidates = candidates.length;

  // Lấy danh sách toàn bộ cán bộ để lọc ra Hội đồng Lãnh đạo biểu quyết (CHỈ LÃNH ĐẠO THỰC TẾ, KHÔNG BAO GỒM ADMIN)
  const allUsers = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.target_role, u.role_id, u.management_role,
           u.gov_title, u.party_title, u.dept_id, r.code as role_code, r.permissions, r.data_scope, d.name as dept_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN departments d ON u.dept_id = d.id
    WHERE (u.is_active IS NULL OR u.is_active = 1)
    ORDER BY u.full_name ASC
  `).all();

  const eligibleLeaders = allUsers.filter(isVotingCouncilMember);

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
    WHERE (u.is_active IS NULL OR u.is_active = 1)
      AND u.role NOT IN ('admin', 'admin_donvi')
      AND COALESCE(u.target_role, '') NOT IN ('admin', 'admin_donvi', 'none', 'exempt')
      AND COALESCE(u.role_id, '') NOT IN ('role-admin', 'role-admin-donvi')
      AND LOWER(u.username) NOT IN ('admin', 'quantri', 'quantrihethong', 'admin_donvi', 'vanthu', 'mnhy.andong')
      AND LOWER(u.full_name) NOT LIKE 'trường%'
      AND LOWER(u.full_name) NOT LIKE 'phòng%'
      AND LOWER(u.full_name) NOT LIKE 'ban %'
      AND LOWER(u.full_name) NOT LIKE 'cơ quan%'
      AND LOWER(u.full_name) NOT LIKE 'quản trị%' ${userClause}
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

  // Chặn nghiêm ngặt: Chỉ thành viên Hội đồng Lãnh đạo thực tế mới được biểu quyết
  if (!viewer || !isVotingCouncilMember(viewer)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Từ chối quyền: Chỉ cán bộ trong Hội đồng Lãnh đạo thực tế mới có quyền tham gia biểu quyết xếp loại (không bao gồm tài khoản chức năng/admin)!' 
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

  // 3. Score ranges (chỉ tính cán bộ đã nộp tự đánh giá hoặc đã được thẩm định chấm điểm)
  const evals = db.prepare(`SELECT total_score, superior_rank, rank_proposed, status FROM evaluations WHERE period_id = ? AND status IN ('submitted', 'approved') ${userFilterClause}`).all(...paramsEvals);
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

// Reset toàn bộ đánh giá về trạng thái Chưa đánh giá (Dành cho Quản trị viên & Lãnh đạo)
app.post('/api/evaluations/reset-all', requireManagerOrAdmin, async (req, res) => {
  try {
    const { period_id } = req.body;
    if (period_id) {
      db.prepare(`DELETE FROM evaluation_criteria_details WHERE evaluation_id IN (SELECT id FROM evaluations WHERE period_id = ?)`).run(period_id);
      db.prepare(`DELETE FROM evaluations WHERE period_id = ?`).run(period_id);
      db.prepare(`DELETE FROM votes WHERE period_id = ?`).run(period_id);
    } else {
      db.prepare(`DELETE FROM evaluation_criteria_details`).run();
      db.prepare(`DELETE FROM evaluations`).run();
      db.prepare(`DELETE FROM votes`).run();
    }
    
    // Đồng bộ lên Supabase Cloud
    if (typeof resetAllEvaluationsFromSupabase === 'function') {
      await resetAllEvaluationsFromSupabase().catch(err => console.error('Lỗi reset Supabase:', err));
    }
    triggerBackgroundSupabaseSync();

    res.json({ success: true, message: 'Đã reset toàn bộ đánh giá về trạng thái Chưa đánh giá thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi reset đánh giá: ' + err.message });
  }
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
// USER GROUPS MODULE (NHÓM NGƯỜI DÙNG / TỔ CÔNG TÁC TỰ TẠO)
// ============================================================================

// 1. Get All User Groups
app.get('/api/user-groups', (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT g.*, 
             u.full_name as creator_name,
             d.name as dept_name,
             (SELECT COUNT(*) FROM user_group_members ugm WHERE ugm.group_id = g.id) as member_count
      FROM user_groups g
      LEFT JOIN users u ON g.created_by = u.id
      LEFT JOIN departments d ON g.dept_id = d.id
      ORDER BY g.created_at DESC
    `).all();

    const membersStmt = db.prepare(`
      SELECT ugm.user_id, u.full_name, u.gov_title, u.party_title, u.role, u.dept_id, dept.name as dept_name
      FROM user_group_members ugm
      JOIN users u ON ugm.user_id = u.id
      LEFT JOIN departments dept ON u.dept_id = dept.id
      WHERE ugm.group_id = ?
      ORDER BY u.full_name ASC
    `);

    for (const g of groups) {
      g.members = membersStmt.all(g.id);
    }

    res.json(groups);
  } catch (err) {
    console.error('Error fetching user groups:', err);
    res.status(500).json({ error: 'Lỗi tải danh sách nhóm: ' + err.message });
  }
});

// 2. Get Single User Group
app.get('/api/user-groups/:id', (req, res) => {
  try {
    const { id } = req.params;
    const group = db.prepare(`
      SELECT g.*, u.full_name as creator_name, d.name as dept_name
      FROM user_groups g
      LEFT JOIN users u ON g.created_by = u.id
      LEFT JOIN departments d ON g.dept_id = d.id
      WHERE g.id = ?
    `).get(id);

    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });

    const members = db.prepare(`
      SELECT ugm.id as membership_id, u.id, u.username, u.full_name, u.gov_title, u.party_title, u.role, u.dept_id, d.name as dept_name
      FROM user_group_members ugm
      JOIN users u ON ugm.user_id = u.id
      LEFT JOIN departments d ON u.dept_id = d.id
      WHERE ugm.group_id = ?
      ORDER BY u.full_name ASC
    `).all(id);

    res.json({ ...group, members });
  } catch (err) {
    console.error('Error fetching group detail:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Create User Group
app.post('/api/user-groups', (req, res) => {
  try {
    const viewer = getViewer(req);
    const { name, description, dept_id, member_ids = [] } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập tên nhóm!' });
    }

    const groupId = uuidv4();
    const runTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO user_groups (id, name, description, dept_id, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(groupId, name.trim(), description ? description.trim() : null, dept_id || null, viewer?.id || null);

      if (Array.isArray(member_ids) && member_ids.length > 0) {
        const insMem = db.prepare(`
          INSERT OR IGNORE INTO user_group_members (id, group_id, user_id)
          VALUES (?, ?, ?)
        `);
        for (const uid of member_ids) {
          if (uid) insMem.run(uuidv4(), groupId, uid);
        }
      }
    });

    runTx();

    const created = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(groupId);
    res.status(201).json({ success: true, group: created, message: 'Đã tạo nhóm thành công!' });
    triggerBackgroundSupabaseSync();
  } catch (err) {
    console.error('Error creating user group:', err);
    res.status(500).json({ error: 'Lỗi tạo nhóm: ' + err.message });
  }
});

// 4. Update User Group
app.put('/api/user-groups/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, dept_id, member_ids } = req.body || {};

    const existing = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy nhóm' });

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE user_groups 
        SET name = COALESCE(?, name),
            description = ?,
            dept_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name ? name.trim() : existing.name, 
        description !== undefined ? (description ? description.trim() : null) : existing.description, 
        dept_id !== undefined ? (dept_id || null) : existing.dept_id, 
        id
      );

      if (Array.isArray(member_ids)) {
        db.prepare('DELETE FROM user_group_members WHERE group_id = ?').run(id);
        const insMem = db.prepare(`
          INSERT OR IGNORE INTO user_group_members (id, group_id, user_id)
          VALUES (?, ?, ?)
        `);
        for (const uid of member_ids) {
          if (uid) insMem.run(uuidv4(), id, uid);
        }
      }
    });

    runTx();

    const updated = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(id);
    res.json({ success: true, group: updated, message: 'Đã cập nhật nhóm thành công!' });
    triggerBackgroundSupabaseSync();
  } catch (err) {
    console.error('Error updating user group:', err);
    res.status(500).json({ error: 'Lỗi cập nhật nhóm: ' + err.message });
  }
});

// 5. Delete User Group
app.delete('/api/user-groups/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy nhóm' });

    const runTx = db.transaction(() => {
      db.prepare('DELETE FROM user_group_members WHERE group_id = ?').run(id);
      db.prepare('DELETE FROM user_groups WHERE id = ?').run(id);
    });
    runTx();

    res.json({ success: true, message: 'Đã xóa nhóm thành công!' });
    triggerBackgroundSupabaseSync();
  } catch (err) {
    console.error('Error deleting user group:', err);
    res.status(500).json({ error: 'Lỗi xóa nhóm: ' + err.message });
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
    const submittedToLeader = db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE ${scopeWhere} AND d.status = 'submitted_to_leader'`).get(...params).count;
    const submittedToMe = viewer ? db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE d.leader_id = ? AND d.status = 'submitted_to_leader'`).get(viewer.id)?.count || 0 : 0;
    const inProgress = db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE ${scopeWhere} AND (d.status = 'in_progress' OR d.status = 'dispatched')`).get(...params).count;
    const completed = db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE ${scopeWhere} AND d.status = 'completed'`).get(...params).count;
    const today = new Date().toISOString().split('T')[0];
    const overdue = db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE ${scopeWhere} AND d.deadline IS NOT NULL AND d.deadline < ? AND d.status != 'completed'`).get(...params, today).count;

    res.json({
      total,
      pending_dispatch: pendingDispatch,
      submitted_to_leader: submittedToLeader,
      submitted_to_me: submittedToMe,
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
    const { search, doc_type, field, status, urgency, from_date, to_date, filter_leader_me } = req.query;

    let conditions = ['1=1'];
    const params = [];

    if (filter_leader_me === 'true' && viewer) {
      conditions.push('d.leader_id = ? AND d.status = "submitted_to_leader"');
      params.push(viewer.id);
    } else if (!isMgr && viewer) {
      conditions.push(`(
        d.created_by = ? OR 
        d.leader_id = ? OR
        d.id IN (
          SELECT document_id FROM document_dispatches 
          WHERE assigned_to_user_id = ? OR coordinating_user_ids LIKE ?
        )
      )`);
      params.push(viewer.id, viewer.id, viewer.id, `%"${viewer.id}"%`);
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
      } else if (status === 'in_progress') {
        conditions.push('(d.status = "in_progress" OR d.status = "dispatched")');
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
             leader.full_name as leader_name,
             sub_u.full_name as submitted_by_name,
             (SELECT COUNT(*) FROM document_dispatches dd WHERE dd.document_id = d.id) as dispatches_count,
             (SELECT GROUP_CONCAT(u2.full_name, ', ') 
              FROM document_dispatches dd2 
              JOIN users u2 ON dd2.assigned_to_user_id = u2.id 
              WHERE dd2.document_id = d.id) as assigned_officers
      FROM documents d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN users leader ON d.leader_id = leader.id
      LEFT JOIN users sub_u ON d.submitted_by = sub_u.id
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
      SELECT d.*, 
             u.full_name as creator_name,
             leader.full_name as leader_name,
             sub_u.full_name as submitted_by_name
      FROM documents d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN users leader ON d.leader_id = leader.id
      LEFT JOIN users sub_u ON d.submitted_by = sub_u.id
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

    // Xóa tất cả các công việc KPI đã tạo ra từ văn bản này để tránh để lại nhiệm vụ rác cho người dùng
    const linkedTasks = db.prepare('SELECT id FROM assigned_tasks WHERE document_id = ?').all(id);
    if (linkedTasks.length > 0) {
      const taskIds = linkedTasks.map(t => t.id);
      const placeholders = taskIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM assigned_tasks WHERE id IN (${placeholders})`).run(...taskIds);
      deleteAssignedTasksFromSupabase(taskIds).catch(err => {
        console.error('[Supabase Delete Linked Tasks Error]:', err.message);
      });
    }

    // Xóa lịch sử phân bổ văn bản
    db.prepare('DELETE FROM document_dispatches WHERE document_id = ?').run(id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);

    triggerBackgroundSupabaseSync();
    res.json({ success: true, message: 'Đã xóa văn bản, các nhiệm vụ liên quan và lịch sử phân bổ thành công!' });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Lỗi xóa văn bản: ' + err.message });
  }
});

// 7. Dispatch Document (Phân bổ văn bản cho cán bộ & tùy chọn tạo KPI task)
// 6.1. Văn thư trình Lãnh đạo cho ý kiến chỉ đạo
app.post('/api/documents/:id/submit-to-leader', (req, res) => {
  try {
    const { id } = req.params;
    const viewer = getViewer(req);
    const { leader_id, leader_note } = req.body || {};

    if (!leader_id) {
      return res.status(400).json({ success: false, error: 'Vui lòng chọn Lãnh đạo để trình văn bản!' });
    }

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy văn bản!' });
    }

    db.prepare(`
      UPDATE documents 
      SET status = 'submitted_to_leader',
          leader_id = ?,
          submitted_by = ?,
          submitted_at = CURRENT_TIMESTAMP,
          leader_instruction = COALESCE(?, leader_instruction),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(leader_id, viewer?.id || null, leader_note || null, id);

    const updatedDoc = db.prepare(`
      SELECT d.*, u.full_name as creator_name, leader.full_name as leader_name
      FROM documents d
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN users leader ON d.leader_id = leader.id
      WHERE d.id = ?
    `).get(id);

    res.json({
      success: true,
      message: `Đã trình văn bản lên Lãnh đạo (${updatedDoc.leader_name || 'Lãnh đạo'}) thành công!`,
      document: updatedDoc
    });
    triggerBackgroundSupabaseSync();
  } catch (err) {
    console.error('Error submitting document to leader:', err);
    res.status(500).json({ success: false, error: 'Lỗi khi trình Lãnh đạo: ' + err.message });
  }
});

// 7. Dispatch Document (Phân bổ văn bản: cá nhân / nhóm chức vụ / nhóm tự tạo / đọc tham khảo)
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
      target_type = 'users', // 'users' | 'job_title' | 'user_group'
      assigned_to_user_id,
      coordinating_user_ids = [],
      assigned_user_ids = [],
      job_titles = [],
      group_id,
      dispatch_type = 'process', // 'process' (xử lý) | 'reference' (đọc tham khảo)
      instruction,
      leader_instruction,
      deadline,
      create_kpi_task,
      period_id,
      axis_code = 'CHUYEN_MON',
      standard_score = 10,
      difficulty_weight = 1.0,
      output_result = 'Báo cáo / Kế hoạch'
    } = req.body;

    const effInstruction = instruction || leader_instruction || 'Xem và xử lý theo nội dung văn bản';
    const effLeaderInstruction = leader_instruction || instruction || doc.leader_instruction;

    // Resolve target users based on target_type
    let mainAssigneeIds = [];
    let coordinatingAssigneeIds = [];

    if (target_type === 'job_title' && Array.isArray(job_titles) && job_titles.length > 0) {
      const placeholders = job_titles.map(() => '?').join(',');
      let titleSql = `SELECT id FROM users WHERE (gov_title IN (${placeholders}) OR party_title IN (${placeholders})) AND COALESCE(is_active, 1) = 1`;
      const titleParams = [...job_titles, ...job_titles];
      if (department_id) {
        titleSql += ' AND dept_id = ?';
        titleParams.push(department_id);
      }
      const usersByTitle = db.prepare(titleSql).all(...titleParams);
      mainAssigneeIds = usersByTitle.map(u => u.id);
    } else if (target_type === 'user_group' && group_id) {
      const groupMems = db.prepare('SELECT user_id FROM user_group_members WHERE group_id = ?').all(group_id);
      mainAssigneeIds = groupMems.map(gm => gm.user_id);
    } else if (Array.isArray(assigned_user_ids) && assigned_user_ids.length > 0) {
      mainAssigneeIds = assigned_user_ids;
      if (Array.isArray(coordinating_user_ids)) {
        coordinatingAssigneeIds = coordinating_user_ids.filter(uid => !mainAssigneeIds.includes(uid));
      }
    } else {
      if (assigned_to_user_id) mainAssigneeIds = [assigned_to_user_id];
      if (Array.isArray(coordinating_user_ids)) coordinatingAssigneeIds = coordinating_user_ids;
    }

    if (mainAssigneeIds.length === 0 && coordinatingAssigneeIds.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất một cán bộ hoặc nhóm để chuyển/phân bổ văn bản!' });
    }

    const createdDispatches = [];
    const createdTaskIds = [];

    const runTransaction = db.transaction(() => {
      // 1. Process Reference-only dispatches
      if (dispatch_type === 'reference') {
        const allReferenceUserIds = [...new Set([...mainAssigneeIds, ...coordinatingAssigneeIds])];
        for (const uid of allReferenceUserIds) {
          const dispatchId = uuidv4();
          db.prepare(`
            INSERT INTO document_dispatches (
              id, document_id, department_id, assigned_to_user_id, coordinating_user_ids,
              instruction, deadline, task_id, status, dispatch_type, role_in_dispatch, dispatched_by
            ) VALUES (?, ?, ?, ?, '[]', ?, ?, NULL, 'in_progress', 'reference', 'reference', ?)
          `).run(
            dispatchId,
            doc.id,
            department_id || null,
            uid,
            effInstruction.trim(),
            deadline || doc.deadline || null,
            viewer ? viewer.id : null
          );
          createdDispatches.push(dispatchId);
        }

        db.prepare(`
          UPDATE documents 
          SET status = 'dispatched',
              is_reference_only = 1,
              leader_instruction = COALESCE(?, leader_instruction),
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(effLeaderInstruction || null, doc.id);
      } else {
        // 2. Process regular task assignment dispatches
        const stdScore = parseFloat(standard_score) || 10;
        const diffWeight = parseFloat(difficulty_weight) || 1.0;
        const maxConv = Number((stdScore * diffWeight).toFixed(2));
        const taskName = `[VB ${doc.doc_number}] ${effInstruction.length > 80 ? effInstruction.slice(0, 80) + '...' : effInstruction}`;

        // Create for main assignees
        for (const uid of mainAssigneeIds) {
          const dispatchId = uuidv4();
          let taskId = null;

          if (create_kpi_task && period_id) {
            taskId = uuidv4();
            db.prepare(`
              INSERT INTO assigned_tasks (
                id, period_id, user_id, task_name, output_result,
                deadline, task_type, standard_score, difficulty_weight, max_converted_score,
                axis_code, origin, status, assigned_by, document_id, group_id
              ) VALUES (?, ?, ?, ?, ?, ?, 'Đột xuất', ?, ?, ?, ?, 'assigned', 'in_progress', ?, ?, ?)
            `).run(
              taskId,
              period_id,
              uid,
              taskName,
              output_result,
              deadline || doc.deadline || new Date().toISOString().split('T')[0],
              stdScore,
              diffWeight,
              maxConv,
              axis_code,
              viewer ? viewer.id : null,
              doc.id,
              group_id || null
            );
            createdTaskIds.push(taskId);
          }

          db.prepare(`
            INSERT INTO document_dispatches (
              id, document_id, department_id, assigned_to_user_id, coordinating_user_ids,
              instruction, deadline, task_id, status, dispatch_type, role_in_dispatch, dispatched_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', 'process', 'main', ?)
          `).run(
            dispatchId,
            doc.id,
            department_id || null,
            uid,
            Array.isArray(coordinatingAssigneeIds) ? JSON.stringify(coordinatingAssigneeIds) : '[]',
            effInstruction.trim(),
            deadline || doc.deadline || null,
            taskId,
            viewer ? viewer.id : null
          );
          createdDispatches.push(dispatchId);
        }

        // Create for coordinating assignees if specified
        for (const uid of coordinatingAssigneeIds) {
          const dispatchId = uuidv4();
          db.prepare(`
            INSERT INTO document_dispatches (
              id, document_id, department_id, assigned_to_user_id, coordinating_user_ids,
              instruction, deadline, task_id, status, dispatch_type, role_in_dispatch, dispatched_by
            ) VALUES (?, ?, ?, ?, '[]', ?, ?, NULL, 'in_progress', 'process', 'coordinate', ?)
          `).run(
            dispatchId,
            doc.id,
            department_id || null,
            uid,
            `[Phối hợp xử lý] ${effInstruction.trim()}`,
            deadline || doc.deadline || null,
            viewer ? viewer.id : null
          );
          createdDispatches.push(dispatchId);
        }

        db.prepare(`
          UPDATE documents 
          SET status = 'in_progress',
              leader_instruction = COALESCE(?, leader_instruction),
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(effLeaderInstruction || null, doc.id);
      }
    });

    runTransaction();

    const successMsg = dispatch_type === 'reference'
      ? `Đã chuyển văn bản cho ${createdDispatches.length} cán bộ để đọc tham khảo!`
      : (createdTaskIds.length > 0 
          ? `Đã phân bổ văn bản và tự động tạo ${createdTaskIds.length} nhiệm vụ KPI thành công!`
          : `Đã phân bổ văn bản cho ${createdDispatches.length} cán bộ xử lý thành công!`);

    res.status(201).json({
      success: true,
      dispatches_count: createdDispatches.length,
      tasks_count: createdTaskIds.length,
      message: successMsg
    });
    triggerBackgroundSupabaseSync();
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

// -------------------------------------------------------------
// 9. Database Backup & Restore Management (Bảo vệ dữ liệu an toàn khi update code)
// -------------------------------------------------------------

// Download full database file (.db)
app.get('/api/system/backup/download', (req, res) => {
  try {
    checkpointDatabase();
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Không tìm thấy tệp cơ sở dữ liệu' });
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `kpi_backup_${timestamp}.db`;

    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = fs.createReadStream(dbPath);
    stream.pipe(res);
  } catch (err) {
    console.error('Error downloading backup:', err);
    res.status(500).json({ error: 'Lỗi tải tệp sao lưu: ' + err.message });
  }
});

// List available automated backups
app.get('/api/system/backup/list', (req, res) => {
  try {
    if (!fs.existsSync(backupDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const fullPath = path.join(backupDir, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          size_bytes: stat.size,
          size_formatted: (stat.size / 1024).toFixed(1) + ' KB',
          created_at: stat.mtime
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(files);
  } catch (err) {
    console.error('Error listing backups:', err);
    res.status(500).json({ error: 'Lỗi lấy danh sách bản sao lưu: ' + err.message });
  }
});

// Trigger a manual snapshot backup
app.post('/api/system/backup/create', (req, res) => {
  try {
    const backupFile = createBackup('manual_backup');
    if (!backupFile) {
      return res.status(500).json({ error: 'Không thể tạo bản sao lưu' });
    }
    const filename = path.basename(backupFile);
    res.json({ success: true, message: `Đã tạo bản sao lưu thành công: ${filename}`, filename });
  } catch (err) {
    console.error('Error creating manual backup:', err);
    res.status(500).json({ error: 'Lỗi tạo bản sao lưu: ' + err.message });
  }
});

// Restore database from uploaded backup file
app.post('/api/system/backup/restore', upload.single('backup_file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Vui lòng chọn file sao lưu (.db) để phục hồi' });
    }

    // Verify SQLite magic header ("SQLite format 3\0")
    const header = req.file.buffer.slice(0, 16).toString('utf-8');
    if (!header.startsWith('SQLite format 3')) {
      return res.status(400).json({ error: 'File tải lên không phải là cơ sở dữ liệu SQLite hợp lệ (.db)' });
    }

    // 1. Create a safety snapshot of current DB before overwriting
    createBackup('pre_restore_safety');

    // 2. Checkpoint and safely replace db file
    checkpointDatabase();
    fs.writeFileSync(dbPath, req.file.buffer);

    // 3. Remove old WAL / SHM files to avoid schema conflict
    try {
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch (e) {}

    // 4. Re-run initDatabase to guarantee any newer migration columns exist
    initDatabase();

    res.json({
      success: true,
      message: 'Đã phục hồi cơ sở dữ liệu thành công! Toàn bộ dữ liệu của bạn đã được khôi phục nguyên vẹn.'
    });
  } catch (err) {
    console.error('Error restoring database:', err);
    res.status(500).json({ error: 'Lỗi phục hồi dữ liệu: ' + err.message });
  }
});

// -------------------------------------------------------------
// 10. Supabase Cloud Sync (Tách biệt hoàn toàn khỏi việc update code)
// -------------------------------------------------------------

// Lấy trạng thái kết nối Supabase và so sánh số lượng bản ghi SQLite vs Supabase
app.get('/api/system/supabase/status', async (req, res) => {
  try {
    const status = await getSupabaseStatus();
    res.json(status);
  } catch (err) {
    console.error('Error getting Supabase status:', err);
    res.status(500).json({ error: 'Lỗi kiểm tra trạng thái Supabase: ' + err.message });
  }
});

// Sao lưu chủ động từ SQLite lên Supabase Cloud
app.post('/api/system/supabase/push', async (req, res) => {
  try {
    const result = await pushToSupabase();
    res.json(result);
  } catch (err) {
    console.error('Error pushing to Supabase:', err);
    res.status(500).json({ error: 'Lỗi sao lưu lên Supabase: ' + err.message });
  }
});

// Khôi phục chủ động từ Supabase Cloud về SQLite máy chủ
app.post('/api/system/supabase/pull', async (req, res) => {
  try {
    const result = await pullFromSupabase();
    res.json(result);
  } catch (err) {
    console.error('Error pulling from Supabase:', err);
    res.status(500).json({ error: 'Lỗi khôi phục từ Supabase: ' + err.message });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: `Lỗi tải file: ${err.message}` });
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Lỗi xử lý yêu cầu trên máy chủ'
  });
});

// SPA fallback for non-API routes when frontend dist is built
if (frontendDist && fs.existsSync(frontendDist)) {
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    next();
  });
}

// -------------------------------------------------------------
// 11. Anti-Sleep Keep-Alive Daemon & Background Maintenance
// -------------------------------------------------------------

// Global Process Crash Prevention Guards
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception caught by global guard:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

// Keep-Alive Pinger to keep Render Web Service running continuously 24/7 without sleeping
function startKeepAlivePinger() {
  const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || process.env.SELF_PING_URL;
  if (!externalUrl) {
    console.log('[Keep-Alive] RENDER_EXTERNAL_URL is not configured (local development or URL not set). Keep-alive daemon in standby.');
    return;
  }

  const pingUrl = externalUrl.replace(/\/+$/, '') + '/api/health';
  console.log(`[Keep-Alive] 🚀 Keep-Alive Pinger activated for: ${pingUrl} (interval: 8 minutes)`);

  const PING_INTERVAL = 8 * 60 * 1000; // 8 minutes (Render free tier timeout is 15 minutes)

  // Initial ping after 30 seconds to confirm external routing
  setTimeout(() => {
    pingTarget();
    setInterval(pingTarget, PING_INTERVAL);
  }, 30 * 1000);

  async function pingTarget() {
    try {
      const startTime = Date.now();
      const res = await fetch(pingUrl, {
        headers: { 'User-Agent': 'KPI-System-KeepAlive-Worker/1.0' }
      });
      const duration = Date.now() - startTime;
      if (res.ok) {
        console.log(`[Keep-Alive] ❤️ Heartbeat ping successful -> ${pingUrl} (${duration}ms)`);
      } else {
        console.warn(`[Keep-Alive] ⚠️ Heartbeat ping returned status ${res.status}`);
      }
    } catch (err) {
      console.error('[Keep-Alive] ❌ Heartbeat ping failed:', err.message);
    }
  }
}

// Periodic database checkpoint and background maintenance every 30 minutes
setInterval(() => {
  try {
    checkpointDatabase();
  } catch (err) {
    console.error('[Maintenance] Periodic checkpoint error:', err.message);
  }
}, 30 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
  startKeepAlivePinger();
});
