import React, { useState, useEffect, useMemo } from 'react';
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
  Sparkles,
  Edit,
  Users as UsersIcon,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Briefcase,
  Layers,
  Search,
  Check,
  Filter,
  SlidersHorizontal,
  ChevronLeft
} from 'lucide-react';
import { api } from '../api';
import UserGroupManagementModal from './UserGroupManagementModal';
import { compareUsersByPositionAndName } from '../userSorting';

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
            Bạn không có quyền quản lý người dùng và phân cấp đơn vị. Phân hệ này chỉ dành riêng cho Quản trị viên (Admin).
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

  // Data states
  const [users, setUsers] = useState([]);
  const [localDepts, setLocalDepts] = useState(departments);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userGroups, setUserGroups] = useState([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  // Department tree & filtering state
  const [selectedDeptId, setSelectedDeptId] = useState('ALL');
  const [includeChildren, setIncludeChildren] = useState(true);
  const [treeSearchTerm, setTreeSearchTerm] = useState('');
  const [expandedDeptIds, setExpandedDeptIds] = useState(new Set());
  const [isMobileTreeOpen, setIsMobileTreeOpen] = useState(false);

  // Search and filter states for user table
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterParty, setFilterParty] = useState('ALL'); // 'ALL' | 'PARTY' | 'NON_PARTY'
  const [filterManagementRole, setFilterManagementRole] = useState('ALL'); // 'ALL' | 'lanh_dao' | 'quan_ly' | 'to_truong' | 'nhan_vien'
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterSecondary, setFilterSecondary] = useState('ALL'); // 'ALL' | 'HAS_SECONDARY' | 'PRIMARY_ONLY'

  // User Add/Edit Modal state
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
    is_party_member: false,
    party_title: 'Đảng viên',
    gov_title: 'Chuyên viên',
    union_title: '',
    birth_date: '1990-01-01',
    gender: 'Nam',
    phone: '',
    email: '',
    is_active: 1,
    positions: []
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Department CRUD Modal state
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptFormData, setDeptFormData] = useState({
    code: '',
    name: '',
    parent_id: '',
    leader_id: '',
    agency_type: 'su_nghiep',
    parent_agency: 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH',
    location_name: 'TP. Hồ Chí Minh',
    description: '',
    is_active: 1
  });
  const [deptModalError, setDeptModalError] = useState('');
  const [deptModalLoading, setDeptModalLoading] = useState(false);

  // Import Department from Excel Modal state (Giai đoạn 2)
  const [isImportDeptModalOpen, setIsImportDeptModalOpen] = useState(false);
  const [deptImportText, setDeptImportText] = useState('');
  const [deptImportLoading, setDeptImportLoading] = useState(false);
  const [deptImportResult, setDeptImportResult] = useState(null);
  const [deptImportError, setDeptImportError] = useState('');

  // Import Excel Users Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  // Reset Password Modal state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('123456');
  const [showResetPass, setShowResetPass] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');
  const [resetErrorMessage, setResetErrorMessage] = useState('');

  // Load initial data
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [usersData, rolesData, groupsData, deptsData] = await Promise.all([
        api.getAdminUsers(),
        api.getRoles(),
        api.getUserGroups().catch(() => []),
        api.getDepartments().catch(() => departments)
      ]);
      setUsers(usersData || []);
      setRoles(rolesData || []);
      setUserGroups(groupsData || []);
      if (deptsData && deptsData.length > 0) {
        setLocalDepts(deptsData);
        // Default expand all departments in tree
        setExpandedDeptIds(new Set(deptsData.map(d => d.id)));
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Không thể tải dữ liệu: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Update local departments if prop changes
  useEffect(() => {
    if (departments && departments.length > 0 && localDepts.length === 0) {
      setLocalDepts(departments);
      setExpandedDeptIds(new Set(departments.map(d => d.id)));
    }
  }, [departments]);

  // Build department hierarchy tree
  const deptTree = useMemo(() => {
    const map = {};
    const roots = [];

    // Filter by treeSearchTerm if present
    const filteredDepts = localDepts.filter(d => {
      if (!treeSearchTerm.trim()) return true;
      const term = treeSearchTerm.toLowerCase();
      return (d.name && d.name.toLowerCase().includes(term)) ||
             (d.code && d.code.toLowerCase().includes(term));
    });

    filteredDepts.forEach(d => {
      map[d.id] = { ...d, children: [] };
    });

    filteredDepts.forEach(d => {
      if (d.parent_id && map[d.parent_id]) {
        map[d.parent_id].children.push(map[d.id]);
      } else {
        roots.push(map[d.id]);
      }
    });

    return roots;
  }, [localDepts, treeSearchTerm]);

  // Helper to get all descendant IDs of a department
  const getDescendantDeptIds = (deptId) => {
    const result = [deptId];
    const queue = [deptId];
    while (queue.length > 0) {
      const curr = queue.shift();
      const children = localDepts.filter(d => d.parent_id === curr);
      for (const child of children) {
        if (!result.includes(child.id)) {
          result.push(child.id);
          queue.push(child.id);
        }
      }
    }
    return result;
  };

  // Toggle node expand/collapse
  const toggleNodeExpand = (deptId, e) => {
    e.stopPropagation();
    setExpandedDeptIds(prev => {
      const next = new Set(prev);
      if (next.has(deptId)) {
        next.delete(deptId);
      } else {
        next.add(deptId);
      }
      return next;
    });
  };

  // Expand / Collapse all nodes
  const expandAllNodes = () => {
    setExpandedDeptIds(new Set(localDepts.map(d => d.id)));
  };

  const collapseAllNodes = () => {
    setExpandedDeptIds(new Set());
  };

  // Selected department details
  const selectedDeptObj = useMemo(() => {
    if (selectedDeptId === 'ALL') return null;
    return localDepts.find(d => d.id === selectedDeptId) || null;
  }, [selectedDeptId, localDepts]);

  const selectedDescendantsCount = useMemo(() => {
    if (!selectedDeptObj) return 0;
    const descIds = getDescendantDeptIds(selectedDeptObj.id);
    return Math.max(0, descIds.length - 1);
  }, [selectedDeptObj, localDepts]);

  // Filter users based on search, role, status, secondary positions, and selected department
  const filteredUsers = useMemo(() => {
    const allowedDeptIds = selectedDeptId === 'ALL'
      ? null
      : includeChildren
        ? getDescendantDeptIds(selectedDeptId)
        : [selectedDeptId];

    return users.filter(u => {
      // 1. Search term (Name, Username, Phone, Positions)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = u.full_name?.toLowerCase().includes(term);
        const matchesUser = u.username?.toLowerCase().includes(term);
        const matchesPhone = u.phone?.toLowerCase().includes(term);
        const matchesGovTitle = u.gov_title?.toLowerCase().includes(term);
        const matchesPos = u.positions?.some(p => 
          p.position_title?.toLowerCase().includes(term) ||
          p.dept_name?.toLowerCase().includes(term)
        );
        if (!matchesName && !matchesUser && !matchesPhone && !matchesGovTitle && !matchesPos) {
          return false;
        }
      }

      // 2. Department Tree selection (supports primary & secondary positions)
      if (allowedDeptIds) {
        const primaryMatch = allowedDeptIds.includes(u.dept_id);
        const secondaryMatch = u.positions?.some(p => allowedDeptIds.includes(p.dept_id));
        if (!primaryMatch && !secondaryMatch) {
          return false;
        }
      }

      // 3. Role filter
      if (filterRole !== 'ALL' && u.role !== filterRole) {
        return false;
      }

      // 3b. Party membership filter
      if (filterParty === 'PARTY' && u.is_party_member !== 1) return false;
      if (filterParty === 'NON_PARTY' && u.is_party_member === 1) return false;

      // 3c. Management role filter
      if (filterManagementRole !== 'ALL') {
        const userMgmtRole = u.management_role || (u.positions && u.positions.find(p => p.is_primary)?.management_role) || 'nhan_vien';
        if (userMgmtRole !== filterManagementRole) return false;
      }

      // 4. Status filter
      if (filterStatus === 'ACTIVE' && u.is_active === 0) return false;
      if (filterStatus === 'INACTIVE' && u.is_active !== 0) return false;

      // 5. Secondary position filter (Đa chức vụ / Kiêm nhiệm)
      if (filterSecondary === 'HAS_SECONDARY') {
        const secondaryCount = (u.positions || []).filter(p => !p.is_primary).length;
        if (secondaryCount === 0) return false;
      } else if (filterSecondary === 'PRIMARY_ONLY') {
        const secondaryCount = (u.positions || []).filter(p => !p.is_primary).length;
        if (secondaryCount > 0) return false;
      }

      return true;
    }).sort(compareUsersByPositionAndName);
  }, [users, selectedDeptId, includeChildren, searchTerm, filterRole, filterParty, filterManagementRole, filterStatus, filterSecondary, localDepts]);

  // Handle Role selection in Add/Edit user form
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

  // Open Modal to Add New User
  const openAddModal = () => {
    setEditingUser(null);
    const defaultRoleId = roles.find(r => r.code === 'cbnv')?.id || roles[0]?.id || '';
    const initialDeptId = (selectedDeptId !== 'ALL' ? selectedDeptId : (localDepts[0]?.id || ''));

    const initialPositions = [{
      id: 'temp-' + Date.now(),
      dept_id: initialDeptId,
      position_title: 'Chuyên viên',
      position_type: 'chinh_quyen',
      management_role: 'nhan_vien',
      manager_id: '',
      is_primary: 1,
      notes: ''
    }];

    setFormData({
      username: '',
      password: '',
      full_name: '',
      dept_id: initialDeptId,
      role_id: defaultRoleId,
      manager_id: '',
      final_evaluator_id: '',
      management_role: 'nhan_vien',
      role: 'cbnv',
      target_role: 'cbnv',
      is_party_member: false,
      party_title: 'Đảng viên',
      gov_title: 'Chuyên viên',
      union_title: '',
      birth_date: '1990-01-01',
      gender: 'Nam',
      phone: '',
      email: '',
      is_active: 1,
      positions: initialPositions
    });
    setErrorMsg('');
    setSuccessMsg('');
    setIsModalOpen(true);
  };

  // Open Modal to Edit User
  const openEditModal = (user) => {
    setEditingUser(user);
    const isExempt = user.role === 'admin' || user.role === 'admin_donvi' || user.role_code === 'admin_donvi' || user.role_id === 'role-admin-donvi';

    // Prepare positions array
    let userPositions = [];
    if (user.positions && user.positions.length > 0) {
      userPositions = user.positions.map(p => ({
        id: p.id,
        dept_id: p.dept_id || user.dept_id || localDepts[0]?.id || '',
        position_title: p.position_title || user.gov_title || 'Chuyên viên',
        position_type: p.position_type || 'chinh_quyen',
        management_role: p.management_role || user.management_role || 'nhan_vien',
        manager_id: p.manager_id || (p.is_primary ? (user.manager_id || '') : '') || '',
        is_primary: p.is_primary ? 1 : 0,
        notes: p.notes || ''
      }));
      // Ensure at least one position is primary
      if (!userPositions.some(p => p.is_primary === 1)) {
        userPositions[0].is_primary = 1;
      }
    } else {
      userPositions = [{
        id: 'pos-main-' + user.id,
        dept_id: user.dept_id || localDepts[0]?.id || '',
        position_title: user.gov_title || 'Chuyên viên',
        position_type: 'chinh_quyen',
        management_role: user.management_role || (user.role === 'cbql' ? 'quan_ly' : 'nhan_vien'),
        manager_id: user.manager_id || '',
        is_primary: 1,
        notes: ''
      }];
    }

    const primaryPos = userPositions.find(p => p.is_primary === 1) || userPositions[0];

    setFormData({
      username: user.username,
      password: '',
      full_name: user.full_name,
      dept_id: primaryPos.dept_id,
      role_id: user.role_id || roles.find(r => r.code === user.role)?.id || '',
      manager_id: primaryPos.manager_id || user.manager_id || '',
      final_evaluator_id: user.final_evaluator_id || '',
      management_role: primaryPos.management_role || user.management_role || (user.role === 'cbql' ? 'quan_ly' : 'nhan_vien'),
      role: user.role || 'cbnv',
      target_role: isExempt ? 'admin' : (user.target_role || (user.role === 'cbnv' ? 'cbnv' : 'cbql')),
      is_party_member: user.is_party_member === 1 || Boolean(user.party_title && user.party_title !== 'Quần chúng' && user.party_title !== ''),
      party_title: user.party_title || 'Đảng viên',
      gov_title: primaryPos.position_title || user.gov_title || '',
      union_title: user.union_title || '',
      birth_date: user.birth_date || '1990-01-01',
      gender: user.gender || 'Nam',
      phone: user.phone || '',
      email: user.email || '',
      is_active: user.is_active !== 0 ? 1 : 0,
      positions: userPositions
    });
    setErrorMsg('');
    setSuccessMsg('');
    setIsModalOpen(true);
  };

  // Position manipulation in Add/Edit User Modal
  const handleAddPositionRow = () => {
    const newPos = {
      id: 'temp-' + Date.now(),
      dept_id: selectedDeptId !== 'ALL' ? selectedDeptId : (localDepts[0]?.id || ''),
      position_title: 'Chuyên viên',
      position_type: 'chinh_quyen',
      management_role: 'nhan_vien',
      manager_id: '',
      is_primary: 0,
      notes: ''
    };
    setFormData(prev => ({
      ...prev,
      positions: [...prev.positions, newPos]
    }));
  };

  const handleRemovePositionRow = (index) => {
    if (formData.positions.length <= 1) {
      alert('Cán bộ phải có ít nhất 1 chức vụ công tác!');
      return;
    }
    const target = formData.positions[index];
    const newPositions = formData.positions.filter((_, idx) => idx !== index);

    // If removed position was primary, set the first remaining position as primary
    if (target.is_primary === 1 && newPositions.length > 0) {
      newPositions[0].is_primary = 1;
      setFormData(prev => ({
        ...prev,
        positions: newPositions,
        dept_id: newPositions[0].dept_id,
        gov_title: newPositions[0].position_title,
        management_role: newPositions[0].management_role
      }));
    } else {
      setFormData(prev => ({ ...prev, positions: newPositions }));
    }
  };

  const handleSetPrimaryPosition = (index) => {
    const updated = formData.positions.map((p, idx) => ({
      ...p,
      is_primary: idx === index ? 1 : 0
    }));
    const primary = updated[index];
    setFormData(prev => ({
      ...prev,
      positions: updated,
      dept_id: primary.dept_id,
      gov_title: primary.position_title,
      management_role: primary.management_role
    }));
  };

  const handlePositionChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.positions];
      updated[index] = { ...updated[index], [field]: value };

      // If updating primary position, mirror to main formData fields
      const stateUpdates = { positions: updated };
      if (updated[index].is_primary === 1) {
        if (field === 'dept_id') stateUpdates.dept_id = value;
        if (field === 'position_title') stateUpdates.gov_title = value;
        if (field === 'management_role') stateUpdates.management_role = value;
      }
      return { ...prev, ...stateUpdates };
    });
  };

  // Submit Add / Edit User
  const handleSubmitUser = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // Validation
      if (!formData.positions || formData.positions.length === 0) {
        setErrorMsg('Vui lòng gán ít nhất một chức vụ công tác cho cán bộ');
        return;
      }

      // Ensure 1 primary position
      let finalPositions = [...formData.positions];
      if (!finalPositions.some(p => p.is_primary === 1)) {
        finalPositions[0].is_primary = 1;
      }
      const primaryPos = finalPositions.find(p => p.is_primary === 1);

      const payload = {
        ...formData,
        dept_id: primaryPos.dept_id,
        gov_title: primaryPos.position_title,
        management_role: primaryPos.management_role,
        is_party_member: formData.is_party_member ? 1 : 0,
        party_title: formData.is_party_member ? (formData.party_title || 'Đảng viên') : '',
        positions: finalPositions
      };

      if (editingUser) {
        await api.updateAdminUser(editingUser.id, payload);
        setSuccessMsg('Cập nhật hồ sơ và chức vụ cán bộ thành công!');
      } else {
        if (!formData.username || !formData.password || !formData.full_name) {
          setErrorMsg('Vui lòng điền đủ Tên đăng nhập, Mật khẩu và Họ tên');
          return;
        }
        await api.createAdminUser(payload);
        setSuccessMsg('Thêm mới cán bộ và gán chức vụ thành công!');
      }

      setIsModalOpen(false);
      await loadInitialData();
      if (onReloadUsers) onReloadUsers();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Lock / Unlock user account
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

  // Permanent delete user
  const handlePermanentDelete = async (user) => {
    const confirmMsg = `CẢNH BÁO XOÁ VĨNH VIỄN:\n\nBạn có chắc chắn muốn xoá hoàn toàn tài khoản cán bộ "${user.full_name}" (${user.username}) khỏi hệ thống và đồng bộ Supabase Cloud?\n\n- Toàn bộ chức vụ kiêm nhiệm, nhiệm vụ phân công và dữ liệu đánh giá kiểm thử liên quan sẽ được dọn dẹp triệt để.\n- Thao tác này KHÔNG THỂ khôi phục!`;
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

  // Reset Password Handlers
  const openResetPasswordModal = (user) => {
    setResettingUser(user);
    setResetPasswordInput('123456');
    setShowResetPass(false);
    setResetErrorMessage('');
    setResetSuccessMessage('');
    setIsResetModalOpen(true);
  };

  const handleConfirmResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPasswordInput || resetPasswordInput.length < 6) {
      setResetErrorMessage('Mật khẩu mới phải có tối thiểu 6 ký tự');
      return;
    }

    setResetLoading(true);
    setResetErrorMessage('');
    setResetSuccessMessage('');

    try {
      const res = await api.resetAdminUserPassword(resettingUser.id, resetPasswordInput);
      setResetSuccessMessage(res.message || `Đã đặt lại mật khẩu cho cán bộ ${resettingUser.full_name} thành công!`);
      setTimeout(() => {
        setIsResetModalOpen(false);
      }, 1500);
    } catch (err) {
      setResetErrorMessage(err.message || 'Lỗi khi đặt lại mật khẩu');
    } finally {
      setResetLoading(false);
    }
  };

  // Excel Import Handlers
  const openImportModal = () => {
    setImportFile(null);
    setUpdateExisting(true);
    setImportResult(null);
    setImportError('');
    setIsImportModalOpen(true);
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

  // Department Management Handlers
  const openAddDeptModal = (parentId = '') => {
    setEditingDept(null);
    setDeptFormData({
      code: '',
      name: '',
      parent_id: parentId || (selectedDeptId !== 'ALL' ? selectedDeptId : ''),
      leader_id: '',
      agency_type: 'su_nghiep',
      parent_agency: 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH',
      location_name: 'TP. Hồ Chí Minh',
      description: '',
      is_active: 1
    });
    setDeptModalError('');
    setIsDeptModalOpen(true);
  };

  const openEditDeptModal = (dept, e) => {
    if (e) e.stopPropagation();
    setEditingDept(dept);
    setDeptFormData({
      code: dept.code || '',
      name: dept.name || '',
      parent_id: dept.parent_id || '',
      leader_id: dept.leader_id || '',
      agency_type: dept.agency_type || 'su_nghiep',
      parent_agency: dept.parent_agency || 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH',
      location_name: dept.location_name || 'TP. Hồ Chí Minh',
      description: dept.description || '',
      is_active: dept.is_active !== 0 ? 1 : 0
    });
    setDeptModalError('');
    setIsDeptModalOpen(true);
  };

  const handleSaveDept = async (e) => {
    e.preventDefault();
    if (!deptFormData.code.trim() || !deptFormData.name.trim()) {
      setDeptModalError('Mã và tên đơn vị không được để trống');
      return;
    }
    setDeptModalLoading(true);
    setDeptModalError('');
    try {
      if (editingDept) {
        await api.updateDepartment(editingDept.id, deptFormData);
      } else {
        await api.createDepartment(deptFormData);
      }
      setIsDeptModalOpen(false);
      await loadInitialData();
      if (onReloadUsers) onReloadUsers();
    } catch (err) {
      setDeptModalError(err.message || 'Lỗi lưu thông tin đơn vị');
    } finally {
      setDeptModalLoading(false);
    }
  };

  const handleDeleteDept = async (dept, e) => {
    if (e) e.stopPropagation();
    const hasChildren = localDepts.some(d => d.parent_id === dept.id);
    if (hasChildren) {
      alert(`Không thể xóa đơn vị "${dept.name}" vì đang có các đơn vị cấp con trực thuộc. Vui lòng chuyển hoặc xóa các đơn vị con trước!`);
      return;
    }
    if (dept.user_count > 0) {
      alert(`Không thể xóa đơn vị "${dept.name}" vì đang có ${dept.user_count} cán bộ công tác/kiêm nhiệm. Vui lòng chuyển cán bộ sang đơn vị khác trước!`);
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa đơn vị "${dept.name}" (${dept.code}) khỏi cơ cấu tổ chức?`)) return;

    try {
      await api.deleteDepartment(dept.id);
      if (selectedDeptId === dept.id) {
        setSelectedDeptId('ALL');
      }
      await loadInitialData();
      if (onReloadUsers) onReloadUsers();
    } catch (err) {
      alert('Lỗi khi xóa đơn vị: ' + err.message);
    }
  };

  // Import Departments from Excel / TSV Parser & Submitter (Giai đoạn 2)
  const handleImportDeptSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!deptImportText.trim()) {
      setDeptImportError('Vui lòng dán dữ liệu bảng từ Excel vào khung bên dưới');
      return;
    }

    try {
      setDeptImportLoading(true);
      setDeptImportError('');
      setDeptImportResult(null);

      const rawLines = deptImportText.trim().split(/\r?\n/);
      const items = [];

      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].trim();
        if (!line) continue;
        let parts = line.includes('\t') ? line.split('\t') : line.split(/[,;|]/);
        parts = parts.map(p => p.trim());

        // Skip header row if contains "Mã" or "Tên" or "STT"
        if (i === 0 && (parts[0].toLowerCase().includes('mã') || parts[0].toLowerCase().includes('stt') || parts[0].toLowerCase().includes('code'))) {
          continue;
        }

        let code = '';
        let name = '';
        let parent_code = '';
        let agency_type = 'su_nghiep';
        let description = '';

        if (/^\d+$/.test(parts[0]) && parts.length > 2) {
          // Format with STT: STT | Code | Name | ParentCode | AgencyType | Desc
          code = parts[1] || '';
          name = parts[2] || '';
          parent_code = parts[3] || '';
          agency_type = parts[4] || 'su_nghiep';
          description = parts[5] || '';
        } else {
          // Format without STT: Code | Name | ParentCode | AgencyType | Desc
          code = parts[0] || '';
          name = parts[1] || '';
          parent_code = parts[2] || '';
          agency_type = parts[3] || 'su_nghiep';
          description = parts[4] || '';
        }

        if (code && name) {
          items.push({
            code,
            name,
            parent_code,
            agency_type,
            description
          });
        }
      }

      if (items.length === 0) {
        setDeptImportError('Không tìm thấy dòng đơn vị hợp lệ. Vui lòng đảm bảo tối thiểu Cột 1 là Mã đơn vị, Cột 2 là Tên đơn vị.');
        return;
      }

      const res = await api.importDepartmentsExcel(items);
      setDeptImportResult(res);
      await loadInitialData();
      if (onReloadUsers) onReloadUsers();
    } catch (err) {
      setDeptImportError(err.message || 'Lỗi khi nhập danh mục đơn vị');
    } finally {
      setDeptImportLoading(false);
    }
  };

  // Helper check if selected role is exempt from KPI evaluation
  const selectedRoleObj = roles.find(r => r.id === formData.role_id);
  const isSelectedRoleExempt = 
    formData.role === 'admin' || 
    formData.target_role === 'admin' || 
    selectedRoleObj?.code === 'admin' || 
    selectedRoleObj?.code === 'admin_donvi';

  // Recursive Tree Node Component
  const TreeNode = ({ node, level = 0 }) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedDeptIds.has(node.id);
    const isSelected = selectedDeptId === node.id;

    return (
      <div className="select-none">
        <div 
          onClick={() => setSelectedDeptId(node.id)}
          className={`group flex items-center justify-between py-2 px-2.5 rounded-xl cursor-pointer transition-all text-xs font-medium ${
            isSelected 
              ? 'bg-indigo-600 text-white shadow-xs font-bold' 
              : 'hover:bg-slate-100 text-slate-700'
          }`}
          style={{ paddingLeft: `${level * 16 + 10}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleNodeExpand(node.id, e)}
                className={`p-0.5 rounded hover:bg-black/10 transition ${isSelected ? 'text-white' : 'text-slate-400'}`}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-3.5 h-3.5 shrink-0 inline-block" />
            )}

            <Building2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-indigo-600'}`} />
            
            <div className="min-w-0 flex-1 truncate">
              <span className="truncate block" title={`${node.name} (${node.code})`}>
                {node.name}
              </span>
              {node.code && (
                <span className={`text-[10px] block font-mono ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                  {node.code}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              isSelected 
                ? 'bg-white/20 text-white' 
                : 'bg-slate-200/80 text-slate-600'
            }`}>
              {node.user_count || 0}
            </span>

            {/* Hover Actions for Dept */}
            <button
              type="button"
              onClick={(e) => openEditDeptModal(node, e)}
              className={`p-1 rounded opacity-0 group-hover:opacity-100 transition ${
                isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-200 text-slate-500'
              }`}
              title="Chỉnh sửa đơn vị"
            >
              <Edit className="w-3 h-3" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {node.children.map(child => (
              <TreeNode key={child.id} node={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 shadow-2xs">
              <UsersIcon className="w-6 h-6" />
            </div>
            <span>Quản lý Người dùng & Cơ cấu Đơn vị</span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Quản lý cơ cấu đơn vị tổ chức, danh sách cán bộ theo phân cấp, đa chức vụ kiêm nhiệm và vai trò đánh giá theo Hướng dẫn số 06-HD/BTCTU.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={api.getUserTemplateUrl()}
            download="Mau_nhap_danh_sach_can_bo_KPI.xlsx"
            className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 transition shadow-2xs cursor-pointer"
            title="Tải file mẫu Excel chuẩn để nhập dữ liệu cán bộ"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>File mẫu Excel</span>
          </a>

          <button
            type="button"
            onClick={openImportModal}
            className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-2xs transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-white" />
            <span>Nhập từ Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setIsGroupModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 transition shadow-2xs cursor-pointer"
            title="Quản lý nhóm người dùng tự tạo để giao việc"
          >
            <UsersIcon className="w-4 h-4 text-slate-600" />
            <span>Nhóm ({userGroups.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDeptImportText('');
              setDeptImportResult(null);
              setDeptImportError('');
              setIsImportDeptModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold px-3 py-2 rounded-xl shadow-2xs transition cursor-pointer"
            title="Nhập cơ cấu đơn vị tổ chức hàng loạt từ Excel theo Hướng dẫn iCPV TP.HCM"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>Nhập Đơn vị Excel</span>
          </button>

          <button
            type="button"
            onClick={() => openAddDeptModal()}
            className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-semibold px-3 py-2 rounded-xl shadow-2xs transition cursor-pointer"
          >
            <Building2 className="w-4 h-4 text-indigo-700" />
            <span>+ Thêm Đơn vị</span>
          </button>

          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Thêm Cán bộ</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Layout: 2 Columns (Left: Hierarchical Tree, Right: Users Table) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Hierarchical Department Tree (4 cols on lg, 3 cols on xl) */}
        <div className="lg:col-span-4 xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <FolderTree className="w-4.5 h-4.5 text-indigo-600" />
              <span>Cơ cấu Đơn vị</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={expandAllNodes}
                className="text-[11px] text-slate-500 hover:text-indigo-600 px-1.5 py-0.5 rounded hover:bg-slate-100"
                title="Mở rộng tất cả các cấp"
              >
                Mở
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={collapseAllNodes}
                className="text-[11px] text-slate-500 hover:text-indigo-600 px-1.5 py-0.5 rounded hover:bg-slate-100"
                title="Thu gọn cây"
              >
                Gọn
              </button>
            </div>
          </div>

          {/* Tree Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Lọc tên, mã đơn vị..."
              value={treeSearchTerm}
              onChange={(e) => setTreeSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            {treeSearchTerm && (
              <button
                type="button"
                onClick={() => setTreeSearchTerm('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Root: All Units item */}
          <div className="space-y-1">
            <div
              onClick={() => setSelectedDeptId('ALL')}
              className={`flex items-center justify-between py-2 px-2.5 rounded-xl cursor-pointer transition text-xs ${
                selectedDeptId === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers className={`w-4 h-4 ${selectedDeptId === 'ALL' ? 'text-white' : 'text-indigo-600'}`} />
                <span>Toàn bộ Cơ quan & Đơn vị</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                selectedDeptId === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {users.length}
              </span>
            </div>

            {/* Recursive Tree Nodes */}
            <div className="pt-1 space-y-0.5 max-h-[520px] overflow-y-auto pr-1">
              {deptTree.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Không tìm thấy đơn vị nào phù hợp
                </div>
              ) : (
                deptTree.map(node => (
                  <TreeNode key={node.id} node={node} level={0} />
                ))
              )}
            </div>
          </div>

          {/* Sub-tree toggle options */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeChildren}
                onChange={(e) => setIncludeChildren(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span>Bao gồm cả các đơn vị cấp con trực thuộc</span>
            </label>

            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Tổng số đơn vị: <b>{localDepts.length}</b></span>
              <button
                type="button"
                onClick={() => openAddDeptModal()}
                className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
              >
                + Thêm đơn vị con
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: User Management Table & Filters (8 cols on lg, 9 cols on xl) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Active Filter Indicator Banner */}
          {selectedDeptObj && (
            <div className="bg-indigo-50/80 border border-indigo-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <Building2 className="w-5 h-5 text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-indigo-950 text-sm truncate flex items-center gap-2">
                    <span>Đơn vị: {selectedDeptObj.name}</span>
                    {selectedDeptObj.code && (
                      <span className="font-mono text-[11px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                        {selectedDeptObj.code}
                      </span>
                    )}
                  </div>
                  <div className="text-indigo-700 text-[11px]">
                    {includeChildren && selectedDescendantsCount > 0 ? (
                      <span>Đang lọc cán bộ thuộc đơn vị này và <b>{selectedDescendantsCount}</b> đơn vị cấp con trực thuộc</span>
                    ) : (
                      <span>Chỉ lọc cán bộ trực thuộc đơn vị này</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDeptId('ALL')}
                className="text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl font-semibold shrink-0 transition"
              >
                Xem tất cả đơn vị
              </button>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
              {/* Search user */}
              <div className="w-full md:flex-1 relative">
                <input
                  type="text"
                  placeholder="Tìm theo họ tên, tài khoản, số điện thoại, chức vụ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filters row */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                >
                  <option value="ALL">Tất cả vai trò</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                  <option value="cbql">Lãnh đạo, Quản lý (CBQL)</option>
                  <option value="cbnv">Cán bộ, Nhân viên (CBNV)</option>
                </select>

                <select
                  value={filterManagementRole}
                  onChange={(e) => setFilterManagementRole(e.target.value)}
                  className="border border-purple-200 bg-purple-50/40 text-purple-900 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  title="Lọc phân cấp Lãnh đạo Trưởng / Phó / Tổ trưởng"
                >
                  <option value="ALL">Tất cả cấp bậc</option>
                  <option value="lanh_dao">👑 Trưởng đơn vị / Đứng đầu</option>
                  <option value="quan_ly">⭐ Cấp phó đơn vị</option>
                  <option value="to_truong">🏷️ Tổ trưởng</option>
                  <option value="nhan_vien">👤 Cán bộ, Nhân viên</option>
                </select>

                <select
                  value={filterParty}
                  onChange={(e) => setFilterParty(e.target.value)}
                  className="border border-red-200 bg-red-50/40 text-red-900 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-red-500 focus:outline-none"
                  title="Lọc cán bộ là Đảng viên Đảng Cộng sản Việt Nam"
                >
                  <option value="ALL">Tất cả thành phần</option>
                  <option value="PARTY">🚩 Đảng viên</option>
                  <option value="NON_PARTY">Quần chúng</option>
                </select>

                <select
                  value={filterSecondary}
                  onChange={(e) => setFilterSecondary(e.target.value)}
                  className="border border-indigo-200 bg-indigo-50/40 text-indigo-900 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="ALL">Tất cả chế độ chức vụ</option>
                  <option value="HAS_SECONDARY">🏷️ Có chức vụ kiêm nhiệm</option>
                  <option value="PRIMARY_ONLY">Chỉ chức vụ đơn nhiệm</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="INACTIVE">Đã khóa</option>
                </select>
              </div>
            </div>

            {/* Results counter strip */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Hiển thị <b>{filteredUsers.length}</b> / {users.length} cán bộ</span>
              <span className="italic text-slate-400">Hỗ trợ đa chức vụ & tự động đồng bộ theo Hướng dẫn số 06-HD/BTCTU</span>
            </div>
          </div>

          {/* Users Table & Mobile Cards */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 text-xs font-semibold uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3 w-12 text-center">STT</th>
                    <th className="px-3.5 py-3 min-w-[200px]">Cán bộ & Tài khoản</th>
                    <th className="px-3.5 py-3 min-w-[260px]">Đơn vị & Chức vụ (Đa chức vụ)</th>
                    <th className="px-3.5 py-3 min-w-[190px]">Tuyến Quản lý</th>
                    <th className="px-3.5 py-3 min-w-[170px] text-center">Vai trò & Mẫu ĐG</th>
                    <th className="px-3.5 py-3 min-w-[110px] text-center">Trạng thái</th>
                    <th className="px-3.5 py-3 text-center min-w-[130px] w-32">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                        Đang tải danh sách cán bộ và chức vụ...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-slate-400">
                        Không tìm thấy cán bộ nào phù hợp với bộ lọc hiện tại
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u, idx) => {
                      const allPositions = u.positions && u.positions.length > 0
                        ? u.positions
                        : [{
                            id: 'p0',
                            dept_id: u.dept_id,
                            dept_name: u.dept_name,
                            position_title: u.gov_title || 'Chuyên viên',
                            is_primary: 1
                          }];

                      const primaryPos = allPositions.find(p => p.is_primary === 1) || allPositions[0];
                      const secondaryPositions = allPositions.filter(p => !p.is_primary);

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition">
                          {/* STT */}
                          <td className="px-3.5 py-3 text-center font-medium text-slate-400">
                            {idx + 1}
                          </td>

                          {/* Cán bộ / Username */}
                          <td className="px-3.5 py-3">
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                              <span>{u.full_name}</span>
                              {u.is_party_member === 1 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold" title={u.party_title || 'Đảng viên'}>
                                  🚩 {u.party_title ? u.party_title : 'Đảng viên'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {(primaryPos.management_role === 'lanh_dao' || u.management_role === 'lanh_dao') ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-purple-100 text-purple-900 border border-purple-200 text-[10px] font-bold">
                                  👑 Trưởng đơn vị / Đứng đầu
                                </span>
                              ) : (primaryPos.management_role === 'quan_ly' || u.management_role === 'quan_ly') ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-blue-100 text-blue-900 border border-blue-200 text-[10px] font-bold">
                                  ⭐ Cấp phó đơn vị
                                </span>
                              ) : (primaryPos.management_role === 'to_truong' || u.management_role === 'to_truong') ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-teal-100 text-teal-900 border border-teal-200 text-[10px] font-bold">
                                  🏷️ Tổ trưởng
                                </span>
                              ) : null}
                            </div>
                            <div className="text-slate-400 text-[11px] mt-0.5">
                              @{u.username} {u.phone ? `• 📞 ${u.phone}` : ''}
                            </div>
                            {u.email && (
                              <div className="text-slate-400 text-[10px] truncate max-w-[180px]">
                                ✉️ {u.email}
                              </div>
                            )}
                          </td>

                          {/* Đơn vị & Chức vụ (Đa chức vụ / Kiêm nhiệm) */}
                          <td className="px-3.5 py-3">
                            <div className="space-y-1.5">
                              {/* Primary Position */}
                              <div className="bg-indigo-50/70 border border-indigo-200/70 rounded-lg p-2 text-xs">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded text-[10px] font-bold shrink-0">
                                    Chính
                                  </span>
                                  <span className="font-bold text-indigo-950 truncate">
                                    {primaryPos.position_title || u.gov_title || 'Chuyên viên'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-indigo-800/80 font-medium truncate mt-0.5">
                                  🏢 {primaryPos.dept_name || u.dept_name || 'Chưa phân bổ đơn vị'}
                                </div>
                              </div>

                              {/* Secondary / Kiêm nhiệm positions */}
                              {secondaryPositions.length > 0 && (
                                <div className="space-y-1">
                                  {secondaryPositions.map((sp, sIdx) => (
                                    <div 
                                      key={sp.id || sIdx}
                                      className="bg-amber-50/80 border border-amber-200/80 rounded-lg p-1.5 text-[11px]"
                                    >
                                      <div className="flex items-center gap-1">
                                        <span className="px-1.5 py-0.2 bg-amber-600 text-white rounded text-[9px] font-bold shrink-0">
                                          Kiêm nhiệm
                                        </span>
                                        <span className="font-semibold text-amber-950 truncate">
                                          {sp.position_title}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-amber-800/90 truncate mt-0.5">
                                        🏢 {sp.dept_name || 'Đơn vị kiêm nhiệm'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Tuyến Quản lý & Đánh giá */}
                          <td className="px-3.5 py-3">
                            <div className="space-y-1 text-xs">
                              <div className="text-slate-700">
                                <span className="text-slate-400 text-[11px]">Trực tiếp: </span>
                                {u.manager_name ? (
                                  <span className="font-semibold text-slate-800">👔 {u.manager_name}</span>
                                ) : (
                                  <span className="text-slate-400 italic">Trực thuộc LĐ</span>
                                )}
                              </div>
                              <div className="text-indigo-800">
                                <span className="text-slate-400 text-[11px]">ĐG cuối: </span>
                                {u.final_evaluator_name ? (
                                  <span className="font-semibold text-indigo-900">👑 {u.final_evaluator_name}</span>
                                ) : (
                                  <span className="text-slate-500 italic">Theo phân cấp</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Vai trò & Mẫu ĐG */}
                          <td className="px-3.5 py-3 text-center">
                            <div className="space-y-1 inline-flex flex-col items-center">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                u.role === 'admin'
                                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                                  : u.role === 'cbql'
                                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              }`}>
                                {u.role_name || (u.role === 'admin' ? 'Quản trị' : u.role === 'cbql' ? 'Lãnh đạo' : 'CBNV')}
                              </span>

                              <div>
                                {u.role === 'admin' || u.target_role === 'admin' ? (
                                  <span className="inline-block text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                    ⚙️ Miễn ĐG
                                  </span>
                                ) : u.target_role === 'cbql' || (u.role === 'cbql' && u.target_role !== 'cbnv') ? (
                                  <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    Mẫu 01-A
                                  </span>
                                ) : (
                                  <span className="inline-block text-[10px] font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                                    Mẫu 01-B
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Trạng thái */}
                          <td className="px-3.5 py-3 text-center">
                            {u.is_active !== 0 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Hoạt động
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                Đã khoá
                              </span>
                            )}
                          </td>

                          {/* Thao tác */}
                          <td className="px-3.5 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => openEditModal(u)}
                                className="p-1.5 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                                title="Chỉnh sửa hồ sơ & chức vụ"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openResetPasswordModal(u)}
                                className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                title="Cấp lại mật khẩu"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              {u.id !== currentUser?.id && (
                                <>
                                  {u.is_active !== 0 ? (
                                    <button
                                      onClick={() => handleToggleStatus(u, 0)}
                                      className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                      title="Khoá tài khoản"
                                    >
                                      <Lock className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleToggleStatus(u, 1)}
                                      className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                                      title="Mở khoá tài khoản"
                                    >
                                      <Unlock className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handlePermanentDelete(u)}
                                    className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                    title="Xoá vĩnh viễn"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View */}
            <div className="lg:hidden p-3 space-y-3 bg-slate-50/50">
              {loading ? (
                <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200">
                  Đang tải danh sách cán bộ...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
                  Không tìm thấy cán bộ nào phù hợp
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const allPositions = u.positions && u.positions.length > 0 ? u.positions : [{
                    dept_name: u.dept_name,
                    position_title: u.gov_title || 'Chuyên viên',
                    is_primary: 1
                  }];
                  const primaryPos = allPositions.find(p => p.is_primary === 1) || allPositions[0];
                  const secondaryPositions = allPositions.filter(p => !p.is_primary);

                  return (
                    <div key={u.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div>
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                            <span>{u.full_name}</span>
                            {u.is_party_member === 1 && (
                              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold">
                                🚩 {u.party_title || 'Đảng viên'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {(primaryPos.management_role === 'lanh_dao' || u.management_role === 'lanh_dao') ? (
                              <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-900 border border-purple-200 text-[10px] font-bold">
                                👑 Trưởng đơn vị
                              </span>
                            ) : (primaryPos.management_role === 'quan_ly' || u.management_role === 'quan_ly') ? (
                              <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-900 border border-blue-200 text-[10px] font-bold">
                                ⭐ Cấp phó
                              </span>
                            ) : (primaryPos.management_role === 'to_truong' || u.management_role === 'to_truong') ? (
                              <span className="px-1.5 py-0.2 rounded bg-teal-100 text-teal-900 border border-teal-200 text-[10px] font-bold">
                                🏷️ Tổ trưởng
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            @{u.username} {u.phone ? `• 📞 ${u.phone}` : ''}
                          </div>
                        </div>
                        {u.is_active !== 0 ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                            Hoạt động
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                            Đã khóa
                          </span>
                        )}
                      </div>

                      {/* Positions strip */}
                      <div className="space-y-1.5 text-xs">
                        <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-2">
                          <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded text-[9px] font-bold mr-1.5">
                            Chức vụ chính
                          </span>
                          <span className="font-bold text-indigo-950">
                            {primaryPos.position_title}
                          </span>
                          <div className="text-[11px] text-indigo-800 mt-0.5">
                            🏢 {primaryPos.dept_name || 'Chưa phân bổ'}
                          </div>
                        </div>

                        {secondaryPositions.map((sp, sIdx) => (
                          <div key={sIdx} className="bg-amber-50/80 border border-amber-200/80 rounded-lg p-2 text-xs">
                            <span className="px-1.5 py-0.2 bg-amber-600 text-white rounded text-[9px] font-bold mr-1.5">
                              Kiêm nhiệm
                            </span>
                            <span className="font-bold text-amber-950">
                              {sp.position_title}
                            </span>
                            <div className="text-[11px] text-amber-800 mt-0.5">
                              🏢 {sp.dept_name}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Mobile Actions */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-xs flex items-center gap-1"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openResetPasswordModal(u)}
                          className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl font-bold text-xs flex items-center gap-1"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Đổi MK</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit User Modal (Multi-Position Support) */}
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
                    Hỗ trợ quản lý đa chức vụ / kiêm nhiệm tại một hoặc nhiều đơn vị
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

            {/* Modal Body */}
            <form onSubmit={handleSubmitUser} className="flex flex-col flex-1 overflow-hidden">
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
                          <span>⚙️ Miễn đánh giá (Tài khoản chức năng)</span>
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

                {/* SECTION 2: ĐƠN VỊ & CHỨC VỤ (HỖ TRỢ ĐA CHỨC VỤ / KIÊM NHIỆM) */}
                <div className="bg-white rounded-xl p-5 border border-indigo-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4.5 h-4.5 text-indigo-600" />
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                        2. Đơn vị công tác & Chức vụ (Đa chức vụ / Kiêm nhiệm)
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddPositionRow}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition border border-indigo-200 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Thêm chức vụ</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-500">
                    Theo tài liệu hướng dẫn iCPV TP.HCM: 1 cán bộ có thể được gán một hoặc nhiều chức vụ ở một hoặc nhiều đơn vị khác nhau. Tích chọn <b>"Là chức vụ mặc định"</b> tại chức vụ chính.
                  </p>

                  {/* List of Position Rows */}
                  <div className="space-y-3">
                    {formData.positions.map((pos, idx) => (
                      <div 
                        key={pos.id || idx} 
                        className={`p-4 rounded-xl border transition-all ${
                          pos.is_primary === 1 
                            ? 'bg-indigo-50/40 border-indigo-300 ring-1 ring-indigo-200' 
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              pos.is_primary === 1 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-slate-200 text-slate-700'
                            }`}>
                              {pos.is_primary === 1 ? '👑 Chức vụ chính (Mặc định)' : `Chức vụ kiêm nhiệm #${idx}`}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="radio"
                                name="primary_position_selector"
                                checked={pos.is_primary === 1}
                                onChange={() => handleSetPrimaryPosition(idx)}
                                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <span className={pos.is_primary === 1 ? 'text-indigo-900 font-bold' : ''}>
                                Là chức vụ mặc định
                              </span>
                            </label>

                            {formData.positions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemovePositionRow(idx)}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition"
                                title="Xóa chức vụ này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Đơn vị công tác <span className="text-rose-500">*</span>
                            </label>
                            <select
                              value={pos.dept_id}
                              onChange={(e) => handlePositionChange(idx, 'dept_id', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                              {localDepts.map(d => (
                                <option key={d.id} value={d.id}>
                                  {d.name} {d.code ? `[${d.code}]` : ''} {d.parent_name ? `(thuộc ${d.parent_name})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Chức vụ / Vị trí việc làm <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={pos.position_title}
                              onChange={(e) => handlePositionChange(idx, 'position_title', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                              placeholder="vd: Trưởng phòng, Chuyên viên, Bí thư Chi bộ..."
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Phân loại chức vụ
                            </label>
                            <select
                              value={pos.position_type}
                              onChange={(e) => handlePositionChange(idx, 'position_type', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                              <option value="chinh_quyen">🏛️ Chính quyền</option>
                              <option value="dang">🚩 Đảng</option>
                              <option value="doan_the">⭐ Đoàn thể</option>
                              <option value="khac">Khác</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Cấp bậc quản lý
                            </label>
                            <select
                              value={pos.management_role}
                              onChange={(e) => handlePositionChange(idx, 'management_role', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 bg-white font-medium"
                            >
                              <option value="lanh_dao">👑 Lãnh đạo (Người đứng đầu)</option>
                              <option value="quan_ly">⭐ Quản lý (Cấp phó)</option>
                              <option value="to_truong">🏷️ Tổ trưởng chuyên môn</option>
                              <option value="nhan_vien">👤 Cán bộ, Nhân viên</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-indigo-900 mb-1 flex items-center justify-between">
                              <span>LĐ trực tiếp vị trí này</span>
                              {pos.is_primary === 1 && <span className="text-[10px] text-indigo-600 font-bold">(Chính)</span>}
                            </label>
                            <select
                              value={pos.manager_id || ''}
                              onChange={(e) => {
                                handlePositionChange(idx, 'manager_id', e.target.value);
                                if (pos.is_primary === 1) {
                                  setFormData(prev => ({ ...prev, manager_id: e.target.value }));
                                }
                              }}
                              className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 bg-indigo-50/30 text-slate-800 font-medium"
                            >
                              <option value="">-- Mặc định theo đơn vị --</option>
                              {users
                                .filter(u => !editingUser || u.id !== editingUser.id)
                                .map(u => (
                                  <option key={u.id} value={u.id}>
                                    {u.management_role === 'lanh_dao' ? '👑' : u.management_role === 'quan_ly' ? '⭐' : '👔'} {u.full_name} ({u.gov_title || u.role})
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Ghi chú phân công
                            </label>
                            <input
                              type="text"
                              value={pos.notes || ''}
                              onChange={(e) => handlePositionChange(idx, 'notes', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                              placeholder="vd: QĐ 45/QĐ-TU..."
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SECTION 3: THÔNG TIN CÁ NHÂN & LIÊN HỆ */}
                <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <User className="w-4.5 h-4.5 text-emerald-600" />
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                      3. Thông tin Cá nhân & Liên hệ
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

                  {/* THÀNH PHẦN ĐẢNG & CHỨC VỤ ĐẢNG */}
                  <div className="p-4 bg-red-50/60 border border-red-200 rounded-xl space-y-3">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.is_party_member)}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          is_party_member: e.target.checked,
                          party_title: e.target.checked ? (formData.party_title || 'Đảng viên') : ''
                        })}
                        className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-red-950 flex items-center gap-1.5">
                        <span>🚩 Là Đảng viên Đảng Cộng sản Việt Nam</span>
                      </span>
                    </label>

                    {formData.is_party_member && (
                      <div className="pt-2 border-t border-red-200/60 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in">
                        <div>
                          <label className="block text-xs font-semibold text-red-900 mb-1">
                            Chức vụ / Danh hiệu công tác Đảng
                          </label>
                          <input
                            type="text"
                            value={formData.party_title}
                            onChange={(e) => setFormData({ ...formData, party_title: e.target.value })}
                            className="w-full px-3 py-2 border border-red-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-red-500 bg-white"
                            placeholder="vd: Đảng viên, Bí thư Chi bộ, Phó Bí thư, Chi ủy viên..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Chức danh Đoàn thể (nếu có)
                          </label>
                          <input
                            type="text"
                            value={formData.union_title}
                            onChange={(e) => setFormData({ ...formData, union_title: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 bg-white"
                            placeholder="vd: Chủ tịch Công đoàn, Bí thư Đoàn..."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 4: TUYẾN QUẢN LÝ & ĐÁNH GIÁ */}
                <div className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Building2 className="w-4.5 h-4.5 text-blue-600" />
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                      4. Tuyến Quản lý & Phê duyệt Đánh giá
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Cán bộ Quản lý trực tiếp
                      </label>
                      <select
                        value={formData.manager_id}
                        onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-slate-800"
                      >
                        <option value="">-- Trực thuộc Lãnh đạo Cơ quan --</option>
                        {users
                          .filter(u => !editingUser || u.id !== editingUser.id)
                          .map(u => (
                            <option key={u.id} value={u.id}>
                              {u.management_role === 'lanh_dao' ? '👑 [Lãnh đạo]' : u.management_role === 'quan_ly' ? '⭐ [Cấp phó]' : '👔'} {u.full_name} ({u.gov_title || u.role}) - {u.dept_name || ''}
                            </option>
                          ))}
                      </select>
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
                        <option value="">-- Mặc định (Theo phân cấp Người đứng đầu) --</option>
                        {users
                          .filter(u => (!editingUser || u.id !== editingUser.id) && (u.role === 'cbql' || u.role === 'admin' || u.management_role === 'lanh_dao' || u.management_role === 'quan_ly'))
                          .map(u => (
                            <option key={u.id} value={u.id}>
                              {u.management_role === 'lanh_dao' ? '👑 [Lãnh đạo đứng đầu]' : '👔'} {u.full_name} ({u.gov_title || u.role})
                            </option>
                          ))}
                      </select>
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

      {/* Department Add/Edit Modal */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-[95%] sm:max-w-lg shadow-2xl border border-slate-200 overflow-hidden my-auto">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-amber-300" />
                <h3 className="text-base font-bold">
                  {editingDept ? `Chỉnh sửa Đơn vị: ${editingDept.name}` : 'Thêm Đơn vị / Cơ cấu Tổ chức Mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDeptModalOpen(false)}
                className="text-white/70 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDept} className="p-5 sm:p-6 space-y-4">
              {deptModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{deptModalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mã đơn vị <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={deptFormData.code}
                    onChange={(e) => setDeptFormData({ ...deptFormData, code: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500"
                    placeholder="vd: A29.01.05"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Mã chuẩn iCPV TPHCM</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Đơn vị cấp trên trực tiếp
                  </label>
                  <select
                    value={deptFormData.parent_id}
                    onChange={(e) => setDeptFormData({ ...deptFormData, parent_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">-- Đơn vị cấp cao nhất (Không có cha) --</option>
                    {localDepts
                      .filter(d => !editingDept || d.id !== editingDept.id)
                      .map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.code ? `[${d.code}]` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên đơn vị / Phòng ban <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={deptFormData.name}
                  onChange={(e) => setDeptFormData({ ...deptFormData, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500"
                  placeholder="vd: Ban Tuyên giáo, Chi bộ Trường..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Loại hình cơ quan, đơn vị (Phục vụ xếp loại Nghị quyết 98)
                </label>
                <select
                  value={deptFormData.agency_type || 'su_nghiep'}
                  onChange={(e) => setDeptFormData({ ...deptFormData, agency_type: e.target.value })}
                  className="w-full px-3 py-2 border border-indigo-200 bg-indigo-50/30 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="so_nganh">🏛️ Sở, ban, ngành TP.HCM</option>
                  <option value="ubnd_quan_huyen">🏙️ UBND quận, huyện, TP Thủ Đức</option>
                  <option value="phong_chuyen_mon">🏢 Phòng chuyên môn trực thuộc</option>
                  <option value="su_nghiep">🎓 Đơn vị sự nghiệp công lập</option>
                  <option value="doan_the">⭐ Cơ quan Đảng, Mặt trận, Đoàn thể</option>
                  <option value="khac">Khác</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cơ quan chủ quản
                  </label>
                  <input
                    type="text"
                    value={deptFormData.parent_agency}
                    onChange={(e) => setDeptFormData({ ...deptFormData, parent_agency: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Địa bàn / Trụ sở
                  </label>
                  <input
                    type="text"
                    value={deptFormData.location_name}
                    onChange={(e) => setDeptFormData({ ...deptFormData, location_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lãnh đạo phụ trách
                </label>
                <select
                  value={deptFormData.leader_id}
                  onChange={(e) => setDeptFormData({ ...deptFormData, leader_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">-- Chưa chỉ định --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.gov_title || u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mô tả chức năng nhiệm vụ
                </label>
                <textarea
                  rows="2"
                  value={deptFormData.description}
                  onChange={(e) => setDeptFormData({ ...deptFormData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                  placeholder="Mô tả tóm tắt quyền hạn, nhiệm vụ..."
                />
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-slate-100">
                {editingDept ? (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteDept(editingDept, e)}
                    className="text-rose-600 hover:text-rose-800 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa đơn vị này</span>
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDeptModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-medium hover:bg-slate-100 transition cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={deptModalLoading}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {deptModalLoading ? 'Đang lưu...' : (editingDept ? 'Lưu thay đổi' : 'Tạo đơn vị')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Departments from Excel Modal (Giai đoạn 2) */}
      {isImportDeptModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-[95%] sm:max-w-2xl border border-slate-200 overflow-hidden my-4 max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 to-emerald-950 text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 rounded-lg">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Nhập Cơ Cấu Đơn Vị Tổ Chức Hàng Loạt
                  </h3>
                  <p className="text-xs text-emerald-200">
                    Theo mã chuẩn iCPV TP.HCM và phân loại loại hình cơ quan Nghị quyết 98
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportDeptModalOpen(false)}
                className="text-white/70 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  <span>Hướng dẫn định dạng nhập dữ liệu từ Excel / Clipboard:</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Bạn có thể sao chép trực tiếp các cột từ bảng tính Excel hoặc file CSV rồi dán vào ô bên dưới. Hệ thống tự động phân tách theo ký tự Tab hoặc dấu phẩy.
                </p>
                <div className="p-2 bg-white rounded-lg border border-emerald-300 font-mono text-[10px] text-slate-700 overflow-x-auto">
                  Cột 1: Mã đơn vị (Bắt buộc) | Cột 2: Tên đơn vị (Bắt buộc) | Cột 3: Mã đơn vị cấp trên (parent_code) | Cột 4: Loại hình (so_nganh, ubnd_quan_huyen, phong_chuyen_mon, su_nghiep, doan_the) | Cột 5: Ghi chú
                </div>
                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-slate-500 italic">* Hệ thống tự động liên kết cây phân cấp cha - con dựa theo Mã đơn vị cấp trên.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDeptImportText(`A29\tTHÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH\t\tdoan_the\tCơ quan chỉ đạo\nA29.01\tVăn phòng Thành ủy\tA29\tphong_chuyen_mon\tVăn phòng tham mưu\nA29.02\tBan Tổ chức Thành ủy\tA29\tphong_chuyen_mon\tBan tham mưu\nA29.03\tBan Tuyên giáo Thành ủy\tA29\tphong_chuyen_mon\tBan tham mưu\nA29.04\tTrường Cán bộ Thành phố\tA29\tsu_nghiep\tĐơn vị sự nghiệp công lập`);
                    }}
                    className="text-emerald-700 font-bold hover:underline cursor-pointer"
                  >
                    Điền dữ liệu mẫu iCPV
                  </button>
                </div>
              </div>

              {deptImportError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{deptImportError}</span>
                </div>
              )}

              {deptImportResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{deptImportResult.message}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
                      <span className="text-slate-500 block text-[11px]">Tạo mới</span>
                      <span className="text-lg font-bold text-emerald-700">{deptImportResult.createdCount || 0}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
                      <span className="text-slate-500 block text-[11px]">Cập nhật</span>
                      <span className="text-lg font-bold text-indigo-700">{deptImportResult.updatedCount || 0}</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Dán nội dung bảng tính Excel vào đây:
                </label>
                <textarea
                  rows={8}
                  value={deptImportText}
                  onChange={(e) => setDeptImportText(e.target.value)}
                  placeholder="Dán dữ liệu Excel (Ctrl+V) vào đây..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                />
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsImportDeptModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-medium hover:bg-slate-100 transition cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleImportDeptSubmit}
                disabled={deptImportLoading}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {deptImportLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{deptImportLoading ? 'Đang nhập...' : 'Nhập vào Hệ thống'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-[95%] sm:max-w-xl border border-slate-200 overflow-hidden my-4 max-h-[90vh] overflow-y-auto">
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
              <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-blue-950 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-blue-700" />
                    <span>Biểu mẫu Excel chuẩn đính kèm</span>
                  </div>
                  <div className="text-blue-800 text-[11px] leading-relaxed">
                    Tải file mẫu gồm 2 sheet: <b>01. Danh sách người dùng</b> và <b>02. Hướng dẫn & Danh mục</b>.
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
                  <span className="text-slate-500">Đơn vị:</span>
                  <span className="font-medium text-slate-800">{resettingUser?.dept_name || 'Chưa phân bổ'}</span>
                </div>
              </div>

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
                    Mặc định: 123456
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showResetPass ? 'text' : 'password'}
                    required
                    value={resetPasswordInput}
                    onChange={(e) => setResetPasswordInput(e.target.value)}
                    placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                    className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 bg-slate-50/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPass(!showResetPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

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

      {/* User Group Management Modal */}
      <UserGroupManagementModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        users={users}
        departments={localDepts}
        onGroupsUpdated={(g) => setUserGroups(g)}
      />
    </div>
  );
}
