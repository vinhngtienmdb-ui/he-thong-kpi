/**
 * Chuẩn hóa logic kiểm tra phân quyền người dùng trong toàn hệ thống KPI
 * Hỗ trợ cả vai trò hệ thống tĩnh (admin, cbql, cbnv) và phân quyền động (roles.permissions)
 */
export function getUserPermissions(user) {
  if (!user) {
    return {
      canAssignTasks: false,
      canGradeTasks: false,
      canConcludeEvaluation: false,
      canManageUsers: false,
      canManageSystem: false,
      canViewAllReports: false,
      isManager: false,
      isAdmin: false,
      isDeptAdmin: false,
      isCBNV: true
    };
  }

  let perms = {};
  try {
    perms = typeof user.permissions === 'string'
      ? JSON.parse(user.permissions || '{}')
      : (user.permissions || {});
  } catch (e) {
    perms = {};
  }

  const isSysAdmin = user.role === 'admin' || user.role_code === 'admin' || user.role_id === 'role-admin' || user.username === 'admin';
  const isDeptAdmin = user.role_code === 'admin_donvi' || user.role_id === 'role-admin-donvi';

  const userTitle = `${user.gov_title || ''} ${user.party_title || ''}`.toLowerCase();
  const leaderKeywords = [
    'hiệu trưởng', 'hiệu phó', 'phó hiệu trưởng', 'giám đốc', 'phó giám đốc', 
    'trưởng phòng', 'phó phòng', 'phó trưởng phòng', 'trưởng ban', 'phó ban', 
    'tổ trưởng', 'tổ phó', 'bí thư', 'phó bí thư', 'thường trực', 'thường vụ', 
    'chủ tịch', 'phó chủ tịch'
  ];
  const hasLeaderTitle = leaderKeywords.some(kw => userTitle.includes(kw));

  const isManagerByRole = user.role === 'cbql' || 
                          user.target_role === 'cbql' ||
                          user.management_role === 'lanh_dao' || 
                          user.management_role === 'quan_ly' || 
                          ['cbql_phong', 'ld_coquan', 'to_truong', 'hieu_pho'].includes(user.role_code) ||
                          hasLeaderTitle;

  const canAssignTasks = Boolean(isSysAdmin || isManagerByRole || perms.can_assign_tasks);
  const canGradeTasks = Boolean(isSysAdmin || isManagerByRole || perms.can_grade_tasks);
  const canConcludeEvaluation = Boolean(isSysAdmin || isManagerByRole || perms.can_conclude_evaluation);
  const canManageUsers = Boolean(isSysAdmin || isDeptAdmin || perms.can_manage_users);
  const canManageSystem = Boolean(isSysAdmin || perms.can_manage_system);
  const canViewAllReports = Boolean(
    isSysAdmin || 
    isDeptAdmin || 
    isManagerByRole || 
    perms.can_view_all_reports || 
    (user.data_scope && user.data_scope !== 'personal')
  );

  const isVanThu = Boolean(
    isSysAdmin ||
    perms.can_submit_documents === true ||
    userTitle.includes('văn thư') ||
    (user.username && user.username.toLowerCase().includes('vanthu'))
  );

  // Cán bộ nhân viên thuần túy (không có quyền quản lý hay quyền nâng cao nào)
  const isCBNV = !isSysAdmin && !isDeptAdmin && !isManagerByRole && 
                 !perms.can_assign_tasks && !perms.can_grade_tasks && 
                 !perms.can_conclude_evaluation && !perms.can_manage_users && 
                 !perms.can_manage_system && !perms.can_view_all_reports && !isVanThu;

  return {
    canAssignTasks,
    canGradeTasks,
    canConcludeEvaluation,
    canManageUsers,
    canManageSystem,
    canViewAllReports,
    canSubmitDocuments: isVanThu,
    isVanThu,
    isManager: isManagerByRole,
    isAdmin: isSysAdmin,
    isDeptAdmin,
    isCBNV
  };
}
