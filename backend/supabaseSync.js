/**
 * MODULE QUẢN LÝ ĐỒNG BỘ VÀ SAO LƯU CSDL VỚI SUPABASE (CLOUD POSTGRESQL)
 * Đảm bảo:
 * 1. Supabase là Nguồn Chân Lý Duy Nhất (Single Source of Truth) trên môi trường Cloud (Render).
 * 2. Không bao giờ xóa mất dữ liệu trên Supabase khi SQLite cục bộ rỗng hoặc thiếu bản ghi.
 * 3. Đồng bộ 100% tất cả 18 bảng và toàn bộ các cột điểm số, xếp loại, tham mưu.
 * 4. Hỗ trợ Realtime Write-Through (đồng bộ tức thì bản ghi vừa cập nhật).
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

// Singleton Connection Pool (tái sử dụng kết nối, tránh tạo pool liên tục làm cạn kiệt kết nối)
let sharedPool = null;

function getPool() {
  if (!isSupabaseConfigured()) return null;
  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString: getDbUrl(),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 10
    });
    sharedPool.on('error', (err) => {
      console.error('[Supabase Pool Error]:', err.message);
    });
  }
  return sharedPool;
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
    'user_groups', 'user_group_members', 'notifications', 'user_positions',
    'skip_level_authorizations', 'system_logs'
  ];

  const sqliteCounts = {};
  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as count FROM "${t}"`).get();
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

    return {
      configured: true,
      connected: true,
      dbUrlMasked: getMaskedUrl(),
      sqliteCounts,
      supabaseCounts,
      message: 'Kết nối Supabase Cloud PostgreSQL hoạt động bình thường'
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      dbUrlMasked: getMaskedUrl(),
      sqliteCounts,
      supabaseCounts: null,
      message: `Lỗi kết nối Supabase: ${error.message}`
    };
  } finally {
    if (client) client.release();
  }
}

/**
 * Helper thực hiện Batch Upsert (INSERT ... ON CONFLICT) an toàn, cập nhật 100% cột không phải khóa
 */
async function batchUpsert(client, tableName, columns, conflictCols, updateCols, rows, chunkSize = 50) {
  if (!rows || rows.length === 0) return 0;

  const actualUpdateCols = (updateCols && updateCols.length > 0)
    ? updateCols
    : (conflictCols && conflictCols.length > 0
        ? columns.filter(c => !conflictCols.includes(c))
        : []);

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valuePlaceholders = [];
    const params = [];
    let paramIndex = 1;

    for (const row of chunk) {
      const rowPlaceholders = [];
      for (const col of columns) {
        rowPlaceholders.push(`$${paramIndex++}`);
        let val = row[col];
        if (val === undefined) val = null;
        params.push(val);
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const conflictClause = conflictCols && conflictCols.length > 0
      ? (actualUpdateCols.length > 0
          ? `ON CONFLICT (${conflictCols.map(c => `"${c}"`).join(', ')}) DO UPDATE SET ` +
            actualUpdateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')
          : `ON CONFLICT (${conflictCols.map(c => `"${c}"`).join(', ')}) DO NOTHING`)
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
 * Tuyệt đối không xóa mù quáng trên Supabase; dùng ON CONFLICT DO UPDATE
 */
async function pushToSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Chưa cấu hình DATABASE_URL trong backend/.env');
  }

  const pool = getPool();
  const client = await pool.connect();
  const stats = {};

  try {
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
      ['code', 'name', 'description', 'data_scope', 'permissions', 'is_system'],
      roles
    );
    stats.roles = roles.length;

    // 3. departments
    const depts = db.prepare('SELECT * FROM departments').all();
    await batchUpsert(
      client, 'departments',
      ['id', 'code', 'name', 'parent_id', 'leader_id', 'is_active', 'description', 'parent_agency', 'location_name', 'agency_type', 'manager_title', 'leader_title'],
      ['id'],
      null, // Tự động cập nhật tất cả các cột
      depts.map(d => ({
        ...d,
        is_active: d.is_active ?? 1,
        agency_type: d.agency_type || 'su_nghiep',
        manager_title: d.manager_title || 'TRƯỞNG ĐƠN VỊ',
        leader_title: d.leader_title || 'THỦ TRƯỞNG ĐƠN VỊ'
      }))
    );
    stats.departments = depts.length;

    // 4. users
    const users = db.prepare('SELECT * FROM users').all();
    await batchUpsert(
      client, 'users',
      ['id', 'username', 'password', 'full_name', 'role', 'party_title', 'gov_title', 'dept_id',
       'birth_date', 'gender', 'phone', 'email', 'is_active', 'target_role', 'role_id', 'manager_id',
       'management_role', 'final_evaluator_id', 'union_title', 'is_party_member', 'employee_type'],
      ['id'],
      null, // Tự động cập nhật tất cả các cột
      users.map(u => ({
        ...u,
        is_active: u.is_active ?? 1,
        is_party_member: u.is_party_member ?? 0,
        employee_type: u.employee_type || 'vien_chuc'
      }))
    );
    stats.users = users.length;

    const validUserIds = new Set(users.map(u => u.id));

    // 5. periods
    const periods = db.prepare('SELECT * FROM periods').all();
    await batchUpsert(
      client, 'periods',
      ['id', 'code', 'name', 'start_date', 'end_date', 'is_active',
       'grading_lock_date', 'is_locked', 'finalized_at', 'finalized_by', 'finalized_note'],
      ['id'],
      null,
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
      null,
      axes
    );
    stats.axes = axes.length;

    // 7. common_criteria
    const commonCriteria = db.prepare('SELECT * FROM common_criteria').all();
    await batchUpsert(
      client, 'common_criteria',
      ['id', 'group_no', 'group_name', 'code', 'title', 'max_score', 'target_role'],
      ['id'],
      null,
      commonCriteria
    );
    stats.common_criteria = commonCriteria.length;

    // 8. standard_tasks
    const standardTasks = db.prepare('SELECT * FROM standard_tasks').all();
    await batchUpsert(
      client, 'standard_tasks',
      ['id', 'period_id', 'dept_code', 'task_name', 'output_result', 'deadline',
       'task_type', 'standard_score', 'difficulty_weight', 'max_converted_score',
       'expected_evidence', 'note', 'axis_code', 'status', 'created_at',
       'proposed_by', 'proposed_by_name', 'proposal_type', 'proposal_note',
       'original_task_id', 'approved_by', 'approved_at', 'rejection_reason'],
      ['id'],
      null,
      standardTasks,
      100
    );
    stats.standard_tasks = standardTasks.length;

    // 9. documents
    const documents = db.prepare('SELECT * FROM documents').all();
    await batchUpsert(
      client, 'documents',
      ['id', 'doc_number', 'doc_date', 'arrival_date', 'arrival_number', 'issuer',
       'doc_type', 'field', 'urgency', 'security_level', 'summary', 'file_url',
       'file_name', 'deadline', 'status', 'created_by', 'created_at', 'updated_at',
       'leader_id', 'leader_instruction', 'submitted_at', 'submitted_by', 'is_reference_only'],
      ['id'],
      null,
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
    if (assignedTasks.length > 0) {
      await batchUpsert(
        client, 'assigned_tasks',
        [
          'id', 'period_id', 'user_id', 'standard_task_id', 'task_name', 'output_result',
          'deadline', 'task_type', 'standard_score', 'difficulty_weight', 'max_converted_score',
          'axis_code', 'origin', 'status', 'actual_finish_date', 'evidence_text',
          'evidence_file_url', 'evidence_file_name', 'quantity_pct', 'progress_pct',
          'quality_pct', 'leadership_pct', 'execution_score', 'converted_score',
          'cbql_comment', 'assigned_by', 'created_at', 'updated_at', 'group_id',
          'is_bonus_proposed', 'bonus_score', 'bonus_reason', 'return_reason',
          'is_returned', 'document_id', 'feedback_reason', 'feedback_count',
          'reassigned_at', 'evaluation_feedback', 'inherited_from_task_id',
          'inherited_from_user_name', 'original_deadline', 'requested_deadline',
          'extension_reason', 'extension_status', 'extension_requested_at',
          'extension_reviewed_by', 'extension_reviewed_at', 'extension_reject_reason',
          'extension_count', 'detailed_result_note', 'evaluator_id', 'evaluator_type',
          'delegated_by', 'delegated_at', 'delegation_note', 'submitted_for_eval_at',
          'document_number', 'document_date', 'is_skip_level', 'target_position_id',
          'skip_level_notes', 'level_1_reviewer_id', 'level_1_reviewed_at',
          'level_1_comment', 'level_1_score'
        ],
        ['id'],
        null, // Cập nhật TOÀN BỘ 65 cột còn lại
        assignedTasks.map(at => ({
          ...at,
          assigned_by: validUserIds.has(at.assigned_by) ? at.assigned_by : null,
          extension_reviewed_by: validUserIds.has(at.extension_reviewed_by) ? at.extension_reviewed_by : null,
          evaluator_id: validUserIds.has(at.evaluator_id) ? at.evaluator_id : null,
          delegated_by: validUserIds.has(at.delegated_by) ? at.delegated_by : null,
          is_bonus_proposed: at.is_bonus_proposed ?? 0,
          bonus_score: at.bonus_score ?? 0,
          is_returned: at.is_returned ?? 0,
          extension_count: at.extension_count ?? 0,
          is_skip_level: at.is_skip_level ?? 0
        })),
        100
      );
    }
    stats.assigned_tasks = assignedTasks.length;

    // 11. document_dispatches
    const dispatches = db.prepare('SELECT * FROM document_dispatches').all();
    await batchUpsert(
      client, 'document_dispatches',
      ['id', 'document_id', 'department_id', 'assigned_to_user_id',
       'coordinating_user_ids', 'instruction', 'deadline', 'task_id',
       'status', 'dispatched_by', 'dispatched_at', 'completed_at',
       'completion_note', 'dispatch_type', 'role_in_dispatch'],
      ['id'],
      null,
      dispatches.map(dd => ({
        ...dd,
        dispatch_type: dd.dispatch_type || 'process',
        role_in_dispatch: dd.role_in_dispatch || 'main',
        dispatched_by: validUserIds.has(dd.dispatched_by) ? dd.dispatched_by : null
      }))
    );
    stats.document_dispatches = dispatches.length;

    // 12. evaluations (CẬP NHẬT ĐẦY ĐỦ 30 CỘT, KHÔNG BAO GIỜ DELETE MÙ QUÁNG)
    const evaluations = db.prepare('SELECT * FROM evaluations').all();
    if (evaluations.length > 0) {
      await batchUpsert(
        client, 'evaluations',
        [
          'id', 'period_id', 'user_id', 'part1_score', 'part2_score', 'total_score',
          'rank_proposed', 'superior_rank', 'superior_comment', 'status', 'updated_at',
          'step', 'bonus_score', 'bonus_note', 'plan_total_max_score', 'executed_total_conv_score',
          'summary_reason', 'cadre_proposal_note', 'return_reason', 'returned_at',
          'returned_by', 'submitted_at', 'advisory_rank', 'advisory_comment',
          'advisory_by', 'advisory_submitted_at', 'is_advisory_submitted',
          'final_classification', 'skip_level_reviewer_id', 'skip_level_status',
          'superior_evaluator_id', 'superior_evaluated_at'
        ],
        ['period_id', 'user_id'],
        null, // Cập nhật TOÀN BỘ các cột còn lại
        evaluations.map(ev => ({
          ...ev,
          returned_by: validUserIds.has(ev.returned_by) ? ev.returned_by : null,
          advisory_by: validUserIds.has(ev.advisory_by) ? ev.advisory_by : null,
          superior_evaluator_id: validUserIds.has(ev.superior_evaluator_id) ? ev.superior_evaluator_id : null,
          is_advisory_submitted: ev.is_advisory_submitted ?? 0,
          skip_level_status: ev.skip_level_status || 'approved'
        }))
      );
    }
    stats.evaluations = evaluations.length;

    // 13. evaluation_criteria_details
    const critDetails = db.prepare('SELECT * FROM evaluation_criteria_details').all();
    if (critDetails.length > 0) {
      await batchUpsert(
        client, 'evaluation_criteria_details',
        ['id', 'evaluation_id', 'criteria_id', 'is_satisfied', 'score', 'note'],
        ['id'],
        null,
        critDetails.map(cd => ({
          ...cd,
          is_satisfied: cd.is_satisfied ?? 1,
          score: cd.score ?? 0
        })),
        100
      );
    }
    stats.evaluation_criteria_details = critDetails.length;

    // 14. votes
    const votes = db.prepare('SELECT * FROM votes').all();
    await batchUpsert(
      client, 'votes',
      ['id', 'period_id', 'user_id', 'voter_id', 'vote_rank', 'comment', 'created_at'],
      ['period_id', 'user_id', 'voter_id'],
      null,
      votes
    );
    stats.votes = votes.length;

    // 15. user_groups
    const userGroups = db.prepare('SELECT * FROM user_groups').all();
    await batchUpsert(
      client, 'user_groups',
      ['id', 'name', 'description', 'dept_id', 'created_by', 'created_at', 'updated_at'],
      ['id'],
      null,
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
      null,
      groupMembers.filter(gm => validUserIds.has(gm.user_id))
    );
    stats.user_group_members = groupMembers.length;

    // 17. notifications
    const notifs = db.prepare('SELECT * FROM notifications').all();
    await batchUpsert(
      client, 'notifications',
      ['id', 'user_id', 'title', 'message', 'type', 'task_id', 'tab', 'is_read', 'created_at'],
      ['id'],
      null,
      notifs.filter(n => validUserIds.has(n.user_id)),
      100
    );
    stats.notifications = notifs.length;

    // 18. user_positions
    const positions = db.prepare('SELECT * FROM user_positions').all();
    await batchUpsert(
      client, 'user_positions',
      ['id', 'user_id', 'dept_id', 'position_title', 'position_type', 'role_id',
       'management_role', 'is_primary', 'notes', 'created_at', 'updated_at', 'manager_id'],
      ['id'],
      null,
      positions.map(p => ({
        ...p,
        user_id: validUserIds.has(p.user_id) ? p.user_id : null,
        manager_id: validUserIds.has(p.manager_id) ? p.manager_id : null,
        is_primary: p.is_primary ?? 0
      })).filter(p => p.user_id !== null)
    );
    stats.user_positions = positions.length;

    // 19. skip_level_authorizations
    const auths = db.prepare('SELECT * FROM skip_level_authorizations').all();
    await batchUpsert(
      client, 'skip_level_authorizations',
      ['id', 'manager_id', 'dept_id', 'can_assign', 'can_review', 'can_view_reports', 'notes', 'created_at', 'updated_at'],
      ['id'],
      null,
      auths.filter(a => validUserIds.has(a.manager_id))
    );
    stats.skip_level_authorizations = auths.length;

    // 20. system_logs
    const logs = db.prepare('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 1000').all();
    await batchUpsert(
      client, 'system_logs',
      ['id', 'user_id', 'username', 'full_name', 'action', 'entity_type', 'entity_id', 'description', 'ip_address', 'user_agent', 'details', 'created_at'],
      ['id'],
      null,
      logs
    );
    stats.system_logs = logs.length;

    return { success: true, stats, message: 'Đã sao lưu thành công toàn bộ dữ liệu lên Supabase Cloud' };
  } finally {
    client.release();
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
 * Nạp đầy đủ 100% tất cả 18 bảng và toàn bộ các cột điểm số, xếp loại, tham mưu.
 */
async function pullFromSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Chưa cấu hình DATABASE_URL trong backend/.env');
  }

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
        id, code, name, parent_id, leader_id, is_active, description, parent_agency, location_name, agency_type, manager_title, leader_title
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const d of supDepts.rows) {
        insDept.run(
          toSqliteVal(d.id), toSqliteVal(d.code), toSqliteVal(d.name), toSqliteVal(d.parent_id),
          toSqliteVal(d.leader_id), d.is_active !== 0 ? 1 : 0, toSqliteVal(d.description),
          toSqliteVal(d.parent_agency), toSqliteVal(d.location_name),
          toSqliteVal(d.agency_type || 'su_nghiep'),
          toSqliteVal(d.manager_title || 'TRƯỞNG ĐƠN VỊ'),
          toSqliteVal(d.leader_title || 'THỦ TRƯỞNG ĐƠN VỊ')
        );
      }
    })();
    stats.departments = supDepts.rows.length;

    // 4. users
    const supUsers = await client.query('SELECT * FROM users');
    const insUser = db.prepare(`
      INSERT OR REPLACE INTO users (
        id, username, password, full_name, role, party_title, gov_title, dept_id,
        birth_date, gender, phone, email, is_active, target_role, role_id, manager_id,
        management_role, final_evaluator_id, union_title, is_party_member, employee_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const u of supUsers.rows) {
        insUser.run(
          toSqliteVal(u.id), toSqliteVal(u.username), toSqliteVal(u.password), toSqliteVal(u.full_name),
          toSqliteVal(u.role), toSqliteVal(u.party_title), toSqliteVal(u.gov_title), toSqliteVal(u.dept_id),
          toSqliteVal(u.birth_date), toSqliteVal(u.gender), toSqliteVal(u.phone), toSqliteVal(u.email),
          u.is_active !== undefined && u.is_active !== null && u.is_active !== 0 ? 1 : 0,
          toSqliteVal(u.target_role), toSqliteVal(u.role_id), toSqliteVal(u.manager_id),
          toSqliteVal(u.management_role || 'nhan_vien'), toSqliteVal(u.final_evaluator_id),
          toSqliteVal(u.union_title), u.is_party_member ? 1 : 0,
          toSqliteVal(u.employee_type || 'vien_chuc')
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
          toSqliteVal(p.end_date), p.is_active !== 0 ? 1 : 0, toSqliteVal(p.grading_lock_date),
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

    // 8. standard_tasks (đầy đủ 23 cột)
    const supStdTasks = await client.query('SELECT * FROM standard_tasks');
    const insStdTask = db.prepare(`
      INSERT OR REPLACE INTO standard_tasks (
        id, period_id, dept_code, task_name, output_result, deadline,
        task_type, standard_score, difficulty_weight, max_converted_score,
        expected_evidence, note, axis_code, status, created_at,
        proposed_by, proposed_by_name, proposal_type, proposal_note,
        original_task_id, approved_by, approved_at, rejection_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const t of supStdTasks.rows) {
        insStdTask.run(
          toSqliteVal(t.id), toSqliteVal(t.period_id || 'p-2'), toSqliteVal(t.dept_code), toSqliteVal(t.task_name),
          toSqliteVal(t.output_result), toSqliteVal(t.deadline), toSqliteVal(t.task_type),
          toSqliteVal(t.standard_score), toSqliteVal(t.difficulty_weight), toSqliteVal(t.max_converted_score),
          toSqliteVal(t.expected_evidence), toSqliteVal(t.note), toSqliteVal(t.axis_code),
          toSqliteVal(t.status), toSqliteVal(t.created_at),
          toSqliteVal(t.proposed_by), toSqliteVal(t.proposed_by_name), toSqliteVal(t.proposal_type || 'add'),
          toSqliteVal(t.proposal_note), toSqliteVal(t.original_task_id), toSqliteVal(t.approved_by),
          toSqliteVal(t.approved_at), toSqliteVal(t.rejection_reason)
        );
      }
    })();
    stats.standard_tasks = supStdTasks.rows.length;

    // 9. documents (đầy đủ 23 cột)
    const supDocs = await client.query('SELECT * FROM documents');
    const insDoc = db.prepare(`
      INSERT OR REPLACE INTO documents (
        id, doc_number, doc_date, arrival_date, arrival_number, issuer,
        doc_type, field, urgency, security_level, summary, file_url,
        file_name, deadline, status, created_by, created_at, updated_at,
        leader_id, leader_instruction, submitted_at, submitted_by, is_reference_only
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
          toSqliteVal(doc.created_by), toSqliteVal(doc.created_at), toSqliteVal(doc.updated_at),
          toSqliteVal(doc.leader_id), toSqliteVal(doc.leader_instruction),
          toSqliteVal(doc.submitted_at), toSqliteVal(doc.submitted_by), doc.is_reference_only ? 1 : 0
        );
      }
    })();
    stats.documents = supDocs.rows.length;

    // 10. assigned_tasks (đầy đủ 66 cột)
    const supAssigned = await client.query('SELECT * FROM assigned_tasks');
    const insAssigned = db.prepare(`
      INSERT OR REPLACE INTO assigned_tasks (
        id, period_id, user_id, standard_task_id, task_name, output_result,
        deadline, task_type, standard_score, difficulty_weight, max_converted_score,
        axis_code, origin, status, actual_finish_date, evidence_text,
        evidence_file_url, evidence_file_name, quantity_pct, progress_pct,
        quality_pct, leadership_pct, execution_score, converted_score,
        cbql_comment, assigned_by, created_at, updated_at, group_id,
        is_bonus_proposed, bonus_score, bonus_reason, return_reason,
        is_returned, document_id, feedback_reason, feedback_count,
        reassigned_at, evaluation_feedback, inherited_from_task_id,
        inherited_from_user_name, original_deadline, requested_deadline,
        extension_reason, extension_status, extension_requested_at,
        extension_reviewed_by, extension_reviewed_at, extension_reject_reason,
        extension_count, detailed_result_note, evaluator_id, evaluator_type,
        delegated_by, delegated_at, delegation_note, submitted_for_eval_at,
        document_number, document_date, is_skip_level, target_position_id,
        skip_level_notes, level_1_reviewer_id, level_1_reviewed_at,
        level_1_comment, level_1_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const t of supAssigned.rows) {
        insAssigned.run(
          toSqliteVal(t.id), toSqliteVal(t.period_id), toSqliteVal(t.user_id), toSqliteVal(t.standard_task_id),
          toSqliteVal(t.task_name), toSqliteVal(t.output_result), toSqliteVal(t.deadline), toSqliteVal(t.task_type),
          toSqliteVal(t.standard_score), toSqliteVal(t.difficulty_weight), toSqliteVal(t.max_converted_score),
          toSqliteVal(t.axis_code), toSqliteVal(t.origin), toSqliteVal(t.status), toSqliteVal(t.actual_finish_date),
          toSqliteVal(t.evidence_text), toSqliteVal(t.evidence_file_url), toSqliteVal(t.evidence_file_name),
          toSqliteVal(t.quantity_pct), toSqliteVal(t.progress_pct), toSqliteVal(t.quality_pct),
          toSqliteVal(t.leadership_pct), toSqliteVal(t.execution_score), toSqliteVal(t.converted_score),
          toSqliteVal(t.cbql_comment), toSqliteVal(t.assigned_by), toSqliteVal(t.created_at), toSqliteVal(t.updated_at),
          toSqliteVal(t.group_id), t.is_bonus_proposed ? 1 : 0, toSqliteVal(t.bonus_score || 0),
          toSqliteVal(t.bonus_reason), toSqliteVal(t.return_reason), t.is_returned ? 1 : 0, toSqliteVal(t.document_id),
          toSqliteVal(t.feedback_reason), toSqliteVal(t.feedback_count || 0), toSqliteVal(t.reassigned_at),
          toSqliteVal(t.evaluation_feedback), toSqliteVal(t.inherited_from_task_id), toSqliteVal(t.inherited_from_user_name),
          toSqliteVal(t.original_deadline), toSqliteVal(t.requested_deadline), toSqliteVal(t.extension_reason),
          toSqliteVal(t.extension_status), toSqliteVal(t.extension_requested_at), toSqliteVal(t.extension_reviewed_by),
          toSqliteVal(t.extension_reviewed_at), toSqliteVal(t.extension_reject_reason), toSqliteVal(t.extension_count || 0),
          toSqliteVal(t.detailed_result_note), toSqliteVal(t.evaluator_id), toSqliteVal(t.evaluator_type || 'assigner'),
          toSqliteVal(t.delegated_by), toSqliteVal(t.delegated_at), toSqliteVal(t.delegation_note), toSqliteVal(t.submitted_for_eval_at),
          toSqliteVal(t.document_number), toSqliteVal(t.document_date), t.is_skip_level ? 1 : 0, toSqliteVal(t.target_position_id),
          toSqliteVal(t.skip_level_notes), toSqliteVal(t.level_1_reviewer_id), toSqliteVal(t.level_1_reviewed_at),
          toSqliteVal(t.level_1_comment), toSqliteVal(t.level_1_score)
        );
      }
    })();
    stats.assigned_tasks = supAssigned.rows.length;

    // 11. document_dispatches
    const supDispatches = await client.query('SELECT * FROM document_dispatches');
    const insDispatch = db.prepare(`
      INSERT OR REPLACE INTO document_dispatches (
        id, document_id, department_id, assigned_to_user_id, coordinating_user_ids,
        instruction, deadline, task_id, status, dispatched_by, dispatched_at,
        completed_at, completion_note, dispatch_type, role_in_dispatch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const d of supDispatches.rows) {
        insDispatch.run(
          toSqliteVal(d.id), toSqliteVal(d.document_id), toSqliteVal(d.department_id),
          toSqliteVal(d.assigned_to_user_id), toSqliteVal(d.coordinating_user_ids),
          toSqliteVal(d.instruction), toSqliteVal(d.deadline), toSqliteVal(d.task_id),
          toSqliteVal(d.status), toSqliteVal(d.dispatched_by), toSqliteVal(d.dispatched_at),
          toSqliteVal(d.completed_at), toSqliteVal(d.completion_note),
          toSqliteVal(d.dispatch_type || 'process'), toSqliteVal(d.role_in_dispatch || 'main')
        );
      }
    })();
    stats.document_dispatches = supDispatches.rows.length;

    // 12. evaluations (ĐẦY ĐỦ 32 CỘT)
    const supEvals = await client.query('SELECT * FROM evaluations');
    const insEval = db.prepare(`
      INSERT OR REPLACE INTO evaluations (
        id, period_id, user_id, part1_score, part2_score, total_score,
        rank_proposed, superior_rank, superior_comment, status, updated_at,
        step, bonus_score, bonus_note, plan_total_max_score, executed_total_conv_score,
        summary_reason, cadre_proposal_note, return_reason, returned_at,
        returned_by, submitted_at, advisory_rank, advisory_comment,
        advisory_by, advisory_submitted_at, is_advisory_submitted,
        final_classification, skip_level_reviewer_id, skip_level_status,
        superior_evaluator_id, superior_evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          toSqliteVal(e.returned_by), toSqliteVal(e.submitted_at),
          toSqliteVal(e.advisory_rank), toSqliteVal(e.advisory_comment), toSqliteVal(e.advisory_by),
          toSqliteVal(e.advisory_submitted_at), e.is_advisory_submitted ? 1 : 0,
          toSqliteVal(e.final_classification), toSqliteVal(e.skip_level_reviewer_id),
          toSqliteVal(e.skip_level_status || 'approved'),
          toSqliteVal(e.superior_evaluator_id), toSqliteVal(e.superior_evaluated_at)
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
          toSqliteVal(v.voter_id), toSqliteVal(v.vote_rank), toSqliteVal(v.comment), toSqliteVal(v.created_at)
        );
      }
    })();
    stats.votes = supVotes.rows.length;

    // 15. user_groups
    const supGroups = await client.query('SELECT * FROM user_groups');
    const insGroup = db.prepare(`
      INSERT OR REPLACE INTO user_groups (id, name, description, dept_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const g of supGroups.rows) {
        insGroup.run(
          toSqliteVal(g.id), toSqliteVal(g.name), toSqliteVal(g.description), toSqliteVal(g.dept_id),
          toSqliteVal(g.created_by), toSqliteVal(g.created_at), toSqliteVal(g.updated_at)
        );
      }
    })();
    stats.user_groups = supGroups.rows.length;

    // 16. user_group_members
    const supMembers = await client.query('SELECT * FROM user_group_members');
    const insMember = db.prepare(`
      INSERT OR REPLACE INTO user_group_members (id, group_id, user_id, created_at)
      VALUES (?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const m of supMembers.rows) {
        insMember.run(toSqliteVal(m.id), toSqliteVal(m.group_id), toSqliteVal(m.user_id), toSqliteVal(m.created_at));
      }
    })();
    stats.user_group_members = supMembers.rows.length;

    // 17. notifications
    const supNotifs = await client.query('SELECT * FROM notifications');
    const insNotif = db.prepare(`
      INSERT OR REPLACE INTO notifications (id, user_id, title, message, type, task_id, tab, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const n of supNotifs.rows) {
        insNotif.run(
          toSqliteVal(n.id), toSqliteVal(n.user_id), toSqliteVal(n.title), toSqliteVal(n.message),
          toSqliteVal(n.type), toSqliteVal(n.task_id), toSqliteVal(n.tab), n.is_read ? 1 : 0, toSqliteVal(n.created_at)
        );
      }
    })();
    stats.notifications = supNotifs.rows.length;

    // 18. user_positions (ĐƯỢC KÉO TỪ SUPABASE)
    const supPositions = await client.query('SELECT * FROM user_positions');
    const insPos = db.prepare(`
      INSERT OR REPLACE INTO user_positions (
        id, user_id, dept_id, position_title, position_type, role_id,
        management_role, is_primary, notes, created_at, updated_at, manager_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const p of supPositions.rows) {
        insPos.run(
          toSqliteVal(p.id), toSqliteVal(p.user_id), toSqliteVal(p.dept_id), toSqliteVal(p.position_title),
          toSqliteVal(p.position_type || 'chinh_quyen'), toSqliteVal(p.role_id), toSqliteVal(p.management_role || 'nhan_vien'),
          p.is_primary ? 1 : 0, toSqliteVal(p.notes), toSqliteVal(p.created_at), toSqliteVal(p.updated_at), toSqliteVal(p.manager_id)
        );
      }
    })();
    stats.user_positions = supPositions.rows.length;

    // 19. skip_level_authorizations (ĐƯỢC KÉO TỪ SUPABASE)
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

    // 20. system_logs (ĐƯỢC KÉO TỪ SUPABASE)
    try {
      const supLogs = await client.query('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 1000');
      const insLog = db.prepare(`
        INSERT OR REPLACE INTO system_logs (
          id, user_id, username, full_name, action, entity_type, entity_id, description, ip_address, user_agent, details, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const l of supLogs.rows) {
          insLog.run(
            toSqliteVal(l.id), toSqliteVal(l.user_id), toSqliteVal(l.username), toSqliteVal(l.full_name),
            toSqliteVal(l.action), toSqliteVal(l.entity_type), toSqliteVal(l.entity_id), toSqliteVal(l.description),
            toSqliteVal(l.ip_address), toSqliteVal(l.user_agent), toSqliteVal(l.details), toSqliteVal(l.created_at)
          );
        }
      })();
      stats.system_logs = supLogs.rows.length;
    } catch (e) {
      stats.system_logs = 0;
    }

    checkpointDatabase();
    return { success: true, stats, message: 'Đã khôi phục thành công CSDL từ Supabase về máy chủ' };
  } finally {
    client.release();
  }
}

// Background sync state
let syncTimer = null;
let isSyncing = false;
let pendingSync = false;

/**
 * Tự động đồng bộ ngầm dữ liệu vừa cập nhật lên Supabase Cloud (Debounced & Concurrency-safe)
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
 * Chờ hoàn thành bất kỳ tiến trình sync nào đang chạy trước khi server tắt
 */
async function flushPendingSupabaseSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (isSupabaseConfigured()) {
    try {
      console.log('[Supabase Flush] Đang đẩy toàn bộ thay đổi cuối cùng lên Supabase Cloud...');
      await pushToSupabase();
      console.log('[Supabase Flush] ✓ Hoàn tất flush CSDL.');
    } catch (e) {
      console.error('[Supabase Flush] ✗ Lỗi khi flush CSDL:', e.message);
    }
  }
}

/**
 * Real-time write-through: Đồng bộ NGAY LẬP TỨC 1 bản ghi cụ thể lên Supabase (không cần chờ batch)
 */
async function syncEntityToSupabase(tableName, id, idCol = 'id') {
  if (!isSupabaseConfigured() || !id) return;
  const pool = getPool();
  if (!pool) return;

  try {
    const row = db.prepare(`SELECT * FROM "${tableName}" WHERE "${idCol}" = ?`).get(id);
    const client = await pool.connect();
    try {
      if (!row) {
        // Bản ghi đã bị xóa ở SQLite -> Xóa trên Supabase
        await client.query(`DELETE FROM "${tableName}" WHERE "${idCol}" = $1`, [id]);
        return;
      }
      const cols = Object.keys(row);
      const params = cols.map(c => row[c] !== undefined ? row[c] : null);
      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
      const updateSet = cols
        .filter(c => c !== idCol)
        .map(c => `"${c}" = EXCLUDED."${c}"`)
        .join(', ');

      const conflictClause = updateSet.length > 0
        ? `ON CONFLICT ("${idCol}") DO UPDATE SET ${updateSet}`
        : `ON CONFLICT ("${idCol}") DO NOTHING`;

      const sql = `
        INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(', ')})
        VALUES (${placeholders})
        ${conflictClause}
      `;
      await client.query(sql, params);
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn(`[Supabase Realtime Sync Warning] ${tableName} ID ${id}:`, err.message);
  }
}

/**
 * Đồng bộ trực tiếp 1 Cán bộ lên Supabase Cloud
 */
async function syncDirectUserToSupabase(user) {
  if (!user || !user.id) return;
  return syncEntityToSupabase('users', user.id);
}

/**
 * Đồng bộ trực tiếp 1 Vai trò/Phân quyền lên Supabase Cloud
 */
async function syncDirectRoleToSupabase(role) {
  if (!role || !role.id) return;
  return syncEntityToSupabase('roles', role.id);
}

/**
 * Tự động đồng bộ khi khởi động Server:
 * - Supabase Cloud là NGUỒN CHÂN LÝ DUY NHẤT trên hạ tầng đám mây (Render).
 * - Nếu Supabase có dữ liệu -> Kéo dữ liệu mới nhất từ Supabase về SQLite.
 * - Chỉ đẩy SQLite lên nếu Supabase hoàn toàn rỗng (0 users).
 */
async function syncWithSupabaseOnStartup() {
  if (!isSupabaseConfigured()) {
    console.log('[Supabase Startup Sync] Chưa cấu hình DATABASE_URL. Bỏ qua đồng bộ đám mây.');
    return;
  }

  const pool = getPool();
  if (!pool) return;
  let client;
  let supCounts = {};

  try {
    client = await pool.connect();
    const tablesToCheck = ['users', 'standard_tasks', 'assigned_tasks', 'evaluations', 'documents'];
    for (const t of tablesToCheck) {
      try {
        const res = await client.query(`SELECT COUNT(*) as count FROM "${t}"`);
        supCounts[t] = parseInt(res.rows[0].count, 10) || 0;
      } catch (e) {
        supCounts[t] = 0;
      }
    }
  } catch (err) {
    console.error('[Supabase Startup Sync] ✗ Không thể kết nối Supabase Cloud khi khởi động:', err.message);
    return;
  } finally {
    if (client) client.release();
  }

  const supUserCount = supCounts.users || 0;
  const supTaskCount = supCounts.assigned_tasks || 0;
  const supEvalCount = supCounts.evaluations || 0;
  const supDocCount = supCounts.documents || 0;
  const supStdTaskCount = supCounts.standard_tasks || 0;

  const localUserCount = db.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0;
  const localTaskCount = db.prepare('SELECT COUNT(*) as count FROM assigned_tasks').get()?.count || 0;
  const localEvalCount = db.prepare('SELECT COUNT(*) as count FROM evaluations').get()?.count || 0;
  const localDocCount = db.prepare('SELECT COUNT(*) as count FROM documents').get()?.count || 0;
  const localStdTaskCount = db.prepare('SELECT COUNT(*) as count FROM standard_tasks').get()?.count || 0;

  console.log(`[Supabase Startup Sync] Trạng thái: Supabase (${supUserCount} users, ${supTaskCount} tasks, ${supEvalCount} evals) | SQLite (${localUserCount} users, ${localTaskCount} tasks, ${localEvalCount} evals).`);

  const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
  
  // Quyết định hướng đồng bộ an toàn:
  // 1. Nếu Supabase đã có cán bộ (hệ thống sống) VÀ:
  //    - Môi trường là Render (container mới deploy / restart luôn cần nạp dữ liệu sống từ Supabase)
  //    - Hoặc SQLite mới ở trạng thái sơ khai (<= 1 user)
  //    - Hoặc Supabase có nhiều tasks/evals hơn SQLite
  // -> NẠP NGAY TOÀN BỘ CSDL TỪ SUPABASE VỀ SQLITE!
  const shouldPullFromSupabase = supUserCount > 0 && (
    isRender ||
    localUserCount <= 1 ||
    supUserCount > localUserCount ||
    supTaskCount > localTaskCount ||
    supEvalCount > localEvalCount ||
    supDocCount > localDocCount ||
    localStdTaskCount === 0
  );

  if (shouldPullFromSupabase) {
    console.log('[Supabase Startup Sync] 🚀 Supabase là Nguồn Chân Lý. Kéo toàn bộ CSDL sống từ Supabase về SQLite...');
    const result = await pullFromSupabase();
    console.log('[Supabase Startup Sync] ✓ Đã nạp thành công CSDL sống từ Supabase vào máy chủ:', result.stats);
    ensureUserPositionsPopulated();
    return result;
  } else if (localUserCount > 0 && supUserCount === 0) {
    // Supabase hoàn toàn mới (0 users) -> Đẩy dữ liệu ban đầu từ SQLite lên Supabase
    console.log('[Supabase Startup Sync] Supabase Cloud chưa có dữ liệu. Đẩy dữ liệu ban đầu từ SQLite lên Supabase...');
    const result = await pushToSupabase();
    console.log('[Supabase Startup Sync] ✓ Đã đẩy thành công CSDL ban đầu lên Supabase Cloud:', result.stats);
    ensureUserPositionsPopulated();
    return result;
  } else {
    console.log('[Supabase Startup Sync] ✓ CSDL máy chủ và đám mây đã đồng bộ trạng thái.');
    ensureUserPositionsPopulated();
  }
}

async function autoRestoreFromSupabaseIfFresh() {
  return syncWithSupabaseOnStartup();
}

/**
 * Xóa danh sách công việc chuẩn khỏi Supabase Cloud theo ID cụ thể
 */
async function deleteStandardTasksFromSupabase(ids) {
  if (!isSupabaseConfigured() || !ids || ids.length === 0) return;
  const pool = getPool();
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    await client.query('DELETE FROM standard_tasks WHERE id = ANY($1)', [ids]);
    console.log(`[Supabase Delete] Đã xóa ${ids.length} công việc chuẩn trên Supabase.`);
  } catch (err) {
    console.error('[Supabase Delete] Lỗi khi xóa standard_tasks trên Supabase:', err.message);
  } finally {
    if (client) client.release();
  }
}

/**
 * Xóa danh sách công việc được giao khỏi Supabase Cloud theo ID cụ thể
 */
async function deleteAssignedTasksFromSupabase(ids) {
  if (!isSupabaseConfigured() || !ids || ids.length === 0) return;
  const pool = getPool();
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    await client.query('UPDATE document_dispatches SET task_id = NULL WHERE task_id = ANY($1)', [ids]);
    await client.query('DELETE FROM assigned_tasks WHERE id = ANY($1)', [ids]);
    console.log(`[Supabase Delete] Đã xóa ${ids.length} công việc được giao trên Supabase.`);
  } catch (err) {
    console.error('[Supabase Delete] Lỗi khi xóa assigned_tasks trên Supabase:', err.message);
  } finally {
    if (client) client.release();
  }
}

/**
 * Xóa người dùng khỏi Supabase Cloud theo ID cụ thể
 */
async function deleteUserFromSupabase(userId) {
  if (!isSupabaseConfigured() || !userId) return;
  const pool = getPool();
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    console.log(`[Supabase Delete] Đã xóa người dùng "${userId}" trên Supabase.`);
  } catch (err) {
    console.error('[Supabase Delete] Lỗi khi xóa user trên Supabase:', err.message);
  } finally {
    if (client) client.release();
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
  }
}

module.exports = {
  isSupabaseConfigured,
  getSupabaseStatus,
  pushToSupabase,
  pullFromSupabase,
  triggerBackgroundSupabaseSync,
  flushPendingSupabaseSync,
  syncEntityToSupabase,
  syncDirectUserToSupabase,
  syncDirectRoleToSupabase,
  syncWithSupabaseOnStartup,
  autoRestoreFromSupabaseIfFresh,
  deleteStandardTasksFromSupabase,
  deleteAssignedTasksFromSupabase,
  deleteUserFromSupabase,
  resetAllEvaluationsFromSupabase
};
