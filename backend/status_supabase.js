/**
 * SCRIPT KIỂM TRA TRẠNG THÁI CSDL SQLITE VS SUPABASE
 * Cách dùng:
 *   npm run db:status
 *   hoặc: node backend/status_supabase.js
 */

const { getSupabaseStatus } = require('./supabaseSync');

async function main() {
  console.log('===============================================================');
  console.log('  KIỂM TRA TRẠNG THÁI CSDL MÁY CHỦ (SQLITE) & ĐÁM MÂY (SUPABASE)');
  console.log('===============================================================\n');

  const status = await getSupabaseStatus();
  console.log('Supabase Connection:', status.connected ? 'ĐÃ KẾT NỐI' : 'CHƯA KẾT NỐI');
  console.log('URI:', status.dbUrlMasked || 'Chưa cấu hình');
  console.log('Thông báo:', status.message);

  const tableNames = Object.keys(status.sqliteCounts);
  const comparison = tableNames.map(t => ({
    'Bảng dữ liệu': t,
    'Máy chủ (SQLite)': status.sqliteCounts[t],
    'Đám mây (Supabase)': status.supabaseCounts ? (status.supabaseCounts[t] ?? 0) : 'N/A'
  }));

  console.log('\nSố lượng bản ghi hiện tại:');
  console.table(comparison);
}

main().catch(console.error);
