/**
 * SCRIPT ĐẨY DỮ LIỆU TỪ SQLITE LÊN SUPABASE (CHỦ ĐỘNG, KHÔNG TỰ ĐỘNG CHẠY)
 * Cách dùng:
 *   npm run db:push-supabase
 *   hoặc: node backend/push_to_supabase.js
 */

const { pushToSupabase, getSupabaseStatus } = require('./supabaseSync');

async function main() {
  console.log('===============================================================');
  console.log('  CHỦ ĐỘNG SAO LƯU DỮ LIỆU TỪ MÁY CHỦ LÊN SUPABASE CLOUD');
  console.log('  (Lưu ý: Quá trình này được tách biệt hoàn toàn khỏi update code)');
  console.log('===============================================================\n');

  const status = await getSupabaseStatus();
  if (!status.connected) {
    console.error('❌ Không thể kết nối tới Supabase:', status.message);
    process.exit(1);
  }

  console.log('✓ Kết nối Supabase thành công:', status.dbUrlMasked);
  console.log('Đang đồng bộ dữ liệu...');
  const res = await pushToSupabase();
  console.log('🎉 ' + res.message);
  console.log('Chi tiết số lượng bản ghi đã đồng bộ:');
  console.table(res.stats);
}

main().catch(err => {
  console.error('Lỗi sao lưu lên Supabase:', err);
  process.exit(1);
});
