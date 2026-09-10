import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  FileText,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  Lock,
  Unlock,
  Trash2,
  Eye,
  EyeOff,
  Shield,
  Building2,
  User,
  Sparkles
} from 'lucide-react';
import { api } from '../api';

export default function UsersManagementTab({ currentUser, departments = [], onReloadUsers }) {
  const canManage = currentUser?.role === 'admin' || currentUser?.role_code === 'admin_donvi';
  if (currentUser && !canManage) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center">
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Truy cập bị từ chối (403 Forbidden)</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Bạn không có quyền quản lý người dùng và phân quyền hệ thống. Phân hệ này chỉ dành riêng cho Quản trị viên (Admin).
          </p>
          <div className="pt-2">
            <span className="inline-block px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">
              Tài khoản hiện tại: {currentUser?.full_name} ({currentUser?.role?.toUpperCase()})
            </span>
          </div>
        </div>
      </div>
    );
  }

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterDept, setFilterDept] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    dept_id: '',
    role_id: '',
    manager_id: '',
    final_evaluator_id: '',
    management_role: 'nhan_vien',
    role: 'cbnv',
    target_role: 'cbnv',
    party_title: 'Đảng viên',
    gov_title: 'Chuyên viên',
    phone: '',
    email: '',
    is_active: 1
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Import Excel Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  const openImportModal = () => {
    setImportFile(null);
    setUpdateExisting(true);
    setImportResult(null);
    setImportError('');
    setIsImportModalOpen(true);
  };

  // Reset Password Modal state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('123456');
  const [showResetPass, setShowResetPass] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');
  const [resetErrorMessage, setResetErrorMessage] = useState('');

  const openResetPasswordModal = (user) => {
    setResettingUser(user);
    setResetPasswordInput('123456');
    setShowResetPass(false);
    setResetSuccessMessage('');
    setResetErrorMessage('');
    setIsResetModalOpen(true);
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resettingUser) return;
    if (!resetPasswordInput || resetPasswordInput.trim().length < 6) {
      setResetErrorMessage('Mật khẩu cấp mới phải có tối thiểu 6 ký tự');
      return;
    }

    setResetLoading(true);
    setResetErrorMessage('');
    setResetSuccessMessage('');
    try {
      const res = await api.resetAdminUserPassword(resettingUser.id, {
        new_password: resetPasswordInput.trim()
      });
      setResetSuccessMessage(res.message || `Đã cấp lại mật khẩu cho cán bộ "${resettingUser.full_name}" thành công!`);
      setTimeout(() => {
        setIsResetModalOpen(false);
        setResettingUser(null);
        setResetSuccessMessage('');
      }, 2000);
    } catch (err) {
      setResetErrorMessage(err.message || 'Có lỗi xảy ra khi cấp lại mật khẩu');
    } finally {
      setResetLoading(false);
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) {
      setImportError('Vui lòng chọn file Excel (.xlsx)');
      return;
    }
    try {
      setImporting(true);
      setImportError('');
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('update_existing', updateExisting);
      const vId = currentUser?.id || (api.getViewerId ? api.getViewerId() : null);
      if (vId) {
        fd.append('viewer_id', vId);
      }

      const res = await api.importAdminUsers(fd);
      setImportResult(res);
      await loadInitialData();
      if (onReloadUsers) onReloadUsers();
    } catch (err) {
      setImportError(err.message || 'Lỗi xử lý file Excel');
    } finally {
      setImporting(false);
    }
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [usersData, rolesData] = await Promise.all([
        api.getAdminUsers(),
        api.getRoles()
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (err) {
      console.error(err);
      setErrorMsg('Không thể tải danh sách CBNV: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleRoleChange = (selRoleId) => {
    const selRole = roles.find(r => r.id === selRoleId);
    let newRole = 'cbnv';
    let newTgtRole = formData.target_role || 'cbnv';
    if (selRole?.code === 'admin' || selRole?.code === 'admin_donvi') {
      newRole = 'admin';
      newTgtRole = 'admin';
    } else if (selRole?.code === 'cbql_phong' || selRole?.code === 'ld_coquan' || selRole?.code === 'hieu_pho' || selRole?.data_scope === 'dept_tree' || selRole?.data_scope === 'all') {
      newRole = 'cbql';
      newTgtRole = (formData.target_role && formData.target_role !== 'admin') ? formData.target_role : 'cbql';
    } else if (selRole?.code === 'to_truong' || selRole?.data_scope === 'subordinates') {
      newRole = 'cbql';
      newTgtRole = (formData.target_role && formData.target_role !== 'admin') ? formData.target_role : 'cbnv';
    } else {
      newRole = 'cbnv';
      newTgtRole = (formData.target_role && formData.target_role !== 'admin') ? formData.target_role : 'cbnv';
    }
    setFormData(prev => ({
      ...prev,
      role_id: selRoleId,
      role: newRole,
      target_role: newTgtRole
    }));
  };

  const openAddModal = () => {
    setEditingUser(null);
    const defaultRoleId = roles.find(r => r.code === 'cbnv')?.id || roles[0]?.id || '';
    setFormData({
      username: '',
      password: '',
      full_name: '',
      dept_id: departments[0]?.id || '',
      role_id: defaultRoleId,
      manager_id: '',
      final_evaluator_id: '',
      management_role: 'nhan_vien',
      role: 'cbnv',
      target_role: 'cbnv',
      party_title: 'Đảng viên',
      gov_title: 'Chuyên viên',
      birth_date: '1990-01-01',
      gender: 'Nam',
      phone: '',
      email: '',
      is_active: 1
    });
    setErrorMsg('');
    setSuccessMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    const isExempt = user.role === 'admin' || user.role === 'admin_donvi' || user.role_code === 'admin_donvi' || user.role_id === 'role-admin-donvi';
    setFormData({
      username: user.username,
      password: '',
      full_name: user.full_name,
      dept_id: user.dept_id || '',
      role_id: user.role_id || roles.find(r => r.code === user.role)?.id || '',
      manager_id: user.manager_id || '',
      final_evaluator_id: user.final_evaluator_id || '',
      management_role: user.management_role || (user.role === 'cbql' ? 'quan_ly' : 'nhan_vien'),
      role: user.role || 'cbnv',
      target_role: isExempt ? 'admin' : (user.target_role || (user.role === 'cbnv' ? 'cbnv' : 'cbql')),
      party_title: user.party_title || '',
      gov_title: user.gov_title || '',
      birth_date: user.birth_date || '1990-01-01',
      gender: user.gender || 'Nam',
      phone: user.phone || '',
      email: user.email || '',
      is_active: user.is_active !== 0 ? 1 : 0
    });
    setErrorMsg('');
    setSuccessMsg('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (editingUser) {
        await api.updateAdminUser(editingUser.id, formData);
        setSuccessMsg('Cập nhật thông tin cán bộ thành công');
      } else {
        if (!formData.username || !formData.password || !formData.full_name) {
          setErrorMsg('Vui lòng điền đủ Tên đăng nhập, Mật khẩu và Họ tên');
          return;
        }
        await api.createAdminUser(formData);
        setSuccessMsg('Thêm mới cán bộ thành công');
      }
      setIsModalOpen(false);
      await loadInitialData();
      if (onReloadUsers) onReloadUsers();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleToggleStatus = async (user, newStatus) => {
    const actionText = newStatus === 1 ? 'mở khoá và kích hoạt lại' : 'khoá / ngừng kích hoạt';
    if (!window.confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản cán bộ "${user.full_name}"?`)) return;
    try {
      await api.toggleAdminUserStatus(user.id, newStatus);
      await loadInitialData();
      if (onReloadUsers) onReloadUsers();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handlePermanentDelete = async (user) => {
    const confirmMsg = `CẢNH BÁO XOÁ VĨNH VIỄN:\n\nBạn có chắc chắn muốn xoá hoàn toàn tài khoản cán bộ "${user.full_name}" (${user.username}) khỏi hệ thống và đồng bộ Supabase Cloud?\n\n- Toàn bộ nhiệm vụ phân công và dữ liệu đánh giá kiểm thử liên quan sẽ được dọn dẹp triệt để.\n- Thao tác này KHÔNG THỂ khôi phục!`;
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await api.deleteAdminUser(user.id, true);
      alert(res.message || 'Đã xoá vĩnh viễn tài khoản cán bộ thành công');
      await loadInitialData();
      if (onReloadUsers) onReloadUsers();
    } catch (err) {
      alert('Lỗi khi xoá: ' + err.message);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'ALL' || u.role === filterRole;
    const matchesDept = filterDept === 'ALL' || u.dept_id === filterDept;
    const matchesStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'ACTIVE' && (u.is_active === 1 || u.is_active === undefined || u.is_active === null)) ||
      (filterStatus === 'INACTIVE' && u.is_active === 0);
    return matchesSearch && matchesRole && matchesDept && matchesStatus;
  });

  const selectedRoleObj = roles.find(r => r.id === formData.role_id);
  const isSelectedRoleExempt = 
    formData.role === 'admin' || 
    formData.target_role === 'admin' || 
    selectedRoleObj?.code === 'admin' || 
    selectedRoleObj?.code === 'admin_donvi';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Quản lý Phân quyền Hệ thống
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Quản lý danh sách cán bộ, phân công vai trò (Admin, CBQL, CBNV) và mẫu đánh giá áp dụng (Mẫu 01-A, Mẫu 01-B).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={api.getUserTemplateUrl()}
            download="Mau_nhap_danh_sach_can_bo_KPI.xlsx"
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3.5 py-2.5 rounded-lg border border-slate-300 transition shadow-xs cursor-pointer"
            title="Tải file mẫu Excel chuẩn để nhập dữ liệu"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Tải file mẫu Excel</span>
          </a>

          <button
            type="button"
            onClick={openImportModal}
            className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3.5 py-2.5 rounded-lg shadow-xs transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-white" />
            <span>Nhập từ Excel</span>
          </button>

          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2.5 rounded-lg shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Thêm cán bộ mới</span>
          </button>
        </div>
      </div>

      {/* Permission Matrix Guide Card */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-indigo-900 uppercase tracking-wider mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Ma trận phân quyền & Mẫu đánh giá theo Hướng dẫn số 06-HD/BTCTU
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-white p-3.5 rounded-lg border border-indigo-200/60 shadow-xs space-y-1.5">
            <div className="font-bold text-slate-900 text-sm flex items-center justify-between">
              <span className="text-rose-700">1. Quản trị viên (Admin)</span>
              <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[11px]">Toàn quyền</span>
            </div>
            <p className="text-slate-600">• Quản lý tài khoản, phòng ban, phân quyền người dùng.</p>
            <p className="text-slate-600">• Cấu hình chu kỳ đánh giá (Quý I - IV) và công thức tính HD.06.</p>
            <p className="text-slate-600">• Giám sát và tổng hợp báo cáo KPI toàn hệ thống.</p>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-indigo-200/60 shadow-xs space-y-1.5">
            <div className="font-bold text-slate-900 text-sm flex items-center justify-between">
              <span className="text-blue-700">2. Lãnh đạo, Quản lý (CBQL)</span>
              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[11px]">Mẫu 01-A</span>
            </div>
            <p className="text-slate-600">• Giao việc cho CBNV (cùng 1 việc có thể giao nhiều người).</p>
            <p className="text-slate-600">• Phê duyệt công việc đăng ký & thẩm định minh chứng.</p>
            <p className="text-slate-600">• Chấm điểm chất lượng (70%) và đề xuất thưởng 5%.</p>
            <p className="text-slate-600">• Đánh giá Mẫu 01-A (17 tiêu chí) & Phê duyệt Mẫu 02.</p>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-indigo-200/60 shadow-xs space-y-1.5">
            <div className="font-bold text-slate-900 text-sm flex items-center justify-between">
              <span className="text-emerald-700">3. Chuyên viên, CBNV</span>
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[11px]">Mẫu 01-B</span>
            </div>
            <p className="text-slate-600">• Nhận việc được phân công hoặc tự đăng ký công việc.</p>
            <p className="text-slate-600">• Cập nhật tiến độ, nộp minh chứng (văn bản, link file, kết quả).</p>
            <p className="text-slate-600">• Tự chấm điểm Phần Đạo đức chính trị (30đ - 16 tiêu chí).</p>
            <p className="text-slate-600">• Đề xuất xếp loại bản thân theo Mẫu 01-B.</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1 min-w-[280px]">
          <div className="relative">
            <input
              type="text"
              placeholder="Tìm kiếm theo họ tên, tên đăng nhập..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <svg className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">Tất cả Phòng / Ban</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">Tất cả vai trò</option>
            <option value="admin">Quản trị viên (Admin)</option>
            <option value="cbql">Lãnh đạo, Quản lý (CBQL)</option>
            <option value="cbnv">Cán bộ, Nhân viên (CBNV)</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="INACTIVE">Đã khoá / Vô hiệu hoá</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 text-xs font-semibold uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5 w-14 text-center">STT</th>
                <th className="px-4 py-3.5 min-w-[220px]">Họ và tên / Tài khoản</th>
                <th className="px-4 py-3.5 min-w-[180px]">Đơn vị / Phòng ban</th>
                <th className="px-4 py-3.5 min-w-[220px]">Tuyến Quản lý & Đánh giá</th>
                <th className="px-4 py-3.5 min-w-[200px]">Cấp bậc CBQL & Chức vụ</th>
                <th className="px-4 py-3.5 min-w-[210px] text-center">Vai trò & Phạm vi</th>
                <th className="px-4 py-3.5 min-w-[140px] text-center">Mẫu đánh giá</th>
                <th className="px-4 py-3.5 min-w-[130px] text-center">Trạng thái</th>
                <th className="px-4 py-3.5 text-center min-w-[120px] w-32">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="9" className="text-center py-10 text-slate-400">
                    Đang tải danh sách cán bộ...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-10 text-slate-400">
                    Không tìm thấy cán bộ nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, idx) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3.5 text-center font-medium text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900 text-sm">{u.full_name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">@{u.username} {u.phone ? `• 📞 ${u.phone}` : ''}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800">
                        {u.dept_name || 'Chưa phân bổ'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-slate-400 font-normal">Trực tiếp:</span>
                          {u.manager_name ? (
                            <span className="font-semibold text-slate-800">👔 {u.manager_name}</span>
                          ) : (
                            <span className="text-slate-400 italic">Trực thuộc Lãnh đạo CQ</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-indigo-700">
                          <span className="text-slate-400 font-normal">ĐG cuối:</span>
                          {u.final_evaluator_name ? (
                            <span className="font-semibold text-indigo-900">👑 {u.final_evaluator_name}</span>
                          ) : (
                            <span className="text-slate-500 italic">Theo phân cấp Lãnh đạo</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="space-y-1">
                        <div>
                          {u.management_role === 'lanh_dao' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              👑 Lãnh đạo (Người đứng đầu)
                            </span>
                          ) : u.management_role === 'quan_ly' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              ⭐ Quản lý (Cấp phó)
                            </span>
                          ) : u.management_role === 'to_truong' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              🏷️ Tổ trưởng chuyên môn
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                              👤 Cán bộ, Nhân viên
                            </span>
                          )}
                        </div>
                        <div className="text-slate-800 font-medium text-xs">{u.gov_title || 'Chuyên viên'}</div>
                        <div className="text-[11px] text-slate-500">{u.party_title || 'Đảng viên'}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className="font-bold text-slate-900 text-xs">
                          {u.role_name || (u.role === 'admin' ? 'Quản trị viên' : u.role === 'cbql' ? 'Lãnh đạo (CBQL)' : 'Cán bộ nhân viên')}
                        </span>
                        <span className={`mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          u.role_code === 'admin_donvi' || u.role_id === 'role-admin-donvi'
                            ? 'bg-purple-100 text-purple-800 border-purple-200'
                            : u.data_scope === 'all' || u.role === 'admin' 
                            ? 'bg-rose-100 text-rose-800 border-rose-200' 
                            : u.data_scope === 'dept_tree' || u.role === 'cbql'
                            ? 'bg-blue-100 text-blue-800 border-blue-200'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}>
                          {u.role_code === 'admin_donvi' || u.role_id === 'role-admin-donvi' ? 'Quản trị đơn vị' :
                           u.data_scope === 'all' || u.role === 'admin' ? 'Toàn cơ quan' :
                           u.data_scope === 'dept_tree' || u.role === 'cbql' ? 'Đơn vị & trực thuộc' :
                           u.data_scope === 'subordinates' ? 'Tuyến cấp dưới' : 'Chỉ cá nhân'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {u.role === 'admin' || u.role_code === 'admin_donvi' || u.role_id === 'role-admin-donvi' || u.target_role === 'admin' ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
                          ⚙️ Không đánh giá (TK Chức năng)
                        </span>
                      ) : u.target_role === 'cbql' || (u.role === 'cbql' && u.target_role !== 'cbnv') ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          Mẫu 01-A (CBQL)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold bg-teal-100 text-teal-900 border border-teal-300">
                          Mẫu 01-B (CBNV)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {u.is_active !== 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          Đang hoạt động
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
                          <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                          Đã khoá
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded transition"
                          title="Chỉnh sửa thông tin"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openResetPasswordModal(u)}
                          className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition"
                          title="Cấp lại mật khẩu"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {u.id !== currentUser?.id && (
                          <>
                            {u.is_active !== 0 ? (
                              <button
                                onClick={() => handleToggleStatus(u, 0)}
                                className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition cursor-pointer"
                                title="Khoá tài khoản cán bộ"
                              >
                                <Lock className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleStatus(u, 1)}
                                className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition cursor-pointer"
                                title="Mở khoá / kích hoạt lại tài khoản"
                              >
                                <Unlock className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handlePermanentDelete(u)}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition cursor-pointer"
                              title="Xoá vĩnh viễn khỏi hệ thống & Supabase"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-3xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-300">
                  {editingUser ? <User className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editingUser ? `Hồ sơ cán bộ: ${editingUser.full_name}` : 'Thêm Cán bộ Mới vào Hệ thống'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {editingUser 
                      ? `Tài khoản: @${editingUser.username} • Đơn vị: ${editingUser.dept_name || 'Chưa phân bổ'}` 
                      : 'Nhập thông tin tài khoản, phân cấp quản lý và hồ sơ cá nhân'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/60">
                {errorMsg && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* SECTION 1: TÀI KHOẢN & PHÂN QUYỀN HỆ THỐNG */}
                <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Shield className="w-4.5 h-4.5 text-indigo-600" />
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                      1. Tài khoản & Phân quyền Hệ thống
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Tên đăng nhập <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        disabled={Boolean(editingUser)}
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        className={`w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-medium ${editingUser ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                        placeholder="vd: vinhnt"
                      />
                      {editingUser && <p className="text-[11px] text-slate-400 mt-1">Tên đăng nhập cố định, không thể thay đổi</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mật khẩu {editingUser ? <span className="text-slate-400 font-normal">(để trống nếu không đổi)</span> : <span className="text-rose-500">*</span>}
                      </label>
                      <input
                        type="password"
                        required={!editingUser}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder={editingUser ? '••••••••' : 'Nhập mật khẩu (tối thiểu 6 ký tự)'}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Vai trò hệ thống & Quyền hạn dữ liệu <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={formData.role_id}
                        onChange={(e) => handleRoleChange(e.target.value)}
                        className="w-full px-3.5 py-2 border border-indigo-200 bg-indigo-50/20 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.data_scope === 'all' ? 'Toàn cơ quan' : r.data_scope === 'dept_tree' ? 'Đơn vị & trực thuộc' : r.data_scope === 'subordinates' ? 'Cấp dưới' : 'Cá nhân'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mẫu đánh giá KPI áp dụng
                      </label>
                      {isSelectedRoleExempt ? (
                        <div className="px-3.5 py-2 border border-purple-200 bg-purple-50 text-purple-800 rounded-lg text-xs font-bold flex items-center gap-1.5 h-[38px]">
                          <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                          <span>⚙️ Miễn đánh giá (Tài khoản chức năng / Quản trị)</span>
                        </div>
                      ) : (
                        <select
                          value={formData.target_role}
                          onChange={(e) => setFormData({ ...formData, target_role: e.target.value })}
                          className="w-full px-3.5 py-2 border border-amber-200 bg-amber-50/50 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-semibold text-amber-900"
                        >
                          <option value="cbnv">Mẫu 01-B: CBNV (16 tiêu chí)</option>
                          <option value="cbql">Mẫu 01-A: Lãnh đạo/QL (17 tiêu chí)</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Banner hướng dẫn đặc quyền tài khoản quản trị chức năng */}
                  {isSelectedRoleExempt && (
                    <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-lg text-xs text-purple-900 flex items-start gap-2">
                      <span className="text-base leading-none">ℹ️</span>
                      <div>
                        <span className="font-bold">Tài khoản Quản trị chức năng:</span> Tài khoản phục vụ quản lý nhân sự và danh mục công việc. Được <strong className="underline font-bold">miễn tham gia tự đánh giá, chấm điểm và biểu quyết xếp loại KPI</strong>.
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Trạng thái hoạt động tài khoản
                    </label>
                    <select
                      value={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: parseInt(e.target.value) })}
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value={1}>✅ Đang hoạt động bình thường</option>
                      <option value={0}>⛔ Tạm khóa / Vô hiệu hóa tài khoản</option>
                    </select>
                  </div>
                </div>

                {/* SECTION 2: TỔ CHỨC & TUYẾN QUẢN LÝ */}
                <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Building2 className="w-4.5 h-4.5 text-blue-600" />
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                      2. Đơn vị công tác & Tuyến Quản lý
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Đơn vị / Phòng ban công tác <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={formData.dept_id}
                        onChange={(e) => setFormData({ ...formData, dept_id: e.target.value })}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} {d.parent_name ? `(thuộc ${d.parent_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Cấp bậc chức danh quản lý
                      </label>
                      <select
                        value={formData.management_role}
                        onChange={(e) => setFormData({ ...formData, management_role: e.target.value })}
                        className="w-full px-3.5 py-2 border border-purple-200 bg-purple-50/40 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-semibold text-purple-900"
                      >
                        <option value="lanh_dao">👑 Lãnh đạo (Người đứng đầu cơ quan/đơn vị)</option>
                        <option value="quan_ly">⭐ Quản lý (Cấp phó đơn vị)</option>
                        <option value="to_truong">🏷️ Tổ trưởng chuyên môn</option>
                        <option value="nhan_vien">👤 Cán bộ, Nhân viên (CBNV)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Cán bộ Quản lý trực tiếp
                      </label>
                      <select
                        value={formData.manager_id}
                        onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-slate-800"
                      >
                        <option value="">-- Trực thuộc Lãnh đạo Cơ quan (Không qua trung gian) --</option>
                        {users
                          .filter(u => !editingUser || u.id !== editingUser.id)
                          .map(u => (
                            <option key={u.id} value={u.id}>
                              {u.management_role === 'lanh_dao' ? '👑 [Lãnh đạo]' : u.management_role === 'quan_ly' ? '⭐ [Cấp phó]' : u.management_role === 'to_truong' ? '🏷️ [Tổ trưởng]' : '👔'} {u.full_name} ({u.gov_title || u.role}) - {u.dept_name || ''}
                            </option>
                          ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Người giao nhiệm vụ hàng ngày, đôn đốc tiến độ và thẩm định ban đầu.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Người đánh giá cuối cùng (Ký duyệt kết luận)
                      </label>
                      <select
                        value={formData.final_evaluator_id}
                        onChange={(e) => setFormData({ ...formData, final_evaluator_id: e.target.value })}
                        className="w-full px-3.5 py-2 border border-blue-200 bg-blue-50/40 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                      >
                        <option value="">-- Mặc định (Theo phân cấp Người đứng đầu đơn vị) --</option>
                        {users
                          .filter(u => (!editingUser || u.id !== editingUser.id) && (u.role === 'cbql' || u.role === 'admin' || u.management_role === 'lanh_dao' || u.management_role === 'quan_ly'))
                          .map(u => (
                            <option key={u.id} value={u.id}>
                              {u.management_role === 'lanh_dao' ? '👑 [Lãnh đạo đứng đầu]' : u.management_role === 'quan_ly' ? '⭐ [Quản lý - Cấp phó]' : '👔'} {u.full_name} ({u.gov_title || u.role})
                            </option>
                          ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Cán bộ có thẩm quyền phê duyệt kết luận xếp loại cuối quý.
                      </p>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: THÔNG TIN CÁ NHÂN & CHỨC DANH */}
                <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <User className="w-4.5 h-4.5 text-emerald-600" />
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                      3. Thông tin Cá nhân & Chức danh
                    </h4>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Họ và tên cán bộ <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-semibold"
                      placeholder="vd: Nguyễn Tiến Vinh"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Chức vụ chính quyền
                      </label>
                      <input
                        type="text"
                        value={formData.gov_title}
                        onChange={(e) => setFormData({ ...formData, gov_title: e.target.value })}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="vd: Chuyên viên, Trưởng phòng, Phó Hiệu trưởng..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Chức vụ Đảng
                      </label>
                      <input
                        type="text"
                        value={formData.party_title}
                        onChange={(e) => setFormData({ ...formData, party_title: e.target.value })}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="vd: Bí thư, Phó Bí thư, Cấp ủy viên, Đảng viên..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ngày sinh
                      </label>
                      <input
                        type="date"
                        value={formData.birth_date}
                        onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Giới tính
                      </label>
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Nam">Nam</option>
                        <option value="Nữ">Nữ</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Số điện thoại liên hệ
                      </label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="vd: 0912345678"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Email công vụ
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        placeholder="canbo@hcm.gov.vn"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-100 transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition cursor-pointer"
                >
                  {editingUser ? 'Lưu thay đổi' : 'Tạo cán bộ mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-[95%] sm:max-w-xl border border-slate-200 overflow-hidden my-4 sm:my-8 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Nhập Danh Sách Cán Bộ Từ File Excel
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tạo tài khoản và phân quyền hàng loạt cho cán bộ theo file Excel
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Template Download Prompt */}
              <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-blue-950 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-blue-700" />
                    <span>Biểu mẫu Excel chuẩn đính kèm</span>
                  </div>
                  <div className="text-blue-800 text-[11px] leading-relaxed">
                    Tải file mẫu gồm 2 sheet: <b>01. Danh sách người dùng</b> (các trường thông tin bắt buộc, ngày sinh dd/mm/yyyy) và <b>02. Hướng dẫn & Danh mục</b> (danh mục phòng ban, vai trò).
                  </div>
                </div>
                <a
                  href={api.getUserTemplateUrl()}
                  download="Mau_nhap_danh_sach_can_bo_KPI.xlsx"
                  className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-blue-100 text-blue-800 font-bold px-3.5 py-2 rounded-lg border border-blue-300 shadow-xs transition shrink-0 cursor-pointer text-xs"
                >
                  <Download className="w-3.5 h-3.5 text-blue-700" />
                  <span>Tải file mẫu (.xlsx)</span>
                </a>
              </div>

              {importError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>{importError}</div>
                </div>
              )}

              {/* Result Summary Box if imported */}
              {importResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{importResult.message}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="bg-white p-2 rounded border border-emerald-200 text-center">
                      <span className="text-slate-500 block text-[11px]">Thêm mới</span>
                      <span className="text-base font-bold text-emerald-700">{importResult.importedCount}</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200 text-center">
                      <span className="text-slate-500 block text-[11px]">Cập nhật</span>
                      <span className="text-base font-bold text-indigo-700">{importResult.updatedCount}</span>
                    </div>
                    <div className="bg-white p-2 rounded border border-emerald-200 text-center">
                      <span className="text-slate-500 block text-[11px]">Bỏ qua</span>
                      <span className="text-base font-bold text-slate-600">{importResult.skippedCount}</span>
                    </div>
                  </div>

                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-emerald-200">
                      <div className="font-semibold text-amber-800 mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Có {importResult.errors.length} dòng lỗi cần chú ý:</span>
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-slate-700 max-h-32 overflow-y-auto">
                        {importResult.errors.map((err, idx) => (
                          <li key={idx}>
                            Dòng {err.row}: <b>{err.username || 'Cán bộ'}</b> - {err.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!importResult && (
                <form onSubmit={handleImportSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Chọn file Excel (.xlsx) <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-emerald-500 transition-colors bg-slate-50/50">
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        id="excelUserFileInput"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setImportFile(file);
                            setImportError('');
                          }
                        }}
                        className="hidden"
                      />
                      <label htmlFor="excelUserFileInput" className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                        <div className="p-3 bg-emerald-100 text-emerald-800 rounded-full">
                          <Upload className="w-6 h-6" />
                        </div>
                        {importFile ? (
                          <div className="text-xs">
                            <span className="font-bold text-slate-800 block text-sm">{importFile.name}</span>
                            <span className="text-slate-500 text-[11px]">{(importFile.size / 1024).toFixed(1)} KB - Nhấp để chọn file khác</span>
                          </div>
                        ) : (
                          <div className="text-xs">
                            <span className="font-semibold text-slate-700 block">Nhấp để chọn file hoặc kéo thả vào đây</span>
                            <span className="text-slate-400 text-[11px]">Hỗ trợ định dạng .xlsx chuẩn</span>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      id="updateExistingCheckbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="updateExistingCheckbox" className="text-xs font-medium text-slate-700 cursor-pointer">
                      Cập nhật thông tin cán bộ nếu tên đăng nhập đã tồn tại trên hệ thống
                    </label>
                  </div>

                  <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsImportModalOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={importing || !importFile}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg shadow-xs transition"
                    >
                      {importing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Đang xử lý...</span>
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Bắt đầu nạp dữ liệu</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {importResult && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsImportModalOpen(false);
                      setImportResult(null);
                    }}
                    className="px-5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition"
                  >
                    Đóng cửa sổ
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-md shadow-2xl p-4 sm:p-6 border border-slate-200 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shadow-2xs">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Cấp lại Mật khẩu Cán bộ</h3>
                  <p className="text-xs text-slate-500">Phân quyền Quản trị viên (Admin)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResettingUser(null);
                }}
                className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="pt-4 space-y-4">
              {resetErrorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{resetErrorMessage}</span>
                </div>
              )}

              {resetSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">{resetSuccessMessage}</p>
                    <p className="text-[11px] text-emerald-600">Đang đóng cửa sổ...</p>
                  </div>
                </div>
              )}

              {/* Thông tin cán bộ nhận cấp lại */}
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Họ và tên:</span>
                  <span className="font-bold text-slate-900">{resettingUser?.full_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Tên đăng nhập:</span>
                  <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">{resettingUser?.username}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Đơn vị / Phòng ban:</span>
                  <span className="font-medium text-slate-800">{resettingUser?.dept_name || 'Chưa phân bổ'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Chức vụ:</span>
                  <span className="text-slate-700">{resettingUser?.gov_title || resettingUser?.role || 'Cán bộ'}</span>
                </div>
              </div>

              {/* Nhập mật khẩu mới */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Mật khẩu cấp mới <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setResetPasswordInput('123456')}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline font-semibold cursor-pointer"
                  >
                    Dùng mặc định: 123456
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showResetPass ? 'text' : 'password'}
                    required
                    value={resetPasswordInput}
                    onChange={(e) => setResetPasswordInput(e.target.value)}
                    placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                    className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-slate-50/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPass(!showResetPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Sau khi cấp lại, cán bộ sử dụng mật khẩu này để đăng nhập và có thể chủ động tự đổi mật khẩu cá nhân.
                </p>
              </div>

              {/* Action buttons */}
              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetModalOpen(false);
                    setResettingUser(null);
                  }}
                  disabled={resetLoading}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={resetLoading || !!resetSuccessMessage}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {resetLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Đang cập nhật...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Xác nhận cấp lại</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
