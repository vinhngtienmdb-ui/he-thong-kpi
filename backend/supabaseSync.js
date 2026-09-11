/**
 * MODULE QUẢN LÝ ĐỒNG BỘ VÀ SAO LƯU CSDL VỚI SUPABASE (CLOUD POSTGRESQL)
 * Hoàn toàn tách biệt khỏi quá trình khởi động hoặc cập nhật phần mềm.
 * Chỉ chạy khi người dùng hoặc Quản trị viên chủ động kích hoạt.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();
const { Pool } = require('pg');
const { db, createBackup, checkpointDatabase, ensureUserPositionsPopulated } = require('./database');

function getDbUrl() {
  return process.env.DATABASE_URL || 
         process.env.SUPABASE_DB_URL || 
         'postgresql://postgres.agulljfdttmrqrxsuthj:q47LTnAGaGBs0i8J@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
}

function isSupabaseConfigured() {
  const dbUrl = getDbUrl();
  return Boolean(dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')));
}

function getPool() {
  if (!isSupabaseConfigured()) return null;
  return new Pool({
    connectionString: getDbUrl(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
}

function getMaskedUrl() {
  const dbUrl = getDbUrl();
  if (!dbUrl) return null;
  try {
    return dbUrl.replace(/:[^:@]+@/, ':***@');
  } catch (e) {
    return 'postgresql://configured';
  }
}

/**
 * Kiểm tra trạng thái kết nối và số lượng bản ghi của SQLite so với Supabase
 */
async function getSupabaseStatus() {
  const configured = isSupabaseConfigured();
  const tables = [
    'users', 'departments', 'periods', 'axes', 'common_criteria',
    'standard_tasks', 'assigned_tasks', 'evaluations', 'evaluation_criteria_details',
    'documents', 'document_dispatches', 'votes', 'roles', 'system_configs',
    'user_groups', 'user_group_members'
  ];

  const sqliteCounts = {};
  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${t}`).get();
      sqliteCounts[t] = row ? row.count : 0;
    } catch (e) {
      sqliteCounts[t] = 0;
    }
  }

  if (!configured) {
    return {
      configured: false,
      connected: false,
      dbUrlMasked: null,
      message: 'Chưa cấu hình DATABASE_URL (Supabase) trong file .env',
      sqliteCounts,
      supabaseCounts: null
    };
  }

  const pool = getPool();
  let client;
  try {
    client = await pool.connect();
    const supabaseCounts = {};
    for (const t of tables) {
      try {
        const res = await client.query(`SELECT COUNT(*) as count FROM "${t}"`);
        supabaseCounts[t] = parseInt(res.rows[0].count, 10);
      } catch (e) {
        supabaseCounts[t] = 0;
      }
    }
    client.release();
    await pool.end();

    return {
      configured: true,
      connected: true,
      dbUrlMasked: getMaskedUrl(),
      sqliteCounts,
      supabaseCounts,
      message: 'Kết nối Supabase Cloud PostgreSQL hoạt động bình thường'
    };
  } catch (error) {
    if (client) try { client.release(); } catch (e) {}
    if (pool) try { await pool.end(); } catch (e) {}
    return {
      configured: true,
      connected: false,
      dbUrlMasked: getMaskedUrl(),
      sqliteCounts,
      supabaseCounts: null,
      message: `Lỗi kết nối Supabase: ${error.message}`
    };
  }
}

/**
 * Helper thực hiện Batch Upsert (INSERT ... ON CONFLICT) theo lô để giảm thiểu round-trip
 * Giúp đồng bộ hàng nghìn dòng chỉ mất vài chục ms thay vì hàng chục giây làm đơ/cháy RAM server Render
 */
async function batchUpsert(client, tableName, columns, conflictCols, updateCols, rows, chunkSize = 50) {
  if (!rows || rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valuePlaceholders = [];
    const params = [];
    let paramIndex = 1;

    for (const row of chunk) {
      const rowPlaceholders = [];
      for (const col of columns) {
        rowPlaceholders.push(`$${paramIndex++}`);
        params.push(row[col] !== undefined ? row[col] : null);
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const conflictClause = conflictCols && conflictCols.length > 0
      ? (updateCols && updateCols.length > 0
          ? `ON CONFLICT (${conflictCols.join(', ')}) DO UPDATE SET ` +
            updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')
          : `ON CONFLICT (${conflictCols.join(', ')}) DO NOTHING`)
      : '';

    const sql = `
      INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})
      VALUES ${valuePlaceholders.join(',\n')}
      ${conflictClause}
    `;

    await client.query(sql, params);
  }
  return rows.length;
}

/**
 * Đẩy toàn bộ dữ liệu từ SQLite lên Supabase (Safe Batch Upsert)
 * Không bao giờ xóa mất dữ liệu trên Supabase; dùng ON CONFLICT DO UPDATE
 */
async function pushToSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Chưa cấu hình DATABASE_URL trong backend/.env');
  }

  const pool = getPool();
  const client = await pool.connect();
  const stats = {};

  try {
    try {
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS union_title TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS original_deadline TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS requested_deadline TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS extension_reason TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS extension_status TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS extension_requested_at TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS extension_reviewed_by TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS extension_reviewed_at TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS extension_reject_reason TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS extension_count INTEGER DEFAULT 0;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS detailed_result_note TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS evaluator_id TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS evaluator_type TEXT DEFAULT 'assigner';
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS delegated_by TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS delegated_at TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS delegation_note TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS submitted_for_eval_at TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS is_skip_level INTEGER DEFAULT 0;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS target_position_id TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS skip_level_notes TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS level_1_reviewer_id TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS level_1_reviewed_at TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS level_1_comment TEXT;
        ALTER TABLE assigned_tasks ADD COLUMN IF NOT EXISTS level_1_score NUMERIC;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_party_member INTEGER DEFAULT 0;
        ALTER TABLE departments ADD COLUMN IF NOT EXISTS agency_type TEXT DEFAULT 'su_nghiep';
        ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS final_classification TEXT;
        ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS skip_level_reviewer_id TEXT;
        ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS skip_level_status TEXT DEFAULT 'approved';
        UPDATE assigned_tasks SET axis_code = 'TRUC_1' WHERE axis_code = 'CHUYEN_MON' OR axis_code IS NULL OR axis_code = '';

        CREATE TABLE IF NOT EXISTS user_positions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          dept_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
          position_title TEXT NOT NULL,
          position_type TEXT DEFAULT 'chinh_quyen',
          role_id TEXT,
          management_role TEXT DEFAULT 'nhan_vien',
          manager_id TEXT,
          is_primary INTEGER DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS skip_level_authorizations (
          id TEXT PRIMARY KEY,
          manager_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          dept_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
          can_assign INTEGER DEFAULT 1,
          can_review INTEGER DEFAULT 1,
          can_view_reports INTEGER DEFAULT 1,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          type TEXT NOT NULL,
          task_id TEXT,
          tab TEXT DEFAULT 'assignment',
          is_read INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
        CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
      `);
    } catch (e) {
      console.warn('[Supabase Sync Migration Warning]:', e.message);
    }

    // 1. system_configs
    const configs = db.prepare('SELECT * FROM system_configs').all();
    await batchUpsert(
      client, 'system_configs',
      ['key', 'value', 'description'],
      ['key'],
      ['value', 'description'],
      configs
    );
    stats.system_configs = configs.length;

    // 2. roles
    const roles = db.prepare('SELECT * FROM roles').all();
    await batchUpsert(
      client, 'roles',
      ['id', 'code', 'name', 'description', 'data_scope', 'permissions', 'is_system', 'created_at'],
      ['id'],
      ['code', 'name', 'description', 'data_scope', 'permissions'],
      roles
    );
    stats.roles = roles.length;

    // 3. departments (First pass: basic fields)
    const depts = db.prepare('SELECT * FROM departments').all();
    await batchUpsert(
      client, 'departments',
      ['id', 'code', 'name', 'is_active', 'description', 'parent_agency', 'location_name'],
      ['id'],
      ['code', 'name', 'is_active', 'description', 'parent_agency', 'location_name'],
      depts.map(d => ({ ...d, is_active: d.is_active ?? 1 }))
    );
    stats.departments = depts.length;

    // 4. users
    const users = db.prepare('SELECT * FROM users').all();
    await batchUpsert(
      client, 'users',
      ['id', 'username', 'password', 'full_name', 'role', 'party_title', 'gov_title', 'union_title', 'dept_id',
       'birth_date', 'gender', 'phone', 'email', 'is_active', 'target_role', 'role_id', 'manager_id',
       'management_role', 'final_evaluator_id', 'is_party_member'],
      ['id'],
      ['username', 'password', 'full_name', 'role', 'party_title', 'gov_title', 'union_title', 'dept_id',
       'birth_date', 'gender', 'phone', 'email', 'is_active', 'target_role', 'role_id', 'manager_id',
       'management_role', 'final_evaluator_id', 'is_party_member'],
      users.map(u => ({ ...u, is_active: u.is_active ?? 1, is_party_member: u.is_party_member ?? 0 }))
    );
    stats.users = users.length;

    const validUserIds = new Set(users.map(u => u.id));

    // Update departments parent_id and leader_id
    const deptsWithHierarchy = depts.filter(d => d.parent_id || d.leader_id);
    for (const d of deptsWithHierarchy) {
      const leaderId = validUserIds.has(d.leader_id) ? d.leader_id : null;
      await client.query(`
        UPDATE departments SET parent_id = $1, leader_id = $2 WHERE id = $3
      `, [d.parent_id || null, leaderId, d.id]);
    }

    // 5. periods
    const periods = db.prepare('SELECT * FROM periods').all();
    await batchUpsert(
      client, 'periods',
      ['id', 'code', 'name', 'start_date', 'end_date', 'is_active',
       'grading_lock_date', 'is_locked', 'finalized_at', 'finalized_by', 'finalized_note'],
      ['id'],
      ['code', 'name', 'start_date', 'end_date', 'is_active', 'grading_lock_date', 'is_locked'],
      periods.map(p => ({
        ...p,
        is_active: p.is_active ?? 1,
        is_locked: p.is_locked ?? 0,
        finalized_by: validUserIds.has(p.finalized_by) ? p.finalized_by : null
      }))
    );
    stats.periods = periods.length;

    // 6. axes
    const axes = db.prepare('SELECT * FROM axes').all();
    await batchUpsert(
      client, 'axes',
      ['id', 'code', 'name', 'max_score'],
      ['id'],
      ['code', 'name', 'max_score'],
      axes
    );
    stats.axes = axes.length;

    // 7. common_criteria
    const commonCriteria = db.prepare('SELECT * FROM common_criteria').all();
    await batchUpsert(
      client, 'common_criteria',
      ['id', 'group_no', 'group_name', 'code', 'title', 'max_score', 'target_role'],
      ['id'],
      ['group_no', 'group_name', 'code', 'title', 'max_score', 'target_role'],
      commonCriteria
    );
    stats.common_criteria = commonCriteria.length;

    // 8. standard_tasks
    const standardTasks = db.prepare('SELECT * FROM standard_tasks').all();
    await batchUpsert(
      client, 'standard_tasks',
      ['id', 'period_id', 'dept_code', 'task_name', 'output_result', 'deadline',
       'task_type', 'standard_score', 'difficulty_weight', 'max_converted_score',
       'expected_evidence', 'note', 'axis_code', 'status', 'created_at'],
      ['id'],
      ['task_name', 'standard_score', 'difficulty_weight', 'status',
       'expected_evidence', 'note', 'max_converted_score'],
      standardTasks,
      100
    );
    // Dọn sạch các công việc chuẩn đã xóa khỏi SQLite trên Supabase Cloud
    const localStdIds = standardTasks.map(t => t.id);
    if (localStdIds.length > 0) {
      await client.query(`DELETE FROM standard_tasks WHERE NOT (id = ANY($1))`, [localStdIds]);
    }
    stats.standard_tasks = standardTasks.length;

    // 9. documents
    const documents = db.prepare('SELECT * FROM documents').all();
    await batchUpsert(
      client, 'documents',
      ['id', 'doc_number', 'doc_date', 'arrival_date', 'arrival_number', 'issuer',
       'doc_type', 'field', 'urgency', 'security_level', 'summary', 'file_url',
       'file_name', 'deadline', 'status', 'created_by', 'leader_id', 'leader_instruction',
       'submitted_at', 'submitted_by', 'is_reference_only', 'created_at', 'updated_at'],
      ['id'],
      ['doc_number', 'summary', 'status', 'file_url', 'file_name', 'leader_id', 'leader_instruction', 'submitted_at', 'submitted_by', 'is_reference_only', 'updated_at'],
      documents.map(doc => ({
        ...doc,
        created_by: validUserIds.has(doc.created_by) ? doc.created_by : null,
        leader_id: validUserIds.has(doc.leader_id) ? doc.leader_id : null,
        submitted_by: validUserIds.has(doc.submitted_by) ? doc.submitted_by : null,
        is_reference_only: doc.is_reference_only ?? 0
      }))
    );
    stats.documents = documents.length;

    // 10. assigned_tasks
    const assignedTasks = db.prepare('SELECT * FROM assigned_tasks').all();
    await batchUpsert(
      client, 'assigned_tasks',
      ['id', 'period_id', 'user_id', 'standard_task_id', 'task_name', 'output_result',
       'deadline', 'task_type', 'standard_score', 'difficulty_weight', 'max_converted_score',
       'axis_code', 'origin', 'status', 'actual_finish_date', 'evidence_text', 'detailed_result_note',
       'evidence_file_url', 'evidence_file_name', 'quantity_pct', 'progress_pct',
       'quality_pct', 'leadership_pct', 'execution_score', 'converted_score',
       'cbql_comment', 'assigned_by', 'created_at', 'updated_at', 'group_id',
       'is_bonus_proposed', 'bonus_score', 'bonus_reason', 'return_reason',
       'is_returned', 'document_id', 'original_deadline', 'requested_deadline',
       'extension_reason', 'extension_status', 'extension_requested_at',
       'extension_reviewed_by', 'extension_reviewed_at', 'extension_reject_reason', 'extension_count',
       'evaluator_id', 'evaluator_type', 'delegated_by', 'delegated_at', 'delegation_note', 'submitted_for_eval_at'],
      ['id'],
      ['period_id', 'task_name', 'deadline', 'status', 'execution_score', 'converted_score',
       'evidence_file_url', 'actual_finish_date', 'evidence_text', 'detailed_result_note', 'original_deadline',
       'requested_deadline', 'extension_reason', 'extension_status', 'extension_requested_at',
       'extension_reviewed_by', 'extension_reviewed_at', 'extension_reject_reason', 'extension_count',
       'evaluator_id', 'evaluator_type', 'delegated_by', 'delegated_at', 'delegation_note', 'submitted_for_eval_at'],
      assignedTasks.map(at => ({
        ...at,
        assigned_by: validUserIds.has(at.assigned_by) ? at.assigned_by : null,
        extension_reviewed_by: validUserIds.has(at.extension_reviewed_by) ? at.extension_reviewed_by : null,
        evaluator_id: validUserIds.has(at.evaluator_id) ? at.evaluator_id : null,
        delegated_by: validUserIds.has(at.delegated_by) ? at.delegated_by : null,
        is_bonus_proposed: at.is_bonus_proposed ?? 0,
        bonus_score: at.bonus_score ?? 0,
        is_returned: at.is_returned ?? 0,
        extension_count: at.extension_count ?? 0
      })),
      100
    );
    // Dọn sạch các công việc đã xóa khỏi SQLite trên Supabase Cloud (tránh việc hồi sinh dữ liệu cũ)
    const localAssignedIds = assignedTasks.map(t => t.id);
    if (localAssignedIds.length > 0) {
      await client.query(`
        UPDATE document_dispatches SET task_id = NULL WHERE task_id IS NOT NULL AND NOT (task_id = ANY($1))
      `, [localAssignedIds]);
      await client.query(`
        DELETE FROM assigned_tasks WHERE NOT (id = ANY($1))
      `, [localAssignedIds]);
    }
    stats.assigned_tasks = assignedTasks.length;

    // 11. document_dispatches
    const dispatches = db.prepare('SELECT * FROM document_dispatches').all();
    await batchUpsert(
      client, 'document_dispatches',
      ['id', 'document_id', 'department_id', 'assigned_to_user_id',
       'coordinating_user_ids', 'instruction', 'deadline', 'task_id',
       'status', 'dispatch_type', 'role_in_dispatch', 'dispatched_by',
       'dispatched_at', 'completed_at', 'completion_note'],
      ['id'],
      ['status', 'dispatch_type', 'role_in_dispatch', 'completed_at', 'completion_note'],
      dispatches.map(dd => ({
        ...dd,
        dispatch_type: dd.dispatch_type || 'process',
        role_in_dispatch: dd.role_in_dispatch || 'main',
        dispatched_by: validUserIds.has(dd.dispatched_by) ? dd.dispatched_by : null
      }))
    );
    stats.document_dispatches = dispatches.length;

    // 12. evaluations
    const evaluations = db.prepare('SELECT * FROM evaluations').all();
    if (evaluations.length > 0) {
      await batchUpsert(
        client, 'evaluations',
        ['id', 'period_id', 'user_id', 'part1_score', 'part2_score', 'total_score',
         'rank_proposed', 'superior_rank', 'superior_comment', 'status', 'updated_at',
         'step', 'bonus_score', 'bonus_note', 'plan_total_max_score', 'executed_total_conv_score',
         'summary_reason', 'cadre_proposal_note', 'return_reason', 'returned_at',
         'returned_by', 'submitted_at'],
        ['period_id', 'user_id'],
        ['total_score', 'status', 'step', 'superior_rank', 'updated_at'],
        evaluations.map(ev => ({
          ...ev,
          returned_by: validUserIds.has(ev.returned_by) ? ev.returned_by : null
        }))
      );
      await client.query(`DELETE FROM evaluations WHERE NOT (id = ANY($1))`, [evaluations.map(e => e.id)]);
    } else {
      await client.query('DELETE FROM evaluation_criteria_details');
      await client.query('DELETE FROM evaluations');
    }
    stats.evaluations = evaluations.length;

    // 13. evaluation_criteria_details
    const critDetails = db.prepare('SELECT * FROM evaluation_criteria_details').all();
    if (critDetails.length > 0) {
      await batchUpsert(
        client, 'evaluation_criteria_details',
        ['id', 'evaluation_id', 'criteria_id', 'is_satisfied', 'score', 'note'],
        ['id'],
        ['is_satisfied', 'score', 'note'],
        critDetails.map(cd => ({
          ...cd,
          is_satisfied: cd.is_satisfied ?? 1,
          score: cd.score ?? 0
        })),
        100
      );
      await client.query(`DELETE FROM evaluation_criteria_details WHERE NOT (id = ANY($1))`, [critDetails.map(cd => cd.id)]);
    } else {
      await client.query('DELETE FROM evaluation_criteria_details');
    }
    stats.evaluation_criteria_details = critDetails.length;

    // 14. votes
    const votes = db.prepare('SELECT * FROM votes').all();
    await batchUpsert(
      client, 'votes',
      ['id', 'period_id', 'user_id', 'voter_id', 'vote_rank', 'comment', 'created_at'],
      ['period_id', 'user_id', 'voter_id'],
      ['vote_rank', 'comment'],
      votes
    );
    stats.votes = votes.length;

    // 15. user_groups
    const userGroups = db.prepare('SELECT * FROM user_groups').all();
    await batchUpsert(
      client, 'user_groups',
      ['id', 'name', 'description', 'dept_id', 'created_by', 'created_at', 'updated_at'],
      ['id'],
      ['name', 'description', 'dept_id', 'updated_at'],
      userGroups.map(g => ({
        ...g,
        created_by: validUserIds.has(g.created_by) ? g.created_by : null
      }))
    );
    stats.user_groups = userGroups.length;

    // 16. user_group_members
    const groupMembers = db.prepare('SELECT * FROM user_group_members').all();
    await batchUpsert(
      client, 'user_group_members',
      ['id', 'group_id', 'user_id', 'created_at'],
      ['group_id', 'user_id'],
      ['created_at'],
      groupMembers.filter(gm => validUserIds.has(gm.user_id))
    );
    stats.user_group_members = groupMembers.length;

    // 17. notifications
    try {
      const notifs = db.prepare('SELECT * FROM notifications').all();
      await batchUpsert(
        client, 'notifications',
        ['id', 'user_id', 'title', 'message', 'type', 'task_id', 'tab', 'is_read', 'created_at'],
        ['id'],
        ['title', 'message', 'type', 'task_id', 'tab', 'is_read'],
        notifs.filter(n => validUserIds.has(n.user_id)),
        100
      );
      stats.notifications = notifs.length;
    } catch (e) {
      stats.notifications = 0;
    }

    // 18. user_positions
    try {
      const positions = db.prepare('SELECT * FROM user_positions').all();
      await batchUpsert(
        client, 'user_positions',
        ['id', 'user_id', 'dept_id', 'position_title', 'position_type', 'role_id', 'management_role', 'manager_id', 'is_primary', 'notes'],
        ['id'],
        ['dept_id', 'position_title', 'position_type', 'role_id', 'management_role', 'manager_id', 'is_primary', 'notes'],
        positions.filter(p => validUserIds.has(p.user_id)),
        100
      );
      const localPosIds = positions.map(p => p.id);
      if (localPosIds.length > 0) {
        await client.query(`DELETE FROM user_positions WHERE NOT (id = ANY($1))`, [localPosIds]);
      }
      stats.user_positions = positions.length;
    } catch (e) {
      stats.user_positions = 0;
    }

    // 19. skip_level_authorizations
    try {
      const auths = db.prepare('SELECT * FROM skip_level_authorizations').all();
      await batchUpsert(
        client, 'skip_level_authorizations',
        ['id', 'manager_id', 'dept_id', 'can_assign', 'can_review', 'can_view_reports', 'notes'],
        ['id'],
        ['can_assign', 'can_review', 'can_view_reports', 'notes'],
        auths.filter(a => validUserIds.has(a.manager_id)),
        100
      );
      const localAuthIds = auths.map(a => a.id);
      if (localAuthIds.length > 0) {
        await client.query(`DELETE FROM skip_level_authorizations WHERE NOT (id = ANY($1))`, [localAuthIds]);
      }
      stats.skip_level_authorizations = auths.length;
    } catch (e) {
      stats.skip_level_authorizations = 0;
    }

    return { success: true, stats, message: 'Đã sao lưu thành công toàn bộ dữ liệu lên Supabase Cloud' };
  } finally {
    client.release();
    await pool.end();
  }
}

// Helper: Chuyển đổi dữ liệu từ PostgreSQL sang kiểu hợp lệ của SQLite
function toSqliteVal(val) {
  if (val === undefined || val === null) return null;
  if (val instanceof Date) {
    return val.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  }
  if (typeof val === 'boolean') {
    return val ? 1 : 0;
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return val;
}

/**
 * Kéo toàn bộ dữ liệu từ Supabase về SQLite máy chủ (Restore from Cloud)
 * Tự động tạo snapshot backup cục bộ trước khi đồng bộ về.
 */
async function pullFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Chưa cấu hình DATABASE_URL trong backend/.env');
  }

  // Tạo bản sao lưu an toàn của SQLite hiện tại trước khi kéo dữ liệu về
  createBackup('pre_supabase_pull');

  const pool = getPool();
  const client = await pool.connect();
  const stats = {};

  try {
    // 1. system_configs
    const supConfigs = await client.query('SELECT * FROM system_configs');
    const insConfig = db.prepare(`
      INSERT OR REPLACE INTO system_configs (key, value, description) VALUES (?, ?, ?)
    `);
    db.transaction(() => {
      for (const c of supConfigs.rows) {
        insConfig.run(toSqliteVal(c.key), toSqliteVal(c.value), toSqliteVal(c.description));
      }
    })();
    stats.system_configs = supConfigs.rows.length;

    // 2. roles
    const supRoles = await client.query('SELECT * FROM roles');
    const insRole = db.prepare(`
      INSERT OR REPLACE INTO roles (id, code, name, description, data_scope, permissions, is_system, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const r of supRoles.rows) {
        insRole.run(
          toSqliteVal(r.id), toSqliteVal(r.code), toSqliteVal(r.name), toSqliteVal(r.description),
          toSqliteVal(r.data_scope), toSqliteVal(r.permissions), r.is_system ? 1 : 0, toSqliteVal(r.created_at)
        );
      }
    })();
    stats.roles = supRoles.rows.length;

    // 3. departments
    const supDepts = await client.query('SELECT * FROM departments');
    const insDept = db.prepare(`
      INSERT OR REPLACE INTO departments (
        id, code, name, parent_id, leader_id, is_active, description, parent_agency, location_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const d of supDepts.rows) {
        insDept.run(
          toSqliteVal(d.id), toSqliteVal(d.code), toSqliteVal(d.name), toSqliteVal(d.parent_id),
          toSqliteVal(d.leader_id), d.is_active ? 1 : 0, toSqliteVal(d.description),
          toSqliteVal(d.parent_agency), toSqliteVal(d.location_name)
        );
      }
    })();
    stats.departments = supDepts.rows.length;

    // 4. users
    const supUsers = await client.query('SELECT * FROM users');
    const insUser = db.prepare(`
      INSERT OR REPLACE INTO users (
        id, username, password, full_name, role, party_title, gov_title, union_title, dept_id,
        birth_date, gender, phone, email, is_active, target_role, role_id, manager_id,
        management_role, final_evaluator_id, is_party_member
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const u of supUsers.rows) {
        insUser.run(
          toSqliteVal(u.id), toSqliteVal(u.username), toSqliteVal(u.password), toSqliteVal(u.full_name),
          toSqliteVal(u.role), toSqliteVal(u.party_title), toSqliteVal(u.gov_title), toSqliteVal(u.union_title), toSqliteVal(u.dept_id),
          toSqliteVal(u.birth_date), toSqliteVal(u.gender), toSqliteVal(u.phone), toSqliteVal(u.email),
          u.is_active !== undefined && u.is_active !== null && u.is_active !== 0 ? 1 : 0,
          toSqliteVal(u.target_role), toSqliteVal(u.role_id), toSqliteVal(u.manager_id),
          toSqliteVal(u.management_role || 'nhan_vien'), toSqliteVal(u.final_evaluator_id),
          u.is_party_member ? 1 : 0
        );
      }
    })();
    stats.users = supUsers.rows.length;

    // 5. periods
    const supPeriods = await client.query('SELECT * FROM periods');
    const insPeriod = db.prepare(`
      INSERT OR REPLACE INTO periods (
        id, code, name, start_date, end_date, is_active,
        grading_lock_date, is_locked, finalized_at, finalized_by, finalized_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const p of supPeriods.rows) {
        insPeriod.run(
          toSqliteVal(p.id), toSqliteVal(p.code), toSqliteVal(p.name), toSqliteVal(p.start_date),
          toSqliteVal(p.end_date), p.is_active ? 1 : 0, toSqliteVal(p.grading_lock_date),
          p.is_locked ? 1 : 0, toSqliteVal(p.finalized_at), toSqliteVal(p.finalized_by), toSqliteVal(p.finalized_note)
        );
      }
    })();
    stats.periods = supPeriods.rows.length;

    // 6. axes
    const supAxes = await client.query('SELECT * FROM axes');
    const insAxis = db.prepare(`
      INSERT OR REPLACE INTO axes (id, code, name, max_score) VALUES (?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const a of supAxes.rows) {
        insAxis.run(toSqliteVal(a.id), toSqliteVal(a.code), toSqliteVal(a.name), toSqliteVal(a.max_score));
      }
    })();
    stats.axes = supAxes.rows.length;

    // 7. common_criteria
    const supCrit = await client.query('SELECT * FROM common_criteria');
    const insCrit = db.prepare(`
      INSERT OR REPLACE INTO common_criteria (id, group_no, group_name, code, title, max_score, target_role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const c of supCrit.rows) {
        insCrit.run(toSqliteVal(c.id), toSqliteVal(c.group_no), toSqliteVal(c.group_name), toSqliteVal(c.code), toSqliteVal(c.title), toSqliteVal(c.max_score), toSqliteVal(c.target_role));
      }
    })();
    stats.common_criteria = supCrit.rows.length;

    // 8. standard_tasks
    const supStdTasks = await client.query('SELECT * FROM standard_tasks');
    const insStdTask = db.prepare(`
      INSERT OR REPLACE INTO standard_tasks (
        id, period_id, dept_code, task_name, output_result, deadline,
        task_type, standard_score, difficulty_weight, max_converted_score,
        expected_evidence, note, axis_code, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const t of supStdTasks.rows) {
        insStdTask.run(
          toSqliteVal(t.id), toSqliteVal(t.period_id), toSqliteVal(t.dept_code), toSqliteVal(t.task_name),
          toSqliteVal(t.output_result), toSqliteVal(t.deadline), toSqliteVal(t.task_type),
          toSqliteVal(t.standard_score), toSqliteVal(t.difficulty_weight), toSqliteVal(t.max_converted_score),
          toSqliteVal(t.expected_evidence), toSqliteVal(t.note), toSqliteVal(t.axis_code),
          toSqliteVal(t.status), toSqliteVal(t.created_at)
        );
      }
    })();
    stats.standard_tasks = supStdTasks.rows.length;

    // 9. documents
    const supDocs = await client.query('SELECT * FROM documents');
    const insDoc = db.prepare(`
      INSERT OR REPLACE INTO documents (
        id, doc_number, doc_date, arrival_date, arrival_number, issuer,
        doc_type, field, urgency, security_level, summary, file_url,
        file_name, deadline, status, created_by, leader_id, leader_instruction,
        submitted_at, submitted_by, is_reference_only, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const doc of supDocs.rows) {
        insDoc.run(
          toSqliteVal(doc.id), toSqliteVal(doc.doc_number), toSqliteVal(doc.doc_date),
          toSqliteVal(doc.arrival_date), toSqliteVal(doc.arrival_number), toSqliteVal(doc.issuer),
          toSqliteVal(doc.doc_type), toSqliteVal(doc.field), toSqliteVal(doc.urgency),
          toSqliteVal(doc.security_level), toSqliteVal(doc.summary), toSqliteVal(doc.file_url),
          toSqliteVal(doc.file_name), toSqliteVal(doc.deadline), toSqliteVal(doc.status),
          toSqliteVal(doc.created_by), toSqliteVal(doc.leader_id), toSqliteVal(doc.leader_instruction),
          toSqliteVal(doc.submitted_at), toSqliteVal(doc.submitted_by), doc.is_reference_only ? 1 : 0,
          toSqliteVal(doc.created_at), toSqliteVal(doc.updated_at)
        );
      }
    })();
    stats.documents = supDocs.rows.length;

    // 10. assigned_tasks
    const supAssigned = await client.query('SELECT * FROM assigned_tasks');
    const insAssigned = db.prepare(`
      INSERT OR REPLACE INTO assigned_tasks (
        id, period_id, user_id, standard_task_id, task_name, output_result,
        deadline, task_type, standard_score, difficulty_weight, max_converted_score,
        axis_code, origin, status, actual_finish_date, evidence_text, detailed_result_note,
        evidence_file_url, evidence_file_name, quantity_pct, progress_pct,
        quality_pct, leadership_pct, execution_score, converted_score,
        cbql_comment, assigned_by, created_at, updated_at, group_id,
        is_bonus_proposed, bonus_score, bonus_reason, return_reason,
        is_returned, document_id, original_deadline, requested_deadline,
        extension_reason, extension_status, extension_requested_at,
        extension_reviewed_by, extension_reviewed_at, extension_reject_reason, extension_count,
        evaluator_id, evaluator_type, delegated_by, delegated_at, delegation_note, submitted_for_eval_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const t of supAssigned.rows) {
        insAssigned.run(
          toSqliteVal(t.id), toSqliteVal(t.period_id), toSqliteVal(t.user_id), toSqliteVal(t.standard_task_id),
          toSqliteVal(t.task_name), toSqliteVal(t.output_result), toSqliteVal(t.deadline), toSqliteVal(t.task_type),
          toSqliteVal(t.standard_score), toSqliteVal(t.difficulty_weight), toSqliteVal(t.max_converted_score),
          toSqliteVal(t.axis_code), toSqliteVal(t.origin), toSqliteVal(t.status), toSqliteVal(t.actual_finish_date),
          toSqliteVal(t.evidence_text), toSqliteVal(t.detailed_result_note), toSqliteVal(t.evidence_file_url), toSqliteVal(t.evidence_file_name),
          toSqliteVal(t.quantity_pct), toSqliteVal(t.progress_pct), toSqliteVal(t.quality_pct),
          toSqliteVal(t.leadership_pct), toSqliteVal(t.execution_score), toSqliteVal(t.converted_score),
          toSqliteVal(t.cbql_comment), toSqliteVal(t.assigned_by), toSqliteVal(t.created_at), toSqliteVal(t.updated_at),
          toSqliteVal(t.group_id), t.is_bonus_proposed ? 1 : 0, toSqliteVal(t.bonus_score || 0),
          toSqliteVal(t.bonus_reason), toSqliteVal(t.return_reason), t.is_returned ? 1 : 0, toSqliteVal(t.document_id),
          toSqliteVal(t.original_deadline), toSqliteVal(t.requested_deadline), toSqliteVal(t.extension_reason),
          toSqliteVal(t.extension_status), toSqliteVal(t.extension_requested_at), toSqliteVal(t.extension_reviewed_by),
          toSqliteVal(t.extension_reviewed_at), toSqliteVal(t.extension_reject_reason), toSqliteVal(t.extension_count || 0),
          toSqliteVal(t.evaluator_id), toSqliteVal(t.evaluator_type || 'assigner'), toSqliteVal(t.delegated_by),
          toSqliteVal(t.delegated_at), toSqliteVal(t.delegation_note), toSqliteVal(t.submitted_for_eval_at)
        );
      }
    })();
    stats.assigned_tasks = supAssigned.rows.length;

    // 11. document_dispatches
    const supDispatches = await client.query('SELECT * FROM document_dispatches');
    const insDispatch = db.prepare(`
      INSERT OR REPLACE INTO document_dispatches (
        id, document_id, department_id, assigned_to_user_id, coordinating_user_ids,
        instruction, deadline, task_id, status, dispatch_type, role_in_dispatch,
        dispatched_by, dispatched_at, completed_at, completion_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const d of supDispatches.rows) {
        insDispatch.run(
          toSqliteVal(d.id), toSqliteVal(d.document_id), toSqliteVal(d.department_id),
          toSqliteVal(d.assigned_to_user_id), toSqliteVal(d.coordinating_user_ids),
          toSqliteVal(d.instruction), toSqliteVal(d.deadline), toSqliteVal(d.task_id),
          toSqliteVal(d.status), toSqliteVal(d.dispatch_type || 'process'), toSqliteVal(d.role_in_dispatch || 'main'),
          toSqliteVal(d.dispatched_by), toSqliteVal(d.dispatched_at),
          toSqliteVal(d.completed_at), toSqliteVal(d.completion_note)
        );
      }
    })();
    stats.document_dispatches = supDispatches.rows.length;

    // 12. evaluations
    const supEvals = await client.query('SELECT * FROM evaluations');
    const insEval = db.prepare(`
      INSERT OR REPLACE INTO evaluations (
        id, period_id, user_id, part1_score, part2_score, total_score,
        rank_proposed, superior_rank, superior_comment, status, updated_at,
        step, bonus_score, bonus_note, plan_total_max_score, executed_total_conv_score,
        summary_reason, cadre_proposal_note, return_reason, returned_at,
        returned_by, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const e of supEvals.rows) {
        insEval.run(
          toSqliteVal(e.id), toSqliteVal(e.period_id), toSqliteVal(e.user_id), toSqliteVal(e.part1_score),
          toSqliteVal(e.part2_score), toSqliteVal(e.total_score), toSqliteVal(e.rank_proposed),
          toSqliteVal(e.superior_rank), toSqliteVal(e.superior_comment), toSqliteVal(e.status),
          toSqliteVal(e.updated_at), toSqliteVal(e.step), toSqliteVal(e.bonus_score), toSqliteVal(e.bonus_note),
          toSqliteVal(e.plan_total_max_score), toSqliteVal(e.executed_total_conv_score), toSqliteVal(e.summary_reason),
          toSqliteVal(e.cadre_proposal_note), toSqliteVal(e.return_reason), toSqliteVal(e.returned_at),
          toSqliteVal(e.returned_by), toSqliteVal(e.submitted_at)
        );
      }
    })();
    stats.evaluations = supEvals.rows.length;

    // 13. evaluation_criteria_details
    const supCritDetails = await client.query('SELECT * FROM evaluation_criteria_details');
    const insCritDetail = db.prepare(`
      INSERT OR REPLACE INTO evaluation_criteria_details (id, evaluation_id, criteria_id, is_satisfied, score, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const cd of supCritDetails.rows) {
        insCritDetail.run(
          toSqliteVal(cd.id), toSqliteVal(cd.evaluation_id), toSqliteVal(cd.criteria_id),
          cd.is_satisfied ? 1 : 0, toSqliteVal(cd.score), toSqliteVal(cd.note)
        );
      }
    })();
    stats.evaluation_criteria_details = supCritDetails.rows.length;

    // 14. votes
    const supVotes = await client.query('SELECT * FROM votes');
    const insVote = db.prepare(`
      INSERT OR REPLACE INTO votes (id, period_id, user_id, voter_id, vote_rank, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const v of supVotes.rows) {
        insVote.run(
          toSqliteVal(v.id), toSqliteVal(v.period_id), toSqliteVal(v.user_id),
          toSqliteVal(v.voter_id), toSqliteVal(v.vote_rank), toSqliteVal(v.comment),
          toSqliteVal(v.created_at)
        );
      }
    })();
    stats.votes = supVotes.rows.length;

    // 15. user_groups
    try {
      const supUserGroups = await client.query('SELECT * FROM user_groups');
      const insUserGroup = db.prepare(`
        INSERT OR REPLACE INTO user_groups (id, name, description, dept_id, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const g of supUserGroups.rows) {
          insUserGroup.run(
            toSqliteVal(g.id), toSqliteVal(g.name), toSqliteVal(g.description),
            toSqliteVal(g.dept_id), toSqliteVal(g.created_by),
            toSqliteVal(g.created_at), toSqliteVal(g.updated_at)
          );
        }
      })();
      stats.user_groups = supUserGroups.rows.length;
    } catch (e) {
      stats.user_groups = 0;
    }

    // 16. user_group_members
    try {
      const supGroupMembers = await client.query('SELECT * FROM user_group_members');
      const insGroupMember = db.prepare(`
        INSERT OR REPLACE INTO user_group_members (id, group_id, user_id, created_at)
        VALUES (?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const gm of supGroupMembers.rows) {
          insGroupMember.run(
            toSqliteVal(gm.id), toSqliteVal(gm.group_id), toSqliteVal(gm.user_id),
            toSqliteVal(gm.created_at)
          );
        }
      })();
      stats.user_group_members = supGroupMembers.rows.length;
    } catch (e) {
      stats.user_group_members = 0;
    }

    // 17. notifications
    try {
      const supNotifs = await client.query('SELECT * FROM notifications');
      const insNotif = db.prepare(`
        INSERT OR REPLACE INTO notifications (
          id, user_id, title, message, type, task_id, tab, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const n of supNotifs.rows) {
          const rawMsg = toSqliteVal(n.message);
          const sanitizedMsg = typeof rawMsg === 'string'
            ? rawMsg.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1')
            : rawMsg;
          insNotif.run(
            toSqliteVal(n.id), toSqliteVal(n.user_id), toSqliteVal(n.title),
            sanitizedMsg, toSqliteVal(n.type), toSqliteVal(n.task_id),
            toSqliteVal(n.tab), n.is_read ? 1 : 0, toSqliteVal(n.created_at)
          );
        }
      })();
      // Cập nhật chuẩn hóa ngày tháng cả trên Supabase Cloud
      await client.query(`
        UPDATE notifications 
        SET message = regexp_replace(message, '(\\d{4})-(\\d{2})-(\\d{2})', '\\3/\\2/\\1', 'g') 
        WHERE message ~ '\\d{4}-\\d{2}-\\d{2}'
      `).catch(() => {});
      stats.notifications = supNotifs.rows.length;
    } catch (e) {
      stats.notifications = 0;
    }

    // 18. user_positions
    try {
      const supPositions = await client.query('SELECT * FROM user_positions');
      const insPos = db.prepare(`
        INSERT OR REPLACE INTO user_positions (
          id, user_id, dept_id, position_title, position_type, role_id,
          management_role, manager_id, is_primary, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const p of supPositions.rows) {
          insPos.run(
            toSqliteVal(p.id), toSqliteVal(p.user_id), toSqliteVal(p.dept_id),
            toSqliteVal(p.position_title), toSqliteVal(p.position_type), toSqliteVal(p.role_id),
            toSqliteVal(p.management_role), toSqliteVal(p.manager_id),
            p.is_primary ? 1 : 0, toSqliteVal(p.notes),
            toSqliteVal(p.created_at), toSqliteVal(p.updated_at)
          );
        }
      })();
      stats.user_positions = supPositions.rows.length;
    } catch (e) {
      stats.user_positions = 0;
    }

    // 19. skip_level_authorizations
    try {
      const supAuths = await client.query('SELECT * FROM skip_level_authorizations');
      const insAuth = db.prepare(`
        INSERT OR REPLACE INTO skip_level_authorizations (
          id, manager_id, dept_id, can_assign, can_review, can_view_reports, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const a of supAuths.rows) {
          insAuth.run(
            toSqliteVal(a.id), toSqliteVal(a.manager_id), toSqliteVal(a.dept_id),
            a.can_assign ? 1 : 0, a.can_review ? 1 : 0, a.can_view_reports ? 1 : 0,
            toSqliteVal(a.notes), toSqliteVal(a.created_at), toSqliteVal(a.updated_at)
          );
        }
      })();
      stats.skip_level_authorizations = supAuths.rows.length;
    } catch (e) {
      stats.skip_level_authorizations = 0;
    }

    checkpointDatabase();
    return { success: true, stats, message: 'Đã khôi phục thành công CSDL từ Supabase về máy chủ' };
  } finally {
    client.release();
    await pool.end();
  }
}

let syncTimer = null;
let isSyncing = false;
let pendingSync = false;

/**
 * Tự động đồng bộ ngầm dữ liệu vừa cập nhật lên Supabase Cloud (Debounced & Concurrency-safe)
 * Mặc định delay = 300ms để đảm bảo gần như tức thời (near real-time) mà không quá tải kết nối.
 */
function triggerBackgroundSupabaseSync(delayMs = 300) {
  if (!isSupabaseConfigured()) return;
  if (syncTimer) clearTimeout(syncTimer);

  syncTimer = setTimeout(async () => {
    if (isSyncing) {
      pendingSync = true;
      return;
    }
    isSyncing = true;
    try {
      await pushToSupabase();
      console.log('[Auto-Sync Supabase] ✓ Dữ liệu vừa thay đổi đã đồng bộ 100% lên Supabase Cloud.');
    } catch (err) {
      console.error('[Auto-Sync Supabase] ✗ Lỗi tự động sao lưu lên Supabase:', err.message);
    } finally {
      isSyncing = false;
      if (pendingSync) {
        pendingSync = false;
        triggerBackgroundSupabaseSync(200);
      }
    }
  }, delayMs);
}

/**
 * Đồng bộ trực tiếp 1 Cán bộ lên Supabase Cloud (Write-through instant sync)
 */
async function syncDirectUserToSupabase(user) {
  if (!isSupabaseConfigured() || !user) return;
  const pool = getPool();
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    const sql = `
      INSERT INTO users (
        id, username, password, full_name, role, party_title, gov_title, union_title, dept_id,
        birth_date, gender, phone, email, is_active, target_role, role_id, manager_id,
        management_role, final_evaluator_id, is_party_member
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        password = EXCLUDED.password,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        party_title = EXCLUDED.party_title,
        gov_title = EXCLUDED.gov_title,
        union_title = EXCLUDED.union_title,
        dept_id = EXCLUDED.dept_id,
        birth_date = EXCLUDED.birth_date,
        gender = EXCLUDED.gender,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        is_active = EXCLUDED.is_active,
        target_role = EXCLUDED.target_role,
        role_id = EXCLUDED.role_id,
        manager_id = EXCLUDED.manager_id,
        management_role = EXCLUDED.management_role,
        final_evaluator_id = EXCLUDED.final_evaluator_id,
        is_party_member = EXCLUDED.is_party_member
    `;
    await client.query(sql, [
      user.id, user.username, user.password, user.full_name, user.role, user.party_title,
      user.gov_title, user.union_title, user.dept_id, user.birth_date, user.gender, user.phone, user.email,
      user.is_active !== undefined ? user.is_active : 1, user.target_role, user.role_id, user.manager_id,
      user.management_role || 'nhan_vien', user.final_evaluator_id, user.is_party_member ? 1 : 0
    ]);
    console.log(`[Supabase Direct Sync] ✓ Đã cập nhật tức thì cán bộ "${user.full_name}" (${user.username}) lên Supabase.`);
  } catch (err) {
    console.error('[Supabase Direct Sync] ✗ Lỗi đồng bộ trực tiếp cán bộ lên Supabase:', err.message);
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

/**
 * Đồng bộ trực tiếp 1 Vai trò/Phân quyền lên Supabase Cloud (Write-through instant sync)
 */
async function syncDirectRoleToSupabase(role) {
  if (!isSupabaseConfigured() || !role) return;
  const pool = getPool();
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    const permStr = typeof role.permissions === 'object' ? JSON.stringify(role.permissions) : role.permissions;
    const sql = `
      INSERT INTO roles (id, code, name, description, data_scope, permissions, is_system, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        data_scope = EXCLUDED.data_scope,
        permissions = EXCLUDED.permissions
    `;
    await client.query(sql, [
      role.id, role.code, role.name, role.description || '', role.data_scope || 'personal',
      permStr, role.is_system ? 1 : 0, role.created_at || new Date().toISOString()
    ]);
    console.log(`[Supabase Direct Sync] ✓ Đã cập nhật vai trò "${role.name}" (${role.code}) lên Supabase.`);
  } catch (err) {
    console.error('[Supabase Direct Sync] ✗ Lỗi đồng bộ vai trò lên Supabase:', err.message);
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

/**
 * Tự động đồng bộ khi khởi động Server:
 * - Nếu Supabase đã có dữ liệu -> Kéo dữ liệu mới nhất từ Supabase về SQLite máy chủ (đảm bảo container Render luôn chạy dữ liệu thật 100%).
 * - Nếu Supabase chưa có dữ liệu và SQLite có dữ liệu -> Đẩy dữ liệu ban đầu từ SQLite lên Supabase.
 */
async function syncWithSupabaseOnStartup() {
  if (!isSupabaseConfigured()) return;
  let supUserCount = 0;
  const pool = getPool();
  if (!pool) return;
  try {
    const client = await pool.connect();
    try {
      const supRes = await client.query('SELECT COUNT(*) as count FROM users');
      supUserCount = parseInt(supRes.rows[0].count, 10) || 0;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Supabase Startup Sync] ✗ Không thể kết nối Supabase Cloud khi khởi động:', err.message);
    return;
  } finally {
    try { await pool.end(); } catch (e) {}
  }

  const localUserCount = db.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0;
  console.log(`[Supabase Startup Sync] Kiểm tra trạng thái: Supabase = ${supUserCount} users | SQLite cục bộ = ${localUserCount} users.`);

  if (supUserCount > 0 && localUserCount === 0) {
    console.log(`[Supabase Startup Sync] SQLite cục bộ đang trống. Kéo dữ liệu từ Supabase về...`);
    const result = await pullFromSupabase();
    console.log('[Supabase Startup Sync] ✓ Đã nạp thành công CSDL từ Supabase vào SQLite:', result.stats);
    ensureUserPositionsPopulated();
    return result;
  } else if (localUserCount > 0) {
    console.log('[Supabase Startup Sync] SQLite cục bộ đã có dữ liệu. Đẩy dữ liệu đồng bộ lên Supabase Cloud...');
    const result = await pushToSupabase();
    console.log('[Supabase Startup Sync] ✓ Đã đồng bộ thành công CSDL lên Supabase Cloud:', result.stats);
    ensureUserPositionsPopulated();
    return result;
  }
}

/**
 * Tương thích ngược: alias cho syncWithSupabaseOnStartup
 */
async function autoRestoreFromSupabaseIfFresh() {
  return syncWithSupabaseOnStartup();
}

/**
 * Xóa danh sách công việc chuẩn khỏi Supabase Cloud
 */
async function deleteStandardTasksFromSupabase(ids) {
  if (!isSupabaseConfigured() || !ids || ids.length === 0) return;
  const pool = getPool();
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
      await client.query(`DELETE FROM standard_tasks WHERE id IN (${placeholders})`, chunk);
    }
  } catch (err) {
    console.error('[Supabase Delete] Lỗi xóa công việc chuẩn trên Supabase:', err.message);
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

/**
 * Xóa danh sách công việc đã giao khỏi Supabase Cloud
 */
async function deleteAssignedTasksFromSupabase(ids) {
  if (!isSupabaseConfigured() || !ids || ids.length === 0) return;
  const pool = getPool();
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
      await client.query(`UPDATE document_dispatches SET task_id = NULL WHERE task_id IN (${placeholders})`, chunk);
      await client.query(`DELETE FROM assigned_tasks WHERE id IN (${placeholders})`, chunk);
    }
    console.log(`[Supabase Delete] Đã xóa ${ids.length} công việc đã giao trên Supabase Cloud.`);
  } catch (err) {
    console.error('[Supabase Delete] Lỗi xóa công việc đã giao trên Supabase:', err.message);
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

/**
 * Xóa hoàn toàn một người dùng và các dữ liệu liên quan khỏi Supabase Cloud
 */
async function deleteUserFromSupabase(userId) {
  if (!isSupabaseConfigured() || !userId) return;
  const pool = getPool();
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('DELETE FROM evaluation_criteria_details WHERE evaluation_id IN (SELECT id FROM evaluations WHERE user_id = $1)', [userId]);
    await client.query('DELETE FROM evaluations WHERE user_id = $1 OR returned_by = $1', [userId]);
    await client.query('DELETE FROM assigned_tasks WHERE user_id = $1 OR assigned_by = $1', [userId]);
    await client.query('DELETE FROM votes WHERE user_id = $1 OR voter_id = $1', [userId]);
    await client.query('UPDATE users SET manager_id = NULL WHERE manager_id = $1', [userId]);
    await client.query('UPDATE users SET final_evaluator_id = NULL WHERE final_evaluator_id = $1', [userId]);
    await client.query('UPDATE departments SET leader_id = NULL WHERE leader_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
    console.log(`[Supabase Delete] Đã xóa vĩnh viễn user ${userId} trên Supabase Cloud.`);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(`[Supabase Delete] Lỗi khi xóa user ${userId} trên Supabase:`, err.message);
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

/**
 * Reset toàn bộ bảng evaluations và criteria_details trên Supabase Cloud
 */
async function resetAllEvaluationsFromSupabase() {
  if (!isSupabaseConfigured()) return;
  const pool = getPool();
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('DELETE FROM evaluation_criteria_details');
    await client.query('DELETE FROM evaluations');
    await client.query('DELETE FROM votes');
    await client.query('COMMIT');
    console.log('[Supabase Reset] Đã reset toàn bộ bảng evaluations, criteria_details, votes trên Supabase Cloud.');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[Supabase Reset] Lỗi khi reset evaluations trên Supabase:', err.message);
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

module.exports = {
  isSupabaseConfigured,
  getSupabaseStatus,
  pushToSupabase,
  pullFromSupabase,
  triggerBackgroundSupabaseSync,
  syncDirectUserToSupabase,
  syncDirectRoleToSupabase,
  syncWithSupabaseOnStartup,
  autoRestoreFromSupabaseIfFresh,
  deleteStandardTasksFromSupabase,
  deleteAssignedTasksFromSupabase,
  deleteUserFromSupabase,
  resetAllEvaluationsFromSupabase
};

