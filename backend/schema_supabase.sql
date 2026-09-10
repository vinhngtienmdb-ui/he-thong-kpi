-- ==============================================================================
-- HE THONG KPI & QUAN LY VAN BAN - SUPABASE POSTGRESQL DDL SCHEMA
-- Chay truc tiep tren Supabase SQL Editor de khoi tao toan bo co so du lieu
-- ==============================================================================

SET search_path = public;

-- 1. Departments (Don vi / Phong ban)
CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT,
    leader_id TEXT,
    is_active INTEGER DEFAULT 1,
    description TEXT,
    parent_agency TEXT,
    location_name TEXT
);

-- 2. Roles (Phan quyen & Vai tro)
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    data_scope TEXT DEFAULT 'personal',
    permissions TEXT DEFAULT '{}',
    is_system INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Users (Can bo, Cong chuc, Vien chuc, Nhan vien)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT DEFAULT '123456',
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'cbql', 'cbnv')),
    party_title TEXT,
    gov_title TEXT,
    dept_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
    birth_date TEXT DEFAULT '1985-05-15',
    gender TEXT DEFAULT 'Nam',
    phone TEXT DEFAULT '0901234567',
    email TEXT DEFAULT 'canbo@tphcm.gov.vn',
    is_active INTEGER DEFAULT 1,
    target_role TEXT DEFAULT 'cbnv',
    role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
    manager_id TEXT,
    management_role TEXT DEFAULT 'nhan_vien',
    final_evaluator_id TEXT
);

-- 4. Periods (Ky danh gia KPI)
CREATE TABLE IF NOT EXISTS periods (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    is_active INTEGER DEFAULT 1,
    grading_lock_date TEXT,
    is_locked INTEGER DEFAULT 0,
    finalized_at TEXT,
    finalized_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    finalized_note TEXT
);

-- 5. Axes (6 truc tieu chi KPI)
CREATE TABLE IF NOT EXISTS axes (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    max_score NUMERIC DEFAULT 10
);

-- 6. Standard Tasks (Danh muc cong viec chuan)
CREATE TABLE IF NOT EXISTS standard_tasks (
    id TEXT PRIMARY KEY,
    period_id TEXT REFERENCES periods(id) ON DELETE CASCADE,
    dept_code TEXT,
    task_name TEXT NOT NULL,
    output_result TEXT,
    deadline TEXT,
    task_type TEXT CHECK (task_type IN ('Thường xuyên', 'Đột xuất')),
    standard_score NUMERIC DEFAULT 10,
    difficulty_weight NUMERIC DEFAULT 1.0,
    max_converted_score NUMERIC,
    expected_evidence TEXT,
    note TEXT,
    axis_code TEXT,
    status TEXT DEFAULT 'Hoạt động',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Common Criteria (Tieu chi chung)
CREATE TABLE IF NOT EXISTS common_criteria (
    id TEXT PRIMARY KEY,
    group_no INTEGER,
    group_name TEXT,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    max_score NUMERIC NOT NULL,
    target_role TEXT DEFAULT 'all'
);

-- 8. Documents (Quan ly Van ban den & di)
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
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    leader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    leader_instruction TEXT,
    submitted_at TIMESTAMPTZ,
    submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    is_reference_only INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Assigned Tasks (Cong viec giao & Tu dang ky, Minh chung & Diem)
CREATE TABLE IF NOT EXISTS assigned_tasks (
    id TEXT PRIMARY KEY,
    period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    standard_task_id TEXT REFERENCES standard_tasks(id) ON DELETE SET NULL,
    task_name TEXT NOT NULL,
    output_result TEXT,
    deadline TEXT NOT NULL,
    task_type TEXT DEFAULT 'Thường xuyên',
    standard_score NUMERIC DEFAULT 10,
    difficulty_weight NUMERIC DEFAULT 1.0,
    max_converted_score NUMERIC,
    axis_code TEXT NOT NULL,
    origin TEXT DEFAULT 'assigned',
    status TEXT DEFAULT 'in_progress',
    actual_finish_date TEXT,
    evidence_text TEXT,
    evidence_file_url TEXT,
    evidence_file_name TEXT,
    quantity_pct NUMERIC DEFAULT 1.0,
    progress_pct NUMERIC DEFAULT 1.0,
    quality_pct NUMERIC DEFAULT 1.0,
    leadership_pct NUMERIC DEFAULT 1.0,
    execution_score NUMERIC DEFAULT 0,
    converted_score NUMERIC DEFAULT 0,
    cbql_comment TEXT,
    assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    group_id TEXT,
    is_bonus_proposed INTEGER DEFAULT 0,
    bonus_score NUMERIC DEFAULT 0,
    bonus_reason TEXT,
    return_reason TEXT,
    is_returned INTEGER DEFAULT 0,
    document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    feedback_reason TEXT,
    feedback_count INTEGER DEFAULT 0,
    reassigned_at TEXT,
    evaluation_feedback TEXT,
    inherited_from_task_id TEXT,
    inherited_from_user_name TEXT
);

-- 10. Evaluations (Bang tong hop danh gia KPI ca nhan)
CREATE TABLE IF NOT EXISTS evaluations (
    id TEXT PRIMARY KEY,
    period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    part1_score NUMERIC DEFAULT 0,
    part2_score NUMERIC DEFAULT 0,
    total_score NUMERIC DEFAULT 0,
    rank_proposed TEXT,
    superior_rank TEXT,
    superior_comment TEXT,
    advisory_rank TEXT,
    advisory_comment TEXT,
    advisory_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    advisory_submitted_at TEXT,
    is_advisory_submitted INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    step TEXT DEFAULT 'step_1_register',
    bonus_score NUMERIC DEFAULT 0,
    bonus_note TEXT,
    plan_total_max_score NUMERIC DEFAULT 0,
    executed_total_conv_score NUMERIC DEFAULT 0,
    summary_reason TEXT,
    cadre_proposal_note TEXT,
    return_reason TEXT,
    returned_at TEXT,
    returned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TEXT,
    UNIQUE (period_id, user_id)
);

-- 11. Evaluation Criteria Details (Chi tiet cham tieu chi chung)
CREATE TABLE IF NOT EXISTS evaluation_criteria_details (
    id TEXT PRIMARY KEY,
    evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    criteria_id TEXT NOT NULL REFERENCES common_criteria(id) ON DELETE CASCADE,
    is_satisfied INTEGER DEFAULT 1,
    score NUMERIC DEFAULT 0,
    note TEXT
);

-- 12. System Configs (Cau hinh he thong)
CREATE TABLE IF NOT EXISTS system_configs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
);

-- 13. Votes (Bieu quyet xep loai can bo cua Hoi dong Lanh dao)
CREATE TABLE IF NOT EXISTS votes (
    id TEXT PRIMARY KEY,
    period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    voter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_rank TEXT NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (period_id, user_id, voter_id)
);

-- 14. Document Dispatches (Phan bo van ban cho can bo & theo doi tien do)
CREATE TABLE IF NOT EXISTS document_dispatches (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
    assigned_to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coordinating_user_ids TEXT,
    instruction TEXT NOT NULL,
    deadline TEXT,
    task_id TEXT REFERENCES assigned_tasks(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'in_progress',
    dispatch_type TEXT DEFAULT 'process',
    role_in_dispatch TEXT DEFAULT 'main',
    dispatched_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    dispatched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    completion_note TEXT
);

-- 15. User Groups (Nhom nguoi dung / To cong tac tu tao)
CREATE TABLE IF NOT EXISTS user_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    dept_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. User Group Members (Thanh vien nhom nguoi dung tu tao)
CREATE TABLE IF NOT EXISTS user_group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (group_id, user_id)
);

-- ==============================================================================
-- KHOA NGOAI TU THAM CHIEU & LIEN KET CHEO (THEM SAU KHI TAT CA CAC BANG DA TAO)
-- ==============================================================================
ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_departments_parent;
ALTER TABLE departments ADD CONSTRAINT fk_departments_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_departments_leader;
ALTER TABLE departments ADD CONSTRAINT fk_departments_leader FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_manager;
ALTER TABLE users ADD CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

-- ==============================================================================
-- CHI MUC (INDEXES) TOI UU TOC DO TRUY VAN
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_users_dept ON users(dept_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_user ON assigned_tasks(user_id, period_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_period ON assigned_tasks(period_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_period_user ON evaluations(period_id, user_id);
CREATE INDEX IF NOT EXISTS idx_votes_period_user ON votes(period_id, user_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_id, period_id);
CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(doc_date);
CREATE INDEX IF NOT EXISTS idx_doc_dispatches_user ON document_dispatches(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_doc_dispatches_doc ON document_dispatches(document_id);
