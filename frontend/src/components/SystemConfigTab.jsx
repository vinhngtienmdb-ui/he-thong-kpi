import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Building2, 
  ShieldCheck, 
  Plus, 
  Edit3, 
  Trash2, 
  Calendar, 
  Layers, 
  Users, 
  Check, 
  X,
  ChevronRight,
  Info,
  Sliders,
  CheckSquare,
  Lock,
  Unlock,
  Clock,
  AlertTriangle,
  Power,
  PowerOff,
  Search,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../constants';

export default function SystemConfigTab({ 
  currentPeriod, 
  periods = [], 
  onReloadPeriods, 
  users = [],
  departments = [],
  onReloadDepartments,
  currentUser
}) {
  if (currentUser && currentUser.role !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center">
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Truy cập bị từ chối (403 Forbidden)</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Bạn không có thẩm quyền truy cập hoặc sửa đổi Cấu hình hệ thống. Phân hệ này chỉ dành riêng cho Quản trị viên (Admin).
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

  const [activeSubTab, setActiveSubTab] = useState('departments'); // 'general', 'departments', 'roles'
  const [configs, setConfigs] = useState({});
  const [axes, setAxes] = useState([]);
  const [roles, setRoles] = useState([]);
  const [localDepts, setLocalDepts] = useState(departments);
  const [deptFilter, setDeptFilter] = useState('all'); // 'all', 'active', 'inactive'
  const [deptSearch, setDeptSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (departments && departments.length > 0) {
      setLocalDepts(departments);
    }
  }, [departments]);

  // Period Modal
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState(null);
  const [periodForm, setPeriodForm] = useState({
    code: '',
    name: '',
    year: new Date().getFullYear(),
    quarter: 4,
    start_date: '',
    end_date: '',
    grading_lock_date: '',
    is_active: 1
  });

  // Department Modal
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptForm, setDeptForm] = useState({
    code: '',
    name: '',
    parent_id: '',
    leader_id: '',
    parent_agency: '',
    location_name: '',
    description: '',
    is_active: 1
  });

  // Role Modal
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({
    code: '',
    name: '',
    description: '',
    data_scope: 'dept_tree',
    permissions: {
      can_manage_system: false,
      can_manage_users: false,
      can_assign_tasks: true,
      can_grade_tasks: true,
      can_conclude_evaluation: true,
      can_view_all_reports: false
    }
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfgData, axesData, rolesData, deptsData] = await Promise.all([
        api.getAdminConfigs(),
        api.getAxes(),
        api.getRoles(),
        api.getDepartments()
      ]);
      setConfigs(cfgData || {});
      setAxes(axesData || []);
      setRoles(rolesData || []);
      setLocalDepts(deptsData || []);
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Lỗi tải dữ liệu cấu hình: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConfigChange = (key, value) => {
    setConfigs(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveConfigs = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });
    try {
      await api.updateAdminConfigs(configs);
      setMessage({ text: 'Lưu cấu hình hệ thống thành công!', type: 'success' });
    } catch (err) {
      setMessage({ text: 'Lỗi khi lưu cấu hình: ' + err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const openAddPeriodModal = () => {
    setEditingPeriod(null);
    setPeriodForm({
      code: '',
      name: '',
      year: new Date().getFullYear(),
      quarter: 4,
      start_date: '',
      end_date: '',
      grading_lock_date: '',
      is_active: 1
    });
    setIsPeriodModalOpen(true);
  };

  const openEditPeriodModal = (p) => {
    setEditingPeriod(p);
    setPeriodForm({
      code: p.code,
      name: p.name,
      start_date: p.start_date || '',
      end_date: p.end_date || '',
      grading_lock_date: p.grading_lock_date || '',
      is_active: p.is_active !== undefined ? (p.is_active === 1 ? 1 : 0) : 1
    });
    setIsPeriodModalOpen(true);
  };

  const handleSavePeriod = async (e) => {
    e.preventDefault();
    try {
      if (editingPeriod) {
        await api.updateAdminPeriod(editingPeriod.id, periodForm);
        setMessage({ text: `Đã cập nhật kỳ đánh giá "${periodForm.name}" thành công!`, type: 'success' });
      } else {
        await api.createAdminPeriod(periodForm);
        setMessage({ text: `Tạo kỳ đánh giá mới "${periodForm.name}" thành công!`, type: 'success' });
      }
      setIsPeriodModalOpen(false);
      if (onReloadPeriods) onReloadPeriods();
      loadData();
    } catch (err) {
      alert('Lỗi lưu kỳ đánh giá: ' + err.message);
    }
  };

  // Bật / Tắt hoạt động của Kỳ đánh giá
  const handleToggleActivePeriod = async (p) => {
    const newStatus = p.is_active === 1 ? 0 : 1;
    const actionText = newStatus === 1 ? 'BẬT hoạt động' : 'TẮT hoạt động';
    const confirmMsg = newStatus === 0 
      ? `XÁC NHẬN TẮT HOẠT ĐỘNG KỲ ĐÁNH GIÁ:\n\n👉 "${p.name}" (${p.code})\n\nKỳ này sẽ tạm ngừng và không hiển thị trong danh mục kỳ đánh giá đang thực hiện. Bạn có chắc chắn?`
      : `XÁC NHẬN KÍCH HOẠT LẠI KỲ ĐÁNH GIÁ:\n\n👉 "${p.name}" (${p.code})\n\nKỳ này sẽ hoạt động bình thường trở lại. Bạn có muốn tiếp tục?`;
    
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.updateAdminPeriod(p.id, { is_active: newStatus });
      setMessage({ text: `Đã ${actionText} cho kỳ "${p.name}" thành công!`, type: 'success' });
      if (onReloadPeriods) onReloadPeriods();
      loadData();
    } catch (err) {
      alert('Lỗi cập nhật trạng thái kỳ đánh giá: ' + err.message);
    }
  };

  // Chốt / Mở khóa KPI toàn cơ quan
  const handleToggleFinalizePeriod = async (p) => {
    if (p.is_locked === 1) {
      if (!window.confirm(
        `XÁC NHẬN MỞ KHÓA KPI CHO KỲ:\n\n👉 "${p.name}" (${p.code})\n\nSau khi mở khóa, các Cán bộ Quản lý và Lãnh đạo có thể tiếp tục cập nhật điểm số và nhận xét đánh giá. Bạn có chắc chắn muốn thực hiện?`
      )) return;
      try {
        await api.unfinalizePeriod(p.id);
        setMessage({ text: `Đã mở khóa KPI thành công cho kỳ "${p.name}"!`, type: 'success' });
        if (onReloadPeriods) onReloadPeriods();
        loadData();
      } catch (err) {
        alert('Lỗi mở khóa: ' + err.message);
      }
    } else {
      if (!window.confirm(
        `XÁC NHẬN CHỐT KPI TOÀN ĐƠN VỊ / CƠ QUAN CHO KỲ:\n\n👉 "${p.name}" (${p.code})\n\nThời hạn đánh giá: ${formatDate(p.start_date)} đến ${formatDate(p.end_date)}\n\nSau khi chốt, toàn bộ điểm số, tự đánh giá, thẩm định và xếp loại của tất cả cán bộ trong kỳ "${p.name}" sẽ được khóa sổ chính thức theo Quy định số 366-QĐ/TW.\n\nBạn có chắc chắn muốn chốt KPI cho kỳ "${p.name}"?`
      )) return;
      try {
        await api.finalizePeriod(p.id, { finalized_by: currentUser?.full_name || 'Lãnh đạo cơ quan' });
        setMessage({ text: `Đã Chốt & Khóa Sổ KPI toàn đơn vị cho kỳ "${p.name}" thành công!`, type: 'success' });
        if (onReloadPeriods) onReloadPeriods();
        loadData();
      } catch (err) {
        alert('Lỗi chốt KPI: ' + err.message);
      }
    }
  };

  // Bật / Tắt hoạt động của Đơn vị / Phòng ban
  const handleToggleActiveDept = async (dept) => {
    const newStatus = dept.is_active !== 0 ? 0 : 1;
    const actionText = newStatus === 1 ? 'BẬT hoạt động' : 'TẮT hoạt động (Tạm ngừng)';
    const confirmMsg = newStatus === 0 
      ? `XÁC NHẬN TẮT HOẠT ĐỘNG ĐƠN VỊ / PHÒNG BAN:\n\n👉 "${dept.name}" (${dept.code})\n\nĐơn vị sẽ chuyển sang trạng thái TẠM NGỪNG HOẠT ĐỘNG và không xuất hiện trong các bộ chọn phân công nhiệm vụ mới. Bạn có chắc chắn muốn tắt?`
      : `XÁC NHẬN KÍCH HOẠT LẠI HOẠT ĐỘNG ĐƠN VỊ:\n\n👉 "${dept.name}" (${dept.code})\n\nĐơn vị sẽ trở lại hoạt động bình thường. Bạn có muốn kích hoạt lại?`;
    
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.updateDepartment(dept.id, { is_active: newStatus });
      setMessage({ text: `Đã ${actionText} cho đơn vị "${dept.name}" thành công!`, type: 'success' });
      const updatedDepts = await api.getDepartments();
      setLocalDepts(updatedDepts);
      if (onReloadDepartments) onReloadDepartments();
    } catch (err) {
      alert('Lỗi cập nhật trạng thái đơn vị: ' + err.message);
    }
  };

  // --- Department CRUD ---
  const openAddDeptModal = () => {
    setEditingDept(null);
    setDeptForm({
      code: '',
      name: '',
      parent_id: '',
      leader_id: '',
      parent_agency: 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH',
      location_name: 'TP. Hồ Chí Minh',
      description: '',
      is_active: 1
    });
    setIsDeptModalOpen(true);
  };

  const openEditDeptModal = (dept) => {
    setEditingDept(dept);
    setDeptForm({
      code: dept.code,
      name: dept.name,
      parent_id: dept.parent_id || '',
      leader_id: dept.leader_id || '',
      parent_agency: dept.parent_agency || '',
      location_name: dept.location_name || '',
      description: dept.description || '',
      is_active: dept.is_active !== 0 ? 1 : 0
    });
    setIsDeptModalOpen(true);
  };

  const handleSaveDept = async (e) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await api.updateDepartment(editingDept.id, deptForm);
        setMessage({ text: `Đã cập nhật đơn vị/phòng ban "${deptForm.name}" thành công!`, type: 'success' });
      } else {
        await api.createDepartment(deptForm);
        setMessage({ text: `Đã tạo mới đơn vị/phòng ban "${deptForm.name}" thành công!`, type: 'success' });
      }
      setIsDeptModalOpen(false);
      const updatedDepts = await api.getDepartments();
      setLocalDepts(updatedDepts);
      if (onReloadDepartments) onReloadDepartments();
    } catch (err) {
      alert('Lỗi lưu đơn vị: ' + err.message);
    }
  };

  const handleDeleteDept = async (dept) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa đơn vị/phòng ban "${dept.name}"?`)) return;
    try {
      await api.deleteDepartment(dept.id);
      setMessage({ text: `Đã xóa đơn vị/phòng ban "${dept.name}" thành công!`, type: 'success' });
      const updatedDepts = await api.getDepartments();
      setLocalDepts(updatedDepts);
      if (onReloadDepartments) onReloadDepartments();
    } catch (err) {
      alert('Lỗi xóa đơn vị: ' + err.message);
    }
  };

  // --- Role CRUD ---
  const openAddRoleModal = () => {
    setEditingRole(null);
    setRoleForm({
      code: '',
      name: '',
      description: '',
      data_scope: 'dept_tree',
      permissions: {
        can_manage_system: false,
        can_manage_users: false,
        can_assign_tasks: true,
        can_grade_tasks: true,
        can_conclude_evaluation: true,
        can_view_all_reports: false
      }
    });
    setIsRoleModalOpen(true);
  };

  const openEditRoleModal = (role) => {
    setEditingRole(role);
    const perms = typeof role.permissions === 'object' ? role.permissions : {};
    setRoleForm({
      code: role.code,
      name: role.name,
      description: role.description || '',
      data_scope: role.data_scope || 'personal',
      permissions: {
        can_manage_system: Boolean(perms.can_manage_system),
        can_manage_users: Boolean(perms.can_manage_users),
        can_assign_tasks: Boolean(perms.can_assign_tasks),
        can_grade_tasks: Boolean(perms.can_grade_tasks),
        can_conclude_evaluation: Boolean(perms.can_conclude_evaluation),
        can_view_all_reports: Boolean(perms.can_view_all_reports)
      }
    });
    setIsRoleModalOpen(true);
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await api.updateRole(editingRole.id, roleForm);
        setMessage({ text: `Đã cập nhật vai trò "${roleForm.name}" thành công!`, type: 'success' });
      } else {
        await api.createRole(roleForm);
        setMessage({ text: `Đã tạo mới vai trò "${roleForm.name}" thành công!`, type: 'success' });
      }
      setIsRoleModalOpen(false);
      const updatedRoles = await api.getRoles();
      setRoles(updatedRoles);
    } catch (err) {
      alert('Lỗi lưu vai trò: ' + err.message);
    }
  };

  const handleDeleteRole = async (role) => {
    if (role.is_system === 1) {
      alert('Đây là vai trò mặc định của hệ thống, không thể xóa!');
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vai trò "${role.name}"?`)) return;
    try {
      await api.deleteRole(role.id);
      setMessage({ text: `Đã xóa vai trò "${role.name}" thành công!`, type: 'success' });
      const updatedRoles = await api.getRoles();
      setRoles(updatedRoles);
    } catch (err) {
      alert('Lỗi xóa vai trò: ' + err.message);
    }
  };

  const dataScopeLabels = {
    all: { label: 'Toàn cơ quan', color: 'bg-rose-100 text-rose-800 border-rose-200', desc: 'Xem và quản lý số liệu toàn bộ các đơn vị' },
    dept_tree: { label: 'Đơn vị & Đơn vị trực thuộc', color: 'bg-blue-100 text-blue-800 border-blue-200', desc: 'Quản lý đơn vị mình & tất cả các tổ/phòng con trực thuộc gián tiếp' },
    dept_only: { label: 'Chỉ nội bộ đơn vị', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', desc: 'Chỉ xem và quản lý cán bộ trong nội bộ đơn vị trực tiếp' },
    subordinates: { label: 'Tuyến cấp dưới trực thuộc', color: 'bg-amber-100 text-amber-800 border-amber-200', desc: 'Quản lý cán bộ theo tuyến chỉ định (manager_id)' },
    personal: { label: 'Chỉ cá nhân', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', desc: 'Chỉ xem và thực hiện công việc của chính mình' }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-100 text-red-700">
              <Settings className="w-6 h-6" />
            </div>
            Cấu hình Hệ thống & Chu kỳ KPI
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            Thiết lập danh mục Đơn vị/Phòng ban đa cấp (quản lý trực tiếp & gián tiếp), Vai trò động và trọng số đánh giá theo Hướng dẫn số 06-HD/BTCTU
          </p>
        </div>

        {/* Action button based on active sub tab */}
        <div>
          {activeSubTab === 'general' && (
            <button
              onClick={openAddPeriodModal}
              className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Thêm Kỳ Đánh giá Mới
            </button>
          )}
          {activeSubTab === 'departments' && (
            <button
              onClick={openAddDeptModal}
              className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Thêm Đơn vị / Phòng ban
            </button>
          )}
          {activeSubTab === 'roles' && (
            <button
              onClick={openAddRoleModal}
              className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Tạo Vai trò Mới
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tabs Switcher */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-1.5 flex gap-2">
        <button
          onClick={() => setActiveSubTab('departments')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold transition ${
            activeSubTab === 'departments'
              ? 'bg-red-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>1. Đơn vị & Phòng ban Đa cấp ({localDepts.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('roles')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold transition ${
            activeSubTab === 'roles'
              ? 'bg-red-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>2. Vai trò & Phân quyền Dữ liệu ({roles.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('general')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold transition ${
            activeSubTab === 'general'
              ? 'bg-red-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>3. Trọng số HD.06 & Chu kỳ Quý</span>
        </button>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between ${
          message.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage({ text: '', type: '' })} className="hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SUB-TAB 1: DEPARTMENTS & HIERARCHY */}
      {activeSubTab === 'departments' && (() => {
        const filteredDepts = localDepts.filter(d => {
          const matchesFilter = deptFilter === 'all' 
            ? true 
            : deptFilter === 'active' 
              ? d.is_active !== 0 
              : d.is_active === 0;
          const q = deptSearch.trim().toLowerCase();
          const matchesSearch = !q || 
            (d.name && d.name.toLowerCase().includes(q)) || 
            (d.code && d.code.toLowerCase().includes(q)) ||
            (d.parent_agency && d.parent_agency.toLowerCase().includes(q)) ||
            (d.leader_name && d.leader_name.toLowerCase().includes(q));
          return matchesFilter && matchesSearch;
        });

        const activeCount = localDepts.filter(d => d.is_active !== 0).length;
        const inactiveCount = localDepts.filter(d => d.is_active === 0).length;

        return (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden space-y-0">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-red-600" />
                  Danh sách Đơn vị / Phòng ban theo Cây phân cấp
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quản lý đơn vị, thiết lập cơ quan cấp trên in báo cáo và bật/tắt trạng thái hoạt động của từng đơn vị
                </p>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={deptSearch}
                    onChange={(e) => setDeptSearch(e.target.value)}
                    placeholder="Tìm theo tên, mã, người phụ trách..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-red-500 w-52 sm:w-64"
                  />
                  {deptSearch && (
                    <button
                      onClick={() => setDeptSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter Tabs */}
                <div className="inline-flex bg-slate-200/70 p-1 rounded-lg text-xs font-semibold text-slate-700">
                  <button
                    type="button"
                    onClick={() => setDeptFilter('all')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      deptFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tất cả ({localDepts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeptFilter('active')}
                    className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                      deptFilter === 'active'
                        ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                        : 'text-emerald-800 hover:text-emerald-950'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Hoạt động ({activeCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeptFilter('inactive')}
                    className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                      deptFilter === 'inactive'
                        ? 'bg-slate-700 text-white shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    Tạm ngừng ({inactiveCount})
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-xs">
                    <th className="py-3.5 px-4 w-32">Mã đơn vị</th>
                    <th className="py-3.5 px-4 min-w-[260px]">Tên đơn vị / Phòng ban</th>
                    <th className="py-3.5 px-4 min-w-[220px]">Cơ quan cấp trên (In BC) & Địa phương</th>
                    <th className="py-3.5 px-4 min-w-[180px]">Đơn vị cấp trên (Cha)</th>
                    <th className="py-3.5 px-4 min-w-[180px]">Trưởng đơn vị / Phụ trách</th>
                    <th className="py-3.5 px-4 w-24 text-center">Đơn vị con</th>
                    <th className="py-3.5 px-4 w-24 text-center">Số CBNV</th>
                    <th className="py-3.5 px-4 w-36 text-center">Chế độ hoạt động</th>
                    <th className="py-3.5 px-4 w-32 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDepts.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-10 text-center text-slate-400 text-xs italic">
                        Không tìm thấy đơn vị / phòng ban nào phù hợp với bộ lọc
                      </td>
                    </tr>
                  ) : (
                    filteredDepts.map((d) => {
                      const isActive = d.is_active !== 0;
                      return (
                        <tr key={d.id} className={`transition ${isActive ? 'hover:bg-slate-50/80' : 'bg-slate-50/40 hover:bg-slate-100/60 opacity-80'}`}>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">
                            {d.code}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {d.parent_id ? (
                                <div className="flex items-center text-slate-400 pl-3">
                                  <span className="text-slate-300 mr-1">└─</span>
                                  <span className={`font-semibold ${isActive ? 'text-slate-900' : 'text-slate-600 line-through'}`}>{d.name}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-red-600' : 'bg-slate-400'}`}></span>
                                  <span className={isActive ? '' : 'text-slate-600 line-through'}>{d.name}</span>
                                </div>
                              )}
                            </div>
                            {d.description && (
                              <div className="text-[11px] text-slate-400 mt-0.5 ml-4 truncate max-w-xs">
                                {d.description}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800 text-xs">{d.parent_agency || <span className="text-slate-400 italic">Mặc định</span>}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">📍 {d.location_name || 'TP. Hồ Chí Minh'}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {d.parent_name ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium">
                                {d.parent_name}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Cấp cao nhất</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {d.leader_name ? (
                              <span className="font-bold text-slate-800 flex items-center gap-1">
                                👤 {d.leader_name}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Chưa chỉ định</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              {d.sub_dept_count || 0}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {d.user_count || 0}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleToggleActiveDept(d)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition border cursor-pointer ${
                                isActive 
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300' 
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                              }`}
                              title={isActive ? `Nhấp để TẮT hoạt động đơn vị "${d.name}"` : `Nhấp để BẬT hoạt động đơn vị "${d.name}"`}
                            >
                              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                              <span>{isActive ? 'Đang hoạt động' : 'Tạm ngừng'}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Toggle On/Off */}
                              <button
                                type="button"
                                onClick={() => handleToggleActiveDept(d)}
                                className={`p-1.5 rounded-md transition ${
                                  isActive
                                    ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                                    : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                                }`}
                                title={isActive ? `Tắt hoạt động đơn vị "${d.name}"` : `Bật hoạt động đơn vị "${d.name}"`}
                              >
                                {isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4 text-emerald-600" />}
                              </button>

                              <button
                                onClick={() => openEditDeptModal(d)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition"
                                title="Sửa thông tin đơn vị"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteDept(d)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition"
                                title="Xóa đơn vị"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* SUB-TAB 2: ROLES & DATA SCOPES */}
      {activeSubTab === 'roles' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Danh sách Vai trò & Phạm vi Phân quyền Dữ liệu
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Quy định phạm vi truy cập số liệu (Toàn cơ quan, Đơn vị & trực thuộc, Chỉ cá nhân) và các quyền thao tác trong quy trình KPI
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
              Tổng số: <strong className="text-red-700">{roles.length}</strong> vai trò
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-xs">
                  <th className="py-3.5 px-4 w-36">Mã vai trò</th>
                  <th className="py-3.5 px-4 min-w-[220px]">Tên vai trò</th>
                  <th className="py-3.5 px-4 min-w-[240px]">Phạm vi dữ liệu (Data Scope)</th>
                  <th className="py-3.5 px-4 min-w-[340px]">Các quyền được cấp</th>
                  <th className="py-3.5 px-4 w-32 text-center">Số người dùng</th>
                  <th className="py-3.5 px-4 w-32 text-center">Loại vai trò</th>
                  <th className="py-3.5 px-4 w-32 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roles.map((r) => {
                  const scope = dataScopeLabels[r.data_scope] || dataScopeLabels.personal;
                  const perms = typeof r.permissions === 'object' ? r.permissions : {};
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {r.code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{r.name}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">{r.description}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold border ${scope.color}`}>
                          {scope.label}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1 max-w-xs">
                          {scope.desc}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {perms.can_manage_system && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200">
                              Cấu hình HT
                            </span>
                          )}
                          {perms.can_manage_users && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                              Quản lý CBNV
                            </span>
                          )}
                          {perms.can_assign_tasks && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
                              Giao việc
                            </span>
                          )}
                          {perms.can_grade_tasks && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                              Thẩm định/Chấm điểm
                            </span>
                          )}
                          {perms.can_conclude_evaluation && (
                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-bold border border-red-200">
                              Phê duyệt kết luận
                            </span>
                          )}
                          {!perms.can_manage_system && !perms.can_assign_tasks && !perms.can_grade_tasks && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">
                              Tự đăng ký & nộp minh chứng
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                          {r.user_count || 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.is_system === 1 ? 'bg-slate-200 text-slate-700' : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {r.is_system === 1 ? 'Mặc định' : 'Tùy biến'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditRoleModal(r)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition"
                            title="Sửa vai trò"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {r.is_system !== 1 && (
                            <button
                              onClick={() => handleDeleteRole(r)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition"
                              title="Xóa vai trò"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: WEIGHTS & QUARTERLY PERIODS */}
      {activeSubTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Form config */}
          <form onSubmit={handleSaveConfigs} className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 space-y-5">
            <h3 className="text-sm font-bold text-slate-900 border-b pb-3 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-red-600" />
              Trọng số & Công thức tính theo Hướng dẫn 06-HD/BTCTU
            </h3>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tỷ trọng Tiêu chí Tiến độ thực hiện (30%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={configs.WEIGHT_PROGRESS || '0.30'}
                    onChange={(e) => handleConfigChange('WEIGHT_PROGRESS', e.target.value)}
                    className="w-28 px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 font-bold text-slate-800"
                  />
                  <span className="text-slate-500">(Mặc định 0.30 = 30% tổng điểm công việc)</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tỷ trọng Tiêu chí Chất lượng sản phẩm đầu ra (70%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={configs.WEIGHT_QUALITY || '0.70'}
                    onChange={(e) => handleConfigChange('WEIGHT_QUALITY', e.target.value)}
                    className="w-28 px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 font-bold text-slate-800"
                  />
                  <span className="text-slate-500">(Mặc định 0.70 = 70% tổng điểm công việc)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tỷ lệ Điểm thưởng mỗi việc (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={configs.BONUS_RATE_PER_TASK || '0.05'}
                    onChange={(e) => handleConfigChange('BONUS_RATE_PER_TASK', e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800"
                  />
                  <span className="text-slate-400 text-[10px]">Mặc định 0.05 = 5%</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Điểm thưởng tối đa (điểm)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={configs.MAX_BONUS_SCORE || '7.0'}
                    onChange={(e) => handleConfigChange('MAX_BONUS_SCORE', e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800"
                  />
                  <span className="text-slate-400 text-[10px]">Tối đa 10% của 70đ = 7 điểm</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Chỉ tiêu Xuất sắc tối đa toàn cơ quan (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={configs.MAX_EXCELLENT_PCT || '20'}
                    onChange={(e) => handleConfigChange('MAX_EXCELLENT_PCT', e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-rose-700"
                  />
                  <span className="text-slate-400 text-[10px]">Không quá 20% toàn đơn vị</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Ngưỡng điểm Xuất sắc tối thiểu
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={configs.RANK_EXCELLENT_MIN || '90'}
                    onChange={(e) => handleConfigChange('RANK_EXCELLENT_MIN', e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-indigo-700"
                  />
                  <span className="text-slate-400 text-[10px]">Từ 90 điểm trở lên</span>
                </div>
              </div>

              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-[11px] text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-700" />
                  Quy tắc xếp loại Xuất sắc (HD.06):
                </div>
                <p>1. Tổng điểm đánh giá đạt từ 90 điểm trở lên.</p>
                <p>2. Hoàn thành 100% nhiệm vụ đã giao/đăng ký trong quý.</p>
                <p>3. Ít nhất 30% nhiệm vụ vượt tiến độ hoặc đạt chất lượng xuất sắc.</p>
                <p>4. Tỷ lệ tối đa không vượt quá 20% tổng số CBNV của cơ quan.</p>
              </div>

              {/* THÔNG TIN CƠ QUAN, ĐỊA PHƯƠNG & THẨM QUYỀN KÝ BÁO CÁO (NGHỊ ĐỊNH 30/2020/NĐ-CP & HD 06) */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5 text-red-800">
                  <Building2 className="w-4 h-4 text-red-600" />
                  Thông tin Cơ quan, Địa phương & Thẩm quyền ký Báo cáo (Chuẩn NĐ 30/2020/NĐ-CP)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Các thông tin này sẽ được tự động đồng bộ lên tiêu ngữ, đầu trang và chân trang chữ ký của các biểu mẫu Mẫu 01-A, Mẫu 01-B, Báo cáo công việc và Mẫu 02 (cả trên giao diện xem trước, bản in PDF và file Excel xuất ra).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Tên Cơ quan chủ quản / Cấp trên
                    </label>
                    <input
                      type="text"
                      value={configs.PARENT_AGENCY_NAME || ''}
                      onChange={(e) => handleConfigChange('PARENT_AGENCY_NAME', e.target.value)}
                      placeholder="THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-red-500 uppercase"
                    />
                    <span className="text-slate-400 text-[10px]">Tiêu đề góc trái dòng 1 (in hoa)</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Tên Cơ quan, Đơn vị
                    </label>
                    <input
                      type="text"
                      value={configs.UNIT_NAME || ''}
                      onChange={(e) => handleConfigChange('UNIT_NAME', e.target.value)}
                      placeholder="BAN TỔ CHỨC THÀNH ỦY TP. HỒ CHÍ MINH"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-red-500 uppercase"
                    />
                    <span className="text-slate-400 text-[10px]">Tiêu đề góc trái dòng 2 (in hoa đậm)</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Địa danh lập văn bản
                    </label>
                    <input
                      type="text"
                      value={configs.LOCATION_NAME || ''}
                      onChange={(e) => handleConfigChange('LOCATION_NAME', e.target.value)}
                      placeholder="TP. Hồ Chí Minh"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-red-500"
                    />
                    <span className="text-slate-400 text-[10px]">Xuất hiện ở dòng: [Địa phương], ngày ...</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Chức danh Người quản lý đơn vị / Cấp phòng
                    </label>
                    <input
                      type="text"
                      value={configs.DEPT_LEADER_TITLE || ''}
                      onChange={(e) => handleConfigChange('DEPT_LEADER_TITLE', e.target.value)}
                      placeholder="TRƯỞNG PHÒNG"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-red-500 uppercase"
                    />
                    <span className="text-slate-400 text-[10px]">Chức danh ký duyệt tại đơn vị / CBQL</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Chức danh Thủ trưởng / Lãnh đạo cơ quan ký
                    </label>
                    <input
                      type="text"
                      value={configs.LEADER_SIGNER_TITLE || ''}
                      onChange={(e) => handleConfigChange('LEADER_SIGNER_TITLE', e.target.value)}
                      placeholder="PHÓ TRƯỞNG BAN THƯỜNG TRỰC"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-red-500 uppercase"
                    />
                    <span className="text-slate-400 text-[10px]">Chức vụ in hoa đậm dưới chữ ký bên phải</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Họ và tên Thủ trưởng / Lãnh đạo cơ quan ký
                    </label>
                    <input
                      type="text"
                      value={configs.LEADER_SIGNER_NAME || ''}
                      onChange={(e) => handleConfigChange('LEADER_SIGNER_NAME', e.target.value)}
                      placeholder="Thái Thị Bích Liên"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-red-500"
                    />
                    <span className="text-slate-400 text-[10px]">Họ tên đầy đủ người ký duyệt</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-red-700 hover:bg-red-800 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow transition flex items-center gap-2"
              >
                {saving ? 'Đang lưu...' : 'Lưu Thay đổi Cấu hình'}
              </button>
            </div>
          </form>

          {/* Right Column: Periods List */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b pb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-red-600" />
                Danh sách Kỳ Đánh giá Hàng Quý
              </span>
              <span className="text-xs text-slate-500 font-normal">Chu kỳ 3 tháng</span>
            </h3>

            <div className="space-y-3">
              {periods.map((p) => {
                const isLocked = p.is_locked === 1;
                return (
                  <div 
                    key={p.id} 
                    className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isLocked ? 'bg-rose-50/40 border-rose-200' : 'bg-white border-slate-200 hover:border-red-300'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{p.name}</span>
                        <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-semibold">{p.code}</span>
                        
                        {p.is_active === 1 ? (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Đang hoạt động
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border border-slate-300">
                            <XCircle className="w-3 h-3 text-slate-500" />
                            Tạm ngừng hoạt động
                          </span>
                        )}

                        {isLocked ? (
                          <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 border border-rose-200">
                            <Lock className="w-3 h-3 text-rose-700" />
                            Đã Chốt KPI
                          </span>
                        ) : (
                          <span className="bg-blue-50 text-blue-700 text-[10px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 border border-blue-200">
                            <Unlock className="w-3 h-3 text-blue-600" />
                            Đang mở đánh giá
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600 pt-1">
                        <div>
                          <span className="text-slate-400">Thời hạn kỳ:</span> <strong>{formatDate(p.start_date)}</strong> đến <strong>{formatDate(p.end_date)}</strong>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="text-slate-400">Khóa chấm điểm:</span>{' '}
                          <strong className={p.grading_lock_date ? 'text-amber-700 font-bold' : 'text-slate-500 italic'}>
                            {p.grading_lock_date ? formatDate(p.grading_lock_date) : 'Chưa thiết lập'}
                          </strong>
                        </div>
                      </div>

                      {p.finalized_at && (
                        <div className="text-[10px] text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-100 inline-block mt-1">
                          🔒 Chốt lúc: {formatDate(p.finalized_at)} bởi <strong>{p.finalized_by || 'Lãnh đạo'}</strong>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons: Chỉnh sửa, Bật/Tắt hoạt động & Chốt/Mở khóa KPI */}
                    <div className="flex items-center gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {/* Bật / Tắt hoạt động kỳ */}
                      <button
                        type="button"
                        onClick={() => handleToggleActivePeriod(p)}
                        className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition shadow-2xs ${
                          p.is_active === 1
                            ? 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                            : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold'
                        }`}
                        title={p.is_active === 1 ? `Tắt hoạt động kỳ "${p.name}"` : `Bật hoạt động kỳ "${p.name}"`}
                      >
                        {p.is_active === 1 ? (
                          <>
                            <PowerOff className="w-3.5 h-3.5 text-slate-500" />
                            <span className="hidden md:inline">Tắt HĐ</span>
                          </>
                        ) : (
                          <>
                            <Power className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden md:inline">Bật HĐ</span>
                          </>
                        )}
                      </button>

                      {/* Chỉnh sửa kỳ */}
                      <button
                        type="button"
                        onClick={() => openEditPeriodModal(p)}
                        className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition shadow-2xs"
                        title="Chỉnh sửa thông tin kỳ & Thời điểm khóa chấm điểm"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                        <span className="hidden md:inline">Sửa</span>
                      </button>

                      {/* Chốt / Mở khóa KPI toàn đơn vị cho kỳ cụ thể này */}
                      <button
                        type="button"
                        onClick={() => handleToggleFinalizePeriod(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                          isLocked
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                            : 'bg-red-700 hover:bg-red-800 text-white shadow-xs'
                        }`}
                        title={isLocked ? `Mở khóa KPI kỳ "${p.name}" để tiếp tục đánh giá` : `Chốt sổ KPI toàn cơ quan cho kỳ "${p.name}"`}
                      >
                        {isLocked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Mở khóa ({p.name})</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>Chốt KPI ({p.name})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD/EDIT DEPARTMENT */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-red-600" />
                {editingDept ? 'Cập nhật Đơn vị / Phòng ban' : 'Thêm mới Đơn vị / Phòng ban'}
              </h3>
              <button onClick={() => setIsDeptModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDept} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mã đơn vị / Ký hiệu *</label>
                <input
                  type="text"
                  required
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                  placeholder="VD: BTC.TU.TC-CB hoặc A29.01"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên Đơn vị / Phòng ban *</label>
                <input
                  type="text"
                  required
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  placeholder="VD: Phòng Tổ chức Cán bộ"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cơ quan cấp trên (In báo cáo)</label>
                  <input
                    type="text"
                    value={deptForm.parent_agency}
                    onChange={(e) => setDeptForm({ ...deptForm, parent_agency: e.target.value })}
                    placeholder="VD: THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH"
                    className="w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-red-500 font-medium bg-white text-xs"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Tiêu ngữ đơn vị cấp trên (góc trái trên biểu mẫu)</p>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Địa phương / Địa danh</label>
                  <input
                    type="text"
                    value={deptForm.location_name}
                    onChange={(e) => setDeptForm({ ...deptForm, location_name: e.target.value })}
                    placeholder="VD: TP. Hồ Chí Minh"
                    className="w-full px-3 py-1.5 border rounded-lg focus:ring-2 focus:ring-red-500 font-medium bg-white text-xs"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Dùng cho dòng ngày tháng ký: "...ngày...tháng...năm..."</p>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Đơn vị Cấp trên (Đơn vị Cha)</label>
                <select
                  value={deptForm.parent_id}
                  onChange={(e) => setDeptForm({ ...deptForm, parent_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-red-500"
                >
                  <option value="">-- Là Cơ quan / Đơn vị cấp cao nhất (Không có cha) --</option>
                  {localDepts
                    .filter(d => !editingDept || d.id !== editingDept.id)
                    .map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Đơn vị cấp trên sẽ có thẩm quyền quản lý gián tiếp các cán bộ trong đơn vị này.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Trưởng đơn vị / Người phụ trách</label>
                <select
                  value={deptForm.leader_id}
                  onChange={(e) => setDeptForm({ ...deptForm, leader_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-red-500"
                >
                  <option value="">-- Chưa chỉ định trưởng đơn vị --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.gov_title || u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mô tả / Chức năng nhiệm vụ</label>
                <textarea
                  rows="2"
                  value={deptForm.description}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                  placeholder="Mô tả tóm tắt chức năng nhiệm vụ của phòng ban..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Chế độ Bật / Tắt hoạt động đơn vị */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    {deptForm.is_active === 1 ? (
                      <Power className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <PowerOff className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Chế độ hoạt động của Đơn vị</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {deptForm.is_active === 1
                      ? 'Đơn vị đang hoạt động bình thường trong cơ cấu tổ chức'
                      : 'Đơn vị tạm ngừng hoạt động (không giao việc mới)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeptForm(prev => ({ ...prev, is_active: prev.is_active === 1 ? 0 : 1 }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    deptForm.is_active === 1 ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                  title={deptForm.is_active === 1 ? 'Tắt hoạt động' : 'Bật hoạt động'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      deptForm.is_active === 1 ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold shadow-sm"
                >
                  {editingDept ? 'Cập nhật' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD/EDIT ROLE */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-red-600" />
                {editingRole ? 'Cập nhật Vai trò & Quyền hạn' : 'Tạo mới Vai trò Hệ thống'}
              </h3>
              <button onClick={() => setIsRoleModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mã định danh vai trò *</label>
                <input
                  type="text"
                  required
                  disabled={editingRole?.is_system === 1}
                  value={roleForm.code}
                  onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })}
                  placeholder="VD: to_truong, pho_ban, cbql_phong..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 font-mono disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên Vai trò *</label>
                <input
                  type="text"
                  required
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="VD: Phó Trưởng phòng, Tổ trưởng chuyên môn..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phạm vi Truy cập Dữ liệu (Data Scope) *</label>
                <select
                  value={roleForm.data_scope}
                  onChange={(e) => setRoleForm({ ...roleForm, data_scope: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-red-500 font-semibold"
                >
                  <option value="all">Toàn cơ quan (Xem & quản lý tất cả các đơn vị và nhân sự)</option>
                  <option value="dept_tree">Đơn vị & Trực thuộc (Đơn vị mình và các tổ/bộ phận con gián tiếp)</option>
                  <option value="dept_only">Chỉ nội bộ đơn vị (Chỉ xem và quản lý trong đơn vị trực tiếp)</option>
                  <option value="subordinates">Tuyến cấp dưới trực thuộc (Chỉ quản lý cán bộ theo manager_id)</option>
                  <option value="personal">Chỉ cá nhân (Chỉ xem và thao tác công việc của chính mình)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Đảm bảo cán bộ có vai trò này chỉ nhìn thấy số liệu của đơn vị mình, cá nhân và các CBNV trực thuộc quyền quản lý trực tiếp/gián tiếp.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mô tả vai trò</label>
                <input
                  type="text"
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  placeholder="Mô tả đối tượng áp dụng vai trò này..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Permissions Checkboxes */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block font-bold text-slate-800 mb-2">Các quyền hạn được cấp:</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.can_assign_tasks}
                      onChange={(e) => setRoleForm({
                        ...roleForm,
                        permissions: { ...roleForm.permissions, can_assign_tasks: e.target.checked }
                      })}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="font-semibold text-slate-800">Giao việc cho cấp dưới</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.can_grade_tasks}
                      onChange={(e) => setRoleForm({
                        ...roleForm,
                        permissions: { ...roleForm.permissions, can_grade_tasks: e.target.checked }
                      })}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="font-semibold text-slate-800">Thẩm định / Chấm điểm</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.can_conclude_evaluation}
                      onChange={(e) => setRoleForm({
                        ...roleForm,
                        permissions: { ...roleForm.permissions, can_conclude_evaluation: e.target.checked }
                      })}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="font-semibold text-slate-800">Phê duyệt kết luận xếp loại</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.can_manage_users}
                      onChange={(e) => setRoleForm({
                        ...roleForm,
                        permissions: { ...roleForm.permissions, can_manage_users: e.target.checked }
                      })}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="font-semibold text-slate-800">Quản lý hồ sơ CBNV</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.can_manage_system}
                      onChange={(e) => setRoleForm({
                        ...roleForm,
                        permissions: { ...roleForm.permissions, can_manage_system: e.target.checked }
                      })}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="font-semibold text-slate-800">Cấu hình Đơn vị & Hệ thống</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.can_view_all_reports}
                      onChange={(e) => setRoleForm({
                        ...roleForm,
                        permissions: { ...roleForm.permissions, can_view_all_reports: e.target.checked }
                      })}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="font-semibold text-slate-800">Xem Báo cáo Mẫu 02 Toàn CQ</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold shadow-sm"
                >
                  {editingRole ? 'Cập nhật' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD PERIOD */}
      {isPeriodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-red-600" />
                {editingPeriod ? 'Cập nhật Kỳ Đánh giá & Thiết lập Khóa' : 'Thêm Kỳ Đánh giá Quý Mới'}
              </h3>
              <button onClick={() => setIsPeriodModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePeriod} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mã kỳ (VD: Q4-2026)</label>
                <input
                  type="text"
                  required
                  value={periodForm.code}
                  onChange={(e) => setPeriodForm({ ...periodForm, code: e.target.value })}
                  placeholder="Q4-2026"
                  className="w-full px-3 py-2 border rounded-lg font-mono focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tên kỳ đánh giá</label>
                <input
                  type="text"
                  required
                  value={periodForm.name}
                  onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })}
                  placeholder="Quý IV / 2026"
                  className="w-full px-3 py-2 border rounded-lg font-semibold focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ngày bắt đầu</label>
                  <input
                    type="date"
                    required
                    value={periodForm.start_date}
                    onChange={(e) => setPeriodForm({ ...periodForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ngày kết thúc</label>
                  <input
                    type="date"
                    required
                    value={periodForm.end_date}
                    onChange={(e) => setPeriodForm({ ...periodForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* THIẾT LẬP THỜI ĐIỂM KHÓA CHẤM ĐIỂM KPI */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1.5">
                <label className="block font-bold text-amber-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-700" />
                  Thời điểm khóa chấm điểm KPI:
                </label>
                <input
                  type="date"
                  value={periodForm.grading_lock_date || ''}
                  onChange={(e) => setPeriodForm({ ...periodForm, grading_lock_date: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-red-500"
                />
                <p className="text-[11px] text-amber-800 leading-tight">
                  * Sau thời điểm này, hệ thống sẽ tự động khóa chức năng chấm điểm & thẩm định của Cán bộ Quản lý và Lãnh đạo đối với kỳ này.
                </p>
              </div>

              {/* BẬT / TẮT HOẠT ĐỘNG KỲ ĐÁNH GIÁ */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    {periodForm.is_active === 1 ? (
                      <Power className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <PowerOff className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Chế độ hoạt động của kỳ đánh giá</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {periodForm.is_active === 1
                      ? 'Kỳ đang hoạt động: Cho phép hiển thị và thao tác đánh giá trên toàn hệ thống'
                      : 'Kỳ tạm ngừng: Tạm ẩn và ngừng các thao tác đánh giá của kỳ này'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPeriodForm(prev => ({ ...prev, is_active: prev.is_active === 1 ? 0 : 1 }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    periodForm.is_active === 1 ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                  title={periodForm.is_active === 1 ? 'Tắt hoạt động kỳ này' : 'Bật hoạt động kỳ này'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      periodForm.is_active === 1 ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPeriodModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold shadow-sm"
                >
                  {editingPeriod ? 'Lưu thay đổi kỳ đánh giá' : 'Tạo kỳ đánh giá'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
