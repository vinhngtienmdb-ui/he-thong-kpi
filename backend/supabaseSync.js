/**
 * MODULE QUẢN LÝ ĐỒNG BỘ VÀ SAO LƯU CSDL VỚI SUPABASE (CLOUD POSTGRESQL)
 * Hoàn toàn tách biệt khỏi quá trình khởi động hoặc cập nhật phần mềm.
 * Chỉ chạy khi người dùng hoặc Quản trị viên chủ động kích hoạt.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();
const { Pool } = require('pg');
const { db, createBackup, checkpointDatabase } = require('./database');

function getDbUrl() {
  return process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
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
    'documents', 'document_dispatches', 'votes', 'roles', 'system_configs'
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
 * Đẩy toàn bộ dữ liệu từ SQLite lên Supabase (Safe Upsert)
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
    // 1. system_configs
    const configs = db.prepare('SELECT * FROM system_configs').all();
    for (const row of configs) {
      await client.query(`
        INSERT INTO system_configs (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description
      `, [row.key, row.value, row.description]);
    }
    stats.system_configs = configs.length;

    // 2. roles
    const roles = db.prepare('SELECT * FROM roles').all();
    for (const r of roles) {
      await client.query(`
        INSERT INTO roles (id, code, name, description, data_scope, permissions, is_system, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code, name = EXCLUDED.name, description = EXCLUDED.description,
          data_scope = EXCLUDED.data_scope, permissions = EXCLUDED.permissions
      `, [r.id, r.code, r.name, r.description, r.data_scope, r.permissions, r.is_system, r.created_at]);
    }
    stats.roles = roles.length;

    // 3. departments (First pass: without foreign keys)
    const depts = db.prepare('SELECT * FROM departments').all();
    for (const d of depts) {
      await client.query(`
        INSERT INTO departments (id, code, name, is_active, description, parent_agency, location_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code, name = EXCLUDED.name, is_active = EXCLUDED.is_active,
          description = EXCLUDED.description, parent_agency = EXCLUDED.parent_agency,
          location_name = EXCLUDED.location_name
      `, [d.id, d.code, d.name, d.is_active ?? 1, d.description, d.parent_agency, d.location_name]);
    }
    stats.departments = depts.length;

    // 4. users
    const users = db.prepare('SELECT * FROM users').all();
    for (const u of users) {
      await client.query(`
        INSERT INTO users (id, username, password, full_name, role, party_title, gov_title, dept_id,
                           birth_date, gender, phone, email, is_active, target_role, role_id, manager_id,
                           management_role, final_evaluator_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username, password = EXCLUDED.password, full_name = EXCLUDED.full_name,
          role = EXCLUDED.role, party_title = EXCLUDED.party_title, gov_title = EXCLUDED.gov_title,
          dept_id = EXCLUDED.dept_id, birth_date = EXCLUDED.birth_date, gender = EXCLUDED.gender,
          phone = EXCLUDED.phone, email = EXCLUDED.email, is_active = EXCLUDED.is_active,
          target_role = EXCLUDED.target_role, role_id = EXCLUDED.role_id, manager_id = EXCLUDED.manager_id,
          management_role = EXCLUDED.management_role, final_evaluator_id = EXCLUDED.final_evaluator_id
      `, [u.id, u.username, u.password, u.full_name, u.role, u.party_title, u.gov_title, u.dept_id,
          u.birth_date, u.gender, u.phone, u.email, u.is_active ?? 1, u.target_role, u.role_id, u.manager_id,
          u.management_role, u.final_evaluator_id]);
    }
    stats.users = users.length;

    const validUserIds = new Set(users.map(u => u.id));

    // Update departments parent_id and leader_id
    for (const d of depts) {
      if (d.parent_id || d.leader_id) {
        const leaderId = validUserIds.has(d.leader_id) ? d.leader_id : null;
        await client.query(`
          UPDATE departments SET parent_id = $1, leader_id = $2 WHERE id = $3
        `, [d.parent_id || null, leaderId, d.id]);
      }
    }

    // 5. periods
    const periods = db.prepare('SELECT * FROM periods').all();
    for (const p of periods) {
      const finalizedBy = validUserIds.has(p.finalized_by) ? p.finalized_by : null;
      await client.query(`
        INSERT INTO periods (id, code, name, start_date, end_date, is_active,
                             grading_lock_date, is_locked, finalized_at, finalized_by, finalized_note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code, name = EXCLUDED.name, start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date, is_active = EXCLUDED.is_active,
          grading_lock_date = EXCLUDED.grading_lock_date, is_locked = EXCLUDED.is_locked
      `, [p.id, p.code, p.name, p.start_date, p.end_date, p.is_active ?? 1,
          p.grading_lock_date, p.is_locked ?? 0, p.finalized_at, finalizedBy, p.finalized_note]);
    }
    stats.periods = periods.length;

    // 6. axes
    const axes = db.prepare('SELECT * FROM axes').all();
    for (const a of axes) {
      await client.query(`
        INSERT INTO axes (id, code, name, max_score)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, max_score = EXCLUDED.max_score
      `, [a.id, a.code, a.name, a.max_score]);
    }
    stats.axes = axes.length;

    // 7. common_criteria
    const commonCriteria = db.prepare('SELECT * FROM common_criteria').all();
    for (const c of commonCriteria) {
      await client.query(`
        INSERT INTO common_criteria (id, group_no, group_name, code, title, max_score, target_role)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          group_no = EXCLUDED.group_no, group_name = EXCLUDED.group_name,
          code = EXCLUDED.code, title = EXCLUDED.title, max_score = EXCLUDED.max_score, target_role = EXCLUDED.target_role
      `, [c.id, c.group_no, c.group_name, c.code, c.title, c.max_score, c.target_role]);
    }
    stats.common_criteria = commonCriteria.length;

    // 8. standard_tasks
    const standardTasks = db.prepare('SELECT * FROM standard_tasks').all();
    for (const st of standardTasks) {
      await client.query(`
        INSERT INTO standard_tasks (id, period_id, dept_code, task_name, output_result, deadline,
                                    task_type, standard_score, difficulty_weight, max_converted_score,
                                    expected_evidence, note, axis_code, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          task_name = EXCLUDED.task_name, standard_score = EXCLUDED.standard_score,
          difficulty_weight = EXCLUDED.difficulty_weight, status = EXCLUDED.status,
          expected_evidence = EXCLUDED.expected_evidence, note = EXCLUDED.note,
          max_converted_score = EXCLUDED.max_converted_score
      `, [st.id, st.period_id, st.dept_code, st.task_name, st.output_result, st.deadline,
          st.task_type, st.standard_score, st.difficulty_weight, st.max_converted_score,
          st.expected_evidence, st.note, st.axis_code, st.status, st.created_at]);
    }
    stats.standard_tasks = standardTasks.length;

    // 9. documents
    const documents = db.prepare('SELECT * FROM documents').all();
    for (const doc of documents) {
      const createdBy = validUserIds.has(doc.created_by) ? doc.created_by : null;
      await client.query(`
        INSERT INTO documents (id, doc_number, doc_date, arrival_date, arrival_number, issuer,
                               doc_type, field, urgency, security_level, summary, file_url,
                               file_name, deadline, status, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE SET
          doc_number = EXCLUDED.doc_number, summary = EXCLUDED.summary, status = EXCLUDED.status,
          file_url = EXCLUDED.file_url, file_name = EXCLUDED.file_name, updated_at = EXCLUDED.updated_at
      `, [doc.id, doc.doc_number, doc.doc_date, doc.arrival_date, doc.arrival_number, doc.issuer,
          doc.doc_type, doc.field, doc.urgency, doc.security_level, doc.summary, doc.file_url,
          doc.file_name, doc.deadline, doc.status, createdBy, doc.created_at, doc.updated_at]);
    }
    stats.documents = documents.length;

    // 10. assigned_tasks
    const assignedTasks = db.prepare('SELECT * FROM assigned_tasks').all();
    for (const at of assignedTasks) {
      const assignedBy = validUserIds.has(at.assigned_by) ? at.assigned_by : null;
      await client.query(`
        INSERT INTO assigned_tasks (id, period_id, user_id, standard_task_id, task_name, output_result,
                                    deadline, task_type, standard_score, difficulty_weight, max_converted_score,
                                    axis_code, origin, status, actual_finish_date, evidence_text,
                                    evidence_file_url, evidence_file_name, quantity_pct, progress_pct,
                                    quality_pct, leadership_pct, execution_score, converted_score,
                                    cbql_comment, assigned_by, created_at, updated_at, group_id,
                                    is_bonus_proposed, bonus_score, bonus_reason, return_reason,
                                    is_returned, document_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
        ON CONFLICT (id) DO UPDATE SET
          task_name = EXCLUDED.task_name, status = EXCLUDED.status, execution_score = EXCLUDED.execution_score,
          converted_score = EXCLUDED.converted_score, evidence_file_url = EXCLUDED.evidence_file_url,
          actual_finish_date = EXCLUDED.actual_finish_date, evidence_text = EXCLUDED.evidence_text
      `, [at.id, at.period_id, at.user_id, at.standard_task_id, at.task_name, at.output_result,
          at.deadline, at.task_type, at.standard_score, at.difficulty_weight, at.max_converted_score,
          at.axis_code, at.origin, at.status, at.actual_finish_date, at.evidence_text,
          at.evidence_file_url, at.evidence_file_name, at.quantity_pct, at.progress_pct,
          at.quality_pct, at.leadership_pct, at.execution_score, at.converted_score,
          at.cbql_comment, assignedBy, at.created_at, at.updated_at, at.group_id,
          at.is_bonus_proposed ?? 0, at.bonus_score ?? 0, at.bonus_reason, at.return_reason,
          at.is_returned ?? 0, at.document_id]);
    }
    stats.assigned_tasks = assignedTasks.length;

    // 11. document_dispatches
    const dispatches = db.prepare('SELECT * FROM document_dispatches').all();
    for (const dd of dispatches) {
      const dispatchedBy = validUserIds.has(dd.dispatched_by) ? dd.dispatched_by : null;
      await client.query(`
        INSERT INTO document_dispatches (id, document_id, department_id, assigned_to_user_id,
                                         coordinating_user_ids, instruction, deadline, task_id,
                                         status, dispatched_by, dispatched_at, completed_at, completion_note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status, completed_at = EXCLUDED.completed_at, completion_note = EXCLUDED.completion_note
      `, [dd.id, dd.document_id, dd.department_id, dd.assigned_to_user_id,
          dd.coordinating_user_ids, dd.instruction, dd.deadline, dd.task_id,
          dd.status, dispatchedBy, dd.dispatched_at, dd.completed_at, dd.completion_note]);
    }
    stats.document_dispatches = dispatches.length;

    // 12. evaluations
    const evaluations = db.prepare('SELECT * FROM evaluations').all();
    for (const ev of evaluations) {
      const returnedBy = validUserIds.has(ev.returned_by) ? ev.returned_by : null;
      await client.query(`
        INSERT INTO evaluations (id, period_id, user_id, part1_score, part2_score, total_score,
                                 rank_proposed, superior_rank, superior_comment, status, updated_at,
                                 step, bonus_score, bonus_note, plan_total_max_score, executed_total_conv_score,
                                 summary_reason, cadre_proposal_note, return_reason, returned_at,
                                 returned_by, submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        ON CONFLICT (period_id, user_id) DO UPDATE SET
          total_score = EXCLUDED.total_score, status = EXCLUDED.status, step = EXCLUDED.step,
          superior_rank = EXCLUDED.superior_rank, updated_at = EXCLUDED.updated_at
      `, [ev.id, ev.period_id, ev.user_id, ev.part1_score, ev.part2_score, ev.total_score,
          ev.rank_proposed, ev.superior_rank, ev.superior_comment, ev.status, ev.updated_at,
          ev.step, ev.bonus_score, ev.bonus_note, ev.plan_total_max_score, ev.executed_total_conv_score,
          ev.summary_reason, ev.cadre_proposal_note, ev.return_reason, ev.returned_at,
          returnedBy, ev.submitted_at]);
    }
    stats.evaluations = evaluations.length;

    // 13. evaluation_criteria_details
    const critDetails = db.prepare('SELECT * FROM evaluation_criteria_details').all();
    for (const cd of critDetails) {
      await client.query(`
        INSERT INTO evaluation_criteria_details (id, evaluation_id, criteria_id, is_satisfied, score, note)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          is_satisfied = EXCLUDED.is_satisfied, score = EXCLUDED.score, note = EXCLUDED.note
      `, [cd.id, cd.evaluation_id, cd.criteria_id, cd.is_satisfied ?? 1, cd.score ?? 0, cd.note]);
    }
    stats.evaluation_criteria_details = critDetails.length;

    // 14. votes
    const votes = db.prepare('SELECT * FROM votes').all();
    for (const v of votes) {
      await client.query(`
        INSERT INTO votes (id, period_id, user_id, voter_id, vote_rank, comment, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (period_id, user_id, voter_id) DO UPDATE SET
          vote_rank = EXCLUDED.vote_rank, comment = EXCLUDED.comment
      `, [v.id, v.period_id, v.user_id, v.voter_id, v.vote_rank, v.comment, v.created_at]);
    }
    stats.votes = votes.length;

    return { success: true, stats, message: 'Đã sao lưu thành công toàn bộ dữ liệu lên Supabase Cloud' };
  } finally {
    client.release();
    await pool.end();
  }
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
    // 1. users
    const supUsers = await client.query('SELECT * FROM users');
    const insUser = db.prepare(`
      INSERT OR REPLACE INTO users (
        id, username, password, full_name, role, party_title, gov_title, dept_id,
        birth_date, gender, phone, email, is_active, target_role, role_id, manager_id,
        management_role, final_evaluator_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const u of supUsers.rows) {
        insUser.run(
          u.id, u.username, u.password, u.full_name, u.role, u.party_title, u.gov_title, u.dept_id,
          u.birth_date, u.gender, u.phone, u.email, u.is_active ? 1 : 0, u.target_role, u.role_id, u.manager_id,
          u.management_role || 'nhan_vien', u.final_evaluator_id
        );
      }
    })();
    stats.users = supUsers.rows.length;

    // 2. departments
    const supDepts = await client.query('SELECT * FROM departments');
    const insDept = db.prepare(`
      INSERT OR REPLACE INTO departments (
        id, code, name, parent_id, leader_id, is_active, description, parent_agency, location_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const d of supDepts.rows) {
        insDept.run(
          d.id, d.code, d.name, d.parent_id, d.leader_id, d.is_active ? 1 : 0, d.description,
          d.parent_agency, d.location_name
        );
      }
    })();
    stats.departments = supDepts.rows.length;

    // 3. standard_tasks
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
          t.id, t.period_id, t.dept_code, t.task_name, t.output_result, t.deadline,
          t.task_type, t.standard_score, t.difficulty_weight, t.max_converted_score,
          t.expected_evidence, t.note, t.axis_code, t.status, t.created_at
        );
      }
    })();
    stats.standard_tasks = supStdTasks.rows.length;

    // 4. assigned_tasks
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
        is_returned, document_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const t of supAssigned.rows) {
        insAssigned.run(
          t.id, t.period_id, t.user_id, t.standard_task_id, t.task_name, t.output_result,
          t.deadline, t.task_type, t.standard_score, t.difficulty_weight, t.max_converted_score,
          t.axis_code, t.origin, t.status, t.actual_finish_date, t.evidence_text,
          t.evidence_file_url, t.evidence_file_name, t.quantity_pct, t.progress_pct,
          t.quality_pct, t.leadership_pct, t.execution_score, t.converted_score,
          t.cbql_comment, t.assigned_by, t.created_at, t.updated_at, t.group_id,
          t.is_bonus_proposed ? 1 : 0, t.bonus_score || 0, t.bonus_reason, t.return_reason,
          t.is_returned ? 1 : 0, t.document_id
        );
      }
    })();
    stats.assigned_tasks = supAssigned.rows.length;

    // 5. evaluations
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
          e.id, e.period_id, e.user_id, e.part1_score, e.part2_score, e.total_score,
          e.rank_proposed, e.superior_rank, e.superior_comment, e.status, e.updated_at,
          e.step, e.bonus_score, e.bonus_note, e.plan_total_max_score, e.executed_total_conv_score,
          e.summary_reason, e.cadre_proposal_note, e.return_reason, e.returned_at,
          e.returned_by, e.submitted_at
        );
      }
    })();
    stats.evaluations = supEvals.rows.length;

    // 6. documents & dispatches
    const supDocs = await client.query('SELECT * FROM documents');
    const insDoc = db.prepare(`
      INSERT OR REPLACE INTO documents (
        id, doc_number, doc_date, arrival_date, arrival_number, issuer,
        doc_type, field, urgency, security_level, summary, file_url,
        file_name, deadline, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const doc of supDocs.rows) {
        insDoc.run(
          doc.id, doc.doc_number, doc.doc_date, doc.arrival_date, doc.arrival_number, doc.issuer,
          doc.doc_type, doc.field, doc.urgency, doc.security_level, doc.summary, doc.file_url,
          doc.file_name, doc.deadline, doc.status, doc.created_by, doc.created_at, doc.updated_at
        );
      }
    })();
    stats.documents = supDocs.rows.length;
    checkpointDatabase();

    return { success: true, stats, message: 'Đã khôi phục thành công CSDL từ Supabase về máy chủ' };
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = {
  isSupabaseConfigured,
  getSupabaseStatus,
  pushToSupabase,
  pullFromSupabase
};
