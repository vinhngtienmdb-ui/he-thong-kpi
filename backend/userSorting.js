/**
 * Tien ich sap xep nguoi dung theo thu tu uu tien:
 * 1. Chuc vu: Lanh dao -> Quan ly -> Giao vien -> Nhan vien -> Quan tri/Khac
 * 2. Ten: Sap xep theo ten chinh (khong theo ho va chu lot) theo bang chu cai tieng Viet
 */

function getUserPositionRank(user) {
  if (!user) return 99;
  const title = (user.gov_title || '').toLowerCase().trim();
  const mgmt = (user.management_role || '').toLowerCase().trim();
  const role = (user.role || '').toLowerCase().trim();
  const targetRole = (user.target_role || '').toLowerCase().trim();

  const isDeputy = title.includes('phó') || mgmt === 'quan_ly' || mgmt === 'to_truong';

  // 1. Lãnh đạo
  if (!isDeputy && (
    mgmt === 'lanh_dao' ||
    role === 'ld_coquan' ||
    title.includes('hiệu trưởng') ||
    title.includes('trưởng ban') ||
    title.includes('giám đốc') ||
    title.includes('thủ trưởng') ||
    title.includes('bí thư')
  )) {
    return 1;
  }

  // 2. Quản lý
  if (
    isDeputy ||
    mgmt === 'quan_ly' ||
    mgmt === 'to_truong' ||
    role === 'cbql' ||
    role === 'cbql_phong' ||
    role === 'to_truong' ||
    role === 'hieu_pho' ||
    title.includes('phó') ||
    title.includes('tổ trưởng') ||
    title.includes('tổ phó') ||
    title.includes('quản lý')
  ) {
    return 2;
  }

  // 3. Giáo viên
  if (title.includes('giáo viên') || title.includes('gv')) {
    return 3;
  }

  // 4. Nhân viên
  if (
    role === 'cbnv' ||
    targetRole === 'cbnv' ||
    mgmt === 'nhan_vien' ||
    title.includes('nhân viên') ||
    title.includes('chuyên viên') ||
    title.includes('kế toán') ||
    title.includes('văn thư') ||
    title.includes('thủ quỹ') ||
    title.includes('y tế') ||
    title.includes('bảo vệ') ||
    title.includes('tạp vụ') ||
    title.includes('phục vụ')
  ) {
    return 4;
  }

  // 5. Tài khoản Quản trị / Khác
  if (role === 'admin' || targetRole === 'admin' || targetRole === 'admin_donvi') {
    return 5;
  }

  return 4;
}

function getVietnameseSortKey(fullName) {
  if (!fullName) return { givenName: '', rest: '' };
  const parts = fullName.trim().split(/\s+/);
  const givenName = parts[parts.length - 1] || '';
  const rest = parts.slice(0, -1).join(' ');
  return { givenName, rest };
}

function compareUsersByPositionAndName(a, b) {
  const rankA = getUserPositionRank(a);
  const rankB = getUserPositionRank(b);
  if (rankA !== rankB) {
    return rankA - rankB;
  }

  const keyA = getVietnameseSortKey(a.full_name);
  const keyB = getVietnameseSortKey(b.full_name);

  // Ưu tiên sắp xếp theo tên chính
  const nameCmp = keyA.givenName.localeCompare(keyB.givenName, 'vi', { sensitivity: 'base' });
  if (nameCmp !== 0) {
    return nameCmp;
  }

  // Nếu trùng tên, so sánh họ và chữ lót
  return keyA.rest.localeCompare(keyB.rest, 'vi', { sensitivity: 'base' });
}

module.exports = {
  getUserPositionRank,
  getVietnameseSortKey,
  compareUsersByPositionAndName
};
