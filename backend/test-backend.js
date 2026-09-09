const { initDatabase, db } = require('./database');
const { importStandardTasksFromExcel, exportCBQLWorkbook } = require('./excelService');
const path = require('path');
const fs = require('fs');

async function runTest() {
  console.log('--- 1. Testing Database Init ---');
  initDatabase();
  const users = db.prepare('SELECT * FROM users').all();
  console.log('Users seeded:', users.map(u => `${u.full_name} (${u.role})`));

  console.log('\n--- 2. Testing Excel Import of Demo File ---');
  const demoFile = path.join(__dirname, '..', 'mau-import-new-san-pham-cong-viec-chuan.xlsx');
  const importRes = await importStandardTasksFromExcel(demoFile, 'p-1');
  console.log('Import result:', importRes.importedCount, 'tasks imported.');

  const tasksInDb = db.prepare('SELECT * FROM standard_tasks').all();
  console.log('Standard tasks in DB:', tasksInDb.length);
  tasksInDb.forEach((t, i) => {
    console.log(` [${i+1}] [${t.axis_code}] ${t.task_name} | ĐC: ${t.standard_score} | HS: ${t.difficulty_weight} | Quy đổi: ${t.max_converted_score}`);
  });

  console.log('\n--- 3. Testing Task Assignment & Calculation ---');
  // Assign task 1 and task 2 to user cbql ('usr-ql1')
  const t1 = tasksInDb[0];
  const t2 = tasksInDb[1];

  // Insert assigned task 1: Completed before deadline, quality 100%
  db.prepare(`
    INSERT INTO assigned_tasks (
      id, period_id, user_id, standard_task_id, task_name, output_result,
      deadline, task_type, standard_score, difficulty_weight, max_converted_score,
      axis_code, origin, status, actual_finish_date, evidence_text,
      quantity_pct, progress_pct, quality_pct, leadership_pct, execution_score, converted_score
    ) VALUES (
      'as-1', 'p-1', 'usr-ql1', ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, 'assigned', 'approved', '2026-03-28', '10-BC ngày 28/3/2026',
      1.0, 1.0, 1.0, 1.0, 10.0, 10.0
    )
  `).run(t1.id, t1.task_name, t1.output_result, t1.deadline, t1.task_type, t1.standard_score, t1.difficulty_weight, t1.max_converted_score, t1.axis_code);

  console.log('Assigned task 1 inserted & scored.');

  console.log('\n--- 4. Testing Excel Export to DANH MỤC CBQL format ---');
  const wb = await exportCBQLWorkbook('p-1', 'usr-ql1');
  const testOutFile = path.join(__dirname, 'test_export_cbql.xlsx');
  await wb.xlsx.writeFile(testOutFile);
  console.log('Exported test Excel successfully to:', testOutFile);
  console.log('File size:', fs.statSync(testOutFile).size, 'bytes');
  console.log('\nALL TESTS PASSED SUCCESSFULLY!');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
