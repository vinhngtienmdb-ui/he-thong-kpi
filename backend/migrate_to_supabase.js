/**
 * SCRIPT DI CHUYEN DU LIEU TU SQLITE SANG SUPABASE POSTGRESQL
 * Cach dung:
 *   DATABASE_URL="postgresql://postgres:[PASS]@[HOST]:[PORT]/postgres" node migrate_to_supabase.js
 * hoac cau hinh trong file .env roi chay:
 *   node migrate_to_supabase.js
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('\n❌ ERROR: Chua tim thay bien moi truong DATABASE_URL hoac SUPABASE_DB_URL!');
  console.log('\nHuong dan:');
  console.log('1. Mo file .env trong thu muc backend/');
  console.log('2. Them dong: DATABASE_URL="postgresql://postgres:[password]@db.[project_ref].supabase.co:5432/postgres"');
  console.log('3. Chay lai: node migrate_to_supabase.js\n');
  process.exit(1);
}

const sqlitePath = path.join(__dirname, 'kpi.db');
const sqlite = new Database(sqlitePath);
const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('===============================================================');
  console.log('  BAT DAU DI CHUYEN DU LIEU TU SQLITE SANG SUPABASE (POSTGRESQL)');
  console.log('===============================================================');

  const client = await pool.connect();
  try {
    console.log('✓ Da ket noi thanh cong den Supabase PostgreSQL!\n');

    // 1. system_configs
    const configs = sqlite.prepare('SELECT * FROM system_configs').all();
    for (const row of configs) {
      await client.query(`
        INSERT INTO system_configs (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description
      `, [row.key, row.value, row.description]);
    }
    console.log(`✓ system_configs: Da dong bo ${configs.length} ban ghi`);

    // 2. roles
    const roles = sqlite.prepare('SELECT * FROM roles').all();
    for (const r of roles) {
      await client.query(`
        INSERT INTO roles (id, code, name, description, data_scope, permissions, is_system, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code, name = EXCLUDED.name, description = EXCLUDED.description,
          data_scope = EXCLUDED.data_scope, permissions = EXCLUDED.permissions
      `, [r.id, r.code, r.name, r.description, r.data_scope, r.permissions, r.is_system, r.created_at]);
    }
    console.log(`✓ roles: Da dong bo ${roles.length} ban ghi`);

    // 3. departments (First pass: without foreign keys)
    const depts = sqlite.prepare('SELECT * FROM departments').all();
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
    console.log(`✓ departments: Da dong bo ${depts.length} ban ghi`);

    // 4. users
    const users = sqlite.prepare('SELECT * FROM users').all();
    for (const u of users) {
      await client.query(`
        INSERT INTO users (id, username, password, full_name, role, party_title, gov_title, dept_id,
                           birth_date, gender, phone, email, is_active, target_role, role_id, manager_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username, password = EXCLUDED.password, full_name = EXCLUDED.full_name,
          role = EXCLUDED.role, party_title = EXCLUDED.party_title, gov_title = EXCLUDED.gov_title,
          dept_id = EXCLUDED.dept_id, birth_date = EXCLUDED.birth_date, gender = EXCLUDED.gender,
          phone = EXCLUDED.phone, email = EXCLUDED.email, is_active = EXCLUDED.is_active,
          target_role = EXCLUDED.target_role, role_id = EXCLUDED.role_id, manager_id = EXCLUDED.manager_id
      `, [u.id, u.username, u.password, u.full_name, u.role, u.party_title, u.gov_title, u.dept_id,
          u.birth_date, u.gender, u.phone, u.email, u.is_active ?? 1, u.target_role, u.role_id, u.manager_id]);
    }
    console.log(`✓ users: Da dong bo ${users.length} ban ghi`);

    const validUserIds = new Set(users.map(u => u.id));

    // Update departments parent_id and leader_id now that users exist
    for (const d of depts) {
      if (d.parent_id || d.leader_id) {
        const leaderId = validUserIds.has(d.leader_id) ? d.leader_id : null;
        await client.query(`
          UPDATE departments SET parent_id = $1, leader_id = $2 WHERE id = $3
        `, [d.parent_id || null, leaderId, d.id]);
      }
    }
    console.log(`✓ departments: Da cap nhat lien ket leader_id & parent_id`);

    // 5. periods
    const periods = sqlite.prepare('SELECT * FROM periods').all();
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
    console.log(`✓ periods: Da dong bo ${periods.length} ban ghi`);

    // 6. axes
    const axes = sqlite.prepare('SELECT * FROM axes').all();
    for (const a of axes) {
      await client.query(`
        INSERT INTO axes (id, code, name, max_score)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, max_score = EXCLUDED.max_score
      `, [a.id, a.code, a.name, a.max_score]);
    }
    console.log(`✓ axes: Da dong bo ${axes.length} ban ghi`);

    // 7. common_criteria
    const commonCriteria = sqlite.prepare('SELECT * FROM common_criteria').all();
    for (const c of commonCriteria) {
      await client.query(`
        INSERT INTO common_criteria (id, group_no, group_name, code, title, max_score, target_role)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          group_no = EXCLUDED.group_no, group_name = EXCLUDED.group_name,
          code = EXCLUDED.code, title = EXCLUDED.title, max_score = EXCLUDED.max_score, target_role = EXCLUDED.target_role
      `, [c.id, c.group_no, c.group_name, c.code, c.title, c.max_score, c.target_role]);
    }
    console.log(`✓ common_criteria: Da dong bo ${commonCriteria.length} ban ghi`);

    // 8. standard_tasks
    const standardTasks = sqlite.prepare('SELECT * FROM standard_tasks').all();
    for (const st of standardTasks) {
      await client.query(`
        INSERT INTO standard_tasks (id, period_id, dept_code, task_name, output_result, deadline,
                                    task_type, standard_score, difficulty_weight, max_converted_score,
                                    expected_evidence, note, axis_code, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          task_name = EXCLUDED.task_name, standard_score = EXCLUDED.standard_score,
          difficulty_weight = EXCLUDED.difficulty_weight, status = EXCLUDED.status
      `, [st.id, st.period_id, st.dept_code, st.task_name, st.output_result, st.deadline,
          st.task_type, st.standard_score, st.difficulty_weight, st.max_converted_score,
          st.expected_evidence, st.note, st.axis_code, st.status, st.created_at]);
    }
    console.log(`✓ standard_tasks: Da dong bo ${standardTasks.length} ban ghi`);

    // 9. documents
    const documents = sqlite.prepare('SELECT * FROM documents').all();
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
    console.log(`✓ documents: Da dong bo ${documents.length} ban ghi`);

    // 10. assigned_tasks
    const assignedTasks = sqlite.prepare('SELECT * FROM assigned_tasks').all();
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
          converted_score = EXCLUDED.converted_score, evidence_file_url = EXCLUDED.evidence_file_url
      `, [at.id, at.period_id, at.user_id, at.standard_task_id, at.task_name, at.output_result,
          at.deadline, at.task_type, at.standard_score, at.difficulty_weight, at.max_converted_score,
          at.axis_code, at.origin, at.status, at.actual_finish_date, at.evidence_text,
          at.evidence_file_url, at.evidence_file_name, at.quantity_pct, at.progress_pct,
          at.quality_pct, at.leadership_pct, at.execution_score, at.converted_score,
          at.cbql_comment, assignedBy, at.created_at, at.updated_at, at.group_id,
          at.is_bonus_proposed ?? 0, at.bonus_score ?? 0, at.bonus_reason, at.return_reason,
          at.is_returned ?? 0, at.document_id]);
    }
    console.log(`✓ assigned_tasks: Da dong bo ${assignedTasks.length} ban ghi`);

    // 11. document_dispatches
    const dispatches = sqlite.prepare('SELECT * FROM document_dispatches').all();
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
    console.log(`✓ document_dispatches: Da dong bo ${dispatches.length} ban ghi`);

    // 12. evaluations
    const evaluations = sqlite.prepare('SELECT * FROM evaluations').all();
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
    console.log(`✓ evaluations: Da dong bo ${evaluations.length} ban ghi`);

    // 13. evaluation_criteria_details
    const critDetails = sqlite.prepare('SELECT * FROM evaluation_criteria_details').all();
    for (const cd of critDetails) {
      await client.query(`
        INSERT INTO evaluation_criteria_details (id, evaluation_id, criteria_id, is_satisfied, score, note)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET is_satisfied = EXCLUDED.is_satisfied, score = EXCLUDED.score, note = EXCLUDED.note
      `, [cd.id, cd.evaluation_id, cd.criteria_id, cd.is_satisfied, cd.score, cd.note]);
    }
    console.log(`✓ evaluation_criteria_details: Da dong bo ${critDetails.length} ban ghi`);

    // 14. votes
    const votes = sqlite.prepare('SELECT * FROM votes').all();
    for (const v of votes) {
      await client.query(`
        INSERT INTO votes (id, period_id, user_id, voter_id, vote_rank, comment, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (period_id, user_id, voter_id) DO UPDATE SET
          vote_rank = EXCLUDED.vote_rank, comment = EXCLUDED.comment, created_at = EXCLUDED.created_at
      `, [v.id, v.period_id, v.user_id, v.voter_id, v.vote_rank, v.comment, v.created_at]);
    }
    console.log(`✓ votes: Da dong bo ${votes.length} ban ghi`);

    console.log('\n===============================================================');
    console.log('🎉 CHUC MUNG! DI CHUYEN DU LIEU SANG SUPABASE HOAN TAT 100%!');
    console.log('===============================================================\n');
  } catch (err) {
    console.error('\n❌ LOI TRONG QUA TRINH DI CHUYEN DU LIEU:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
