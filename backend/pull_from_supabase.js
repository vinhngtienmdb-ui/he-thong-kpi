/**
 * SCRIPT KHÔI PHỤC DỮ LIỆU TỪ SUPABASE VỀ SQLITE (CHỦ ĐỘNG)
 * Tự động tạo bản sao lưu snapshot trước khi khôi phục.
 * Cách dùng:
 *   npm run db:pull-supabase
 *   hoặc: node backend/pull_from_supabase.js
 */

const { pullFromSupabase, getSupabaseStatus } = require('./supabaseSync');

async function main() {
  console.log('===============================================================');
  console.log('  CHỦ ĐỘNG KHÔI PHỤC DỮ LIỆU TỪ SUPABASE CLOUD VỀ MÁY CHỦ');
  console.log('  (Đã tự động tạo snapshot dự phòng trong backend/backups/)');
  console.log('===============================================================\n');

  const status = await getSupabaseStatus();
  if (!status.connected) {
    console.error('❌ Không thể kết nối tới Supabase:', status.message);
    process.exit(1);
  }

  console.log('✓ Kết nối Supabase thành công:', status.dbUrlMasked);
  console.log('Đang kéo dữ liệu về máy...');
  const res = await pullFromSupabase();
  console.log('🎉 ' + res.message);
  console.log('Chi tiết số lượng bản ghi đã khôi phục:');
  console.table(res.stats);
}

main().catch(err => {
  console.error('Lỗi khôi phục từ Supabase:', err);
  process.exit(1);
});
