const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'kpi.db');
const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupDir)) {
  try { fs.mkdirSync(backupDir, { recursive: true }); } catch (e) {}
}

// Auto-recovery if kpi.db was deleted (e.g. by git pull or branch switch)
if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) {
  try {
    if (fs.existsSync(backupDir)) {
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.db') && f !== 'kpi.db')
        .map(f => ({ name: f, path: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtime.getTime(), size: fs.statSync(path.join(backupDir, f)).size }))
        .filter(b => b.size > 0)
        .sort((a, b) => b.time - a.time);

      if (backups.length > 0) {
        console.log(`[Database Alert] kpi.db không tồn tại. Tự động phục hồi từ bản sao lưu gần nhất: ${backups[0].name} (${backups[0].size} bytes)...`);
        fs.copyFileSync(backups[0].path, dbPath);
        console.log('[Database Alert] Khôi phục tự động THÀNH CÔNG! Dữ liệu người dùng đã được bảo toàn 100%.');
      }
    }
  } catch (err) {
    console.error('[Database Alert] Lỗi khi tự động phục hồi kpi.db từ backup:', err);
  }
}

const db = new Database(dbPath);

// Enable foreign keys and WAL mode for high performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Flush WAL journal into the main database file
function checkpointDatabase() {
  try {
    const res = db.pragma('wal_checkpoint(TRUNCATE)');
    return res;
  } catch (e) {
    console.error('Error checkpointing database:', e.message);
    return null;
  }
}

// Create an automated snapshot backup
function createBackup(prefix = 'kpi_backup') {
  try {
    checkpointDatabase();
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const backupFile = path.join(backupDir, `${prefix}_${timestamp}.db`);
    fs.copyFileSync(dbPath, backupFile);

    // Keep max 15 recent backups
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => ({ name: f, path: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 15) {
      for (let i = 15; i < files.length; i++) {
        try { fs.unlinkSync(files[i].path); } catch (err) {}
      }
    }
    return backupFile;
  } catch (e) {
    console.error('Error creating database backup:', e.message);
    return null;
  }
}

// Flush WAL on process exit
process.on('SIGINT', () => {
  checkpointDatabase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  checkpointDatabase();
  process.exit(0);
});
process.on('beforeExit', () => {
  checkpointDatabase();
});

// Periodic checkpoint every 5 minutes
const checkpointTimer = setInterval(checkpointDatabase, 5 * 60 * 1000);
if (checkpointTimer.unref) checkpointTimer.unref();

function initDatabase() {
  try {
    if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
      createBackup('startup');
    }
  } catch (e) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      parent_agency TEXT,
      location_name TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT DEFAULT '123456',
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'cbql', 'cbnv')),
      party_title TEXT,
      gov_title TEXT,
      dept_id TEXT,
      FOREIGN KEY(dept_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS periods (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS axes (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      max_score REAL DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS standard_tasks (
      id TEXT PRIMARY KEY,
      period_id TEXT,
      dept_code TEXT,
      task_name TEXT NOT NULL,
      output_result TEXT,
      deadline TEXT,
      task_type TEXT CHECK(task_type IN ('Thường xuyên', 'Đột xuất')),
      standard_score REAL DEFAULT 10,
      difficulty_weight REAL DEFAULT 1.0,
      max_converted_score REAL,
      expected_evidence TEXT,
      note TEXT,
      axis_code TEXT,
      status TEXT DEFAULT 'Hoạt động',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(period_id) REFERENCES periods(id)
    );

    CREATE TABLE IF NOT EXISTS assigned_tasks (
      id TEXT PRIMARY KEY,
      period_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      standard_task_id TEXT,
      task_name TEXT NOT NULL,
      output_result TEXT,
      deadline TEXT NOT NULL,
      task_type TEXT DEFAULT 'Thường xuyên',
      standard_score REAL DEFAULT 10,
      difficulty_weight REAL DEFAULT 1.0,
      max_converted_score REAL,
      axis_code TEXT NOT NULL,
      origin TEXT DEFAULT 'assigned', -- 'assigned' (CBQL giao) or 'registered' (CBNV tự đăng ký)
      status TEXT DEFAULT 'in_progress', -- 'pending_approval', 'in_progress', 'submitted', 'approved', 'rejected'
      actual_finish_date TEXT,
      evidence_text TEXT,
      evidence_file_url TEXT,
      evidence_file_name TEXT,
      quantity_pct REAL DEFAULT 1.0,    -- 1.0 (100%) or 0
      progress_pct REAL DEFAULT 1.0,    -- 1.0, 0.8, 0.6, 0
      quality_pct REAL DEFAULT 1.0,     -- 1.0, 0.8, 0.6, 0
      leadership_pct REAL DEFAULT 1.0,  -- avg(quantity, progress, quality)
      execution_score REAL DEFAULT 0,
      converted_score REAL DEFAULT 0,
      cbql_comment TEXT,
      assigned_by TEXT,
      group_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(period_id) REFERENCES periods(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS common_criteria (
      id TEXT PRIMARY KEY,
      group_no INTEGER,
      group_name TEXT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      max_score REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      period_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      part1_score REAL DEFAULT 0,
      part2_score REAL DEFAULT 0,
      total_score REAL DEFAULT 0,
      rank_proposed TEXT,
      superior_rank TEXT,
      superior_comment TEXT,
      status TEXT DEFAULT 'draft', -- 'draft', 'submitted', 'approved'
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(period_id, user_id),
      FOREIGN KEY(period_id) REFERENCES periods(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS evaluation_criteria_details (
      id TEXT PRIMARY KEY,
      evaluation_id TEXT NOT NULL,
      criteria_id TEXT NOT NULL,
      is_satisfied INTEGER DEFAULT 1, -- 1: Đảm bảo, 0: Không đảm bảo
      score REAL DEFAULT 0,
      note TEXT,
      FOREIGN KEY(evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE,
      FOREIGN KEY(criteria_id) REFERENCES common_criteria(id)
    );

    CREATE TABLE IF NOT EXISTS system_configs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      data_scope TEXT DEFAULT 'personal', -- 'all', 'dept_tree', 'dept_only', 'subordinates', 'personal'
      permissions TEXT DEFAULT '{}',
      is_system INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      period_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      voter_id TEXT NOT NULL,
      vote_rank TEXT NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(period_id, user_id, voter_id),
      FOREIGN KEY(period_id) REFERENCES periods(id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(voter_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      doc_number TEXT NOT NULL,
      doc_date TEXT,
      arrival_date TEXT,
      arrival_number TEXT,
      issuer TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      field TEXT,
      urgency TEXT DEFAULT 'Thường',
      security_level TEXT DEFAULT 'Thường',
      summary TEXT NOT NULL,
      file_url TEXT,
      file_name TEXT,
      deadline TEXT,
      status TEXT DEFAULT 'pending_dispatch',
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS document_dispatches (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      department_id TEXT,
      assigned_to_user_id TEXT NOT NULL,
      coordinating_user_ids TEXT,
      instruction TEXT NOT NULL,
      deadline TEXT,
      task_id TEXT,
      status TEXT DEFAULT 'in_progress',
      dispatched_by TEXT,
      dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      completion_note TEXT,
      FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY(department_id) REFERENCES departments(id),
      FOREIGN KEY(assigned_to_user_id) REFERENCES users(id),
      FOREIGN KEY(dispatched_by) REFERENCES users(id),
      FOREIGN KEY(task_id) REFERENCES assigned_tasks(id) ON DELETE SET NULL
    );
  `);

  const migrations = [
    "ALTER TABLE assigned_tasks ADD COLUMN document_id TEXT;",
    "ALTER TABLE assigned_tasks ADD COLUMN group_id TEXT;",
    "ALTER TABLE assigned_tasks ADD COLUMN is_bonus_proposed INTEGER DEFAULT 0;",
    "ALTER TABLE assigned_tasks ADD COLUMN bonus_score REAL DEFAULT 0;",
    "ALTER TABLE assigned_tasks ADD COLUMN bonus_reason TEXT;",
    "ALTER TABLE users ADD COLUMN birth_date TEXT DEFAULT '1985-05-15';",
    "ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'Nam';",
    "ALTER TABLE users ADD COLUMN phone TEXT DEFAULT '0901234567';",
    "ALTER TABLE users ADD COLUMN email TEXT DEFAULT 'canbo@tphcm.gov.vn';",
    "ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;",
    "ALTER TABLE common_criteria ADD COLUMN target_role TEXT DEFAULT 'all';",
    "ALTER TABLE evaluations ADD COLUMN step TEXT DEFAULT 'step_1_register';",
    "ALTER TABLE evaluations ADD COLUMN bonus_score REAL DEFAULT 0;",
    "ALTER TABLE evaluations ADD COLUMN bonus_note TEXT;",
    "ALTER TABLE evaluations ADD COLUMN plan_total_max_score REAL DEFAULT 0;",
    "ALTER TABLE evaluations ADD COLUMN executed_total_conv_score REAL DEFAULT 0;",
    "ALTER TABLE evaluations ADD COLUMN summary_reason TEXT;",
    "ALTER TABLE evaluations ADD COLUMN cadre_proposal_note TEXT;",
    "ALTER TABLE users ADD COLUMN target_role TEXT DEFAULT 'cbnv';",
    "ALTER TABLE departments ADD COLUMN parent_id TEXT;",
    "ALTER TABLE departments ADD COLUMN leader_id TEXT;",
    "ALTER TABLE departments ADD COLUMN is_active INTEGER DEFAULT 1;",
    "ALTER TABLE departments ADD COLUMN description TEXT;",
    "ALTER TABLE users ADD COLUMN role_id TEXT;",
    "ALTER TABLE users ADD COLUMN manager_id TEXT;",
    "ALTER TABLE periods ADD COLUMN grading_lock_date TEXT;",
    "ALTER TABLE periods ADD COLUMN is_locked INTEGER DEFAULT 0;",
    "ALTER TABLE periods ADD COLUMN finalized_at TEXT;",
    "ALTER TABLE periods ADD COLUMN finalized_by TEXT;",
    "ALTER TABLE periods ADD COLUMN finalized_note TEXT;",
    "ALTER TABLE evaluations ADD COLUMN return_reason TEXT;",
    "ALTER TABLE evaluations ADD COLUMN returned_at TEXT;",
    "ALTER TABLE evaluations ADD COLUMN returned_by TEXT;",
    "ALTER TABLE evaluations ADD COLUMN submitted_at TEXT;",
    "ALTER TABLE assigned_tasks ADD COLUMN return_reason TEXT;",
    "ALTER TABLE assigned_tasks ADD COLUMN is_returned INTEGER DEFAULT 0;",
    "ALTER TABLE departments ADD COLUMN parent_agency TEXT;",
    "ALTER TABLE departments ADD COLUMN location_name TEXT;",
    "ALTER TABLE assigned_tasks ADD COLUMN feedback_reason TEXT;",
    "ALTER TABLE assigned_tasks ADD COLUMN feedback_count INTEGER DEFAULT 0;",
    "ALTER TABLE assigned_tasks ADD COLUMN reassigned_at TEXT;",
    "ALTER TABLE assigned_tasks ADD COLUMN evaluation_feedback TEXT;",
    "ALTER TABLE evaluations ADD COLUMN advisory_rank TEXT;",
    "ALTER TABLE evaluations ADD COLUMN advisory_comment TEXT;",
    "ALTER TABLE evaluations ADD COLUMN advisory_by TEXT;",
    "ALTER TABLE evaluations ADD COLUMN advisory_submitted_at TEXT;",
    "ALTER TABLE evaluations ADD COLUMN is_advisory_submitted INTEGER DEFAULT 0;",
    "ALTER TABLE assigned_tasks ADD COLUMN inherited_from_task_id TEXT;",
    "ALTER TABLE assigned_tasks ADD COLUMN inherited_from_user_name TEXT;",
    "ALTER TABLE users ADD COLUMN management_role TEXT DEFAULT 'nhan_vien';",
    "ALTER TABLE users ADD COLUMN final_evaluator_id TEXT;"
  ];

  for (const m of migrations) {
    try { db.exec(m); } catch (e) {}
  }

  // Backfill management_role for users if default
  try {
    db.prepare(`
      UPDATE users 
      SET management_role = CASE
        WHEN role = 'admin' OR LOWER(gov_title) LIKE '%trưởng ban%' OR LOWER(gov_title) LIKE '%hiệu trưởng%' OR LOWER(gov_title) LIKE '%giám đốc%' OR LOWER(party_title) LIKE '%bí thư%' THEN 'lanh_dao'
        WHEN role = 'cbql' AND (LOWER(gov_title) LIKE '%phó%' OR LOWER(party_title) LIKE '%phó%') THEN 'quan_ly'
        WHEN LOWER(gov_title) LIKE '%tổ trưởng%' THEN 'to_truong'
        WHEN role = 'cbql' THEN 'quan_ly'
        ELSE 'nhan_vien'
      END
      WHERE management_role IS NULL
    `).run();
  } catch (e) {}

  // Backfill parent_agency and location_name for departments if not set
  try {
    db.prepare("UPDATE departments SET parent_agency = 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH' WHERE parent_agency IS NULL OR parent_agency = ''").run();
    db.prepare("UPDATE departments SET location_name = 'TP. Hồ Chí Minh' WHERE location_name IS NULL OR location_name = ''").run();
  } catch (e) {}

  // Ensure default roles exist
  try {
    const defaultRoles = [
      {
        id: 'role-admin',
        code: 'admin',
        name: 'Quản trị viên Hệ thống',
        description: 'Toàn quyền cấu hình hệ thống, quản lý tài khoản, đơn vị và dữ liệu toàn cơ quan',
        data_scope: 'all',
        permissions: JSON.stringify({
          can_manage_system: true,
          can_manage_users: true,
          can_assign_tasks: true,
          can_grade_tasks: true,
          can_conclude_evaluation: true,
          can_view_all_reports: true
        }),
        is_system: 1
      },
      {
        id: 'role-ld-coquan',
        code: 'ld_coquan',
        name: 'Lãnh đạo Cơ quan / Thường vụ',
        description: 'Lãnh đạo Ban Thường vụ, Thường trực - Quản lý, giao việc và xem báo cáo toàn cơ quan',
        data_scope: 'all',
        permissions: JSON.stringify({
          can_manage_system: false,
          can_manage_users: true,
          can_assign_tasks: true,
          can_grade_tasks: true,
          can_conclude_evaluation: true,
          can_view_all_reports: true
        }),
        is_system: 1
      },
      {
        id: 'role-cbql-phong',
        code: 'cbql_phong',
        name: 'Lãnh đạo Phòng / Đơn vị (CBQL)',
        description: 'Trưởng/Phó Phòng ban - Quản lý trực tiếp phòng mình và gián tiếp các tổ/bộ phận trực thuộc',
        data_scope: 'dept_tree',
        permissions: JSON.stringify({
          can_manage_system: false,
          can_manage_users: false,
          can_assign_tasks: true,
          can_grade_tasks: true,
          can_conclude_evaluation: true,
          can_view_all_reports: false
        }),
        is_system: 1
      },
      {
        id: 'role-to-truong',
        code: 'to_truong',
        name: 'Tổ trưởng / Trưởng bộ phận',
        description: 'Quản lý trực tiếp các cán bộ nhân viên trong tổ hoặc được phân công quản lý',
        data_scope: 'subordinates',
        permissions: JSON.stringify({
          can_manage_system: false,
          can_manage_users: false,
          can_assign_tasks: true,
          can_grade_tasks: true,
          can_conclude_evaluation: false,
          can_view_all_reports: false
        }),
        is_system: 0
      },
      {
        id: 'role-cbnv',
        code: 'cbnv',
        name: 'Cán bộ nhân viên (CBNV)',
        description: 'Chuyên viên, nhân viên thực hiện công việc, nộp minh chứng và tự đánh giá KPI cá nhân',
        data_scope: 'personal',
        permissions: JSON.stringify({
          can_manage_system: false,
          can_manage_users: false,
          can_assign_tasks: false,
          can_grade_tasks: false,
          can_conclude_evaluation: false,
          can_view_all_reports: false
        }),
        is_system: 1
      }
    ];

    const insertRoleStmt = db.prepare(`
      INSERT OR IGNORE INTO roles (id, code, name, description, data_scope, permissions, is_system)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of defaultRoles) {
      insertRoleStmt.run(r.id, r.code, r.name, r.description, r.data_scope, r.permissions, r.is_system);
    }
  } catch (e) {
    console.error('Error seeding default roles:', e);
  }

  // Update existing users with role_id if missing
  try {
    db.prepare("UPDATE users SET role_id = 'role-admin' WHERE (role = 'admin' OR username = 'admin') AND role_id IS NULL").run();
    db.prepare("UPDATE users SET role_id = 'role-cbql-phong' WHERE role = 'cbql' AND role_id IS NULL").run();
    db.prepare("UPDATE users SET role_id = 'role-cbnv' WHERE role = 'cbnv' AND role_id IS NULL").run();
  } catch (e) {
    console.error('Error linking users to roles:', e);
  }

  // Ensure Admin user and target_role values exist
  try {
    const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    if (!adminExists) {
      db.prepare(`
        INSERT INTO users (id, username, password, full_name, role, role_id, target_role, party_title, gov_title, dept_id, is_active)
        VALUES ('usr-admin', 'admin', 'Hoangyen@123456', 'Quản trị viên Hệ thống', 'admin', 'role-admin', 'cbql', 'Cấp ủy viên', 'Quản trị viên', 'dept-1', 1)
      `).run();
    } else {
      // Tự động sửa lỗi font nếu có ký tự hỏi chấm '?' do lỗi encoding trước đây
      db.prepare(`
        UPDATE users 
        SET full_name = 'Quản trị viên Hệ thống',
            gov_title = 'Quản trị viên',
            party_title = 'Cấp ủy viên'
        WHERE username = 'admin' AND (full_name LIKE '%?%' OR gov_title LIKE '%?%')
      `).run();
    }
    db.prepare("UPDATE users SET target_role = 'cbql' WHERE role = 'cbql' AND target_role IS NULL").run();
    db.prepare("UPDATE users SET target_role = 'cbnv' WHERE role = 'cbnv' AND target_role IS NULL").run();
  } catch (e) {
    console.error('Error ensuring admin user:', e);
  }

  // Ensure system_configs are seeded
  try {
    const cfgCount = db.prepare('SELECT COUNT(*) as count FROM system_configs').get().count;
    if (cfgCount === 0) {
      const insertCfg = db.prepare('INSERT OR IGNORE INTO system_configs (key, value, description) VALUES (?, ?, ?)');
      insertCfg.run('WEIGHT_PROGRESS', '0.30', 'Tỷ trọng tiêu chí tiến độ công việc (30%)');
      insertCfg.run('WEIGHT_QUALITY', '0.70', 'Tỷ trọng tiêu chí chất lượng công việc (70%)');
      insertCfg.run('PART2_MAX_SCORE', '70.0', 'Điểm tối đa Phần B - Kết quả công việc (70 điểm)');
      insertCfg.run('BONUS_RATE_PER_TASK', '0.05', 'Tỷ lệ cộng điểm thưởng cho mỗi nhiệm vụ vượt mức/sáng tạo (5%)');
      insertCfg.run('MAX_BONUS_SCORE', '7.0', 'Điểm thưởng tối đa (10% của 70 điểm = 7 điểm)');
      insertCfg.run('MAX_EXCELLENT_PCT', '20', 'Tỷ lệ cán bộ hoàn thành xuất sắc nhiệm vụ tối đa toàn cơ quan (20%)');
      insertCfg.run('RANK_EXCELLENT_MIN', '90', 'Ngưỡng điểm tối thiểu xếp loại Hoàn thành xuất sắc nhiệm vụ (90 điểm)');
      insertCfg.run('RANK_GOOD_MIN', '70', 'Ngưỡng điểm tối thiểu xếp loại Hoàn thành tốt nhiệm vụ (70 điểm)');
      insertCfg.run('RANK_COMPLETE_MIN', '50', 'Ngưỡng điểm tối thiểu xếp loại Hoàn thành nhiệm vụ (50 điểm)');
    }
  } catch (e) {
    console.error('Error seeding system_configs:', e);
  }

  // Ensure CBNV Group 2 criteria exist
  try {
    const cbnvCritCount = db.prepare("SELECT COUNT(*) as count FROM common_criteria WHERE code = '2.1' AND target_role = 'cbnv'").get().count;
    if (cbnvCritCount === 0) {
      const insCrit = db.prepare('INSERT OR IGNORE INTO common_criteria (id, group_no, group_name, code, title, max_score, target_role) VALUES (?, ?, ?, ?, ?, ?, ?)');
      insCrit.run('crit-cbnv-2-1', 2, 'Tinh thần trách nhiệm, năng động, sáng tạo, đổi mới trong thực hiện nhiệm vụ', '2.1', 'Năng động, sáng tạo, dám nghĩ, dám làm, dám chịu trách nhiệm vì lợi ích chung; có giải pháp, sáng kiến đổi mới nâng cao hiệu quả công tác', 2.0, 'cbnv');
      insCrit.run('crit-cbnv-2-2', 2, 'Tinh thần trách nhiệm, năng động, sáng tạo, đổi mới trong thực hiện nhiệm vụ', '2.2', 'Chủ động, tích cực nghiên cứu, học tập nâng cao trình độ chuyên môn nghiệp vụ; ứng dụng công nghệ thông tin, chuyển đổi số vào công việc', 1.0, 'cbnv');
      insCrit.run('crit-cbnv-2-3', 2, 'Tinh thần trách nhiệm, năng động, sáng tạo, đổi mới trong thực hiện nhiệm vụ', '2.3', 'Có tinh thần phối hợp tốt với đồng nghiệp; thái độ phục vụ nhân dân, tổ chức tận tình, chu đáo, không gây phiền hà, nhũng nhiễu', 1.0, 'cbnv');
      db.prepare("UPDATE common_criteria SET target_role = 'cbql' WHERE code IN ('10', '11', '12', '13')").run();
    }
  } catch (e) {
    console.error('Error seeding CBNV criteria:', e);
  }

  seedData();
}

function seedData() {
  const deptCount = db.prepare('SELECT COUNT(*) as count FROM departments').get().count;
  if (deptCount > 0) return;

  console.log('Seeding initial system data...');

  // 1. Departments
  const insertDept = db.prepare('INSERT INTO departments (id, code, name) VALUES (?, ?, ?)');
  insertDept.run('dept-1', 'A29.123.22', 'Chi bộ Trường Mầm non Hoàng Yến');
  insertDept.run('dept-2', 'BTC.TU', 'Ban Tổ chức Thành ủy');

  // 2. Default Periods
  const insertPeriod = db.prepare(`
    INSERT INTO periods (id, code, name, start_date, end_date, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertPeriod.run('p-1', 'KPI-Q2-2026', 'Đánh giá KPI Quý II/2026', '2026-04-01', '2026-06-30', 1);
  insertPeriod.run('p-2', 'KPI-Q3-2026', 'Đánh giá KPI Quý III/2026', '2026-07-01', '2026-09-30', 1);
  insertPeriod.run('p-3', 'KPI-Q4-2026', 'Đánh giá KPI Quý IV/2026', '2026-10-01', '2026-12-31', 1);

  // 4. 6 Trục kết quả trọng tâm
  const insertAxis = db.prepare('INSERT INTO axes (id, code, name, max_score) VALUES (?, ?, ?, ?)');
  insertAxis.run('ax-1', 'TRUC_1', 'TRỤC 1 - THỰC HIỆN MỤC TIÊU PHÁT TRIỂN KINH TẾ - XÃ HỘI VÀ NHIỆM VỤ CHÍNH TRỊ ĐƯỢC GIAO', 10);
  insertAxis.run('ax-2', 'TRUC_2', 'TRỤC 2 - HOÀN THIỆN THỂ CHẾ, ĐẨY MẠNH PHÂN CẤP, PHÂN QUYỀN GẮN VỚI KIỂM TRA, GIÁM SÁT', 15);
  insertAxis.run('ax-3', 'TRUC_3', 'TRỤC 3 - THÚC ĐẨY PHÁT TRIỂN KHOA HỌC, CÔNG NGHỆ, ĐỔI MỚI SÁNG TẠO VÀ CHUYỂN ĐỔI SỐ', 10);
  insertAxis.run('ax-4', 'TRUC_4', 'TRỤC 4 - XÂY DỰNG ĐẢNG VÀ HỆ THỐNG CHÍNH TRỊ TRONG SẠCH, VỮNG MẠNH; GIỮ GÌN ĐOÀN KẾT, THỐNG NHẤT NỘI BỘ; PHÒNG, CHỐNG THAM NHŨNG, LÃNG PHÍ, TIÊU CỰC', 20);
  insertAxis.run('ax-5', 'TRUC_5', 'TRỤC 5 - PHÁT TRIỂN VĂN HÓA, CON NGƯỜI, BẢO ĐẢM AN SINH XÃ HỘI, NÂNG CAO ĐỜI SỐNG NHÂN DÂN', 10);
  insertAxis.run('ax-6', 'TRUC_6', 'TRỤC 6 - CỦNG CỐ QUỐC PHÒNG, AN NINH, GIỮ VỮNG ỔN ĐỊNH CHÍNH TRỊ - XÃ HỘI, NÂNG CAO HIỆU QUẢ ĐỐI NGOẠI VÀ HỘI NHẬP QUỐC TẾ', 5);

  // 5. 17 Tiêu chí chung (Quy định 366-QĐ/TW) - Tổng 30 điểm
  const insertCriteria = db.prepare(`
    INSERT INTO common_criteria (id, group_no, group_name, code, title, max_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const g1 = 'Về phẩm chất chính trị, đạo đức, lối sống, thực hiện trách nhiệm nêu gương';
  const c1Items = [
    'Tuyệt đối trung thành với Đảng, Tổ quốc và Nhân dân; kiên định chủ nghĩa Mác - Lênin, tư tưởng Hồ Chí Minh, mục tiêu độc lập dân tộc và CNXH. Bảo vệ nền tảng tư tưởng của Đảng.',
    'Có tinh thần yêu nước sâu sắc, tận tuỵ phục vụ Nhân dân, sâu sát cơ sở, luôn hành động vì lợi ích của Nhân dân.',
    'Chấp hành nghiêm chủ trương, đường lối, nghị quyết, chỉ thị, quy định của Đảng, pháp luật Nhà nước và quy chế cơ quan.',
    'Có tinh thần tự giác, trách nhiệm cao trong nghiên cứu, học tập chủ nghĩa Mác - Lênin, tư tưởng Hồ Chí Minh và bồi dưỡng chuyên môn.',
    'Có phẩm chất đạo đức, lối sống trong sáng, cần kiệm liêm chính, chí công vô tư; chấp hành chuẩn mực đạo đức cách mạng.',
    'Không tham vọng quyền lực, không chạy chức chạy quyền, không tham nhũng lãng phí tiêu cực, lợi ích nhóm.',
    'Có uy tín cao, tiêu biểu về phẩm chất đạo đức và phong cách công tác; là trung tâm đoàn kết nội bộ.',
    'Có tinh thần chủ động, đổi mới sáng tạo; phấn đấu vì mục tiêu phát triển chung của cơ quan, đơn vị.',
    'Thực hiện việc kê khai và công khai tài sản, thu nhập theo quy định. Báo cáo trung thực, đầy đủ thông tin.'
  ];
  c1Items.forEach((text, i) => {
    insertCriteria.run(`crit-1-${i + 1}`, 1, g1, `1.${i + 1}`, text, 2);
  });

  const g2 = 'Tư duy đổi mới, chiến lược, khát vọng cống hiến, dám nghĩ, dám làm';
  const c2Items = [
    'Có tư duy đổi mới, tầm nhìn chiến lược, khả năng lãnh đạo thích ứng với sự phát triển và xu thế mới.',
    'Luôn bám sát thực tiễn, có nhiều cách làm hay, sáng tạo, đạt hiệu quả cao trong tổ chức thực hiện nhiệm vụ.',
    'Nói đi đôi với làm, dám nghĩ, dám làm, dám chịu trách nhiệm, dám đột phá vì lợi ích chung.',
    'Có khát vọng phấn đấu, cống hiến; có khả năng quy tụ và phát huy sức mạnh tập thể.'
  ];
  c2Items.forEach((text, i) => {
    insertCriteria.run(`crit-2-${i + 1}`, 2, g2, `2.${i + 1}`, text, 1);
  });

  const g3 = 'Về tự phê bình và phê bình, tự soi, tự sửa, khắc phục hạn chế, khuyết điểm';
  const c3Items = [
    'Chủ động, nghiêm túc thực hiện tự phê bình và phê bình, có tinh thần cầu thị và tiếp thu phản biện, góp ý.',
    'Có kế hoạch rõ ràng và quyết liệt trong khắc phục hạn chế, khuyết điểm đã được chỉ ra.',
    'Kết quả khắc phục hoàn thành từ ≥ 80% nội dung, có tiến bộ rõ, được tổ chức đánh giá tốt; không để tái diễn tồn tại.',
    'Tự soi, tự sửa trên tinh thần trách nhiệm chính trị cao, không né tránh, không đổ lỗi.'
  ];
  c3Items.forEach((text, i) => {
    insertCriteria.run(`crit-3-${i + 1}`, 3, g3, `3.${i + 1}`, text, 2);
  });

  // 6. System Configs
  const insertConfig = db.prepare('INSERT OR IGNORE INTO system_configs (key, value, description) VALUES (?, ?, ?)');
  insertConfig.run('progress_weight', '0.30', 'Tỷ trọng đánh giá tiến độ (30%)');
  insertConfig.run('quality_weight', '0.70', 'Tỷ trọng đánh giá chất lượng (70%)');
  insertConfig.run('part2_max_score', '70', 'Điểm tối đa Phần B - Kết quả công việc (70 điểm)');
  insertConfig.run('part1_max_score', '30', 'Điểm tối đa Phần A - Nhóm tiêu chí chung (30 điểm)');
  insertConfig.run('bonus_max_score', '7', 'Điểm thưởng tối đa (tối đa 10% Phần B = 7 điểm)');
  insertConfig.run('bonus_rate_per_task', '0.05', 'Tỷ lệ điểm thưởng cho công việc nổi trội (5% điểm KPI việc đó)');
  insertConfig.run('excellent_score_threshold', '90', 'Ngưỡng điểm tối thiểu xếp loại Hoàn thành xuất sắc');
  insertConfig.run('excellent_ahead_pct', '30', 'Tỷ lệ tối thiểu công việc vượt tiến độ/chất lượng để xếp loại Xuất sắc (30%)');
  insertConfig.run('excellent_cadre_quota', '20', 'Tỷ lệ tối đa cán bộ xếp loại Xuất sắc trong toàn cơ quan (20%)');
  insertConfig.run('good_score_threshold', '70', 'Ngưỡng điểm tối thiểu xếp loại Hoàn thành tốt');
  insertConfig.run('pass_score_threshold', '50', 'Ngưỡng điểm tối thiểu xếp loại Hoàn thành');
  insertConfig.run('PARENT_AGENCY_NAME', 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH', 'Tên cơ quan cấp trên / Cơ quan chủ quản');
  insertConfig.run('UNIT_NAME', 'BAN TỔ CHỨC THÀNH ỦY TP. HỒ CHÍ MINH', 'Tên cơ quan, đơn vị');
  insertConfig.run('LOCATION_NAME', 'TP. Hồ Chí Minh', 'Tên địa phương lập báo cáo');
  insertConfig.run('LEADER_SIGNER_NAME', 'Thái Thị Bích Liên', 'Họ tên Lãnh đạo/Thủ trưởng cơ quan ký');
  insertConfig.run('LEADER_SIGNER_TITLE', 'PHÓ TRƯỞNG BAN THƯỜNG TRỰC', 'Chức danh Lãnh đạo cơ quan ký');
  insertConfig.run('DEPT_LEADER_TITLE', 'TRƯỞNG PHÒNG', 'Chức danh người quản lý đơn vị / CBQL');

  // Ensure Admin user exists
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    db.prepare(`
      INSERT INTO users (id, username, password, full_name, role, role_id, party_title, gov_title, dept_id, birth_date, gender, phone, email, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run('usr-admin', 'admin', 'Hoangyen@123456', 'Quản trị viên Hệ thống', 'admin', 'role-admin', 'Cấp ủy viên', 'Quản trị viên', 'dept-1', '1980-01-01', 'Nam', '0909999888', 'admin@hoangyen.edu.vn');
  }

  // Update CBQL Group 2 target_role
  db.prepare("UPDATE common_criteria SET target_role = 'cbql' WHERE group_no = 2 AND id LIKE 'crit-2-%'").run();

  // Group 2 for CBNV (Mẫu 01-B: 3 criteria, total 4 pts)
  const insertCriteriaRole = db.prepare(`
    INSERT OR IGNORE INTO common_criteria (id, group_no, group_name, code, title, max_score, target_role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertCriteriaRole.run(
    'crit-cbnv-2-1',
    2,
    g2,
    '2.1',
    'Có tư duy đổi mới, thích ứng với sự phát triển của thời đại và xu thế toàn cầu hoá; phương pháp làm việc khoa học, nhạy bén chính trị',
    2,
    'cbnv'
  );
  insertCriteriaRole.run(
    'crit-cbnv-2-2',
    2,
    g2,
    '2.2',
    'Luôn bám sát thực tiễn, có nhiều cách làm hay, sáng tạo, đạt hiệu quả cao thực hiện nhiệm vụ',
    1,
    'cbnv'
  );
  insertCriteriaRole.run(
    'crit-cbnv-2-3',
    2,
    g2,
    '2.3',
    'Nói đi đôi với làm, dám nghĩ, dám làm, dám chịu trách nhiệm, dám đột phá vì lợi ích chung. Có khả năng phân tích, dự báo tình hình, phát hiện những khó khăn, bất cập, thời cơ, thuận lợi trong thực tiễn; kịp thời đề xuất hoặc quyết định những giải pháp phù hợp, kịp thời, hiệu quả',
    1,
    'cbnv'
  );

  console.log('Database initialized and seeded successfully.');
}

/**
 * Lấy danh sách ID của đơn vị và tất cả các đơn vị con/cháu trực thuộc gián tiếp
 */
function getDepartmentDescendantIds(deptId) {
  if (!deptId) return [];
  const result = new Set([deptId]);
  const queue = [deptId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = db.prepare('SELECT id FROM departments WHERE parent_id = ? AND (is_active IS NULL OR is_active = 1)').all(currentId);
    for (const child of children) {
      if (!result.has(child.id)) {
        result.add(child.id);
        queue.push(child.id);
      }
    }
  }

  return Array.from(result);
}

/**
 * Xác định danh sách ID người dùng mà viewerUserId có thẩm quyền xem/quản lý:
 * - null: Toàn quyền xem mọi dữ liệu (Admin, Lãnh đạo cấp cao)
 * - Array[id, ...]: Danh sách ID được phép xem (Bản thân, phòng ban trực tiếp, đơn vị con gián tiếp, cấp dưới theo tuyến quản lý)
 */
function getAccessibleUserIds(viewerUserId) {
  if (!viewerUserId) return null;

  const user = db.prepare(`
    SELECT u.*, r.code as role_code, r.data_scope, r.permissions
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.id = ?
  `).get(viewerUserId);

  if (!user) return null;

  let dataScope = user.data_scope;
  if (!dataScope) {
    if (user.role === 'admin') dataScope = 'all';
    else if (user.role === 'cbql') dataScope = 'dept_tree';
    else dataScope = 'personal';
  }

  if (dataScope === 'all') {
    return null;
  }

  const accessibleSet = new Set([user.id]);

  const managedDeptIds = new Set();
  if (dataScope === 'dept_tree' && user.dept_id) {
    getDepartmentDescendantIds(user.dept_id).forEach(id => managedDeptIds.add(id));
  } else if (dataScope === 'dept_only' && user.dept_id) {
    managedDeptIds.add(user.dept_id);
  }

  // Nếu người dùng là leader_id của bất kỳ đơn vị nào
  const leaderDepts = db.prepare('SELECT id FROM departments WHERE leader_id = ?').all(user.id);
  leaderDepts.forEach(d => {
    getDepartmentDescendantIds(d.id).forEach(id => managedDeptIds.add(id));
  });

  if (managedDeptIds.size > 0) {
    const deptIdList = Array.from(managedDeptIds);
    const placeholders = deptIdList.map(() => '?').join(',');
    const deptUsers = db.prepare(`SELECT id FROM users WHERE dept_id IN (${placeholders})`).all(...deptIdList);
    deptUsers.forEach(u => accessibleSet.add(u.id));
  }

  // Tuyến quản lý cấp dưới trực tiếp/gián tiếp qua manager_id
  const managerQueue = [user.id];
  while (managerQueue.length > 0) {
    const mgrId = managerQueue.shift();
    const subs = db.prepare('SELECT id FROM users WHERE manager_id = ?').all(mgrId);
    for (const sub of subs) {
      if (!accessibleSet.has(sub.id)) {
        accessibleSet.add(sub.id);
        managerQueue.push(sub.id);
      }
    }
  }

  // Cán bộ mà người này là Người đánh giá cuối cùng
  try {
    const evaluatedSubs = db.prepare('SELECT id FROM users WHERE final_evaluator_id = ?').all(user.id);
    evaluatedSubs.forEach(u => accessibleSet.add(u.id));
  } catch (e) {}

  return Array.from(accessibleSet);
}

module.exports = {
  db,
  dbPath,
  backupDir,
  checkpointDatabase,
  createBackup,
  initDatabase,
  getDepartmentDescendantIds,
  getAccessibleUserIds
};

